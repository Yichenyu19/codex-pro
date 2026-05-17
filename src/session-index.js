import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import readline from "node:readline";

import {
  SESSION_DIRS,
  SESSION_INDEX_FILE_BASENAME
} from "./constants.js";

const THREAD_NAME_EVENT_TYPE = "thread_name_updated";
const USER_MESSAGE_EVENT_TYPE = "user_message";

function sessionIndexPath(codexHome) {
  return path.join(codexHome, SESSION_INDEX_FILE_BASENAME);
}

async function listRolloutFiles(rootDir) {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRolloutFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractTimestamp(record) {
  const candidates = [
    record?.updated_at,
    record?.timestamp,
    record?.payload?.updated_at,
    record?.payload?.timestamp
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function compareEntries(left, right) {
  const leftTime = Date.parse(left.updated_at ?? "") || 0;
  const rightTime = Date.parse(right.updated_at ?? "") || 0;
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }
  return left.id.localeCompare(right.id);
}

function normalizedQuery(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function entryMatchesQuery(entry, query) {
  if (!query) {
    return true;
  }
  return [
    entry.thread_name,
    entry.id,
    entry.first_user_message
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

function sourceLabel(source) {
  return source === "rollout_scan"
    ? "来自本地历史扫描"
    : "来自历史索引";
}

export function buildSessionIndexRisk(rolloutFileCount, sessionIndexCount) {
  const hasRollouts = rolloutFileCount > 0;
  const sessionIndexEmpty = hasRollouts && sessionIndexCount === 0;
  const sparseByGap = (rolloutFileCount - sessionIndexCount) >= 2;
  const sparseByRatio = rolloutFileCount > 0 && (sessionIndexCount / rolloutFileCount) < 0.6;
  const sessionIndexSparse = hasRollouts
    && rolloutFileCount >= 3
    && sessionIndexCount < rolloutFileCount
    && (sparseByGap || sparseByRatio);
  const rolloutIndexMismatch = hasRollouts
    && sessionIndexCount < rolloutFileCount
    && (sessionIndexEmpty || sessionIndexSparse);
  return {
    sessionIndexEmpty,
    sessionIndexSparse,
    rolloutIndexMismatch
  };
}

async function collectThreadEntriesFromRollout(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const entries = [];
  let threadId = null;
  let latestTimestamp = null;

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!threadId && parsed?.type === "session_meta" && typeof parsed?.payload?.id === "string") {
      threadId = parsed.payload.id;
      latestTimestamp = extractTimestamp(parsed) ?? latestTimestamp;
      continue;
    }

    if (
      parsed?.type === "event_msg"
      && parsed?.payload?.type === THREAD_NAME_EVENT_TYPE
      && typeof parsed?.payload?.thread_id === "string"
    ) {
      const name = parsed.payload.thread_name;
      if (typeof name === "string" && name.trim()) {
        entries.push({
          id: parsed.payload.thread_id,
          thread_name: name,
          updated_at: extractTimestamp(parsed) ?? latestTimestamp ?? new Date(0).toISOString()
        });
      }
      continue;
    }

    const timestamp = extractTimestamp(parsed);
    if (timestamp) {
      latestTimestamp = timestamp;
    }
  }

  if (entries.length === 0 && threadId) {
    entries.push({
      id: threadId,
      thread_name: path.basename(filePath, ".jsonl"),
      updated_at: latestTimestamp ?? new Date(0).toISOString()
    });
  }

  return entries;
}

async function scanRolloutCandidate(filePath, indexedTitles = new Map()) {
  const stream = fsSync.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let threadId = null;
  let title = null;
  let latestTimestamp = null;
  let firstUserMessage = null;

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!threadId && parsed?.type === "session_meta" && typeof parsed?.payload?.id === "string") {
        threadId = parsed.payload.id;
        latestTimestamp = extractTimestamp(parsed) ?? latestTimestamp;
        continue;
      }

      if (
        parsed?.type === "event_msg"
        && parsed?.payload?.type === THREAD_NAME_EVENT_TYPE
        && typeof parsed?.payload?.thread_id === "string"
      ) {
        if (!threadId) {
          threadId = parsed.payload.thread_id;
        }
        if (typeof parsed.payload.thread_name === "string" && parsed.payload.thread_name.trim()) {
          title = parsed.payload.thread_name;
        }
        latestTimestamp = extractTimestamp(parsed) ?? latestTimestamp;
        continue;
      }

      if (
        !firstUserMessage
        && parsed?.type === "event_msg"
        && parsed?.payload?.type === USER_MESSAGE_EVENT_TYPE
        && typeof parsed?.payload?.message === "string"
        && parsed.payload.message.trim()
      ) {
        firstUserMessage = parsed.payload.message.trim();
      }

      latestTimestamp = extractTimestamp(parsed) ?? latestTimestamp;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (!threadId) {
    return null;
  }

  return {
    id: threadId,
    thread_name: title || indexedTitles.get(threadId) || path.basename(filePath, ".jsonl"),
    updated_at: latestTimestamp ?? new Date(0).toISOString(),
    source: "rollout_scan",
    source_label: sourceLabel("rollout_scan"),
    first_user_message: firstUserMessage || ""
  };
}

async function scanRolloutCandidates(codexHome, options = {}) {
  const indexedTitles = options.indexedTitles ?? new Map();
  const query = normalizedQuery(options.query);
  const results = [];
  for (const dirName of SESSION_DIRS) {
    const rootDir = path.join(codexHome, dirName);
    const rolloutFiles = await listRolloutFiles(rootDir);
    for (const rolloutPath of rolloutFiles) {
      const candidate = await scanRolloutCandidate(rolloutPath, indexedTitles);
      if (candidate && entryMatchesQuery(candidate, query)) {
        results.push(candidate);
      }
    }
  }
  results.sort(compareEntries);
  return results;
}

export async function countRolloutFiles(codexHome) {
  let count = 0;
  for (const dirName of SESSION_DIRS) {
    const rootDir = path.join(codexHome, dirName);
    count += (await listRolloutFiles(rootDir)).length;
  }
  return count;
}

export async function readSessionIndex(codexHome) {
  const filePath = sessionIndexPath(codexHome);
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function rebuildSessionIndex(codexHome) {
  const allEntries = [];
  for (const dirName of SESSION_DIRS) {
    const rootDir = path.join(codexHome, dirName);
    const rolloutFiles = await listRolloutFiles(rootDir);
    for (const rolloutPath of rolloutFiles) {
      allEntries.push(...await collectThreadEntriesFromRollout(rolloutPath));
    }
  }

  allEntries.sort(compareEntries);
  const output = allEntries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.writeFile(sessionIndexPath(codexHome), output ? `${output}\n` : "", "utf8");

  return {
    indexPath: sessionIndexPath(codexHome),
    entryCount: allEntries.length,
    entries: allEntries
  };
}

export async function findSessionCandidates(codexHome, options = {}) {
  const entries = await readSessionIndex(codexHome);
  const query = normalizedQuery(options.query);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const rolloutFileCount = Number.isInteger(options.rolloutFileCount) ? options.rolloutFileCount : 0;
  const historyVisibility = options.historyVisibility ?? null;
  const filtered = entries
    .filter((entry) => entryMatchesQuery(entry, query))
    .map((entry) => ({
      ...entry,
      source: "session_index",
      source_label: sourceLabel("session_index")
    }));
  const indexRisk = buildSessionIndexRisk(rolloutFileCount, entries.length);
  const shouldFallback = Boolean(
    options.forceFallback
    || indexRisk.sessionIndexEmpty
    || (query && filtered.length === 0 && rolloutFileCount > entries.length)
    || historyVisibility?.severity === "warning"
  );

  if (!shouldFallback) {
    return filtered.slice(0, limit);
  }

  const merged = [];
  const seenIds = new Set();
  for (const entry of filtered) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    merged.push(entry);
  }

  const indexedTitles = new Map(entries.map((entry) => [entry.id, entry.thread_name]));
  const rolloutCandidates = await scanRolloutCandidates(codexHome, {
    query,
    indexedTitles
  });
  for (const entry of rolloutCandidates) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    merged.push(entry);
  }

  merged.sort(compareEntries);
  return merged.slice(0, limit);
}

import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  DB_FILE_BASENAME,
  SESSION_DIRS,
  SESSION_INDEX_FILE_BASENAME
} from "./constants.js";

function sqlitePath(codexHome) {
  return path.join(codexHome, DB_FILE_BASENAME);
}

async function listRolloutFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listRolloutFiles(fullPath));
    } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function readFirstRecord(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (!firstLine) {
    return null;
  }
  try {
    return JSON.parse(firstLine);
  } catch {
    return null;
  }
}

export async function findRolloutPathsByThreadId(codexHome, threadId) {
  const matches = [];
  for (const dirName of SESSION_DIRS) {
    const rootDir = path.join(codexHome, dirName);
    const rolloutFiles = await listRolloutFiles(rootDir);
    for (const rolloutPath of rolloutFiles) {
      const parsed = await readFirstRecord(rolloutPath);
      if (parsed?.type === "session_meta" && parsed?.payload?.id === threadId) {
        matches.push(rolloutPath);
      }
    }
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

export async function removeSessionIndexEntry(codexHome, threadId) {
  const indexPath = path.join(codexHome, SESSION_INDEX_FILE_BASENAME);
  const text = await fs.readFile(indexPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  const entries = text
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
  const nextEntries = entries.filter((entry) => entry.id !== threadId);
  await fs.writeFile(
    indexPath,
    nextEntries.map((entry) => JSON.stringify(entry)).join("\n") + (nextEntries.length ? "\n" : ""),
    "utf8"
  );
  return {
    removedEntries: entries.length - nextEntries.length,
    indexPath
  };
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
  return !!row;
}

export async function deleteSessionFromSqlite(codexHome, threadId) {
  const dbPath = sqlitePath(codexHome);
  await fs.access(dbPath).catch((error) => {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec("BEGIN IMMEDIATE");
    const changes = {};
    const deleteWhereThreadId = [
      "thread_dynamic_tools",
      "thread_goals",
      "stage1_outputs"
    ];
    for (const tableName of deleteWhereThreadId) {
      if (!tableExists(db, tableName)) {
        continue;
      }
      changes[tableName] = db.prepare(`DELETE FROM ${tableName} WHERE thread_id = ?`).run(threadId).changes ?? 0;
    }
    if (tableExists(db, "thread_spawn_edges")) {
      changes.thread_spawn_edges = db.prepare(
        "DELETE FROM thread_spawn_edges WHERE parent_thread_id = ? OR child_thread_id = ?"
      ).run(threadId, threadId).changes ?? 0;
    }
    changes.threads = tableExists(db, "threads")
      ? (db.prepare("DELETE FROM threads WHERE id = ?").run(threadId).changes ?? 0)
      : 0;
    db.exec("COMMIT");
    return changes;
  } catch (error) {
    try {
      db?.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    db?.close();
  }
}

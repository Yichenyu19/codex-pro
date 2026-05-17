import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { findRolloutPathsByThreadId } from "./delete-session.js";
import { redactExportText } from "./redaction.js";

const USER_MESSAGE_TYPES = new Set(["user_message"]);
const ASSISTANT_MESSAGE_TYPES = new Set(["assistant_message", "agent_message"]);
const WINDOWS_FILENAME_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

function extractTimestamp(record) {
  const candidates = [
    record?.timestamp,
    record?.updated_at,
    record?.payload?.timestamp,
    record?.payload?.updated_at
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractThreadName(record) {
  const payload = record?.payload;
  if (
    record?.type === "event_msg"
    && payload?.type === "thread_name_updated"
    && typeof payload.thread_name === "string"
    && payload.thread_name.trim()
  ) {
    return payload.thread_name.trim();
  }
  return null;
}

function extractText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    if (Object.hasOwn(value, "encrypted_content")) {
      return "";
    }
    for (const key of ["text", "content", "message", "value"]) {
      const nested = extractText(value[key]);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function extractReadableMessage(record) {
  if (record?.type !== "event_msg") {
    return null;
  }
  const payload = record.payload ?? {};
  if (Object.hasOwn(payload, "encrypted_content")) {
    return null;
  }

  const type = typeof payload.type === "string" ? payload.type : "";
  let role = null;
  if (USER_MESSAGE_TYPES.has(type)) {
    role = "User";
  } else if (ASSISTANT_MESSAGE_TYPES.has(type)) {
    role = "Assistant";
  } else if (payload.role === "user") {
    role = "User";
  } else if (payload.role === "assistant") {
    role = "Assistant";
  }

  if (!role) {
    return null;
  }

  const text = extractText(payload.message ?? payload.content ?? payload.text ?? payload.parts);
  if (!text) {
    return null;
  }

  return {
    role,
    text: redactExportText(text),
    timestamp: extractTimestamp(record)
  };
}

function sanitizeFilenameBase(value, fallback) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(WINDOWS_FILENAME_FORBIDDEN, "-")
    .replace(/\s+/g, " ")
    .replace(/[-_. ]+$/g, "")
    .replace(/^[-_. ]+/g, "")
    .trim();
  const safe = normalized || fallback;
  return safe.slice(0, 96).replace(/[-_. ]+$/g, "") || fallback;
}

function renderMarkdown({
  title,
  threadId,
  exportedAt,
  messages,
  encryptedContentCount,
  skippedMalformedLines
}) {
  const lines = [
    `# ${title}`,
    "",
    `- Thread ID: \`${threadId}\``,
    `- Exported at: \`${exportedAt}\``,
    "- Source: Codex Pro local export",
    `- Messages: ${messages.length}`,
    "",
    "> Codex Pro does not decrypt or rewrite `encrypted_content`.",
    "> Local paths and common secret-looking tokens are redacted before export."
  ];

  if (encryptedContentCount > 0) {
    lines.push("> 部分内容为 `encrypted_content`，Codex Pro 不会解密或重写。");
  }
  if (skippedMalformedLines > 0) {
    lines.push(`> 已跳过 ${skippedMalformedLines} 行无法解析的本地记录。`);
  }

  lines.push("", "---", "");

  if (messages.length === 0) {
    lines.push("> 没有找到可直接导出的明文用户 / 助手消息。", "");
    return lines.join("\n");
  }

  for (const message of messages) {
    lines.push(`## ${message.role}`);
    if (message.timestamp) {
      lines.push("", `_${message.timestamp}_`);
    }
    lines.push("", message.text, "");
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

async function readRolloutForExport(rolloutPath) {
  const stream = fs.createReadStream(rolloutPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const messages = [];
  let threadTitle = null;
  let latestTimestamp = null;
  let malformedLines = 0;
  let encryptedContentCount = 0;

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      let record;
      try {
        record = JSON.parse(line);
      } catch {
        malformedLines += 1;
        continue;
      }

      latestTimestamp = extractTimestamp(record) ?? latestTimestamp;
      threadTitle = extractThreadName(record) ?? threadTitle;

      if (line.includes("\"encrypted_content\"")) {
        encryptedContentCount += 1;
      }

      const message = extractReadableMessage(record);
      if (message) {
        messages.push(message);
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return {
    threadTitle,
    latestTimestamp,
    messages,
    malformedLines,
    encryptedContentCount
  };
}

export async function exportSessionMarkdown({
  codexHome,
  threadId,
  title,
  now = new Date()
} = {}) {
  if (!threadId) {
    throw new Error("Missing thread id for export-session-markdown.");
  }
  if (!codexHome) {
    throw new Error("Missing Codex home for export-session-markdown.");
  }

  const rolloutPaths = await findRolloutPathsByThreadId(codexHome, threadId);
  if (rolloutPaths.length === 0) {
    return {
      ok: false,
      status: "not_found",
      threadId,
      title: title ?? "",
      filename: `${sanitizeFilenameBase(title || threadId, "codex-session")}.md`,
      markdown: "",
      message: "没有找到这条会话的本地记录。可以先重建历史索引后再试。"
    };
  }

  const collected = [];
  let resolvedTitle = typeof title === "string" && title.trim() ? title.trim() : "";
  let skippedMalformedLines = 0;
  let encryptedContentCount = 0;
  let latestTimestamp = null;

  for (const rolloutPath of rolloutPaths) {
    const result = await readRolloutForExport(rolloutPath);
    collected.push(...result.messages);
    resolvedTitle = resolvedTitle || result.threadTitle || "";
    skippedMalformedLines += result.malformedLines;
    encryptedContentCount += result.encryptedContentCount;
    latestTimestamp = result.latestTimestamp ?? latestTimestamp;
  }

  const finalTitle = resolvedTitle || threadId;
  const exportedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const filename = `${sanitizeFilenameBase(finalTitle, "codex-session")}.md`;
  const markdown = renderMarkdown({
    title: finalTitle,
    threadId,
    exportedAt,
    messages: collected,
    encryptedContentCount,
    skippedMalformedLines
  });

  return {
    ok: true,
    status: "exported",
    threadId,
    title: finalTitle,
    filename,
    markdown,
    message: "已生成 Markdown，可复制保存。",
    messageCount: collected.length,
    rolloutFileCount: rolloutPaths.length,
    latestTimestamp,
    encryptedContentCount,
    skippedMalformedLines
  };
}

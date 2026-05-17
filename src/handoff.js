import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { findRolloutPathsByThreadId } from "./delete-session.js";

const USER_MESSAGE_TYPES = new Set(["user_message"]);
const ASSISTANT_MESSAGE_TYPES = new Set(["assistant_message", "agent_message"]);
const WINDOWS_FILENAME_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_CONTEXT_ITEMS = 6;
const MAX_FILE_HINTS = 12;

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
  if (USER_MESSAGE_TYPES.has(type) || payload.role === "user") {
    role = "User";
  } else if (ASSISTANT_MESSAGE_TYPES.has(type) || payload.role === "assistant") {
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
    text: sanitizeHandoffText(text),
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

function basenameFromPath(value) {
  const cleaned = String(value ?? "").replace(/[)"'`>,;]+$/g, "");
  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || "local-path";
}

function sanitizeHandoffText(value) {
  return String(value ?? "")
    .replace(/[A-Za-z]:\\Users\\[^\\\s`"'<>]+\\[^\s`"'<>]*/g, (match) => `[local-path]\\${basenameFromPath(match)}`)
    .replace(/[A-Za-z]:\\[^\s`"'<>]*/g, (match) => `[local-path]\\${basenameFromPath(match)}`)
    .replace(/\/(?:Users|home)\/[^/\s`"'<>]+\/[^\s`"'<>]*/g, (match) => `[local-path]/${basenameFromPath(match)}`)
    .replace(/\s+/g, " ")
    .trim();
}

function shortenText(value, maxLength = 260) {
  const text = sanitizeHandoffText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractFileHints(messages) {
  const seen = new Set();
  const hints = [];
  const filePattern = /(?:[A-Za-z]:\\[^\s`"'<>]+|\/(?:Users|home)\/[^\s`"'<>]+|(?:\.{1,2}[\\/])?[\w.@()[\]\- /\\]+?\.(?:js|mjs|cjs|ts|tsx|jsx|py|ps1|md|json|jsonl|toml|yml|yaml|css|html|sqlite|db|txt))/gi;

  for (const message of messages) {
    for (const match of message.text.matchAll(filePattern)) {
      const raw = match[0].trim();
      const sanitized = sanitizeHandoffText(raw)
        .replace(/^[`"']+|[`"',.;:]+$/g, "")
        .trim();
      if (!sanitized || seen.has(sanitized)) {
        continue;
      }
      seen.add(sanitized);
      hints.push(sanitized);
      if (hints.length >= MAX_FILE_HINTS) {
        return hints;
      }
    }
  }

  return hints;
}

async function readRolloutForHandoff(rolloutPath) {
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

function renderHandoffMarkdown({
  title,
  threadId,
  exportedAt,
  messages,
  fileHints,
  rolloutFileCount,
  encryptedContentCount,
  skippedMalformedLines
}) {
  const recentUserMessages = messages
    .filter((message) => message.role === "User")
    .slice(-MAX_CONTEXT_ITEMS);
  const recentAssistantMessages = messages
    .filter((message) => message.role === "Assistant")
    .slice(-3);
  const latestUserGoal = recentUserMessages.at(-1)?.text;

  const lines = [
    "# Codex Pro Handoff",
    "",
    `- Title: ${title}`,
    `- Thread ID: \`${threadId}\``,
    `- Exported at: \`${exportedAt}\``,
    "- Source: Codex Pro local handoff",
    `- Local rollout files scanned: ${rolloutFileCount}`,
    `- Readable messages scanned: ${messages.length}`,
    "",
    "> Codex Pro does not decrypt or rewrite `encrypted_content`.",
    "> This handoff is generated locally without calling an AI model.",
    "",
    "## 当前目标",
    ""
  ];

  if (latestUserGoal) {
    lines.push(`- ${shortenText(latestUserGoal, 360)}`);
  } else {
    lines.push("- 没有找到可直接提取的明文用户目标。");
  }

  lines.push("", "## 关键上下文", "");
  if (recentUserMessages.length === 0 && recentAssistantMessages.length === 0) {
    lines.push("- 没有找到可直接整理的明文上下文。");
  } else {
    for (const message of recentUserMessages) {
      lines.push(`- User${message.timestamp ? ` (${message.timestamp})` : ""}: ${shortenText(message.text)}`);
    }
    for (const message of recentAssistantMessages) {
      lines.push(`- Assistant${message.timestamp ? ` (${message.timestamp})` : ""}: ${shortenText(message.text)}`);
    }
  }

  lines.push("", "## 涉及文件", "");
  if (fileHints.length === 0) {
    lines.push("- 未从明文消息中识别出明确文件路径。");
  } else {
    for (const hint of fileHints) {
      lines.push(`- \`${hint}\``);
    }
  }

  lines.push(
    "",
    "## 已完成",
    "",
    "- 已从本地可读明文消息整理交接上下文。",
    "- 不上传历史、账号数据、`auth.json` 或本地会话内容。",
    "- 未修改 `model_provider`、`base_url`、登录方式或 `encrypted_content`。",
    "",
    "## 待办",
    "",
    "- 把这份交接包粘贴到新的 Codex 对话中，让下一轮继续工作。",
    "- 如果历史没显示完整，先在 Codex Pro 的 `历史` 入口执行“修复历史显示 / 重建历史索引 / 打开高级修复”。",
    "",
    "## 恢复建议",
    "",
    "- 优先继续正常打开 `Codex`，不要把维护入口当成日常入口。",
    "- 如果页面增强没有完整挂上去，compatibility mode 仍然是安全回退，不是失败。",
    "- 旧加密内容可以恢复可见性，但 Codex Pro 不会解密或重写它。"
  );

  if (encryptedContentCount > 0) {
    lines.push("", `> 已发现 ${encryptedContentCount} 条 \`encrypted_content\` 记录，只做边界提示，不导出密文。`);
  }
  if (skippedMalformedLines > 0) {
    lines.push(`> 已跳过 ${skippedMalformedLines} 行无法解析的本地记录。`);
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

export async function exportHandoff({
  codexHome,
  threadId,
  title,
  now = new Date()
} = {}) {
  if (!threadId) {
    throw new Error("Missing thread id for handoff export.");
  }
  if (!codexHome) {
    throw new Error("Missing Codex home for handoff export.");
  }

  const rolloutPaths = await findRolloutPathsByThreadId(codexHome, threadId);
  const fallbackTitle = typeof title === "string" && title.trim() ? title.trim() : threadId;
  const filename = `${sanitizeFilenameBase(`${fallbackTitle} handoff`, "codex-pro-handoff")}.md`;
  if (rolloutPaths.length === 0) {
    return {
      ok: false,
      status: "not_found",
      threadId,
      title: fallbackTitle,
      filename,
      markdown: "",
      message: "没有找到这条会话的本地记录。可以先重建历史索引后再试。"
    };
  }

  const messages = [];
  let resolvedTitle = fallbackTitle;
  let latestTimestamp = null;
  let skippedMalformedLines = 0;
  let encryptedContentCount = 0;

  for (const rolloutPath of rolloutPaths) {
    const result = await readRolloutForHandoff(rolloutPath);
    messages.push(...result.messages);
    resolvedTitle = result.threadTitle || resolvedTitle;
    latestTimestamp = result.latestTimestamp ?? latestTimestamp;
    skippedMalformedLines += result.malformedLines;
    encryptedContentCount += result.encryptedContentCount;
  }

  const exportedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const fileHints = extractFileHints(messages);
  const markdown = renderHandoffMarkdown({
    title: resolvedTitle,
    threadId,
    exportedAt,
    messages,
    fileHints,
    rolloutFileCount: rolloutPaths.length,
    encryptedContentCount,
    skippedMalformedLines
  });

  return {
    ok: true,
    status: "handoff_exported",
    threadId,
    title: resolvedTitle,
    filename: `${sanitizeFilenameBase(`${resolvedTitle} handoff`, "codex-pro-handoff")}.md`,
    markdown,
    message: "已生成交接包，可复制到新对话继续。",
    messageCount: messages.length,
    fileHintCount: fileHints.length,
    rolloutFileCount: rolloutPaths.length,
    latestTimestamp,
    encryptedContentCount,
    skippedMalformedLines
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { exportSessionMarkdown } from "../src/export-session.js";
import { runExportSessionMarkdown } from "../src/service.js";

async function makeTempCodexHome() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-export-"));
  const codexHome = path.join(root, ".codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "03", "19"), { recursive: true });
  await fs.mkdir(path.join(codexHome, "archived_sessions", "2026", "03", "18"), { recursive: true });
  await fs.writeFile(path.join(codexHome, "config.toml"), 'model_provider = "openai"\n', "utf8");
  return { root, codexHome };
}

async function writeRollout(filePath, threadId, title = "导出测试") {
  const lines = [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        cwd: "C:\\Temp\\Project",
        source: "cli",
        cli_version: "0.115.0",
        model_provider: "openai"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: threadId,
        thread_name: title
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "请导出这一条会话"
      }
    }),
    "{not json",
    JSON.stringify({
      timestamp: "2026-03-19T00:03:00.000Z",
      type: "event_msg",
      payload: {
        type: "assistant_message",
        message: "已经整理为 Markdown"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:04:00.000Z",
      type: "event_msg",
      payload: {
        encrypted_content: "secret-encrypted-payload"
      }
    })
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

test("exportSessionMarkdown exports one local session without decrypting encrypted_content", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  try {
    const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-export.jsonl");
    await writeRollout(rolloutPath, "thread-export", "Bad:Name*? / 导出测试");

    const result = await exportSessionMarkdown({
      codexHome,
      threadId: "thread-export",
      now: new Date("2026-05-13T00:00:00.000Z")
    });

    assert.equal(result.status, "exported");
    assert.equal(result.messageCount, 2);
    assert.equal(result.encryptedContentCount, 1);
    assert.equal(result.skippedMalformedLines, 1);
    assert.equal(/[<>:"/\\|?*]/.test(result.filename), false);
    assert.match(result.markdown, /# Bad:Name\*\? \/ 导出测试/);
    assert.match(result.markdown, /## User/);
    assert.match(result.markdown, /请导出这一条会话/);
    assert.match(result.markdown, /## Assistant/);
    assert.match(result.markdown, /已经整理为 Markdown/);
    assert.match(result.markdown, /Codex Pro does not decrypt or rewrite `encrypted_content`/);
    assert.doesNotMatch(result.markdown, /secret-encrypted-payload/);
    assert.doesNotMatch(result.markdown, new RegExp(root.replaceAll("\\", "\\\\")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runExportSessionMarkdown returns a friendly not_found result when rollout is missing", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  try {
    const result = await runExportSessionMarkdown({
      codexHome,
      threadId: "missing-thread",
      title: "Missing:Thread"
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "not_found");
    assert.equal(result.markdown, "");
    assert.match(result.message, /没有找到这条会话/);
    assert.equal(/[<>:"/\\|?*]/.test(result.filename), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { exportHandoff } from "../src/handoff.js";
import { runExportHandoff } from "../src/service.js";

async function makeTempCodexHome() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-handoff-"));
  const codexHome = path.join(root, ".codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "05", "13"), { recursive: true });
  await fs.writeFile(path.join(codexHome, "config.toml"), 'model_provider = "openai"\n', "utf8");
  return { root, codexHome };
}

async function writeRollout(filePath, threadId, title = "交接测试") {
  const lines = [
    JSON.stringify({
      timestamp: "2026-05-13T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: threadId,
        cwd: "C:\\Users\\Alice\\SecretProject",
        source: "cli",
        cli_version: "0.115.0",
        model_provider: "openai"
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-13T00:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: threadId,
        thread_name: title
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-13T00:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "继续修复 src/service.js 和 C:\\Users\\Alice\\SecretProject\\src\\bridge.js，目标是不要上传历史。"
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-13T00:03:00.000Z",
      type: "event_msg",
      payload: {
        type: "assistant_message",
        message: "已完成 bridge endpoint，下一步补 test/handoff.test.js。"
      }
    }),
    "{not json",
    JSON.stringify({
      timestamp: "2026-05-13T00:04:00.000Z",
      type: "event_msg",
      payload: {
        encrypted_content: "secret-encrypted-payload"
      }
    })
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

test("exportHandoff generates a local handoff without leaking encrypted_content or user paths", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  try {
    const rolloutPath = path.join(codexHome, "sessions", "2026", "05", "13", "rollout-handoff.jsonl");
    await writeRollout(rolloutPath, "thread-handoff", "Bad:Name*? / 交接测试");

    const result = await exportHandoff({
      codexHome,
      threadId: "thread-handoff",
      now: new Date("2026-05-13T08:00:00.000Z")
    });

    assert.equal(result.status, "handoff_exported");
    assert.equal(result.messageCount, 2);
    assert.equal(result.encryptedContentCount, 1);
    assert.equal(result.skippedMalformedLines, 1);
    assert.equal(/[<>:"/\\|?*]/.test(result.filename), false);
    assert.match(result.markdown, /# Codex Pro Handoff/);
    assert.match(result.markdown, /This handoff is generated locally without calling an AI model/);
    assert.match(result.markdown, /## 当前目标/);
    assert.match(result.markdown, /## 关键上下文/);
    assert.match(result.markdown, /## 涉及文件/);
    assert.match(result.markdown, /src\/service\.js|src\\service\.js/);
    assert.match(result.markdown, /\[local-path\]\\bridge\.js/);
    assert.match(result.markdown, /不上传历史/);
    assert.doesNotMatch(result.markdown, /secret-encrypted-payload/);
    assert.doesNotMatch(result.markdown, /C:\\Users\\Alice/);
    assert.doesNotMatch(result.markdown, new RegExp(root.replaceAll("\\", "\\\\")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runExportHandoff returns a friendly not_found result when rollout is missing", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  try {
    const result = await runExportHandoff({
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

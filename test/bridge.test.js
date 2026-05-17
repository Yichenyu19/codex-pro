import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { startBridgeServer } from "../src/bridge.js";

async function makeTempCodexHome() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-bridge-"));
  const codexHome = path.join(root, ".codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "03", "19"), { recursive: true });
  await fs.mkdir(path.join(codexHome, "archived_sessions", "2026", "03", "18"), { recursive: true });
  return { root, codexHome };
}

async function withIsolatedGuardAppDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-bridge-guard-"));
  const defaultDir = path.join(root, ".codex-pro");
  const legacyDir = path.join(root, "AppData", "Roaming", "codex-pro");
  const previousDefault = process.env.CODEX_PRO_APP_DIR;
  const previousLegacy = process.env.CODEX_PRO_LEGACY_DIR;
  process.env.CODEX_PRO_APP_DIR = defaultDir;
  process.env.CODEX_PRO_LEGACY_DIR = legacyDir;
  try {
    return await run({ defaultDir, legacyDir });
  } finally {
    if (previousDefault === undefined) {
      delete process.env.CODEX_PRO_APP_DIR;
    } else {
      process.env.CODEX_PRO_APP_DIR = previousDefault;
    }
    if (previousLegacy === undefined) {
      delete process.env.CODEX_PRO_LEGACY_DIR;
    } else {
      process.env.CODEX_PRO_LEGACY_DIR = previousLegacy;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeConfig(codexHome) {
  await fs.writeFile(path.join(codexHome, "config.toml"), 'model_provider = "openai"\n', "utf8");
}

async function writeGlobalState(codexHome) {
  const text = `${JSON.stringify({
    "electron-saved-workspace-roots": ["C:\\Temp\\Project"],
    "project-order": ["C:\\Temp\\Project"],
    "active-workspace-roots": ["C:\\Temp\\Project"]
  }, null, 2)}\n`;
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json"), text, "utf8");
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json.bak"), text, "utf8");
}

async function writeDiagnosisState(dataRoot) {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(path.join(dataRoot, "cdp-diagnosis.json"), `${JSON.stringify({
    status: "unsupported",
    saved_at: "2026-05-08 13:10:00",
    message: "隔离诊断确认：当前桌面包没有暴露调试端口。"
  }, null, 2)}\n`, "utf8");
}

async function writeRollout(filePath, id, provider = "openai", title = "测试会话") {
  const lines = [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id,
        timestamp: "2026-03-19T00:00:00.000Z",
        cwd: "C:\\Temp\\Project",
        source: "cli",
        cli_version: "0.115.0",
        model_provider: provider
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: id,
        thread_name: title
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "hi"
      }
    })
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function writeStateDb(codexHome, rows) {
  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL,
        sandbox_policy TEXT NOT NULL,
        approval_mode TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        has_user_event INTEGER NOT NULL DEFAULT 1,
        archived INTEGER NOT NULL DEFAULT 0,
        first_user_message TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE thread_dynamic_tools (
        thread_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        defer_loading INTEGER NOT NULL DEFAULT 0,
        namespace TEXT
      );
      CREATE TABLE thread_goals (
        thread_id TEXT NOT NULL PRIMARY KEY,
        goal_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        token_budget INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        time_used_seconds INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE thread_spawn_edges (
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE stage1_outputs (
        thread_id TEXT PRIMARY KEY,
        source_updated_at INTEGER NOT NULL,
        raw_memory TEXT NOT NULL,
        rollout_summary TEXT NOT NULL,
        generated_at INTEGER NOT NULL
      );
    `);

    const stmt = db.prepare(`
      INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, sandbox_policy, approval_mode, tokens_used, has_user_event, archived, first_user_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      stmt.run(
        row.id,
        row.rollout_path,
        1,
        2,
        "cli",
        row.model_provider ?? "openai",
        row.cwd ?? "C:\\Temp\\Project",
        row.title ?? "测试会话",
        "workspace-write",
        "never",
        0,
        1,
        row.archived ? 1 : 0,
        "hello"
      );
      db.prepare("INSERT INTO thread_dynamic_tools (thread_id, position, name, description, input_schema, defer_loading) VALUES (?, 0, 'tool', 'desc', '{}', 0)").run(row.id);
      db.prepare("INSERT INTO thread_goals (thread_id, goal_id, objective, status, created_at_ms, updated_at_ms) VALUES (?, 'g1', 'goal', 'open', 1, 1)").run(row.id);
      db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, 'running')").run(row.id, row.id);
      db.prepare("INSERT INTO stage1_outputs (thread_id, source_updated_at, raw_memory, rollout_summary, generated_at) VALUES (?, 1, 'raw', 'summary', 1)").run(row.id);
    }
  } finally {
    db.close();
  }
}

function requestJson(port, method, requestPath, payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: {
        ...(body ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        } : {}),
        ...headers
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : null, headers: res.headers });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test("bridge status includes latest snapshot and recent actions", async () => {
  await withIsolatedGuardAppDir(async ({ legacyDir }) => {
    const { codexHome } = await makeTempCodexHome();
    await writeConfig(codexHome);
    await writeGlobalState(codexHome);
    await writeDiagnosisState(legacyDir);
    await writeStateDb(codexHome, []);
    const server = await startBridgeServer({ codexHome, port: 0 });
    const { port } = server.address();
    try {
      const response = await requestJson(port, "GET", "/status");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.doctor.currentProvider, "openai");
      assert.ok(Array.isArray(response.body.recentActions));
      assert.equal("latestSnapshot" in response.body, true);
      assert.equal(typeof response.body.management?.startMenuDir, "string");
      assert.equal(typeof response.body.management?.launcherLogPath, "string");
      assert.equal(typeof response.body.management?.compatibilityMode, "boolean");
      assert.equal(typeof response.body.management?.takeover?.enabled, "boolean");
      assert.equal(typeof response.body.management?.maintenanceLauncherPath, "string");
      assert.equal(typeof response.body.takeover?.enabled, "boolean");
      assert.equal(typeof response.body.historyVisibility?.summary, "string");
      assert.equal(Array.isArray(response.body.historyVisibility?.steps), true);
      assert.equal(response.body.productState.kind, "compatibility");
      assert.equal(response.body.recoveryPlan.state, "compatibility");
      assert.equal(response.body.recoveryPlan.productState.kind, "compatibility");
      assert.equal(response.body.injectionDiagnosis?.status, "unsupported");
      assert.equal(response.body.recoveryPlan.uiMode, "compatibility_ready");
      assert.match(response.body.recoveryPlan.summary, /继续使用|历史保护仍生效/);
      assert.equal(Array.isArray(response.body.recoveryPlan.steps), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("bridge sessions endpoint returns rollout fallback candidates when index is empty", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  await writeGlobalState(codexHome);
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-fallback.jsonl");
  await writeRollout(rolloutPath, "thread-fallback", "openai", "恢复旧历史");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), "", "utf8");
  await writeStateDb(codexHome, []);

  const server = await startBridgeServer({ codexHome, port: 0 });
  const { port } = server.address();
  try {
    const response = await requestJson(port, "GET", "/sessions?query=%E6%81%A2%E5%A4%8D&limit=10");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].id, "thread-fallback");
    assert.equal(response.body[0].source, "rollout_scan");
    assert.equal(response.body[0].source_label, "来自本地历史扫描");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge supports update check with user-confirmed upgrade guidance", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);

  const server = await startBridgeServer({
    codexHome,
    port: 0,
    updateRegistryBase: "https://registry.example.test",
    updateFetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { version: "0.2.6" };
      }
    })
  });
  const { port } = server.address();
  try {
    const response = await requestJson(port, "GET", "/update/check");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "update_available");
    assert.equal(response.body.currentVersion, "0.2.5");
    assert.equal(response.body.latestVersion, "0.2.6");
    assert.match(response.body.message, /确认后可安装/);
    assert.match(response.body.message, /不会静默更新/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge supports one-click update install", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const updateRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-bridge-update-repo-"));

  const server = await startBridgeServer({
    codexHome,
    port: 0,
    updateRegistryBase: "https://registry.example.test",
    updateFetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { version: "0.2.6" };
      }
    }),
    updateExecFile: async (filePath, args) => {
      if (filePath === "npm" && args[0] === "pack") {
        const destination = args[args.indexOf("--pack-destination") + 1];
        await fs.writeFile(path.join(destination, "codex-pro-0.2.6.tgz"), "fake tgz", "utf8");
        return { stdout: "codex-pro-0.2.6.tgz\n", stderr: "" };
      }
      if (filePath === "tar") {
        const destination = args[args.indexOf("-C") + 1];
        const packageDir = path.join(destination, "package");
        await fs.mkdir(path.join(packageDir, "src"), { recursive: true });
        await fs.mkdir(path.join(packageDir, "launcher-python"), { recursive: true });
        await fs.writeFile(path.join(packageDir, "package.json"), `${JSON.stringify({
          name: "codex-pro",
          version: "0.2.6"
        }, null, 2)}\n`, "utf8");
        await fs.writeFile(path.join(packageDir, "src", "cli.js"), "export {};\n", "utf8");
        await fs.writeFile(path.join(packageDir, "launcher-python", "requirements.txt"), "playwright==1.0.0\n", "utf8");
        return { stdout: "", stderr: "" };
      }
      if (filePath === "npm" && args[0] === "install") {
        return { stdout: "installed\n", stderr: "" };
      }
      if (filePath === "py") {
        return { stdout: "python ok\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${filePath} ${args.join(" ")}`);
    },
    updateRepoRoot
  });
  const { port } = server.address();
  try {
    const response = await requestJson(port, "POST", "/update/install", {
      version: "0.2.6"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "update_installed");
    assert.equal(response.body.latestVersion, "0.2.6");
    assert.equal(response.body.installPerformed, true);
    assert.equal(response.body.restartRequired, true);
    assert.match(response.body.message, /重新打开 Codex/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(updateRepoRoot, { recursive: true, force: true });
  }
});

test("bridge supports export-session-markdown without exposing local paths", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-export.jsonl");
  await writeRollout(rolloutPath, "thread-export", "导出测试");

  const server = await startBridgeServer({ codexHome, port: 0 });
  try {
    const port = server.address().port;
    const response = await requestJson(port, "POST", "/export-session-markdown", {
      thread_id: "thread-export",
      title: "导出测试"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "exported");
    assert.equal(response.body.filename, "导出测试.md");
    assert.match(response.body.markdown, /# 导出测试/);
    assert.match(response.body.markdown, /## User/);
    assert.match(response.body.markdown, /hi/);
    assert.doesNotMatch(response.body.markdown, new RegExp(root.replaceAll("\\", "\\\\")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge supports handoff export without exposing local paths", async () => {
  const { root, codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-handoff.jsonl");
  await writeRollout(rolloutPath, "thread-handoff", "openai", "交接测试");

  const server = await startBridgeServer({ codexHome, port: 0 });
  try {
    const port = server.address().port;
    const response = await requestJson(port, "POST", "/handoff/export", {
      thread_id: "thread-handoff",
      title: "交接测试"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "handoff_exported");
    assert.equal(response.body.filename, "交接测试 handoff.md");
    assert.match(response.body.markdown, /# Codex Pro Handoff/);
    assert.match(response.body.markdown, /## 当前目标/);
    assert.match(response.body.markdown, /hi/);
    assert.doesNotMatch(response.body.markdown, new RegExp(root.replaceAll("\\", "\\\\")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge supports delete-session and undo-delete-session", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  await writeGlobalState(codexHome);
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-delete.jsonl");
  await writeRollout(rolloutPath, "thread-delete", "openai", "要删除的会话");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-delete",
    thread_name: "要删除的会话",
    updated_at: "2026-03-19T00:01:00.000Z"
  })}\n`, "utf8");
  await writeStateDb(codexHome, [{
    id: "thread-delete",
    rollout_path: rolloutPath,
    title: "要删除的会话"
  }]);

  const server = await startBridgeServer({ codexHome, port: 0 });
  const { port } = server.address();
  try {
    const deleted = await requestJson(port, "POST", "/delete-session", {
      thread_id: "thread-delete",
      title: "要删除的会话"
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.body.status, "local_deleted");
    assert.equal(Array.isArray(deleted.body.deletedRolloutFiles), true);
    await assert.rejects(fs.access(rolloutPath));

    const db1 = new DatabaseSync(path.join(codexHome, "state_5.sqlite"), { readOnly: true });
    try {
      const row = db1.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get("thread-delete");
      assert.equal(row.count, 0);
    } finally {
      db1.close();
    }

    const undone = await requestJson(port, "POST", "/undo-delete-session", {
      undo_token: deleted.body.undo_token
    });
    assert.equal(undone.statusCode, 200);
    assert.equal(undone.body.status, "undone");
    await fs.access(rolloutPath);

    const db2 = new DatabaseSync(path.join(codexHome, "state_5.sqlite"), { readOnly: true });
    try {
      const row = db2.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get("thread-delete");
      assert.equal(row.count, 1);
    } finally {
      db2.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge supports move-session dry-run and apply", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  await writeGlobalState(codexHome);
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-move-bridge.jsonl");
  await writeRollout(rolloutPath, "thread-move-bridge", "openai", "移动测试");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-move-bridge",
    thread_name: "移动测试",
    updated_at: "2026-03-19T00:01:00.000Z",
    cwd: "C:\\Temp\\Project"
  })}\n`, "utf8");
  await writeStateDb(codexHome, [{
    id: "thread-move-bridge",
    rollout_path: rolloutPath,
    title: "移动测试",
    cwd: "C:\\Temp\\Project"
  }]);

  const targetCwd = "D:\\BridgeMoved";
  const readRolloutCwd = async () => {
    const [firstLine] = (await fs.readFile(rolloutPath, "utf8")).split(/\r?\n/);
    return JSON.parse(firstLine).payload.cwd;
  };

  const server = await startBridgeServer({ codexHome, port: 0 });
  const { port } = server.address();
  try {
    const dryRun = await requestJson(port, "POST", "/move-session", {
      thread_id: "thread-move-bridge",
      target_cwd: targetCwd,
      dry_run: true
    });
    assert.equal(dryRun.statusCode, 200, JSON.stringify(dryRun.body));
    assert.equal(dryRun.body.status, "dry_run");
    assert.equal(dryRun.body.rolloutFilesToUpdate, 1);
    assert.equal(dryRun.body.sqliteRowsToUpdate, 1);
    assert.equal(dryRun.body.indexEntriesToUpdate, 1);
    assert.equal(await readRolloutCwd(), "C:\\Temp\\Project");

    const moved = await requestJson(port, "POST", "/move-session", {
      thread_id: "thread-move-bridge",
      target_cwd: targetCwd
    });
    assert.equal(moved.statusCode, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.status, "moved");
    assert.equal(moved.body.updatedRolloutFiles, 1);
    assert.equal(moved.body.sqliteRowsUpdated, 1);
    assert.equal(moved.body.indexEntriesUpdated, 1);
    assert.equal(moved.body.workspaceRootUpdated, true);
    assert.equal(await readRolloutCwd(), targetCwd);

    const indexText = await fs.readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
    assert.match(indexText, /"cwd":"D:\\\\BridgeMoved"/);

    const globalState = JSON.parse(await fs.readFile(path.join(codexHome, ".codex-global-state.json"), "utf8"));
    assert.equal(globalState["electron-saved-workspace-roots"][0], targetCwd);
    assert.equal(globalState["project-order"][0], targetCwd);

    const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"), { readOnly: true });
    try {
      const row = db.prepare("SELECT cwd FROM threads WHERE id = ?").get("thread-move-bridge");
      assert.equal(row.cwd, targetCwd);
    } finally {
      db.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge options returns private network headers", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const server = await startBridgeServer({ codexHome, port: 0 });
  const { port } = server.address();
  try {
    const response = await requestJson(port, "OPTIONS", "/delete-session");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["access-control-allow-private-network"], "true");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge rejects unauthenticated requests when auth token is configured", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  await writeGlobalState(codexHome);
  const server = await startBridgeServer({ codexHome, port: 0, authToken: "secret-token" });
  const { port } = server.address();
  try {
    const deniedStatus = await requestJson(port, "GET", "/status");
    assert.equal(deniedStatus.statusCode, 403);
    assert.equal(deniedStatus.body.error, "Bridge access denied.");

    const deniedDelete = await requestJson(port, "POST", "/delete-session", {
      thread_id: "thread-delete",
      title: "要删除的会话"
    });
    assert.equal(deniedDelete.statusCode, 403);
    assert.equal(deniedDelete.body.error, "Bridge access denied.");

    const allowedStatus = await requestJson(port, "GET", "/status", null, {
      "X-Codex-Pro-Token": "secret-token"
    });
    assert.equal(allowedStatus.statusCode, 200);
    assert.equal(allowedStatus.body.doctor.currentProvider, "openai");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


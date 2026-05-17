import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createBackup,
  getBackupSummary,
  pruneBackups,
  restoreBackup,
  updateSessionBackupManifest
} from "../src/backup.js";
import {
  getStatus,
  renderStatus,
  getLatestHistorySnapshotInfo,
  runDeleteSession,
  runGuardStatus,
  runHistoryDoctor,
  runMoveSession,
  runRebuildIndex,
  runRepairSidebar,
  runRestore,
  runRestoreLatest,
  runStartGuard,
  runStopGuard,
  runUndoDeleteSession,
  runResumeFallback,
  runSwitch,
  runSync
} from "../src/service.js";
import { runGuardOnce } from "../src/guard.js";
import {
  DEFAULT_BACKUP_RETENTION_COUNT
} from "../src/constants.js";
import { applySessionChanges, collectSessionChanges } from "../src/session-files.js";

async function makeTempCodexHome() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-"));
  const codexHome = path.join(root, ".codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "03", "19"), { recursive: true });
  await fs.mkdir(path.join(codexHome, "archived_sessions", "2026", "03", "18"), { recursive: true });
  return { root, codexHome };
}

async function withIsolatedGuardAppDir(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-app-"));
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

async function writeRollout(filePath, id, provider) {
  const payload = {
    id,
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "C:\\AITemp",
    source: "cli",
    cli_version: "0.115.0",
    model_provider: provider
  };
  const lines = [
    JSON.stringify({ timestamp: payload.timestamp, type: "session_meta", payload }),
    JSON.stringify({ timestamp: payload.timestamp, type: "event_msg", payload: { type: "user_message", message: "hi" } })
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function writeCustomRollout(filePath, payload, message = "hi") {
  const lines = [
    JSON.stringify({ timestamp: payload.timestamp, type: "session_meta", payload }),
    JSON.stringify({ timestamp: payload.timestamp, type: "event_msg", payload: { type: "user_message", message } })
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function backupRoot(codexHome) {
  return path.join(codexHome, "backups_state", "provider-sync");
}

async function writeBackup(codexHome, directoryName, files) {
  const backupDir = path.join(backupRoot(codexHome), directoryName);
  await fs.mkdir(backupDir, { recursive: true });
  let totalBytes = 0;
  if (!files.some(([relativePath]) => relativePath === "metadata.json")) {
    const metadataPath = path.join(backupDir, "metadata.json");
    const metadataContent = JSON.stringify({
      version: 1,
      namespace: "provider-sync",
      codexHome,
      targetProvider: "openai",
      createdAt: "2026-03-24T00:00:00.000Z",
      dbFiles: [],
      changedSessionFiles: 0
    }, null, 2);
    await fs.writeFile(metadataPath, metadataContent, "utf8");
    const metadataStat = await fs.stat(metadataPath);
    totalBytes += metadataStat.size;
  }
  for (const [relativePath, content] of files) {
    const fullPath = path.join(backupDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
    const stat = await fs.stat(fullPath);
    totalBytes += stat.size;
  }
  return totalBytes;
}

async function writeConfig(codexHome, modelProviderLine = "") {
  const config = `${modelProviderLine}${modelProviderLine ? "\n" : ""}sandbox_mode = "danger-full-access"\n\n[model_providers.apigather]\nbase_url = "https://example.com"\n`;
  await fs.writeFile(path.join(codexHome, "config.toml"), config, "utf8");
}

async function writeGlobalState(codexHome, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json"), text, "utf8");
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json.bak"), text, "utf8");
}

async function writeStateDb(codexHome, rows) {
  const dbPath = path.join(codexHome, "state_5.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        model_provider TEXT,
        cwd TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        first_user_message TEXT NOT NULL DEFAULT ''
      )
    `);
    const stmt = db.prepare("INSERT INTO threads (id, model_provider, cwd, archived, first_user_message) VALUES (?, ?, ?, ?, ?)");
    for (const row of rows) {
      stmt.run(row.id, row.model_provider, row.cwd ?? "C:\\AITemp", row.archived ? 1 : 0, row.first_user_message ?? "hello");
    }
  } finally {
    db.close();
  }
}

async function writeStateDbWithUserEventColumn(codexHome, rows) {
  const dbPath = path.join(codexHome, "state_5.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        model_provider TEXT,
        cwd TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        has_user_event INTEGER NOT NULL DEFAULT 0,
        first_user_message TEXT NOT NULL DEFAULT ''
      )
    `);
    const stmt = db.prepare("INSERT INTO threads (id, model_provider, cwd, archived, has_user_event, first_user_message) VALUES (?, ?, ?, ?, ?, ?)");
    for (const row of rows) {
      stmt.run(row.id, row.model_provider, row.cwd ?? "C:\\AITemp", row.archived ? 1 : 0, row.has_user_event ? 1 : 0, row.first_user_message ?? "hello");
    }
  } finally {
    db.close();
  }
}

async function writeStateDbForProjectVisibility(codexHome, rows) {
  const dbPath = path.join(codexHome, "state_5.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        model_provider TEXT,
        cwd TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'cli',
        archived INTEGER NOT NULL DEFAULT 0,
        first_user_message TEXT NOT NULL DEFAULT '',
        updated_at_ms INTEGER NOT NULL DEFAULT 0
      )
    `);
    const stmt = db.prepare("INSERT INTO threads (id, model_provider, cwd, source, archived, first_user_message, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const row of rows) {
      stmt.run(
        row.id,
        row.model_provider ?? "dal",
        row.cwd,
        row.source ?? "cli",
        row.archived ? 1 : 0,
        row.first_user_message ?? "hello",
        row.updated_at_ms ?? 0
      );
    }
  } finally {
    db.close();
  }
}

async function lockRolloutFile(filePath, shareMode = "None") {
  const script = `
& {
  param([string]$path, [string]$shareMode)
  $share = [System.Enum]::Parse([System.IO.FileShare], $shareMode)
  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, $share)
  try {
    Write-Output 'locked'
    [Console]::Out.Flush()
    Start-Sleep -Seconds 30
  } finally {
    $stream.Close()
  }
}
`.trim();

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    filePath,
    shareMode
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (!settled && stdout.includes("locked")) {
        settled = true;
        resolve();
      }
    });

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.once("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to acquire rollout file lock. Exit code: ${code ?? "null"}, signal: ${signal ?? "null"}`));
      }
    });
  });

  return child;
}

async function runCli(args) {
  const cliPath = path.resolve("src", "cli.js");
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.resolve("."),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("runSync rewrites rollout files and sqlite, then restore reverts both", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-b.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeRollout(archivedPath, "thread-b", "newapi");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false },
    { id: "thread-b", model_provider: "newapi", archived: true }
  ]);

  const syncResult = await runSync({ codexHome });
  assert.equal(syncResult.targetProvider, "openai");
  assert.equal(typeof syncResult.backupDurationMs, "number");
  assert.ok(syncResult.backupDurationMs >= 0);
  assert.equal(syncResult.changedSessionFiles, 2);
  assert.deepEqual(syncResult.skippedLockedRolloutFiles, []);
  assert.equal(syncResult.sqliteRowsUpdated, 2);

  const syncedSession = await fs.readFile(sessionPath, "utf8");
  const syncedArchived = await fs.readFile(archivedPath, "utf8");
  assert.match(syncedSession, /"model_provider":"openai"/);
  assert.match(syncedArchived, /"model_provider":"openai"/);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const providers = db
      .prepare("SELECT id, model_provider FROM threads ORDER BY id")
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(providers, [
      { id: "thread-a", model_provider: "openai" },
      { id: "thread-b", model_provider: "openai" }
    ]);
  } finally {
    db.close();
  }

  await runRestore({ codexHome, backupDir: syncResult.backupDir });

  const restoredSession = await fs.readFile(sessionPath, "utf8");
  const restoredArchived = await fs.readFile(archivedPath, "utf8");
  assert.match(restoredSession, /"model_provider":"apigather"/);
  assert.match(restoredArchived, /"model_provider":"newapi"/);
});

test("runSync reports stage progress and backup duration", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  const progressEvents = [];
  const result = await runSync({
    codexHome,
    onProgress(event) {
      progressEvents.push(event);
    }
  });

  assert.ok(result.backupDurationMs >= 0);
  assert.deepEqual(
    progressEvents
      .filter((event) => event.status === "start")
      .map((event) => event.stage),
    [
      "scan_rollout_files",
      "check_locked_rollout_files",
      "create_backup",
      "update_sqlite",
      "rewrite_rollout_files",
      "clean_backups"
    ]
  );

  const backupCompleteEvent = progressEvents.find((event) => event.stage === "create_backup" && event.status === "complete");
  assert.ok(backupCompleteEvent);
  assert.equal(backupCompleteEvent.backupDir, result.backupDir);
  assert.ok(backupCompleteEvent.durationMs >= 0);
});

test("runRepairSidebar restores active workspace roots from saved roots", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": [
      "C:\\Users\\Example\\Documents\\New project",
      "C:\\Users\\Example\\Projects\\workspace"
    ],
    "project-order": [
      "C:\\Users\\Example\\Documents\\New project",
      "C:\\Users\\Example\\Projects\\workspace"
    ],
    "active-workspace-roots": [
      "C:\\Users\\Example\\Documents\\New project"
    ]
  });

  const result = await runRepairSidebar({ codexHome });
  assert.equal(result.changed, true);

  const repaired = JSON.parse(await fs.readFile(path.join(codexHome, ".codex-global-state.json"), "utf8"));
  assert.deepEqual(repaired["active-workspace-roots"], [
    "C:\\Users\\Example\\Documents\\New project",
    "C:\\Users\\Example\\Projects\\workspace"
  ]);
});

test("runRebuildIndex rebuilds session_index from rollout files", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await fs.writeFile(sessionPath, [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "thread-a",
        timestamp: "2026-03-19T00:00:00.000Z",
        cwd: "C:\\AITemp",
        model_provider: "openai"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: "thread-a",
        thread_name: "测试线程"
      }
    })
  ].join("\n") + "\n", "utf8");

  const result = await runRebuildIndex({ codexHome });
  assert.equal(result.entryCount, 1);
  const indexText = await fs.readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
  assert.match(indexText, /"thread_name":"测试线程"/);
});

test("runResumeFallback reads rebuilt session index", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), [
    JSON.stringify({ id: "thread-a", thread_name: "分析电脑卡顿原因", updated_at: "2026-05-07T08:53:39.3637577Z" }),
    JSON.stringify({ id: "thread-b", thread_name: "恢复 Codex 会话记录", updated_at: "2026-05-07T11:56:11.5375782Z" })
  ].join("\n") + "\n", "utf8");

  const result = await runResumeFallback({ codexHome, query: "恢复", limit: 10 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "thread-b");
  assert.equal(result[0].source, "session_index");
});

test("runResumeFallback falls back to rollout scan when session index is empty", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const rolloutPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-fallback.jsonl");
  await fs.writeFile(rolloutPath, [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "thread-fallback",
        timestamp: "2026-03-19T00:00:00.000Z",
        cwd: "C:\\AITemp",
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
        thread_id: "thread-fallback",
        thread_name: "恢复丢失历史"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-19T00:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "帮我恢复 config 切换后的旧历史"
      }
    })
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), "", "utf8");

  const result = await runResumeFallback({ codexHome, query: "恢复", limit: 10 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "thread-fallback");
  assert.equal(result[0].source, "rollout_scan");
  assert.equal(result[0].source_label, "来自本地历史扫描");
});

test("runResumeFallback can recover candidates after provider switch when index misses old history", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "codex"');
  const rolloutPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-old-history.jsonl");
  await fs.writeFile(rolloutPath, [
    JSON.stringify({
      timestamp: "2026-03-18T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "thread-old-provider",
        timestamp: "2026-03-18T00:00:00.000Z",
        cwd: "C:\\AITemp",
        source: "cli",
        cli_version: "0.115.0",
        model_provider: "apigather"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-18T00:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: "thread-old-provider",
        thread_name: "旧渠道历史会话"
      }
    }),
    JSON.stringify({
      timestamp: "2026-03-18T00:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "这是切换 provider 前留下的旧历史"
      }
    })
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-current-provider",
    thread_name: "当前渠道新会话",
    updated_at: "2026-03-19T00:00:00.000Z"
  })}\n`, "utf8");

  const result = await runResumeFallback({ codexHome, query: "旧渠道", limit: 10 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "thread-old-provider");
  assert.equal(result[0].source, "rollout_scan");
});

test("runDeleteSession removes rollout, index, sqlite rows and can be undone", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": ["C:\\AITemp"],
    "project-order": ["C:\\AITemp"],
    "active-workspace-roots": ["C:\\AITemp"]
  });
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-delete.jsonl");
  await fs.writeFile(sessionPath, [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "thread-delete",
        timestamp: "2026-03-19T00:00:00.000Z",
        cwd: "C:\\AITemp",
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
        thread_id: "thread-delete",
        thread_name: "删除测试"
      }
    })
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-delete",
    thread_name: "删除测试",
    updated_at: "2026-03-19T00:01:00.000Z"
  })}\n`, "utf8");

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        model_provider TEXT,
        cwd TEXT NOT NULL DEFAULT '',
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
    db.prepare("INSERT INTO threads (id, model_provider, cwd, archived, first_user_message) VALUES (?, ?, ?, 0, 'hello')").run("thread-delete", "openai", "C:\\AITemp");
    db.prepare("INSERT INTO thread_dynamic_tools (thread_id, position, name, description, input_schema, defer_loading) VALUES ('thread-delete', 0, 'tool', 'desc', '{}', 0)").run();
    db.prepare("INSERT INTO thread_goals (thread_id, goal_id, objective, status, created_at_ms, updated_at_ms) VALUES ('thread-delete', 'g1', 'goal', 'open', 1, 1)").run();
    db.prepare("INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES ('thread-delete', 'thread-delete', 'running')").run();
    db.prepare("INSERT INTO stage1_outputs (thread_id, source_updated_at, raw_memory, rollout_summary, generated_at) VALUES ('thread-delete', 1, 'raw', 'summary', 1)").run();
  } finally {
    db.close();
  }

  const deleted = await runDeleteSession({ codexHome, threadId: "thread-delete", title: "删除测试" });
  assert.equal(deleted.status, "local_deleted");
  await assert.rejects(fs.access(sessionPath));
  const indexAfterDelete = await fs.readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
  assert.equal(indexAfterDelete.trim(), "");

  const dbAfterDelete = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    assert.equal(dbAfterDelete.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = ?").get("thread-delete").count, 0);
    assert.equal(dbAfterDelete.prepare("SELECT COUNT(*) AS count FROM thread_dynamic_tools WHERE thread_id = ?").get("thread-delete").count, 0);
  } finally {
    dbAfterDelete.close();
  }

  const undone = await runUndoDeleteSession({ codexHome, undoToken: deleted.undo_token });
  assert.equal(undone.status, "undone");
  await fs.access(sessionPath);
  const indexAfterUndo = await fs.readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
  assert.match(indexAfterUndo, /thread-delete/);
});

test("runMoveSession updates rollout cwd, sqlite, index, workspace roots and can be undone", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": ["C:\\AITemp"],
    "project-order": ["C:\\AITemp"],
    "active-workspace-roots": ["C:\\AITemp"]
  });
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-move.jsonl");
  await fs.writeFile(sessionPath, [
    JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "thread-move",
        timestamp: "2026-03-19T00:00:00.000Z",
        cwd: "C:\\AITemp",
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
        thread_id: "thread-move",
        thread_name: "移动测试"
      }
    })
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-move",
    thread_name: "移动测试",
    updated_at: "2026-03-19T00:01:00.000Z",
    cwd: "C:\\AITemp"
  })}\n`, "utf8");
  await writeStateDb(codexHome, [
    { id: "thread-move", model_provider: "openai", cwd: "C:\\AITemp" }
  ]);

  const dryRun = await runMoveSession({
    codexHome,
    threadId: "thread-move",
    targetCwd: "D:\\MovedProject",
    dryRun: true
  });
  assert.equal(dryRun.status, "dry_run");
  assert.equal(dryRun.rolloutFilesToUpdate, 1);
  assert.equal(dryRun.sqliteRowsToUpdate, 1);
  assert.equal(dryRun.indexEntriesToUpdate, 1);

  const beforeMove = await fs.readFile(sessionPath, "utf8");
  assert.match(beforeMove, /"cwd":"C:\\\\AITemp"/);

  const moved = await runMoveSession({
    codexHome,
    threadId: "thread-move",
    targetCwd: "D:\\MovedProject"
  });
  assert.equal(moved.status, "moved");
  assert.equal(moved.updatedRolloutFiles, 1);
  assert.equal(moved.sqliteRowsUpdated, 1);
  assert.equal(moved.indexEntriesUpdated, 1);
  assert.equal(moved.workspaceRootUpdated, true);

  const rolloutAfterMove = await fs.readFile(sessionPath, "utf8");
  assert.match(rolloutAfterMove, /"cwd":"D:\\\\MovedProject"/);
  const indexAfterMove = await fs.readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
  assert.match(indexAfterMove, /"cwd":"D:\\\\MovedProject"/);
  const globalStateAfterMove = JSON.parse(await fs.readFile(path.join(codexHome, ".codex-global-state.json"), "utf8"));
  assert.equal(globalStateAfterMove["electron-saved-workspace-roots"][0], "D:\\MovedProject");
  assert.equal(globalStateAfterMove["project-order"][0], "D:\\MovedProject");

  const dbAfterMove = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    assert.equal(dbAfterMove.prepare("SELECT cwd FROM threads WHERE id = ?").get("thread-move").cwd, "D:\\MovedProject");
  } finally {
    dbAfterMove.close();
  }

  const undone = await runUndoDeleteSession({ codexHome, undoToken: moved.undo_token });
  assert.equal(undone.status, "undone");
  assert.match(await fs.readFile(sessionPath, "utf8"), /"cwd":"C:\\\\AITemp"/);
});

test("runRestoreLatest restores rollout sessions from history snapshots", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": ["C:\\AITemp"],
    "active-workspace-roots": ["C:\\AITemp"]
  });
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-restore.jsonl");
  await writeRollout(sessionPath, "thread-restore", "openai");
  await writeStateDb(codexHome, [
    { id: "thread-restore", model_provider: "openai", archived: false }
  ]);

  const snapshot = await getLatestHistorySnapshotInfo({ codexHome });
  assert.equal(snapshot, null);
  const created = await runSync({ codexHome });
  assert.ok(created.backupDir);

  const historySnapshot = await runDeleteSession({ codexHome, threadId: "thread-restore", title: "恢复测试" });
  await assert.rejects(fs.access(sessionPath));

  const restored = await runRestoreLatest({ codexHome });
  assert.ok(restored.snapshotDir);
  await fs.access(sessionPath);

  const latest = await getLatestHistorySnapshotInfo({ codexHome });
  assert.ok(latest?.snapshotDir);
  assert.equal(latest.snapshotDir, historySnapshot.undo_token);
});

test("runHistoryDoctor reports index and workspace mismatch diagnostics", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": [
      "C:\\Users\\Example\\Documents\\New project",
      "C:\\Users\\Example\\Projects\\workspace"
    ],
    "active-workspace-roots": [
      "C:\\Users\\Example\\Documents\\New project"
    ]
  });
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), [
    JSON.stringify({ id: "thread-a", thread_name: "测试", updated_at: "2026-05-07T00:00:00.000Z" })
  ].join("\n") + "\n", "utf8");

  const doctor = await runHistoryDoctor({ codexHome });
  assert.equal(doctor.sessionIndexCount, 1);
  assert.equal(doctor.savedWorkspaceRootCount, 2);
  assert.equal(doctor.activeWorkspaceRootCount, 1);
  assert.equal(doctor.missingActiveRoots.length, 1);
  assert.ok(doctor.injectionDiagnosisPath.includes("cdp-diagnosis.json"));
  assert.equal(typeof doctor.uiIntegrationMode, "string");
  assert.equal(typeof doctor.recoverySummary, "string");
  assert.equal(typeof doctor.recommendedAction, "string");
  assert.ok(Array.isArray(doctor.recoverySteps));
  assert.equal(typeof doctor.productState.kind, "string");
  assert.equal(doctor.productState.recoveryNeeded, true);
  assert.equal(doctor.historyVisibility.severity, "notice");
  assert.equal(doctor.historyVisibility.flags.workspaceRootMismatch, true);
  assert.equal(Array.isArray(doctor.historyVisibility.steps), true);
  });

test("status reports history visibility summary when index is sparse", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": ["C:\\AITemp"],
    "project-order": ["C:\\AITemp"],
    "active-workspace-roots": ["C:\\AITemp"]
  });
  await writeRollout(path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl"), "thread-a", "openai");
  await writeRollout(path.join(codexHome, "sessions", "2026", "03", "19", "rollout-b.jsonl"), "thread-b", "apigather");
  await writeRollout(path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-c.jsonl"), "thread-c", "newapi");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), `${JSON.stringify({
    id: "thread-a",
    thread_name: "唯一索引会话",
    updated_at: "2026-03-19T00:00:00.000Z"
  })}\n`, "utf8");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "openai", archived: false },
    { id: "thread-b", model_provider: "apigather", archived: false },
    { id: "thread-c", model_provider: "newapi", archived: true }
  ]);

  const status = await getStatus({ codexHome });
  assert.equal(status.historyVisibility.severity, "warning");
  assert.equal(status.historyVisibility.flags.sessionIndexSparse, true);
  assert.equal(status.historyVisibility.flags.providerBucketRisk, true);
  assert.match(status.historyVisibility.summary, /历史/);
});

test("guard status reports not running before startup", async () => {
  await withIsolatedGuardAppDir(async () => {
    const status = await runGuardStatus();
    assert.equal(typeof status.running, "boolean");
    assert.ok(status.logPath.includes("guard.log"));
    assert.ok(status.logPath.includes(".codex-pro"));
    assert.ok(status.diagnosisPath.includes("cdp-diagnosis.json"));
  });
});

test("guard status reports legacy diagnosis cache path when fallback file is used", async () => {
  await withIsolatedGuardAppDir(async ({ legacyDir }) => {
    const diagnosisPath = path.join(legacyDir, "cdp-diagnosis.json");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(diagnosisPath, `${JSON.stringify({
      status: "unsupported",
      message: "legacy fallback test",
      saved_at: "2026-05-08 13:19:54"
    }, null, 2)}\n`, "utf8");

    const status = await runGuardStatus();
    assert.equal(status.diagnosis?.message, "legacy fallback test");
    assert.equal(status.diagnosisPath, diagnosisPath);
  });
});

test("guard status prefers diagnosis record with newer saved_at over stale file mtime", async () => {
  await withIsolatedGuardAppDir(async ({ defaultDir, legacyDir }) => {
    const defaultDiagnosisPath = path.join(defaultDir, "cdp-diagnosis.json");
    const legacyDiagnosisPath = path.join(legacyDir, "cdp-diagnosis.json");
    await fs.mkdir(defaultDir, { recursive: true });
    await fs.mkdir(legacyDir, { recursive: true });

    await fs.writeFile(defaultDiagnosisPath, `${JSON.stringify({
      status: "supported",
      message: "new supported diagnosis",
      saved_at: "2026-05-09 15:20:31"
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(legacyDiagnosisPath, `${JSON.stringify({
      status: "unsupported",
      message: "stale unsupported diagnosis",
      saved_at: "2026-05-08 13:10:00"
    }, null, 2)}\n`, "utf8");

    const futureMtime = new Date("2026-05-10T00:00:00.000Z");
    await fs.utimes(legacyDiagnosisPath, futureMtime, futureMtime);

    const status = await runGuardStatus();
    assert.equal(status.diagnosis?.message, "new supported diagnosis");
    assert.equal(status.diagnosisPath, defaultDiagnosisPath);
  });
});

test("startGuard can infer cli path and can be stopped after spawn attempt", async () => {
  await withIsolatedGuardAppDir(async () => {
    const { codexHome } = await makeTempCodexHome();
    await writeConfig(codexHome, 'model_provider = "openai"');
    await runStopGuard();

    const startResult = await runStartGuard({ codexHome });
    assert.equal(typeof startResult.pid, "number");

    const stopResult = await runStopGuard();
    assert.equal(typeof stopResult.stopped, "boolean");
  });
});

test("runSync repairs SQLite has_user_event from rollout user messages", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "openai");
  await writeStateDbWithUserEventColumn(codexHome, [
    { id: "thread-a", model_provider: "openai", archived: false, has_user_event: false }
  ]);

  const syncResult = await runSync({ codexHome });

  assert.equal(syncResult.changedSessionFiles, 0);
  assert.equal(syncResult.sqliteRowsUpdated, 1);
  assert.equal(syncResult.sqliteUserEventRowsUpdated, 1);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const row = db
      .prepare("SELECT has_user_event FROM threads WHERE id = ?")
      .get("thread-a");
    assert.equal(row.has_user_event, 1);
  } finally {
    db.close();
  }
});

test("runSync repairs SQLite cwd from rollout session metadata", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-cwd.jsonl");
  await writeCustomRollout(sessionPath, {
    id: "thread-cwd",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "D:\\GitHubProject\\oss-maintainer-hub",
    source: "vscode",
    cli_version: "0.115.0",
    model_provider: "openai"
  });
  await writeStateDb(codexHome, [
    {
      id: "thread-cwd",
      model_provider: "openai",
      archived: false,
      cwd: "\\\\?\\D:\\GitHubProject\\oss-maintainer-hub"
    }
  ]);

  const syncResult = await runSync({ codexHome });

  assert.equal(syncResult.changedSessionFiles, 0);
  assert.equal(syncResult.sqliteRowsUpdated, 1);
  assert.equal(syncResult.sqliteCwdRowsUpdated, 1);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const row = db
      .prepare("SELECT cwd FROM threads WHERE id = ?")
      .get("thread-cwd");
    assert.equal(row.cwd, "D:\\GitHubProject\\oss-maintainer-hub");
  } finally {
    db.close();
  }
});

test("runSync normalizes extended rollout cwd before repairing SQLite", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-cwd-extended.jsonl");
  await writeCustomRollout(sessionPath, {
    id: "thread-cwd-extended",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "\\\\?\\E:\\GitHubProject\\lin-framework",
    source: "vscode",
    cli_version: "0.115.0",
    model_provider: "openai"
  });
  await writeStateDb(codexHome, [
    {
      id: "thread-cwd-extended",
      model_provider: "openai",
      archived: false,
      cwd: "\\\\?\\E:\\GitHubProject\\lin-framework"
    }
  ]);

  const syncResult = await runSync({ codexHome });

  assert.equal(syncResult.sqliteRowsUpdated, 1);
  assert.equal(syncResult.sqliteCwdRowsUpdated, 1);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const row = db
      .prepare("SELECT cwd FROM threads WHERE id = ?")
      .get("thread-cwd-extended");
    assert.equal(row.cwd, "E:\\GitHubProject\\lin-framework");
  } finally {
    db.close();
  }
});

test("runSync restores workspace roots from project order and normalizes them to Desktop path variants", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const originalState = {
    "electron-saved-workspace-roots": [
      "\\\\?\\D:\\GitHubProject\\history-guard-demo"
    ],
    "project-order": [
      "\\\\?\\D:\\GitHubProject\\history-guard-demo",
      "\\\\?\\E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets"
    ],
    "active-workspace-roots": [
      "\\\\?\\D:\\GitHubProject\\history-guard-demo"
    ],
    "electron-workspace-root-labels": {
      "\\\\?\\E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets": "BrainLifeAssets"
    }
  };
  await writeGlobalState(codexHome, originalState);
  await writeStateDb(codexHome, [
    {
      id: "thread-a",
      model_provider: "openai",
      archived: false,
      cwd: "\\\\?\\D:\\GitHubProject\\history-guard-demo"
    },
    {
      id: "thread-b",
      model_provider: "openai",
      archived: false,
      cwd: "\\\\?\\E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets"
    }
  ]);

  const syncResult = await runSync({ codexHome });
  assert.equal(syncResult.updatedWorkspaceRoots, 2);

  const syncedState = JSON.parse(await fs.readFile(path.join(codexHome, ".codex-global-state.json"), "utf8"));
  assert.deepEqual(syncedState["electron-saved-workspace-roots"], [
    "D:\\GitHubProject\\history-guard-demo",
    "E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets"
  ]);
  assert.deepEqual(syncedState["project-order"], [
    "D:\\GitHubProject\\history-guard-demo",
    "E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets"
  ]);
  assert.deepEqual(syncedState["active-workspace-roots"], [
    "D:\\GitHubProject\\history-guard-demo"
  ]);
  assert.equal(
    syncedState["electron-workspace-root-labels"]["E:\\NewRich\\BrainLife\\Code\\BrainLife\\Assets"],
    "BrainLifeAssets"
  );

  await runRestore({ codexHome, backupDir: syncResult.backupDir });

  const restoredState = JSON.parse(await fs.readFile(path.join(codexHome, ".codex-global-state.json"), "utf8"));
  assert.deepEqual(restoredState["electron-saved-workspace-roots"], originalState["electron-saved-workspace-roots"]);
  assert.deepEqual(restoredState["project-order"], originalState["project-order"]);
});

test("runSwitch updates config and syncs provider metadata", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "openai");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "openai", archived: false }
  ]);

  const result = await runSwitch({ codexHome, provider: "apigather" });
  assert.equal(result.targetProvider, "apigather");

  const config = await fs.readFile(path.join(codexHome, "config.toml"), "utf8");
  assert.match(config, /^model_provider = "apigather"/m);
  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"apigather"/);
});

test("runSync keeps history grouped under a stable provider identity", async () => {
  const { codexHome } = await makeTempCodexHome();
  const configPath = path.join(codexHome, "config.toml");
  await fs.writeFile(configPath, [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "http://localhost:48760/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");

  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-b.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeRollout(archivedPath, "thread-b", "openai");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false },
    { id: "thread-b", model_provider: "openai", archived: true }
  ]);

  const firstSync = await runSync({ codexHome });
  assert.equal(firstSync.targetProvider, "codex");
  assert.equal(firstSync.changedSessionFiles, 2);

  const afterFirstSync = JSON.parse(JSON.stringify((await getStatus({ codexHome })).rolloutCounts));
  assert.deepEqual(afterFirstSync.sessions, { codex: 1 });
  assert.deepEqual(afterFirstSync.archived_sessions, { codex: 1 });

  await fs.writeFile(configPath, [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "https://gateway.example.com/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");

  const secondSync = await runSync({ codexHome });
  assert.equal(secondSync.targetProvider, "codex");
  assert.equal(secondSync.changedSessionFiles, 0);

  const status = await getStatus({ codexHome });
  assert.equal(status.currentProvider, "codex");
  assert.deepEqual(status.rolloutCounts.sessions, { codex: 1 });
  assert.deepEqual(status.rolloutCounts.archived_sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.archived_sessions, { codex: 1 });
});

test("runGuardOnce repairs visibility after auth and provider channel changes", async () => {
  const { codexHome } = await makeTempCodexHome();
  const configPath = path.join(codexHome, "config.toml");
  await fs.writeFile(configPath, [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "http://localhost:48760/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(codexHome, "auth.json"), JSON.stringify({ provider: "codex", account: "user-a" }, null, 2), "utf8");

  const workspaceA = "C:\\Users\\Example\\Desktop\\alpha";
  const workspaceB = "C:\\Users\\Example\\Desktop\\beta";
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": [workspaceA, workspaceB],
    "project-order": [workspaceA, workspaceB],
    "active-workspace-roots": [workspaceA]
  });
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), "", "utf8");

  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-b.jsonl");
  await writeCustomRollout(sessionPath, {
    id: "thread-a",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: workspaceA,
    source: "cli",
    cli_version: "0.115.0",
    model_provider: "apigather"
  }, "alpha");
  await writeCustomRollout(archivedPath, {
    id: "thread-b",
    timestamp: "2026-03-18T00:00:00.000Z",
    cwd: workspaceB,
    source: "cli",
    cli_version: "0.115.0",
    model_provider: "openai"
  }, "beta");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false, cwd: workspaceA, first_user_message: "alpha" },
    { id: "thread-b", model_provider: "openai", archived: true, cwd: workspaceB, first_user_message: "beta" }
  ]);

  await fs.writeFile(configPath, [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "https://gateway.example.com/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(codexHome, "auth.json"), JSON.stringify({ provider: "codex", account: "user-b" }, null, 2), "utf8");

  const result = await runGuardOnce(codexHome);
  const status = await getStatus({ codexHome });

  assert.ok(result.snapshotDir);
  assert.ok(result.actions.some((action) => action.type === "rebuild-index" && action.entryCount === 2));
  assert.ok(result.actions.some((action) => action.type === "repair-sidebar" && action.changed === true));
  assert.ok(result.actions.some((action) => action.type === "sync" && action.provider === "codex"));
  assert.equal(status.historyVisibility.severity, "ok");
  assert.deepEqual(status.rolloutCounts.sessions, { codex: 1 });
  assert.deepEqual(status.rolloutCounts.archived_sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.archived_sessions, { codex: 1 });
});

test("status reports implicit default provider and rollout/sqlite counts", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-b.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeRollout(archivedPath, "thread-b", "openai");
  const backupOneBytes = await writeBackup(codexHome, "20260319T000000000Z", [["note.txt", "backup-one"]]);
  const backupTwoBytes = await writeBackup(codexHome, "20260320T000000000Z", [["note.txt", "backup-two"]]);
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false },
    { id: "thread-b", model_provider: "openai", archived: true }
  ]);

  const status = await getStatus({ codexHome });
  assert.equal(status.currentProvider, "openai");
  assert.equal(status.currentProviderImplicit, true);
  assert.deepEqual(status.rolloutCounts.sessions, { apigather: 1 });
  assert.deepEqual(status.sqliteCounts.archived_sessions, { openai: 1 });
  assert.equal(status.backupSummary.count, 2);
  assert.equal(status.backupSummary.totalBytes, backupOneBytes + backupTwoBytes);
});

test("status reports pending SQLite user-event and cwd repairs", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-repair-status.jsonl");
  await writeCustomRollout(sessionPath, {
    id: "thread-repair-status",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "E:\\GitHubProject\\lin-framework",
    source: "vscode",
    cli_version: "0.115.0",
    model_provider: "openai"
  });
  await writeStateDbWithUserEventColumn(codexHome, [
    {
      id: "thread-repair-status",
      model_provider: "openai",
      archived: false,
      has_user_event: false,
      cwd: "\\\\?\\E:\\GitHubProject\\lin-framework"
    }
  ]);

  const status = await getStatus({ codexHome });

  assert.equal(status.sqliteRepairStats.userEventRowsNeedingRepair, 1);
  assert.equal(status.sqliteRepairStats.cwdRowsNeedingRepair, 1);
  assert.match(renderStatus(status), /user-event flags needing repair: 1/);
  assert.match(renderStatus(status), /cwd paths needing repair: 1/);
});

test("status reports project visibility ranks and cwd exact-match diagnostics", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "dal"');
  await writeGlobalState(codexHome, {
    "electron-saved-workspace-roots": [
      "E:\\GitHubProject\\lin-framework"
    ]
  });

  const unrelatedRows = Array.from({ length: 51 }, (_, index) => ({
    id: `thread-other-${String(index).padStart(2, "0")}`,
    cwd: "D:\\OtherProject",
    updated_at_ms: 1000 - index
  }));
  await writeStateDbForProjectVisibility(codexHome, [
    ...unrelatedRows,
    {
      id: "thread-lin",
      cwd: "\\\\?\\E:\\GitHubProject\\lin-framework",
      updated_at_ms: 1
    }
  ]);

  const status = await getStatus({ codexHome });
  const [project] = status.projectThreadVisibility;

  assert.equal(project.root, "E:\\GitHubProject\\lin-framework");
  assert.equal(project.interactiveThreads, 1);
  assert.equal(project.firstPageThreads, 0);
  assert.deepEqual(project.ranks, [52]);
  assert.equal(project.exactCwdMatches, 0);
  assert.equal(project.verbatimCwdRows, 1);
  assert.match(renderStatus(status), /Project visibility:/);
  assert.match(renderStatus(status), /first page 0\/50, ranks 52, exact cwd 0\/1, verbatim cwd 1/);
});

test("runSwitch rejects unknown custom providers", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome);
  await assert.rejects(
    () => runSwitch({ codexHome, provider: "missing" }),
    /Provider "missing" is not available/
  );
});

test("runSync leaves rollout files and sqlite untouched when sqlite is locked", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  const lockDb = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    lockDb.exec("BEGIN IMMEDIATE");
    await assert.rejects(
      () => runSync({ codexHome, sqliteBusyTimeoutMs: 0 }),
      /state_5\.sqlite is currently in use/
    );
  } finally {
    try {
      lockDb.exec("ROLLBACK");
    } catch {
      // Ignore cleanup failures in tests.
    }
    lockDb.close();
  }

  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"apigather"/);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const row = db
      .prepare("SELECT model_provider FROM threads WHERE id = ?")
      .get("thread-a");
    assert.equal(row.model_provider, "apigather");
  } finally {
    db.close();
  }
});

test("runSync skips locked rollout files and still updates sqlite", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  const lockProcess = await lockRolloutFile(sessionPath);
  let result;
  try {
    result = await runSync({ codexHome, sqliteBusyTimeoutMs: 0 });
  } finally {
    lockProcess.kill();
    await new Promise((resolve) => lockProcess.once("exit", resolve));
  }

  assert.equal(result.changedSessionFiles, 0);
  assert.equal(result.sqliteRowsUpdated, 1);
  assert.deepEqual(result.skippedLockedRolloutFiles, [sessionPath]);

  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"apigather"/);

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    const row = db
      .prepare("SELECT model_provider FROM threads WHERE id = ?")
      .get("thread-a");
    assert.equal(row.model_provider, "openai");
  } finally {
    db.close();
  }
});

test("applySessionChanges skips rollout files that changed after collection", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");

  const { changes } = await collectSessionChanges(codexHome, "openai");
  await fs.appendFile(
    sessionPath,
    '{"timestamp":"2026-03-19T00:00:01.000Z","type":"event_msg","payload":{"type":"assistant_message","message":"later"}}\n',
    "utf8"
  );

  const result = await applySessionChanges(changes);
  assert.equal(result.appliedChanges, 0);
  assert.deepEqual(result.skippedPaths, [sessionPath]);

  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"apigather"/);
  assert.match(rollout, /"message":"later"/);
});

test("applySessionChanges preserves large UTF-8 session metadata", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-large.jsonl");
  const payload = {
    id: "thread-large",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "C:\\AITemp\\中文",
    source: "cli",
    cli_version: "0.115.0",
    model_provider: "apigather",
    title: "中文会话",
    note: "保留 UTF-8 内容",
    large_blob: "数据块".repeat(40000)
  };
  await writeCustomRollout(sessionPath, payload, "你好");

  const { changes } = await collectSessionChanges(codexHome, "openai");
  const result = await applySessionChanges(changes);

  assert.equal(result.appliedChanges, 1);
  assert.deepEqual(result.skippedPaths, []);

  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"openai"/);
  assert.match(rollout, /"title":"中文会话"/);
  assert.match(rollout, /"note":"保留 UTF-8 内容"/);
  assert.match(rollout, /"message":"你好"/);
  assert.match(rollout, /"large_blob":"数据块数据块/);
});

test("applySessionChanges restores original rollout mtime", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-mtime.jsonl");
  await writeRollout(sessionPath, "thread-mtime", "apigather");
  const originalTime = new Date("2026-01-02T03:04:05.000Z");
  await fs.utimes(sessionPath, originalTime, originalTime);

  const { changes } = await collectSessionChanges(codexHome, "openai");
  const result = await applySessionChanges(changes);

  assert.equal(result.appliedChanges, 1);
  const stat = await fs.stat(sessionPath);
  assert.equal(Math.round(stat.mtimeMs), originalTime.getTime());
});

test("collectSessionChanges reports encrypted_content counts by provider and scope", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-enc.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "03", "18", "rollout-enc-archived.jsonl");
  await writeRollout(sessionPath, "thread-enc", "apigather");
  await fs.appendFile(sessionPath, '{"type":"event_msg","payload":{"encrypted_content":"gAAA"}}\n', "utf8");
  await writeRollout(archivedPath, "thread-enc-archived", "openai");
  await fs.appendFile(archivedPath, '{"type":"event_msg","payload":{"encrypted_content":"gBBB"}}\n', "utf8");

  const { encryptedContentCounts } = await collectSessionChanges(codexHome, "openai");

  assert.deepEqual(encryptedContentCounts, {
    sessions: { apigather: 1 },
    archived_sessions: { openai: 1 }
  });
});

test("collectSessionChanges scans large rollout content without full-file reads", async (t) => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-streamed.jsonl");
  const payload = {
    id: "thread-streamed",
    timestamp: "2026-03-19T00:00:00.000Z",
    cwd: "C:\\AITemp",
    source: "cli",
    cli_version: "0.115.0",
    model_provider: "apigather"
  };
  await fs.writeFile(
    sessionPath,
    `${JSON.stringify({ timestamp: payload.timestamp, type: "session_meta", payload })}\n`,
    "utf8"
  );

  const chunkBytes = 1024 * 1024;
  const tokenPrefix = "encrypted_";
  await fs.appendFile(
    sessionPath,
    `${"x".repeat(chunkBytes - tokenPrefix.length)}${tokenPrefix}content\n${JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message", message: "after large content" }
    })}\n`,
    "utf8"
  );

  const originalReadFile = fs.readFile;
  t.mock.method(fs, "readFile", async (filePath, ...args) => {
    if (path.resolve(String(filePath)) === path.resolve(sessionPath)) {
      throw new Error("rollout scan should not read the full file");
    }
    return originalReadFile.call(fs, filePath, ...args);
  });

  const { encryptedContentCounts, userEventThreadIds } = await collectSessionChanges(codexHome, "openai");

  assert.deepEqual(encryptedContentCounts, {
    sessions: { apigather: 1 },
    archived_sessions: {}
  });
  assert.equal(userEventThreadIds.has("thread-streamed"), true);
});

test("applySessionChanges skips only the rollout file that becomes locked on Windows", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const lockedPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-locked.jsonl");
  const writablePath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-writable.jsonl");
  await writeRollout(lockedPath, "thread-locked", "apigather");
  await writeRollout(writablePath, "thread-writable", "apigather");

  const { changes } = await collectSessionChanges(codexHome, "openai");
  const lockProcess = await lockRolloutFile(lockedPath);
  let result;
  try {
    result = await applySessionChanges(changes);
  } finally {
    lockProcess.kill();
    await new Promise((resolve) => lockProcess.once("exit", resolve));
  }

  assert.equal(result.appliedChanges, 1);
  assert.deepEqual(result.appliedPaths, [writablePath]);
  assert.deepEqual(result.skippedPaths, [lockedPath]);

  const lockedRollout = await fs.readFile(lockedPath, "utf8");
  const writableRollout = await fs.readFile(writablePath, "utf8");
  assert.match(lockedRollout, /"model_provider":"apigather"/);
  assert.match(writableRollout, /"model_provider":"openai"/);
});

test("restoreBackup only restores rollout files that were actually applied", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const configPath = path.join(codexHome, "config.toml");
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");

  const { changes } = await collectSessionChanges(codexHome, "openai");
  const backupDir = await createBackup({
    codexHome,
    targetProvider: "openai",
    sessionChanges: changes,
    configPath
  });

  await updateSessionBackupManifest(backupDir, []);
  await writeRollout(sessionPath, "thread-a", "manual");

  await restoreBackup(backupDir, codexHome, {
    restoreConfig: false,
    restoreDatabase: false,
    restoreSessions: true
  });

  const rollout = await fs.readFile(sessionPath, "utf8");
  assert.match(rollout, /"model_provider":"manual"/);
});

test("restoreBackup can skip config, database, and sessions", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const configPath = path.join(codexHome, "config.toml");
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-skip.jsonl");
  await writeRollout(sessionPath, "thread-skip", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-skip", model_provider: "apigather", archived: false }
  ]);
  const { changes } = await collectSessionChanges(codexHome, "openai");
  const backupDir = await createBackup({ codexHome, targetProvider: "openai", sessionChanges: changes, configPath });

  await writeConfig(codexHome, 'model_provider = "manual"');
  await writeRollout(sessionPath, "thread-skip", "manual");
  await restoreBackup(backupDir, codexHome, {
    restoreConfig: false,
    restoreDatabase: false,
    restoreSessions: false
  });

  assert.match(await fs.readFile(configPath, "utf8"), /^model_provider = "manual"/m);
  assert.match(await fs.readFile(sessionPath, "utf8"), /"model_provider":"manual"/);
});

test("runSync fails before rollout rewrite when SQLite is malformed", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-malformed-db.jsonl");
  await writeRollout(sessionPath, "thread-malformed", "apigather");
  await fs.writeFile(path.join(codexHome, "state_5.sqlite"), "not sqlite", "utf8");

  await assert.rejects(
    () => runSync({ codexHome }),
    /state_5\.sqlite is malformed or unreadable/
  );
  assert.match(await fs.readFile(sessionPath, "utf8"), /"model_provider":"apigather"/);
});

test("status reports malformed SQLite without failing", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  await writeRollout(path.join(codexHome, "sessions", "2026", "03", "19", "rollout-status-db.jsonl"), "thread-status", "openai");
  await fs.writeFile(path.join(codexHome, "state_5.sqlite"), "not sqlite", "utf8");

  const status = await getStatus({ codexHome });
  assert.equal(status.sqliteCounts.unreadable, true);
  assert.match(renderStatus(status), /state_5\.sqlite is malformed or unreadable/);
});

test("status skips locked rollout files without failing", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-status-locked.jsonl");
  await writeRollout(sessionPath, "thread-status-locked", "openai");

  const lockProcess = await lockRolloutFile(sessionPath);
  try {
    const status = await getStatus({ codexHome });
    assert.deepEqual(status.lockedRolloutFiles, [sessionPath]);
    assert.match(renderStatus(status), /Locked rollout files skipped during status scan: 1/);
  } finally {
    lockProcess.kill();
    await new Promise((resolve) => lockProcess.once("exit", resolve));
  }
});

test("pruneBackups removes the oldest backup directories", async () => {
  const { codexHome } = await makeTempCodexHome();
  const oldestBytes = await writeBackup(codexHome, "20260319T000000000Z", [
    ["note.txt", "oldest"],
    ["db/state_5.sqlite", "sqlite"]
  ]);
  await writeBackup(codexHome, "20260320T000000000Z", [["note.txt", "middle"]]);
  await writeBackup(codexHome, "20260321T000000000Z", [["note.txt", "newest"]]);

  const result = await pruneBackups(codexHome, 2);

  assert.equal(result.backupRoot, backupRoot(codexHome));
  assert.equal(result.deletedCount, 1);
  assert.equal(result.remainingCount, 2);
  assert.equal(result.freedBytes, oldestBytes);
  await assert.rejects(fs.access(path.join(backupRoot(codexHome), "20260319T000000000Z")));
  await fs.access(path.join(backupRoot(codexHome), "20260320T000000000Z"));
  await fs.access(path.join(backupRoot(codexHome), "20260321T000000000Z"));
});

test("pruneBackups ignores directories without managed backup metadata", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeBackup(codexHome, "20260320T000000000Z", [
    ["metadata.json", JSON.stringify({ namespace: "provider-sync" })]
  ]);
  const junkDirectory = path.join(backupRoot(codexHome), "manual-notes");
  await fs.mkdir(junkDirectory, { recursive: true });
  await fs.writeFile(path.join(junkDirectory, "readme.txt"), "keep me", "utf8");

  const result = await pruneBackups(codexHome, 0);

  assert.equal(result.deletedCount, 1);
  assert.equal(result.remainingCount, 0);
  await fs.access(junkDirectory);
});

test("runSync auto-prunes backups to the default retention count", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  for (let index = 0; index < DEFAULT_BACKUP_RETENTION_COUNT; index += 1) {
    await writeBackup(codexHome, `20240101T0000${String(index).padStart(2, "0")}000Z`, [
      ["note.txt", `backup-${index}`]
    ]);
  }

  const result = await runSync({ codexHome });
  const summary = await getBackupSummary(codexHome);

  assert.equal(summary.count, DEFAULT_BACKUP_RETENTION_COUNT);
  await fs.access(result.backupDir);
  assert.equal(result.autoPruneResult.deletedCount, 1);
  assert.equal(result.autoPruneResult.remainingCount, DEFAULT_BACKUP_RETENTION_COUNT);
  assert.equal(result.autoPruneWarning, null);
});

test("runSync uses a custom automatic backup retention count", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  for (let index = 0; index < 4; index += 1) {
    await writeBackup(codexHome, `20240101T0000${String(index).padStart(2, "0")}000Z`, [
      ["note.txt", `backup-${index}`]
    ]);
  }

  const result = await runSync({ codexHome, keepCount: 2 });
  const summary = await getBackupSummary(codexHome);

  assert.equal(summary.count, 2);
  await fs.access(result.backupDir);
  assert.equal(result.autoPruneResult.deletedCount, 3);
  assert.equal(result.autoPruneResult.remainingCount, 2);
  assert.equal(result.autoPruneWarning, null);
});

test("cli rejects non-integer keep values", async () => {
  const result = await runCli(["prune-backups", "--keep", "1.5"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --keep value: 1\.5/);
});

test("cli sync prints stage progress and backup timing", async () => {
  const { codexHome } = await makeTempCodexHome();
  await writeConfig(codexHome, 'model_provider = "openai"');
  const sessionPath = path.join(codexHome, "sessions", "2026", "03", "19", "rollout-a.jsonl");
  await writeRollout(sessionPath, "thread-a", "apigather");
  await writeStateDb(codexHome, [
    { id: "thread-a", model_provider: "apigather", archived: false }
  ]);

  const result = await runCli(["sync", "--codex-home", codexHome]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /\[1\/6\] Scanning rollout files\.\.\./);
  assert.match(result.stdout, /\[2\/6\] Checking locked rollout files\.\.\./);
  assert.match(result.stdout, /\[3\/6\] Creating backup\.\.\./);
  assert.match(result.stdout, /\[4\/6\] Updating SQLite\.\.\./);
  assert.match(result.stdout, /\[5\/6\] Rewriting rollout files\.\.\./);
  assert.match(result.stdout, /\[6\/6\] Cleaning backups\.\.\./);
  assert.match(result.stdout, /Backup created in .*: .+/);
  assert.match(result.stdout, /Backup creation time: /);
});


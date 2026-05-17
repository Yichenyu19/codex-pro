import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  getStatus,
  runHistoryDoctor,
  runRebuildIndex,
  runRepairSidebar,
  runResumeFallback,
  runSnapshot,
  runSync
} from "../src/service.js";
import { runGuardOnce } from "../src/guard.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(repoRoot, "artifacts", "history-continuity");

async function writeRollout(filePath, id, provider, cwd, title) {
  const timestamp = "2026-05-08T12:00:00.000Z";
  const lines = [
    JSON.stringify({
      timestamp,
      type: "session_meta",
      payload: {
        id,
        timestamp,
        cwd,
        source: "cli",
        cli_version: "0.115.0",
        model_provider: provider
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-08T12:01:00.000Z",
      type: "event_msg",
      payload: {
        type: "thread_name_updated",
        thread_id: id,
        thread_name: title
      }
    }),
    JSON.stringify({
      timestamp: "2026-05-08T12:02:00.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: `hello from ${id}`
      }
    })
  ];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function createValidationHome() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-continuity-"));
  const codexHome = path.join(root, ".codex");
  await fs.mkdir(path.join(codexHome, "sessions", "2026", "05", "08"), { recursive: true });
  await fs.mkdir(path.join(codexHome, "archived_sessions", "2026", "05", "07"), { recursive: true });

  await fs.writeFile(path.join(codexHome, "config.toml"), [
    'model_provider = "openai"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "http://localhost:48760/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");

  const workspaceA = "C:\\Users\\Example\\Desktop\\alpha";
  const workspaceB = "C:\\Users\\Example\\Desktop\\beta";
  const state = {
    "electron-saved-workspace-roots": [workspaceA, workspaceB],
    "project-order": [workspaceA, workspaceB],
    "active-workspace-roots": [workspaceA]
  };
  const stateText = `${JSON.stringify(state, null, 2)}\n`;
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json"), stateText, "utf8");
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json.bak"), stateText, "utf8");
  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), "", "utf8");
  await fs.writeFile(path.join(codexHome, "auth.json"), `${JSON.stringify({ provider: "openai", account: "user-a" }, null, 2)}\n`, "utf8");

  const sessionPath = path.join(codexHome, "sessions", "2026", "05", "08", "rollout-alpha.jsonl");
  const archivedPath = path.join(codexHome, "archived_sessions", "2026", "05", "07", "rollout-beta.jsonl");
  await writeRollout(sessionPath, "thread-alpha", "openai", workspaceA, "Alpha session");
  await writeRollout(archivedPath, "thread-beta", "apigather", workspaceB, "Beta session");

  const db = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
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
    stmt.run("thread-alpha", "openai", workspaceA, "cli", 0, "hello from alpha", 2000);
    stmt.run("thread-beta", "apigather", workspaceB, "cli", 1, "hello from beta", 1000);
  } finally {
    db.close();
  }

  return { root, codexHome, workspaceA, workspaceB, sessionPath, archivedPath };
}

async function simulateConfigSwitch(codexHome) {
  await fs.writeFile(path.join(codexHome, "config.toml"), [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "https://gateway.example.com/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");
}

async function simulateAuthAndChannelSwitch(codexHome) {
  await fs.writeFile(path.join(codexHome, "config.toml"), [
    'model_provider = "codex"',
    "",
    "[model_providers.codex]",
    'name = "codex"',
    'base_url = "https://gateway.example.com/v1"',
    'wire_api = "responses"',
    ""
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(codexHome, "auth.json"), `${JSON.stringify({ provider: "codex", account: "user-b" }, null, 2)}\n`, "utf8");
}

const { root, codexHome, workspaceA, workspaceB, archivedPath } = await createValidationHome();

try {
  const before = await runHistoryDoctor({ codexHome });
  assert.equal(before.rolloutFileCount, 2);
  assert.equal(before.sessionIndexCount, 0);
  assert.equal(before.missingActiveRoots.length, 1);
  assert.equal(before.historyVisibility.severity, "warning");

  await simulateConfigSwitch(codexHome);
  const snapshot = await runSnapshot({ codexHome });
  const sync = await runSync({ codexHome });
  const repair = await runRepairSidebar({ codexHome });
  const fallbackBeforeRebuild = await runResumeFallback({ codexHome, query: "Beta", limit: 10 });
  const rebuild = await runRebuildIndex({ codexHome });
  const after = await runHistoryDoctor({ codexHome });
  const status = await getStatus({ codexHome });

  await fs.writeFile(path.join(codexHome, "session_index.jsonl"), "", "utf8");
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json"), `${JSON.stringify({
    "electron-saved-workspace-roots": [workspaceA, workspaceB],
    "project-order": [workspaceA, workspaceB],
    "active-workspace-roots": [workspaceA]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(codexHome, ".codex-global-state.json.bak"), `${JSON.stringify({
    "electron-saved-workspace-roots": [workspaceA, workspaceB],
    "project-order": [workspaceA, workspaceB],
    "active-workspace-roots": [workspaceA]
  }, null, 2)}\n`, "utf8");
  await writeRollout(archivedPath, "thread-beta", "apigather", workspaceB, "Beta session");
  const resetDb = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  try {
    resetDb.exec("DELETE FROM threads");
    const stmt = resetDb.prepare("INSERT INTO threads (id, model_provider, cwd, source, archived, first_user_message, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run("thread-alpha", "openai", workspaceA, "cli", 0, "hello from alpha", 2000);
    stmt.run("thread-beta", "apigather", workspaceB, "cli", 1, "hello from beta", 1000);
  } finally {
    resetDb.close();
  }

  await simulateAuthAndChannelSwitch(codexHome);
  const guardResult = await runGuardOnce(codexHome);
  const afterGuard = await runHistoryDoctor({ codexHome });
  const guardStatus = await getStatus({ codexHome });

  assert.equal(sync.targetProvider, "codex");
  assert.equal(sync.changedSessionFiles, 2);
  assert.ok(sync.sqliteRowsUpdated >= 2);
  assert.equal(repair.changed, true);
  assert.equal(fallbackBeforeRebuild.length, 1);
  assert.equal(fallbackBeforeRebuild[0].id, "thread-beta");
  assert.equal(fallbackBeforeRebuild[0].source, "rollout_scan");
  assert.equal(rebuild.entryCount, 2);
  assert.equal(after.sessionIndexCount, 2);
  assert.equal(after.missingActiveRoots.length, 0);
  assert.equal(after.historyVisibility.severity, "ok");
  assert.deepEqual(status.rolloutCounts.sessions, { codex: 1 });
  assert.deepEqual(status.rolloutCounts.archived_sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.sessions, { codex: 1 });
  assert.deepEqual(status.sqliteCounts.archived_sessions, { codex: 1 });
  assert.equal(typeof status.historyVisibility.summary, "string");
  assert.equal(Array.isArray(status.historyVisibility.steps), true);
  assert.ok(guardResult.actions.some((action) => action.type === "rebuild-index" && action.entryCount === 2));
  assert.ok(guardResult.actions.some((action) => action.type === "repair-sidebar" && action.changed === true));
  assert.ok(guardResult.actions.some((action) => action.type === "sync" && action.provider === "codex"));
  assert.equal(afterGuard.historyVisibility.severity, "ok");
  assert.deepEqual(guardStatus.rolloutCounts.sessions, { codex: 1 });
  assert.deepEqual(guardStatus.rolloutCounts.archived_sessions, { codex: 1 });
  assert.deepEqual(guardStatus.sqliteCounts.sessions, { codex: 1 });
  assert.deepEqual(guardStatus.sqliteCounts.archived_sessions, { codex: 1 });

  await fs.mkdir(artifactDir, { recursive: true });
  const summary = {
    codexHome,
    snapshotDir: snapshot.snapshotDir,
    before: {
      rolloutFileCount: before.rolloutFileCount,
      sessionIndexCount: before.sessionIndexCount,
      missingActiveRoots: before.missingActiveRoots.length
    },
    after: {
      currentProvider: status.currentProvider,
      rolloutCounts: status.rolloutCounts,
      sqliteCounts: status.sqliteCounts,
      sessionIndexCount: after.sessionIndexCount,
      missingActiveRoots: after.missingActiveRoots.length
    },
    afterGuard: {
      currentProvider: guardStatus.currentProvider,
      rolloutCounts: guardStatus.rolloutCounts,
      sqliteCounts: guardStatus.sqliteCounts,
      sessionIndexCount: afterGuard.sessionIndexCount,
      missingActiveRoots: afterGuard.missingActiveRoots.length
    },
    actions: {
      changedSessionFiles: sync.changedSessionFiles,
      sqliteRowsUpdated: sync.sqliteRowsUpdated,
      repairChanged: repair.changed,
      rebuiltIndexEntries: rebuild.entryCount,
      fallbackSource: fallbackBeforeRebuild[0]?.source ?? null,
      guardActions: guardResult.actions
    }
  };
  const summaryPath = path.join(artifactDir, "validation-summary.json");
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("History continuity validation passed.");
  console.log(`Summary: ${summaryPath}`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}


#!/usr/bin/env node

import path from "node:path";

import { DEFAULT_BACKUP_RETENTION_COUNT } from "./constants.js";
import { startBridgeServer } from "./bridge.js";
import { installWindowsLauncher } from "./launcher.js";
import {
  getStatus,
  renderStatus,
  runHistoryDoctor,
  runPruneBackups,
  runRebuildIndex,
  runRepairSidebar,
  runResumeFallback,
  runRestore,
  runRestoreLatest,
  runSnapshot,
  runStartGuard,
  runStopGuard,
  runTakeoverInstall,
  runTakeoverRemove,
  runTakeoverStatus,
  runGuardStatus,
  runInstallUpdate,
  runMoveSession,
  runSwitch,
  runSync,
  runWatchGuard
} from "./service.js";

function printHelp() {
  console.log(`codex-pro

Usage:
  codex-pro status [--codex-home PATH]
  codex-pro sync [--provider ID] [--keep N] [--codex-home PATH]
  codex-pro doctor [--codex-home PATH]
  codex-pro snapshot [--codex-home PATH]
  codex-pro switch-safe [--codex-home PATH]
  codex-pro repair-sidebar [--dry-run] [--codex-home PATH]
  codex-pro rebuild-index [--codex-home PATH]
  codex-pro move-session --session-id ID --target-cwd PATH [--dry-run] [--codex-home PATH]
  codex-pro resume-fallback [--query TEXT] [--limit N] [--codex-home PATH]
  codex-pro start-guard [--codex-home PATH]
  codex-pro stop-guard
  codex-pro guard-status
  codex-pro restore-latest [--codex-home PATH]
  codex-pro watch [--codex-home PATH] [--interval-ms N]
  codex-pro bridge [--codex-home PATH] [--port N]
  codex-pro check-update
  codex-pro update [--version VERSION]
  codex-pro install-update [--version VERSION]
  codex-pro takeover-install [--desktop-path PATH] [--start-menu-path PATH]
  codex-pro takeover-remove
  codex-pro takeover-status [--desktop-path PATH] [--start-menu-path PATH]
  codex-pro install-windows-launcher [--dir PATH] [--codex-home PATH]

Legacy compatibility aliases:
  codex-guard status [--codex-home PATH]
  codex-guard repair-sidebar [--dry-run] [--codex-home PATH]
  codex-guard rebuild-index [--codex-home PATH]
  codex-history status [--codex-home PATH]
  codex-history repair-sidebar [--dry-run] [--codex-home PATH]
  codex-history rebuild-index [--codex-home PATH]
  codex-provider status [--codex-home PATH]
  codex-provider sync [--provider ID] [--keep N] [--codex-home PATH]
  codex-provider switch <provider-id> [--keep N] [--codex-home PATH]
  codex-provider prune-backups [--keep N] [--codex-home PATH]
  codex-provider restore <backup-dir> [--no-config] [--no-db] [--no-sessions] [--codex-home PATH]
  codex-provider install-windows-launcher [--dir PATH] [--codex-home PATH]
`);
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const [flagName, inlineValue] = value.split("=", 2);
    const normalizedName = flagName.slice(2);
    if (inlineValue !== undefined) {
      flags[normalizedName] = inlineValue;
      continue;
    }
    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      flags[normalizedName] = nextValue;
      index += 1;
    } else {
      flags[normalizedName] = true;
    }
  }

  return { positionals, flags };
}

function printMaybeJson(result, flags, formatter) {
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return true;
  }
  console.log(formatter(result));
  return true;
}

function summarizeSync(result, label) {
  const lines = [
    `${label} provider: ${result.targetProvider}`,
    `Codex home: ${result.codexHome}`,
    `Backup: ${result.backupDir}`,
    `Backup creation time: ${formatDuration(result.backupDurationMs ?? 0)}`,
    `Updated rollout files: ${result.changedSessionFiles}`,
    `Updated SQLite rows: ${result.sqliteRowsUpdated}${result.sqlitePresent ? "" : " (state_5.sqlite not found)"}`
  ];
  if (result.sqliteUserEventRowsUpdated) {
    lines.push(`Updated SQLite user-event flags: ${result.sqliteUserEventRowsUpdated}`);
  }
  if (result.sqliteCwdRowsUpdated) {
    lines.push(`Updated SQLite cwd paths: ${result.sqliteCwdRowsUpdated}`);
  }
  if (result.updatedWorkspaceRoots) {
    lines.push(`Updated workspace roots: ${result.updatedWorkspaceRoots}`);
  }
  if (result.skippedLockedRolloutFiles?.length) {
    const preview = result.skippedLockedRolloutFiles.slice(0, 5).join(", ");
    const extraCount = result.skippedLockedRolloutFiles.length - Math.min(result.skippedLockedRolloutFiles.length, 5);
    lines.push(`Skipped locked rollout files: ${result.skippedLockedRolloutFiles.length}`);
    lines.push(`Locked file(s): ${preview}${extraCount > 0 ? ` (+${extraCount} more)` : ""}`);
  }
  if (result.encryptedContentWarning) {
    lines.push(result.encryptedContentWarning);
  }
  if (result.autoPruneResult) {
    lines.push(
      `Backup cleanup: deleted ${result.autoPruneResult.deletedCount}, remaining ${result.autoPruneResult.remainingCount}, freed ${formatBytes(result.autoPruneResult.freedBytes)}`
    );
  }
  if (result.autoPruneWarning) {
    lines.push(`Backup cleanup warning: ${result.autoPruneWarning}`);
  }
  return lines.join("\n");
}

function summarizePrune(result) {
  return [
    `Backup root: ${result.backupRoot}`,
    `Deleted backups: ${result.deletedCount}`,
    `Remaining backups: ${result.remainingCount}`,
    `Freed space: ${formatBytes(result.freedBytes)}`
  ].join("\n");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return unitIndex === 0 ? `${bytes} B` : `${value.toFixed(value >= 10 ? 1 : 2).replace(/\.0$/, "")} ${units[unitIndex]}`;
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs ?? 0))} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2).replace(/\.0$/, "")} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - (minutes * 60);
  return `${minutes}m ${remainingSeconds.toFixed(remainingSeconds >= 10 ? 0 : 1).replace(/\.0$/, "")}s`;
}

function summarizeHistoryDoctor(result) {
  const diagnosisStatus = result.injectionDiagnosis?.status ?? "(unknown)";
  const diagnosisSavedAt = result.injectionDiagnosis?.saved_at ?? "(never)";
  return [
    `Current provider: ${result.currentProvider}`,
    `Configured providers: ${result.configuredProviders.join(", ")}`,
    `Rollout files: ${result.rolloutFileCount}`,
    `Session index entries: ${result.sessionIndexCount}`,
    `Saved workspace roots: ${result.savedWorkspaceRootCount}`,
    `Active workspace roots: ${result.activeWorkspaceRootCount}`,
    `Missing active roots: ${result.missingActiveRoots.length}`,
    `Backups: ${result.backupSummary.count}`,
    `History visibility: ${result.historyVisibility?.summary ?? "历史状态看起来正常。"}`,
    `Injection diagnosis: ${diagnosisStatus}`,
    `Diagnosis time: ${diagnosisSavedAt}`,
    `Diagnosis cache: ${result.injectionDiagnosisPath}`,
    `UI integration mode: ${result.uiIntegrationMode}`,
    `Recovery summary: ${result.recoverySummary}`,
    `Recommended action: ${result.recommendedAction}`
  ].join("\n");
}

function summarizeRepairSidebar(result) {
  return [
    `State file: ${result.statePath}`,
    `Changed: ${result.changed ? "yes" : "no"}`,
    `Saved workspace roots: ${result.savedWorkspaceRoots}`,
    `Active workspace roots before repair: ${result.activeWorkspaceRoots}`,
    `Missing active roots before repair: ${result.missingActiveRoots.length}`,
    result.syncResult ? `Workspace root sync updated: ${result.syncResult.updated ? "yes" : "no"}` : "Workspace root sync updated: dry-run"
  ].join("\n");
}

function summarizeRebuildIndex(result) {
  return [
    `Session index: ${result.indexPath}`,
    `Rebuilt entries: ${result.entryCount}`
  ].join("\n");
}

function summarizeMoveSession(result) {
  if (result.status === "not_found") {
    return result.message;
  }
  if (result.status === "dry_run") {
    return [
      `Dry run: yes`,
      `Session: ${result.session_id}`,
      `Target cwd: ${result.target_cwd}`,
      `Previous cwd: ${result.previous_cwd || "(missing)"}`,
      `Rollout files to update: ${result.rolloutFilesToUpdate}`,
      `SQLite rows to update: ${result.sqliteRowsToUpdate}`,
      `Session index entries to update: ${result.indexEntriesToUpdate}`,
      `Workspace root update needed: ${result.workspaceRootToUpdate ? "yes" : "no"}`
    ].join("\n");
  }
  return [
    `Session: ${result.session_id}`,
    `Moved to: ${result.target_cwd}`,
    `Previous cwd: ${result.previous_cwd || "(missing)"}`,
    `Updated rollout files: ${result.updatedRolloutFiles}`,
    `Updated SQLite rows: ${result.sqliteRowsUpdated}`,
    `Updated session index entries: ${result.indexEntriesUpdated}`,
    `Workspace root updated: ${result.workspaceRootUpdated ? "yes" : "no"}`,
    `Undo token: ${result.undo_token}`,
    ...(result.skippedRolloutFiles?.length ? [`Skipped rollout files: ${result.skippedRolloutFiles.length}`] : [])
  ].join("\n");
}

function summarizeResumeFallback(entries) {
  if (!entries.length) {
    return "No matching sessions found.";
  }
  return entries
    .map((entry) => `${entry.updated_at}  ${entry.thread_name}  (${entry.id})  [${entry.source_label ?? entry.source ?? "unknown"}]`)
    .join("\n");
}

function summarizeGuardStatus(result) {
  const diagnosisStatus = result.diagnosis?.status ?? "(unknown)";
  const diagnosisSavedAt = result.diagnosis?.saved_at ?? "(never)";
  const diagnosisMessage = result.diagnosis?.message ?? "尚未执行注入诊断。";
  return [
    `Task name: ${result.taskName}`,
    `Running: ${result.running ? "yes" : "no"}`,
    `PID: ${result.pid ?? "(none)"}`,
    `Last run: ${result.state?.lastRunAt ?? "(never)"}`,
    `Last snapshot: ${result.state?.snapshotDir ?? "(none)"}`,
    `Log: ${result.logPath}`,
    `Injection diagnosis: ${diagnosisStatus}`,
    `Diagnosis time: ${diagnosisSavedAt}`,
    `Diagnosis cache: ${result.diagnosisPath}`,
    `Diagnosis message: ${diagnosisMessage}`
  ].join("\n");
}

function summarizeTakeoverStatus(result) {
  return [
    `Enabled: ${result.enabled ? "yes" : "no"}`,
    `Mode: ${result.mode}`,
    `Desktop Codex shortcut: ${result.desktopShortcutPath ?? "(not found)"}`,
    `Desktop taken over: ${result.desktopTakenOver ? "yes" : "no"}`,
    `Start menu Codex shortcut: ${result.startMenuShortcutPath ?? "(not found)"}`,
    `Start menu taken over: ${result.startMenuTakenOver ? "yes" : "no"}`,
    `Maintenance-only fallback: ${result.maintenanceOnly ? "yes" : "no"}`,
    `Takeover state: ${result.statePath}`,
    `Takeover PowerShell launcher: ${result.launchers?.ps1Path ?? "(none)"}`,
    `Takeover launcher: ${result.launchers?.vbsPath ?? "(none)"}`
  ].join("\n");
}

function summarizeUpdateResult(result) {
  const lines = [
    `Status: ${result.status}`,
    `Current version: ${result.currentVersion ?? "(unknown)"}`
  ];
  if (result.latestVersion) {
    lines.push(`Latest version: ${result.latestVersion}`);
  }
  if (typeof result.installPerformed === "boolean") {
    lines.push(`Installed: ${result.installPerformed ? "yes" : "no"}`);
  }
  if (typeof result.guardStopped === "boolean") {
    lines.push(`Guard stopped before update: ${result.guardStopped ? "yes" : "no"}`);
  }
  if (result.nextAction) {
    lines.push(`Next action: ${result.nextAction}`);
  }
  lines.push(`Message: ${result.message}`);
  return lines.join("\n");
}

const SYNC_PROGRESS_STAGES = [
  ["scan_rollout_files", "Scanning rollout files..."],
  ["check_locked_rollout_files", "Checking locked rollout files..."],
  ["create_backup", "Creating backup..."],
  ["update_sqlite", "Updating SQLite..."],
  ["rewrite_rollout_files", "Rewriting rollout files..."],
  ["clean_backups", "Cleaning backups..."]
];

const SYNC_PROGRESS_STAGE_INDEX = new Map(
  SYNC_PROGRESS_STAGES.map(([stage], index) => [stage, index + 1])
);

function createSyncProgressReporter() {
  return (event) => {
    if (event?.stage === "update_config" && event.status === "start") {
      console.log(`Updating config.toml root model_provider to ${event.provider}...`);
      return;
    }

    const stageIndex = SYNC_PROGRESS_STAGE_INDEX.get(event?.stage);
    if (!stageIndex || event.status !== "start") {
      if (event?.stage === "create_backup" && event.status === "complete") {
        console.log(`     Backup created in ${formatDuration(event.durationMs)}: ${event.backupDir}`);
      }
      return;
    }

    console.log(`[${stageIndex}/${SYNC_PROGRESS_STAGES.length}] ${SYNC_PROGRESS_STAGES[stageIndex - 1][1]}`);
  };
}

function parseKeepCount(rawValue, { allowZero = false } = {}) {
  if (rawValue === undefined) {
    return DEFAULT_BACKUP_RETENTION_COUNT;
  }
  const normalized = String(rawValue).trim();
  if (!/^\d+$/.test(normalized)) {
    const minimum = allowZero ? 0 : 1;
    throw new Error(`Invalid --keep value: ${rawValue}. Expected an integer greater than or equal to ${minimum}.`);
  }
  const keepCount = Number.parseInt(normalized, 10);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(keepCount) || keepCount < minimum) {
    throw new Error(`Invalid --keep value: ${rawValue}. Expected an integer greater than or equal to ${minimum}.`);
  }
  return keepCount;
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const argv0 = path.basename(process.argv[1] ?? "");
  let namespace = (argv0.includes("codex-pro") || argv0.includes("codex-guard") || argv0.includes("codex-history")) ? "codex-pro" : "codex-provider";
  let command = positionals[0];

  if (command === "codex-pro" || command === "codex-guard" || command === "codex-history" || command === "codex-provider") {
    namespace = command === "codex-provider" ? "codex-provider" : "codex-pro";
    command = positionals[1];
  }

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  if (namespace === "codex-pro") {
    if (command === "doctor") {
      const result = await runHistoryDoctor({ codexHome: flags["codex-home"] });
      printMaybeJson(result, flags, summarizeHistoryDoctor);
      return;
    }

    if (command === "snapshot" || command === "switch-safe") {
      const result = await runSnapshot({ codexHome: flags["codex-home"] });
      console.log(`Snapshot created: ${result.snapshotDir}`);
      return;
    }

    if (command === "repair-sidebar") {
      const result = await runRepairSidebar({
        codexHome: flags["codex-home"],
        dryRun: Boolean(flags["dry-run"])
      });
      console.log(summarizeRepairSidebar(result));
      return;
    }

    if (command === "rebuild-index") {
      const result = await runRebuildIndex({ codexHome: flags["codex-home"] });
      console.log(summarizeRebuildIndex(result));
      return;
    }

    if (command === "move-session") {
      const result = await runMoveSession({
        codexHome: flags["codex-home"],
        threadId: flags["session-id"] ?? flags.id,
        targetCwd: flags["target-cwd"],
        dryRun: Boolean(flags["dry-run"])
      });
      printMaybeJson(result, flags, summarizeMoveSession);
      return;
    }

    if (command === "resume-fallback") {
      const limit = flags.limit ? Number.parseInt(String(flags.limit), 10) : undefined;
      const result = await runResumeFallback({
        codexHome: flags["codex-home"],
        query: flags.query,
        limit
      });
      console.log(summarizeResumeFallback(result));
      return;
    }

    if (command === "start-guard") {
      const result = await runStartGuard({
        codexHome: flags["codex-home"],
        cliPath: process.argv[1]
      });
      console.log(result.alreadyRunning
        ? `Guard already running with PID ${result.pid}.`
        : `Guard started with PID ${result.pid}.`);
      return;
    }

    if (command === "stop-guard") {
      const result = await runStopGuard();
      console.log(result.stopped
        ? `Guard stop requested for PID ${result.pid}.`
        : `Guard not stopped: ${result.reason}`);
      return;
    }

    if (command === "guard-status") {
      const result = await runGuardStatus();
      printMaybeJson(result, flags, summarizeGuardStatus);
      return;
    }

    if (command === "restore-latest") {
      const result = await runRestoreLatest({ codexHome: flags["codex-home"] });
      console.log(`Restored latest history snapshot for provider ${result.targetProvider}.`);
      return;
    }

    if (command === "watch") {
      const intervalMs = flags["interval-ms"] ? Number.parseInt(String(flags["interval-ms"]), 10) : undefined;
      const result = await runWatchGuard({
        codexHome: flags["codex-home"],
        intervalMs
      });
      console.log(`Guard watching with interval ${result.intervalMs} ms.`);
      return;
    }

    if (command === "bridge") {
      const port = flags.port ? Number.parseInt(String(flags.port), 10) : 8765;
      const authToken = typeof flags["auth-token"] === "string"
        ? String(flags["auth-token"]).trim()
        : typeof process.env.CODEX_PRO_BRIDGE_TOKEN === "string"
          ? process.env.CODEX_PRO_BRIDGE_TOKEN.trim()
          : "";
      await startBridgeServer({
        codexHome: flags["codex-home"],
        port,
        authToken
      });
      console.log(`History bridge listening on http://127.0.0.1:${port}`);
      await new Promise(() => {});
      return;
    }

    if (command === "check-update") {
      const result = await runCheckUpdate();
      printMaybeJson(result, flags, summarizeUpdateResult);
      return;
    }

    if (command === "update" || command === "install-update") {
      const result = await runInstallUpdate({
        version: typeof flags.version === "string" ? flags.version : undefined
      });
      printMaybeJson(result, flags, summarizeUpdateResult);
      return;
    }

    if (command === "takeover-install") {
      const result = await runTakeoverInstall({
        desktopPath: flags["desktop-path"],
        startMenuPath: flags["start-menu-path"]
      });
      console.log(`Takeover mode: ${result.mode}`);
      console.log(`Desktop Codex shortcut: ${result.desktopShortcut ?? "(not found)"}`);
      console.log(`Start menu Codex shortcut: ${result.startMenuShortcut ?? "(not found)"}`);
      console.log(`Takeover PowerShell launcher: ${result.launcherPs1Path}`);
      console.log(`Takeover launcher: ${result.launcherVbsPath}`);
      return;
    }

    if (command === "takeover-remove") {
      const result = await runTakeoverRemove();
      console.log(`Restored desktop Codex shortcut: ${result.restoredDesktop ? "yes" : "no"}`);
      console.log(`Restored start menu Codex shortcut: ${result.restoredStartMenu ? "yes" : "no"}`);
      console.log(`Removed takeover state: ${result.removedState ? "yes" : "no"}`);
      return;
    }

    if (command === "takeover-status") {
      const result = await runTakeoverStatus({
        desktopPath: flags["desktop-path"],
        startMenuPath: flags["start-menu-path"]
      });
      printMaybeJson(result, flags, summarizeTakeoverStatus);
      return;
    }
  }

  if (command === "status") {
    const status = await getStatus({ codexHome: flags["codex-home"] });
    console.log(renderStatus(status));
    return;
  }

  if (command === "sync") {
    const result = await runSync({
      codexHome: flags["codex-home"],
      provider: flags.provider,
      keepCount: parseKeepCount(flags.keep),
      onProgress: createSyncProgressReporter()
    });
    console.log(summarizeSync(result, "Synchronized"));
    return;
  }

  if (command === "switch") {
    const provider = positionals[1] ?? flags.provider;
    const result = await runSwitch({
      codexHome: flags["codex-home"],
      provider,
      keepCount: parseKeepCount(flags.keep),
      onProgress: createSyncProgressReporter()
    });
    console.log(summarizeSync(result, "Switched to"));
    return;
  }

  if (command === "prune-backups") {
    const result = await runPruneBackups({
      codexHome: flags["codex-home"],
      keepCount: parseKeepCount(flags.keep, { allowZero: true })
    });
    console.log(summarizePrune(result));
    return;
  }

  if (command === "restore") {
    const backupDir = positionals[1] ?? flags.backup;
    const result = await runRestore({
      codexHome: flags["codex-home"],
      backupDir,
      restoreConfig: !flags["no-config"],
      restoreDatabase: !flags["no-db"],
      restoreSessions: !flags["no-sessions"]
    });
    console.log(`Restored backup from ${path.resolve(backupDir)}`);
    console.log(`Codex home: ${result.codexHome}`);
    console.log(`Provider at backup time: ${result.targetProvider}`);
    return;
  }

  if (command === "install-windows-launcher") {
    const result = await installWindowsLauncher({
      dir: flags.dir,
      codexHome: flags["codex-home"]
    });
    console.log("Installed Windows launcher files:");
    console.log(`  Hidden double-click launcher: ${result.vbsPath}`);
    console.log(`  Visible console launcher: ${result.cmdPath}`);
    console.log(`  Target directory: ${result.targetDir}`);
    if (result.codexHome) {
      console.log(`  Fixed CODEX_HOME: ${result.codexHome}`);
    } else {
      console.log("  CODEX_HOME: default current environment / ~/.codex");
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

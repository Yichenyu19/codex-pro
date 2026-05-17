import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_BACKUP_RETENTION_COUNT,
  DEFAULT_PROVIDER,
  defaultBackupRoot,
  defaultCodexHome,
  defaultHistoryBackupRoot
} from "./constants.js";
import {
  configDeclaresProvider,
  listConfiguredProviderIds,
  readConfigText,
  readCurrentProviderFromConfigText,
  setRootProviderInConfigText,
  writeConfigText
} from "./config-file.js";
import {
  createBackup,
  getBackupSummary,
  pruneBackups,
  restoreBackup,
  restoreGlobalStateFilesFromBackup,
  updateSessionBackupManifest
} from "./backup.js";
import { acquireLock } from "./locking.js";
import {
  applySessionChanges,
  collectSessionChanges,
  restoreSessionChanges,
  splitLockedSessionChanges,
  summarizeProviderCounts
} from "./session-files.js";
import {
  assertSqliteWritable,
  readSqliteProviderCounts,
  readSqliteRepairStats,
  updateSqliteThreadCwd,
  updateSqliteProvider
} from "./sqlite-state.js";
import {
  ensureWorkspaceRoot,
  readProjectThreadVisibility,
  readThreadCwdStats,
  syncWorkspaceRoots
} from "./workspace-roots.js";
import {
  createHistorySnapshot,
  doctorHistory,
  rebuildHistoryIndex,
  repairSidebarVisibility,
  restoreHistorySnapshot
} from "./history-guard.js";
import { findSessionCandidates } from "./session-index.js";
import {
  getGuardStatus,
  runGuardLoop,
  startGuard,
  stopGuard
} from "./guard.js";
import {
  deleteSessionFromSqlite,
  findRolloutPathsByThreadId,
  removeSessionIndexEntry
} from "./delete-session.js";
import {
  applySessionMoveChanges,
  collectSessionMoveChanges,
  updateSessionIndexCwd
} from "./move-session.js";
import { exportSessionMarkdown } from "./export-session.js";
import { exportHandoff } from "./handoff.js";
import { checkForUpdate, readLocalPackageVersion } from "./update-check.js";
import { installAvailableUpdate } from "./update-install.js";
import {
  getTakeoverStatus,
  installTakeover,
  removeTakeover
} from "./takeover.js";
import {
  buildHistoryRecoveryPlan,
  buildHistoryVisibility,
  buildProductState
} from "./product-state.js";

const execFileAsync = promisify(execFile);

function normalizeCodexHome(explicitCodexHome) {
  return path.resolve(explicitCodexHome ?? process.env.CODEX_HOME ?? defaultCodexHome());
}

function startMenuProgramsRoot() {
  return process.env.CODEX_PRO_START_MENU_PATH
    ? path.resolve(process.env.CODEX_PRO_START_MENU_PATH)
    : process.env.CODEX_HISTORY_GUARD_START_MENU_PATH
    ? path.resolve(process.env.CODEX_HISTORY_GUARD_START_MENU_PATH)
    : path.join(process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs");
}

function desktopDir() {
  return process.env.CODEX_PRO_DESKTOP_PATH
    ? path.resolve(process.env.CODEX_PRO_DESKTOP_PATH)
    : process.env.CODEX_HISTORY_GUARD_DESKTOP_PATH
    ? path.resolve(process.env.CODEX_HISTORY_GUARD_DESKTOP_PATH)
    : path.join(process.env.USERPROFILE ?? os.homedir(), "Desktop");
}

function productStartMenuDir() {
  return path.join(startMenuProgramsRoot(), "Codex Pro");
}

function quickStartSourcePath() {
  return path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs", "quick-start-zh.txt");
}

function toWindowsPath(value) {
  return process.platform === "win32"
    ? value.replaceAll("/", "\\")
    : value;
}

async function openLocalPath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (process.platform === "win32") {
    await execFileAsync("pwsh", [
      "-NoProfile",
      "-Command",
      "Start-Process",
      "-FilePath",
      resolved
    ]);
    return { ok: true, path: toWindowsPath(resolved) };
  }
  throw new Error(`open-path is not supported on ${process.platform}`);
}

async function ensureCodexHome(codexHome) {
  await fs.access(codexHome);
}

function formatCounts(counts) {
  return Object.entries(counts ?? {})
    .map(([provider, count]) => `${provider}: ${count}`)
    .join(", ") || "(none)";
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

function emitProgress(onProgress, event) {
  if (typeof onProgress === "function") {
    onProgress(event);
  }
}

function sumCounts(counts) {
  return Object.values(counts ?? {}).reduce((total, value) => total + value, 0);
}

function buildEncryptedContentWarning(encryptedContentCounts, targetProvider) {
  const riskyProviders = new Set();
  for (const scope of ["sessions", "archived_sessions"]) {
    for (const [provider, count] of Object.entries(encryptedContentCounts?.[scope] ?? {})) {
      if (count > 0 && provider !== targetProvider) {
        riskyProviders.add(provider);
      }
    }
  }
  const total = sumCounts(encryptedContentCounts?.sessions) + sumCounts(encryptedContentCounts?.archived_sessions);
  if (riskyProviders.size === 0) {
    return null;
  }
  return `Encrypted content warning: ${total} rollout file(s) contain encrypted_content from provider(s) ${[...riskyProviders].sort().join(", ")}. Visibility metadata can be synchronized to ${targetProvider}, but continuing or compacting those histories may fail with invalid_encrypted_content. Return to the original provider/account or start a new session if you need reliable continuation.`;
}

export async function getStatus({ codexHome: explicitCodexHome, history: precomputedHistory } = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const configPath = path.join(codexHome, "config.toml");
  const configText = await readConfigText(configPath);
  const current = readCurrentProviderFromConfigText(configText);
  const configuredProviders = listConfiguredProviderIds(configText);
  const {
    providerCounts,
    encryptedContentCounts,
    lockedPaths,
    userEventThreadIds,
    threadCwdById
  } = await collectSessionChanges(codexHome, "__status_only__", { skipLockedReads: true });
  const sqliteCounts = await readSqliteProviderCounts(codexHome);
  const sqliteRepairStats = sqliteCounts && !sqliteCounts.unreadable
    ? await readSqliteRepairStats(codexHome, { userEventThreadIds, threadCwdById })
    : null;
  const projectThreadVisibility = sqliteCounts?.unreadable
    ? []
    : await readProjectThreadVisibility(codexHome);
  const backupSummary = await getBackupSummary(codexHome);
  const history = precomputedHistory ?? await doctorHistory(codexHome);
  const historyVisibility = buildHistoryVisibility(history, {
    currentProvider: current.provider,
    rolloutCounts: summarizeProviderCounts(providerCounts),
    sqliteCounts,
    sqliteRepairStats
  });
  const productState = buildProductState({ historyVisibility });
  const rolloutCounts = summarizeProviderCounts(providerCounts);

  return {
    codexHome,
    currentProvider: current.provider,
    currentProviderImplicit: current.implicit,
    configuredProviders,
    rolloutCounts,
    lockedRolloutFiles: lockedPaths,
    encryptedContentCounts,
    encryptedContentWarning: buildEncryptedContentWarning(encryptedContentCounts, current.provider ?? DEFAULT_PROVIDER),
    sqliteCounts,
    sqliteRepairStats,
    projectThreadVisibility,
    backupRoot: defaultBackupRoot(codexHome),
    backupSummary,
    historyVisibility,
    productState
  };
}

export function renderStatus(status) {
  const lines = [
    `Codex home: ${status.codexHome}`,
    `Current provider: ${status.currentProvider}${status.currentProviderImplicit ? " (implicit default)" : ""}`,
    `Configured providers: ${status.configuredProviders.join(", ")}`,
    `Product state: ${status.productState?.label ?? "未知"}`,
    `History visibility: ${status.historyVisibility?.summary ?? "历史状态看起来正常。"}`,
    `Backups: ${status.backupSummary.count} (${formatBytes(status.backupSummary.totalBytes)})`,
    `Backup root: ${status.backupRoot}`
  ];

  lines.push("");
  lines.push("Rollout files:");
  lines.push(`  sessions: ${formatCounts(status.rolloutCounts.sessions)}`);
  lines.push(`  archived_sessions: ${formatCounts(status.rolloutCounts.archived_sessions)}`);
  if (status.encryptedContentCounts) {
    lines.push(`  encrypted_content sessions: ${formatCounts(status.encryptedContentCounts.sessions)}`);
    lines.push(`  encrypted_content archived_sessions: ${formatCounts(status.encryptedContentCounts.archived_sessions)}`);
  }
  if (status.encryptedContentWarning) {
    lines.push(`  ${status.encryptedContentWarning}`);
  }
  if (status.lockedRolloutFiles?.length) {
    lines.push(`  Locked rollout files skipped during status scan: ${status.lockedRolloutFiles.length}`);
  }

  lines.push("");
  lines.push("SQLite state:");
  if (status.sqliteCounts?.unreadable) {
    lines.push(`  ${status.sqliteCounts.error ?? "state_5.sqlite is malformed or unreadable"}`);
  } else if (!status.sqliteCounts) {
    lines.push("  state_5.sqlite not found");
  } else {
    lines.push(`  sessions: ${formatCounts(status.sqliteCounts.sessions)}`);
    lines.push(`  archived_sessions: ${formatCounts(status.sqliteCounts.archived_sessions)}`);
    if (status.sqliteRepairStats?.userEventRowsNeedingRepair) {
      lines.push(`  user-event flags needing repair: ${status.sqliteRepairStats.userEventRowsNeedingRepair}`);
    }
    if (status.sqliteRepairStats?.cwdRowsNeedingRepair) {
      lines.push(`  cwd paths needing repair: ${status.sqliteRepairStats.cwdRowsNeedingRepair}`);
    }
  }

  if (status.projectThreadVisibility?.length) {
    lines.push("");
    lines.push("Project visibility:");
    for (const project of status.projectThreadVisibility) {
      const providers = formatCounts(project.providerCounts);
      const rankText = project.rankPreview || "(none)";
      lines.push(
        `  ${project.root}: interactive ${project.interactiveThreads}, first page ${project.firstPageThreads}/50, ranks ${rankText}, exact cwd ${project.exactCwdMatches}/${project.interactiveThreads}, verbatim cwd ${project.verbatimCwdRows}, providers ${providers}`
      );
    }
  }

  return lines.join("\n");
}

export async function runSync({
  codexHome: explicitCodexHome,
  provider,
  configBackupText,
  keepCount = DEFAULT_BACKUP_RETENTION_COUNT,
  sqliteBusyTimeoutMs,
  onProgress
} = {}) {
  if (!Number.isInteger(keepCount) || keepCount < 1) {
    throw new Error(`Invalid automatic keep count: ${keepCount}. Expected an integer greater than or equal to 1.`);
  }

  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const configPath = path.join(codexHome, "config.toml");
  const configText = await readConfigText(configPath);
  const current = readCurrentProviderFromConfigText(configText);
  const targetProvider = provider ?? current.provider ?? DEFAULT_PROVIDER;

  const releaseLock = await acquireLock(codexHome, "sync");
  let backupDir = null;
  let backupDurationMs = 0;
  try {
    emitProgress(onProgress, { stage: "scan_rollout_files", status: "start" });
    const {
      changes,
      lockedPaths: lockedReadPaths,
      providerCounts,
      encryptedContentCounts,
      userEventThreadIds,
      threadCwdById
    } = await collectSessionChanges(codexHome, targetProvider, { skipLockedReads: true });
    const cwdStats = await readThreadCwdStats(codexHome);
    const encryptedContentWarning = buildEncryptedContentWarning(encryptedContentCounts, targetProvider);
    emitProgress(onProgress, {
      stage: "scan_rollout_files",
      status: "complete",
      scannedChanges: changes.length,
      lockedReadCount: lockedReadPaths.length
    });

    emitProgress(onProgress, { stage: "check_locked_rollout_files", status: "start" });
    const {
      writableChanges,
      lockedChanges
    } = await splitLockedSessionChanges(changes);
    emitProgress(onProgress, {
      stage: "check_locked_rollout_files",
      status: "complete",
      writableCount: writableChanges.length,
      lockedCount: lockedChanges.length + lockedReadPaths.length
    });

    const skippedRolloutFiles = [...new Set([
      ...lockedReadPaths,
      ...lockedChanges.map((change) => change.path)
    ])].sort((left, right) => left.localeCompare(right));
    await assertSqliteWritable(codexHome, { busyTimeoutMs: sqliteBusyTimeoutMs });

    emitProgress(onProgress, {
      stage: "create_backup",
      status: "start",
      writableCount: writableChanges.length
    });
    const backupStartedAt = Date.now();
    backupDir = await createBackup({
      codexHome,
      targetProvider,
      sessionChanges: writableChanges,
      configPath,
      configBackupText
    });
    backupDurationMs = Date.now() - backupStartedAt;
    emitProgress(onProgress, {
      stage: "create_backup",
      status: "complete",
      backupDir,
      durationMs: backupDurationMs
    });

    let sessionRestoreNeeded = false;
    let appliedSessionChanges = [];
    let globalStateRestoreNeeded = false;
    let workspaceRootResult = {
      updated: false,
      updatedWorkspaceRoots: 0,
      savedWorkspaceRootCount: 0
    };
    try {
      let applyResult = { appliedChanges: 0, appliedPaths: [], skippedPaths: [] };
      emitProgress(onProgress, { stage: "update_sqlite", status: "start" });
      emitProgress(onProgress, {
        stage: "rewrite_rollout_files",
        status: "start",
        writableCount: writableChanges.length
      });
      const sqliteResult = await updateSqliteProvider(
        codexHome,
        targetProvider,
        async () => {
          if (writableChanges.length > 0) {
            applyResult = await applySessionChanges(writableChanges);
            const appliedPathSet = new Set(applyResult.appliedPaths ?? []);
            appliedSessionChanges = writableChanges.filter((change) => appliedPathSet.has(change.path));
            sessionRestoreNeeded = appliedSessionChanges.length > 0;
            await updateSessionBackupManifest(backupDir, appliedSessionChanges);
          }
          workspaceRootResult = await syncWorkspaceRoots(codexHome, { cwdStats });
          globalStateRestoreNeeded = workspaceRootResult.updated;
        },
        { busyTimeoutMs: sqliteBusyTimeoutMs, userEventThreadIds, threadCwdById }
      );
      emitProgress(onProgress, {
        stage: "rewrite_rollout_files",
        status: "complete",
        appliedChanges: applyResult.appliedChanges,
        skippedChanges: applyResult.skippedPaths.length
      });
      emitProgress(onProgress, {
        stage: "update_sqlite",
        status: "complete",
        updatedRows: sqliteResult.updatedRows
      });
      const skippedLockedRolloutFiles = [...new Set([
        ...skippedRolloutFiles,
        ...applyResult.skippedPaths
      ])].sort((left, right) => left.localeCompare(right));
      let autoPruneResult = null;
      let autoPruneWarning = null;
      emitProgress(onProgress, {
        stage: "clean_backups",
        status: "start",
        keepCount
      });
      try {
        autoPruneResult = await pruneBackups(codexHome, keepCount);
      } catch (pruneError) {
        autoPruneWarning = `Automatic backup cleanup failed: ${pruneError instanceof Error ? pruneError.message : String(pruneError)}`;
      }
      emitProgress(onProgress, {
        stage: "clean_backups",
        status: "complete",
        deletedCount: autoPruneResult?.deletedCount ?? 0,
        warning: autoPruneWarning
      });
      return {
        codexHome,
        targetProvider,
        previousProvider: current.provider,
        backupDir,
        backupDurationMs,
        changedSessionFiles: applyResult.appliedChanges,
        skippedLockedRolloutFiles,
        sqliteRowsUpdated: sqliteResult.updatedRows,
        sqliteProviderRowsUpdated: sqliteResult.providerRowsUpdated,
        sqliteUserEventRowsUpdated: sqliteResult.userEventRowsUpdated,
        sqliteCwdRowsUpdated: sqliteResult.cwdRowsUpdated,
        updatedWorkspaceRoots: workspaceRootResult.updatedWorkspaceRoots,
        savedWorkspaceRootCount: workspaceRootResult.savedWorkspaceRootCount,
        sqlitePresent: sqliteResult.databasePresent,
        rolloutCountsBefore: summarizeProviderCounts(providerCounts),
        encryptedContentCounts,
        encryptedContentWarning,
        autoPruneResult,
        autoPruneWarning
      };
    } catch (error) {
      const restoreFailures = [];
      if (sessionRestoreNeeded) {
        try {
          await restoreSessionChanges(appliedSessionChanges.map((change) => ({
            path: change.path,
            originalFirstLine: change.originalFirstLine,
            originalSeparator: change.originalSeparator
          })));
        } catch (restoreError) {
          restoreFailures.push(`rollout files: ${restoreError.message}`);
        }
      }
      if (globalStateRestoreNeeded && backupDir) {
        try {
          await restoreGlobalStateFilesFromBackup(backupDir, codexHome);
        } catch (restoreError) {
          restoreFailures.push(`global state: ${restoreError.message}`);
        }
      }
      if (restoreFailures.length > 0) {
        throw new Error(
          `Failed to restore state after sync error. Original error: ${error.message}. Restore error: ${restoreFailures.join("; ")}`
        );
      }
      throw error;
    }
  } finally {
    await releaseLock();
  }
}

export async function runSwitch({
  codexHome: explicitCodexHome,
  provider,
  keepCount = DEFAULT_BACKUP_RETENTION_COUNT,
  onProgress
}) {
  if (!provider) {
    throw new Error("Missing provider id. Usage: codex-provider switch <provider-id>");
  }

  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const configPath = path.join(codexHome, "config.toml");
  const originalConfigText = await readConfigText(configPath);
  if (!configDeclaresProvider(originalConfigText, provider)) {
    throw new Error(`Provider "${provider}" is not available in config.toml. Configure it first or use one of: ${listConfiguredProviderIds(originalConfigText).join(", ")}`);
  }

  const nextConfigText = setRootProviderInConfigText(originalConfigText, provider);
  emitProgress(onProgress, {
    stage: "update_config",
    status: "start",
    provider
  });
  await writeConfigText(configPath, nextConfigText);
  emitProgress(onProgress, {
    stage: "update_config",
    status: "complete",
    provider
  });

  try {
    const syncResult = await runSync({
      codexHome,
      provider,
      configBackupText: originalConfigText,
      keepCount,
      onProgress
    });
    return {
      ...syncResult,
      configUpdated: true
    };
  } catch (error) {
    await writeConfigText(configPath, originalConfigText);
    throw error;
  }
}

export async function runRestore({
  codexHome: explicitCodexHome,
  backupDir,
  restoreConfig = true,
  restoreDatabase = true,
  restoreSessions = true
}) {
  if (!backupDir) {
    throw new Error("Missing backup path. Usage: codex-provider restore <backup-dir>");
  }
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "restore");
  try {
    return await restoreBackup(path.resolve(backupDir), codexHome, {
      restoreConfig,
      restoreDatabase,
      restoreSessions
    });
  } finally {
    await releaseLock();
  }
}

export async function runPruneBackups({
  codexHome: explicitCodexHome,
  keepCount = DEFAULT_BACKUP_RETENTION_COUNT
} = {}) {
  if (!Number.isInteger(keepCount) || keepCount < 0) {
    throw new Error(`Invalid keep count: ${keepCount}. Expected a non-negative integer.`);
  }

  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "prune-backups");
  try {
    return await pruneBackups(codexHome, keepCount);
  } finally {
    await releaseLock();
  }
}

export async function runHistoryDoctor({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const history = await doctorHistory(codexHome);
  const [status, guardStatus] = await Promise.all([
    getStatus({ codexHome, history }),
    getGuardStatus()
  ]);
  const recoveryPlan = buildHistoryRecoveryPlan(status.historyVisibility, guardStatus.diagnosis ?? null);
  return {
    ...history,
    currentProvider: status.currentProvider,
    configuredProviders: status.configuredProviders,
    rolloutCounts: status.rolloutCounts,
    sqliteCounts: status.sqliteCounts,
    backupSummary: status.backupSummary,
    projectThreadVisibility: status.projectThreadVisibility,
    historyVisibility: status.historyVisibility,
    productState: recoveryPlan.productState,
    injectionDiagnosis: guardStatus.diagnosis ?? null,
    injectionDiagnosisPath: guardStatus.diagnosisPath,
    uiIntegrationMode: recoveryPlan.uiMode,
    recoverySummary: recoveryPlan.summary,
    recommendedAction: recoveryPlan.primaryAction,
    recoverySteps: recoveryPlan.nextSteps
  };
}

export async function runSnapshot({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "snapshot");
  try {
    return await createHistorySnapshot(codexHome);
  } finally {
    await releaseLock();
  }
}

export async function runRepairSidebar({
  codexHome: explicitCodexHome,
  dryRun = false
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "repair-sidebar");
  try {
    return await repairSidebarVisibility(codexHome, { dryRun });
  } finally {
    await releaseLock();
  }
}

export async function runRebuildIndex({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "rebuild-index");
  try {
    return await rebuildHistoryIndex(codexHome);
  } finally {
    await releaseLock();
  }
}

export async function runResumeFallback({
  codexHome: explicitCodexHome,
  query,
  limit
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const history = await doctorHistory(codexHome);
  const status = await getStatus({ codexHome, history });
  return findSessionCandidates(codexHome, {
    query,
    limit,
    rolloutFileCount: history.rolloutFileCount,
    historyVisibility: status.historyVisibility
  });
}

export async function runExportSessionMarkdown({
  codexHome: explicitCodexHome,
  threadId,
  title
} = {}) {
  if (!threadId) {
    throw new Error("Missing thread id for export-session-markdown.");
  }
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  return exportSessionMarkdown({ codexHome, threadId, title });
}

export async function runExportHandoff({
  codexHome: explicitCodexHome,
  threadId,
  title
} = {}) {
  if (!threadId) {
    throw new Error("Missing thread id for handoff export.");
  }
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  return exportHandoff({ codexHome, threadId, title });
}

export async function runCheckUpdate({
  fetchImpl,
  registryBase,
  timeoutMs
} = {}) {
  const local = await readLocalPackageVersion();
  return checkForUpdate({
    currentVersion: local.version,
    packageName: local.name,
    fetchImpl,
    registryBase,
    timeoutMs
  });
}

export async function runInstallUpdate({
  version,
  fetchImpl,
  registryBase,
  timeoutMs,
  execFileImpl,
  repoRoot
} = {}) {
  const guardStatus = await getGuardStatus().catch(() => ({ running: false }));
  let guardStopped = false;
  if (guardStatus.running) {
    const stopResult = await stopGuard().catch(() => ({ stopped: false }));
    guardStopped = Boolean(stopResult?.stopped);
  }

  const result = await installAvailableUpdate({
    version,
    fetchImpl,
    registryBase,
    timeoutMs,
    execFileImpl,
    repoRoot
  });

  if (result.status === "update_installed") {
    return {
      ...result,
      guardStopped,
      message: guardStopped
        ? `${result.message} 本地守护已暂停，重新打开 Codex 后会重新拉起。`
        : result.message
    };
  }

  return {
    ...result,
    guardStopped
  };
}

export async function runStartGuard({
  codexHome: explicitCodexHome,
  cliPath
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const resolvedCliPath = cliPath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.js");
  return startGuard(codexHome, { cliPath: resolvedCliPath });
}

export async function runStopGuard() {
  return stopGuard();
}

export async function runGuardStatus() {
  return getGuardStatus();
}

export async function getProductManagementStatus({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const guard = await getGuardStatus();
  const startMenuDir = productStartMenuDir();
  const quickStartPath = path.join(startMenuDir, "Quick Start.txt");
  const quickStartExists = await fs.access(quickStartPath).then(() => true).catch(() => false);
  const takeover = await getTakeoverStatus();
  const maintenanceLauncherPath = path.join(desktopDir(), "Codex Pro.cmd");
  return {
    guardRunning: guard.running,
    launcherLogPath: guard.logPath,
    diagnosisPath: guard.diagnosisPath,
    toolDataDir: path.dirname(guard.logPath),
    startMenuDir: toWindowsPath(startMenuDir),
    quickStartPath: toWindowsPath(quickStartPath),
    hasQuickStart: quickStartExists,
    compatibilityMode: guard.diagnosis?.status === "unsupported",
    maintenanceLauncherPath: toWindowsPath(maintenanceLauncherPath),
    takeover
  };
}

export async function runTakeoverInstall({
  desktopPath,
  startMenuPath
} = {}) {
  return installTakeover({
    desktopPath,
    startMenuPath,
    repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  });
}

export async function runTakeoverRemove() {
  return removeTakeover();
}

export async function runTakeoverStatus({
  desktopPath,
  startMenuPath
} = {}) {
  return getTakeoverStatus({
    desktopPath,
    startMenuPath
  });
}

export async function runWatchGuard({
  codexHome: explicitCodexHome,
  intervalMs
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  return runGuardLoop(codexHome, { intervalMs });
}

export async function runRestoreLatest({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const backupRoot = defaultHistoryBackupRoot(codexHome);
  const entries = await fs.readdir(backupRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const latest = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))[0];
  if (!latest) {
    throw new Error("No history snapshots available.");
  }
  const snapshotDir = path.join(backupRoot, latest);
  const releaseLock = await acquireLock(codexHome, "restore-latest");
  try {
    return await restoreHistorySnapshot(codexHome, snapshotDir);
  } finally {
    await releaseLock();
  }
}

export async function runOpenLogDir() {
  const guard = await getGuardStatus();
  return openLocalPath(path.dirname(guard.logPath));
}

export async function runOpenToolDir() {
  return openLocalPath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}

export async function runOpenStartMenuDir() {
  return openLocalPath(productStartMenuDir());
}

export async function runOpenQuickStart({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const startMenuPath = path.join(productStartMenuDir(), "Quick Start.txt");
  const fallbackPath = quickStartSourcePath();
  const quickStartPath = await fs.access(startMenuPath).then(() => startMenuPath).catch(() => fallbackPath);
  return openLocalPath(quickStartPath);
}

export async function getLatestHistorySnapshotInfo({
  codexHome: explicitCodexHome
} = {}) {
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const backupRoot = defaultHistoryBackupRoot(codexHome);
  const entries = await fs.readdir(backupRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const latest = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))[0];
  return latest
    ? {
        snapshotDir: path.join(backupRoot, latest),
        createdAt: latest
      }
    : null;
}

export async function runDeleteSession({
  codexHome: explicitCodexHome,
  threadId,
  title
} = {}) {
  if (!threadId) {
    throw new Error("Missing thread id for delete-session.");
  }
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "delete-session");
  try {
    const snapshot = await createHistorySnapshot(codexHome);
    const rolloutPaths = await findRolloutPathsByThreadId(codexHome, threadId);
    for (const rolloutPath of rolloutPaths) {
      await fs.rm(rolloutPath, { force: true });
    }
    const indexResult = await removeSessionIndexEntry(codexHome, threadId);
    const sqliteChanges = await deleteSessionFromSqlite(codexHome, threadId);
    return {
      ok: true,
      status: "local_deleted",
      session_id: threadId,
      title: title ?? "",
      message: `已删除本地会话“${title || threadId}”。`,
      undo_token: snapshot.snapshotDir,
      snapshotDir: snapshot.snapshotDir,
      deletedRolloutFiles: rolloutPaths,
      removedIndexEntries: indexResult.removedEntries,
      sqliteChanges
    };
  } finally {
    await releaseLock();
  }
}

export async function runUndoDeleteSession({
  codexHome: explicitCodexHome,
  undoToken
} = {}) {
  if (!undoToken) {
    throw new Error("Missing undo token.");
  }
  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const releaseLock = await acquireLock(codexHome, "undo-delete-session");
  try {
    const result = await restoreHistorySnapshot(codexHome, path.resolve(undoToken));
    return {
      ok: true,
      status: "undone",
      message: "已恢复最近一次删除前的历史快照。",
      undo_token: undoToken,
      ...result
    };
  } finally {
    await releaseLock();
  }
}

export async function runMoveSession({
  codexHome: explicitCodexHome,
  threadId,
  targetCwd,
  dryRun = false,
  sqliteBusyTimeoutMs
} = {}) {
  if (!threadId) {
    throw new Error("Missing session id for move-session.");
  }
  if (!targetCwd || typeof targetCwd !== "string" || !targetCwd.trim()) {
    throw new Error("Missing target cwd for move-session.");
  }

  const codexHome = normalizeCodexHome(explicitCodexHome);
  await ensureCodexHome(codexHome);
  const resolvedTargetCwd = path.resolve(targetCwd);
  const releaseLock = await acquireLock(codexHome, "move-session");
  try {
    const rolloutChanges = await collectSessionMoveChanges(codexHome, threadId, resolvedTargetCwd);
    if (rolloutChanges.length === 0) {
      return {
        ok: false,
        status: "not_found",
        session_id: threadId,
        target_cwd: resolvedTargetCwd,
        dryRun: Boolean(dryRun),
        message: `没有找到会话 ${threadId}。`
      };
    }

    const sqliteResult = await updateSqliteThreadCwd(codexHome, threadId, resolvedTargetCwd, {
      dryRun: true,
      busyTimeoutMs: sqliteBusyTimeoutMs
    });
    const indexResult = await updateSessionIndexCwd(codexHome, threadId, resolvedTargetCwd, { dryRun: true });
    const workspaceRootResult = await ensureWorkspaceRoot(codexHome, resolvedTargetCwd, { dryRun: true });
    const pendingRolloutChanges = rolloutChanges.filter((change) => !change.alreadyCurrent);

    if (dryRun) {
      return {
        ok: true,
        status: "dry_run",
        session_id: threadId,
        target_cwd: resolvedTargetCwd,
        dryRun: true,
        rolloutFiles: rolloutChanges.map((change) => change.path),
        rolloutFilesToUpdate: pendingRolloutChanges.length,
        sqliteRowsToUpdate: sqliteResult.changedRows,
        indexEntriesToUpdate: indexResult.changedEntries,
        workspaceRootToUpdate: workspaceRootResult.updated,
        previous_cwd: rolloutChanges[0]?.previousCwd ?? ""
      };
    }

    const snapshot = await createHistorySnapshot(codexHome);
    const applyResult = await applySessionMoveChanges(rolloutChanges);
    const updatedIndexResult = await updateSessionIndexCwd(codexHome, threadId, resolvedTargetCwd);
    const updatedSqliteResult = await updateSqliteThreadCwd(codexHome, threadId, resolvedTargetCwd, {
      busyTimeoutMs: sqliteBusyTimeoutMs
    });
    const updatedWorkspaceRootResult = await ensureWorkspaceRoot(codexHome, resolvedTargetCwd);

    return {
      ok: applyResult.skippedPaths.length === 0,
      status: applyResult.skippedPaths.length === 0 ? "moved" : "partial",
      session_id: threadId,
      target_cwd: resolvedTargetCwd,
      previous_cwd: rolloutChanges[0]?.previousCwd ?? "",
      dryRun: false,
      undo_token: snapshot.snapshotDir,
      snapshotDir: snapshot.snapshotDir,
      rolloutFiles: rolloutChanges.map((change) => change.path),
      updatedRolloutFiles: applyResult.appliedChanges,
      skippedRolloutFiles: applyResult.skippedPaths,
      sqliteRowsUpdated: updatedSqliteResult.changedRows,
      indexEntriesUpdated: updatedIndexResult.changedEntries,
      workspaceRootUpdated: updatedWorkspaceRootResult.updated,
      message: `已将会话 ${threadId} 移动到 ${resolvedTargetCwd}。`
    };
  } finally {
    await releaseLock();
  }
}

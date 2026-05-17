import fs from "node:fs/promises";
import path from "node:path";

import {
  DB_FILE_BASENAME,
  GLOBAL_STATE_BACKUP_FILE_BASENAME,
  GLOBAL_STATE_FILE_BASENAME,
  SESSION_DIRS,
  SESSION_INDEX_FILE_BASENAME,
  defaultHistoryBackupRoot
} from "./constants.js";
import {
  buildSessionIndexRisk,
  countRolloutFiles,
  rebuildSessionIndex,
  readSessionIndex
} from "./session-index.js";
import { globalStatePath, syncWorkspaceRoots } from "./workspace-roots.js";

function historySnapshotName(date = new Date()) {
  return date.toISOString().replaceAll(":", "").replaceAll("-", "").replace(".", "");
}

async function copyIfPresent(sourcePath, destinationPath) {
  try {
    await fs.access(sourcePath);
  } catch {
    return false;
  }
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return true;
}

async function copyDirectoryIfPresent(sourceDir, destinationDir) {
  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    await fs.mkdir(destinationDir, { recursive: true });
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destinationPath = path.join(destinationDir, entry.name);
      if (entry.isDirectory()) {
        await copyDirectoryIfPresent(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, destinationPath);
      }
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readGlobalState(codexHome) {
  const filePath = globalStatePath(codexHome);
  try {
    const text = await fs.readFile(filePath, "utf8");
    return {
      path: filePath,
      state: JSON.parse(text)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: filePath,
        state: {}
      };
    }
    throw error;
  }
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function normalizePathForSet(value) {
  return String(value).trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

function uniquePaths(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const key = normalizePathForSet(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

export async function createHistorySnapshot(codexHome, options = {}) {
  const backupRoot = options.backupRoot ?? defaultHistoryBackupRoot(codexHome);
  const snapshotDir = path.join(backupRoot, historySnapshotName());
  await fs.mkdir(snapshotDir, { recursive: true });

  await copyIfPresent(path.join(codexHome, "config.toml"), path.join(snapshotDir, "config.toml"));
  await copyIfPresent(path.join(codexHome, SESSION_INDEX_FILE_BASENAME), path.join(snapshotDir, SESSION_INDEX_FILE_BASENAME));
  await copyIfPresent(path.join(codexHome, GLOBAL_STATE_FILE_BASENAME), path.join(snapshotDir, GLOBAL_STATE_FILE_BASENAME));
  await copyIfPresent(path.join(codexHome, GLOBAL_STATE_BACKUP_FILE_BASENAME), path.join(snapshotDir, GLOBAL_STATE_BACKUP_FILE_BASENAME));
  for (const dirName of SESSION_DIRS) {
    await copyDirectoryIfPresent(
      path.join(codexHome, dirName),
      path.join(snapshotDir, dirName)
    );
  }

  for (const suffix of ["", "-shm", "-wal"]) {
    await copyIfPresent(
      path.join(codexHome, `${DB_FILE_BASENAME}${suffix}`),
      path.join(snapshotDir, "db", `${DB_FILE_BASENAME}${suffix}`)
    );
  }

  return {
    backupRoot,
    snapshotDir,
    createdAt: path.basename(snapshotDir)
  };
}

async function removeDirectoryContents(targetDir) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  for (const entry of entries) {
    await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

export async function restoreHistorySnapshot(codexHome, snapshotDir) {
  await copyIfPresent(path.join(snapshotDir, SESSION_INDEX_FILE_BASENAME), path.join(codexHome, SESSION_INDEX_FILE_BASENAME));
  await copyIfPresent(path.join(snapshotDir, GLOBAL_STATE_FILE_BASENAME), path.join(codexHome, GLOBAL_STATE_FILE_BASENAME));
  await copyIfPresent(path.join(snapshotDir, GLOBAL_STATE_BACKUP_FILE_BASENAME), path.join(codexHome, GLOBAL_STATE_BACKUP_FILE_BASENAME));

  for (const dirName of SESSION_DIRS) {
    const targetDir = path.join(codexHome, dirName);
    await fs.mkdir(targetDir, { recursive: true });
    await removeDirectoryContents(targetDir);
    await copyDirectoryIfPresent(path.join(snapshotDir, dirName), targetDir);
  }

  for (const suffix of ["", "-shm", "-wal"]) {
    const sourcePath = path.join(snapshotDir, "db", `${DB_FILE_BASENAME}${suffix}`);
    const targetPath = path.join(codexHome, `${DB_FILE_BASENAME}${suffix}`);
    const copied = await copyIfPresent(sourcePath, targetPath);
    if (!copied) {
      await fs.rm(targetPath, { force: true });
    }
  }

  return {
    snapshotDir,
    restoredAt: new Date().toISOString()
  };
}

export async function repairSidebarVisibility(codexHome, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const { state, path: statePath } = await readGlobalState(codexHome);
  const savedRoots = uniquePaths([
    ...toArray(state["electron-saved-workspace-roots"]),
    ...toArray(state["project-order"]),
    ...toArray(state["active-workspace-roots"])
  ]);
  const activeRoots = toArray(state["active-workspace-roots"]);
  const activeSet = new Set(activeRoots.map(normalizePathForSet));
  const missingActiveRoots = savedRoots.filter((value) => !activeSet.has(normalizePathForSet(value)));

  const nextState = {
    ...state,
    "electron-saved-workspace-roots": savedRoots,
    "project-order": uniquePaths([
      ...toArray(state["project-order"]),
      ...savedRoots
    ]),
    "active-workspace-roots": savedRoots
  };

  const originalText = JSON.stringify(state);
  const nextText = `${JSON.stringify(nextState, null, 2)}\n`;
  const changed = originalText !== JSON.stringify(nextState);

  if (!dryRun && changed) {
    await fs.writeFile(statePath, nextText, "utf8");
    await fs.writeFile(path.join(codexHome, GLOBAL_STATE_BACKUP_FILE_BASENAME), nextText, "utf8");
  }

  const syncResult = dryRun ? null : await syncWorkspaceRoots(codexHome);
  return {
    statePath,
    changed,
    savedWorkspaceRoots: savedRoots.length,
    activeWorkspaceRoots: activeRoots.length,
    missingActiveRoots,
    syncResult
  };
}

export async function doctorHistory(codexHome) {
  const rolloutFileCount = await countRolloutFiles(codexHome);
  const sessionIndexEntries = await readSessionIndex(codexHome);
  const { state } = await readGlobalState(codexHome);
  const savedRoots = uniquePaths([
    ...toArray(state["electron-saved-workspace-roots"]),
    ...toArray(state["project-order"])
  ]);
  const activeRoots = toArray(state["active-workspace-roots"]);
  const activeSet = new Set(activeRoots.map(normalizePathForSet));
  const missingActiveRoots = savedRoots.filter((value) => !activeSet.has(normalizePathForSet(value)));

  return {
    rolloutFileCount,
    sessionIndexCount: sessionIndexEntries.length,
    savedWorkspaceRootCount: savedRoots.length,
    activeWorkspaceRootCount: activeRoots.length,
    missingActiveRoots,
    sessionIndexRisk: buildSessionIndexRisk(rolloutFileCount, sessionIndexEntries.length)
  };
}

export async function rebuildHistoryIndex(codexHome) {
  return rebuildSessionIndex(codexHome);
}

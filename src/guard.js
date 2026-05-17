import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  GLOBAL_STATE_FILE_BASENAME,
  GUARD_LOG_FILENAME,
  GUARD_DIAGNOSIS_FILENAME,
  GUARD_PID_FILENAME,
  GUARD_STATE_FILENAME,
  SESSION_INDEX_FILE_BASENAME,
  WINDOWS_GUARD_TASK_NAME,
  defaultGuardAppDir,
  legacyGuardAppDir
} from "./constants.js";
import { createHistorySnapshot, doctorHistory, repairSidebarVisibility } from "./history-guard.js";
import { rebuildSessionIndex } from "./session-index.js";
import { readConfigText, readCurrentProviderFromConfigText } from "./config-file.js";
import { runSync } from "./service.js";

const DEFAULT_GUARD_INTERVAL_MS = 15_000;

function guardPath(fileName) {
  return path.join(defaultGuardAppDir(), fileName);
}

function legacyGuardPath(fileName) {
  return path.join(legacyGuardAppDir(), fileName);
}

async function ensureGuardDir() {
  await fs.mkdir(defaultGuardAppDir(), { recursive: true });
}

async function readJsonWithFallback(fileName) {
  for (const filePath of [guardPath(fileName), legacyGuardPath(fileName)]) {
    try {
      return {
        filePath,
        value: JSON.parse(await fs.readFile(filePath, "utf8"))
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

async function readNewestJsonWithFallback(fileName) {
  const candidates = [];
  for (const filePath of [guardPath(fileName), legacyGuardPath(fileName)]) {
    try {
      const [valueText, stat] = await Promise.all([
        fs.readFile(filePath, "utf8"),
        fs.stat(filePath)
      ]);
      candidates.push({
        filePath,
        value: JSON.parse(valueText),
        mtimeMs: stat.mtimeMs
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const rightRank = diagnosisTimestampRank(right.value, right.mtimeMs);
    const leftRank = diagnosisTimestampRank(left.value, left.mtimeMs);
    return rightRank - leftRank;
  });
  const newest = candidates[0];
  return {
    filePath: newest.filePath,
    value: newest.value
  };
}

function diagnosisTimestampRank(value, fallbackMtimeMs) {
  const savedAt = typeof value?.saved_at === "string" ? value.saved_at.trim() : "";
  if (savedAt) {
    const normalized = savedAt.replace(" ", "T");
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallbackMtimeMs;
}

async function readTextWithFallback(fileName) {
  for (const filePath of [guardPath(fileName), legacyGuardPath(fileName)]) {
    try {
      return {
        filePath,
        value: await fs.readFile(filePath, "utf8")
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

async function appendGuardLog(message) {
  await ensureGuardDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(guardPath(GUARD_LOG_FILENAME), line, "utf8");
}

async function writeGuardState(nextState) {
  await ensureGuardDir();
  await fs.writeFile(guardPath(GUARD_STATE_FILENAME), `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}

async function readGuardState() {
  const result = await readJsonWithFallback(GUARD_STATE_FILENAME);
  return result ?? null;
}

async function readDiagnosisState() {
  return await readNewestJsonWithFallback(GUARD_DIAGNOSIS_FILENAME);
}

async function writePidFile(pid = process.pid) {
  await ensureGuardDir();
  await fs.writeFile(guardPath(GUARD_PID_FILENAME), String(pid), "utf8");
}

async function readPidFile() {
  const result = await readTextWithFallback(GUARD_PID_FILENAME);
  if (!result) {
    return null;
  }
  const pid = Number.parseInt(result.value.trim(), 10);
  return Number.isInteger(pid) ? pid : null;
}

async function removePidFile() {
  await fs.rm(guardPath(GUARD_PID_FILENAME), { force: true });
  await fs.rm(legacyGuardPath(GUARD_PID_FILENAME), { force: true });
}

async function statSignature(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

async function buildInputState(codexHome) {
  return {
    config: await statSignature(path.join(codexHome, "config.toml")),
    auth: await statSignature(path.join(codexHome, "auth.json")),
    globalState: await statSignature(path.join(codexHome, GLOBAL_STATE_FILE_BASENAME)),
    sessionIndex: await statSignature(path.join(codexHome, SESSION_INDEX_FILE_BASENAME))
  };
}

async function detectAndRepair(codexHome) {
  const currentConfig = await readConfigText(path.join(codexHome, "config.toml"));
  const currentProvider = readCurrentProviderFromConfigText(currentConfig).provider;
  const doctor = await doctorHistory(codexHome);
  const actions = [];

  if (doctor.sessionIndexRisk?.sessionIndexEmpty || doctor.sessionIndexRisk?.rolloutIndexMismatch) {
    await appendGuardLog("Detected incomplete session index visibility; rebuilding session_index.jsonl.");
    const rebuilt = await rebuildSessionIndex(codexHome);
    actions.push({ type: "rebuild-index", entryCount: rebuilt.entryCount });
  }

  if (doctor.missingActiveRoots.length > 0) {
    await appendGuardLog(`Detected missing active workspace roots (${doctor.missingActiveRoots.length}); repairing sidebar visibility.`);
    const repaired = await repairSidebarVisibility(codexHome);
    actions.push({ type: "repair-sidebar", changed: repaired.changed });
  }

  if (doctor.rolloutFileCount > 0) {
    await appendGuardLog(`Checking provider metadata alignment against current provider ${currentProvider}.`);
    const syncResult = await runSync({ codexHome, provider: currentProvider });
    if (
      syncResult.changedSessionFiles > 0
      || syncResult.sqliteRowsUpdated > 0
      || syncResult.updatedWorkspaceRoots > 0
    ) {
      actions.push({
        type: "sync",
        provider: currentProvider,
        changedSessionFiles: syncResult.changedSessionFiles,
        sqliteRowsUpdated: syncResult.sqliteRowsUpdated
      });
    }
  }

  return {
    doctor,
    actions
  };
}

export async function runGuardOnce(codexHome) {
  const snapshot = await createHistorySnapshot(codexHome);
  const repair = await detectAndRepair(codexHome);
  const state = {
    codexHome,
    lastRunAt: new Date().toISOString(),
    snapshotDir: snapshot.snapshotDir,
    snapshotCreatedAt: snapshot.createdAt,
    doctor: repair.doctor,
    actions: repair.actions
  };
  await writeGuardState(state);
  return state;
}

export async function runGuardLoop(codexHome, options = {}) {
  const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0
    ? options.intervalMs
    : DEFAULT_GUARD_INTERVAL_MS;

  await writePidFile();
  await appendGuardLog(`Guard loop started for ${codexHome}.`);

  let lastInputs = await buildInputState(codexHome);
  await runGuardOnce(codexHome);

  const timer = setInterval(async () => {
    try {
      const nextInputs = await buildInputState(codexHome);
      const changed = Object.keys(nextInputs).some((key) => nextInputs[key] !== lastInputs[key]);
      if (!changed) {
        return;
      }

      await appendGuardLog("Detected Codex state change; running guard cycle.");
      lastInputs = nextInputs;
      await runGuardOnce(codexHome);
    } catch (error) {
      await appendGuardLog(`Guard cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, intervalMs);

  const stop = async () => {
    clearInterval(timer);
    await appendGuardLog("Guard loop stopped.");
    await removePidFile();
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      void stop().finally(() => process.exit(0));
    });
  }

  return {
    intervalMs
  };
}

export async function startGuard(codexHome, options = {}) {
  const existingPid = await readPidFile();
  if (existingPid) {
    try {
      process.kill(existingPid, 0);
      return { started: false, alreadyRunning: true, pid: existingPid };
    } catch {
      await removePidFile();
    }
  }

  const cliPath = options.cliPath;
  if (!cliPath) {
    throw new Error("Missing CLI path for guard startup.");
  }

  await ensureGuardDir();
  const outPath = guardPath(GUARD_LOG_FILENAME);
  const child = spawn(process.execPath, [cliPath, "codex-pro", "watch", "--codex-home", codexHome], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
  });
  child.unref();
  await fs.appendFile(outPath, `[${new Date().toISOString()}] Spawned guard process ${child.pid}\n`, "utf8");
  return { started: true, pid: child.pid };
}

export async function stopGuard() {
  const pid = await readPidFile();
  if (!pid) {
    return { stopped: false, reason: "not-running" };
  }

  try {
    process.kill(pid, "SIGTERM");
    await removePidFile();
    await appendGuardLog(`Requested guard stop for PID ${pid}.`);
    return { stopped: true, pid };
  } catch (error) {
    return {
      stopped: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getGuardStatus() {
  const state = await readGuardState();
  const diagnosis = await readDiagnosisState();
  const pid = await readPidFile();
  let running = false;
  if (pid) {
    try {
      process.kill(pid, 0);
      running = true;
    } catch {
      running = false;
    }
  }

  return {
    taskName: WINDOWS_GUARD_TASK_NAME,
    running,
    pid,
    state: state?.value ?? null,
    logPath: guardPath(GUARD_LOG_FILENAME),
    diagnosis: diagnosis?.value ?? null,
    diagnosisPath: diagnosis?.filePath ?? guardPath(GUARD_DIAGNOSIS_FILENAME)
  };
}

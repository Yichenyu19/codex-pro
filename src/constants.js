import os from "node:os";
import path from "node:path";

export const DEFAULT_PROVIDER = "openai";
export const DEFAULT_LOCK_NAME = "provider-sync.lock";
export const BACKUP_NAMESPACE = "provider-sync";
export const HISTORY_BACKUP_NAMESPACE = "history-guard";
export const DB_FILE_BASENAME = "state_5.sqlite";
export const GLOBAL_STATE_FILE_BASENAME = ".codex-global-state.json";
export const GLOBAL_STATE_BACKUP_FILE_BASENAME = ".codex-global-state.json.bak";
export const SESSION_INDEX_FILE_BASENAME = "session_index.jsonl";
export const DEFAULT_BACKUP_RETENTION_COUNT = 5;
export const SESSION_DIRS = ["sessions", "archived_sessions"];
export const GUARD_APP_DIRNAME = "codex-pro";
export const LEGACY_GUARD_APP_DIRNAME = "codex-guard";
export const LEGACY_HISTORY_GUARD_APP_DIRNAME = "codex-history-guard";
export const GUARD_STATE_FILENAME = "guard-state.json";
export const GUARD_LOG_FILENAME = "guard.log";
export const GUARD_PID_FILENAME = "guard.pid";
export const GUARD_DIAGNOSIS_FILENAME = "cdp-diagnosis.json";
export const TAKEOVER_STATE_FILENAME = "takeover-state.json";
export const TAKEOVER_LAUNCH_CMD_FILENAME = "takeover-launch.cmd";
export const TAKEOVER_LAUNCH_PS1_FILENAME = "takeover-launch.ps1";
export const TAKEOVER_LAUNCH_VBS_FILENAME = "takeover-launch.vbs";
export const WINDOWS_GUARD_TASK_NAME = "CodexPro";

export function defaultCodexHome() {
  return path.join(os.homedir(), ".codex");
}

export function defaultBackupRoot(codexHome) {
  return path.join(codexHome, "backups_state", BACKUP_NAMESPACE);
}

export function defaultHistoryBackupRoot(codexHome) {
  return path.join(codexHome, "backups_state", HISTORY_BACKUP_NAMESPACE);
}

export function defaultGuardAppDir() {
  if (process.env.CODEX_PRO_APP_DIR) {
    return process.env.CODEX_PRO_APP_DIR;
  }
  if (process.env.CODEX_GUARD_APP_DIR) {
    return process.env.CODEX_GUARD_APP_DIR;
  }
  if (process.env.CODEX_HISTORY_GUARD_APP_DIR) {
    return process.env.CODEX_HISTORY_GUARD_APP_DIR;
  }
  return path.join(os.homedir(), `.${GUARD_APP_DIRNAME}`);
}

export function legacyGuardAppDir() {
  if (process.env.CODEX_PRO_LEGACY_DIR) {
    return process.env.CODEX_PRO_LEGACY_DIR;
  }
  if (process.env.CODEX_GUARD_LEGACY_DIR) {
    return process.env.CODEX_GUARD_LEGACY_DIR;
  }
  if (process.env.CODEX_HISTORY_GUARD_LEGACY_DIR) {
    return process.env.CODEX_HISTORY_GUARD_LEGACY_DIR;
  }
  if (process.env.CODEX_GUARD_APP_DIR) {
    return process.env.CODEX_GUARD_APP_DIR;
  }
  if (process.env.CODEX_HISTORY_GUARD_APP_DIR) {
    return process.env.CODEX_HISTORY_GUARD_APP_DIR;
  }
  return path.join(os.homedir(), `.${LEGACY_GUARD_APP_DIRNAME}`);
}

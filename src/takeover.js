import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  TAKEOVER_LAUNCH_CMD_FILENAME,
  TAKEOVER_LAUNCH_PS1_FILENAME,
  TAKEOVER_LAUNCH_VBS_FILENAME,
  TAKEOVER_STATE_FILENAME,
  defaultGuardAppDir
} from "./constants.js";

const execFileAsync = promisify(execFile);
const CODEX_SHORTCUT_FILENAME = "Codex.lnk";
const PRODUCT_FOLDER_NAME = "Codex Pro";
const ENV_CODEX_EXE_PATH = "CODEX_PRO_CODEX_EXE_PATH";
const LEGACY_ENV_CODEX_EXE_PATH = "CODEX_HISTORY_GUARD_CODEX_EXE_PATH";

function defaultDesktopDir() {
  return process.env.CODEX_PRO_DESKTOP_PATH
    ? path.resolve(process.env.CODEX_PRO_DESKTOP_PATH)
    : process.env.CODEX_HISTORY_GUARD_DESKTOP_PATH
    ? path.resolve(process.env.CODEX_HISTORY_GUARD_DESKTOP_PATH)
    : path.join(os.homedir(), "Desktop");
}

function defaultProgramsRoot() {
  return process.env.CODEX_PRO_START_MENU_PATH
    ? path.resolve(process.env.CODEX_PRO_START_MENU_PATH)
    : process.env.CODEX_HISTORY_GUARD_START_MENU_PATH
    ? path.resolve(process.env.CODEX_HISTORY_GUARD_START_MENU_PATH)
    : path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs"
      );
}

function takeoverStatePath() {
  return path.join(defaultGuardAppDir(), TAKEOVER_STATE_FILENAME);
}

function takeoverLaunchCmdPath() {
  return path.join(defaultGuardAppDir(), TAKEOVER_LAUNCH_CMD_FILENAME);
}

function takeoverLaunchPs1Path() {
  return path.join(defaultGuardAppDir(), TAKEOVER_LAUNCH_PS1_FILENAME);
}

function takeoverLaunchVbsPath() {
  return path.join(defaultGuardAppDir(), TAKEOVER_LAUNCH_VBS_FILENAME);
}

function withUtf16Bom(text) {
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(text, "utf16le")
  ]);
}

async function ensureAppDir() {
  await fs.mkdir(defaultGuardAppDir(), { recursive: true });
}

async function runPowerShell(command, parameters = {}) {
  const args = [
    "-NoProfile",
    "-Command",
    [
      "$__chgParams = ConvertFrom-Json @'",
      JSON.stringify(parameters, null, 0),
      "'@ -AsHashtable",
      `& { ${command} } @__chgParams`
    ].join("\n")
  ];
  const { stdout } = await execFileAsync("pwsh", args, { windowsHide: true });
  return stdout.trim();
}

async function readShortcut(shortcutPath) {
  const output = await runPowerShell(
    [
      "param([string]$ShortcutPath)",
      "$shell = New-Object -ComObject WScript.Shell",
      "$shortcut = $shell.CreateShortcut($ShortcutPath)",
      "[pscustomobject]@{",
      "  TargetPath = $shortcut.TargetPath",
      "  Arguments = $shortcut.Arguments",
      "  WorkingDirectory = $shortcut.WorkingDirectory",
      "  IconLocation = $shortcut.IconLocation",
      "  Description = $shortcut.Description",
      "} | ConvertTo-Json -Compress"
    ].join("\n"),
    { ShortcutPath: shortcutPath }
  );
  return JSON.parse(output || "{}");
}

async function writeShortcut({
  shortcutPath,
  targetPath,
  argumentsText = "",
  workingDirectory = "",
  iconLocation = "",
  description = ""
}) {
  await runPowerShell(
    [
      "param([string]$ShortcutPath,[string]$TargetPath,[string]$ArgumentsText,[string]$WorkingDirectory,[string]$IconLocation,[string]$Description)",
      "$shell = New-Object -ComObject WScript.Shell",
      "$shortcut = $shell.CreateShortcut($ShortcutPath)",
      "$shortcut.TargetPath = $TargetPath",
      "$shortcut.Arguments = $ArgumentsText",
      "$shortcut.WorkingDirectory = $WorkingDirectory",
      "$shortcut.IconLocation = $IconLocation",
      "$shortcut.Description = $Description",
      "$shortcut.Save()"
    ].join("\n"),
    {
      ShortcutPath: shortcutPath,
      TargetPath: targetPath,
      ArgumentsText: argumentsText,
      WorkingDirectory: workingDirectory,
      IconLocation: iconLocation,
      Description: description
    }
  );
}

async function fileExists(targetPath) {
  return fs.access(targetPath).then(() => true).catch(() => false);
}

async function findWindowsAppsCodexExecutable() {
  const output = await runPowerShell(
    [
      "$package = Get-ChildItem \"$env:ProgramFiles\\WindowsApps\" -Filter \"OpenAI.Codex_*_x64__*\" -ErrorAction SilentlyContinue |",
      "  Sort-Object Name -Descending | Select-Object -First 1",
      "if (-not $package) { return }",
      "$candidates = @(",
      "  (Join-Path $package.FullName 'Codex.exe'),",
      "  (Join-Path $package.FullName 'app\\Codex.exe'),",
      "  (Join-Path $package.FullName 'app\\resources\\codex.exe')",
      ")",
      "$candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1"
    ].join("\n")
  ).catch(() => "");
  return output.trim() || null;
}

async function findCodexExecutable() {
  const explicit = (process.env[ENV_CODEX_EXE_PATH] || process.env[LEGACY_ENV_CODEX_EXE_PATH] || "").trim();
  if (explicit && await fileExists(explicit)) {
    return path.resolve(explicit);
  }

  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Programs", "Codex", "Codex.exe")
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return path.resolve(candidate);
    }
  }

  return await findWindowsAppsCodexExecutable();
}

async function createNativeCodexShortcut(shortcutPath, codexExecutable) {
  await fs.mkdir(path.dirname(shortcutPath), { recursive: true });
  await writeShortcut({
    shortcutPath,
    targetPath: codexExecutable,
    argumentsText: "",
    workingDirectory: path.dirname(codexExecutable),
    iconLocation: `${codexExecutable},0`,
    description: "Codex"
  });
}

async function readTakeoverState() {
  try {
    return JSON.parse(await fs.readFile(takeoverStatePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeTakeoverState(state) {
  await ensureAppDir();
  await fs.writeFile(takeoverStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function removeTakeoverState() {
  await fs.rm(takeoverStatePath(), { force: true });
}

function managedTargetPath() {
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wscript.exe");
}

function managedArguments() {
  return `"${takeoverLaunchVbsPath()}"`;
}

async function ensureTakeoverLaunchers(repoRoot) {
  await ensureAppDir();
  const launcherPy = path.join(repoRoot, "launcher-python", "launcher.py");
  const ps1Text = [
    "$ErrorActionPreference = 'Stop'",
    `$repoRoot = "${repoRoot.replaceAll('"', '`"')}"`,
    `py "${launcherPy.replaceAll('"', '`"')}"`,
    "exit $LASTEXITCODE"
  ].join("\r\n") + "\r\n";
  const cmdText = [
    "@echo off",
    "setlocal",
    `py "${launcherPy}"`,
    "exit /b %ERRORLEVEL%"
  ].join("\r\n") + "\r\n";
  const vbsText = [
    "Option Explicit",
    "Dim shell, fso, appDir, ps1Path, command",
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'appDir = fso.GetParentFolderName(WScript.ScriptFullName)',
    `ps1Path = fso.BuildPath(appDir, "${TAKEOVER_LAUNCH_PS1_FILENAME}")`,
    'command = "pwsh -NoProfile -ExecutionPolicy Bypass -File """ & ps1Path & """"',
    "shell.Run command, 0, False"
  ].join("\r\n") + "\r\n";
  await fs.writeFile(takeoverLaunchPs1Path(), ps1Text, "utf8");
  await fs.writeFile(takeoverLaunchCmdPath(), cmdText, "utf8");
  await fs.writeFile(takeoverLaunchVbsPath(), withUtf16Bom(vbsText));
  return {
    ps1Path: takeoverLaunchPs1Path(),
    cmdPath: takeoverLaunchCmdPath(),
    vbsPath: takeoverLaunchVbsPath()
  };
}

async function collectStartMenuCandidates(programsRoot) {
  const result = [];
  const stack = [programsRoot];
  while (stack.length) {
    const current = stack.shift();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === PRODUCT_FOLDER_NAME) {
          continue;
        }
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === CODEX_SHORTCUT_FILENAME.toLowerCase()) {
        result.push(fullPath);
      }
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

async function findShortcutTargets({
  desktopPath,
  startMenuPath
} = {}) {
  const desktopDir = path.resolve(desktopPath ?? defaultDesktopDir());
  const programsRoot = path.resolve(startMenuPath ?? defaultProgramsRoot());
  const desktopShortcut = path.join(desktopDir, CODEX_SHORTCUT_FILENAME);
  const startMenuCandidates = await collectStartMenuCandidates(programsRoot);
  return {
    desktopDir,
    programsRoot,
    desktopShortcut: await fileExists(desktopShortcut) ? desktopShortcut : null,
    startMenuShortcut: startMenuCandidates[0] ?? null
  };
}

function isManagedShortcut(shortcut, state) {
  if (!shortcut?.TargetPath || !state?.launchers?.vbsPath) {
    return false;
  }
  const expectedVbsName = path.basename(state.launchers.vbsPath).toLowerCase();
  return path.basename(shortcut.TargetPath).toLowerCase() === "wscript.exe"
    && String(shortcut.Arguments ?? "").toLowerCase().includes(expectedVbsName);
}

async function takeoverShortcut({ shortcutPath, existingState, repoRoot, createdByHistoryGuard = false }) {
  const current = await readShortcut(shortcutPath);
  const original = isManagedShortcut(current, existingState)
    ? (existingState?.entries?.[shortcutPath]?.original ?? current)
    : current;
  const iconLocation = original.IconLocation || `${original.TargetPath},0`;
  const next = {
    shortcutPath,
    original: {
      TargetPath: original.TargetPath ?? "",
      Arguments: original.Arguments ?? "",
      WorkingDirectory: original.WorkingDirectory ?? "",
      IconLocation: original.IconLocation ?? "",
      Description: original.Description ?? ""
    },
    createdByHistoryGuard,
    takeover: {
      TargetPath: managedTargetPath(),
      Arguments: managedArguments(),
      WorkingDirectory: path.resolve(repoRoot),
      IconLocation: iconLocation,
      Description: "Open Codex with Codex Pro auto-attach."
    }
  };
  await writeShortcut({
    shortcutPath,
    targetPath: next.takeover.TargetPath,
    argumentsText: next.takeover.Arguments,
    workingDirectory: next.takeover.WorkingDirectory,
    iconLocation: next.takeover.IconLocation,
    description: next.takeover.Description
  });
  return next;
}

async function restoreShortcut(entry) {
  if (!entry?.shortcutPath || !entry?.original?.TargetPath) {
    return false;
  }
  await writeShortcut({
    shortcutPath: entry.shortcutPath,
    targetPath: entry.original.TargetPath,
    argumentsText: entry.original.Arguments,
    workingDirectory: entry.original.WorkingDirectory || path.dirname(entry.original.TargetPath),
    iconLocation: entry.original.IconLocation || `${entry.original.TargetPath},0`,
    description: entry.original.Description || "Codex"
  });
  return true;
}

export async function installTakeover({
  desktopPath,
  startMenuPath,
  repoRoot
} = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const previousState = await readTakeoverState();
  const found = await findShortcutTargets({ desktopPath, startMenuPath });
  const launchers = await ensureTakeoverLaunchers(resolvedRepoRoot);
  const entries = {};
  const installedPaths = [];
  const createdShortcuts = new Set();

  if (!found.desktopShortcut || !found.startMenuShortcut) {
    const codexExecutable = await findCodexExecutable();
    if (codexExecutable && !found.desktopShortcut) {
      found.desktopShortcut = path.join(found.desktopDir, CODEX_SHORTCUT_FILENAME);
      await createNativeCodexShortcut(found.desktopShortcut, codexExecutable);
      createdShortcuts.add(found.desktopShortcut);
    }
    if (codexExecutable && !found.startMenuShortcut) {
      found.startMenuShortcut = path.join(found.programsRoot, CODEX_SHORTCUT_FILENAME);
      await createNativeCodexShortcut(found.startMenuShortcut, codexExecutable);
      createdShortcuts.add(found.startMenuShortcut);
    }
  }

  for (const shortcutPath of [found.desktopShortcut, found.startMenuShortcut]) {
    if (!shortcutPath) {
      continue;
    }
    const entry = await takeoverShortcut({
      shortcutPath,
      existingState: previousState,
      repoRoot: resolvedRepoRoot,
      createdByHistoryGuard: createdShortcuts.has(shortcutPath)
    });
    entries[shortcutPath] = entry;
    installedPaths.push(shortcutPath);
  }

  const state = {
    version: 1,
    updatedAt: new Date().toISOString(),
    repoRoot: resolvedRepoRoot,
    desktopDir: found.desktopDir,
    programsRoot: found.programsRoot,
    launchers,
    entries,
    mode: installedPaths.length ? "takeover" : "maintenance_only"
  };
  await writeTakeoverState(state);
  return {
    mode: state.mode,
    statePath: takeoverStatePath(),
    desktopShortcut: found.desktopShortcut ? path.resolve(found.desktopShortcut) : null,
    startMenuShortcut: found.startMenuShortcut ? path.resolve(found.startMenuShortcut) : null,
    desktopTakenOver: Boolean(found.desktopShortcut),
    startMenuTakenOver: Boolean(found.startMenuShortcut),
    launcherPs1Path: launchers.ps1Path,
    launcherCmdPath: launchers.cmdPath,
    launcherVbsPath: launchers.vbsPath
  };
}

export async function removeTakeover() {
  const state = await readTakeoverState();
  if (!state) {
    return {
      restoredDesktop: false,
      restoredStartMenu: false,
      removedState: false
    };
  }

  let restoredDesktop = false;
  let restoredStartMenu = false;
  for (const entry of Object.values(state.entries ?? {})) {
    const restored = entry.createdByHistoryGuard
      ? await fs.rm(entry.shortcutPath, { force: true }).then(() => true)
      : await restoreShortcut(entry);
    if (!restored) {
      continue;
    }
    if (entry.shortcutPath?.startsWith(state.desktopDir)) {
      restoredDesktop = true;
    }
    if (entry.shortcutPath?.startsWith(state.programsRoot)) {
      restoredStartMenu = true;
    }
  }

  await fs.rm(state.launchers?.cmdPath ?? takeoverLaunchCmdPath(), { force: true });
  await fs.rm(state.launchers?.ps1Path ?? takeoverLaunchPs1Path(), { force: true });
  await fs.rm(state.launchers?.vbsPath ?? takeoverLaunchVbsPath(), { force: true });
  await removeTakeoverState();
  return {
    restoredDesktop,
    restoredStartMenu,
    removedState: true
  };
}

export async function getTakeoverStatus({
  desktopPath,
  startMenuPath
} = {}) {
  const state = await readTakeoverState();
  const found = await findShortcutTargets({ desktopPath, startMenuPath });
  const desktopInfo = found.desktopShortcut ? await readShortcut(found.desktopShortcut).catch(() => null) : null;
  const startMenuInfo = found.startMenuShortcut ? await readShortcut(found.startMenuShortcut).catch(() => null) : null;
  const codexExecutable = (!found.desktopShortcut || !found.startMenuShortcut)
    ? await findCodexExecutable().catch(() => null)
    : null;
  const desktopTakenOver = isManagedShortcut(desktopInfo, state);
  const startMenuTakenOver = isManagedShortcut(startMenuInfo, state);
  return {
    enabled: Boolean(state),
    mode: state?.mode ?? "disabled",
    statePath: takeoverStatePath(),
    launchers: state?.launchers ?? null,
    desktopShortcutPath: found.desktopShortcut ? path.resolve(found.desktopShortcut) : null,
    startMenuShortcutPath: found.startMenuShortcut ? path.resolve(found.startMenuShortcut) : null,
    desktopTakenOver,
    startMenuTakenOver,
    canCreateDesktopShortcut: Boolean(codexExecutable && !found.desktopShortcut),
    canCreateStartMenuShortcut: Boolean(codexExecutable && !found.startMenuShortcut),
    codexExecutablePath: codexExecutable,
    maintenanceOnly: state?.mode === "maintenance_only"
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  getTakeoverStatus,
  installTakeover,
  removeTakeover
} from "../src/takeover.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(".");

async function createShortcut(shortcutPath, targetPath) {
  await execFileAsync("pwsh", [
    "-NoProfile",
    "-Command",
    "& { param([string]$ShortcutPath,[string]$TargetPath) $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($ShortcutPath); $shortcut.TargetPath = $TargetPath; $shortcut.IconLocation = \"$TargetPath,0\"; $shortcut.Save() }",
    "-ShortcutPath",
    shortcutPath,
    "-TargetPath",
    targetPath
  ], { timeout: 120000 });
}

async function readShortcut(shortcutPath) {
  const { stdout } = await execFileAsync("pwsh", [
    "-NoProfile",
    "-Command",
    "& { param([string]$ShortcutPath) $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($ShortcutPath); [pscustomobject]@{ TargetPath = $shortcut.TargetPath; Arguments = $shortcut.Arguments } | ConvertTo-Json -Compress }",
    "-ShortcutPath",
    shortcutPath
  ], { timeout: 120000 });
  return JSON.parse(stdout.trim());
}

test("takeover install, status, and remove manage native Codex shortcuts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-takeover-"));
  const desktopDir = path.join(root, "Desktop");
  const startMenuDir = path.join(root, "Programs");
  const appDir = path.join(root, ".codex-pro");
  await fs.mkdir(desktopDir, { recursive: true });
  await fs.mkdir(startMenuDir, { recursive: true });
  const desktopShortcutPath = path.join(desktopDir, "Codex.lnk");
  const startMenuShortcutPath = path.join(startMenuDir, "Codex.lnk");
  await createShortcut(desktopShortcutPath, "C:\\Windows\\System32\\notepad.exe");
  await createShortcut(startMenuShortcutPath, "C:\\Windows\\System32\\notepad.exe");

  const previousAppDir = process.env.CODEX_PRO_APP_DIR;
  const previousLegacyDir = process.env.CODEX_PRO_LEGACY_DIR;
  process.env.CODEX_PRO_APP_DIR = appDir;
  process.env.CODEX_PRO_LEGACY_DIR = path.join(root, "legacy");

  try {
    const preinstallStatus = await getTakeoverStatus({
      desktopPath: desktopDir,
      startMenuPath: startMenuDir
    });
    assert.equal(preinstallStatus.enabled, false);
    assert.equal(preinstallStatus.canCreateDesktopShortcut, false);
    assert.equal(preinstallStatus.canCreateStartMenuShortcut, false);
    assert.equal(preinstallStatus.codexExecutablePath, null);

    const installResult = await installTakeover({
      desktopPath: desktopDir,
      startMenuPath: startMenuDir,
      repoRoot
    });
    assert.equal(installResult.mode, "takeover");
    assert.equal(installResult.desktopTakenOver, true);
    assert.equal(installResult.startMenuTakenOver, true);
    assert.match(installResult.launcherPs1Path, /takeover-launch\.ps1$/i);
    await fs.access(installResult.launcherPs1Path);

    const status = await getTakeoverStatus({
      desktopPath: desktopDir,
      startMenuPath: startMenuDir
    });
    assert.equal(status.enabled, true);
    assert.equal(status.desktopTakenOver, true);
    assert.equal(status.startMenuTakenOver, true);
    assert.match(status.launchers?.ps1Path ?? "", /takeover-launch\.ps1$/i);

    const desktopShortcut = await readShortcut(desktopShortcutPath);
    assert.match(desktopShortcut.TargetPath, /wscript\.exe/i);
    assert.match(desktopShortcut.Arguments, /takeover-launch\.vbs/i);

    const removeResult = await removeTakeover();
    assert.equal(removeResult.removedState, true);

    const restoredDesktop = await readShortcut(desktopShortcutPath);
    const restoredStartMenu = await readShortcut(startMenuShortcutPath);
    assert.match(restoredDesktop.TargetPath, /notepad\.exe/i);
    assert.match(restoredStartMenu.TargetPath, /notepad\.exe/i);
  } finally {
    if (previousAppDir === undefined) {
      delete process.env.CODEX_PRO_APP_DIR;
    } else {
      process.env.CODEX_PRO_APP_DIR = previousAppDir;
    }
    if (previousLegacyDir === undefined) {
      delete process.env.CODEX_PRO_LEGACY_DIR;
    } else {
      process.env.CODEX_PRO_LEGACY_DIR = previousLegacyDir;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("takeover creates native Codex entries when no shortcuts exist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-takeover-create-"));
  const desktopDir = path.join(root, "Desktop");
  const startMenuDir = path.join(root, "Programs");
  const appDir = path.join(root, ".codex-pro");
  const desktopShortcutPath = path.join(desktopDir, "Codex.lnk");
  const startMenuShortcutPath = path.join(startMenuDir, "Codex.lnk");
  await fs.mkdir(desktopDir, { recursive: true });
  await fs.mkdir(startMenuDir, { recursive: true });

  const previousAppDir = process.env.CODEX_PRO_APP_DIR;
  const previousLegacyDir = process.env.CODEX_PRO_LEGACY_DIR;
  const previousCodexExe = process.env.CODEX_PRO_CODEX_EXE_PATH;
  process.env.CODEX_PRO_APP_DIR = appDir;
  process.env.CODEX_PRO_LEGACY_DIR = path.join(root, "legacy");
  process.env.CODEX_PRO_CODEX_EXE_PATH = "C:\\Windows\\System32\\notepad.exe";

  try {
    const installResult = await installTakeover({
      desktopPath: desktopDir,
      startMenuPath: startMenuDir,
      repoRoot
    });
    assert.equal(installResult.mode, "takeover");
    assert.equal(installResult.desktopTakenOver, true);
    assert.equal(installResult.startMenuTakenOver, true);
    await fs.access(desktopShortcutPath);
    await fs.access(startMenuShortcutPath);

    const desktopShortcut = await readShortcut(desktopShortcutPath);
    const startMenuShortcut = await readShortcut(startMenuShortcutPath);
    assert.match(desktopShortcut.TargetPath, /wscript\.exe/i);
    assert.match(startMenuShortcut.TargetPath, /wscript\.exe/i);

    const removeResult = await removeTakeover();
    assert.equal(removeResult.restoredDesktop, true);
    assert.equal(removeResult.restoredStartMenu, true);
    await assert.rejects(fs.access(desktopShortcutPath), /ENOENT/);
    await assert.rejects(fs.access(startMenuShortcutPath), /ENOENT/);
  } finally {
    if (previousAppDir === undefined) {
      delete process.env.CODEX_PRO_APP_DIR;
    } else {
      process.env.CODEX_PRO_APP_DIR = previousAppDir;
    }
    if (previousLegacyDir === undefined) {
      delete process.env.CODEX_PRO_LEGACY_DIR;
    } else {
      process.env.CODEX_PRO_LEGACY_DIR = previousLegacyDir;
    }
    if (previousCodexExe === undefined) {
      delete process.env.CODEX_PRO_CODEX_EXE_PATH;
    } else {
      process.env.CODEX_PRO_CODEX_EXE_PATH = previousCodexExe;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});


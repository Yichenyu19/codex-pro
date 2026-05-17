import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(".");

async function createShortcut(shortcutPath, targetPath, iconLocation = "") {
  await execFileAsync("pwsh", [
    "-NoProfile",
    "-Command",
    "& { param([string]$ShortcutPath,[string]$TargetPath,[string]$IconLocation) $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($ShortcutPath); $shortcut.TargetPath = $TargetPath; $shortcut.IconLocation = $IconLocation; $shortcut.Save() }",
    "-ShortcutPath",
    shortcutPath,
    "-TargetPath",
    targetPath,
    "-IconLocation",
    iconLocation
  ], { timeout: 120000 });
}

async function readShortcut(shortcutPath) {
  const { stdout } = await execFileAsync("pwsh", [
    "-NoProfile",
    "-Command",
    "& { param([string]$ShortcutPath) $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($ShortcutPath); [pscustomobject]@{ TargetPath = $shortcut.TargetPath; Arguments = $shortcut.Arguments; IconLocation = $shortcut.IconLocation } | ConvertTo-Json -Compress }",
    "-ShortcutPath",
    shortcutPath
  ], { timeout: 120000 });
  return JSON.parse(stdout.trim());
}

test("install and uninstall scripts support a temporary desktop smoke test", async () => {
  const desktopDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-desktop-"));
  const startMenuDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-start-menu-"));
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-app-"));
  const installScript = path.join(repoRoot, "scripts", "Install-Codex-Pro.ps1");
  const uninstallScript = path.join(repoRoot, "scripts", "Uninstall-Codex-Pro.ps1");
  const quickStartSource = await fs.readFile(path.join(repoRoot, "docs", "quick-start-zh.txt"), "utf8");
  const originalDesktopCodex = path.join(desktopDir, "Codex.lnk");
  const originalStartMenuCodex = path.join(startMenuDir, "Codex.lnk");
  await createShortcut(originalDesktopCodex, "C:\\Windows\\System32\\notepad.exe", "C:\\Windows\\System32\\notepad.exe,0");
  await createShortcut(originalStartMenuCodex, "C:\\Windows\\System32\\notepad.exe", "C:\\Windows\\System32\\notepad.exe,0");

  const installResult = await execFileAsync("pwsh", [
    "-File",
    installScript,
    "-DesktopPath",
    desktopDir,
    "-StartMenuPath",
    startMenuDir,
    "-SkipInstallDependencies",
    "-SkipPythonSetup",
    "-SkipGuardBootstrap"
  ], {
    cwd: repoRoot,
    timeout: 120000,
    env: {
      ...process.env,
      CODEX_PRO_APP_DIR: appDir,
      CODEX_PRO_LEGACY_DIR: path.join(appDir, "legacy")
    }
  });

  const expectedDesktopFiles = ["Codex Pro.cmd"];
  const startMenuProductDir = path.join(startMenuDir, "Codex Pro");
  const expectedStartMenuFiles = [
    "Open Codex Pro.cmd",
    "History Check.cmd",
    "Repair History.cmd",
    "Injection Check.cmd",
    "Protection Status.cmd",
    "Uninstall.cmd",
    "Quick Start.txt"
  ];

  for (const fileName of expectedDesktopFiles) {
    await fs.access(path.join(desktopDir, fileName));
  }
  for (const fileName of expectedStartMenuFiles) {
    await fs.access(path.join(startMenuProductDir, fileName));
  }

  const launcherText = await fs.readFile(path.join(desktopDir, "Codex Pro.cmd"), "utf8");
  const startMenuLauncherText = await fs.readFile(path.join(startMenuProductDir, "Open Codex Pro.cmd"), "utf8");
  const repairText = await fs.readFile(path.join(startMenuProductDir, "Repair History.cmd"), "utf8");
  const statusText = await fs.readFile(path.join(startMenuProductDir, "Protection Status.cmd"), "utf8");
  const diagnoseText = await fs.readFile(path.join(startMenuProductDir, "Injection Check.cmd"), "utf8");
  const quickStartText = await fs.readFile(path.join(startMenuProductDir, "Quick Start.txt"), "utf8");
  const desktopShortcut = await readShortcut(originalDesktopCodex);
  const startMenuShortcut = await readShortcut(originalStartMenuCodex);

  assert.match(launcherText, /launcher-python\\launcher\.py/);
  assert.match(startMenuLauncherText, /Codex Pro\.cmd/);
  assert.match(repairText, /codex-pro repair-sidebar/);
  assert.match(statusText, /codex-pro guard-status/);
  assert.match(diagnoseText, /--diagnose-cdp/);
  assert.equal(quickStartText, quickStartSource);
  assert.match(desktopShortcut.TargetPath, /wscript\.exe/i);
  assert.match(startMenuShortcut.TargetPath, /wscript\.exe/i);
  assert.match(desktopShortcut.Arguments, /takeover-launch\.vbs/i);
  assert.match(startMenuShortcut.Arguments, /takeover-launch\.vbs/i);

  assert.match(installResult.stdout, /当前状态：/);
  assert.match(installResult.stdout, /日常入口：Codex（继续像平常一样打开）/);
  assert.match(installResult.stdout, /下一步：(继续正常打开 Codex 即可|继续打开 Codex；如果历史不完整)/);
  assert.match(installResult.stdout, /日志位置：/);
  assert.match(installResult.stdout, /安全边界：不会改 provider、base_url、登录方式或 encrypted_content。/);
  assert.match(installResult.stdout, /桌面 Codex 已接管：是/);
  assert.match(installResult.stdout, /开始菜单 Codex 已接管：是/);
  assert.match(installResult.stdout, /Codex Pro\.cmd/);
  assert.match(installResult.stdout, /维护入口：/);
  assert.match(installResult.stdout, /固定恢复路径：/);
  assert.match(installResult.stdout, /开始菜单高级入口：/);

  const uninstallResult = await execFileAsync("pwsh", [
    "-File",
    uninstallScript,
    "-DesktopPath",
    desktopDir,
    "-StartMenuPath",
    startMenuDir,
    "-SkipStopGuard"
  ], {
    cwd: repoRoot,
    timeout: 120000,
    env: {
      ...process.env,
      CODEX_PRO_APP_DIR: appDir,
      CODEX_PRO_LEGACY_DIR: path.join(appDir, "legacy")
    }
  });
  assert.match(uninstallResult.stdout, /当前状态：已恢复原生 Codex 入口/);
  assert.match(uninstallResult.stdout, /保留内容：Codex 历史、历史快照和仓库代码默认保留。/);
  assert.match(uninstallResult.stdout, /只有显式使用 -RemoveData 才会删除 Codex Pro 私有日志和数据。/);
  assert.match(uninstallResult.stdout, /下一步：继续像平常一样打开 Codex。/);

  const restoredDesktopShortcut = await readShortcut(originalDesktopCodex);
  const restoredStartMenuShortcut = await readShortcut(originalStartMenuCodex);
  assert.match(restoredDesktopShortcut.TargetPath, /notepad\.exe/i);
  assert.match(restoredStartMenuShortcut.TargetPath, /notepad\.exe/i);

  for (const fileName of expectedDesktopFiles) {
    await assert.rejects(fs.access(path.join(desktopDir, fileName)));
  }
  for (const fileName of expectedStartMenuFiles) {
    await assert.rejects(fs.access(path.join(startMenuProductDir, fileName)));
  }
  await assert.rejects(fs.access(startMenuProductDir));
});


import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(repoRoot, "artifacts", "install-smoke");
const summaryPath = path.join(artifactDir, "validation-summary.json");

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

function assertMatch(value, pattern, message) {
  if (!pattern.test(String(value))) {
    throw new Error(message);
  }
}

async function assertExists(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(message);
  }
}

async function assertMissing(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  throw new Error(message);
}

async function writeSummary(summary) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function main() {
  const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-install-smoke-"));
  const desktopDir = path.join(smokeRoot, "Desktop");
  const startMenuDir = path.join(smokeRoot, "Programs");
  const appDir = path.join(smokeRoot, ".codex-pro");
  const legacyDir = path.join(appDir, "legacy");
  await fs.mkdir(desktopDir, { recursive: true });
  await fs.mkdir(startMenuDir, { recursive: true });

  const installScript = path.join(repoRoot, "scripts", "Install-Codex-Pro.ps1");
  const uninstallScript = path.join(repoRoot, "scripts", "Uninstall-Codex-Pro.ps1");
  const quickStartSource = await fs.readFile(path.join(repoRoot, "docs", "quick-start-zh.txt"), "utf8");
  const originalDesktopCodex = path.join(desktopDir, "Codex.lnk");
  const originalStartMenuCodex = path.join(startMenuDir, "Codex.lnk");

  await createShortcut(originalDesktopCodex, "C:\\Windows\\System32\\notepad.exe", "C:\\Windows\\System32\\notepad.exe,0");
  await createShortcut(originalStartMenuCodex, "C:\\Windows\\System32\\notepad.exe", "C:\\Windows\\System32\\notepad.exe,0");

  const env = {
    ...process.env,
    CODEX_PRO_APP_DIR: appDir,
    CODEX_PRO_LEGACY_DIR: legacyDir
  };

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
    env
  });

  const startMenuProductDir = path.join(startMenuDir, "Codex Pro");
  const expectedDesktopFiles = ["Codex Pro.cmd"];
  const expectedStartMenuFiles = [
    "Open Codex Pro.cmd",
    "History Check.cmd",
    "Repair History.cmd",
    "Update Codex Pro.cmd",
    "Injection Check.cmd",
    "Protection Status.cmd",
    "Uninstall.cmd",
    "Quick Start.txt"
  ];

  for (const fileName of expectedDesktopFiles) {
    await assertExists(path.join(desktopDir, fileName), `Missing desktop maintenance entry: ${fileName}`);
  }
  for (const fileName of expectedStartMenuFiles) {
    await assertExists(path.join(startMenuProductDir, fileName), `Missing start-menu entry: ${fileName}`);
  }

  const quickStartText = await fs.readFile(path.join(startMenuProductDir, "Quick Start.txt"), "utf8");
  if (quickStartText !== quickStartSource) {
    throw new Error("Quick Start.txt content does not match docs/quick-start-zh.txt.");
  }

  const desktopShortcut = await readShortcut(originalDesktopCodex);
  const startMenuShortcut = await readShortcut(originalStartMenuCodex);
  assertMatch(desktopShortcut.TargetPath, /wscript\.exe/i, "Desktop Codex shortcut was not taken over.");
  assertMatch(startMenuShortcut.TargetPath, /wscript\.exe/i, "Start-menu Codex shortcut was not taken over.");
  assertMatch(desktopShortcut.Arguments, /takeover-launch\.vbs/i, "Desktop Codex shortcut does not launch takeover VBS.");
  assertMatch(startMenuShortcut.Arguments, /takeover-launch\.vbs/i, "Start-menu Codex shortcut does not launch takeover VBS.");
  assertMatch(installResult.stdout, /当前状态：/, "Install output does not print the current status line.");
  assertMatch(installResult.stdout, /日常入口：Codex（继续像平常一样打开）/, "Install output does not present native Codex as the daily entry.");
  assertMatch(installResult.stdout, /下一步：/, "Install output does not print the next-step line.");
  assertMatch(installResult.stdout, /日志位置：/, "Install output does not print the log-location line.");
  assertMatch(installResult.stdout, /安全边界：不会改 provider、base_url、登录方式或 encrypted_content。/, "Install output does not print the safety boundary.");
  assertMatch(installResult.stdout, /桌面 Codex 已接管：是/, "Install output does not confirm desktop takeover.");
  assertMatch(installResult.stdout, /开始菜单 Codex 已接管：是/, "Install output does not confirm start-menu takeover.");
  assertMatch(installResult.stdout, /固定恢复路径：/, "Install output does not include the fixed recovery path.");

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
    env
  });
  assertMatch(uninstallResult.stdout, /保留内容：Codex 历史、历史快照和仓库代码默认保留。/, "Uninstall output does not state that history, snapshots and repo code are kept by default.");
  assertMatch(uninstallResult.stdout, /只有显式使用 -RemoveData 才会删除 Codex Pro 私有日志和数据。/, "Uninstall output does not explain the RemoveData boundary.");

  const restoredDesktopShortcut = await readShortcut(originalDesktopCodex);
  const restoredStartMenuShortcut = await readShortcut(originalStartMenuCodex);
  assertMatch(restoredDesktopShortcut.TargetPath, /notepad\.exe/i, "Desktop Codex shortcut was not restored.");
  assertMatch(restoredStartMenuShortcut.TargetPath, /notepad\.exe/i, "Start-menu Codex shortcut was not restored.");

  for (const fileName of expectedDesktopFiles) {
    await assertMissing(path.join(desktopDir, fileName), `Desktop maintenance entry was not removed: ${fileName}`);
  }
  for (const fileName of expectedStartMenuFiles) {
    await assertMissing(path.join(startMenuProductDir, fileName), `Start-menu entry was not removed: ${fileName}`);
  }
  await assertMissing(startMenuProductDir, "Start-menu product folder was not removed.");

  const summary = {
    status: "passed",
    smokeRoot,
    desktopDir,
    startMenuDir,
    appDir,
    takeover: {
      desktopTakenOver: true,
      startMenuTakenOver: true,
      desktopRestored: /notepad\.exe/i.test(restoredDesktopShortcut.TargetPath),
      startMenuRestored: /notepad\.exe/i.test(restoredStartMenuShortcut.TargetPath)
    },
    maintenanceEntriesRemoved: true,
    fixedRecoveryPathPrinted: /固定恢复路径：/.test(installResult.stdout),
    appLikeInstallSummaryPrinted: /当前状态：/.test(installResult.stdout)
      && /日常入口：/.test(installResult.stdout)
      && /下一步：/.test(installResult.stdout)
      && /日志位置：/.test(installResult.stdout),
    installSafetyBoundaryPrinted: /安全边界：不会改 provider、base_url、登录方式或 encrypted_content。/.test(installResult.stdout),
    uninstallKeepsHistoryByDefault: /保留内容：Codex 历史、历史快照和仓库代码默认保留。/.test(uninstallResult.stdout)
  };

  await writeSummary(summary);
  console.log("Install smoke validation passed.");
  console.log(`Summary: ${summaryPath}`);
}

main().catch(async (error) => {
  await writeSummary({
    status: "failed",
    error: error instanceof Error ? error.message : String(error)
  });
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});



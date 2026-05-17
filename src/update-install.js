import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkForUpdate, readLocalPackageVersion } from "./update-check.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function resolveRepoRoot(explicitRepoRoot) {
  return path.resolve(
    explicitRepoRoot
      ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  );
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function formatCommandFailure(error, fallback) {
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const message = error instanceof Error ? error.message.trim() : "";
  const detail = [stderr, stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  if (detail) {
    return `${fallback}\n${detail}`;
  }
  return message && message !== fallback ? `${fallback}\n${message}` : fallback;
}

async function runNative(filePath, args, {
  cwd,
  execFileImpl = execFileAsync,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env = process.env
} = {}, failureMessage) {
  try {
    return await execFileImpl(filePath, args, {
      cwd,
      env,
      timeout: timeoutMs,
      windowsHide: true
    });
  } catch (error) {
    throw new Error(formatCommandFailure(error, failureMessage));
  }
}

function resolvePackedTarball(stdout, downloadDir) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const filename = [...lines].reverse().find((line) => line.endsWith(".tgz"));
  if (!filename) {
    throw new Error("下载更新包失败：没有读到 npm pack 输出的 tgz 文件名。");
  }
  return path.join(downloadDir, filename);
}

async function copyEntry(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    force: true
  });
}

async function listTopLevelEntries(rootDir) {
  return fs.readdir(rootDir, { withFileTypes: true });
}

async function backupCurrentEntries(repoRoot, packageDir, backupDir) {
  const entries = await listTopLevelEntries(packageDir);
  for (const entry of entries) {
    const currentPath = path.join(repoRoot, entry.name);
    if (!(await pathExists(currentPath))) {
      continue;
    }
    const backupPath = path.join(backupDir, entry.name);
    await copyEntry(currentPath, backupPath);
  }
}

async function restoreBackedUpEntries(repoRoot, packageDir, backupDir) {
  const entries = await listTopLevelEntries(packageDir);
  for (const entry of entries) {
    const targetPath = path.join(repoRoot, entry.name);
    await fs.rm(targetPath, { recursive: true, force: true });
    const backupPath = path.join(backupDir, entry.name);
    if (await pathExists(backupPath)) {
      await copyEntry(backupPath, targetPath);
    }
  }
}

async function installPackageEntries(repoRoot, packageDir) {
  const entries = await listTopLevelEntries(packageDir);
  for (const entry of entries) {
    const sourcePath = path.join(packageDir, entry.name);
    const targetPath = path.join(repoRoot, entry.name);
    await fs.rm(targetPath, { recursive: true, force: true });
    await copyEntry(sourcePath, targetPath);
  }
}

async function refreshNodeDependencies(repoRoot, options) {
  await runNative(
    "npm",
    ["install"],
    { ...options, cwd: repoRoot },
    "刷新 Node.js 依赖失败。"
  );
}

async function refreshPythonLauncherDependencies(repoRoot, options) {
  const requirementsPath = path.join(repoRoot, "launcher-python", "requirements.txt");
  if (!(await pathExists(requirementsPath))) {
    return { refreshed: false };
  }
  await runNative(
    "py",
    ["-m", "pip", "install", "-r", requirementsPath],
    { ...options, cwd: repoRoot },
    "刷新 Python launcher 依赖失败。"
  );
  return { refreshed: true };
}

export async function installAvailableUpdate({
  currentVersion,
  packageName,
  registryBase,
  fetchImpl,
  version,
  repoRoot: explicitRepoRoot,
  execFileImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const local = currentVersion
    ? {
        name: packageName ?? "codex-pro",
        version: currentVersion
      }
    : await readLocalPackageVersion();
  const resolvedPackageName = packageName ?? local.name;

  const checkResult = version
    ? {
        ok: true,
        status: "update_available",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion: version
      }
    : await checkForUpdate({
        currentVersion: local.version,
        packageName: resolvedPackageName,
        registryBase,
        fetchImpl,
        timeoutMs
      });

  if (checkResult.status !== "update_available") {
    return {
      ...checkResult,
      installPerformed: false,
      restartRequired: false,
      requiresUserConfirmation: true,
      silentInstall: false,
      backgroundUpdaterRegistered: false,
      backupCreated: false,
      rollbackAvailable: false
    };
  }

  const repoRoot = resolveRepoRoot(explicitRepoRoot);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-update-"));
  const downloadDir = path.join(tempRoot, "download");
  const extractDir = path.join(tempRoot, "extract");
  const backupDir = path.join(tempRoot, "backup");
  await fs.mkdir(downloadDir, { recursive: true });
  await fs.mkdir(extractDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });

  const nativeOptions = {
    execFileImpl,
    timeoutMs
  };

  try {
    const packResult = await runNative(
      "npm",
      ["pack", `${resolvedPackageName}@${checkResult.latestVersion}`, "--pack-destination", downloadDir],
      nativeOptions,
      `下载 Codex Pro ${checkResult.latestVersion} 更新包失败。`
    );
    const tarballPath = resolvePackedTarball(packResult.stdout, downloadDir);

    await runNative(
      "tar",
      ["-xf", tarballPath, "-C", extractDir],
      nativeOptions,
      "解压更新包失败。"
    );

    const packageDir = path.join(extractDir, "package");
    if (!(await pathExists(packageDir))) {
      throw new Error("解压更新包失败：没有找到 package 目录。");
    }

    await backupCurrentEntries(repoRoot, packageDir, backupDir);

    try {
      await installPackageEntries(repoRoot, packageDir);
      await refreshNodeDependencies(repoRoot, nativeOptions);
      const python = await refreshPythonLauncherDependencies(repoRoot, nativeOptions);
      return {
        ok: true,
        status: "update_installed",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion: checkResult.latestVersion,
        installPerformed: true,
        restartRequired: true,
        requiresUserConfirmation: true,
        silentInstall: false,
        backgroundUpdaterRegistered: false,
        backupCreated: true,
        rollbackAvailable: true,
        pythonDependenciesRefreshed: python.refreshed,
        message: `已安装 Codex Pro ${checkResult.latestVersion}。更新前已备份当前版本；请关闭并重新打开 Codex，切到新版本。`,
        nextAction: "关闭并重新打开 Codex，继续像平常一样使用。"
      };
    } catch (error) {
      try {
        await restoreBackedUpEntries(repoRoot, packageDir, backupDir);
      } catch (restoreError) {
        throw new Error(formatCommandFailure(
          restoreError,
          "这次没有完成更新，且自动恢复当前版本时遇到问题。请继续使用现有 Codex 入口，并保留日志用于排障。"
        ));
      }
      throw new Error(formatCommandFailure(
        error,
        "这次没有完成更新。已恢复当前版本，Codex Pro 仍可继续使用。"
      ));
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installAvailableUpdate } from "../src/update-install.js";

async function createRepoFixture(rootDir, version = "0.2.5") {
  const repoRoot = path.join(rootDir, "repo");
  await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "launcher-python"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "package.json"), `${JSON.stringify({
    name: "codex-pro",
    version,
    description: "fixture"
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(repoRoot, "README.md"), `Codex Pro ${version}\n`, "utf8");
  await fs.writeFile(path.join(repoRoot, "src", "marker.js"), `export default "${version}";\n`, "utf8");
  await fs.writeFile(path.join(repoRoot, "launcher-python", "requirements.txt"), "playwright==1.0.0\n", "utf8");
  return repoRoot;
}

async function createPackedPackageFixture(rootDir, version = "0.2.6") {
  const packageRoot = path.join(rootDir, "package-fixture");
  await fs.mkdir(path.join(packageRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(packageRoot, "launcher-python"), { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify({
    name: "codex-pro",
    version,
    description: "fixture"
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(packageRoot, "README.md"), `Codex Pro ${version}\n`, "utf8");
  await fs.writeFile(path.join(packageRoot, "src", "marker.js"), `export default "${version}";\n`, "utf8");
  await fs.writeFile(path.join(packageRoot, "launcher-python", "requirements.txt"), "playwright==2.0.0\n", "utf8");
  return packageRoot;
}

test("installAvailableUpdate downloads, installs and refreshes dependencies", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-update-install-"));
  const repoRoot = await createRepoFixture(tempRoot);
  const packageFixture = await createPackedPackageFixture(tempRoot);
  const calls = [];

  const execFileImpl = async (filePath, args) => {
    calls.push([filePath, args]);
    if (filePath === "npm" && args[0] === "pack") {
      const destination = args[args.indexOf("--pack-destination") + 1];
      await fs.writeFile(path.join(destination, "codex-pro-0.2.6.tgz"), "fake tgz", "utf8");
      return { stdout: "codex-pro-0.2.6.tgz\n", stderr: "" };
    }
    if (filePath === "tar") {
      const destination = args[args.indexOf("-C") + 1];
      await fs.mkdir(destination, { recursive: true });
      await fs.cp(packageFixture, path.join(destination, "package"), { recursive: true, force: true });
      return { stdout: "", stderr: "" };
    }
    if (filePath === "npm" && args[0] === "install") {
      return { stdout: "installed\n", stderr: "" };
    }
    if (filePath === "py") {
      return { stdout: "python ok\n", stderr: "" };
    }
    throw new Error(`Unexpected command: ${filePath} ${args.join(" ")}`);
  };

  try {
    const result = await installAvailableUpdate({
      currentVersion: "0.2.5",
      packageName: "codex-pro",
      registryBase: "https://registry.example.test",
      repoRoot,
      execFileImpl,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { version: "0.2.6" };
        }
      })
    });

    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
    const marker = await fs.readFile(path.join(repoRoot, "src", "marker.js"), "utf8");
    const requirements = await fs.readFile(path.join(repoRoot, "launcher-python", "requirements.txt"), "utf8");

    assert.equal(result.status, "update_installed");
    assert.equal(result.currentVersion, "0.2.5");
    assert.equal(result.latestVersion, "0.2.6");
    assert.equal(result.installPerformed, true);
    assert.equal(result.restartRequired, true);
    assert.equal(result.requiresUserConfirmation, true);
    assert.equal(result.silentInstall, false);
    assert.equal(result.backgroundUpdaterRegistered, false);
    assert.equal(result.backupCreated, true);
    assert.equal(result.rollbackAvailable, true);
    assert.equal(manifest.version, "0.2.6");
    assert.match(marker, /0\.2\.6/);
    assert.match(requirements, /2\.0\.0/);
    assert.match(result.message, /重新打开 Codex/);
    assert.match(result.message, /更新前已备份当前版本/);
    assert.ok(calls.some(([filePath, args]) => filePath === "npm" && args[0] === "install"));
    assert.ok(calls.some(([filePath]) => filePath === "py"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("installAvailableUpdate restores previous files when dependency refresh fails", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pro-update-rollback-"));
  const repoRoot = await createRepoFixture(tempRoot);
  const packageFixture = await createPackedPackageFixture(tempRoot);

  const execFileImpl = async (filePath, args) => {
    if (filePath === "npm" && args[0] === "pack") {
      const destination = args[args.indexOf("--pack-destination") + 1];
      await fs.writeFile(path.join(destination, "codex-pro-0.2.6.tgz"), "fake tgz", "utf8");
      return { stdout: "codex-pro-0.2.6.tgz\n", stderr: "" };
    }
    if (filePath === "tar") {
      const destination = args[args.indexOf("-C") + 1];
      await fs.mkdir(destination, { recursive: true });
      await fs.cp(packageFixture, path.join(destination, "package"), { recursive: true, force: true });
      return { stdout: "", stderr: "" };
    }
    if (filePath === "npm" && args[0] === "install") {
      const error = new Error("install failed");
      error.stderr = "npm install failed";
      throw error;
    }
    return { stdout: "", stderr: "" };
  };

  try {
    await assert.rejects(() => installAvailableUpdate({
      currentVersion: "0.2.5",
      packageName: "codex-pro",
      registryBase: "https://registry.example.test",
      repoRoot,
      execFileImpl,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { version: "0.2.6" };
        }
      })
    }), /这次没有完成更新。已恢复当前版本，Codex Pro 仍可继续使用。[\s\S]*刷新 Node\.js 依赖失败/);

    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
    const marker = await fs.readFile(path.join(repoRoot, "src", "marker.js"), "utf8");

    assert.equal(manifest.version, "0.2.5");
    assert.match(marker, /0\.2\.5/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

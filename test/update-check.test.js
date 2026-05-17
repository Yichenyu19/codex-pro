import test from "node:test";
import assert from "node:assert/strict";

import { checkForUpdate, compareVersions } from "../src/update-check.js";

test("compareVersions handles simple semantic versions", () => {
  assert.equal(compareVersions("0.2.6", "0.2.5"), 1);
  assert.equal(compareVersions("0.2.5", "0.2.5"), 0);
  assert.equal(compareVersions("0.2.4", "0.2.5"), -1);
  assert.equal(compareVersions("v1.0.0", "0.9.9"), 1);
});

test("checkForUpdate reports available updates with confirmation guidance", async () => {
  const calls = [];
  const result = await checkForUpdate({
    currentVersion: "0.2.5",
    packageName: "codex-pro",
    registryBase: "https://registry.example.test",
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { version: "0.2.6" };
        }
      };
    }
  });

  assert.equal(result.status, "update_available");
  assert.equal(result.currentVersion, "0.2.5");
  assert.equal(result.latestVersion, "0.2.6");
  assert.match(result.message, /确认后可安装/);
  assert.match(result.message, /不会静默更新/);
  assert.equal(calls[0], "https://registry.example.test/codex-pro/latest");
});

test("checkForUpdate treats unpublished packages as a friendly first-release state", async () => {
  const result = await checkForUpdate({
    currentVersion: "0.2.5",
    packageName: "codex-pro",
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        return {};
      }
    })
  });

  assert.equal(result.status, "not_published");
  assert.match(result.message, /还没有读到公开发布信息/);
});

test("checkForUpdate does not throw when the registry is unavailable", async () => {
  const result = await checkForUpdate({
    currentVersion: "0.2.5",
    packageName: "codex-pro",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });

  assert.equal(result.status, "unavailable");
  assert.match(result.message, /不会阻塞启动/);
});

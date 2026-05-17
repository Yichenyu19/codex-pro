import fs from "node:fs/promises";

const DEFAULT_PACKAGE_NAME = "codex-pro";
const DEFAULT_REGISTRY_BASE = "https://registry.npmjs.org";
const DEFAULT_TIMEOUT_MS = 3000;

function parseVersionParts(version) {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^\d].*$/, ""), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return 0;
}

export async function readLocalPackageVersion() {
  const packageUrl = new URL("../package.json", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(packageUrl, "utf8"));
  return {
    name: manifest.name ?? DEFAULT_PACKAGE_NAME,
    version: manifest.version ?? "0.0.0"
  };
}

function packageUrl(registryBase, packageName) {
  const encoded = packageName.startsWith("@")
    ? packageName.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(packageName);
  return `${String(registryBase).replace(/\/+$/, "")}/${encoded}/latest`;
}

export async function checkForUpdate({
  currentVersion,
  packageName = DEFAULT_PACKAGE_NAME,
  registryBase = DEFAULT_REGISTRY_BASE,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const local = currentVersion
    ? { name: packageName, version: currentVersion }
    : await readLocalPackageVersion();
  const resolvedPackageName = packageName || local.name || DEFAULT_PACKAGE_NAME;

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      status: "unavailable",
      packageName: resolvedPackageName,
      currentVersion: local.version,
      latestVersion: null,
      message: "当前运行环境暂时不能联网检查更新。"
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = packageUrl(registryBase, resolvedPackageName);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (response.status === 404) {
      return {
        ok: true,
        status: "not_published",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion: null,
        url,
        message: "当前还没有读到公开发布信息。发布到 npm 后，这里会显示最新版本。"
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: "unavailable",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion: null,
        url,
        message: "这次没有检查到更新信息。稍后再试即可。"
      };
    }

    const payload = await response.json();
    const latestVersion = typeof payload?.version === "string" ? payload.version : null;
    if (!latestVersion) {
      return {
        ok: false,
        status: "unavailable",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion: null,
        url,
        message: "这次没有读到有效版本号。稍后再试即可。"
      };
    }

    const comparison = compareVersions(latestVersion, local.version);
    if (comparison > 0) {
      return {
        ok: true,
        status: "update_available",
        packageName: resolvedPackageName,
        currentVersion: local.version,
        latestVersion,
        url,
        message: `发现新版本 ${latestVersion}。确认后可安装；不会静默更新，更新后重新打开 Codex 即可。`
      };
    }

    return {
      ok: true,
      status: "current",
      packageName: resolvedPackageName,
      currentVersion: local.version,
      latestVersion,
      url,
      message: "当前已经是最新公开版本。"
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      packageName: resolvedPackageName,
      currentVersion: local.version,
      latestVersion: null,
      url,
      message: error?.name === "AbortError"
        ? "检查更新超时。Codex Pro 不会阻塞启动，可以稍后再试。"
        : "这次没有检查到更新信息。Codex Pro 不会阻塞启动，可以稍后再试。"
    };
  } finally {
    clearTimeout(timer);
  }
}

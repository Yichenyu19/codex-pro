import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getStatus,
  getProductManagementStatus,
  runHistoryDoctor,
  runResumeFallback,
  runGuardStatus
} from "../src/service.js";

function parseArgs(argv) {
  const options = {
    codexHome: undefined,
    limit: 12
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--codex-home") {
      options.codexHome = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const next = Number.parseInt(argv[index + 1] ?? "", 10);
      if (Number.isInteger(next) && next > 0) {
        options.limit = next;
      }
      index += 1;
    }
  }

  return options;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(repoRoot, "artifacts", "real-codex-state");

const options = parseArgs(process.argv.slice(2));

try {
  const doctor = await runHistoryDoctor({ codexHome: options.codexHome });
  const status = await getStatus({ codexHome: options.codexHome, history: doctor });
  const candidates = await runResumeFallback({
    codexHome: options.codexHome,
    limit: options.limit
  });
  const guard = await runGuardStatus();
  const management = await getProductManagementStatus({ codexHome: options.codexHome });
  const takeover = management.takeover ?? {};
  const primaryEntryDetected = Boolean(takeover.desktopShortcutPath || takeover.startMenuShortcutPath);
  const normalOpenCodexReady = Boolean(takeover.desktopTakenOver || takeover.startMenuTakenOver);
  const installCanCreateNativeCodexEntry = Boolean(takeover.canCreateDesktopShortcut || takeover.canCreateStartMenuShortcut);
  const normalOpenCodexReadyAfterInstall = normalOpenCodexReady || installCanCreateNativeCodexEntry;

  const sourceCounts = candidates.reduce((counts, entry) => {
    const key = entry.source || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const summary = {
    codexHome: status.codexHome,
    currentProvider: status.currentProvider,
    configuredProviders: status.configuredProviders,
    rolloutCounts: status.rolloutCounts,
    sqliteCounts: status.sqliteCounts,
    historyVisibility: status.historyVisibility,
    recoveryPlan: {
      summary: status.historyVisibility?.summary ?? "历史状态看起来正常。",
      primaryAction: status.historyVisibility?.primaryAction ?? "继续使用即可。",
      steps: status.historyVisibility?.steps ?? []
    },
    takeover: {
      enabled: Boolean(takeover.enabled),
      mode: takeover.mode ?? "disabled",
      desktopShortcutPath: takeover.desktopShortcutPath ?? null,
      desktopTakenOver: Boolean(takeover.desktopTakenOver),
      startMenuShortcutPath: takeover.startMenuShortcutPath ?? null,
      startMenuTakenOver: Boolean(takeover.startMenuTakenOver),
      canCreateDesktopShortcut: Boolean(takeover.canCreateDesktopShortcut),
      canCreateStartMenuShortcut: Boolean(takeover.canCreateStartMenuShortcut),
      codexExecutablePath: takeover.codexExecutablePath ?? null,
      maintenanceOnly: Boolean(takeover.maintenanceOnly),
      primaryEntryDetected,
      normalOpenCodexReady,
      installCanCreateNativeCodexEntry,
      normalOpenCodexReadyAfterInstall,
      summary: normalOpenCodexReady
        ? "当前已经检测到被增强接管的 Codex 入口，普通用户继续正常打开 Codex 即可。"
        : installCanCreateNativeCodexEntry
          ? "当前还没有已接管的 Codex 入口，但安装时可以自动创建原生 Codex 入口并接管。"
          : "当前还没有检测到可直接接管的 Codex 主入口，这台机器会先退回维护入口模式。"
    },
    management: {
      compatibilityMode: Boolean(management.compatibilityMode),
      maintenanceLauncherPath: management.maintenanceLauncherPath ?? null,
      launcherLogPath: management.launcherLogPath ?? null,
      startMenuDir: management.startMenuDir ?? null,
      recoveryPath: [
        "修复历史",
        "重建索引",
        "打开高级修复入口"
      ],
      normalOpenCodexReady,
      normalOpenCodexReadyAfterInstall
    },
    doctor: {
      rolloutFileCount: doctor.rolloutFileCount,
      sessionIndexCount: doctor.sessionIndexCount,
      savedWorkspaceRootCount: doctor.savedWorkspaceRootCount,
      activeWorkspaceRootCount: doctor.activeWorkspaceRootCount,
      missingActiveRoots: doctor.missingActiveRoots,
      sessionIndexRisk: doctor.sessionIndexRisk
    },
    resumeFallback: {
      candidateCount: candidates.length,
      sourceCounts,
      firstCandidates: candidates.slice(0, 5).map((entry) => ({
        id: entry.id,
        thread_name: entry.thread_name,
        source: entry.source,
        source_label: entry.source_label,
        updated_at: entry.updated_at
      }))
    },
    guard: {
      running: guard.running,
      pid: guard.pid,
      logPath: guard.logPath
    }
  };

  await fs.mkdir(artifactDir, { recursive: true });
  const summaryPath = path.join(artifactDir, "validation-summary.json");
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("Real Codex state validation passed.");
  console.log(`Codex home: ${summary.codexHome}`);
  console.log(`History visibility: ${summary.historyVisibility?.summary ?? "历史状态看起来正常。"}`);
  console.log(`Takeover summary: ${summary.takeover.summary}`);
  console.log(`Resume fallback candidates: ${summary.resumeFallback.candidateCount}`);
  console.log(`Summary: ${summaryPath}`);
} catch (error) {
  console.error(`Real Codex state validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

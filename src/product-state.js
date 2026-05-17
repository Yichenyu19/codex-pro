import { DEFAULT_PROVIDER } from "./constants.js";

export const PRODUCT_STATES = Object.freeze({
  HEALTHY: "healthy",
  REPAIRING: "repairing",
  RECOVERABLE: "recoverable",
  COMPATIBILITY: "compatibility",
  NEEDS_CONFIRMATION: "needs_confirmation",
  BLOCKED: "blocked"
});

const PRODUCT_STATE_LABELS = Object.freeze({
  [PRODUCT_STATES.HEALTHY]: "历史正常",
  [PRODUCT_STATES.REPAIRING]: "正在修复",
  [PRODUCT_STATES.RECOVERABLE]: "可以恢复",
  [PRODUCT_STATES.COMPATIBILITY]: "兼容模式",
  [PRODUCT_STATES.NEEDS_CONFIRMATION]: "需要确认",
  [PRODUCT_STATES.BLOCKED]: "暂时受阻"
});

export function buildRecoverySteps() {
  return [
    "先点修复历史显示。",
    "如果还没恢复，再点重建历史索引。",
    "如果还是不对，再点打开高级修复。"
  ];
}

function countNonCurrentProviders(counts, currentProvider) {
  return Object.entries(counts ?? {}).reduce((total, [provider, count]) => {
    if (provider === currentProvider || provider === "(missing)") {
      return total;
    }
    return total + Number(count ?? 0);
  }, 0);
}

function hasProviderBucketRisk(status) {
  const currentProvider = status.currentProvider ?? DEFAULT_PROVIDER;
  const rolloutNonCurrent = countNonCurrentProviders(status.rolloutCounts?.sessions, currentProvider)
    + countNonCurrentProviders(status.rolloutCounts?.archived_sessions, currentProvider);
  const sqliteNonCurrent = countNonCurrentProviders(status.sqliteCounts?.sessions, currentProvider)
    + countNonCurrentProviders(status.sqliteCounts?.archived_sessions, currentProvider);
  return (rolloutNonCurrent + sqliteNonCurrent) > 0;
}

function hasSqliteMetadataMismatch(status) {
  return Boolean(
    Number(status.sqliteRepairStats?.userEventRowsNeedingRepair ?? 0) > 0
    || Number(status.sqliteRepairStats?.cwdRowsNeedingRepair ?? 0) > 0
  );
}

export function buildHistoryVisibility(history, status) {
  const rolloutFileCount = Number(history?.rolloutFileCount ?? 0);
  const sessionIndexCount = Number(history?.sessionIndexCount ?? 0);
  const savedWorkspaceRootCount = Number(history?.savedWorkspaceRootCount ?? 0);
  const activeWorkspaceRootCount = Number(history?.activeWorkspaceRootCount ?? 0);
  const missingActiveRootsCount = Array.isArray(history?.missingActiveRoots) ? history.missingActiveRoots.length : 0;
  const indexRisk = history?.sessionIndexRisk ?? {
    sessionIndexEmpty: false,
    sessionIndexSparse: false,
    rolloutIndexMismatch: false
  };
  const providerBucketRisk = hasProviderBucketRisk(status);
  const workspaceRootMismatch = missingActiveRootsCount > 0;
  const sqliteMetadataMismatch = hasSqliteMetadataMismatch(status);
  const flags = {
    providerBucketRisk,
    sessionIndexEmpty: Boolean(indexRisk.sessionIndexEmpty),
    sessionIndexSparse: Boolean(indexRisk.sessionIndexSparse),
    rolloutIndexMismatch: Boolean(indexRisk.rolloutIndexMismatch),
    workspaceRootMismatch,
    sqliteMetadataMismatch
  };

  let severity = "ok";
  if (flags.sessionIndexEmpty || flags.sessionIndexSparse || flags.rolloutIndexMismatch || flags.providerBucketRisk || flags.sqliteMetadataMismatch) {
    severity = "warning";
  } else if (flags.workspaceRootMismatch) {
    severity = "notice";
  }

  let summary = "历史状态看起来正常。";
  if (flags.sessionIndexEmpty || flags.rolloutIndexMismatch) {
    summary = "历史没有完整显示，但本地记录大概率还在，先修复历史显示或重建历史索引。";
  } else if (flags.sessionIndexSparse) {
    summary = "历史列表可能没有显示完整，系统会优先从本地历史里补找会话。";
  } else if (flags.providerBucketRisk) {
    summary = "你最近切换了渠道或 provider，旧历史可能被分散显示，不一定是真的丢了。";
  } else if (flags.sqliteMetadataMismatch) {
    summary = "本地历史元数据有些错位，修复后通常能恢复完整显示。";
  } else if (flags.workspaceRootMismatch) {
    summary = "当前工作区显示可能不完整，修复历史显示后通常会恢复。";
  }

  return {
    severity,
    summary,
    primaryAction: severity === "ok" ? "继续使用即可。" : "先点修复历史显示。",
    steps: buildRecoverySteps(),
    flags,
    counts: {
      rolloutFileCount,
      sessionIndexCount,
      savedWorkspaceRootCount,
      activeWorkspaceRootCount,
      missingActiveRootsCount
    }
  };
}

export function buildProductState({
  historyVisibility,
  diagnosis,
  operation,
  needsConfirmation = false,
  blockedReason = null
} = {}) {
  const recoveryNeeded = historyVisibility?.severity !== undefined && historyVisibility.severity !== "ok";
  let kind = PRODUCT_STATES.HEALTHY;
  let reason = "history-ok";

  if (blockedReason) {
    kind = PRODUCT_STATES.BLOCKED;
    reason = String(blockedReason);
  } else if (needsConfirmation) {
    kind = PRODUCT_STATES.NEEDS_CONFIRMATION;
    reason = "user-confirmation-required";
  } else if (operation === "repairing" || operation?.state === "repairing") {
    kind = PRODUCT_STATES.REPAIRING;
    reason = "repair-in-progress";
  } else if (diagnosis?.status === "unsupported") {
    kind = PRODUCT_STATES.COMPATIBILITY;
    reason = recoveryNeeded ? "compatibility-with-recovery-needed" : "compatibility-ready";
  } else if (recoveryNeeded) {
    kind = PRODUCT_STATES.RECOVERABLE;
    reason = historyVisibility?.severity === "notice" ? "recoverable-notice" : "recoverable-warning";
  }

  return {
    kind,
    label: PRODUCT_STATE_LABELS[kind],
    reason,
    recoveryNeeded,
    compatibilityMode: kind === PRODUCT_STATES.COMPATIBILITY,
    canContinue: kind !== PRODUCT_STATES.BLOCKED,
    primaryAction: historyVisibility?.primaryAction ?? "继续使用即可。",
    steps: buildRecoverySteps()
  };
}

export function buildHistoryRecoveryPlan(historyVisibility, diagnosis) {
  const diagnosisStatus = diagnosis?.status ?? "unknown";
  const hasHistoryMismatch = historyVisibility?.severity !== "ok";
  const productState = buildProductState({ historyVisibility, diagnosis });
  const sharedSteps = buildRecoverySteps();

  if (diagnosisStatus === "supported") {
    return hasHistoryMismatch
      ? {
          state: productState.kind,
          productState,
          uiMode: "injected_repair_available",
          summary: `当前仍可继续使用，历史保护仍生效。${historyVisibility.summary}`,
          primaryAction: historyVisibility.primaryAction,
          nextSteps: sharedSteps
        }
      : {
          state: productState.kind,
          productState,
          uiMode: "injected_ready",
          summary: "当前仍可继续使用，历史保护仍生效。",
          primaryAction: "继续正常打开 Codex 即可。",
          nextSteps: [
            "继续像平常一样打开 Codex。",
            "如果以后历史短暂消失，先等自动守护修复。"
          ]
        };
  }

  if (diagnosisStatus === "unsupported") {
    return hasHistoryMismatch
      ? {
          state: productState.kind,
          productState,
          uiMode: "compatibility_repair_needed",
          summary: `当前仍可继续使用，历史保护仍生效。${historyVisibility.summary}`,
          primaryAction: historyVisibility.primaryAction,
          nextSteps: sharedSteps
        }
      : {
          state: productState.kind,
          productState,
          uiMode: "compatibility_ready",
          summary: "当前仍可继续使用，历史保护仍生效。兼容模式是安全回退，不是失败。",
          primaryAction: "继续正常打开 Codex 即可。",
          nextSteps: [
            "继续像平常一样打开 Codex。",
            "如果历史没显示完整，先点修复历史显示。",
            "仍不完整时再点重建历史索引，然后打开高级修复。"
          ]
        };
  }

  return hasHistoryMismatch
    ? {
        state: productState.kind,
        productState,
        uiMode: "diagnosis_unknown_repair_needed",
        summary: `当前仍可继续使用，历史保护仍生效。${historyVisibility.summary}`,
        primaryAction: historyVisibility.primaryAction,
        nextSteps: sharedSteps
      }
    : {
        state: productState.kind,
        productState,
        uiMode: "diagnosis_unknown_ready",
        summary: "当前仍可继续使用，历史保护仍生效。",
        primaryAction: "继续正常打开 Codex 即可。",
        nextSteps: [
          "继续像平常一样打开 Codex。",
          "如果想确认是否支持真实侧栏增强，再运行 Codex Pro Injection Check。"
        ]
      };
}

(function installCodexPro() {
  if (window.__CODEX_PRO_INSTALLED__ || window.__CODEX_HISTORY_GUARD_INSTALLED__) {
    return;
  }
  window.__CODEX_PRO_INSTALLED__ = true;
  window.__CODEX_HISTORY_GUARD_INSTALLED__ = true;

  const styleId = "codex-history-guard-style";
  const launcherId = "codex-history-guard-launcher";
  const launcherWrapperId = "codex-history-guard-launcher-wrapper";
  const panelId = "codex-history-guard-panel";
  const resultId = "codex-history-guard-result";
  const searchInputId = "codex-history-guard-search";
  const sessionsId = "codex-history-guard-sessions";
  const statusId = "codex-history-guard-status";
  const alertId = "codex-history-guard-alert";
  const sidebarRepairId = "codex-history-guard-sidebar-repair";
  const managementId = "codex-history-guard-management";
  const pluginStatusId = "codex-history-guard-plugin-status";
  const pluginInstallStatusId = "codex-history-guard-plugin-install-status";
  const timelineStatusId = "codex-history-guard-timeline-status";
  const timelineId = "codex-history-guard-timeline";
  const rowDeleteClass = "chg-row-delete";
  const toastClass = "chg-toast";
  const confirmOverlayClass = "chg-confirm-overlay";
  let lastUndoToken = null;
  let bootStarted = false;
  let rescueStage = "repair";
  let updatePromptChecked = false;
  let updatePromptShown = false;
  const bridgeAuthHeaders = (() => {
    const token = typeof window.__CODEX_PRO_BRIDGE_TOKEN__ === "string"
      ? window.__CODEX_PRO_BRIDGE_TOKEN__.trim()
      : typeof window.__CODEX_HISTORY_GUARD_BRIDGE_TOKEN__ === "string"
        ? window.__CODEX_HISTORY_GUARD_BRIDGE_TOKEN__.trim()
        : "";
    return token ? { "X-Codex-Pro-Token": token } : {};
  })();

  function getHistoryVisibility(payload) {
    return payload?.historyVisibility ?? null;
  }

  function hasHistoryWarning(payload) {
    return getHistoryVisibility(payload)?.severity === "warning";
  }

  function getRecoveryState(payload) {
    const productState = payload?.productState
      || payload?.doctor?.productState
      || payload?.recoveryPlan?.productState
      || null;
    const historyVisibility = getHistoryVisibility(payload);
    const issues = evaluateDoctorIssues(payload?.doctor, historyVisibility);
    const needsHelp = productState
      ? Boolean(productState.recoveryNeeded)
      : hasHistoryWarning(payload) || issues.length > 0;
    return {
      productState,
      historyVisibility,
      issues,
      needsHelp,
    };
  }

  function nextRescueStage(currentStage, needsHelp) {
    if (!needsHelp) {
      return "repair";
    }
    if (currentStage === "advanced" || currentStage === "open-start-menu-dir") {
      return "advanced";
    }
    if (currentStage === "rebuild" || currentStage === "repair-sidebar") {
      return "advanced";
    }
    return "rebuild";
  }

  function resolvePrimaryRescue(payload) {
    const { historyVisibility, issues, needsHelp } = getRecoveryState(payload);
    const stage = needsHelp ? rescueStage : "repair";
    if (!needsHelp) {
      if (historyVisibility?.severity === "notice") {
        return {
          tone: "ok",
          status: "已恢复",
          title: "历史显示已经恢复",
          copy: "已恢复，可以继续使用 Codex。",
          safety: "不会改账号、模型或 API 地址。",
          button: "检查一次",
          action: "status",
          stage: "repair",
        };
      }
      return {
        tone: "ok",
        status: "正常",
        title: "历史正常",
        copy: "继续打开 Codex 即可。",
        safety: "不会改账号、模型或 API 地址。",
        button: "检查一次",
        action: "status",
        stage: "repair",
      };
    }

    if (stage === "advanced") {
      return {
        tone: "warn",
        status: "仍不完整",
        title: "历史可能还没完全显示",
        copy: "前两步没有恢复时，再打开高级修复。",
        safety: "不会改账号、模型或 API 地址。",
        button: "打开高级修复",
        action: "open-start-menu-dir",
        stage: "advanced",
        issues,
      };
    }

    if (stage === "rebuild") {
      return {
        tone: "warn",
        status: "需要重建历史索引",
        title: "历史可能没显示完整",
        copy: "本地记录还在。点一下，先让它重新显示。",
        safety: "不会改账号、模型或 API 地址。",
        button: "重建历史索引",
        action: "rebuild",
        stage: "rebuild",
        issues,
      };
    }

    return {
      tone: "warn",
      status: "需要修复",
      title: "历史可能没显示完整",
      copy: "本地记录还在。点一下，让它重新显示。",
      safety: "不会改账号、模型或 API 地址。",
      button: "修复历史显示",
      action: "repair",
      stage: "repair",
      issues,
    };
  }

  function installStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      :root {
        --chg-surface: rgba(25, 29, 37, 0.58);
        --chg-surface-strong: rgba(18, 22, 30, 0.76);
        --chg-surface-soft: rgba(255, 255, 255, 0.075);
        --chg-line: rgba(255, 255, 255, 0.16);
        --chg-line-strong: rgba(255, 255, 255, 0.30);
        --chg-text: rgba(247, 249, 252, 0.96);
        --chg-muted: rgba(213, 220, 230, 0.66);
        --chg-faint: rgba(213, 220, 230, 0.44);
        --chg-accent: #f5f8ff;
        --chg-blue: #8ec5ff;
        --chg-green: #91f2bb;
        --chg-warn: #ffd49a;
        --chg-blur: blur(34px) saturate(1.55) brightness(1.08);
        --chg-radius-xl: 32px;
        --chg-radius-lg: 22px;
        --chg-radius-md: 15px;
        --chg-glass-sheen: linear-gradient(135deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.09) 28%, rgba(255, 255, 255, 0.025) 62%, rgba(142, 197, 255, 0.12));
        --chg-glass-depth: linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.045));
        --chg-shadow-sheet: 0 36px 100px rgba(0, 0, 0, 0.48), 0 18px 44px rgba(0, 0, 0, 0.22), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
        --chg-shadow-card: 0 18px 42px rgba(0, 0, 0, 0.22), 0 1px 0 rgba(255, 255, 255, 0.14) inset, 0 -1px 0 rgba(0, 0, 0, 0.28) inset;
        --chg-spring: cubic-bezier(.2, .9, .22, 1);
        --chg-font: "SF Pro Text", "Segoe UI Variable", "Segoe UI", "PingFang SC", sans-serif;
      }
      @keyframes chg-sheet-in {
        from { opacity: 0; transform: translate3d(18px, 10px, 0) scale(.982); filter: blur(6px); }
        to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
      }
      @keyframes chg-pop-in {
        from { opacity: 0; transform: translate3d(0, 10px, 0) scale(.965); }
        to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes chg-soft-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(142, 197, 255, 0); }
        50% { box-shadow: 0 0 0 6px rgba(142, 197, 255, 0.08); }
      }
      #${launcherWrapperId}[data-chg-trigger-mode="floating"] {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483600;
      }
      #${launcherId}[data-chg-trigger-mode="floating"] {
        position: fixed;
        display: inline-flex;
        align-items: center;
        gap: 0;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        background: rgba(21, 28, 38, 0.96);
        color: #f4f7fb;
        padding: 10px 12px;
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
        font: 12px/1.1 "Segoe UI", "PingFang SC", sans-serif;
        cursor: pointer;
        transition: opacity .16s ease, transform .16s ease, border-color .16s ease, background-color .16s ease;
      }
      #${launcherId}[data-chg-trigger-mode="floating"]:hover,
      #${launcherId}[data-chg-trigger-mode="floating"]:focus-visible {
        transform: translateY(-1px);
        border-color: rgba(180, 193, 211, 0.28);
        background: rgba(25, 34, 46, 0.98);
      }
      #${launcherId}[data-chg-trigger-mode="floating"] strong {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      #${launcherId}[data-chg-trigger-mode="floating"] span {
        max-width: 0;
        opacity: 0;
        overflow: hidden;
        white-space: nowrap;
        transition: max-width .18s ease, opacity .14s ease, margin-left .18s ease;
      }
      #${launcherId}[data-chg-trigger-mode="floating"]:hover span,
      #${launcherId}[data-chg-trigger-mode="floating"]:focus-visible span {
        max-width: 96px;
        opacity: 1;
        margin-left: 8px;
      }
      #${launcherWrapperId}[data-chg-trigger-mode="native"] {
        display: inline-flex;
        align-items: center;
        height: 100%;
        flex: 0 0 auto;
      }
      #${launcherWrapperId}[data-chg-trigger-mode="sidebar"] {
        display: block;
        width: 100%;
        margin: 2px 0 6px;
      }
      #${launcherId}[data-chg-trigger-mode="native"] {
        position: static;
        z-index: auto;
        display: inline-flex;
        align-items: center;
        gap: 0;
        border: 0;
        background: transparent !important;
        color: inherit;
        padding: 10px 12px;
        border-radius: 10px;
        box-shadow: none;
        font: inherit;
        cursor: pointer;
        transition: background-color .16s ease, color .16s ease;
      }
      #${launcherId}[data-chg-trigger-mode="native"]:hover,
      #${launcherId}[data-chg-trigger-mode="native"]:focus-visible {
        background: rgba(255, 255, 255, 0.04) !important;
        color: #f4f7fb;
        outline: none;
      }
      #${launcherId}[data-chg-trigger-mode="native"] strong {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      #${launcherId}[data-chg-trigger-mode="native"] span {
        display: none;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] {
        position: static;
        z-index: auto;
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 34px;
        gap: 10px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: inherit;
        padding: 7px 10px;
        box-shadow: none;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color .14s ease, color .14s ease;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"]:hover,
      #${launcherId}[data-chg-trigger-mode="sidebar"]:focus-visible {
        background: rgba(0, 0, 0, 0.045);
        outline: none;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] .chg-launcher-icon {
        display: inline-flex;
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        opacity: .72;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] strong {
        font-size: 14px;
        font-weight: 500;
        letter-spacing: -0.01em;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] .chg-launcher-subtitle {
        display: none;
      }
      #${panelId} {
        position: fixed;
        top: 92px;
        right: 24px;
        bottom: 24px;
        z-index: 2147483601;
        width: min(452px, calc(100vw - 40px));
        overflow: auto;
        border: 1px solid #273241;
        border-radius: 20px;
        background: #131922;
        color: #eef3fa;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.38);
        font: 13px/1.45 "Segoe UI", "PingFang SC", sans-serif;
      }
      #${panelId}[hidden] { display: none !important; }
      .chg-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 20px 14px;
        border-bottom: 1px solid #222b36;
      }
      .chg-title {
        font-size: 18px;
        font-weight: 700;
        color: #f4f7fb;
      }
      .chg-subtitle {
        margin-top: 6px;
        color: #9eabbc;
        font-size: 13px;
      }
      .chg-close {
        border: 0;
        background: transparent;
        color: #8f9bad;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }
      .chg-section {
        padding: 18px 20px 0;
      }
      .chg-section:last-of-type {
        padding-bottom: 20px;
      }
      .chg-primary-section {
        padding-top: 20px;
      }
      .chg-primary-card {
        display: grid;
        gap: 12px;
        padding: 22px;
        border: 1px solid #2a3340;
        border-radius: 24px;
        background: #171e28;
      }
      .chg-primary-pill {
        width: fit-content;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        padding: 5px 10px;
        color: #b7c4d4;
        background: rgba(255, 255, 255, 0.055);
        font-size: 12px;
        font-weight: 650;
      }
      .chg-primary-title {
        color: #f4f7fb;
        font-size: 26px;
        font-weight: 700;
        line-height: 1.16;
        letter-spacing: -0.04em;
      }
      .chg-primary-copy {
        color: #a5b1c0;
        font-size: 14px;
        line-height: 1.55;
      }
      .chg-primary-safety {
        color: #b9c5d4;
        font-size: 12px;
        line-height: 1.45;
      }
      .chg-primary-action {
        width: 100%;
        min-height: 46px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 700;
      }
      .chg-primary-result {
        margin-top: 12px;
        color: #98a6b8;
        font-size: 12px;
        line-height: 1.55;
      }
      #${alertId} {
        margin: 18px 20px 0;
        padding: 14px 16px;
        border: 1px solid #2a3340;
        border-radius: 14px;
        background: #171e28;
        color: #eef3fa;
      }
      #${alertId}[hidden] { display: none !important; }
      .chg-alert-title {
        font-size: 13px;
        font-weight: 700;
      }
      .chg-alert-copy {
        margin-top: 5px;
        color: #a5b1c0;
        font-size: 12px;
      }
      .chg-alert-actions {
        display: inline-flex;
        gap: 8px;
        margin-top: 10px;
      }
      #${sidebarRepairId} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 12px;
        padding: 12px 14px;
        border: 1px solid #2a3340;
        border-radius: 14px;
        background: #171e28;
        color: #eef3fa;
      }
      #${sidebarRepairId}[hidden] { display: none !important; }
      .chg-sidebar-repair-copy {
        min-width: 0;
        font: 12px/1.35 "Segoe UI", "PingFang SC", sans-serif;
      }
      .chg-sidebar-repair-copy strong {
        display: block;
        color: #f4f7fb;
        font-size: 13px;
        font-weight: 700;
      }
      .chg-sidebar-repair-copy span {
        display: block;
        margin-top: 4px;
        color: #9ba8ba;
      }
      .chg-sidebar-repair-btn {
        flex: 0 0 auto;
        border: 1px solid #3a485b;
        border-radius: 10px;
        background: #1b2430;
        color: #eef3fa;
        padding: 7px 11px;
        font: 12px/1 "Segoe UI", "PingFang SC", sans-serif;
        cursor: pointer;
      }
      .chg-summary-eyebrow {
        color: #8e9aac;
        font-size: 12px;
      }
      .chg-summary-headline {
        margin-top: 6px;
        color: #f4f7fb;
        font-size: 24px;
        font-weight: 700;
        line-height: 1.25;
      }
      .chg-summary-copy {
        margin-top: 6px;
        color: #a5b1c0;
      }
      .chg-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .chg-meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .chg-card {
        border: 1px solid #2a3340;
        border-radius: 14px;
        background: #171e28;
        padding: 12px 14px;
      }
      .chg-label {
        color: #8e9aac;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .chg-value {
        margin-top: 6px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        word-break: break-word;
      }
      .chg-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .chg-actions[data-layout="stacked"] {
        grid-template-columns: 1fr;
      }
      .chg-actions[data-layout="compact"] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .chg-section-title {
        margin: 0 0 10px;
        font-size: 13px;
        font-weight: 700;
        color: #f4f7fb;
      }
      .chg-section-copy {
        margin: 0 0 12px;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.55;
      }
      .chg-btn, .chg-input, .chg-item button {
        border-radius: 11px;
        font: inherit;
      }
      .chg-btn {
        border: 1px solid #3a485b;
        background: #1b2430;
        color: #eef3fa;
        padding: 10px 12px;
        cursor: pointer;
        transition: background-color .14s ease, border-color .14s ease, color .14s ease;
      }
      .chg-btn:hover,
      .chg-btn:focus-visible {
        background: #202a37;
        border-color: #4a5b72;
        outline: none;
      }
      .chg-btn[data-variant="warn"] {
        border-color: #3d4b5e;
        background: #191f29;
        color: #f0f4fa;
      }
      .chg-btn[data-variant="safe"] {
        border-color: #335544;
        background: #19232a;
        color: #edf7ef;
      }
      .chg-searchbar {
        display: flex;
        gap: 10px;
      }
      .chg-input {
        flex: 1;
        border: 1px solid #273241;
        background: #111721;
        color: #f4f7fb;
        padding: 11px 13px;
      }
      #${resultId} {
        white-space: pre-wrap;
        color: #c5d1de;
        background: #151c26;
        border: 1px solid #273241;
        border-radius: 14px;
        padding: 14px 16px;
        min-height: 80px;
        line-height: 1.6;
      }
      #${resultId}.chg-primary-result {
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
      }
      #${resultId}.chg-primary-result:empty {
        display: none;
      }
      #${sessionsId} {
        display: grid;
        gap: 10px;
      }
      .chg-search-results {
        padding-top: 14px;
      }
      .chg-item {
        border: 1px solid #273241;
        border-radius: 14px;
        background: #151c26;
        padding: 12px 14px;
      }
      .chg-item-title {
        font-weight: 600;
        color: #f8fafc;
        word-break: break-word;
      }
      .chg-item-meta {
        margin-top: 5px;
        color: #96a4b5;
        font-size: 12px;
        word-break: break-word;
      }
      .chg-inline-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .chg-timeline-jump {
        width: 100%;
        justify-content: flex-start;
        text-align: left;
      }
      .chg-timeline-target {
        outline: 2px solid rgba(59, 130, 246, 0.34);
        outline-offset: 4px;
        border-radius: 12px;
      }
      .${rowDeleteClass} {
        position: absolute;
        right: 32px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 30;
        opacity: 0;
        width: 24px;
        min-width: 24px;
        min-height: 24px;
        display: inline-grid;
        place-items: center;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: rgba(95, 99, 104, 0.42);
        padding: 0;
        cursor: pointer;
        transition: opacity .12s ease, background-color .12s ease, color .12s ease;
      }
      [data-chg-sidebar-row="true"]:hover .${rowDeleteClass},
      [data-chg-sidebar-row="true"]:focus-within .${rowDeleteClass} {
        opacity: 1;
      }
      .${rowDeleteClass}:hover,
      .${rowDeleteClass}:focus-visible {
        background: rgba(0, 0, 0, 0.055);
        color: rgba(60, 64, 67, 0.72);
        outline: none;
      }
      .${toastClass} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483645;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border-radius: 14px;
        background: rgba(20, 27, 38, 0.98);
        color: #eef3fa;
        padding: 11px 14px;
        border: 1px solid rgba(39, 50, 65, 0.9);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.26);
      }
      .${toastClass} button {
        border: 1px solid #36516a;
        background: #15212d;
        color: #eef3fa;
        border-radius: 9px;
        padding: 5px 9px;
        cursor: pointer;
      }
      .${confirmOverlayClass} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(6, 8, 12, 0.24);
        backdrop-filter: blur(4px);
      }
      .chg-confirm-card {
        width: min(380px, calc(100vw - 36px));
        border-radius: 16px;
        border: 1px solid #2a3340;
        background: #131922;
        color: #eef3fa;
        padding: 16px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
      }
      .chg-confirm-title {
        font-size: 16px;
        font-weight: 700;
      }
      .chg-confirm-copy {
        margin-top: 8px;
        color: #98a5b6;
        line-height: 1.55;
      }
      .chg-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      .chg-confirm-actions button {
        border-radius: 10px;
        padding: 8px 12px;
        cursor: pointer;
      }
      .chg-confirm-danger {
        border: 1px solid #3d4b5e;
        background: #191f29;
        color: #f0f4fa;
      }
      .chg-confirm-cancel {
        border: 1px solid #314052;
        background: #18212a;
        color: #dbe5f1;
      }
      .chg-advanced {
        margin-top: 18px;
        border: 1px solid #273241;
        border-radius: 14px;
        background: #151b24;
        overflow: hidden;
      }
      .chg-advanced summary {
        list-style: none;
        cursor: pointer;
        padding: 14px 16px;
        color: #f4f7fb;
        font-size: 13px;
        font-weight: 700;
      }
      .chg-advanced summary::-webkit-details-marker {
        display: none;
      }
      .chg-advanced[open] summary {
        border-bottom: 1px solid #232d39;
      }
      .chg-advanced-body {
        padding: 14px 16px 16px;
      }
      #${statusId} {
        color: #8fa0b5;
        font-size: 12px;
        padding: 14px 20px 20px;
      }
      #${launcherId}[data-chg-trigger-mode="native"] {
        min-height: 38px;
        padding: 9px 13px;
        border-radius: 999px;
        color: rgba(242, 246, 252, 0.82);
        transition: transform .22s var(--chg-spring), background-color .18s ease, color .18s ease, box-shadow .18s ease;
      }
      #${launcherId}[data-chg-trigger-mode="native"]:hover,
      #${launcherId}[data-chg-trigger-mode="native"]:focus-visible {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.075) !important;
        color: var(--chg-text);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
      }
      #${launcherId}[data-chg-trigger-mode="native"]:active {
        transform: translateY(0) scale(.982);
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] {
        color: rgba(36, 42, 52, 0.88);
      }
      #${launcherId}[data-chg-trigger-mode="floating"] {
        border-color: var(--chg-line);
        background: linear-gradient(135deg, rgba(36, 42, 52, 0.78), rgba(16, 19, 25, 0.86));
        color: var(--chg-text);
        box-shadow: var(--chg-shadow-card);
        backdrop-filter: var(--chg-blur);
        -webkit-backdrop-filter: var(--chg-blur);
      }
      #${panelId}:not([hidden]) {
        animation: chg-sheet-in .34s var(--chg-spring) both;
      }
      #${panelId} {
        isolation: isolate;
        border: 1px solid var(--chg-line);
        border-radius: var(--chg-radius-xl);
        background:
          radial-gradient(circle at 18% 0%, rgba(142, 197, 255, 0.16), transparent 34%),
          radial-gradient(circle at 94% 10%, rgba(255, 255, 255, 0.10), transparent 28%),
          linear-gradient(145deg, rgba(27, 31, 39, 0.88), rgba(12, 14, 19, 0.92));
        color: var(--chg-text);
        box-shadow: var(--chg-shadow-sheet);
        backdrop-filter: var(--chg-blur);
        -webkit-backdrop-filter: var(--chg-blur);
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
      }
      #${panelId}::before {
        content: "";
        position: sticky;
        top: 0;
        display: block;
        height: 1px;
        margin-bottom: -1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
        pointer-events: none;
        z-index: 2;
      }
      .chg-header {
        padding: 22px 22px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0));
      }
      .chg-title {
        color: var(--chg-text);
        font-size: 19px;
        font-weight: 650;
        letter-spacing: -0.02em;
      }
      .chg-subtitle,
      .chg-summary-copy,
      .chg-section-copy,
      .chg-alert-copy,
      .chg-confirm-copy {
        color: var(--chg-muted);
      }
      .chg-close {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        color: var(--chg-muted);
        transition: transform .2s var(--chg-spring), background-color .16s ease, color .16s ease;
      }
      .chg-close:hover,
      .chg-close:focus-visible {
        background: rgba(255, 255, 255, 0.08);
        color: var(--chg-text);
        outline: none;
      }
      .chg-close:active {
        transform: scale(.92);
      }
      #${alertId},
      #${sidebarRepairId},
      .chg-primary-card,
      .chg-card,
      .chg-item,
      #${resultId},
      .chg-advanced {
        border-color: var(--chg-line);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.072), rgba(255, 255, 255, 0.038));
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.055) inset;
        backdrop-filter: blur(18px) saturate(1.18);
        -webkit-backdrop-filter: blur(18px) saturate(1.18);
      }
      .chg-primary-card {
        position: relative;
        overflow: hidden;
        border-radius: 26px;
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.13), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.038));
        box-shadow: var(--chg-shadow-card);
      }
      .chg-primary-card::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), transparent 38%);
        opacity: .82;
      }
      .chg-primary-card > * {
        position: relative;
        z-index: 1;
      }
      .chg-primary-card[data-tone="warn"] {
        border-color: rgba(255, 212, 154, 0.22);
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 212, 154, 0.14), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.038));
      }
      .chg-primary-card[data-tone="ok"] {
        border-color: rgba(145, 242, 187, 0.20);
        background:
          radial-gradient(circle at 18% 0%, rgba(145, 242, 187, 0.13), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.038));
      }
      .chg-primary-pill {
        color: var(--chg-muted);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.055) inset;
      }
      .chg-primary-card[data-tone="warn"] .chg-primary-pill {
        color: var(--chg-warn);
        border-color: rgba(255, 212, 154, 0.22);
        background: rgba(255, 212, 154, 0.09);
      }
      .chg-primary-card[data-tone="ok"] .chg-primary-pill {
        color: var(--chg-green);
        border-color: rgba(145, 242, 187, 0.20);
        background: rgba(145, 242, 187, 0.08);
      }
      .chg-primary-title {
        color: var(--chg-text);
      }
      .chg-primary-copy,
      .chg-primary-result {
        color: var(--chg-muted);
      }
      .chg-primary-safety {
        color: var(--chg-faint);
      }
      #${alertId}:not([hidden]),
      #${sidebarRepairId}:not([hidden]) {
        animation: chg-pop-in .28s var(--chg-spring) both, chg-soft-pulse 2.8s ease-in-out 1;
      }
      #${sidebarRepairId} {
        border-radius: 16px;
        background:
          linear-gradient(135deg, rgba(142, 197, 255, 0.12), rgba(255, 255, 255, 0.038)),
          rgba(18, 22, 29, 0.72);
      }
      .chg-sidebar-repair-copy strong,
      .chg-section-title,
      .chg-alert-title {
        color: var(--chg-text);
        font-weight: 650;
      }
      .chg-summary-eyebrow,
      .chg-label,
      .chg-item-meta,
      #${statusId} {
        color: var(--chg-faint);
      }
      .chg-summary-headline {
        color: var(--chg-text);
        font-size: 25px;
        font-weight: 700;
        letter-spacing: -0.035em;
      }
      .chg-card {
        border-radius: 18px;
        box-shadow: var(--chg-shadow-card);
        transition: transform .22s var(--chg-spring), border-color .18s ease, background-color .18s ease;
      }
      .chg-card:hover {
        transform: translateY(-1px);
        border-color: var(--chg-line-strong);
      }
      .chg-value {
        color: var(--chg-text);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.018em;
      }
      .chg-btn,
      .chg-sidebar-repair-btn,
      .chg-confirm-actions button,
      .${toastClass} button,
      .chg-item button {
        min-height: 34px;
        border-color: rgba(255, 255, 255, 0.12);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.045));
        color: var(--chg-text);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.07) inset;
        transition: transform .18s var(--chg-spring), background-color .16s ease, border-color .16s ease, box-shadow .16s ease;
      }
      .chg-btn:hover,
      .chg-btn:focus-visible,
      .chg-sidebar-repair-btn:hover,
      .chg-sidebar-repair-btn:focus-visible,
      .chg-confirm-actions button:hover,
      .chg-confirm-actions button:focus-visible,
      .${toastClass} button:hover,
      .${toastClass} button:focus-visible {
        transform: translateY(-1px);
        border-color: rgba(255, 255, 255, 0.22);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.145), rgba(255, 255, 255, 0.065));
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.16), 0 1px 0 rgba(255, 255, 255, 0.09) inset;
        outline: none;
      }
      .chg-btn:active,
      .chg-sidebar-repair-btn:active,
      .chg-confirm-actions button:active,
      .${toastClass} button:active {
        transform: translateY(0) scale(.976);
      }
      .chg-btn[data-variant="safe"] {
        border-color: rgba(145, 242, 187, 0.22);
        background: linear-gradient(180deg, rgba(145, 242, 187, 0.14), rgba(255, 255, 255, 0.04));
      }
      .chg-primary-action {
        border-color: rgba(245, 248, 255, 0.30);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.11));
        color: #ffffff;
        box-shadow: 0 18px 32px rgba(0, 0, 0, 0.18), 0 1px 0 rgba(255, 255, 255, 0.13) inset;
      }
      .chg-btn[data-variant="warn"],
      .chg-confirm-danger {
        border-color: rgba(255, 212, 154, 0.22);
        background: linear-gradient(180deg, rgba(255, 212, 154, 0.14), rgba(255, 255, 255, 0.045));
      }
      .chg-input {
        border-color: var(--chg-line);
        background: rgba(255, 255, 255, 0.045);
        color: var(--chg-text);
        transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
      }
      .chg-input:focus {
        border-color: rgba(142, 197, 255, 0.44);
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 0 0 4px rgba(142, 197, 255, 0.12);
        outline: none;
      }
      .${rowDeleteClass} {
        right: 32px;
        border: 0;
        background: transparent;
        color: rgba(95, 99, 104, 0.42);
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        transition: opacity .16s ease, transform .2s var(--chg-spring), background-color .16s ease, color .16s ease;
      }
      [data-chg-sidebar-row="true"]:hover .${rowDeleteClass},
      [data-chg-sidebar-row="true"]:focus-within .${rowDeleteClass} {
        opacity: 1;
        transform: translateY(-50%);
      }
      .${rowDeleteClass}:hover,
      .${rowDeleteClass}:focus-visible {
        background: rgba(0, 0, 0, 0.055);
        color: rgba(60, 64, 67, 0.72);
      }
      .${toastClass} {
        animation: chg-pop-in .26s var(--chg-spring) both;
        border-color: var(--chg-line);
        border-radius: 18px;
        background: rgba(24, 28, 36, 0.82);
        color: var(--chg-text);
        box-shadow: var(--chg-shadow-card);
        backdrop-filter: var(--chg-blur);
        -webkit-backdrop-filter: var(--chg-blur);
      }
      .${confirmOverlayClass} {
        background: rgba(4, 7, 12, 0.30);
        backdrop-filter: blur(12px) saturate(1.2);
        -webkit-backdrop-filter: blur(12px) saturate(1.2);
      }
      .chg-confirm-card {
        animation: chg-pop-in .26s var(--chg-spring) both;
        border-color: var(--chg-line);
        border-radius: 22px;
        background:
          radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.12), transparent 32%),
          rgba(22, 25, 32, 0.88);
        color: var(--chg-text);
        box-shadow: var(--chg-shadow-sheet);
        backdrop-filter: var(--chg-blur);
        -webkit-backdrop-filter: var(--chg-blur);
      }
      .chg-advanced summary {
        color: var(--chg-text);
      }
      .chg-advanced[open] summary {
        border-bottom-color: rgba(255, 255, 255, 0.075);
      }
      /* Liquid glass release polish: applied last so it follows the real Codex chrome without requiring a framework. */
      #${launcherId} {
        font-family: var(--chg-font);
      }
      #${launcherId}::before {
        content: "";
        flex: 0 0 auto;
        width: 7px;
        height: 7px;
        margin-right: 8px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.96), rgba(142, 197, 255, 0.88) 34%, rgba(89, 145, 255, 0.44) 68%, rgba(255, 255, 255, 0.10));
        box-shadow: 0 0 18px rgba(142, 197, 255, 0.44), 0 0 0 1px rgba(255, 255, 255, 0.18);
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"]::before {
        display: none;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] {
        border: 0;
        background: transparent !important;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"]:hover,
      #${launcherId}[data-chg-trigger-mode="sidebar"]:focus-visible {
        background: rgba(0, 0, 0, 0.055) !important;
        box-shadow: none;
        transform: none;
      }
      #${launcherId}[data-chg-trigger-mode="native"] {
        min-height: 36px;
        padding: 8px 13px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.035)) !important;
        color: rgba(248, 250, 253, 0.88);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.16) inset, 0 10px 26px rgba(0, 0, 0, 0.10);
        backdrop-filter: blur(18px) saturate(1.42);
        -webkit-backdrop-filter: blur(18px) saturate(1.42);
      }
      #${launcherId}[data-chg-trigger-mode="native"] strong {
        font-weight: 650;
        letter-spacing: -0.012em;
      }
      #${launcherId}[data-chg-trigger-mode="native"]:hover,
      #${launcherId}[data-chg-trigger-mode="native"]:focus-visible {
        background:
          radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.22), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.055)) !important;
        border-color: rgba(255, 255, 255, 0.24);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.24) inset, 0 14px 34px rgba(0, 0, 0, 0.18);
      }
      #${launcherId}[data-chg-trigger-mode="floating"] {
        border-color: rgba(255, 255, 255, 0.18);
        background:
          radial-gradient(circle at 16% 0%, rgba(255, 255, 255, 0.28), transparent 38%),
          linear-gradient(135deg, rgba(38, 45, 58, 0.72), rgba(13, 16, 23, 0.72));
        backdrop-filter: blur(24px) saturate(1.52);
        -webkit-backdrop-filter: blur(24px) saturate(1.52);
      }
      #${panelId} {
        font-family: var(--chg-font);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 34px;
        background:
          radial-gradient(circle at 18% -4%, rgba(255, 255, 255, 0.26), transparent 30%),
          radial-gradient(circle at 92% 2%, rgba(142, 197, 255, 0.20), transparent 34%),
          linear-gradient(145deg, rgba(36, 43, 56, 0.76), rgba(9, 12, 18, 0.84));
        box-shadow: var(--chg-shadow-sheet);
        backdrop-filter: var(--chg-blur);
        -webkit-backdrop-filter: var(--chg-blur);
      }
      #${panelId}::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        pointer-events: none;
        background:
          linear-gradient(120deg, rgba(255, 255, 255, 0.16), transparent 22%, transparent 72%, rgba(142, 197, 255, 0.09)),
          repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.009) 0 1px, transparent 1px 8px);
        opacity: 0.62;
        mask-image: linear-gradient(180deg, black, rgba(0, 0, 0, 0.86));
      }
      .chg-header {
        position: sticky;
        top: 0;
        z-index: 2;
        margin: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.075);
        background:
          linear-gradient(180deg, rgba(31, 36, 46, 0.78), rgba(31, 36, 46, 0.48) 62%, rgba(31, 36, 46, 0));
        backdrop-filter: blur(26px) saturate(1.38);
        -webkit-backdrop-filter: blur(26px) saturate(1.38);
      }
      .chg-title {
        font-size: 20px;
        font-weight: 720;
        letter-spacing: -0.045em;
      }
      .chg-subtitle {
        max-width: 31em;
        font-size: 12.5px;
        line-height: 1.55;
      }
      .chg-close {
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.055);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset;
      }
      .chg-actions[data-layout="recovery"] {
        grid-template-columns: 1.22fr 1fr;
        align-items: stretch;
      }
      .chg-actions[data-layout="recovery"] .chg-btn[data-action="repair"] {
        grid-column: span 2;
        min-height: 44px;
        justify-content: center;
        font-size: 13.5px;
        font-weight: 720;
        letter-spacing: -0.012em;
      }
      #${alertId},
      #${sidebarRepairId},
      .chg-card,
      .chg-item,
      #${resultId},
      .chg-advanced,
      .chg-confirm-card,
      .${toastClass} {
        border: 1px solid rgba(255, 255, 255, 0.16);
        background:
          var(--chg-glass-sheen),
          linear-gradient(180deg, rgba(255, 255, 255, 0.092), rgba(255, 255, 255, 0.038));
        box-shadow: var(--chg-shadow-card);
        backdrop-filter: blur(22px) saturate(1.34);
        -webkit-backdrop-filter: blur(22px) saturate(1.34);
      }
      #${sidebarRepairId} {
        position: relative;
        overflow: hidden;
        min-height: 78px;
        padding: 14px 14px 14px 16px;
        border-radius: 22px;
        background:
          radial-gradient(circle at 12% 8%, rgba(255, 255, 255, 0.28), transparent 28%),
          radial-gradient(circle at 94% 10%, rgba(142, 197, 255, 0.22), transparent 32%),
          linear-gradient(145deg, rgba(39, 48, 62, 0.72), rgba(15, 19, 27, 0.76));
      }
      #${sidebarRepairId}::before {
        content: "";
        position: absolute;
        inset: 1px;
        border-radius: 21px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        pointer-events: none;
      }
      #${sidebarRepairId}::after {
        content: "";
        position: absolute;
        width: 82px;
        height: 82px;
        right: -34px;
        top: -30px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(142, 197, 255, 0.30), rgba(142, 197, 255, 0.03) 62%, transparent 70%);
        filter: blur(1px);
        pointer-events: none;
      }
      .chg-sidebar-repair-copy {
        position: relative;
        z-index: 1;
      }
      .chg-sidebar-repair-copy strong {
        font-size: 13.5px;
        letter-spacing: -0.012em;
      }
      .chg-sidebar-repair-copy span {
        max-width: 17em;
        color: rgba(225, 232, 242, 0.66);
      }
      .chg-sidebar-repair-btn,
      .chg-btn,
      .chg-confirm-actions button,
      .${toastClass} button,
      .chg-item button {
        position: relative;
        overflow: hidden;
        border-radius: 999px;
        border-color: rgba(255, 255, 255, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.055));
        color: rgba(249, 251, 255, 0.94);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18) inset, 0 10px 22px rgba(0, 0, 0, 0.14);
      }
      .chg-sidebar-repair-btn::before,
      .chg-btn::before,
      .chg-confirm-actions button::before,
      .${toastClass} button::before,
      .chg-item button::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(120deg, rgba(255, 255, 255, 0.24), transparent 36%, transparent 68%, rgba(255, 255, 255, 0.08));
        opacity: 0.72;
        pointer-events: none;
      }
      .chg-btn:hover,
      .chg-btn:focus-visible,
      .chg-sidebar-repair-btn:hover,
      .chg-sidebar-repair-btn:focus-visible {
        border-color: rgba(255, 255, 255, 0.28);
        background:
          radial-gradient(circle at 24% 0%, rgba(255, 255, 255, 0.22), transparent 36%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.075));
      }
      .chg-sidebar-repair-btn,
      .chg-btn[data-variant="primary"] {
        border-color: rgba(168, 210, 255, 0.38);
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.34), transparent 34%),
          radial-gradient(circle at 86% 14%, rgba(142, 197, 255, 0.36), transparent 40%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.20), rgba(142, 197, 255, 0.075));
        color: rgba(250, 253, 255, 0.98);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.24) inset,
          0 18px 34px rgba(78, 137, 230, 0.16),
          0 10px 24px rgba(0, 0, 0, 0.14);
      }
      .chg-sidebar-repair-btn:hover,
      .chg-sidebar-repair-btn:focus-visible,
      .chg-btn[data-variant="primary"]:hover,
      .chg-btn[data-variant="primary"]:focus-visible {
        border-color: rgba(205, 228, 255, 0.48);
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.40), transparent 34%),
          radial-gradient(circle at 86% 14%, rgba(142, 197, 255, 0.44), transparent 40%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(142, 197, 255, 0.095));
      }
      .chg-btn[data-variant="safe"] {
        border-color: rgba(145, 242, 187, 0.26);
        background:
          radial-gradient(circle at 18% 0%, rgba(145, 242, 187, 0.28), transparent 38%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.052));
      }
      .chg-btn[data-variant="warn"],
      .chg-confirm-danger {
        border-color: rgba(255, 212, 154, 0.28);
        background:
          radial-gradient(circle at 18% 0%, rgba(255, 212, 154, 0.28), transparent 38%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.052));
      }
      .chg-grid {
        gap: 11px;
      }
      .chg-card,
      .chg-item,
      #${resultId} {
        border-radius: 21px;
      }
      .chg-label {
        text-transform: none;
        letter-spacing: 0.015em;
      }
      .chg-value {
        font-size: 17px;
        font-weight: 720;
      }
      .chg-input {
        border-radius: 999px;
        padding: 11px 15px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.082), rgba(255, 255, 255, 0.035));
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.10) inset;
      }
      #${resultId} {
        color: rgba(230, 237, 247, 0.78);
      }
      .${rowDeleteClass} {
        min-height: 28px;
        padding: 5px 10px;
        border-radius: 999px;
        border-color: rgba(255, 255, 255, 0.14);
        background:
          radial-gradient(circle at 24% 0%, rgba(255, 255, 255, 0.22), transparent 44%),
          rgba(18, 22, 30, 0.62);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18), 0 1px 0 rgba(255, 255, 255, 0.14) inset;
      }
      .${rowDeleteClass}:hover,
      .${rowDeleteClass}:focus-visible {
        border-color: rgba(255, 255, 255, 0.26);
        background:
          radial-gradient(circle at 24% 0%, rgba(255, 255, 255, 0.30), transparent 44%),
          rgba(40, 47, 61, 0.70);
      }
      .${toastClass} {
        border-radius: 22px;
        padding: 12px 14px;
        max-width: min(360px, calc(100vw - 48px));
        line-height: 1.45;
      }
      .${toastClass}.chg-toast--panel-open {
        right: min(500px, calc(100vw - 392px));
        bottom: 28px;
      }
      .${confirmOverlayClass} {
        background: rgba(5, 8, 13, 0.36);
        backdrop-filter: blur(18px) saturate(1.28);
        -webkit-backdrop-filter: blur(18px) saturate(1.28);
      }
      .chg-confirm-card {
        border-radius: 26px;
      }
      .chg-advanced {
        border-radius: 22px;
      }
      /* Codex-native release polish: a quiet light sheet that feels like part of the app, not a separate tool. */
      #${panelId} {
        top: 108px;
        right: 22px;
        bottom: auto;
        width: min(392px, calc(100vw - 44px));
        max-height: min(620px, calc(100vh - 136px));
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 28px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 250, 0.82));
        color: rgba(31, 35, 40, 0.94);
        box-shadow:
          0 26px 70px rgba(15, 23, 42, 0.18),
          0 8px 24px rgba(15, 23, 42, 0.10),
          0 1px 0 rgba(255, 255, 255, 0.82) inset;
        backdrop-filter: blur(28px) saturate(1.28);
        -webkit-backdrop-filter: blur(28px) saturate(1.28);
        scrollbar-color: rgba(0, 0, 0, 0.18) transparent;
      }
      #${panelId}::after {
        opacity: 0;
      }
      .chg-header {
        padding: 18px 20px 12px;
        border-bottom-color: rgba(0, 0, 0, 0.06);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.56) 72%, rgba(255, 255, 255, 0));
      }
      .chg-title {
        color: rgba(31, 35, 40, 0.96);
        font-size: 18px;
        letter-spacing: -0.035em;
      }
      .chg-subtitle,
      .chg-section-copy,
      .chg-alert-copy,
      .chg-confirm-copy,
      .chg-primary-copy,
      .chg-primary-result,
      .chg-primary-safety,
      .chg-item-meta,
      #${statusId} {
        color: rgba(86, 92, 101, 0.76);
      }
      .chg-close {
        border-color: rgba(0, 0, 0, 0.06);
        background: rgba(0, 0, 0, 0.035);
        color: rgba(86, 92, 101, 0.76);
        box-shadow: none;
      }
      .chg-close:hover,
      .chg-close:focus-visible {
        background: rgba(0, 0, 0, 0.07);
        color: rgba(31, 35, 40, 0.94);
      }
      .chg-section {
        padding-left: 18px;
        padding-right: 18px;
      }
      .chg-primary-section {
        padding-top: 16px;
      }
      .chg-primary-card,
      .chg-card,
      .chg-item,
      #${resultId},
      .chg-advanced,
      .chg-confirm-card {
        border-color: rgba(0, 0, 0, 0.075);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(247, 248, 250, 0.62));
        color: rgba(31, 35, 40, 0.94);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.80) inset,
          0 10px 28px rgba(15, 23, 42, 0.055);
        backdrop-filter: blur(16px) saturate(1.12);
        -webkit-backdrop-filter: blur(16px) saturate(1.12);
      }
      .chg-primary-card {
        gap: 10px;
        padding: 20px;
        border-radius: 22px;
      }
      .chg-primary-card::before {
        opacity: 0;
      }
      .chg-primary-card[data-tone="ok"],
      .chg-primary-card[data-tone="warn"] {
        border-color: rgba(0, 0, 0, 0.075);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(247, 248, 250, 0.64));
      }
      .chg-primary-pill,
      .chg-primary-card[data-tone="ok"] .chg-primary-pill,
      .chg-primary-card[data-tone="warn"] .chg-primary-pill {
        width: fit-content;
        border-color: rgba(0, 0, 0, 0.06);
        background: rgba(0, 0, 0, 0.035);
        color: rgba(69, 75, 84, 0.78);
        box-shadow: none;
      }
      .chg-primary-title {
        color: rgba(31, 35, 40, 0.96);
        font-size: 24px;
        letter-spacing: -0.045em;
      }
      .chg-btn,
      .chg-sidebar-repair-btn,
      .chg-confirm-actions button,
      .${toastClass} button,
      .chg-item button {
        border-color: rgba(0, 0, 0, 0.075);
        background: rgba(0, 0, 0, 0.045);
        color: rgba(31, 35, 40, 0.88);
        box-shadow: none;
      }
      .chg-btn::before,
      .chg-sidebar-repair-btn::before,
      .chg-confirm-actions button::before,
      .${toastClass} button::before,
      .chg-item button::before {
        display: none;
      }
      .chg-btn:hover,
      .chg-btn:focus-visible,
      .chg-sidebar-repair-btn:hover,
      .chg-sidebar-repair-btn:focus-visible {
        border-color: rgba(0, 0, 0, 0.10);
        background: rgba(0, 0, 0, 0.075);
        color: rgba(17, 24, 39, 0.94);
      }
      .chg-primary-action,
      .chg-btn[data-variant="primary"] {
        border-color: rgba(0, 0, 0, 0.10);
        background: rgba(31, 35, 40, 0.88);
        color: #fff;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.16);
      }
      .chg-primary-action:hover,
      .chg-primary-action:focus-visible,
      .chg-btn[data-variant="primary"]:hover,
      .chg-btn[data-variant="primary"]:focus-visible {
        background: rgba(17, 24, 39, 0.92);
        color: #fff;
      }
      .chg-btn[data-variant="safe"],
      .chg-btn[data-variant="warn"],
      .chg-confirm-danger {
        border-color: rgba(0, 0, 0, 0.075);
        background: rgba(0, 0, 0, 0.045);
        color: rgba(31, 35, 40, 0.88);
      }
      .chg-label {
        color: rgba(86, 92, 101, 0.68);
      }
      .chg-value,
      .chg-item-title,
      .chg-advanced summary {
        color: rgba(31, 35, 40, 0.94);
      }
      .chg-input {
        border-color: rgba(0, 0, 0, 0.075);
        background: rgba(255, 255, 255, 0.70);
        color: rgba(31, 35, 40, 0.94);
        box-shadow: none;
      }
      .chg-input::placeholder {
        color: rgba(86, 92, 101, 0.46);
      }
      .chg-input:focus {
        border-color: rgba(31, 35, 40, 0.20);
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.045);
      }
      #${resultId}.chg-primary-result {
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        color: rgba(86, 92, 101, 0.76);
      }
      #${resultId}.chg-primary-result:empty {
        display: none;
      }
      .chg-advanced[open] summary {
        border-bottom-color: rgba(0, 0, 0, 0.06);
      }
      .${toastClass} {
        border-color: rgba(0, 0, 0, 0.08);
        background: rgba(255, 255, 255, 0.90);
        color: rgba(31, 35, 40, 0.94);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
      }
      .${rowDeleteClass} {
        right: 32px;
        width: 24px;
        min-width: 24px;
        min-height: 24px;
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 7px;
        background: transparent !important;
        color: rgba(95, 99, 104, 0.42);
        box-shadow: none !important;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      [data-chg-sidebar-row="true"]:hover .${rowDeleteClass},
      [data-chg-sidebar-row="true"]:focus-within .${rowDeleteClass} {
        opacity: 1;
        transform: translateY(-50%);
      }
      .${rowDeleteClass}:hover,
      .${rowDeleteClass}:focus-visible {
        background: rgba(0, 0, 0, 0.055) !important;
        color: rgba(60, 64, 67, 0.72);
      }
      .${rowDeleteClass} svg {
        width: 14px;
        height: 14px;
      }
      /* Codex-native minimal v3: final user-facing layer. Keep it quiet, light, and attached to the app edge. */
      :root {
        --chg-surface: #fbfbfa;
        --chg-surface-strong: #ffffff;
        --chg-surface-soft: #f5f5f3;
        --chg-line: rgba(0, 0, 0, 0.08);
        --chg-line-strong: rgba(0, 0, 0, 0.14);
        --chg-text: rgba(31, 35, 40, 0.96);
        --chg-muted: rgba(86, 92, 101, 0.76);
        --chg-faint: rgba(86, 92, 101, 0.54);
        --chg-blue: rgba(31, 35, 40, 0.92);
        --chg-green: rgba(31, 35, 40, 0.92);
        --chg-warn: rgba(31, 35, 40, 0.92);
        --chg-shadow-sheet: none;
        --chg-shadow-card: none;
      }
      #${launcherId}::before {
        display: none !important;
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"] {
        min-height: 34px;
        border-radius: 9px;
        color: rgba(36, 42, 52, 0.88);
      }
      #${launcherId}[data-chg-trigger-mode="sidebar"]:hover,
      #${launcherId}[data-chg-trigger-mode="sidebar"]:focus-visible {
        background: rgba(0, 0, 0, 0.045) !important;
        color: rgba(17, 24, 39, 0.94);
        transform: none;
        box-shadow: none;
      }
      #${launcherId}[data-chg-trigger-mode="floating"] {
        border-color: rgba(0, 0, 0, 0.08);
        background: rgba(31, 35, 40, 0.92) !important;
        color: #fff;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      #${panelId}:not([hidden]) {
        animation: chg-native-sheet-in .18s ease-out both;
      }
      @keyframes chg-native-sheet-in {
        from { opacity: 0; transform: translateX(10px); }
        to { opacity: 1; transform: translateX(0); }
      }
      #${panelId} {
        top: 0;
        right: 0;
        bottom: 0;
        width: min(400px, max(320px, calc(100vw - 304px)));
        max-height: none;
        border-width: 0 0 0 1px;
        border-style: solid;
        border-color: rgba(0, 0, 0, 0.075);
        border-radius: 0;
        background: #fbfbfa;
        color: var(--chg-text);
        box-shadow: -14px 0 34px rgba(15, 23, 42, 0.045);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        scrollbar-color: rgba(0, 0, 0, 0.20) transparent;
      }
      #${panelId}::before,
      #${panelId}::after,
      .chg-primary-card::before,
      #${sidebarRepairId}::before,
      #${sidebarRepairId}::after {
        display: none !important;
      }
      .chg-header {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 20px 22px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.065);
        background: #fbfbfa;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chg-title {
        color: var(--chg-text);
        font-size: 18px;
        font-weight: 650;
        letter-spacing: -0.02em;
      }
      .chg-subtitle {
        max-width: 28em;
        margin-top: 5px;
        color: var(--chg-muted);
        font-size: 12px;
        line-height: 1.48;
      }
      .chg-close {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(86, 92, 101, 0.72);
        box-shadow: none;
      }
      .chg-close:hover,
      .chg-close:focus-visible {
        background: rgba(0, 0, 0, 0.055);
        color: var(--chg-text);
      }
      .chg-section {
        padding-left: 22px;
        padding-right: 22px;
      }
      .chg-primary-section {
        padding-top: 18px;
      }
      .chg-primary-card,
      .chg-card,
      .chg-item,
      .chg-advanced,
      .chg-confirm-card {
        border: 1px solid rgba(0, 0, 0, 0.075);
        background: #ffffff;
        color: var(--chg-text);
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chg-primary-card,
      .chg-primary-card[data-tone="ok"],
      .chg-primary-card[data-tone="warn"] {
        gap: 9px;
        padding: 18px;
        border-radius: 18px;
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.08);
      }
      .chg-primary-pill,
      .chg-primary-card[data-tone="ok"] .chg-primary-pill,
      .chg-primary-card[data-tone="warn"] .chg-primary-pill {
        width: fit-content;
        border: 0;
        border-radius: 0;
        padding: 0;
        background: transparent;
        color: rgba(86, 92, 101, 0.70);
        box-shadow: none;
        font-size: 12px;
        font-weight: 600;
      }
      .chg-primary-title {
        color: var(--chg-text);
        font-size: 22px;
        line-height: 1.18;
        letter-spacing: -0.035em;
      }
      .chg-primary-copy {
        color: var(--chg-muted);
        font-size: 14px;
        line-height: 1.55;
      }
      .chg-primary-safety,
      .chg-primary-result,
      .chg-section-copy,
      .chg-alert-copy,
      .chg-confirm-copy,
      .chg-item-meta,
      #${statusId} {
        color: var(--chg-muted);
      }
      .chg-primary-action,
      .chg-btn[data-variant="primary"] {
        min-height: 42px;
        border: 0;
        border-radius: 12px;
        background: rgba(31, 35, 40, 0.94);
        color: #fff;
        box-shadow: none;
      }
      .chg-primary-action:hover,
      .chg-primary-action:focus-visible,
      .chg-btn[data-variant="primary"]:hover,
      .chg-btn[data-variant="primary"]:focus-visible {
        background: rgba(17, 24, 39, 0.96);
        color: #fff;
        transform: none;
      }
      .chg-btn,
      .chg-sidebar-repair-btn,
      .chg-confirm-actions button,
      .${toastClass} button,
      .chg-item button {
        min-height: 34px;
        border: 1px solid rgba(0, 0, 0, 0.075);
        border-radius: 11px;
        background: rgba(0, 0, 0, 0.035);
        color: rgba(31, 35, 40, 0.88);
        box-shadow: none;
      }
      .chg-btn:hover,
      .chg-btn:focus-visible,
      .chg-sidebar-repair-btn:hover,
      .chg-sidebar-repair-btn:focus-visible,
      .chg-confirm-actions button:hover,
      .chg-confirm-actions button:focus-visible,
      .${toastClass} button:hover,
      .${toastClass} button:focus-visible {
        border-color: rgba(0, 0, 0, 0.11);
        background: rgba(0, 0, 0, 0.06);
        color: var(--chg-text);
        transform: none;
        box-shadow: none;
      }
      #${sidebarRepairId} {
        min-height: 0;
        margin: 0 0 10px;
        padding: 10px 10px 10px 12px;
        border: 0;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.035);
        color: var(--chg-text);
        box-shadow: none;
        animation: none !important;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chg-sidebar-repair-copy strong {
        color: var(--chg-text);
        font-size: 13px;
        font-weight: 600;
      }
      .chg-sidebar-repair-copy span {
        max-width: 18em;
        color: var(--chg-muted);
        font-size: 12px;
      }
      .chg-sidebar-repair-btn {
        min-height: 30px;
        padding: 6px 10px;
        border: 0;
        background: rgba(31, 35, 40, 0.90);
        color: #fff;
      }
      .chg-primary-action,
      .chg-btn[data-variant="primary"] {
        min-height: 42px;
        border: 0;
        border-radius: 12px;
        background: rgba(31, 35, 40, 0.94);
        color: #fff;
        box-shadow: none;
      }
      .chg-primary-action:hover,
      .chg-primary-action:focus-visible,
      .chg-btn[data-variant="primary"]:hover,
      .chg-btn[data-variant="primary"]:focus-visible {
        background: rgba(17, 24, 39, 0.96);
        color: #fff;
        transform: none;
      }
      .chg-advanced {
        margin-top: 16px;
        border-radius: 16px;
        background: #f5f5f3;
        overflow: hidden;
      }
      .chg-advanced summary {
        padding: 13px 14px;
        color: var(--chg-text);
        font-size: 13px;
        font-weight: 600;
      }
      .chg-advanced[open] summary {
        border-bottom-color: rgba(0, 0, 0, 0.06);
      }
      .chg-advanced-body {
        padding: 14px;
      }
      .chg-meta-grid,
      .chg-grid {
        gap: 9px;
      }
      .chg-card,
      .chg-item {
        border-radius: 14px;
        background: #ffffff;
      }
      .chg-label {
        color: rgba(86, 92, 101, 0.66);
        font-weight: 600;
      }
      .chg-value,
      .chg-item-title,
      .chg-section-title,
      .chg-alert-title {
        color: var(--chg-text);
      }
      .chg-input {
        border-color: rgba(0, 0, 0, 0.075);
        border-radius: 11px;
        background: #ffffff;
        color: var(--chg-text);
        box-shadow: none;
      }
      .chg-input:focus {
        border-color: rgba(31, 35, 40, 0.22);
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.045);
      }
      #${resultId}.chg-primary-result {
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--chg-muted);
        box-shadow: none;
      }
      .${rowDeleteClass} {
        right: 32px;
        width: 26px;
        min-width: 26px;
        min-height: 26px;
        border: 0;
        border-radius: 7px;
        background: transparent !important;
        color: rgba(95, 99, 104, 0.42);
        box-shadow: none !important;
        opacity: 0;
        transform: translateY(-50%);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      [data-chg-sidebar-row="true"]:hover .${rowDeleteClass},
      [data-chg-sidebar-row="true"]:focus-within .${rowDeleteClass} {
        opacity: 1;
      }
      .${rowDeleteClass}:hover,
      .${rowDeleteClass}:focus-visible {
        background: rgba(0, 0, 0, 0.055) !important;
        color: rgba(31, 35, 40, 0.72);
      }
      .${toastClass} {
        border: 0;
        border-radius: 14px;
        background: rgba(31, 35, 40, 0.94);
        color: #ffffff;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .${toastClass} button {
        border: 0;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .${toastClass}.chg-toast--panel-open {
        right: 424px;
      }
      .${confirmOverlayClass} {
        background: rgba(0, 0, 0, 0.18);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chg-confirm-card {
        border-radius: 18px;
        background: #ffffff;
        color: var(--chg-text);
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chg-confirm-danger {
        border: 0;
        background: rgba(31, 35, 40, 0.94);
        color: #fff;
      }
      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        #${panelId},
        #${alertId},
        #${sidebarRepairId},
        .chg-card,
        .chg-item,
        #${resultId},
        .chg-advanced,
        .chg-confirm-card,
        .${toastClass} {
          background: #ffffff;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #${panelId}:not([hidden]),
        #${alertId}:not([hidden]),
        #${sidebarRepairId}:not([hidden]),
        .${toastClass},
        .chg-confirm-card {
          animation: none !important;
        }
        #${launcherId},
        .chg-btn,
        .chg-card,
        .${rowDeleteClass} {
          transition: none !important;
        }
      }
      @media (max-width: 760px) {
        #${panelId} {
          left: 0;
          right: 0;
          width: auto;
          top: 0;
          bottom: 0;
          border-left: 0;
          border-radius: 0;
        }
        .${toastClass}.chg-toast--panel-open {
          right: 16px;
          bottom: 16px;
        }
        .chg-grid,
        .chg-actions,
        .chg-meta-grid,
        .chg-searchbar {
          grid-template-columns: 1fr;
          flex-direction: column;
        }
        .chg-actions[data-layout="recovery"] .chg-btn[data-action="repair"] {
          grid-column: span 2;
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  async function callBridge(path, payload = null) {
    const base = window.__CODEX_PRO_HELPER__ || window.__CODEX_HISTORY_GUARD_HELPER__;
    let helperError = null;

    if (base) {
      try {
        if (path.startsWith("/status") || path.startsWith("/sessions") || path.startsWith("/update/check")) {
          const response = await fetch(`${base}${path}`, { headers: bridgeAuthHeaders });
          return response.json();
        }
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...bridgeAuthHeaders },
          body: JSON.stringify(payload ?? {}),
        });
        return response.json();
      } catch (error) {
        helperError = error;
      }
    }

    if (typeof window.__codexProBridge === "function") {
      try {
        return await window.__codexProBridge(path, payload ?? {});
      } catch (error) {
        throw helperError || error;
      }
    }

    if (typeof window.__codexHistoryGuardBridge === "function") {
      try {
        return await window.__codexHistoryGuardBridge(path, payload ?? {});
      } catch (error) {
        throw helperError || error;
      }
    }

    const fallbackBase = "http://127.0.0.1:8765";
    if (path.startsWith("/status") || path.startsWith("/sessions") || path.startsWith("/update/check")) {
      const response = await fetch(`${fallbackBase}${path}`, { headers: bridgeAuthHeaders });
      return response.json();
    }
    const response = await fetch(`${fallbackBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bridgeAuthHeaders },
      body: JSON.stringify(payload ?? {}),
    });
    return response.json();
  }

  function friendlyError(error, fallback = "本地状态暂时没有连上。稍后再试一次。") {
    console.debug?.("[Codex Pro]", error);
    return fallback;
  }

  function ensureDom() {
    installStyle();
    ensureLauncherTrigger();

    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = panelId;
      panel.hidden = true;
      panel.innerHTML = `
        <div class="chg-header">
          <div>
            <div class="chg-title">历史</div>
            <div class="chg-subtitle">只在历史没显示完整时出现。平时继续像平常一样打开 Codex。</div>
          </div>
          <button class="chg-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="chg-section chg-primary-section">
          <div class="chg-primary-card" data-tone="ok">
            <div class="chg-primary-pill" data-field="primary-status">检查中</div>
            <div class="chg-primary-title" data-field="primary-title">正在检查历史</div>
            <div class="chg-primary-copy" data-field="primary-copy">正在读取本地状态…</div>
            <div class="chg-primary-safety" data-field="primary-safety">不会改账号、模型或 API 地址。</div>
            <button class="chg-btn chg-primary-action" type="button" data-action="primary-rescue" data-primary-action="status" data-field="primary-button">检查一次</button>
          </div>
          <div id="${resultId}" class="chg-primary-result">继续正常打开 Codex 即可。</div>
        </div>
        <div class="chg-section">
          <details class="chg-advanced">
            <summary>高级</summary>
            <div class="chg-advanced-body">
              <div class="chg-section-copy">需要找回旧会话、恢复快照、撤销删除或看兼容说明时，再打开这里。</div>
              <div class="chg-meta-grid">
                <div class="chg-card"><div class="chg-label">当前历史</div><div class="chg-value" data-field="provider">读取中…</div></div>
                <div class="chg-card"><div class="chg-label">本地记录</div><div class="chg-value" data-field="index">读取中…</div></div>
                <div class="chg-card"><div class="chg-label">当前项目</div><div class="chg-value" data-field="roots">读取中…</div></div>
                <div class="chg-card"><div class="chg-label">当前显示</div><div class="chg-value" data-field="injection">读取中…</div></div>
              </div>
              <div class="chg-section-title">插件</div>
              <div class="chg-card">
                <div class="chg-label">入口状态</div>
                <div class="chg-value" id="${pluginStatusId}">读取中…</div>
                <div class="chg-label">安装按钮</div>
                <div class="chg-value" id="${pluginInstallStatusId}">读取中…</div>
                <div class="chg-section-copy">如果插件页里的入口或安装按钮没有显示、不可点，可以先在这里试一次。不会改账号、模型或 API 地址。</div>
                <div class="chg-inline-actions">
                  <button class="chg-btn" type="button" data-action="repair-plugin-entry" data-variant="safe">显示插件入口</button>
                  <button class="chg-btn" type="button" data-action="repair-plugin-install" data-variant="safe">恢复安装按钮</button>
                </div>
              </div>
              <div class="chg-section-title">长对话跳转</div>
              <div class="chg-card">
                <div class="chg-label">当前状态</div>
                <div class="chg-value" id="${timelineStatusId}">未生成</div>
                <div class="chg-section-copy">只看当前页面已经显示的提问，帮你在长对话里快速跳回关键位置。</div>
                <div class="chg-inline-actions">
                  <button class="chg-btn" type="button" data-action="build-timeline" data-variant="safe">生成跳转点</button>
                  <button class="chg-btn" type="button" data-action="clear-timeline">隐藏跳转点</button>
                </div>
                <div id="${timelineId}" class="chg-search-results"></div>
              </div>
              <div class="chg-section-title">找回旧会话</div>
              <div class="chg-searchbar">
                <input id="${searchInputId}" class="chg-input" type="text" placeholder="搜标题、时间或关键词，例如：作业 / 安装 / 修复" />
                <button class="chg-btn" type="button" data-action="search">查找会话</button>
              </div>
              <div id="${sessionsId}" class="chg-search-results"></div>
              <div class="chg-meta-grid">
                <div class="chg-card"><div class="chg-label">当前保护</div><div class="chg-value" data-field="guard">读取中…</div></div>
                <div class="chg-card"><div class="chg-label">最近一次检查</div><div class="chg-value" data-field="diagnosis-time">读取中…</div></div>
              </div>
              <div class="chg-section-title">更多</div>
              <div id="${managementId}" class="chg-actions" data-layout="compact">
                <button class="chg-btn" type="button" data-action="status">重新检查</button>
                <button class="chg-btn" type="button" data-action="snapshot" data-variant="safe">创建快照</button>
                <button class="chg-btn" type="button" data-action="restore" data-variant="safe">恢复快照</button>
                <button class="chg-btn" type="button" data-action="undo-delete">撤销删除</button>
                <button class="chg-btn" type="button" data-action="stop-guard" data-variant="warn">暂停守护</button>
                <button class="chg-btn" type="button" data-action="start-guard" data-variant="safe">恢复守护</button>
                <button class="chg-btn" type="button" data-action="open-log-dir">打开日志目录</button>
                <button class="chg-btn" type="button" data-action="open-tool-dir">打开安装目录</button>
                <button class="chg-btn" type="button" data-action="open-quick-start">打开快速开始</button>
                <button class="chg-btn" type="button" data-action="check-update">检查更新</button>
                <button class="chg-btn" type="button" data-action="open-start-menu-dir">更多修复入口</button>
                <button class="chg-btn" type="button" data-action="show-uninstall">卸载说明</button>
              </div>
            </div>
          </details>
        </div>
        <div id="${statusId}">保护会在需要时检查，平时尽量不打扰。</div>
      `;
      panel.querySelector(".chg-close")?.addEventListener("click", togglePanel, true);
      panel.addEventListener("click", handleAction, true);
      document.body.appendChild(panel);
    }
  }

  function togglePanel() {
    const panel = document.getElementById(panelId);
    const launcher = document.getElementById(launcherId);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    syncToastPlacement();
    launcher?.blur?.();
    if (!panel.hidden) {
      void refreshStatus();
    }
  }

  function updateResult(text) {
    const node = document.getElementById(resultId);
    if (node) {
      node.textContent = text;
    }
  }

  function updateFooter(text) {
    const node = document.getElementById(statusId);
    if (node) {
      node.textContent = text;
    }
  }

  function findUpdateButton() {
    return document.querySelector('[data-action="check-update"], [data-action="install-update"]');
  }

  function setUpdateButtonMode(mode = "check", version = "") {
    const button = findUpdateButton();
    if (!button) {
      return null;
    }
    if (mode === "install") {
      button.dataset.action = "install-update";
      if (version) {
        button.dataset.version = version;
      } else {
        delete button.dataset.version;
      }
      button.textContent = "立即更新";
      button.title = version ? `立即更新到 ${version}` : "立即更新";
      button.setAttribute("aria-label", button.title);
      return button;
    }
    button.dataset.action = "check-update";
    delete button.dataset.version;
    button.textContent = "检查更新";
    button.title = "检查更新";
    button.setAttribute("aria-label", "检查更新");
    return button;
  }

  function evaluateDoctorIssues(doctor, historyVisibility = null) {
    const issues = [];
    if (!doctor) {
      return issues;
    }
    if (historyVisibility?.flags?.providerBucketRisk) {
      issues.push("历史分组可能暂时错位");
    }
    if (Array.isArray(doctor.missingActiveRoots) && doctor.missingActiveRoots.length > 0) {
      issues.push("当前项目里的部分历史可能还没显示出来");
    }
    if ((doctor.rolloutFileCount ?? 0) > 0 && (doctor.sessionIndexCount ?? 0) === 0) {
      issues.push("本地历史索引暂时是空的");
    }
    return issues;
  }

  function renderAlert(payload) {
    const alert = document.getElementById(alertId);
    if (!alert) return;
    const historyVisibility = getHistoryVisibility(payload);
    const issues = evaluateDoctorIssues(payload?.doctor, historyVisibility);
    if (!issues.length) {
      alert.hidden = true;
      return;
    }
    const copy = alert.querySelector(".chg-alert-copy");
    if (copy) {
      copy.textContent = historyVisibility?.summary || `检测到：${issues.join("，")}。先点修复历史显示，通常就能恢复。`;
    }
    alert.hidden = false;
  }

  function renderPrimaryCard(payload) {
    const card = document.querySelector(".chg-primary-card");
    if (!card) return null;
    const primary = resolvePrimaryRescue(payload);
    rescueStage = primary.stage || rescueStage;
    card.dataset.tone = primary.tone || "ok";
    const mappings = {
      "primary-status": primary.status,
      "primary-title": primary.title,
      "primary-copy": primary.copy,
      "primary-safety": primary.safety,
      "primary-button": primary.button,
    };
    Object.entries(mappings).forEach(([field, value]) => {
      const node = card.querySelector(`[data-field="${field}"]`);
      if (node && value != null) {
        node.textContent = String(value);
      }
    });
    const button = card.querySelector('[data-action="primary-rescue"]');
    if (button) {
      button.dataset.primaryAction = primary.action || "status";
      button.textContent = primary.button || "检查一次";
    }
    return primary;
  }

  function resolveRecoverySteps(payload, issues) {
    const steps = payload?.recoveryPlan?.steps;
    if (Array.isArray(steps) && steps.length > 0) {
      return steps;
    }
    if (issues.length > 0) {
      return [
        "先在面板里点“修复历史显示”。",
        "如果仍不完整，再点“重建历史索引”。",
        "如果还没恢复，点“打开高级修复”，再用 Repair History。"
      ];
    }
    return [
      "继续像平常一样打开 Codex。",
      "如果历史不完整，先点“修复历史显示”。",
      "仍异常时再点“打开高级修复”。"
    ];
  }

  function findSidebarAnchor() {
    const selectors = [
      ".thread-list",
      '[data-testid="app-sidebar"]',
      '[data-testid*="sidebar"]',
      '[class*="sidebar"]',
      'aside',
      'nav'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        return node;
      }
    }
    const rows = findSidebarRows();
    if (rows.length > 0) {
      return rows[0].parentElement;
    }
    return null;
  }

  function isVisibleElement(node) {
    if (!node || !(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  }

  function isLikelySidebar(node) {
    if (!isVisibleElement(node)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.left > Math.min(420, window.innerWidth * 0.35)) return false;
    if (rect.width < 120 || rect.width > 420 || rect.height < 220) return false;
    const text = (node.textContent || "").replace(/\s+/g, "");
    return /新对话|搜索|技能|插件|自动化|项目|对话/.test(text);
  }

  function findSidebarLauncherInsertionPoint() {
    const candidates = [
      document.querySelector('[data-testid="app-sidebar"]'),
      ...document.querySelectorAll('[data-testid*="sidebar"], [class*="sidebar"], aside, nav')
    ].filter(Boolean);
    const sidebar = candidates.find(isLikelySidebar);
    if (!sidebar) return null;

    const rows = Array.from(sidebar.querySelectorAll("a, button, [role='button']"))
      .filter((row) => isVisibleElement(row) && !row.closest(`#${launcherWrapperId}`));
    const preferredRow = rows.find((row) => /搜索/.test(row.textContent || ""))
      || rows.find((row) => /新对话/.test(row.textContent || ""))
      || rows[0];
    const parent = preferredRow?.parentElement && sidebar.contains(preferredRow.parentElement)
      ? preferredRow.parentElement
      : sidebar;

    return {
      parent,
      before: preferredRow?.nextSibling || null,
      nativeButtonClass: "",
    };
  }

  function findNativeLauncherInsertionPoint() {
    const header = document.querySelector(".app-header-tint");
    const menuBar = header?.querySelector(".flex.items-center.gap-0\\.5")
      || header?.querySelector('[class*="items-center"][class*="gap-0.5"]')
      || header?.querySelector('[class*="items-center"][class*="gap"]');
    if (!menuBar) return null;
    const buttons = Array.from(menuBar.querySelectorAll("button")).filter((button) => !button.closest(`#${launcherWrapperId}`));
    return {
      parent: menuBar,
      before: buttons[buttons.length - 1]?.nextSibling || null,
      nativeButtonClass: buttons[buttons.length - 1]?.className || "",
    };
  }

  function configureLauncherButton(button, mode, nativeButtonClass = "") {
    if (!button) return;
    button.dataset.chgTriggerMode = mode;
    button.setAttribute("aria-label", "打开历史");
    if (mode === "native") {
      button.className = nativeButtonClass || button.className || "";
    } else {
      button.className = "";
    }
    if (button.dataset.chgLauncherInstalled === "2") return;
    button.dataset.chgLauncherInstalled = "2";
    button.addEventListener("click", togglePanel, true);
  }

  function ensureLauncherTrigger() {
    let launcher = document.getElementById(launcherId);
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = launcherId;
      launcher.type = "button";
      launcher.innerHTML = `
        <span class="chg-launcher-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <strong>历史</strong>
        <span class="chg-launcher-subtitle">修复</span>
      `;
    }

    let wrapper = document.getElementById(launcherWrapperId);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = launcherWrapperId;
      wrapper.appendChild(launcher);
    } else if (!wrapper.contains(launcher)) {
      wrapper.replaceChildren(launcher);
    }

    const sidebarInsertionPoint = findSidebarLauncherInsertionPoint();
    if (sidebarInsertionPoint) {
      wrapper.dataset.chgTriggerMode = "sidebar";
      configureLauncherButton(launcher, "sidebar");
      const safeBefore = sidebarInsertionPoint.before?.parentElement === sidebarInsertionPoint.parent
        ? sidebarInsertionPoint.before
        : null;
      if (wrapper.parentElement !== sidebarInsertionPoint.parent) {
        sidebarInsertionPoint.parent.insertBefore(wrapper, safeBefore);
      }
      return launcher;
    }

    const insertionPoint = findNativeLauncherInsertionPoint();
    if (insertionPoint) {
      wrapper.dataset.chgTriggerMode = "native";
      configureLauncherButton(launcher, "native", insertionPoint.nativeButtonClass);
      const safeBefore = insertionPoint.before?.parentElement === insertionPoint.parent ? insertionPoint.before : null;
      if (wrapper.parentElement !== insertionPoint.parent) {
        insertionPoint.parent.insertBefore(wrapper, safeBefore);
      }
      return launcher;
    }

    wrapper.dataset.chgTriggerMode = "floating";
    configureLauncherButton(launcher, "floating");
    if (wrapper.parentElement !== document.body) {
      document.body.appendChild(wrapper);
    }
    return launcher;
  }

  function ensureSidebarRepairEntry() {
    const anchor = findSidebarAnchor();
    if (!anchor) return null;
    let entry = document.getElementById(sidebarRepairId);
    if (!entry) {
      entry = document.createElement("div");
      entry.id = sidebarRepairId;
      entry.hidden = true;
      entry.innerHTML = `
        <div class="chg-sidebar-repair-copy">
          <strong>历史可能没显示完整</strong>
          <span>本地记录还在，可以先修复显示。</span>
        </div>
        <button class="chg-sidebar-repair-btn" type="button" data-action="repair">修复显示</button>
      `;
      entry.addEventListener("click", handleAction, true);
    }
    if (entry.parentElement !== anchor) {
      anchor.insertBefore(entry, anchor.firstChild ?? null);
    }
    return entry;
  }

  function renderSidebarRepairEntry(payload) {
    const entry = ensureSidebarRepairEntry();
    if (!entry) return;
    const { historyVisibility, needsHelp } = getRecoveryState(payload);
    if (!needsHelp) {
      entry.hidden = true;
      return;
    }
    const copy = entry.querySelector(".chg-sidebar-repair-copy span");
    if (copy) {
      copy.textContent = "本地记录还在，可以先修复显示。";
    }
    const button = entry.querySelector(".chg-sidebar-repair-btn");
    if (button) {
      button.textContent = "修复显示";
    }
    entry.hidden = false;
  }

  function syncToastPlacement() {
    const panel = document.getElementById(panelId);
    const panelOpen = Boolean(panel && !panel.hidden);
    document.querySelectorAll(`.${toastClass}`).forEach((node) => {
      node.classList.toggle("chg-toast--panel-open", panelOpen);
    });
  }

  function showToast(message, withUndo = false) {
    document.querySelectorAll(`.${toastClass}`).forEach((node) => node.remove());
    const toast = document.createElement("div");
    toast.className = toastClass;
    const text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);
    if (withUndo && lastUndoToken) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "撤销";
      button.addEventListener("click", () => {
        void undoDelete();
        toast.remove();
      }, true);
      toast.appendChild(button);
    }
    document.body.appendChild(toast);
    syncToastPlacement();
    setTimeout(() => toast.remove(), 9000);
  }

  function formatInjectionStatus(diagnosis) {
    if (!diagnosis || !diagnosis.status) {
      return "待确认";
    }
    if (diagnosis.status === "supported") {
      return "已融入界面";
    }
    if (diagnosis.status === "unsupported") {
      return "安全回退";
    }
    return String(diagnosis.status);
  }

  function formatSummaryHeadline(historyVisibility) {
    const summary = historyVisibility?.summary || "历史状态看起来正常。";
    return summary.split(/[，。；]/)[0]?.trim() || "历史状态看起来正常";
  }

  function formatSummaryCopy(historyVisibility) {
    if (historyVisibility?.severity === "warning") {
      return "本地记录存在，优先修侧栏和索引，不需要先改设置。";
    }
    if (historyVisibility?.severity === "notice") {
      return "历史显示已经恢复，继续使用即可。";
    }
    return "历史保护仍在运行，平时几乎不需要手动处理。";
  }

  function formatIndexSummary(doctor) {
    const visible = Number.isFinite(Number(doctor?.sessionIndexCount)) ? Number(doctor.sessionIndexCount) : null;
    const local = Number.isFinite(Number(doctor?.rolloutFileCount)) ? Number(doctor.rolloutFileCount) : null;
    if (visible == null && local == null) {
      return "读取中…";
    }
    if (visible != null && local != null) {
      return `已显示 ${visible}，本地 ${local}`;
    }
    if (visible != null) {
      return `已显示 ${visible}`;
    }
    return `本地 ${local}`;
  }

  function formatRootsSummary(doctor) {
    const current = Number.isFinite(Number(doctor?.activeWorkspaceRootCount)) ? Number(doctor.activeWorkspaceRootCount) : null;
    const saved = Number.isFinite(Number(doctor?.savedWorkspaceRootCount)) ? Number(doctor.savedWorkspaceRootCount) : null;
    if (current == null && saved == null) {
      return "读取中…";
    }
    if (current != null && saved != null) {
      if (current === saved) {
        return `已经对齐（${current}）`;
      }
      return `当前 ${current}，已记住 ${saved}`;
    }
    if (current != null) {
      return `当前 ${current}`;
    }
    return `已记住 ${saved}`;
  }

  function formatGuardState(guard) {
    if (guard?.running) {
      return "正在保护";
    }
    return "保护已暂停";
  }

  function setSummary(doctor, guard, diagnosis, historyVisibility = null) {
    const fields = {
      provider: formatSummaryHeadline(historyVisibility),
      index: formatIndexSummary(doctor),
      roots: formatRootsSummary(doctor),
      guard: formatGuardState(guard),
      injection: formatInjectionStatus(diagnosis),
      "diagnosis-time": diagnosis?.saved_at ?? "未诊断",
    };
    Object.entries(fields).forEach(([key, value]) => {
      const node = document.querySelector(`[data-field="${key}"]`);
      if (node) {
        node.textContent = String(value);
      }
    });
    const subtitle = document.querySelector(".chg-subtitle");
    if (subtitle) {
      subtitle.textContent = historyVisibility?.severity === "warning"
        ? "本地记录还在，需要时先修复显示。"
        : "平时继续像平常一样打开 Codex。";
    }
  }

  function renderManagement(management, guard) {
    const root = document.getElementById(managementId);
    if (!root) return;
    const stopButton = root.querySelector('[data-action="stop-guard"]');
    const startButton = root.querySelector('[data-action="start-guard"]');
    if (stopButton) {
      stopButton.disabled = !guard?.running;
      stopButton.textContent = guard?.running ? "暂停守护" : "守护已暂停";
    }
    if (startButton) {
      startButton.disabled = !!guard?.running;
      startButton.textContent = guard?.running ? "守护运行中" : "恢复守护";
    }
    root.dataset.quickStart = management?.hasQuickStart ? "yes" : "no";
  }

  function pluginEntryText(node) {
    return [
      node.textContent || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.getAttribute?.("href") || "",
      node.getAttribute?.("data-testid") || ""
    ].join(" ").trim();
  }

  function pluginInstallText(node) {
    return [
      node.textContent || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.getAttribute?.("data-testid") || ""
    ].join(" ").replace(/\s+/g, " ").trim();
  }

  function nodeLooksDisabled(node) {
    if (!(node instanceof Element)) return false;
    const classText = typeof node.className === "string" ? node.className : "";
    const style = node instanceof HTMLElement ? window.getComputedStyle(node) : null;
    return node.hasAttribute("disabled")
      || node.getAttribute("aria-disabled") === "true"
      || node.getAttribute("inert") !== null
      || /disabled|cursor-not-allowed|pointer-events-none|opacity-50/i.test(classText)
      || style?.pointerEvents === "none";
  }

  function findPluginInstallButtonCandidates() {
    const nodes = Array.from(document.querySelectorAll("button, [role='button'], a"));
    const seen = new Set();
    return nodes.filter((node) => {
      if (!(node instanceof Element)) return false;
      if (node.closest(`#${panelId}, #${launcherId}`)) return false;
      const text = pluginInstallText(node);
      const scopeText = pluginInstallText(node.closest("section, article, [role='dialog'], [data-testid], div") || node);
      const looksInstall = /^(安装|Install)(\s|$)|安装插件|Install plugin|Add plugin/i.test(text);
      const hasUnavailableHint = /App unavailable|应用不可用|Unavailable|暂不可用|不可用|需要.*ChatGPT|ChatGPT.*login/i.test(scopeText);
      if (!nodeLooksDisabled(node)) return false;
      if (!looksInstall && !hasUnavailableHint) return false;
      const key = node.outerHTML?.slice?.(0, 240) || text || scopeText;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findPluginEntryCandidates() {
    const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], [role='link']"));
    const seen = new Set();
    return nodes.filter((node) => {
      if (!(node instanceof Element)) return false;
      if (node.closest(`#${panelId}, #${launcherId}`)) return false;
      const text = pluginEntryText(node);
      if (!/插件|Plugins?|plugin/i.test(text)) return false;
      const key = node.outerHTML?.slice?.(0, 240) || text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function elementLooksUsable(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      && style.opacity !== "0"
      && style.pointerEvents !== "none"
      && node.getAttribute("aria-disabled") !== "true"
      && !node.hasAttribute("disabled");
  }

  function renderPluginEntryStatus() {
    const statusNode = document.getElementById(pluginStatusId);
    if (!statusNode) return;
    const candidates = findPluginEntryCandidates();
    if (candidates.some(elementLooksUsable)) {
      statusNode.textContent = "插件入口已经可用。";
      return;
    }
    if (candidates.length > 0) {
      statusNode.textContent = "插件入口可能还没显示完整。";
      return;
    }
    statusNode.textContent = "当前页面还没有看到插件入口。";
  }

  function renderPluginInstallStatus() {
    const statusNode = document.getElementById(pluginInstallStatusId);
    if (!statusNode) return;
    const candidates = findPluginInstallButtonCandidates();
    if (candidates.length > 0) {
      statusNode.textContent = `发现 ${candidates.length} 个安装按钮可能还没显示正常。`;
      return;
    }
    statusNode.textContent = "当前页面还没有看到需要修复的安装按钮。";
  }

  function revealPluginEntryNode(node) {
    let current = node;
    for (let depth = 0; depth < 3 && current && current !== document.body; depth += 1) {
      if (current instanceof HTMLElement) {
        current.hidden = false;
        current.removeAttribute("hidden");
        current.removeAttribute("aria-hidden");
        current.removeAttribute("aria-disabled");
        current.removeAttribute("disabled");
        current.removeAttribute("inert");
        current.style.removeProperty("display");
        current.style.removeProperty("visibility");
        current.style.removeProperty("opacity");
        current.style.removeProperty("pointer-events");
        current.dataset.chgPluginEntryRepaired = "true";
      }
      current = current.parentElement;
    }
  }

  async function repairPluginEntry() {
    const candidates = findPluginEntryCandidates();
    if (candidates.length === 0) {
      updateResult("当前页面还没有看到插件入口。可以切到插件页面后再试。");
      updateFooter("没有找到可修复的插件入口。");
      renderPluginEntryStatus();
      return;
    }
    candidates.forEach(revealPluginEntryNode);
    renderPluginEntryStatus();
    updateResult("已尝试让插件入口重新显示。不会改账号、模型或 API 地址。");
    updateFooter("插件入口修复已尝试完成。");
    showToast("已尝试让插件入口重新显示。", false);
  }

  function restorePluginInstallButton(button) {
    if (!(button instanceof HTMLElement)) return false;
    button.disabled = false;
    button.hidden = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("hidden");
    button.removeAttribute("inert");
    button.classList.remove("disabled", "opacity-50", "cursor-not-allowed", "pointer-events-none");
    button.style.removeProperty("display");
    button.style.removeProperty("visibility");
    button.style.removeProperty("opacity");
    button.style.pointerEvents = "auto";
    button.tabIndex = 0;
    button.dataset.chgPluginInstallRepaired = "true";
    button.title = button.title || "Codex Pro 已尝试恢复这个安装按钮；如果服务端仍不允许，会由 Codex 自己提示。";
    return true;
  }

  async function repairPluginInstallButtons() {
    const candidates = findPluginInstallButtonCandidates();
    if (candidates.length === 0) {
      updateResult("当前页面没有找到需要修复的插件安装按钮。可以切到插件详情页后再试。");
      updateFooter("没有找到可修复的安装按钮。");
      renderPluginInstallStatus();
      return;
    }
    const changed = candidates.filter(restorePluginInstallButton).length;
    renderPluginInstallStatus();
    updateResult(`已尝试修复 ${changed} 个插件安装按钮。不会改账号、模型或 API 地址。`);
    updateFooter("插件安装按钮修复已尝试完成。");
    showToast("已尝试修复插件安装按钮。", false);
  }

  function timelineText(node) {
    return String(node?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function elementIsVisible(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      && style.opacity !== "0";
  }

  function timelineTurnContainer(node) {
    if (!(node instanceof Element)) return null;
    return node.closest("[data-message-id], [data-testid*='message' i], article, [role='article'], [data-role='user'], [data-message-author-role='user']") || node;
  }

  function findConversationUserTurns() {
    const root = document.querySelector("main, [role='main']") || document.body;
    const selectors = [
      "[data-message-author-role='user']",
      "[data-author-role='user']",
      "[data-role='user']",
      "[data-testid*='user-message' i]",
      "[data-testid*='message-user' i]",
      ".user-message"
    ];
    const rawNodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
    const seen = new Set();
    const turns = [];
    for (const rawNode of rawNodes) {
      const node = timelineTurnContainer(rawNode);
      if (!node || node.closest(`#${panelId}, #${launcherId}, .${toastClass}, .${confirmOverlayClass}`)) {
        continue;
      }
      if (!elementIsVisible(node)) {
        continue;
      }
      const text = timelineText(node);
      if (text.length < 4 || text.length > 4000) {
        continue;
      }
      if (/Codex Pro|历史可能没显示完整|修复插件入口|生成 Timeline/.test(text)) {
        continue;
      }
      const key = `${Math.round(node.getBoundingClientRect().top)}:${text.slice(0, 80)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      turns.push({
        node,
        text: text.slice(0, 96)
      });
      if (turns.length >= 40) {
        break;
      }
    }
    return turns;
  }

  function updateTimelineStatus(text) {
    const statusNode = document.getElementById(timelineStatusId);
    if (statusNode) {
      statusNode.textContent = text;
    }
  }

  function clearConversationTimeline() {
    window.__codexProTimelineTargets = [];
    const root = document.getElementById(timelineId);
    if (root) {
      root.innerHTML = "";
    }
    updateTimelineStatus("已隐藏");
    updateFooter("长对话跳转已隐藏。");
  }

  function buildConversationTimeline() {
    const root = document.getElementById(timelineId);
    if (!root) return;
    const turns = findConversationUserTurns();
    window.__codexProTimelineTargets = turns.map((turn) => turn.node);
    root.innerHTML = "";
    if (turns.length === 0) {
      root.innerHTML = `<div class="chg-item"><div class="chg-item-title">没有找到可生成跳转点的提问</div><div class="chg-item-meta">当前页面可能还没打开具体会话，或当前 Codex 版本暂时没有暴露可识别的用户消息结构。</div></div>`;
      updateTimelineStatus("未找到提问");
      updateFooter("没有找到可生成跳转点的提问。");
      return;
    }
    turns.forEach((turn, index) => {
      const item = document.createElement("div");
      item.className = "chg-item";
      item.innerHTML = `
        <div class="chg-item-title">#${index + 1}</div>
        <div class="chg-item-meta">${escapeHtml(turn.text)}</div>
        <div class="chg-inline-actions">
          <button class="chg-btn chg-timeline-jump" type="button" data-action="jump-timeline" data-timeline-index="${index}">跳到这里</button>
        </div>
      `;
      root.appendChild(item);
    });
    updateTimelineStatus(`已生成 ${turns.length} 个跳转点`);
    updateFooter("长对话跳转已生成。");
  }

  function jumpTimeline(button) {
    const index = Number.parseInt(button.getAttribute("data-timeline-index") || "-1", 10);
    const target = window.__codexProTimelineTargets?.[index];
    if (!(target instanceof Element)) {
      updateFooter("这个 Timeline 位置已经失效，可以重新生成。");
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("chg-timeline-target");
    setTimeout(() => target.classList.remove("chg-timeline-target"), 1400);
    updateFooter("已跳到对应位置。");
  }

  async function refreshStatus() {
    updateFooter("正在读取当前状态…");
    try {
      const payload = await callBridge("/status");
      const historyVisibility = getHistoryVisibility(payload);
      const recoveryState = getRecoveryState(payload);
      setSummary(payload.doctor, payload.guard, payload.injectionDiagnosis, historyVisibility);
      renderManagement(payload.management, payload.guard);
      renderPluginEntryStatus();
      renderPluginInstallStatus();
      renderAlert(payload);
      renderSidebarRepairEntry(payload);
      const primary = renderPrimaryCard(payload) || resolvePrimaryRescue(payload);
      const issues = primary.issues || recoveryState.issues;
      if (primary.action === "status") {
        updateResult("");
      } else {
        updateResult("");
      }
      if (recoveryState.needsHelp && !window.__codexHistoryGuardIssueToastShown) {
        window.__codexHistoryGuardIssueToastShown = issues.join("|") || "history-warning";
        showToast("历史可能没显示完整。先点“修复显示”。", false);
      } else if (!recoveryState.needsHelp) {
        window.__codexHistoryGuardIssueToastShown = null;
        document.querySelectorAll(`.${toastClass}`).forEach((node) => node.remove());
      }
      updateFooter("检查完成。");
    } catch (error) {
      updateResult(friendlyError(error));
      updateFooter("暂时没有读到本地状态。");
    }
  }

  async function searchSessions() {
    const input = document.getElementById(searchInputId);
    const query = encodeURIComponent(input?.value?.trim?.() || "");
    updateFooter("正在查找旧会话…");
    try {
      const sessions = await callBridge(`/sessions?query=${query}&limit=8`);
      const root = document.getElementById(sessionsId);
      if (!root) return;
      root.innerHTML = "";
      if (!sessions.length) {
        root.innerHTML = `<div class="chg-item"><div class="chg-item-title">没有找到匹配会话</div><div class="chg-item-meta">你可以先点“重建历史索引”再搜索一次。</div></div>`;
      } else {
        sessions.forEach((entry) => {
          const item = document.createElement("div");
          item.className = "chg-item";
          item.innerHTML = `
            <div class="chg-item-title">${escapeHtml(entry.thread_name || "Untitled session")}</div>
            <div class="chg-item-meta">${escapeHtml(entry.updated_at || "")}</div>
            <div class="chg-item-meta">${escapeHtml(entry.id || "")}</div>
            <div class="chg-item-meta">找回方式：${escapeHtml(entry.source_label || "本地历史恢复候选")}</div>
            <div class="chg-item-meta">本地存在，但原生侧栏可能暂时不可见。</div>
            <div class="chg-inline-actions">
              <button class="chg-btn" type="button" data-action="export-session" data-thread-id="${escapeHtml(entry.id || "")}" data-thread-title="${escapeHtml(entry.thread_name || "")}">导出 Markdown</button>
              <button class="chg-btn" type="button" data-action="export-handoff" data-thread-id="${escapeHtml(entry.id || "")}" data-thread-title="${escapeHtml(entry.thread_name || "")}">生成交接包</button>
              <button class="chg-btn" type="button" data-action="delete-session" data-thread-id="${escapeHtml(entry.id || "")}" data-thread-title="${escapeHtml(entry.thread_name || "")}" data-variant="warn">移除会话</button>
            </div>
          `;
          root.appendChild(item);
        });
      }
      updateFooter("搜索完成。");
    } catch (error) {
      updateResult(friendlyError(error, "这次没有搜到本地状态。可以稍后再试，或从高级里查看日志。"));
      updateFooter("搜索暂时不可用。");
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sidebarRowContainer(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-app-action-sidebar-thread-id], [data-session-id], a, button, [role="button"], li, [data-testid], div');
  }

  function findSidebarRows() {
    const exactRows = Array.from(document.querySelectorAll('[data-app-action-sidebar-thread-id]'))
      .map(sidebarRowContainer)
      .filter(Boolean);
    if (exactRows.length > 0) {
      return Array.from(new Set(exactRows));
    }

    const hintedRows = Array.from(document.querySelectorAll(
      '[data-thread-title], a[href*="/thread/"], a[href*="/conversation/"], a[href*="/session/"]'
    ))
      .map(sidebarRowContainer)
      .filter(Boolean);
    if (hintedRows.length > 0) {
      return Array.from(new Set(hintedRows));
    }

    return Array.from(document.querySelectorAll("a, button, [role='button'], li, div")).filter((element) => {
      const text = (element.textContent || "").trim();
      const href = element.getAttribute("href") || "";
      const preview = element.outerHTML?.slice?.(0, 400) || "";
      const hasSessionHint = /session|conversation|thread/i.test(`${href} ${preview}`);
      return text.length > 0 && text.length < 200 && hasSessionHint;
    });
  }

  function rowThreadRef(row) {
    const href = row.getAttribute("href") || row.querySelector("a")?.getAttribute("href") || "";
    const idMatch = href.match(/(?:session|conversation|thread)[=/:-]([A-Za-z0-9_.-]+)/i) || href.match(/([A-Za-z0-9_-]{8,})$/);
    const threadId = row.getAttribute("data-app-action-sidebar-thread-id")
      || row.querySelector("[data-app-action-sidebar-thread-id]")?.getAttribute("data-app-action-sidebar-thread-id")
      || row.getAttribute("data-session-id")
      || row.querySelector("[data-session-id]")?.getAttribute("data-session-id")
      || row.getAttribute("data-testid")
      || (idMatch && idMatch[1])
      || "";
    const titleNode = row.querySelector('[data-thread-title]');
    const title = ((titleNode || row).textContent || "Untitled session")
      .replace("删除", "")
      .replace("移除", "")
      .trim()
      .slice(0, 160);
    return { threadId, title };
  }

  function isCurrentSessionRow(row, threadId) {
    if (row.getAttribute("aria-current") === "page" || row.getAttribute("aria-current") === "true") return true;
    const href = row.getAttribute("href") || row.querySelector("a")?.getAttribute("href") || "";
    if (href) {
      try {
        const url = new URL(href, window.location.href);
        if (url.href === window.location.href || url.pathname === window.location.pathname) return true;
      } catch {
        if (window.location.href.includes(href)) return true;
      }
    }
    return !!threadId && window.location.href.includes(threadId);
  }

  function hasNativeRightStatus(row) {
    const rect = row.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 180) return true;
    if (!rect.width || !rect.height) return false;
    const candidates = Array.from(row.querySelectorAll([
      "button",
      "[role='button']",
      "svg",
      "[aria-busy='true']",
      "[data-loading]",
      "[class*='spinner']",
      "[class*='loading']",
      "[class*='status']"
    ].join(", "))).filter((node) => node instanceof Element && !node.closest(`.${rowDeleteClass}`));
    return candidates.some((node) => {
      const nodeRect = node.getBoundingClientRect();
      return nodeRect.width > 0
        && nodeRect.height > 0
        && nodeRect.left < rect.right
        && nodeRect.right > rect.right - 40;
    });
  }

  function confirmDelete(title) {
    document.querySelectorAll(`.${confirmOverlayClass}`).forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = confirmOverlayClass;
      overlay.innerHTML = `
        <div class="chg-confirm-card" role="dialog" aria-modal="true" aria-label="删除会话">
          <div class="chg-confirm-title">移除这条会话？</div>
          <div class="chg-confirm-copy">移除“${escapeHtml(title)}”？移除前会自动创建快照，可撤销。当前打开的会话不会显示移除按钮。</div>
          <div class="chg-confirm-actions">
            <button class="chg-confirm-cancel" type="button" data-chg-cancel="true">取消</button>
            <button class="chg-confirm-danger" type="button" data-chg-confirm="true">移除会话</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-chg-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-chg-confirm]")) {
          finish(true, event);
        }
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-chg-cancel]")?.focus();
    });
  }

  async function deleteFromSidebar(row, button) {
    const { threadId, title } = rowThreadRef(row);
    if (!threadId) return;
    if (!(await confirmDelete(title || threadId))) {
      return;
    }
    updateFooter("正在从原生侧栏移除会话…");
    try {
      const result = await callBridge("/delete-session", { thread_id: threadId, title });
      lastUndoToken = result.undo_token || null;
      updateResult("当前会话已移除。可在提示里撤销。");
      showToast("当前会话已移除。", true);
      row.remove();
      await refreshStatus();
      if (isCurrentSessionRow(row, threadId)) {
        window.location.reload();
      }
    } catch (error) {
      updateResult(friendlyError(error, "这次没有移除成功。本地历史没有被改动，可以稍后再试。"));
      updateFooter("移除暂时没有完成。");
      showToast("移除失败，请先重试。", false);
    } finally {
      button.blur();
    }
  }

  function attachSidebarDeleteButton(row) {
    const { threadId } = rowThreadRef(row);
    const existingButton = row.querySelector(`.${rowDeleteClass}`);
    if (row.dataset.chgSidebarRow === "true") {
      if (!threadId || isCurrentSessionRow(row, threadId) || hasNativeRightStatus(row)) {
        existingButton?.remove();
        row.dataset.chgSidebarRow = "ignored";
      }
      return;
    }
    if (!threadId) return;
    if (isCurrentSessionRow(row, threadId) || hasNativeRightStatus(row)) {
      existingButton?.remove();
      row.dataset.chgSidebarRow = "ignored";
      return;
    }
    row.dataset.chgSidebarRow = "true";
    if (getComputedStyle(row).position === "static") {
      row.style.position = "relative";
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = rowDeleteClass;
    button.setAttribute("aria-label", "移除会话");
    button.title = "移除会话";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 13h10l1-13" />
        <path d="M9 7V5h6v2" />
      </svg>
    `;
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    ["pointerdown", "mousedown", "mouseup", "touchstart"].forEach((eventName) => {
      button.addEventListener(eventName, stop, true);
    });
    button.addEventListener("click", (event) => {
      stop(event);
      void deleteFromSidebar(row, button);
    }, true);
    row.appendChild(button);
  }

  function scanSidebarRows() {
    findSidebarRows().forEach(attachSidebarDeleteButton);
  }

  async function runMutation(action) {
    const mapping = {
      snapshot: ["/snapshot", {}, "已创建快照。"],
      repair: ["/repair-sidebar", {}, "已尝试修复显示。"],
      rebuild: ["/rebuild-index", {}, "已重建历史索引。"],
      restore: ["/restore-latest", {}, "已恢复最近快照。"],
      "start-guard": ["/start-guard", {}, "已恢复保护。"],
      "stop-guard": ["/stop-guard", {}, "已暂停保护。"],
      "open-log-dir": ["/open-log-dir", {}, "已打开日志目录。"],
      "open-tool-dir": ["/open-tool-dir", {}, "已打开安装目录。"],
      "open-start-menu-dir": ["/open-start-menu-dir", {}, "已打开高级修复。"],
      "open-quick-start": ["/open-quick-start", {}, "已打开快速开始。"],
    };
    const tuple = mapping[action];
    if (!tuple) return;
    updateFooter("正在执行操作…");
    try {
      const [path, payload, okMessage] = tuple;
      await callBridge(path, payload);
      updateResult(okMessage);
      updateFooter(okMessage);
      if (action === "repair" || action === "rebuild" || action === "open-start-menu-dir") {
        rescueStage = nextRescueStage(action, true);
      }
      await refreshStatus();
    } catch (error) {
      updateResult(friendlyError(error, "这次操作没有完成。可以稍后再试，或从高级里查看日志。"));
      updateFooter("操作暂时没有完成。");
    }
  }

  async function runPrimaryRescue(button) {
    const action = button?.dataset.primaryAction || "status";
    if (action === "status") {
      await refreshStatus();
      return;
    }
    rescueStage = nextRescueStage(action, true);
    await runMutation(action);
  }

  async function showUninstallGuide() {
    try {
      const payload = await callBridge("/status");
      const startMenuDir = payload.management?.startMenuDir || "开始菜单里的 Codex Pro 文件夹";
      updateResult([
        "如果你想去掉这组增强功能：",
        `1. 先打开高级入口目录：${startMenuDir}`,
        "2. 运行里面的 Uninstall.cmd",
        "3. 默认只会移除入口和守护，不会删除你的历史快照",
        "4. 如果你连日志和私有数据也想一起清掉，再用 -RemoveData 卸载"
      ].join("\n"));
      updateFooter("已显示卸载方式。");
    } catch (error) {
      updateResult(friendlyError(error, "暂时没有读到卸载入口。可以从开始菜单里的 Codex Pro 文件夹打开卸载工具。"));
      updateFooter("暂时没有读到卸载入口。");
    }
  }

  async function deleteSession(button) {
    const threadId = button.getAttribute("data-thread-id") || "";
    const title = button.getAttribute("data-thread-title") || threadId;
    if (!threadId) return;
    if (!window.confirm(`移除本地会话“${title}”？\n移除前会自动创建快照，可在面板中撤销。`)) {
      return;
    }
    updateFooter("正在移除本地会话…");
    try {
      const result = await callBridge("/delete-session", { thread_id: threadId, title });
      lastUndoToken = result.undo_token || null;
      updateResult("移除完成。可在提示里撤销。");
      updateFooter("移除完成。");
      showToast("移除完成，可立即撤销。", true);
      await searchSessions();
      await refreshStatus();
      if (window.location.href.includes(threadId)) {
        window.location.reload();
      }
    } catch (error) {
      updateResult(friendlyError(error, "这次没有移除成功。本地历史没有被改动，可以稍后再试。"));
      updateFooter("移除暂时没有完成。");
    }
  }

  async function copyOrDownloadMarkdown(filename, markdown) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(markdown);
        return "copied";
      } catch {
        // Fall back to a user-initiated download below.
      }
    }
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "codex-session.md";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return "downloaded";
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function exportSession(button) {
    const threadId = button.getAttribute("data-thread-id") || "";
    const title = button.getAttribute("data-thread-title") || threadId;
    if (!threadId) return;
    updateFooter("正在生成 Markdown…");
    try {
      const result = await callBridge("/export-session-markdown", { thread_id: threadId, title });
      if (result.status !== "exported" || !result.markdown) {
        updateResult(result.message || "没有找到可导出的本地记录。");
        updateFooter("导出暂时不可用。");
        return;
      }
      const delivery = await copyOrDownloadMarkdown(result.filename, result.markdown);
      const actionText = delivery === "copied" ? "已复制到剪贴板" : "已保存为 Markdown";
      updateResult(`${actionText}：${result.filename}`);
      updateFooter("导出完成。");
      showToast(actionText, false);
    } catch (error) {
      updateResult(friendlyError(error, "这次没有导出成功。本地历史没有被改动，可以稍后再试。"));
      updateFooter("导出暂时没有完成。");
    }
  }

  async function exportHandoff(button) {
    const threadId = button.getAttribute("data-thread-id") || "";
    const title = button.getAttribute("data-thread-title") || threadId;
    if (!threadId) return;
    updateFooter("正在生成交接包…");
    try {
      const result = await callBridge("/handoff/export", { thread_id: threadId, title });
      if (result.status !== "handoff_exported" || !result.markdown) {
        updateResult(result.message || "没有找到可生成交接包的本地记录。");
        updateFooter("交接包暂时不可用。");
        return;
      }
      const delivery = await copyOrDownloadMarkdown(result.filename, result.markdown);
      const actionText = delivery === "copied" ? "交接包已复制到剪贴板" : "交接包已保存";
      updateResult(`${actionText}：${result.filename}`);
      updateFooter("交接包已生成。");
      showToast(actionText, false);
    } catch (error) {
      updateResult(friendlyError(error, "这次没有生成交接包。本地历史没有被改动，可以稍后再试。"));
      updateFooter("交接包暂时没有完成。");
    }
  }

  async function checkUpdate() {
    updateFooter("正在检查更新…");
    try {
      const result = await callBridge("/update/check");
      updateResult(result.message || "这次没有检查到更新信息。稍后再试即可。");
      if (result.status === "update_available") {
        setUpdateButtonMode("install", result.latestVersion || "");
        updateFooter("发现新版本。点“立即更新”即可完成安装，随后重新打开 Codex。");
        showToast("发现 Codex Pro 新版本。", false);
        return;
      }
      setUpdateButtonMode("check");
      updateFooter("更新检查完成。");
    } catch (error) {
      setUpdateButtonMode("check");
      updateResult(friendlyError(error, "这次没有检查到更新信息。Codex Pro 不会阻塞启动，可以稍后再试。"));
      updateFooter("更新检查暂时不可用。");
    }
  }

  async function autoCheckUpdateNotice() {
    if (updatePromptChecked) {
      return;
    }
    updatePromptChecked = true;
    try {
      const result = await callBridge("/update/check");
      if (result.status === "update_available") {
        setUpdateButtonMode("install", result.latestVersion || "");
        if (!updatePromptShown) {
          showToast(
            result.latestVersion
              ? `发现 Codex Pro ${result.latestVersion}，可在高级里立即更新。`
              : "发现 Codex Pro 新版本，可在高级里立即更新。",
            false,
          );
          updatePromptShown = true;
        }
      } else {
        setUpdateButtonMode("check");
      }
    } catch (_error) {
      setUpdateButtonMode("check");
    }
  }

  async function installUpdate(button) {
    const targetVersion = button?.dataset.version || "";
    if (button) {
      button.disabled = true;
    }
    updateFooter("正在安装更新…");
    try {
      const result = await callBridge("/update/install", targetVersion ? { version: targetVersion } : {});
      updateResult(result.message || "更新已经安装完成。请重新打开 Codex。");
      if (result.status === "update_installed") {
        setUpdateButtonMode("check");
        updateFooter(result.nextAction || "更新完成。请重新打开 Codex。");
        showToast("Codex Pro 已更新。请重新打开 Codex。", false);
        return;
      }
      setUpdateButtonMode("check");
      updateFooter("当前已经是最新版本。");
    } catch (error) {
      setUpdateButtonMode("install", targetVersion);
      updateResult(friendlyError(error, "这次没有完成更新。当前版本仍可继续使用，可以稍后再试。"));
      updateFooter("更新暂时没有完成。");
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function undoDelete() {
    if (!lastUndoToken) {
      updateResult("当前没有可撤销的删除记录。");
      updateFooter("没有可撤销的删除。");
      return;
    }
    updateFooter("正在恢复删除前快照…");
    try {
      const result = await callBridge("/undo-delete-session", { undo_token: lastUndoToken });
      updateResult("已恢复删除前快照。");
      updateFooter("已恢复删除前快照。");
      showToast("已恢复删除前快照。", false);
      await searchSessions();
      await refreshStatus();
      scanSidebarRows();
    } catch (error) {
      updateResult(friendlyError(error, "这次没有恢复成功。可以稍后再试，或从高级修复里恢复快照。"));
      updateFooter("撤销暂时没有完成。");
    }
  }

  async function handleAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.getAttribute("data-action");
    if (action === "status") {
      await refreshStatus();
      return;
    }
    if (action === "search") {
      await searchSessions();
      return;
    }
    if (action === "delete-session") {
      await deleteSession(button);
      return;
    }
    if (action === "export-session") {
      await exportSession(button);
      return;
    }
    if (action === "export-handoff") {
      await exportHandoff(button);
      return;
    }
    if (action === "check-update") {
      await checkUpdate();
      return;
    }
    if (action === "install-update") {
      await installUpdate(button);
      return;
    }
    if (action === "repair-plugin-entry") {
      await repairPluginEntry();
      return;
    }
    if (action === "repair-plugin-install") {
      await repairPluginInstallButtons();
      return;
    }
    if (action === "build-timeline") {
      buildConversationTimeline();
      return;
    }
    if (action === "clear-timeline") {
      clearConversationTimeline();
      return;
    }
    if (action === "jump-timeline") {
      jumpTimeline(button);
      return;
    }
    if (action === "primary-rescue") {
      await runPrimaryRescue(button);
      return;
    }
    if (action === "undo-delete") {
      await undoDelete();
      return;
    }
    if (action === "show-uninstall") {
      await showUninstallGuide();
      return;
    }
    await runMutation(action);
  }

  function scheduleSidebarScan() {
    if (window.__codexHistoryGuardSidebarScanPending) return;
    window.__codexHistoryGuardSidebarScanPending = true;
    requestAnimationFrame(() => {
      window.__codexHistoryGuardSidebarScanPending = false;
      ensureLauncherTrigger();
      scanSidebarRows();
      ensureSidebarRepairEntry();
      renderPluginEntryStatus();
      renderPluginInstallStatus();
    });
  }

  function startUi() {
    if (bootStarted) return;
    if (!document.body || !document.documentElement) return;
    bootStarted = true;
    ensureDom();
    scanSidebarRows();
    void refreshStatus();
    void autoCheckUpdateNotice();
    window.__codexHistoryGuardSidebarObserver?.disconnect?.();
    window.__codexHistoryGuardSidebarObserver = new MutationObserver(scheduleSidebarScan);
    window.__codexHistoryGuardSidebarObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function waitForDomAndStart() {
    if (bootStarted) return;
    if (document.body && document.documentElement) {
      startUi();
      return;
    }
    requestAnimationFrame(waitForDomAndStart);
  }

  if (document.body && document.documentElement) {
    startUi();
  } else {
    document.addEventListener("DOMContentLoaded", startUi, { once: true });
    waitForDomAndStart();
  }
})();

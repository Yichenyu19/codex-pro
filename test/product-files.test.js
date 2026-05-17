import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(".");

test("package manifest includes release-critical product files", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "codex-pro");
  assert.match(manifest.description, /Unofficial local Pro enhancement layer/);
  for (const keyword of ["codex", "codex-desktop", "history", "recovery", "windows", "sessions", "takeover"]) {
    assert.ok(manifest.keywords.includes(keyword), `package.json keywords must include ${keyword}`);
  }
  assert.deepEqual(manifest.bin, {
    "codex-pro": "./src/cli.js",
    "codex-guard": "./src/cli.js",
    "codex-provider": "./src/cli.js",
    "codex-history": "./src/cli.js"
  });
  for (const file of [
    "docs",
    "inject-ui/history-guard-ui.js",
    "launcher-python/launcher.py",
    "launcher-python/requirements.txt",
    "scripts/Install-Codex-Pro.ps1",
    "scripts/Uninstall-Codex-Pro.ps1",
    "scripts/Install-Codex-Guard.ps1",
    "scripts/Uninstall-Codex-Guard.ps1",
    "scripts/validate-install-smoke.mjs",
    "scripts/validate-history-continuity.mjs",
    "scripts/validate-real-codex-state.mjs",
    "scripts/validate-real-codex-ui.py",
    "scripts/validate-release.ps1",
    "src"
  ]) {
    assert.ok(manifest.files.includes(file), `package.json files must include ${file}`);
  }
  assert.ok(!manifest.files.includes("inject-ui/preview.html"), "package.json files must not include the removed preview page");
  assert.ok(!manifest.files.includes("scripts/validate-ui-preview.mjs"), "package.json files must not include the removed preview validator");
});

test("agents guide front-loads the current Codex Pro release track", async () => {
  const text = await fs.readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  const currentTrackIndex = text.indexOf("## Current Release Track (Read First)");
  assert.ok(currentTrackIndex >= 0, "AGENTS.md must start with the current Codex Pro track");
  assert.match(text, /The active product is `Codex Pro`/);
  assert.match(text, /ordinary users continue opening `Codex` normally/);
  assert.match(text, /single-session Markdown export/);
  assert.match(text, /local handoff export/);
  assert.match(text, /lightweight current-page Timeline/);
  assert.match(text, /low-noise update check and one-click install/);
  assert.match(text, /docs\/feedback-triage\.md/);
  assert.match(text, /docs\/v0\.3-implementation-guardrails\.md/);
  assert.match(text, /legacy `codex-provider` CLI alias may remain for compatibility/);
  assert.doesNotMatch(text, /Longer-term Codex Pro scope may add Codex\+\+-style capabilities such as plugin-entry repair, Markdown export, conversation timeline/);
  assert.doesNotMatch(text, new RegExp("CodexProvider" + "Sync\\.exe"));
});

test("supporting readmes use the current Codex Pro product track", async () => {
  const zh = await fs.readFile(path.join(repoRoot, "README_ZH.md"), "utf8");
  const en = await fs.readFile(path.join(repoRoot, "README_EN.md"), "utf8");
  const gui = await fs.readFile(path.join(repoRoot, "README_GUI_ZH.md"), "utf8");
  const combined = `${zh}\n${en}\n${gui}`;
  assert.match(zh, /Codex Pro/);
  assert.match(en, /Codex Pro/);
  assert.match(gui, /Codex Pro/);
  assert.match(combined, /继续像平常一样打开 `Codex`|Keep opening `Codex` normally/);
  assert.match(en, /Ordinary users can stop here/);
  assert.match(en, /For Maintainers \/ Advanced Users/);
  assert.doesNotMatch(combined, new RegExp("Dailin" + "521/codex-provider" + "-sync"));
  assert.doesNotMatch(combined, new RegExp("CodexProvider" + "Sync\\.exe"));
});

test("github issue templates use the current Codex Pro support flow", async () => {
  const templateDir = path.join(repoRoot, ".github", "ISSUE_TEMPLATE");
  const files = [
    "bug_report.yml",
    "support.yml",
    "desktop_visibility.yml",
    "config.yml"
  ];
  const combined = (await Promise.all(files.map((file) => fs.readFile(path.join(templateDir, file), "utf8")))).join("\n");
  assert.match(combined, /Codex Pro/);
  assert.match(combined, /status \/ 历史/);
  assert.match(combined, /docs\/feedback-triage\.md/);
  assert.match(combined, /不要粘贴密钥|不会在 issue 里粘贴密钥/);
  assert.match(combined, /完整本地历史文件/);
  assert.match(combined, /当前模式/);
  assert.match(combined, /安装方式/);
  assert.match(combined, /继续像平常一样打开 Codex|固定恢复路径/);
  assert.doesNotMatch(combined, /历史与修复/);
  assert.doesNotMatch(combined, /sync、switch、restore/);
  assert.doesNotMatch(combined, /运行 sync \/ switch/);
  assert.doesNotMatch(combined, /macOS 15\.x/);
  assert.doesNotMatch(combined, new RegExp("Dailin" + "521/codex-provider" + "-sync"));
  assert.doesNotMatch(combined, new RegExp("codex-provider" + "-sync 版本"));
  assert.doesNotMatch(combined, new RegExp("CodexProvider" + "Sync\\.exe"));
});

test("install script includes prerequisite checks and app-like result summary", async () => {
  const text = await fs.readFile(path.join(repoRoot, "scripts", "Install-Codex-Pro.ps1"), "utf8");
  assert.match(text, /\[string\]\$DesktopPath/);
  assert.match(text, /\[string\]\$StartMenuPath/);
  assert.match(text, /\[switch\]\$SkipGuardBootstrap/);
  assert.match(text, /Assert-CommandExists/);
  assert.match(text, /Node\.js 24\+/);
  assert.match(text, /Python 3\.11\+/);
  assert.match(text, /Open Codex Pro\.cmd/);
  assert.match(text, /Repair History\.cmd/);
  assert.match(text, /Protection Status\.cmd/);
  assert.match(text, /Injection Check\.cmd/);
  assert.match(text, /Quick Start\.txt/);
  assert.match(text, /当前状态：/);
  assert.match(text, /日常入口：/);
  assert.match(text, /下一步：/);
  assert.match(text, /日志位置：/);
  assert.match(text, /安全边界：不会改 provider、base_url、登录方式或 encrypted_content。/);
  assert.match(text, /维护入口：/);
  assert.match(text, /开始菜单高级入口/);
  assert.doesNotMatch(text, /默认 Bridge 端口：8765/);
  assert.doesNotMatch(text, /默认 CDP 端口：9333/);
  assert.match(text, /启动器日志：/);
  assert.match(text, /cdp-diagnosis\.json/);
  assert.doesNotMatch(text, /Codex Pro\.cmd doctor/);
});

test("uninstall script supports optional data cleanup", async () => {
  const text = await fs.readFile(path.join(repoRoot, "scripts", "Uninstall-Codex-Pro.ps1"), "utf8");
  assert.match(text, /\[string\]\$DesktopPath/);
  assert.match(text, /\[string\]\$StartMenuPath/);
  assert.match(text, /\[switch\]\$SkipStopGuard/);
  assert.match(text, /\[switch\]\$RemoveData/);
  assert.match(text, /已按 -RemoveData 清理 Codex Pro 私有数据/);
  assert.match(text, /已移除注入检查入口/);
  assert.match(text, /已移除保护状态入口/);
  assert.match(text, /已移除快速开始说明/);
  assert.match(text, /已移除开始菜单 Codex Pro 文件夹/);
  assert.match(text, /保留内容：Codex 历史、历史快照和仓库代码默认保留。/);
  assert.match(text, /只有显式使用 -RemoveData 才会删除 Codex Pro 私有日志和数据。/);
  assert.match(text, /下一步：继续像平常一样打开 Codex。/);
});

test("readme and launcher docs mention launcher log path and restore action", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  assert.doesNotMatch(readme, /\]\(https:\/\/github\.com\/\)/);
  const docs = await fs.readFile(path.join(repoRoot, "docs", "launcher-python.md"), "utf8");
  assert.match(readme, /launcher\.log|启动器日志/);
  assert.match(readme, /restore-latest|恢复最近快照/);
  assert.match(readme, /继续像平常一样打开 `Codex`|继续正常打开 `Codex`/);
  assert.match(readme, /增强能力会尽量自动附着/);
  assert.match(readme, /页面增强能力|官方桌面包是否允许所需的页面增强能力/);
  assert.doesNotMatch(readme, /增强能力会自动附着；/);
  assert.match(readme, /Codex Pro(?:\.cmd)?/);
  assert.match(readme, /开始菜单 `Codex Pro`|开始菜单里的 `Codex Pro`/);
  assert.match(readme, /Repair History/);
  assert.match(readme, /Protection Status/);
  assert.match(readme, /Quick Start\.txt|快速开始/);
  assert.match(readme, /如果你只是普通用户，到这里就够了/);
  assert.match(readme, /给维护者 \/ 高级用户/);
  assert.match(readme, /读取当前历史状态，并直接告诉你下一步该点什么/);
  assert.match(readme, /恢复保护。/);
  assert.match(docs, /launcher\.log/);
  assert.match(docs, /cdp-diagnosis\.json/);
});

test("readme treats stable provider identity as an advanced option", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /provider identity/);
  assert.match(readme, /固定 `model_provider` 名字有用/);
  assert.match(readme, /不是普通用户必须手动维护的前置步骤/);
  assert.match(readme, /安装后继续正常打开 `Codex`|继续像平常一样打开 `Codex`/);
});

test("readme and launcher docs describe scoped first release boundaries", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const launcherDocs = await fs.readFile(path.join(repoRoot, "docs", "launcher-python.md"), "utf8");
  assert.match(readme, /首发边界/);
  assert.match(readme, /脚本 \+ 绿色包/);
  assert.match(readme, /单条删除 \+ 自动快照 \+ 可撤销/);
  assert.doesNotMatch(readme, /当前还未完整实现/);
  assert.match(launcherDocs, /首发边界/);
  assert.match(launcherDocs, /脚本 \+ 绿色包/);
  assert.doesNotMatch(launcherDocs, /当前仍待增强/);
});

test("quick-start guide exists for non-README users", async () => {
  const text = await fs.readFile(path.join(repoRoot, "docs", "quick-start-zh.txt"), "utf8");
  assert.match(text, /继续像平常一样打开/);
  assert.match(text, /Codex Pro\.cmd/);
  assert.match(text, /维护 \/ 救援入口|维护\/救援入口/);
  assert.match(text, /Codex Pro/);
  assert.match(text, /Repair History/);
  assert.match(text, /Protection Status/);
  assert.match(text, /Injection Check/);
  assert.match(text, /开始菜单/);
  assert.match(text, /launcher\.log/);
  assert.match(text, /--diagnose-cdp/);
  assert.match(text, /cdp-diagnosis\.json/);
});

test("standalone UI preview page is removed from the repository", async () => {
  for (const file of [
    "inject-ui/preview.html",
    "scripts/validate-ui-preview.mjs",
    "docs/ui-preview.md"
  ]) {
    await assert.rejects(fs.stat(path.join(repoRoot, file)));
  }

  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const readmeEn = await fs.readFile(path.join(repoRoot, "README_EN.md"), "utf8");
  const agents = await fs.readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  const framework = await fs.readFile(path.join(repoRoot, "docs", "project-framework.md"), "utf8");
  const realUi = await fs.readFile(path.join(repoRoot, "docs", "real-ui-validation.md"), "utf8");
  const releaseChecklist = await fs.readFile(path.join(repoRoot, "docs", "release-checklist.md"), "utf8");

  for (const text of [readme, readmeEn, agents, framework, realUi, releaseChecklist]) {
    assert.doesNotMatch(text, /inject-ui\/preview\.html/);
    assert.doesNotMatch(text, /validate-ui-preview\.mjs/);
    assert.doesNotMatch(text, /ui-preview\.md/);
    assert.doesNotMatch(text, /UI 预览验证|预览页修复/);
  }
});

test("real codex ui validation docs and script exist for release-time verification", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const docs = await fs.readFile(path.join(repoRoot, "docs", "real-ui-validation.md"), "utf8");
  const launcherDocs = await fs.readFile(path.join(repoRoot, "docs", "launcher-python.md"), "utf8");
  const script = await fs.readFile(path.join(repoRoot, "scripts", "validate-real-codex-ui.py"), "utf8");
  assert.match(readme, /validate-real-codex-ui\.py/);
  assert.match(readme, /artifacts\/real-codex/);
  assert.match(docs, /真实 Codex 页面验证/);
  assert.match(docs, /被接管的原生 `Codex` 入口|takeover 主路径/);
  assert.match(docs, /--launch-mode debug/);
  assert.match(docs, /1 \/ 2/);
  assert.match(docs, /2 \/ 2/);
  assert.match(docs, /validation-summary\.json/);
  assert.match(docs, /mode = takeover_injection/);
  assert.match(docs, /mode = takeover_compatibility/);
  assert.match(docs, /compatibility-note\.txt/);
  assert.match(launcherDocs, /validate-real-codex-ui\.py/);
  assert.match(script, /Real Codex UI validation passed/);
  assert.match(script, /Real Codex UI compatibility validation passed/);
  assert.match(script, /--launch-mode/);
  assert.match(script, /takeover_injection/);
  assert.match(script, /takeover_compatibility/);
  assert.match(script, /desktop_codex_shortcut/);
  assert.match(script, /real-codex-hover-delete-visible\.png/);
  assert.match(script, /real-codex-repair-entry-open-panel\.png/);
  assert.match(script, /real-codex-repair-entry-after-open-click\.png/);
  assert.match(script, /compatibility-note\.txt/);
  assert.match(script, /validation-summary\.json/);
});

test("release checklist and smoke script exist for maintainers", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const docs = await fs.readFile(path.join(repoRoot, "docs", "release-checklist.md"), "utf8");
  const script = await fs.readFile(path.join(repoRoot, "scripts", "validate-release.ps1"), "utf8");
  assert.match(readme, /validate-release\.ps1/);
  assert.match(readme, /release-checklist\.md/);
  assert.match(readme, /feedback-triage\.md/);
  assert.match(readme, /v0\.3-implementation-guardrails\.md/);
  assert.match(readme, /真实 Codex 页面验证|UI 以真实 Codex 页面验证为准/);
  assert.match(docs, /npm test/);
  assert.match(docs, /docs\/feedback-triage\.md/);
  assert.match(docs, /docs\/v0\.3-implementation-guardrails\.md/);
  assert.match(docs, /issue templates 不要求用户粘贴密钥/);
  assert.match(docs, /继续正常打开 `Codex`/);
  assert.match(docs, /runSync keeps history grouped under a stable provider identity/);
  assert.match(docs, /validate-history-continuity\.mjs/);
  assert.match(docs, /validate-real-codex-state\.mjs/);
  assert.match(docs, /artifacts\/history-continuity\/validation-summary\.json/);
  assert.match(docs, /artifacts\/real-codex-state\/validation-summary\.json/);
  assert.match(docs, /validate-real-codex-ui\.py/);
  assert.match(docs, /mode = takeover_injection/);
  assert.match(docs, /mode = takeover_compatibility/);
  assert.match(docs, /compatibility-note\.txt/);
  assert.match(docs, /takeover 主路径/);
  assert.match(script, /npm test/);
  assert.match(script, /\[1\/5\] Running npm test/);
  assert.match(script, /validate-install-smoke\.mjs/);
  assert.match(script, /validate-history-continuity\.mjs/);
  assert.match(script, /validate-real-codex-state\.mjs/);
  assert.match(script, /validate-real-codex-ui\.py/);
  assert.doesNotMatch(script, /validate-ui-preview\.mjs/);
  assert.match(script, /\[switch\]\$SkipRealUi/);
  assert.match(script, /\[switch\]\$SkipRealState/);
  assert.match(script, /Invoke-NativeStep/);
  assert.match(script, /\$LASTEXITCODE/);
  assert.match(script, /Real UI gate:/);
  assert.match(script, /takeover_injection/);
  assert.match(script, /takeover_compatibility/);
  assert.match(script, /compatibility-note\.txt/);
  assert.match(script, /Real state artifacts:/);
  assert.match(script, /Release validation passed/);
});

test("readme and release docs include real codex state validation", async () => {
  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const docs = await fs.readFile(path.join(repoRoot, "docs", "release-checklist.md"), "utf8");
  const script = await fs.readFile(path.join(repoRoot, "scripts", "validate-real-codex-state.mjs"), "utf8");
  assert.match(readme, /validate-real-codex-state\.mjs/);
  assert.match(readme, /artifacts\/real-codex-state\/validation-summary\.json/);
  assert.match(docs, /真实 `?\.codex`? 状态产物|real-codex-state/);
  assert.match(script, /Real Codex state validation passed/);
  assert.match(script, /historyVisibility/);
  assert.match(script, /runResumeFallback/);
  assert.match(script, /runGuardStatus/);
  assert.match(script, /takeover/);
  assert.match(script, /normalOpenCodexReady/);
});

test("release checklist avoids stale hard-coded candidate counts", async () => {
  const docs = await fs.readFile(path.join(repoRoot, "docs", "release-checklist.md"), "utf8");
  assert.match(docs, /实际通过数以当前 `npm test` 输出为准/);
  assert.match(docs, /文件数以当前 dry-run 输出为准/);
  assert.doesNotMatch(docs, /90\/90/);
  assert.doesNotMatch(docs, /44 files/);
});

test("history continuity validation script covers config switch recovery", async () => {
  const script = await fs.readFile(path.join(repoRoot, "scripts", "validate-history-continuity.mjs"), "utf8");
  assert.match(script, /model_provider = "openai"/);
  assert.match(script, /model_provider = "codex"/);
  assert.match(script, /auth\.json/);
  assert.match(script, /runSnapshot/);
  assert.match(script, /runSync/);
  assert.match(script, /runRepairSidebar/);
  assert.match(script, /runRebuildIndex/);
  assert.match(script, /runGuardOnce/);
  assert.match(script, /History continuity validation passed/);
  assert.match(script, /artifacts", "history-continuity"/);
});

test("python launcher treats native Codex as the primary user path", async () => {
  const text = await fs.readFile(path.join(repoRoot, "launcher-python", "launcher.py"), "utf8");
  assert.match(text, /正在准备 Codex Pro 自动附着/);
  assert.match(text, /继续像平常一样打开 Codex 即可/);
  assert.match(text, /开始菜单里的 Repair History/);
  assert.match(text, /打开高级修复|开始菜单里的 Injection Check 或查看 launcher\.log/);
  assert.match(text, /检测到 Codex 已经在运行，这次先继续使用当前窗口|当前已经有一个 Codex 窗口在运行，这次页面增强没能直接附着到它/);
  assert.match(text, /py launcher-python\\\\launcher\.py --diagnose-cdp/);
  assert.match(text, /详细日志: \{log_path\(\)\}|详细日志:/);
});


# Release Checklist

这个清单是给维护者的，不是普通用户的日常入口。

目标不是“把所有脚本都跑一遍”，而是确认**首发主路径**真的成立：

- 普通用户继续正常打开 `Codex`
- 这个 `Codex` 入口已经被增强接管
- takeover 主路径可走通
- 注入成功时像官方自带
- 注入失败时也能以兼容模式继续可用

## 推荐命令

```powershell
pwsh -File .\scripts\validate-release.ps1
```

默认会依次执行：

1. `npm test`
2. `node .\scripts\validate-install-smoke.mjs`
3. `node .\scripts\validate-history-continuity.mjs`
4. `node .\scripts\validate-real-codex-state.mjs`
5. `py .\scripts\validate-real-codex-ui.py`

## 可选跳过

如果当前机器不适合跑真实 Codex 页面验证，可以临时跳过最后一步：

```powershell
pwsh -File .\scripts\validate-release.ps1 -SkipRealUi
```

如果当前机器没有可用的真实 `.codex` 数据，也可以临时跳过真实状态扫描：

```powershell
pwsh -File .\scripts\validate-release.ps1 -SkipRealState
```

## 必看产物

历史连续性产物：

```text
artifacts/history-continuity/validation-summary.json
```

安装 / 卸载 smoke 产物：

```text
artifacts/install-smoke/validation-summary.json
```

真实页面产物：

```text
artifacts/real-codex/real-codex-hover-delete-visible.png
artifacts/real-codex/real-codex-repair-entry-open-panel.png
artifacts/real-codex/real-codex-repair-entry-after-open-click.png
artifacts/real-codex/validation-summary.json
```

如果这次真实页面验证走的是兼容模式，而不是注入模式，那么真实页面产物应改成：

```text
artifacts/real-codex/compatibility-note.txt
artifacts/real-codex/validation-summary.json
```

这时不应该再残留上一次注入成功时生成的旧截图。

真实 `.codex` 状态产物：

```text
artifacts/real-codex-state/validation-summary.json
```

## 发版门槛

发布前至少确认：

- `npm test` 全绿
- 实际通过数以当前 `npm test` 输出为准，不要把历史候选的测试计数当成新的发版依据
- `npm pack --dry-run --json` 清单干净；包名应为 `codex-pro@0.2.5`，文件数以当前 dry-run 输出为准，且不包含 `.trellis`、`artifacts`、占位网页或真实用户数据
- GitHub release title 和 release notes 以 `docs/release-notes-v0.2.5.md` 为准；只能写已验证能力，planned 能力必须明确标成未包含或后续阶段
- release notes 必须保持 compatibility-ready 口径，不得暗示全量 Codex++ parity、安装器已经完成、所有环境都能完整页面增强或官方隶属关系
- `docs/feedback-triage.md` 存在，并能指导安装失败、更新失败、卸载失败、历史不显示、兼容模式、Codex++ parity 诉求和安全 / 隐私疑问的首批 issue 分流
- `docs/v0.3-implementation-guardrails.md` 存在，并明确 v0.3.0 只做安装 / 更新 / 卸载体验收口，不把后续 planned 能力写成首发已完成
- issue templates 不要求用户粘贴密钥、`auth.json`、token、`encrypted_content` 原文或完整本地历史文件；对应文件位于 `.github/ISSUE_TEMPLATE/*.yml`
- `validate-install-smoke.mjs` 通过，并确认安装时接管原生 `Codex` 快捷方式、卸载时恢复原始快捷方式
- `package.json` 的包名、描述和关键词都指向 `Codex Pro` 当前产品线；`codex-provider` 只作为兼容 CLI alias 保留
- `runSync keeps history grouped under a stable provider identity` 用例通过
- `validate-history-continuity.mjs` 通过，并确认修复后 provider、rollout、SQLite、索引和工作区状态一致
- `validate-real-codex-state.mjs` 产物里能看到 takeover 摘要、兼容模式标记和固定恢复路径
- 高级区能力已经被测试覆盖：单会话 Markdown 导出、本地交接包、插件入口 / 安装按钮可用性修复、轻量 Timeline、一键检查 / 安装更新
- 仓库不再提供独立网页占位页；真实 UI 体验必须以 `validate-real-codex-ui.py` 的真实 Codex 页面产物为准
- 真实页面摘要必须满足下面二选一，而且**默认来自 takeover 主路径**：
  - 注入链通过（`mode = takeover_injection`）：
    - `launchPath = takeover`
    - `triggeredByTakenOverCodex = true`
    - `takeoverEvidence.launcherStarted = true`
    - `launcherMode = native`
    - `deleteButtons > 0`
    - `visibleDeleteButtons > 0`
    - 修复前 `roots = 1 / 2`
    - 修复后 `roots = 2 / 2`
  - 兼容链通过（`mode = takeover_compatibility`）：
    - `launchPath = takeover`
    - `triggeredByTakenOverCodex = true`
    - `takeoverEvidence.launcherStarted = true`
    - 有 `failedStage` 和 `fallbackReason`
    - 有 `recoveryPlan`、`management`、`takeover`
    - `uiMode` 属于 `compatibility_*` 或 `diagnosis_unknown_*`
    - `artifacts/real-codex/compatibility-note.txt` 存在
    - `artifacts/real-codex/real-codex-hover-delete-visible.png` 等注入截图不存在
    - 不能再依赖额外 fallback 启动路径补起主链

## validate-release.ps1 现在必须回答什么

发版脚本不能只说“测试过了”，还必须明确告诉维护者：

- 这次真实 UI 验证走的是 takeover 主路径还是 debug 路径
- 当前通过模式是 `takeover_injection` 还是 `takeover_compatibility`
- 如果只是兼容模式通过，是否仍满足“继续正常打开 Codex 就能使用”的发版条件
- 如果失败，失败点是在 takeover、注入、兼容回退还是发布资产

## 不在这个清单里解决的问题

- 普通用户的 provider 配置问题
- 登录方式切换策略
- 批量删除
- 安装器 EXE 化
- 任意来源启动 `Codex.exe` 都自动附着

这个清单只负责保证：**当前这版确实已经把首发主路径封板成一个可发布的 Codex Desktop 增强产品。**



<div align="center">

# Codex Pro

### 让 Codex Desktop 的本地历史更不容易“像丢了一样”，并给你一条原生感、可恢复的修复路径。

![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
[![Node](https://img.shields.io/badge/node-24%2B-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

> `Codex Pro` 是非官方、本地优先的 Codex Desktop 增强层，与 OpenAI 无隶属关系；它不修改 Codex 安装包，也不会上传你的本地历史、账号数据或 `auth.json`。

它不是新的 Codex，也不是插件市场、云同步工具或 provider 管理器。v0.2.5 先做一件事：**让本地历史更安全、更容易找回，并把恢复入口尽量融进原生 Codex。**

Codex++ 是重要参考项目；Codex Pro 会分阶段对齐它的高需求能力，但首发不是“全量 Codex++ parity”，也不直接复制 Codex++ 源码。

## 30 秒上手

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

装好后**继续像平常一样打开 `Codex`**。如果历史没显示完整，先在 Codex 里点 `历史`，按固定三步走：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

`Codex Pro.cmd` 只作为维护 / 救援入口保留，平时不用把它当成新的日常入口。

安全边界放在前面说清楚：它不会上传你的历史、账号数据、`auth.json` 或旧加密会话内容；不会自动改 `model_provider`、`base_url` 或登录方式；不会重写 `encrypted_content`；也不承诺恢复本地已经不存在的历史或跨 provider / account 解密旧内容。

v0.2.5 是 **compatibility-ready first public release**：支持页面增强时会尽量融进 Codex；当前环境不支持时会安全回退到兼容模式，继续保留历史保护、快照、修复和索引重建。它还不是 EXE 安装器，也不承诺 universal injection。

## 这是什么

`Codex Pro` 是一个面向 Windows 的 Codex 增强层。当前公开版本先把历史保护、恢复、删除撤销、单会话 Markdown 导出、本地交接包、高级区插件入口 / 安装按钮可见性修复和长对话跳转打稳；会话项目移动等更完整的 Pro 能力会继续分阶段验证。

它不替代 Codex，也不改你的 provider、`base_url` 或登录方式。当前版本先做一件事：

- 尽量把历史会话保住
- 出问题时尽量自动修
- 自动修不够时给你明确恢复入口

它重点覆盖这些高频问题：

- 修改 `config.toml`
- 切换 `model_provider`
- 从 OAuth 登录切到 API 登录
- 从 API 登录切回其他登录方式
- `.codex-global-state.json` 被重写后导致侧栏历史消失
- `session_index.jsonl` 丢失、被清空或缩短

装好后，对普通用户来说，你平时只会感受到这些事：

- 继续像平常一样打开 `Codex`
- 历史有风险时，工具会先自动快照，再尽量自动修
- 如果页面增强能挂上去，`历史`、删除撤销和恢复入口会自然融进原生界面
- 只有需要时，才从高级区处理单会话导出、本地交接包、插件可见性修复、长对话跳转和一键更新
- 如果这台机器当前不支持页面增强，也会自动切成兼容模式继续可用

## 普通用户怎么用

如果你只是想把它装好然后一直用，记住下面三件事就够了：

1. 安装后继续像平常一样打开 `Codex`
2. 如果历史短暂消失，先等它自动修
3. 如果还没恢复，先在 Codex 里打开 `历史`；仍不完整时再去开始菜单 `Codex Pro` 文件夹里的 `Repair History`。只有想确认保护状态或兼容原因时，再看 `Protection Status` 和 `Injection Check`

自动修失败后的三步路径（固定）：

1. 在 `历史` 里点“修复历史显示”
2. 再点“重建历史索引”
3. 仍未恢复时，点“打开高级修复”，再用开始菜单里的 `Repair History`

## 快速安装

### Windows 普通用户

在 PowerShell 中运行：

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

安装完成后，**以后继续像平常一样打开 `Codex` 即可**。
`Codex Pro.cmd` 会保留为维护 / 救援入口，平时不需要把它当成新的日常主入口。

安装脚本收口后的首屏结果只看四行就够了：

- 当前状态
- 日常入口
- 下一步
- 日志位置

安装后会：

- 安装依赖
- 安装 Python launcher 依赖
- 创建桌面维护入口 `Codex Pro.cmd`
- 在开始菜单 `Codex Pro` 文件夹里创建高级入口
- 高级入口包括 `Repair History / Protection Status / Update Codex Pro / Injection Check / History Check / Quick Start / Uninstall`
- 另保留 `Open Codex Pro` 作为低频维护入口，不是新的日常主入口
- 启动本地轻量守护
- 自动做一次历史检查
- 自动创建一次历史快照
- 输出启动器日志位置 `~/.codex-pro/launcher.log`
- 告诉你以后继续正常打开 `Codex`

### 卸载

```powershell
pwsh -File .\scripts\Uninstall-Codex-Pro.ps1
```

卸载会先恢复被接管的原生 `Codex` 快捷方式；如果某个 `Codex` 入口是安装时自动创建的，卸载会把它移除。默认不会删除你的 Codex 历史、历史快照或仓库代码；只有显式使用 `-RemoveData` 时，才会清理工具自己的日志和私有数据。

## 正常打开 Codex + 一组维护入口

日常使用时：

- 继续像平常一样打开 `Codex`
  - 增强能力会尽量自动附着；平时尽量不打扰你。

桌面上保留 1 个低频维护入口：

- `Codex Pro.cmd`
  - 维护 / 救援入口。用于手动修复、诊断、卸载或兼容模式排障。

如果你需要更高级的修复、诊断、卸载入口，它们都收纳在开始菜单：

- `开始菜单 -> Codex Pro`
  - `Repair History`
  - `Protection Status`
  - `Update Codex Pro`
  - `Injection Check`
  - `History Check`
  - `Quick Start`
  - `Uninstall`

如果你只是普通用户，到这里就够了。
后面的命令和验证脚本主要给排障和发布维护使用，不需要日常记。

## 给维护者 / 高级用户

下面这些内容主要给排障、验证和维护使用。普通用户平时不需要记，也不需要按这些章节操作。

## 保护会自动做什么

本地轻量保护会关注这些变化：

- Codex 本地配置
- 当前账号与历史显示状态
- 侧栏项目可见性
- 本地历史索引

检测到变化后会：

1. 先创建快照
2. 检查当前历史状态
3. 自动修复最小必要问题：
   - 修复侧栏历史显示
   - 重建本地历史索引
   - 尽量把历史重新归回当前正在使用的显示分组

默认不会做的事：

- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 不处理登录流程本身

更细的内部实现说明见：

```text
docs/project-framework.md
```

## 兼容与附着说明

当前 GitHub 版本已经包含：

- 原生入口接管与自动附着
- 本地历史保护与恢复链路
- Codex 内的原生化“历史”入口
- 兼容模式回退
- 启动日志与诊断路径

能不能把“历史”面板完整挂进当前 Codex 窗口，取决于当前官方桌面包是否允许所需的页面增强能力。这个仓库当前的态度是：

- 支持时，就尽量把入口、修复条、删除按钮和高级区自然嵌进原生界面
- 不支持时，就自动回到兼容模式，继续保留历史保护、快照、恢复和固定三步路径
- 不把 compatibility-ready 夸大成 universal injection

当前真实使用要注意：

- 平时直接正常打开 `Codex` 即可；增强能力会尽量自动附着
- 如果当前桌面包支持注入，`历史` 面板、侧栏修复入口和删除按钮会自然出现在原生界面里
- 如果这次页面增强没有挂上去，系统会自动切到兼容模式：你仍然可以继续正常使用 Codex，历史守护、快照、修复历史显示、重建历史索引和删除撤销也都会继续可用
- 兼容模式下先不要慌，直接按固定三步恢复：`修复历史显示 -> 重建历史索引 -> 打开高级修复`
- 如果想确认当前机器到底是“启动方式不对”还是“官方包当前不支持页面增强”，可以直接打开开始菜单里的 `Injection Check`
- `Injection Check` 会尽量在不打扰你当前使用的前提下做单独探测，帮助区分是本机启动路径问题，还是当前官方桌面包本身的限制

首发边界：

- 默认采用脚本 + 绿色包，不阻塞在 EXE 安装器上。
- 删除能力保持单条删除 + 自动快照 + 可撤销，暂不做高风险批量清理。

也就是说：

- 自动守护底层已经能跑
- 自动附着和页面增强链已经基本成型；如果当前官方桌面包不支持完整页面增强，系统会自动降级为兼容模式，而不是直接把用户丢回报错
- 深度前端融合已进入可用版，删除与恢复闭环也已经打通
- UI 以真实 Codex 页面验证为准；不再把本地网页当成用户主体验

## 维护命令（只在排障时用）

如果你只是普通用户，这一节可以直接跳过。下面这些命令只在桌面入口排障不够、或者你在维护这个项目时才需要。

```powershell
codex-pro doctor
codex-pro snapshot
codex-pro repair-sidebar
codex-pro rebuild-index
codex-pro resume-fallback --query 修复 --limit 10
codex-pro start-guard
codex-pro stop-guard
codex-pro guard-status
codex-pro restore-latest
```

说明：

- `doctor`：读取当前历史状态，并直接告诉你下一步该点什么。
- `snapshot`：立即创建一次历史快照。
- `repair-sidebar`：尝试修复历史显示。
- `rebuild-index`：重建历史索引。
- `resume-fallback`：当原生侧栏暂时没显示完整时，从本地历史里找回候选会话。
- `start-guard`：恢复保护。
- `stop-guard`：暂停保护。
- `guard-status`：查看当前保护状态。
- `restore-latest`：从最近一次快照恢复历史相关状态。

如果你不想先读 README，也可以直接看开始菜单 `Codex Pro` 里的：

```text
Quick Start.txt
```

## 常见问题

### 1. 安装后是不是就 100% 不会丢？

不是。

它的目标是“尽量不丢 + 出问题自动修 + 修不好还能找回”，而不是承诺 Codex Desktop 上游 bug 永远不会出现。

### 2. 为什么不直接改 provider 配置来适配历史？

因为很多用户像你一样，对自己的 provider / base URL / 登录方式有强依赖。

这个工具默认只修：

- 历史数据可见性
- 索引文件
- 侧栏状态
- 本地历史显示分组一致性

不会擅自改业务配置。

### 3. 社区里说固定 `model_provider` 名字有用，这个工具支持吗？

支持这个思路，但它不是普通用户必须手动维护的前置步骤。

社区常见做法是把不同账号、不同 API 渠道稳定映射到同一个 provider identity，比如一直使用同一个 `model_provider` 名字。这样确实有助于减少历史被分到不同桶里。

`Codex Pro` 会吸收这个经验：同步底层历史元数据时，会尽量把历史归到当前稳定的 provider identity 下；如果你是高级用户，也可以自己固定一个 provider 名字来减少分桶。但默认使用方式仍然是安装后继续正常打开 `Codex`，出问题先让工具自动修，再在 Codex 内点“修复历史显示”；仍不完整时再用开始菜单里的 `Repair History`。

### 4. 为什么有些旧会话恢复可见了，但继续对话仍然报错？

这是因为旧会话里可能带有旧加密会话内容（`encrypted_content`），它和原 provider / 原账号绑定。

这个工具能做的是：

- 让它重新可见
- 帮你找回

但不能把旧加密内容重新加密到另一个 provider / 另一个账号。

### 5. 它会上传我的历史、账号或配置吗？

不会。

历史检查、快照、修复、索引重建和删除撤销都在本机完成。首发版本不做云同步，也不会上传你的 Codex 历史、账号信息、本地登录文件（`auth.json`）或旧加密会话内容（`encrypted_content`）。

本地页面增强只连接你机器上的本地服务；日志和验证产物也保存在你的机器上。

### 6. 它会不会注册开机自启或变成重后台服务？

不会注册开机自启。

安装后会启动一个可停止的本地轻量守护，用来观察本地配置、登录状态、侧栏状态和索引文件是否变化；它只做历史保护相关的本机检查。你可以通过开始菜单里的 `Protection Status` 查看状态，也可以用 `codex-pro stop-guard` 暂停它；卸载时会先停止守护并恢复被接管的 `Codex` 入口。

## 验证与开发

```powershell
npm install
npm test
```

仓库不再提供独立的网页占位页；UI 以真实 Codex 页面验证为准。要检查视觉与融合感，请直接跑真实页面验证脚本：

真实 Codex 页面验证：

```powershell
py .\scripts\validate-real-codex-ui.py
```

默认会从**被接管的原生 `Codex` 入口**启动真实验证，并生成真实页面截图和摘要：

```text
artifacts/real-codex/real-codex-hover-delete-visible.png
artifacts/real-codex/real-codex-repair-entry-open-panel.png
artifacts/real-codex/real-codex-repair-entry-after-open-click.png
artifacts/real-codex/validation-summary.json
```

更多说明见：

```text
docs/real-ui-validation.md
```

产品规格、Codex++ 对齐矩阵、路线图、架构风险登记、脱敏规范、内部架构治理指南、用户反馈分流、v0.3 实现护栏、首发 release notes 和项目总框架见：

```text
docs/codex-pro-product-spec.md
docs/codexplusplus-parity.md
docs/roadmap.md
docs/architecture-risk-register.md
docs/redaction-and-privacy.md
docs/internal-architecture-guidelines.md
docs/feedback-triage.md
docs/v0.3-implementation-guardrails.md
docs/release-notes-v0.2.5.md
docs/install-update-uninstall-experience.md
docs/project-framework.md
```

真实 `.codex` 状态验证（只读优先）：

```powershell
node .\scripts\validate-real-codex-state.mjs
```

运行后会输出当前真实历史可见性摘要、takeover 主路径摘要、本地恢复候选数量，并生成：

```text
artifacts/real-codex-state/validation-summary.json
```

发布前一键 smoke：

```powershell
pwsh -File .\scripts\validate-release.ps1
```

发布清单见：

```text
docs/release-checklist.md
```

## License

MIT



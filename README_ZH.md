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

安装后**继续像平常一样打开 `Codex`**。如果历史显示不完整，优先在 Codex 里点 `历史`，按固定三步走：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

`Codex Pro.cmd` 只作为维护 / 救援入口保留，不是普通用户的日常主入口。

安全边界放在前面说清楚：它不会上传你的历史、账号数据、`auth.json` 或旧加密会话内容；不会自动改 `model_provider`、`base_url` 或登录方式；不会重写 `encrypted_content`；也不承诺恢复本地已经不存在的历史或跨 provider / account 解密旧内容。

v0.2.5 是 **compatibility-ready first public release**：支持页面增强时会尽量融进 Codex；当前环境不支持时会安全回退到兼容模式，继续保留历史保护、快照、修复和索引重建。它还不是 EXE 安装器，也不承诺 universal injection。

## 这个工具解决什么

`Codex Pro` 是 Codex Desktop 的轻量增强层，不替代 Codex，不重写 Codex，也不做插件市场。当前公开版本先把历史保护、恢复、删除撤销、单会话 Markdown 导出、本地交接包、高级区插件入口 / 安装按钮可见性修复和长对话跳转打稳；会话项目移动等 Pro 能力会分阶段验证后再进入。

它主要处理这些高频问题：

- 改了 `config.toml` 后历史像“清零”
- 切换 `model_provider`、账号或 API 渠道后历史不可见
- `session_index.jsonl` 丢失、清空或明显偏少
- 侧栏工作区显示异常
- 想删除单条本地会话，但又需要删除前快照和撤销
- 想把单条会话导出为 Markdown 留档
- 长对话要重开或交给新对话继续，需要生成本地交接包
- 插件入口或安装按钮存在但没有显示、不可点，需要先尝试修复当前页面可见性
- 长对话太长，需要当前页面的跳转点快速定位
- 发现新版本时会低噪声提示，也可以主动检查并一键安装新版本；更新后重新打开 Codex

## 普通用户主路径

1. 安装一次
2. 以后继续正常打开 `Codex`
3. 历史异常时优先在 Codex 内点 `历史`
4. 如果当前机器不能完整注入页面，兼容模式仍会继续保护历史并提供恢复路径

## 安全边界

默认不会做这些事：

- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 不处理或重写旧会话里的加密内容（`encrypted_content`）
- 不做批量删除
- 不引入云同步或重后台服务

## 常用维护命令

普通用户通常不需要记这些命令；它们主要给排障和维护使用。

```powershell
codex-pro status
codex-pro snapshot
codex-pro repair-sidebar
codex-pro rebuild-index
codex-pro resume-fallback --query 修复 --limit 10
codex-pro restore-latest
codex-pro start-guard
codex-pro stop-guard
codex-pro guard-status
```

## 卸载

```powershell
pwsh -File .\scripts\Uninstall-Codex-Pro.ps1
```

卸载会尽量恢复被接管的原生 `Codex` 快捷方式；如果某个入口是 Codex Pro 创建的，卸载会把它移除。默认不会删除你的 Codex 历史、历史快照或仓库代码。

## 发布验证

维护者发布前至少运行：

```powershell
npm test
pwsh -File .\scripts\validate-release.ps1
```

完整 release gate 会覆盖安装 / 卸载 smoke、历史连续性、真实状态验证、真实 UI takeover 验证和首发资产检查；仓库不再使用独立网页占位页作为用户体验依据。

## License

MIT



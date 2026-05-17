# Real UI Validation

这个文档对应的是**真实 Codex 页面验证**，不是本地占位页。

首发默认验收标准已经固定为：

- 继续像平常一样点击桌面或开始菜单里的 `Codex`
- 这个 `Codex` 入口已经被增强接管
- 启动后优先验证真正的 takeover 主路径
- 成功时看到原生化历史入口、侧栏修复条和删除按钮
- 如果这台机器不支持注入，也必须明确进入“继续可用”的兼容模式

## 默认入口

```powershell
py .\scripts\validate-real-codex-ui.py
```

这条命令默认走：

- `launchPath = takeover`
- 先创建临时 `Codex.lnk`
- 再执行 takeover 接管
- 最后通过**被接管的原生 `Codex` 入口**启动真实验证

只有在开发排障时，才允许显式回退到旧调试路径：

```powershell
py .\scripts\validate-real-codex-ui.py --launch-mode debug
```

这个 `debug` 模式只用于开发，不是 GitHub 首发默认标准。

## 它会做什么

默认 takeover 验证会：

1. 复制一份当前机器上的 Codex 桌面 profile 到临时目录
2. 生成一个临时 `.codex`，故意制造“工作区根缺失”的异常状态
3. 创建并接管临时桌面 / 开始菜单 `Codex` 快捷方式
4. 通过**被接管的 `Codex` 入口**启动真实 Codex
5. 等待自动附着链拉起 bridge、调试端口和页面增强
6. 验证：
   - 原生头部入口是否出现
   - 侧栏删除按钮是否挂上
   - 悬停后删除按钮是否真的可见
   - 修复入口是否真的显示
   - 点击修复后是否从 `1 / 2` 变成 `2 / 2`

## 产物

脚本成功后会生成这些产物：

```text
artifacts/real-codex/real-codex-hover-delete-visible.png
artifacts/real-codex/real-codex-repair-entry-open-panel.png
artifacts/real-codex/real-codex-repair-entry-after-open-click.png
artifacts/real-codex/validation-summary.json
```

如果这次验证进入兼容模式，而不是拿到新的注入页面，脚本会：

- 清掉旧的真实注入截图，避免误把旧图当成这次结果
- 改为生成：

```text
artifacts/real-codex/compatibility-note.txt
artifacts/real-codex/validation-summary.json
```

重点看 `validation-summary.json`：

- `mode = takeover_injection`
  - 表示默认主路径成立，而且真实页面里已经成功附着并看到增强入口
- `mode = takeover_compatibility`
  - 表示默认主路径仍然成立，但这台机器当前走的是兼容模式
  - 此时必须同时看到 `recoveryPlan`、`management` 和 `takeover` 摘要
  - 同时要确认 `takeoverEvidence.launcherStarted = true`，而不是靠额外 fallback 路径补起验证
  - 这时不应该再保留 `real-codex-hover-delete-visible.png` 等旧注入截图；应改看 `compatibility-note.txt`
- `debug_*`
  - 只作为开发回退产物，不算首发默认通过模式

## 为什么这个脚本是 release blocker

仓库不再提供独立的本地占位页。真正的 GitHub 首发主路径必须靠这个脚本证明：

- 普通用户点击的是原生 `Codex`
- 这个 `Codex` 已被增强接管
- 接管后的自动附着链真的会触发
- 注入成功时像官方自带一样自然
- 注入不通时也会回到“当前仍可继续使用”的兼容路径

如果没有这条 takeover-first 真实机证据，就不允许把它当成首发成品。

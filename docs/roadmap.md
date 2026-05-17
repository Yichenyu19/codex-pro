# Codex Pro Roadmap

> 这份路线图定义 `Codex Pro` 从 compatibility-ready 首发到稳定 Pro 体验的阶段目标。它不是承诺所有能力已经完成，而是给后续实现、文档和 release 判断提供统一顺序。

## 路线原则

1. 用户主路径始终是：安装一次，继续正常打开 `Codex`。
2. 历史保护与恢复中枢优先于功能扩张。
3. Codex++ 核心能力要对齐，但必须收进更原生、更安全、更低门槛的体验层。
4. compatibility mode 是安全回退，不是失败。
5. 不承诺 universal injection。
6. 不自动修改 `model_provider`、`base_url`、登录方式或旧加密会话内容。
7. 不做批量删除、云同步、插件市场或上下文破限承诺。
8. 每个版本都必须有可验证的 release evidence。

## v0.2.5 - Compatibility-ready first public release

目标：

- 可信历史保护底座
- 安装后继续打开 `Codex`
- Codex 内入口叫 `历史`
- 固定三步恢复：
  1. 修复历史显示
  2. 重建历史索引
  3. 打开高级修复
- 历史快照与恢复
- 删除撤销
- 单会话 Markdown 导出
- Handoff 初版
- 插件入口 / 安装按钮可见性修复放在高级区
- 当前页面长对话跳转点
- 更新检查 / 安装
- compatibility-ready
- release gate
- pack 清单和隐私扫描

不包含：

- EXE 安装器
- 全量 Codex++ parity
- macOS 正式支持
- 插件市场
- universal injection 承诺
- 批量删除
- 自动静默更新

发布口径：

```text
Codex Pro v0.2.5 is compatibility-ready.
It keeps the normal "open Codex as usual" workflow.
Full page injection depends on the current Codex Desktop environment; unsupported cases fall back to compatibility mode.
```

## v0.3.0 - App-like install / update

目标：

- 安装、更新、卸载更像普通软件
- 安装结果只显示主入口、当前模式、下一步、日志
- 一键更新回滚
- 卸载恢复原生入口
- Quick Start 小白化
- 维护入口命名和层级稳定
- 安装失败友好提示

详细体验规划见：`docs/install-update-uninstall-experience.md`。

重点任务：

- 收敛安装脚本输出
- 增强更新失败回滚验证
- 增强卸载后原生入口恢复验证
- 降低用户理解 Node / Python / CDP 的概率
- 保持 `Codex Pro.cmd` 作为维护 / 救援入口，不变成日常入口
- 默认不做 EXE 安装器，继续使用脚本 + 绿色包路径完成 app-like 收口
- 更新只做用户确认后安装，不做静默强制更新或开机自启
- 统一 redaction helper 的接入顺序，优先覆盖 issue diagnosis、Handoff、export 和 bridge errors

验收标准：

- 普通用户按 README 能完成安装
- 安装后知道继续打开 `Codex`
- 更新后知道重新打开 Codex
- 卸载不会删除 Codex 历史
- 安装输出第一层只有当前状态、日常入口、下一步和日志位置
- 更新前有备份，失败时能回滚到更新前状态
- 卸载恢复原生入口，并明确历史、快照和仓库代码默认保留
- 用户可复制诊断文本、Handoff / export 输出有 redaction fixture 覆盖

## v0.4.0 - Codex++ core parity

目标：

- Codex++ 核心高需求能力基本覆盖
- 所有能力都进入 Codex Pro 的原生信息层级
- 高风险动作都有快照和确认

重点任务：

- 插件入口显示
- 恢复安装按钮
- Timeline 稳定
- Markdown 导出增强
- 会话项目移动 UI 稳定化：后端 / CLI / bridge 基础能力已具备，v0.4 重点是高级区接入、二次确认和一致性验证
- Provider 可见性修复增强
- 高级区重新整理
- Codex++ 对齐矩阵中的 core parity 能力更新为 done / partial / planned / later / no，并明确 UI 层级、安全前置、快照和二次确认要求

不做：

- 不把顶部增强菜单作为主入口
- 不做批量删除
- 不把 watcher 作为普通用户主路径
- 不引入云同步或插件市场

验收标准：

- Codex++ parity 文档中 core parity 能力有清晰状态、推荐版本、UI 层级和安全前置判断
- 新增 mutation 均有快照、确认或撤销策略
- UI 第一层仍然只有历史状态和一个主动作

## v0.5.0 - Pro differentiation

目标：

- 做出 Codex Pro 区别于 Codex++ 的护城河
- 历史恢复中心更完整
- 长对话连续性更强
- 用户和维护者都有更好的 evidence

重点任务：

- 历史恢复中心升级
- 问题分类诊断
- Recovery Evidence
- Handoff Guard 增强
- Context Risk
- issue 诊断文本一键复制
- Codex 更新兼容矩阵
- 真实 UI 截图资产规范

验收标准：

- 用户能区分数据真丢、本地还在但不可见、索引坏、roots 漂移、provider 分裂和安全回退
- 修复后能看到“改了什么 / 没改什么”的清晰摘要
- issue 诊断文本脱敏且可直接复制

## v0.6.0 - Installer preview

目标：

- 提供 `Codex-Pro-Setup-x64.exe` 原型
- 从脚本安装迈向普通软件安装体验

重点任务：

- EXE 安装器原型
- 安装依赖检查
- 自动创建 / 接管入口
- 卸载项
- 覆盖安装
- 安装失败回滚
- 安装日志

验收标准：

- 非技术用户不需要手动 PowerShell 也能安装
- 安装失败不会留下半接管状态
- 卸载后原生 Codex 入口恢复

## v0.7.0 - Stability and compatibility

目标：

- Codex Desktop 更新后，Codex Pro 最多安全回退，不让用户以为工具整体坏了

重点任务：

- selector 适配层
- Codex 版本能力探测
- UI 注入 profile
- fallback matrix
- 真实 UI 回归集
- Codex 更新后 compatibility note 标准化

验收标准：

- 新版 Codex 结构变化时，注入失败能进入安全回退
- 真实 UI 验证能明确输出 `takeover_injection` 或 `takeover_compatibility`
- release notes 不夸大当前机器和当前版本的注入能力

## v1.0.0 - Codex Pro stable

目标：

- 普通 Windows 用户敢装、敢用、敢更新、敢卸载
- Codex Pro 成为一个成熟、克制、可信、原生的 Codex Desktop Pro 增强层

必须具备：

- EXE 安装器
- 一键更新
- 一键卸载
- Codex++ 核心能力覆盖
- 历史恢复中心成熟
- UI 原生化稳定
- compatibility mode 成熟
- release evidence 完整
- 安全边界可信
- 文档清晰克制

v1.0.0 发布前必须回答：

1. 用户是否继续正常打开 `Codex`？
2. 历史入口是否叫 `历史`？
3. 固定三步是否统一？
4. compatibility mode 是否解释为安全回退？
5. 是否没有 universal injection 承诺？
6. 是否不上传历史？
7. 是否不自动改 provider、API 地址、登录方式或旧加密会话内容？
8. 删除是否单条、快照、可撤销？
9. 安装、更新、卸载是否足够低门槛？
10. pack 清单和隐私扫描是否干净？
11. 真实状态和真实 UI 验证是否通过？
12. release notes 是否克制？

## 长期不做或谨慎做

以下能力不进入当前路线主线，除非未来重新评审：

- 插件市场
- 云同步
- 团队共享历史
- 批量删除
- 静默强制更新
- 开机自启
- 自动修改 provider
- 自动修改 API 地址
- 自动切换登录方式
- 重写旧加密会话内容
- 修改 Codex 安装包
- 上下文破限承诺
- 上传会话给 AI 总结

## 路线图维护规则

- 每次 release 后更新对应阶段状态。
- 新功能必须先映射到产品规格和 Codex++ 对齐矩阵。
- 如果某个功能会破坏用户无感、原生感、安全边界或 compatibility-ready 口径，应默认延后。
- 如果 Codex Desktop 上游变化影响注入链，优先修复安全回退和真实验证，再考虑扩功能。

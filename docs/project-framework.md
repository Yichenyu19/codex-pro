# Codex Pro 项目总框架

> 目标：把 Codex Desktop 的“历史保护、恢复、修复、删除撤销、兼容兜底”收口成一个轻量、稳定、普通用户几乎无感的增强层。

> 长期产品规格、Codex++ 对齐矩阵、版本路线图、架构风险登记、脱敏规范、内部架构治理指南、用户反馈分流和 v0.3 实现护栏分别见：`docs/codex-pro-product-spec.md`、`docs/codexplusplus-parity.md`、`docs/roadmap.md`、`docs/architecture-risk-register.md`、`docs/redaction-and-privacy.md`、`docs/internal-architecture-guidelines.md`、`docs/feedback-triage.md`、`docs/v0.3-implementation-guardrails.md`。本文件只负责解释当前仓库框架和架构边界。

## 1. 项目定位

Codex Pro 不是一个新的 Codex，也不是一个插件平台，更不是一个全能桌面管理器。它只做一件事：给现有 Codex Desktop 补上普通用户最需要、但原生体验里最容易缺失的几类能力。

核心价值按优先级排序：

1. 用户继续像平常一样打开 `Codex`
2. 历史尽量不要“像清零一样消失”
3. 历史异常时可以自动修
4. 自动修不够时，给出普通用户可执行的固定恢复路径
5. 删除操作保持单条、安全、可撤销
6. 就算注入失败，也要能继续以兼容模式可用

这意味着项目的设计原则不是“功能越多越强”，而是：

- 日常尽量静默
- 出问题时尽量救命
- 工程能力藏在内部
- 对外只暴露少量、稳定、可理解的动作

## 2. Codex Pro 五层框架

Codex Pro 的长期框架从 `历史保护工具` 升级为 `Codex Desktop Pro 增强层`，但实现顺序必须保持分阶段、可验证、可回退。

1. **Pro Core**
   - 统一状态机
   - 历史可见性诊断
   - provider / workspace / index / SQLite 安全修复
   - 快照、恢复、删除撤销
   - 设置与能力开关
   - 兼容模式决策

2. **Codex Adapters**
   - Codex Desktop takeover
   - Python launcher / CDP attach
   - local bridge
   - rollout、SQLite、`session_index.jsonl`、workspace roots 适配
   - 插件 UI、网络 / 代理诊断适配

3. **Native Presentation**
   - Codex 内原生化 UI
   - 左侧轻量入口
   - 会话行 hover actions
   - 右侧 Pro 面板
   - 插件、历史、导出、交接包、Timeline、设置都必须走 Codex 风格
   - 禁止把本地网页 mock 当成用户主体验

4. **Pro Features**
   - 对齐 Codex++ 已验证的高需求能力：插件入口 / 安装按钮可用性修复、单会话删除、单会话 Markdown 导出、会话移动、Timeline、Provider 同步
   - 补齐 Codex++ 没有做透的能力：历史消失恢复中心、本地 Handoff Guard、兼容模式、真实 UI 原生化和安全边界
   - 更新体验采用启动后低噪声提示 + 一键安装，不做静默自动升级
   - 高风险能力默认关闭或需要确认

5. **Release Evidence**
   - `npm test`
   - install / uninstall smoke
   - real Codex state validation
   - real Codex UI validation
   - package dry-run
   - 隐私路径扫描
   - 真实截图资产
   - release gate

## 3. 当前总体架构

项目采用轻量混合架构：`Node core + Python launcher + injected UI + local bridge`。

### 3.1 Node core

Node 层负责核心业务逻辑，是整个项目的“脑子”。

主要职责：

- 历史快照
- 历史恢复
- `session_index.jsonl` 重建
- rollout / SQLite provider 元数据同步
- 侧栏工作区修复
- 单条删除
- 删除撤销
- 历史可见性诊断
- takeover / 接管状态管理
- 真实状态汇总与发布验证输入

Node 层的价值在于把“看似是 UI 问题”的东西，统一收敛成可测试、可恢复、可审计的业务能力。

### 3.2 Python launcher

Python 层负责“怎么把 Codex 启起来并稳定附着”。

主要职责：

- 启动 Codex
- CDP / 端口探测
- bridge 自检
- takeover 附着
- 注入成功后的降噪处理
- 注入失败后的兼容模式提示
- 启动日志输出

Python launcher 不应该承担复杂业务逻辑，它只负责入口、连接、降级和可观测性。

### 3.3 injected UI

注入 UI 负责“在 Codex 里自然出现的能力”。

主要职责：

- 原生化历史入口
- 侧栏修复条
- 删除按钮
- 一键修复
- 状态摘要
- 低打扰提示
- 历史面板

这里的设计目标不是“看起来像外挂”，而是“看起来像 Codex 自己补了一点功能”。

### 3.4 local bridge

bridge 是前端与本地能力之间的窄通道。

原则：

- 只暴露历史守护相关能力
- 只绑定 `127.0.0.1`
- 不扩成通用平台
- 不把数据逻辑直接塞进 UI

bridge 的职责是让 UI 能触发安全动作，但不让 UI 直接接触底层存储细节。

### 3.5 统一产品状态机

所有层级只消费同一套产品状态，不再各自发明口径。状态定义集中在 `src/product-state.js`：

- `healthy`：历史正常，用户继续使用
- `repairing`：正在修复
- `recoverable`：本地记录大概率还在，需要按固定三步恢复
- `compatibility`：页面增强未完整附着，但历史保护仍生效
- `needs_confirmation`：危险动作需要用户确认
- `blocked`：当前环境暂时无法安全继续

UI、bridge、launcher 和文档都应围绕这套状态表达。普通用户第一层只看到“历史正常 / 可能没显示完整 / 可以继续使用 / 下一步按钮”，工程词留在高级区和日志里。

### 3.6 生命周期幂等

takeover、launcher、bridge 和 watch 的职责必须分开：

- takeover 只负责接管和恢复原生 `Codex` 入口
- launcher 只负责启动、附着、诊断、降级和清理
- bridge 只负责本地动作窄通道
- watch 只作为维护路径，不进入普通用户主路径

launcher 必须使用单实例启动锁，重复点击桌面 `Codex` 时不能制造多条附着链、多个 bridge 或孤儿探测进程。

## 4. 现有代码分层

当前仓库已经可以按这个方向收口：

```text
src/
  backup.js              快照与恢复
  bridge.js              本地 HTTP bridge
  cli.js                 命令行入口
  config-file.js         Codex 配置读写
  constants.js           常量与路径
  delete-session.js      单条删除与回收
  guard.js               本地轻量守护与自动修复
  history-guard.js       高层业务编排
  launcher.js            启动器辅助逻辑
  locking.js             文件锁与互斥
  service.js             核心服务调度
  session-files.js       session / rollout / provider 元数据操作
  session-index.js       索引与 fallback
  sqlite-state.js        SQLite 相关读取与修复
  takeover.js            原生入口接管
  workspace-roots.js     工作区可见性与 root 修复

launcher-python/
  launcher.py            Python 启动器

inject-ui/
  history-guard-ui.js    注入页面逻辑

scripts/
  Install-Codex-Pro.ps1
  Uninstall-Codex-Pro.ps1
  validate-history-continuity.mjs
  validate-real-codex-state.mjs
  validate-real-codex-ui.py
  validate-release.ps1

docs/
  quick-start-zh.txt
  real-ui-validation.md
  release-checklist.md
  launcher-python.md
```

这个结构的关键点是：**业务逻辑和发布验证分离，UI 和底层能力分离，安装入口和维护入口分离。**

## 5. 产品运行主流程

### 5.1 日常用户路径

1. 用户像平常一样打开 `Codex`
2. takeover 接管原生入口并拉起 launcher
3. launcher 启动 bridge、自检、再尝试附着
4. 成功时，UI 里自然出现原生化的历史入口、修复条、删除入口
5. 失败时，Codex 继续可用，进入兼容模式

### 5.2 历史异常路径

1. 守护层发现 `config.toml`、provider、workspace roots、索引或 SQLite 元数据变化
2. 先做快照
3. 自动修最小必要问题
4. 如果历史看起来“像清零”，先走索引优先、rollout fallback 的两段式恢复
5. 再把普通用户引导到固定三步恢复路径

### 5.3 删除闭环路径

1. 用户在侧栏执行单条删除
2. 删除前自动快照
3. 删除后写入回收信息
4. 需要时可以撤销

这里的核心不是“能删很多”，而是“删一条也安全，后悔能回来”。

## 6. 必须守住的产品边界

项目始终不做这些事：

- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动修改登录方式
- 不重写旧会话中的 `encrypted_content`
- 不做批量删除
- 不扩展成插件市场
- 不新增沉重常驻服务
- 不把普通用户主路径赶回 CLI

如果某个新能力会破坏这条边界，它默认不该进首发。

## 7. 从参考项目吸收什么

### 7.1 `CodexPlusPlus`

适合吸收的只有“机制”，不适合直接并入整仓库。

可吸收点：

- 注入链的幂等处理
- 删除闭环设计
- 端口冲突后的退让策略
- watcher / 启动器的退避思路

不适合直接并入的原因：

- 品牌暴露强
- 边界有越界风险
- 许可证与维护策略不适合直接合并

### 7.2 `cxresume`

这是很适合吸收的“恢复候选搜索”参考。

可吸收点：

- session jsonl 的兼容解析
- 索引优先、内容 fallback 的两段式思路
- workspace 维度的恢复候选整理

### 7.3 `Agent-Session-Hub`

适合吸收安装脚本与输出心智。

可吸收点：

- 幂等安装 / 卸载
- 清晰的启动输出
- 面向普通用户的低负担安装体验

### 7.4 `codex-main`

只吸收行为语义，不吸收实现细节。

可吸收点：

- provider 过滤如何影响会话可见性
- `thread/list` / 恢复语义
- cwd、provider、恢复候选之间的关系

### 7.5 `CodexDesktop-Rebuild`

只做反面参考，不走它的路线。

结论很简单：

- 体量太重
- 架构太偏重构
- 不符合轻量增强层定位

## 8. 建议的实现优先级

如果要把整个项目真正做成可发版成品，顺序应当是这样的：

### 第一优先级：主路径可信

- takeover 主入口稳定
- 日常打开 `Codex` 就能自动附着
- 失败时能稳妥降级到兼容模式

### 第二优先级：历史可见性

- 索引优先
- rollout fallback
- provider / workspace / SQLite 状态联动修复

### 第三优先级：删除闭环

- 单条删除
- 删除前快照
- 删除后撤销

### 第四优先级：普通用户文案统一

- 三步恢复路径统一
- 兼容模式低焦虑表达统一
- 安装、README、Quick Start、启动器、`/status` 说同一套话

### 第五优先级：发布门槛与验证产物

- `npm test`
- 安装 / 卸载 smoke
- 历史连续性验证
- 真实 Codex UI 验证
- 真实 Codex 状态验证
- 真实 UI 验证
- release gate

## 9. 推荐的目录级演进方向

如果后续要继续补齐项目，建议按模块边界演进，而不是把逻辑散落到脚本里。

### 9.1 核心业务层

建议继续强化这些文件的职责清晰度：

- `service.js`
- `history-guard.js`
- `session-index.js`
- `workspace-roots.js`
- `sqlite-state.js`
- `takeover.js`

### 9.2 入口层

- `cli.js`：统一对外命令
- `launcher-python/launcher.py`：统一启动和兼容分支
- `scripts/Install-Codex-Pro.ps1`：统一安装主路径
- `scripts/Uninstall-Codex-Pro.ps1`：统一卸载恢复

### 9.3 UI 层

- `inject-ui/history-guard-ui.js`：只保留自然融入的原生化界面

### 9.4 验证层

- `scripts/validate-history-continuity.mjs`
- `scripts/validate-real-codex-state.mjs`
- `scripts/validate-real-codex-ui.py`
- `scripts/validate-release.ps1`
- `test/*.test.js`

## 10. 这个项目最终应该长什么样

最终成品应该满足下面这个判断：

> 用户没有先读 README，也能直接正常打开 `Codex`；  
> 出问题时，Codex 里自然有修复入口；  
> 还不行时，有固定三步恢复；  
> 真坏了，也不会丢掉快照和撤销能力。

如果做到了这一点，这个项目就不是“外挂工具包”，而是一个真正的 Codex 增强层。

## 11. 下一步建议

下一步不建议继续横向加功能，而是按这个顺序推进：

1. 把 `docs/project-framework.md` 作为总设计基线
2. 对照现有代码做职责收口，清掉重复概念
3. 先补齐主路径和恢复路径的稳定性
4. 再补真实机验证与 release gate
5. 最后才考虑外观和文案的细抠



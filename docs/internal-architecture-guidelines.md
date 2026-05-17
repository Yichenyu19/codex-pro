# Codex Pro 内部架构治理指南

## 1. 目的

这份文档不是重构计划，也不是新增功能清单，而是 Codex Pro 的内部架构治理指南。

它的作用是：

- 防止项目在追 Pro 能力和 Codex++ parity 时变成屎山。
- 不为了架构洁癖破坏首发稳定性。
- 只做小步、可验证、可回滚的治理。
- 让后续实现仍然保留“安装一次，以后继续正常打开 Codex”的主路径。

如果某个问题只是看起来不够优雅，但不会影响用户主路径、安全边界、发布可信度或后续维护效率，就不要在首发前把它升级成大重构。

## 2. 四层职责

Codex Pro 的内部实现分成四层。任何新能力都必须先确认自己属于哪一层。

### 2.1 Pro Core

职责：

- 统一状态机。
- 历史可见性诊断。
- provider / workspace / index / SQLite 的安全修复逻辑。
- 快照、恢复、删除撤销。
- 统一安全边界。
- 兼容模式决策。

Pro Core 是规则和状态的来源，不是 UI。

### 2.2 Adapters

职责：

- Codex Desktop takeover。
- Python launcher / CDP attach。
- local bridge。
- rollout、SQLite、`session_index.jsonl`、workspace roots 适配。
- 更新检查与更新安装的本地适配。

Adapters 的作用是把外部世界翻译成 Codex Pro 能理解的输入，不负责做产品决策。

### 2.3 Native Presentation

职责：

- Codex 内原生化 UI。
- 左侧轻量入口。
- 会话行 hover actions。
- 右侧 Pro 面板。
- 插件、历史、导出、交接包、Timeline、设置等 Codex 风格入口。

Native Presentation 只负责展示和触发明确动作，不负责业务判断。

### 2.4 Release Evidence

职责：

- `npm test`
- install / uninstall smoke
- real Codex state validation
- real Codex UI validation
- package dry-run
- 隐私路径扫描
- 真实截图资产
- release gate

Release Evidence 的作用是证明“能发布”，不是替代产品逻辑。

## 3. inject-ui 规则

`inject-ui/history-guard-ui.js` 是当前最容易膨胀的单文件。它必须维持“原生感”，但不能继续无边界变大。

### 3.1 UI 只做这些事

- 读取 `/status` 或明确的 action 结果。
- 渲染当前状态。
- 呈现一个主救援卡。
- 呈现 hover / advanced action。
- 触发 bridge action。
- 显示 toast、提示和轻量帮助文案。
- 处理 observer、事件绑定和简单状态切换。

### 3.2 UI 不做这些事

- 不做历史修复业务判断。
- 不自己解析 rollout、SQLite、workspace roots、provider 规则。
- 不在 UI 里写状态推断算法。
- 不把 bridge 变成业务引擎。
- 不把工程诊断词放到第一层。

### 3.3 第一层文案原则

- 第一层不出现 `CDP`、`bridge`、`SQLite`、`rollout`、`provider identity` 等工程词。
- 普通用户第一层只应看到：
  - 历史正常 / 可能没显示完整
  - 一个主按钮
  - 一张救援卡
  - 必要时的安全回退说明
- 删除 / 导出 / 移动只作为 hover 或高级动作出现。
- 当前会话不显示删除。

### 3.4 内部分区建议

如果未来需要在单文件内部继续治理，建议固定这些分区，并且新能力必须先归类：

- constants
- state
- bridge client
- copy
- panel
- sidebar
- session row actions
- timeline
- plugin affordance
- toasts
- observers

### 3.5 未来新增 UI 能力的规则

新增能力前先判断：

1. 它是第一层、第二层，还是维护层？
2. 它是否需要隐藏在高级区？
3. 它是否会让一张卡变成很多卡？
4. 它是否会让普通用户误以为这是一个功能合集？

如果答案不清楚，先不要把它直接塞进 `inject-ui`。

## 4. service 规则

`src/service.js` 是 orchestrator，不是无限总管。

### 4.1 service 应该做什么

- 组合 domain 模块。
- 统一命令入口与桥接入口。
- 负责读写顺序、快照顺序、失败回滚顺序。
- 把结果整理成 CLI / bridge / UI 易消费的对象。

### 4.2 service 不应该做什么

- 不要继续塞具体解析算法。
- 不要把所有业务都搬进一个 facade。
- 不要在 service 中重复实现已存在的 domain 逻辑。
- 不要把更新、删除、导出、历史修复、takeover、守护都写成互相耦合的巨大分支。

### 4.3 新函数归属规则

新增函数之前必须先回答：

- 它属于哪个 domain？
- 它属于哪个 adapter？
- 它是否只是 CLI facade？
- 它会不会让 service 再膨胀？

### 4.4 当前推荐分工

- `history-guard.js`：历史快照、恢复、修复、索引相关核心逻辑。
- `session-index.js`：索引与候选发现。
- `workspace-roots.js`：工作区 roots 修复与同步。
- `sqlite-state.js`：SQLite 状态与 provider metadata 修复。
- `export-session.js` / `handoff.js`：导出与交接。
- `update-check.js` / `update-install.js`：更新检查与安装。
- `takeover.js` / `launcher.js` / `guard.js`：接管、启动、守护。
- `service.js`：只做编排、组装、流转。

## 5. bridge 规则

`src/bridge.js` 只应该是窄通道，而不是通用本地平台。

### 5.1 bridge 的边界

- 只绑定 localhost。
- 使用 token 鉴权。
- mutation 前必须先快照。
- 错误返回必须短句化。
- 不把 UI 直接暴露给底层存储。

### 5.2 端点分类

bridge 端点只能按这些类别增长，并且必须能说清楚为什么属于该类：

- status
- repair
- session action
- export
- update
- maintenance

如果一个新端点说不清自己属于哪类，就先不要加。

### 5.3 不建议的方向

- 不扩成通用本地平台。
- 不引入新的 RPC 框架。
- 不更换鉴权模型，除非存在明确安全阻塞。
- 不让 UI 通过 bridge 直接拼接底层业务语义。

## 6. product-state 规则

`src/product-state.js` 是状态单一事实源。

### 6.1 统一消费

UI、launcher、bridge、docs 都应围绕同一套产品状态表达，不要各自发明状态文案。

### 6.2 第一层保持少

第一层状态保持尽量少，避免让普通用户面对一堆半工程化标签。

### 6.3 新状态准入

任何新状态进入运行时之前，先检查：

1. 是否已经进入 product spec。
2. 是否已经在 parity / roadmap 中有明确版本位置。
3. 是否已经在 risk register 中登记风险。
4. 是否会污染第一层体验。

### 6.4 状态扩展原则

后续可能增加的状态，例如 `plugin_limited`、`export_ready`、`context_risky`、`update_available`，都必须先证明：

- 它真的能让用户更快理解当前状态。
- 它不会把第一层搞复杂。
- 它不会让每个模块各自发明一套状态。

## 7. 新功能准入流程

新增功能不允许直接从想法跳到实现，必须按这个顺序：

1. 先更新 product spec。
2. 再更新 parity / roadmap。
3. 再更新 risk register。
4. 再判断 UI 层级。
5. 再实现。
6. 最后补测试和 release evidence。

如果这个顺序打乱了，后续维护成本通常会指数级增加。

## 8. 不建议做的重构

首发前或短期内不建议做这些事：

- 拆前端框架。
- 引入 React / bundler。
- 重写 launcher。
- 重写 bridge 协议。
- 大规模移动 `src` 目录。
- 删除 legacy alias。
- 把 `inject-ui` 重写成另一套前端工程。
- 把 `service.js` 重写成多个大而散的协调层。

### 8.1 什么时候才考虑结构性重构

只有当下面至少两项同时成立时，才考虑结构性重构：

- 单文件已经明显阻碍新增能力。
- 测试和职责边界已经无法靠小步治理维持。
- 真实用户路径已经被结构复杂度影响。
- release evidence 反复因为结构耦合而掉线。

否则，先做小步治理。

## 9. 验收标准

只要做内部治理，不管改没改代码，最终都要满足：

- 运行时行为不变。
- 测试通过。
- UI contract 不退化。
- README 不变长。
- pack 清单干净。
- 普通用户主路径仍然是：安装一次，以后继续正常打开 Codex。

## 10. 当前落地建议

当前阶段更适合做的是：

- 记录边界。
- 固化职责。
- 在文档里明确“谁负责什么”。
- 通过测试和 release evidence 盯住回归。

当前阶段不适合做的是：

- 大拆分。
- 大量目录迁移。
- 改运行时行为。
- 为了漂亮而引入新框架。


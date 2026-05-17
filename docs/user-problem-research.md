# Codex Pro 用户问题、成因与解决思路研究

> 这份文档不是宣传页，也不是功能清单。它只做一件事：把 `Codex Pro` 要解决的真实用户问题、问题为什么会出现、我们应该怎么解决、以及哪些边界绝对不能破坏，统一写清楚。

## 目标结论

`Codex Pro` 解决的核心问题，不是“让用户拥有一个新的 Codex”，而是让用户在继续正常打开 `Codex` 的前提下，尽量不再遇到“历史像消失了一样看不见”的情况，并且在看不见时有一条清晰、可恢复、低焦虑的路径。

## 用户实际遇到的问题

### 1. 历史还在，但看起来像没了

**用户视角**

- 明明刚才还用过的项目线程，回头在侧栏里看不到了。
- 项目还在，账号还在，数据似乎也没删，但就是显示成 `No chats`，或者只剩很少一部分最近线程。
- 搜索也找不到，用户很容易直接理解成“历史丢了”。

**我们在仓库里看到的对应现象**

- `src/service.js` 会把 `sessionIndexCount`、`rolloutFileCount`、`missingActiveRootsCount`、`providerBucketRisk`、`sqliteMetadataMismatch` 组合成 `historyVisibility`。
- `src/session-index.js` 里明确存在“索引稀疏”判断，这意味着历史并不一定真的消失，只是索引窗口不完整。
- `src/history-guard.js` 和 `src/guard.js` 里的修复逻辑也说明，很多情况本质上是可见性 / 索引 / 元数据对齐问题，而不是删除问题。

**外部证据**

- GitHub 上多起 Codex Desktop issue 都在说同一类问题：侧栏只显示最近一部分，旧线程还在磁盘里，却不出现在 UI 中。  
  例如：[#17540](https://github.com/openai/codex/issues/17540)、[#17970](https://github.com/openai/codex/issues/17970)、[#20833](https://github.com/openai/codex/issues/20833)、[#20741](https://github.com/openai/codex/issues/20741)、[#21581](https://github.com/openai/codex/issues/21581)。

### 2. 切 provider、切账号、切登录方式后，历史分裂了

**用户视角**

- 用户最常见的感受不是“坏了”，而是“怎么突然只看见一部分历史了”。
- 尤其在官方登录、relay、自定义 provider 来回切的时候，历史会像被分桶一样“分散显示”。

**工程层原因**

- rollout 文件、SQLite 状态、session index 和当前 provider 没有稳定对齐时，Codex App 和 CLI 可能各自看到不同子集。
- 历史并非完全没了，而是被不同 metadata 分组或过滤掉了。

**外部证据**

- LINUX DO 上关于切 provider 后历史消失的帖子直接指出：问题本质通常是 `sessions / archived_sessions` 里的 rollout 元数据和 `state_5.sqlite` 里的 provider 没同步。  
  参考：[切换 provider 后 Codex 历史会话看不到？我做了个同步工具](https://linux.do/t/topic/1782539)

### 3. 更新或重启后，侧栏突然只剩很少内容

**用户视角**

- 有些用户是更新后突然发现项目历史全没了。
- 也有人是重启后，侧栏只剩最近的一点内容，老内容没了。
- 这会被误解成“更新把我的工作记忆清空了”。

**工程层原因**

- Desktop 侧栏可能只预加载了一个有限的最近集合。
- 如果项目级分组只基于这部分已加载数据，超出窗口的线程就不会被放进左侧栏。
- 从仓库的验证脚本和 issue 描述看，`state_5.sqlite`、`session_index.jsonl`、`sessions` 文件往往都还在，但 UI 只拿到了一部分。

**外部证据**

- GitHub issue #17540、#20833、#21581 都支持这个判断。
- LINUX DO 里也有人直接吐槽“前端差”“写出来像菜单堆砌”，这说明用户对 UI 的容忍度很低，第一层必须极简。

### 4. 用户最怕工具乱改设置

**用户视角**

- 用户最怕工具自动改掉 `model_provider`、`base_url`、登录方式或 `encrypted_content`。
- 对很多人来说，这些是工作流核心，不是“可以帮你顺手优化”的边角配置。

**产品含义**

- 如果工具做了用户没要求的配置改动，哪怕修复了可见性，也会立刻失去信任。
- 所以这个项目必须把“能修什么”和“绝对不能碰什么”写死。

### 5. 用户看不懂一堆按钮，也看不懂兼容模式

**用户视角**

- 普通用户打开面板时，不想先理解 CDP、bridge、SQLite、rollout、provider identity 这些词。
- 他们只想知道：
  - 现在是不是正常
  - 如果不正常，先点哪个
  - 会不会改坏我的配置

**产品结论**

- 第一层 UI 不能像工程控制台，必须像 iPhone 设置页那样只留一件事。
- 兼容模式也不能写成失败告警，而要写成“当前环境不支持完整页面增强，但历史保护仍然可用”。

## 为什么会出现这些问题

### 1. `session_index.jsonl` 不是完整真相，它可能是稀疏窗口

`src/session-index.js` 里有明确的风险判断：

- `sessionIndexEmpty`
- `sessionIndexSparse`
- `rolloutIndexMismatch`

这说明索引是一个“可用但不完美”的视图，不是历史唯一真相。  
一旦索引只覆盖了最近窗口，旧线程就会变成“数据在，但 UI 看不见”的状态。

### 2. rollout 文件、SQLite、workspace roots 和 provider 元数据会互相影响

`src/service.js` 里的 `buildHistoryVisibility()` 会同时考虑：

- `sessionIndexCount`
- `rolloutFileCount`
- `missingActiveRootsCount`
- `providerBucketRisk`
- `sqliteMetadataMismatch`

这说明历史不可见通常不是单点故障，而是多个状态边界叠加：

- workspace roots 漂移
- provider bucket 风险
- SQLite 元数据错位
- 索引稀疏

### 3. Codex Desktop 的页面增强能力不是每台机器都完全一致

真实 UI 验证文档已经明确：

- takeover 是默认主路径
- 但如果当前环境不支持注入，就要进入兼容模式
- 兼容模式不是失败，而是“继续可用”的安全回退

这对产品设计的影响很大：

- 不能承诺所有机器都能完整注入
- 不能把注入失败写成用户需要理解的工程事故
- 不能把主路径建立在“必须注入成功”上

### 4. 用户把“看不到”直接理解成“丢了”

这不是技术问题，而是认知问题。

如果产品只会说“索引稀疏”“provider bucket 风险”“SQLite 不一致”，用户不会因此安心，只会更慌。  
所以我们必须把工程诊断翻译成人话：

- 本地记录还在
- 先修复显示
- 再重建历史索引
- 不行再打开高级修复

## 解决思路

### 1. 把问题定义成“历史可见性与恢复路径”

不要把它定义成“数据删除”或“全量同步问题”。  
更准确的定义是：

- 历史大概率还在
- 只是显示、索引或元数据没有对齐
- 用户需要的是修复和恢复，不是新的存储系统

### 2. 日常主路径固定为“继续正常打开 Codex”

用户安装一次后，日常应该还是直接点 `Codex`。  
`Codex Pro` 的工作是接管原生入口、自动附着、静默帮忙，不是改用户的使用习惯。

### 3. 主界面只保留一个动作

这轮已经把注入 UI 收成了极简救援卡，原则是：

- 标题只叫 `历史`
- 只显示一张状态卡
- 只有一个主按钮
- 需要搜索、快照、撤销、日志时，进 `高级`

这样做的原因很简单：

- 普通用户第一眼只能消化一个动作
- 过多按钮会把“修复”变成“选择题”
- 用户越慌，越需要少选项、短文案、清晰下一步

### 4. 修复链路固定成三步

无论是 UI 文案还是 release 口径，都统一成：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

这条链路的好处是：

- 用户不用记太多东西
- 工程上也便于验证和回归
- README、UI、release gate 可以共用同一套语言

### 5. 安全边界写死

这个项目必须把下面这些边界锁住：

- 不自动改 `model_provider`
- 不自动改 `base_url`
- 不自动改登录方式
- 不重写旧会话里的 `encrypted_content`
- 不做批量删除
- 不引入长期后台服务

原因是：  
用户愿意让你修历史，但不愿意让你碰身份、认证和加密内容。

## 对后续产品设计的启发

### 1. 普通用户第一层只能看到一个按钮

如果主界面还像“功能菜单”，那说明产品心智没收口。  
真正的首发产品感，应该是：

- 一眼看懂
- 一键起步
- 失败也不慌

### 2. 工程词应该折叠到高级区

CDP、bridge、SQLite、rollout、provider identity 这些词，不应该出现在普通用户第一层。

它们可以存在，但应该只出现在：

- 高级折叠区
- 日志
- 诊断文档
- 维护者文档

### 3. README 不能夸 universal injection

当前真实证据表明：

- takeover 主路径是成立的
- 兼容模式是可信的
- 但不能保证每台机器都完成完整注入

所以 README 和 release notes 必须一直保持“compatibility-ready”口径，而不是写成“所有机器都原生增强成功”。

### 4. 前端体验问题本质上是“信息架构问题”

Linux DO 上大家吐槽 Codex 前端“菜单太多”“不够美”“前端一坨”，本质不是某个按钮长得不好看，而是信息层级不对。

对 `Codex Pro` 来说，这意味着：

- 视觉再好看，也不能压过清晰度
- 动效再轻，也不能妨碍判断
- 先解决“点什么”，再解决“好不好看”

## 参考来源

### 仓库内部

- [README.md](../README.md)
- [docs/project-framework.md](./project-framework.md)
- [docs/real-ui-validation.md](./real-ui-validation.md)
- [src/service.js](../src/service.js)
- [src/session-index.js](../src/session-index.js)
- [src/history-guard.js](../src/history-guard.js)
- [src/guard.js](../src/guard.js)
- [.github/ISSUE_TEMPLATE/bug_report.yml](../.github/ISSUE_TEMPLATE/bug_report.yml)

### 外部 GitHub Issues

- [#17540 Windows app: older local threads disappear from sidebar and sidebar search after restart while still present on disk](https://github.com/openai/codex/issues/17540)
- [#17970 Threads keep disappearing from the sidebar even with "All chats" selected](https://github.com/openai/codex/issues/17970)
- [#20741 [Urgent] Codex Desktop project chat histories disappeared after recent update](https://github.com/openai/codex/issues/20741)
- [#20833 Codex Desktop project sidebar hides older workspace conversations despite existing local thread data](https://github.com/openai/codex/issues/20833)
- [#21581 Desktop sidebar/search hides older local project chats although thread data still exists on disk (multi-project, reproducible)](https://github.com/openai/codex/issues/21581)
- [#19873 Windows Desktop: sidebar/project list lost after update; search still finds threads](https://github.com/openai/codex/issues/19873)

### 外部社区

- [切换 provider 后 Codex 历史会话看不到？我做了个同步工具](https://linux.do/t/topic/1782539)
- [Codex写的前端太不美丽了，有更好的办法嘛](https://linux.do/t/topic/1843420)
- [Codex 前端](https://linux.do/t/topic/2009720)
- [codex写的前端，是灾难级的](https://linux.do/t/topic/1809903)
- [Codex写前端太拉了，佬们有没有解决办法](https://linux.do/t/topic/1957304)
- [codex写前端血压高？我发现一个解决的好办法](https://linux.do/t/topic/1956867)
- [Codex 历史会话同步](https://linux.do/t/topic/2072220)
- [解决codex app左侧栏只显示一部分线程（貌似是50条）的bug](https://linux.do/t/topic/2075313)

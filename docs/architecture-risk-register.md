# Codex Pro 架构风险登记

## 1. 目的

这份文档不是重构计划，也不是新增功能清单，而是 `Codex Pro` 的架构风险登记。

它的作用是：

- 在追 `Codex++` parity 和长期 Pro 能力时，防止项目变成“功能能跑但维护困难”的屎山。
- 把首发可接受的风险、必须治理的风险、后续版本再处理的风险分开。
- 避免因为 P1 / P2 架构债无限延期 v0.2.5，同时确保 P0 blocker 不被带进首发。
- 给 README、产品规格、路线图、release checklist 和后续实现提供共同边界。

具体的小步治理规则见：`docs/internal-architecture-guidelines.md`。本文件负责登记风险，内部治理指南负责说明后续实现如何不把这些风险继续扩大。

发布后的用户反馈分流由 `docs/feedback-triage.md` 管控，v0.3.0 安装 / 更新 / 卸载实现范围由 `docs/v0.3-implementation-guardrails.md` 管控，避免首发后 issue 失控或后续实现范围漂移。

v0.2.5 的核心发布判断仍然是：用户能继续正常打开 `Codex`，历史保护和恢复路径可信，安全边界清楚，兼容模式不是失败页，发布资产干净。

## 2. 风险分级

- **P0**：会阻塞 v0.2.5 发布，或会破坏安全边界、用户主路径、数据保护、发布可信度。
- **P1**：不阻塞首发，但会影响后续维护、功能扩展、用户信任或 v0.3+ 交付效率。
- **P2**：长期优化项；现在记录，后续在相关功能进入主路径前治理。

## 3. 风险登记表

| ID | 风险 | 等级 | 用户影响 | 技术根因 | 当前证据 | 不做会怎样 | 最小治理方案 | 不建议现在做的大重构 | 验收方式 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `inject-ui/history-guard-ui.js` 继续膨胀为单文件屎山 | P1 | UI 迭代越多越容易互相覆盖，最后出现“某个按钮修了，另一个入口坏了”的问题 | 注入 UI 同时承载入口发现、面板渲染、会话行 action、bridge 调用、toast、Timeline、插件入口修复等职责 | `inject-ui/history-guard-ui.js` 约 3500 行，已经是首发最大单文件 | v0.3 / v0.4 加 Timeline、插件、导出、移动等能力时，选择器、状态和文案容易漂移 | v0.2.5 不拆文件；v0.3 起先在文件内部固定分区：state、bridge client、sidebar actions、panel、timeline、plugins、copy；新增 UI 能力必须进入对应分区 | 不建议首发前拆成前端框架、引入 bundler 或改注入加载链 | `node --check inject-ui/history-guard-ui.js`；UI contract 测试；预览截图；真实 UI 验证不回退 |
| R2 | `src/service.js` 继续变成无限总管 | P1 | 修复、导出、更新、takeover、删除、守护等能力互相耦合后，用户遇到的问题会更难定位 | service 同时聚合 Codex home、历史诊断、provider / SQLite 修复、takeover、更新、目录打开、删除撤销等 orchestration | `src/service.js` 接近 900 行，导出函数覆盖多条产品主路径 | 后续新增插件、移动会话、Recovery Evidence 时，service 可能继续吸收业务细节 | 不在 v0.2.5 改结构；v0.3 起按功能域设定 service facade，只允许它编排，不允许继续塞具体算法 | 不建议首发前大拆 `src` 目录或重写 CLI 调用关系 | `npm test`；新增功能 PR 必须说明落在哪个 domain / adapter；service 行数增长要有理由 |
| R3 | `launcher-python/launcher.py` 业务逻辑侵入，超出入口 / 附着 / 降级职责 | P2 | 启动失败时用户会分不清是 Codex 启动问题、注入问题还是历史修复问题 | launcher 需要处理 Codex 进程、CDP 诊断、bridge 启动、token 注入、兼容模式、健康摘要，天然容易吸收业务判断 | `launcher-python/launcher.py` 约 800 行，已有 history health summary 和 compatibility banner | 如果继续加入历史修复业务，launcher 会从“启动器”变成第二套 service | 保持 launcher 只做入口、附着、探测、降级、日志；历史修复必须经 local bridge / service | 不建议首发前改语言或重写为 Node launcher | 启动日志仍只包含入口、端口、模式、状态摘要；历史 mutation 不出现在 launcher 主逻辑 |
| R4 | bridge API 扩张为通用本地平台，超出历史和 Pro 本地动作窄通道 | P1 | 用户会担心本机开了一个“什么都能做”的后台服务 | `/status`、修复、索引、sessions、update、目录打开、删除、导出、handoff、undo 等端点已经较多 | `src/bridge.js` 监听 `127.0.0.1` 且有 `X-Codex-Pro-Token`，但端点数量已经超过纯历史状态接口 | v0.4 后如果继续无边界加端点，会变成通用本地控制平台 | 建立端点准入规则：只允许本地历史、恢复、导出、更新提示、维护动作；mutation 必须 token、快照、短错误文案 | 不建议首发前改协议、引入新 RPC 框架或改鉴权模型 | bridge 测试覆盖 token；release checklist 检查新增端点分类和脱敏 |
| R5 | `Codex++` parity 导致功能堆叠，破坏一张卡 + 一个主按钮的主路径 | P1 | 普通用户会感觉 Codex Pro 是外挂功能合集，而不是 Codex 原生增强 | 对齐插件、删除、导出、移动、Timeline、更新等能力时，容易把所有功能都放进第一层 UI | 产品规格和路线图已经要求高级默认折叠，但后续实现仍可能走偏 | 主界面复杂化后，“历史修复”这个核心价值会被淹没 | 所有新增能力先标记属于第一层、第二层、第三层或维护层；第一层最多一个主动作 | 不建议首发前为了 parity 做大菜单、顶部工具栏或功能广场 | UI 预览和真实截图检查：普通状态只看到历史入口、一张救援卡、一个主按钮 |
| R6 | 安装 / 更新 / 卸载仍偏开发者脚本，和 Codex Pro 名字不匹配 | P1 | 普通用户会觉得“Pro”却不像普通软件，影响首发转化和信任 | v0.2.5 以脚本 + 绿色包为主，EXE 安装器列在 v0.6 预览 | README 和 roadmap 已明确 v0.2.5 不包含 EXE 安装器；`docs/install-update-uninstall-experience.md` 已把 v0.3 的 app-like 收口写清 | 如果不收口，GitHub 用户安装门槛会比产品定位高 | v0.3 优先做安装结果四行、更新确认与回滚、卸载恢复原生入口和默认保留历史；v0.6 再做 installer preview | 不建议首发前或 v0.3 赶制未充分验证的 EXE 安装器 | install / uninstall smoke；README 30 秒可读；安装输出第一层只有当前状态、日常入口、下一步和日志位置 |
| R7 | compatibility mode 被用户误读成失败或残缺体验 | P2 | 用户看到“兼容”可能以为没装成功 | 页面增强依赖当前 Codex Desktop 支持程度，无法承诺所有环境都能完整注入 | README、roadmap、release checklist 已写 compatibility-ready；launcher 有兼容模式文案 | 如果 release notes 写得过硬，会被用户当成失败反馈 | 继续使用“安全回退”口径；不要写“注入失败”；兼容模式仍强调历史保护、快照、固定三步可用 | 不建议首发前为了避免“兼容”二字而隐藏真实限制 | README、真实 UI 验证文档、release notes 同步检查 |
| R8 | 内部旧命名 `codex-history-guard` / `codex-guard` 在 DOM id、legacy alias 和脚本里长期残留 | P2 | 普通用户可能在高级日志里看到旧名，造成品牌不统一 | 产品从 Guard 迁移到 Pro 后，为兼容旧目录、旧命令、旧数据，需要保留部分旧名 | `package.json` 保留旧 bin alias；launcher 保留 legacy log dir；注入 UI 可能保留历史 DOM id | 如果长期不管，文档、测试和代码会出现多套名称 | 明确旧名只允许出现在兼容读取、legacy alias、测试防回归和内部 DOM 稳定点；普通 UI 不展示旧名 | 不建议首发前删除旧 alias 或迁移历史数据目录 | product-files / readme 测试；旧口径扫描只允许命中兼容说明或测试断言 |
| R9 | `product-state` 状态枚举不够覆盖长期状态 | P1 | 插件受限、导出就绪、长上下文风险、更新可用等状态可能各自发明文案 | 当前状态机只有 `healthy`、`repairing`、`recoverable`、`compatibility`、`needs_confirmation`、`blocked` | `src/product-state.js` 状态枚举聚焦历史恢复首发切片 | 后续 UI、launcher、bridge、文档会出现多套状态口径 | v0.3 前设计扩展状态：`plugin_limited`、`export_ready`、`context_risky`、`update_available` 等；但必须保持第一层简单 | 不建议 v0.2.5 为 planned 能力提前改运行时状态机 | `/status` schema 测试；UI copy 测试；状态枚举和 product spec 一致 |
| R10 | 错误脱敏和 issue 诊断文本尚未完全接入统一 redaction 模块 | P1 | 用户复制日志或 issue 诊断时，可能误带敏感路径、token、密钥片段 | 当前隐私扫描、issue template 警告、错误文案已有边界；`src/redaction.js` 已有最小 helper，但业务路径仍需分批接入 | issue templates 提醒不要贴密钥和 `auth.json`；release gate 有隐私扫描；`docs/redaction-and-privacy.md` 与 redaction 单测已建立基础规范 | 能过首发，但后续 Recovery Evidence、Handoff、issue 诊断文本会增加泄露面 | v0.3 起把 issue diagnosis、Handoff、export、bridge errors 分批接入统一 helper；所有用户可复制文本统一经过脱敏 | 不建议首发前重写所有错误处理或一次性改完全部输出路径 | 隐私路径扫描；redaction 单测；issue 诊断文本 fixture 测试 |
| R11 | 真实 UI selector 随 Codex Desktop 更新失效，缺少 selector 适配层 | P1 | Codex 更新后 UI 增强可能退回兼容模式，用户以为产品坏了 | 注入 UI 依赖真实页面结构、会话行识别、导航入口挂载点和右侧状态区域避让 | 当前有真实 UI 验证和 compatibility fallback，但 selector profile 尚未独立 | 后续 Codex 更新会频繁触发小修，选择器散落时维护成本高 | v0.7 前建立 selector adapter / profile；每次 Codex 更新先安全回退，再补 profile | 不建议首发前改整个注入发现机制 | real UI validation；Codex 更新后至少进入 `takeover_compatibility` 而不是报错页 |
| R12 | Roadmap / README / release notes 未来口径漂移，导致 planned 能力被误读为已完成 | P1 | 用户可能因为“计划中能力”下载安装后发现没有而失望 | README、product spec、parity、roadmap 分工清楚，但 release notes 手写时容易把 planned 写成 done | `docs/roadmap.md` 已写 v0.2.5 不包含全量 parity / EXE / universal injection | 一旦首发文案夸大，会损害开源信任 | 每次发布前按 roadmap 做 done / partial / planned 核对；release notes 只写已验证能力和明确限制 | 不建议把路线图删掉或塞进 README 首屏 | release checklist 增加措辞核对；product-files / readme 测试保持边界断言 |
| R13 | 更新机制增强后可能被误读成静默自动更新或长期后台 | P2 | 用户担心工具自己升级、常驻、改变 Codex 行为 | 当前设计是检查更新 / 用户确认后一键安装，不是静默强制更新；安装后有可停止轻量守护 | README 明确不注册开机自启，roadmap 和 `docs/install-update-uninstall-experience.md` 明确不做自动静默更新 | 如果后续更新体验更自动，安全审查会质疑边界 | 保持“提示 + 用户确认 + 失败回滚”；守护只做历史保护，不做开机自启，不扩成后台更新器 | 不建议 v0.3 做自动更新 daemon | 更新命令测试；README 和 release notes 不出现静默自动更新承诺；失败路径验证已回滚 |
| R14 | Handoff / 导出能力增强后可能意外包含敏感路径、密钥或 `encrypted_content` | P1 | 用户导出的交接包可能被发到 issue、论坛或 AI，造成隐私风险 | 导出和交接包天然会聚合会话标题、路径、摘要、文件线索和状态说明 | 当前已有单会话 Markdown 导出和本地 Handoff；issue templates 提醒不贴敏感内容；redaction helper 已覆盖路径、常见 secret、`base_url` query 与 `encrypted_content` fixture | 功能越强，越可能把本地环境细节带出去 | Handoff / export 输出默认最小化；v0.3+ 将两者统一接入 redaction helper；导出前说明不包含密钥和旧加密原文 | 不建议首发前改成云总结或调用外部模型 | export / handoff 测试；redaction 敏感词 fixture；隐私扫描 |
| R15 | 会话项目移动未来实现时可能误伤 rollout / SQLite / workspace roots 一致性 | P1 | 用户移动会话后历史更乱，甚至当前项目和旧项目都看不全 | 会话移动会触碰 cwd、workspace metadata、索引和可能的 SQLite visibility 关系 | roadmap 把会话项目移动列为后续能力；当前不是 v0.2.5 主能力 | 如果没有事务和快照策略，会把历史恢复中枢变成风险源 | 首次实现必须放高级区、默认二次确认、操作前快照、只改可验证 metadata，失败可恢复 | 不建议首发前实现移动会话 | 移动前后历史连续性测试；快照恢复测试；SQLite / rollout / workspace roots 一致性检查 |

## 4. 发布判断

### v0.2.5 blocker

当前没有发现必须阻塞 v0.2.5 的 P0 架构风险。

理由：

- 用户主路径已经明确为“安装后继续正常打开 `Codex`”。
- 当前公开口径是 compatibility-ready，没有承诺 universal injection。
- 安全边界已经反复写清：不上传历史、不改 provider / API 地址 / 登录方式、不重写旧加密会话内容、不做批量删除。
- 当前风险主要是后续维护复杂度和未来功能扩张边界，不是首发基础能力失效。

### v0.3.0 优先治理

- R6：安装 / 更新 / 卸载体验继续小白化。
- R10：把已建立的 redaction helper 接入 issue diagnosis、Handoff、export 和 bridge errors。
- R12：把 release notes 的 done / planned 核对纳入 checklist。
- R14：收紧 Handoff / export 输出边界，并补敏感词 fixture。

### v0.4.0 / v0.5.0 之前必须治理

- R1：注入 UI 的内部职责分区必须固化。
- R2：service 只能做编排，不能继续吸收所有业务细节。
- R4：bridge 端点准入规则必须制度化。
- R5：Codex++ parity 能力进入 UI 前必须保持“一张卡 + 一个主按钮”。
- R9：长期状态枚举要扩展，但不能污染第一层体验。
- R15：会话项目移动必须有快照、二次确认和一致性验证。

### 可接受为长期债

- R3：launcher 目前仍可接受，只要不加入历史修复业务。
- R7：compatibility mode 的用户理解风险可以通过文案和真实验证持续收口。
- R8：旧命名残留在兼容 alias 和内部稳定点中可接受，但不能进入普通用户主路径。
- R13：更新机制保持用户确认即可，不需要首发前建设长期后台。
- R11：selector adapter 是 v0.7 稳定性建设重点，v0.2.5 依靠真实验证和安全回退即可。

## 5. 反方审计结论

### 普通用户视角

- 能在 README 首屏看到它解决的是历史保护、恢复和修复，而不是新的 Codex。
- 能看到安装后继续打开 `Codex`、入口叫 `历史`、固定三步是“修复历史显示 / 重建历史索引 / 打开高级修复”。
- 能看到 `Codex Pro.cmd` 是维护 / 救援入口，不是日常主入口。
- 能看到卸载默认不删除 Codex 历史、快照或仓库代码。
- 风险：安装仍是脚本体验，不像最终 Pro 软件；这应进入 v0.3 / v0.6，而不是阻塞 v0.2.5。

### Codex++ 用户视角

- 文档说明 `Codex++` 是参考项目，Codex Pro 参考能力和机制，不复制源码。
- v0.2.5 明确不是全量 `Codex++` parity；v0.4 才是 core parity 阶段。
- 差异化足够明确：继续正常打开 Codex、原生历史入口、历史恢复中心、compatibility-ready、release evidence、Handoff。
- 风险：release notes 如果只写“覆盖 Codex++ 功能”会被质疑换皮或夸大，必须写“首发覆盖已验证主路径，parity 分阶段推进”。

### 安全审查者视角

- 文档已明确不上传历史、账号数据、本地登录文件和旧加密会话内容。
- 文档已明确不自动修改 `model_provider`、`base_url`、登录方式和旧加密会话内容。
- issue templates 提醒不要粘贴密钥、`auth.json`、账号令牌和旧加密内容原文。
- bridge 口径是本地 `127.0.0.1` + token，安全方向正确。
- 风险：后续 Handoff / issue 诊断文本增强前，必须先做统一脱敏。

### 开源维护者视角

- README 面向用户，product spec 定产品边界，parity 定竞品对齐，roadmap 定版本顺序，project-framework 定当前架构，risk register 定债务治理，职责清楚。
- pack 清单通过 `package.json` 的 `files` 收口，`docs` 会随包发布，新增风险文档应进入包。
- 风险：多文档体系需要 release checklist 防漂移，避免 planned 能力被误写为 done。

### 竞品挑刺者视角

- 可能被质疑“只是 Codex++ 换皮”，但 Codex Pro 的核心差异不是功能更多，而是更原生、更低门槛、更重视历史恢复和发布证据。
- 最大宣传风险是把 compatibility-ready 写成 universal injection，或把 roadmap 写成已完成。
- v0.2.5 应避免声称“全量 Pro / 全量 parity / 所有机器都能原生增强成功”。

## 6. 治理原则

1. 不为文档上的架构洁癖大改首发代码。
2. 优先守住用户主路径、数据安全、安全回退和发布验证。
3. 每次新增能力前，先更新 product spec、parity、roadmap 和本风险登记。
4. 功能进入 UI 前必须明确它属于第一层、第二层、第三层还是维护层。
5. 第一层永远克制：一个入口、一张救援卡、一个主动作。
6. 工程词只允许进入高级诊断、日志和维护者文档。
7. 所有 mutation 默认先快照；删除必须可撤销；高风险能力必须二次确认。
8. `launcher` 不做历史修复业务；`bridge` 是窄通道；`product-state` 是状态事实源；`service` 只应编排，不应无限膨胀。
9. release notes 只写已经验证的能力，planned 能力必须标成 planned。
10. 如果 Codex Desktop 更新破坏注入，首选安全回退，而不是硬撑 UI 增强。

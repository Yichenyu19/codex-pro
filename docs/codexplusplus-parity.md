# Codex++ 对齐矩阵

> 这份文档定义 `Codex Pro` 如何吸收 `Codex++` 已验证的高需求能力，并把它们重新放进 Codex Pro 的原生、克制、安全、低门槛体验里。它不是源码移植计划；Codex Pro 只参考能力、机制和用户需求，不复制 Codex++ 源码。

## 1. 说明

`Codex++` 是重要参考项目。它已经证明 Codex Desktop 用户确实需要插件入口修复、会话删除、删除撤销、Markdown 导出、会话移动、Timeline、Provider 可见性同步、Windows 启动封装、watcher 和更新等增强能力。

`Codex Pro` 的目标不是把 Codex++ 换皮，而是：

- 覆盖 Codex++ 的核心高需求能力。
- 保持用户继续正常打开 `Codex`，不要把另一个增强菜单变成日常主入口。
- 把能力收进更原生、更克制、更安全的体验层。
- 把历史恢复中枢、Handoff、compatibility-ready、redaction 和 release evidence 做得更完整。
- 对 planned / later 能力保持清楚边界，避免把路线图写成已完成。

Codex Pro 不直接复制 Codex++ 源码。原因：

- **产品形态不同**：Codex Pro 主路径是继续打开 Codex，不是把外部增强菜单作为主入口。
- **安全边界不同**：Codex Pro 更强调不自动改 provider、API 地址、登录方式或旧加密会话内容。
- **UI 层级不同**：Codex Pro 第一层必须保持 `历史` 入口、一张救援卡、一个主按钮；高风险和低频能力进入高级区或维护入口。
- **发布策略不同**：Codex Pro 把真实 Codex 验证、pack 清单、隐私扫描、redaction 和 release gate 作为可信度的一部分。

## 2. 状态与层级口径

状态含义：

- `done`：当前仓库已有可运行实现、测试或验证链。
- `partial`：已有基础实现，但还需要产品化、稳定化、更完整验证或更清晰 UI 层级。
- `planned`：明确应该做，但当前不作为 v0.2.5 blocker。
- `later`：长期方向，不作为 Windows 首发阶段承诺。
- `no`：明确不做，或不以该产品形态进入 Codex Pro。

UI 层级含义：

- **第一层**：普通用户默认看到的主路径，只允许状态、一张救援卡和一个下一步主动作。
- **第二层**：低噪声、上下文相关、不会压过历史恢复主路径的辅助能力。
- **高级区**：power user 能力；可以出现工程解释，但必须有安全边界、快照、确认或脱敏。
- **维护入口**：安装、更新、卸载、日志、诊断、守护状态等低频运维入口。
- **不进入 UI**：内部协议、底层实现细节或明确不做的能力。

## 3. 细粒度功能矩阵

| 能力 | Codex++ 做法概述 | 用户真实需求 | Codex Pro 当前状态 | 首发是否可宣传 | 推荐版本 | UI 层级 | 是否需要快照 | 是否需要二次确认 | 是否需要 redaction | 是否有数据风险 | Codex Pro 差异化设计 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CDP 注入 | 外部 launcher 启动 Codex 并通过 CDP 注入渲染脚本 | 在真实 Codex 页面里看到增强能力，而不是离开 Codex | partial | 可克制宣传：只说 supported environments + 安全回退 | v0.2.5 起持续稳定 | 不进入第一层；只作为页面增强机制 | 否 | 否 | 需要：诊断文本脱敏 | 中：选择器和上游页面变化风险 | 定义为 compatibility-ready，不承诺 universal injection；注入不可用时仍能继续打开 Codex 并保留恢复主路径 |
| helper / bridge | 本地 helper 服务承接删除、导出、移动、设置等动作 | 页面 UI 需要安全调用本地能力 | done | 可宣传为本地优先窄通道，但不强调技术细节 | v0.2.5 | 不进入 UI | mutation 端点需要 | mutation 端点需要 | 需要：错误与诊断文本 | 中：端点扩张风险 | 只绑定 `127.0.0.1`，token 鉴权，保持历史 / 恢复 / 导出 / 更新窄通道，不扩成本地通用平台 |
| 顶部菜单 | 提供 `Codex++` 顶部菜单和设置面板 | 用户想集中管理增强能力 | no（不作为主入口） | 不宣传 | 不做主路径 | 不进入 UI；必要设置只进高级区 | 视具体动作 | 视具体动作 | 视具体动作 | 中：会破坏原生感 | Codex Pro 不做显眼外挂菜单；入口收敛到 `历史` 和维护入口 |
| 原生 Codex 入口接管 | 通过外部启动器 / 快捷方式启动增强版 Codex | 用户不想每天记另一个打开方式 | done | 可宣传 | v0.2.5 | 第一层体验，但不展示技术细节 | 否 | 安装 / 卸载需要用户确认 | 需要：日志路径最小化 | 低：入口恢复风险 | 安装一次后继续正常打开 `Codex`；`Codex Pro.cmd` 只是维护 / 救援入口；卸载恢复原生入口 |
| 插件入口显示 | API Key 模式下修复插件入口可见性 | 用户需要看到原生插件入口，不想因为登录形态失去入口 | partial | 可克制宣传：高级区可见性修复 | v0.4.0 稳定化 | 高级区 | 否 | 建议高级动作确认或明确说明 | 需要：诊断文本 | 低到中：误解为改登录方式 | 不写“破解 / 绕过”；只表达为可见性修复，不伪造账号、不切登录方式 |
| 插件安装按钮恢复 | 移除前端不可用态，让安装按钮可点击 | 特定插件页面按钮被禁用时需要可尝试安装 | partial | 可克制宣传：高级区按钮可见性修复 | v0.4.0 稳定化 | 高级区 | 否 | 建议 | 需要：失败原因脱敏 | 中：用户误解为保证安装成功 | 不承诺所有插件都能安装；失败给人话原因；不触碰账号、provider 或登录方式 |
| 单会话删除 | 会话行 hover 显示删除，删除前确认 | Codex 原生缺少真正删除能力，用户想清理单条会话 | done | 可宣传 | v0.2.5 | 第二层 row action | 是 | 是 | 需要：错误文本 | 高：删除本地历史 | 当前会话不显示删除；非当前会话 hover / focus 才显示；删除前快照，不做批量删除 |
| 删除撤销 | 删除后支持撤销 | 用户怕误删，需要可恢复闭环 | done | 可宣传 | v0.2.5 | 第二层 toast / row action | 使用删除快照 | 撤销本身通常不需要 | 需要：错误文本 | 中：恢复一致性风险 | 删除闭环绑定快照和 undo token；避免不可恢复删除 |
| Markdown 导出 | 按本地 rollout 导出带时间戳 Markdown | 用户需要留档、分享、交接单个会话 | done | 可宣传 | v0.2.5 | 高级区 / row action | 否 | 建议导出前说明 | 是 | 中：隐私泄露风险 | 本地导出、文件名安全、跳过旧加密内容原文，逐步接入统一 redaction |
| 会话项目移动 | 把会话移动到普通对话或其他本地项目 | 历史归属错乱时想整理到正确项目 | partial | 不作为 v0.2.5 首屏宣传；可在高级维护能力中标为 experimental | v0.4.0 UI 稳定化 | 高级区 / 维护入口 | 是 | 是 | 需要：目标与错误脱敏 | 高：rollout / SQLite / workspace roots 一致性 | 已有独立后端 / CLI / bridge 基础实现：修改会话 `cwd`、SQLite `threads.cwd`、`session_index.jsonl` 与 workspace roots，并先创建快照；UI 稳定化和二次确认仍放到 v0.4 |
| Timeline | 右侧显示用户提问时间线，悬停摘要，点击跳转 | 长对话难定位，需要快速跳到关键节点 | partial | 可克制宣传：轻量当前页面跳转点 | v0.4.0 稳定化 | 第二层，默认低噪声 | 否 | 否 | 一般不需要；摘要导出需要 | 低：DOM 适配风险 | 只扫描当前页面 DOM，不接管滚动主体，不做全局导航系统 |
| Provider 同步 / 可见性修复 | 同步会话 metadata，让切 provider 后历史仍可见 | 切 provider、账号或配置后历史“像丢了” | partial | 可克制宣传：历史可见性修复，不说 provider 管理 | v0.2.5 起，v0.4.0 增强 | 第二层 / 高级区 | 是 | 对高风险修复需要 | 需要：诊断文本脱敏 | 高：metadata 误修风险 | 只修复历史可见性 metadata；不自动改 `model_provider`、`base_url`、登录方式，不重写旧加密内容 |
| 历史恢复中心 | Codex++ 更偏功能菜单，未形成完整恢复中枢 | 用户只想知道历史还在不在、下一步点什么 | partial | 可宣传为 Codex Pro 核心方向，但不夸大 | v0.2.5 起，v0.5.0 成熟 | 第一层 | mutation 前需要 | 高风险动作需要 | 需要：issue / evidence 输出 | 中到高：恢复动作影响本地状态 | 分类处理数据真丢、不可见、索引坏、roots 漂移、SQLite metadata、provider 分裂和安全回退；普通用户只看固定三步 |
| `session_index.jsonl` 重建 | 相关索引 / metadata 修复能力 | index 空、短、稀疏导致历史不可见 | done | 可宣传 | v0.2.5 | 第一层固定三步之一 | 是 | 主按钮可算用户确认 | 需要：错误文本 | 中：索引写入风险 | 从 rollout 重建索引；遇锁或异常友好失败，保留快照 |
| workspace roots 修复 | 相关项目路径 metadata 同步 | 项目侧栏显示 `No chats` 或路径漂移 | done | 可宣传 | v0.2.5 | 高级区 / 恢复中心内部动作 | 是 | 建议 | 需要：路径脱敏 | 高：路径与项目归属风险 | Windows 路径规范化、roots 对齐；不通过改排序伪造恢复 |
| SQLite 可见性修复 | 相关本地数据库可见性修复 | rollout 还在但 Desktop UI 看不到 | done | 可宣传 | v0.2.5 | 高级区 / 恢复中心内部动作 | 是 | 建议 | 需要：错误脱敏 | 高：数据库写入风险 | 只修 `cwd`、`has_user_event` 等显示必要 metadata，不改消息正文 |
| `encrypted_content` 边界诊断 | 对旧加密边界说明较弱 | 用户需要知道“看见旧会话”不等于“能跨账号继续解密” | partial | 可宣传为安全边界说明，不宣传为恢复能力 | v0.2.5 起，v0.5.0 更清楚 | 高级区 / issue flow | 否 | 否 | 是，禁止原文 | 中：误导风险高 | 明确可见性恢复与内容可继续对话是两件事；不重写、不解密、不跨 provider / account 承诺 |
| Handoff Guard | 不作为 Codex++ 核心主线 | 长任务需要本地交接包，便于重开或转交 | done | 可宣传 | v0.2.5 | 高级区 | 否 | 建议 | 是 | 中：交接包隐私风险 | 本地生成，不调用模型；跳过旧加密内容原文；后续与 Context Risk / Recovery Evidence 联动 |
| Context Risk | 弱或无 | 长对话接近失控前得到低噪声提醒 | planned | 不作为 v0.2.5 宣传 | v0.5.0 | 第二层 / 高级区 | 否 | 否 | 是，若生成可复制诊断 | 低到中：误报和焦虑风险 | 不承诺突破上下文限制，只提醒何时导出、Handoff 或开新会话 |
| Recovery Evidence | 弱或无 | 修复后想知道“改了什么 / 没改什么 / 能否分享给 issue” | planned | 不作为 v0.2.5 宣传 | v0.5.0 | 高级区 / issue flow | 读取快照摘要 | 否 | 必须 | 中：证据包含路径 / token 风险 | 输出可读、可复制、默认脱敏的修复摘要；作为 release evidence 和 issue 支撑 |
| 一键检查更新 | 命令或菜单检查 GitHub / release 更新 | 用户想知道是否有新版本 | done | 可宣传 | v0.2.5 | 维护入口 / 高级区低噪声提示 | 否 | 否 | 需要：错误文本 | 低：网络失败噪声 | 启动时可检查但不强制；发现更新后提示用户确认 |
| 一键安装更新 | 命令安装新版本 | 用户不想手动替换文件 | done | 可宣传但强调用户确认 | v0.2.5 起，v0.3.0 收口 | 维护入口 | 是：版本备份 | 是 | 需要：错误文本 | 中：更新失败 / 回滚风险 | 更新前备份，失败回滚；不静默升级，不注册后台更新器 |
| Windows 快捷方式 | 创建增强入口、卸载项、可选 watcher | 用户需要像普通 Windows 软件一样打开和维护 | done | 可宣传 | v0.2.5 起，v0.3.0 收口 | 第一层入口 + 维护入口 | 否 | 安装 / 卸载确认 | 需要：日志路径最小化 | 低到中：入口恢复风险 | 原生 Codex 入口接管；开始菜单维护入口收纳；卸载恢复原生入口 |
| watcher / 自动接管 | 可选 watcher 自动接管 Codex 启动 | 用户希望正常打开也能自动附着增强能力 | partial | 克制宣传：不是普通用户主路径 | v0.3.0 / v0.7.0 稳定 | 维护入口 | 否 | 启用 / 停用需要 | 需要：日志脱敏 | 中：被误解为常驻后台 | 轻量、可停止、不注册开机自启；优先保证安全回退，不做重后台 |
| 卸载恢复原生入口 | remove 命令恢复原始入口，可选清理数据 | 用户想放心卸载，不丢历史 | done | 可宣传 | v0.2.5 | 维护入口 | 对入口状态做备份 / 恢复 | 是；`RemoveData` 必须显式 | 需要：路径最小化 | 中：误删工具数据风险 | 默认不删 Codex 历史、快照和仓库代码；只在显式参数下清理工具私有数据 |
| macOS app | 生成 `/Applications/Codex++.app` | macOS 用户希望同等体验 | later | 不作为 Windows 首发宣传 | v1.x 之后评估 | 不进入 Windows UI | 待定 | 待定 | 待定 | 中：平台差异风险 | Windows-first；macOS 不作为 v0.2.5 / v0.4 blocker，避免拖累主线 |
| 批量删除 | 可能围绕归档或列表提供批量清理 | 少数用户想快速清理大量历史 | no | 不宣传 | 不做 | 不进入 UI | 即使做也必须快照，但当前不做 | 是，但当前不做 | 是 | 极高：误删历史 | 明确不做批量删除；只做单条删除 + 快照 + 撤销 |
| 自动更新 | 更自动化地检查并安装更新 | 用户想省事，但安全敏感用户担心静默改动 | no（静默自动安装不做） | 不宣传 | 不做静默；v0.3 做确认式更新收口 | 维护入口 | 是 | 是 | 需要 | 中：信任风险 | 只做自动检查 + 用户确认安装；不静默替换，不做开机自启更新器 |
| 插件市场 | 集中发现 / 安装 / 管理插件 | 用户想扩展 Codex 能力 | no | 不宣传 | 不做 | 不进入 UI | 不适用 | 不适用 | 不适用 | 高：产品定位漂移 | Codex Pro 不是插件市场；只做原生插件入口 / 按钮可见性修复 |

## 4. v0.2.5 已完成且可宣传清单

这些能力可以进入 v0.2.5 release notes，但仍要使用克制口径：

- 安装一次后继续正常打开 `Codex`。
- 原生 Codex 入口接管 + compatibility-ready 安全回退。
- 历史保护、快照、恢复最近快照。
- 修复历史显示。
- 重建 `session_index.jsonl`。
- workspace roots 修复。
- SQLite 可见性修复。
- 单会话删除 + 删除撤销。
- 单会话 Markdown 导出。
- 本地 Handoff Guard 初版。
- 一键检查更新 / 用户确认后一键安装更新。
- 卸载恢复原生入口，默认不删 Codex 历史。
- release gate、pack dry-run、隐私路径扫描、真实状态验证和真实 UI 验证资产。

## 5. v0.2.5 已有但必须克制宣传清单

这些能力当前有基础，但不能写成“完整覆盖”或“所有环境必定成功”：

- **CDP 注入**：只能写 compatibility-ready；不写 universal injection，不写所有机器都能注入成功。
- **插件入口显示 / 插件安装按钮恢复**：只能写高级区可见性修复；不写破解、绕过、强制或保证安装成功。
- **Timeline**：只写轻量当前页面跳转点；不写完整全局导航系统。
- **会话项目移动**：已有后端 / CLI / bridge 基础能力，但仍属于高级维护能力；不写进 v0.2.5 首屏，不写成普通用户 UI 已稳定。
- **Provider 可见性修复**：只写历史 metadata 可见性修复；不写 provider 管理器或自动切换 provider。
- **watcher / 自动接管**：只作为维护层能力；不作为普通用户日常主路径，不写常驻后台。
- **`encrypted_content` 边界诊断**：只写边界说明；不写能跨 provider / account 解密或继续旧加密内容。

## 6. v0.3.0 最值得优先收口清单

v0.3.0 不追求新增大功能，优先把已有能力变得更像普通 Windows 软件：

1. 安装结果四行化：当前状态、日常入口、下一步、日志位置。
2. 更新体验收口：检查低噪声、用户确认、更新前备份、失败回滚、人话错误。
3. 卸载体验收口：恢复原生入口，默认不删历史、快照和仓库代码，`RemoveData` 显式化。
4. redaction 接入顺序：issue diagnosis、Handoff、export、bridge errors。
5. bridge 端点分类和错误短句化：status、repair、session action、export、update、maintenance。
6. 维护入口命名稳定：普通用户继续打开 Codex，维护入口只用于救援、更新、卸载和日志。
7. compatibility mode 文案稳定：安全回退，不是失败。

## 7. v0.4.0 Codex++ core parity 清单

v0.4.0 才是 Codex++ core parity 的主战场，但仍必须放进 Codex Pro 的 UI 层级和安全边界：

- 插件入口显示稳定化。
- 插件安装按钮恢复稳定化。
- Timeline 稳定化。
- Markdown 导出增强。
- 会话项目移动 UI 稳定化：高级区、快照、二次确认、一致性验证和真实 UI 接入。
- Provider 可见性修复增强。
- 高级区重新整理，避免所有能力平铺。
- selector / UI contract 更稳定，至少保证上游变化时安全回退。

## 8. v0.5.0 Pro differentiation 清单

v0.5.0 开始强调 Codex Pro 相比 Codex++ 的真正护城河：

- 历史恢复中心升级：更清楚地区分数据真丢、本地还在但不可见、索引坏、roots 漂移、SQLite metadata、provider 分裂和安全回退。
- Recovery Evidence：修复后生成“改了什么 / 没改什么 / 哪些需要人工确认”的脱敏摘要。
- Handoff Guard 增强：与长对话风险、Timeline、issue 诊断文本联动。
- Context Risk：低噪声提醒，不承诺突破上下文限制。
- issue 诊断文本一键复制：默认脱敏，可分享。
- Codex 更新兼容矩阵：把真实 UI 验证和 fallback 结果沉淀为维护证据。

## 9. 明确不做清单

这些能力不进入 Codex Pro，或不以 Codex++ 的形态照搬：

- 插件市场。
- 批量删除。
- 静默自动安装更新。
- 开机自启的重后台。
- provider 管理器。
- 云同步或团队共享历史。
- 上下文破限承诺。
- 修改 Codex 安装包。
- 复制 Codex++ 源码。
- 顶部 Codex++ 式菜单作为普通用户主入口。
- macOS 作为 Windows first public release blocker。

## 10. 需要安全前置的能力清单

以下能力继续增强前，必须先补安全、脱敏或验证资产：

- Handoff Guard 增强：必须默认 redaction，禁止密钥、token、`auth.json` 和旧加密内容原文进入交接包。
- Markdown 导出增强：必须保证本地导出、可解释跳过旧加密内容，并覆盖敏感词 fixture。
- Recovery Evidence：必须先完成 shareable diagnostics 的 redaction。
- Context Risk：若输出可复制诊断文本，必须走 redaction。
- Provider 可见性修复增强：必须明确不改 provider / API 地址 / 登录方式。
- bridge errors：用户可复制错误必须短句化和脱敏。
- 插件入口 / 安装按钮修复：必须避免账号、登录方式和 provider 误导。

## 11. 需要快照 / 二次确认的能力清单

需要快照：

- 单会话删除。
- `session_index.jsonl` 重建。
- workspace roots 修复。
- SQLite 可见性修复。
- Provider metadata 可见性修复。
- 会话项目移动。
- 更新安装前的当前版本备份。
- 卸载恢复入口前的入口状态记录。

需要二次确认：

- 单会话删除。
- 会话项目移动。
- 安装更新。
- 卸载，尤其是显式 `RemoveData`。
- 任何未来会修改 rollout、SQLite、workspace roots、provider metadata 的动作。

## 12. Codex Pro 相比 Codex++ 的真正优势

### 12.1 更原生的入口

Codex Pro 的日常主路径是：

```text
安装一次
继续正常打开 Codex
```

用户不需要每天改用一个外部增强启动器。`Codex Pro.cmd` 只是维护 / 救援入口，不是日常主入口。

### 12.2 更原生的 UI

Codex Pro 不把顶部增强菜单作为普通用户主路径，而是把入口收敛为：

- Codex 内的 `历史`
- 一张救援卡
- 一个主按钮
- 高级默认折叠
- 会话行 hover / focus 二级动作

这让用户感觉是 Codex 自己补上了历史和恢复能力，而不是装了一个外接控制台。

### 12.3 更完整的历史恢复中枢

Codex Pro 把历史问题拆成更明确的状态：

- 本地数据真不存在
- 本地数据还在但不可见
- index 为空、偏少或稀疏
- workspace roots 漂移
- SQLite 可见性字段不一致
- provider metadata 分裂
- 旧加密会话内容存在边界
- 页面增强不可用但可以安全回退

普通用户第一层不需要理解这些，只需要按固定三步走：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

### 12.4 更清楚的安全边界

Codex Pro 明确不做：

- 不上传历史
- 不上传账号数据
- 不上传本地登录文件
- 不重写旧加密会话内容
- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 不做批量删除
- 不静默安装更新

这些边界会进入 README、UI、issue template、测试、release notes 和 release gate。

### 12.5 更成熟的 compatibility mode

Codex Pro 不把 compatibility mode 当成失败页，而是把它定义为正式安全回退：

- Codex 继续正常打开。
- 历史保护仍然生效。
- 快照、修复历史显示、重建历史索引和删除撤销仍然可用。
- release notes 不夸大为 universal injection。

### 12.6 更强的 release evidence

Codex Pro 把发布证据作为产品信任的一部分：

- `npm test`
- install / uninstall smoke
- real state validation
- real UI validation
- pack dry-run
- 隐私路径扫描
- 旧口径扫描
- release gate

### 12.7 更重视 Handoff / 长对话连续性

Codex Pro 不承诺突破上下文限制，而是提供更可信的工作连续性能力：

- Timeline 帮用户定位长对话节点。
- Handoff Guard 本地生成交接包。
- Context Risk 未来用于低噪声提醒。
- Recovery Evidence 未来用于解释每次修复做了什么。

## 13. Codex Pro 不应该照搬的点

Codex Pro 不应该照搬这些产品形态：

- 不把顶部 Codex++ 菜单作为主入口。
- 不把 watcher 作为普通用户主路径。
- 不用“破解”“绕过”“强制”这类文案。
- 不做批量删除。
- 不承诺 universal injection。
- 不把 macOS 作为 Windows 首发 blocker。
- 不把所有能力平铺在第一层 UI。
- 不把工程诊断词放到普通用户主路径。
- 不直接复制 Codex++ 源码。

Codex Pro 要吸收的是 Codex++ 已验证的用户需求和机制经验，而不是它的全部产品形态。

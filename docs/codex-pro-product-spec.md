# Codex Pro 产品规格

> 这份文档是 `Codex Pro` 后续产品、UI、架构和发布判断的单一规划依据。它不是营销稿，也不是短期功能清单；它定义的是这个项目应该长期追求什么、不能做什么，以及新增能力如何进入正确层级。

## 1. 一句话定位

`Codex Pro` 是 Windows-first、非官方、本地优先、原生接管式的 Codex Desktop Pro 增强层。

用户安装一次后，日常仍然继续像平常一样打开 `Codex`。`Codex Pro` 在本机背后补齐历史保护、恢复、删除撤销、单会话导出、本地交接包、长对话跳转、插件入口可见性修复、低噪声更新和安全回退。

它不是：

- Codex 替代品
- Codex fork
- 插件市场
- 云同步工具
- provider 管理器
- 上下文破限工具
- 全能桌面管理器

它的核心承诺是：

> 继续打开 Codex；历史不完整时，先在 Codex 里点 `历史`，按固定三步恢复；所有能力本地优先、默认克制、可快照、可回退。

## 2. 目标用户

第一目标用户是 Windows 上的 Codex Desktop 重度用户：

- 害怕本地历史丢失或“像丢了一样看不见”的用户
- 经常切 provider、API Key、账号或 `config.toml` 的用户
- 需要删除、撤销、导出、交接、Timeline、插件入口修复的用户
- 不想理解 CDP、SQLite、rollout、`session_index.jsonl`、workspace roots 的普通用户
- 希望安装、更新、卸载像普通软件一样简单的用户

第二目标用户是 Codex power user 和开源维护者：

- 需要 CLI、日志、诊断文本和 release evidence
- 关心不修改 Codex 安装包、不上传历史、不碰登录文件和旧加密会话内容
- 需要在 Codex Desktop 更新后快速判断是注入能力变化、历史可见性问题，还是本地状态异常

首发不优先服务：

- macOS 正式用户群
- 需要云同步或团队共享历史的用户
- 想让工具自动改 provider、API 地址或登录方式的用户
- 需要批量清理历史的用户
- 希望工具突破上下文限制的用户

## 3. 用户真实问题

### 3.1 历史像丢了一样

用户看到的是：

- Codex Desktop 侧栏项目还在，但显示 `No chats`
- 旧会话从侧栏或搜索里消失
- 本地文件还在，但 UI 看不到
- 更新、重启或切换配置后历史突然变少

产品判断：

- 这类问题很多不是“数据真删了”，而是历史可见性、索引、workspace roots、SQLite metadata 或 provider metadata 没有对齐。
- 普通用户不应该先理解工程原因，而应该先看到“本地记录可能还在，点一下修复显示”。

### 3.2 本地数据还在但不可见

常见工程原因：

- `session_index.jsonl` 为空、明显偏少或变成稀疏窗口
- rollout 会话文件仍在，但 index 没覆盖
- SQLite 中 `threads.cwd` 或 `has_user_event` 与实际会话不一致
- `.codex-global-state.json` 的 workspace roots 被重写
- Windows 路径大小写、`\\?\` 前缀、Desktop / Documents 路径变体导致项目匹配失败

产品响应：

- 固定走历史恢复中心，不让用户在多个按钮之间猜。
- 先修复历史显示，再重建历史索引，仍不完整再进入高级修复。

### 3.3 切 provider / 切账号 / 改配置后历史不可见

用户看到的是：

- 换 API Key 或中转后，旧历史像消失了
- 从 OAuth 登录切到 API 登录后只看见一部分
- `config.toml` 改过以后，原来的会话分散到不同显示分组

产品判断：

- Codex Pro 可以修复本地历史可见性 metadata。
- Codex Pro 不应该自动改用户的 provider、API 地址或登录方式。
- 含旧加密会话内容的历史可见性可以尽量恢复，但能否继续对话取决于原账号和原 provider 边界。

### 3.4 `encrypted_content` 跨 provider / account 的边界

用户容易误解：

- “看见了旧会话”不等于“所有旧内容都能在新 provider 下继续解密对话”。

产品表达：

- 第一层 UI 不讲加密细节，只保证不会重写旧加密会话内容。
- 高级说明中明确区分：
  - 历史可见性恢复
  - 旧加密内容能否继续对话

### 3.5 Codex 原生无法真正删除会话

用户需要：

- 删除单条本地会话
- 删除前有保护
- 删除后能撤销
- 不误删当前正在进行的会话

产品响应：

- 删除是二级动作，不是主路径。
- 当前会话不显示删除。
- 非当前会话 hover / focus 时显示弱灰色图标。
- 删除前自动快照，删除后 toast 撤销。
- 首发不做批量删除。

### 3.6 API Key 模式下插件入口 / 安装按钮不可用

用户看到的是：

- 插件入口没有显示
- 安装按钮不可点
- 当前登录模式下原生页面限制了插件相关控件

产品响应：

- Codex Pro 可以尝试修复当前页面的插件入口和安装按钮可见性。
- 文案使用 `显示插件入口`、`恢复安装按钮`。
- 不使用“破解”“绕过”“强制”这类高风险表达。
- 不伪造账号，不切登录方式，不修改 Codex 安装包。

### 3.7 长对话不好跳转、难交接

用户需要：

- 在长对话里快速跳回某个用户提问
- 长对话接近风险时生成本地交接包
- 开新对话继续时保留任务目标、关键文件和下一步

产品响应：

- 轻量 Timeline 只扫描当前页面 DOM，不接管滚动主体。
- Handoff Guard 本地生成交接包，不调用外部模型，不上传历史。
- Context Risk 只做低噪声提醒，不承诺突破上下文限制。

### 3.8 安装、更新、卸载门槛高

用户需要：

- 像普通软件一样安装
- 继续打开 Codex，不改变习惯
- 一键更新
- 更新失败能回滚
- 一键卸载并恢复原生入口

产品响应：

- 当前 first public release 允许使用脚本安装。
- 长期目标是 `Codex-Pro-Setup-x64.exe`。
- 安装结果只显示主入口、当前模式、下一步和日志。

### 3.9 用户担心上传历史、改账号或破坏本地数据

产品必须让用户明确知道：

- 不上传历史
- 不上传账号数据
- 不上传本地登录文件
- 不重写旧加密会话内容
- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 所有会改变本地状态的动作都应先快照

## 4. 产品原则

1. **用户无感**：安装后继续正常打开 `Codex`，增强层尽量静默。
2. **原生感**：UI 像 Codex 自己补上的功能，不像外挂控制台。
3. **本地优先**：历史检查、快照、修复、导出、交接包都在本机完成。
4. **修复前快照**：会改变本地状态的动作默认先快照。
5. **删除可撤销**：删除只做单条，删除前快照，删除后可撤销。
6. **兼容模式是安全回退**：页面增强不可用时，Codex 仍应正常打开，历史保护仍应继续。
7. **高级能力默认折叠**：普通用户第一层只看当前状态和一个下一步按钮。
8. **工程词只进高级区和日志**：CDP、bridge、SQLite、rollout、provider identity 等词不进入第一层 UI。
9. **不承诺 universal injection**：真实页面增强取决于当前 Codex Desktop 环境。
10. **不夸大能恢复所有历史**：如果本地数据真的不存在或旧加密边界不可跨越，必须说明限制。

## 5. 功能分层

### 第一层：日常无感能力

- 继续正常打开 `Codex`
- 原生入口接管
- 自动附着
- 注入不可用时安全回退
- 低噪声状态提示
- 安装后只告诉用户主入口、当前模式、下一步和日志

### 第二层：历史恢复中心

- 历史状态诊断
- 修复历史显示
- 重建历史索引
- 打开高级修复
- workspace roots 修复
- SQLite 可见性修复
- provider 可见性修复
- rollout fallback
- 快照与恢复
- 恢复后验证
- 固定三步：
  1. 修复历史显示
  2. 重建历史索引
  3. 打开高级修复

### 第三层：Codex++ 对齐能力

- 插件入口显示
- 恢复安装按钮
- 单条删除
- 删除撤销
- Markdown 导出
- 会话项目移动
- Timeline
- Provider 可见性同步
- 更新
- Windows 启动封装
- macOS later，不作为 Windows 首发 blocker

这些能力必须进入 Codex Pro 的信息层级，而不是平铺成一个功能菜单。

### 第四层：Codex Pro 差异化能力

- Handoff Guard
- Context Risk
- Recovery Evidence
- issue 诊断文本一键复制
- 真实 UI 验证资产
- compatibility-ready 体验
- Codex 更新后的能力探测和 fallback matrix

### 第五层：维护 / 发布层

- install smoke
- uninstall smoke
- real state validation
- real UI validation
- release gate
- pack dry-run
- 隐私扫描
- 旧口径扫描
- issue template 安全检查

这层服务维护者和 release，不应该成为普通用户主路径。

## 6. UI / UX 原则

### 6.1 第一层体验

第一层只允许出现：

- 当前状态
- 一句人话说明
- 一个主按钮
- 一句安全说明
- 一个 `高级` 折叠项

推荐结构：

```text
历史

历史可能没显示完整
本地记录还在。点一下，让它重新显示。
不会改账号、模型或 API 地址。

[修复历史显示]

高级
```

### 6.2 原生感

- 主入口优先叫 `历史`
- 一张救援卡
- 一个主按钮
- 高级默认折叠
- 删除按钮 hover / focus 才出现
- 当前会话不显示删除
- 插件修复不写“破解”“绕过”“强制”
- 第一层不出现 CDP、bridge、SQLite、rollout、provider identity 等工程词
- 液态玻璃只能作为轻微质感，不能抢 Codex 原生风格

### 6.3 高级区

高级区可以放：

- 找回旧会话
- 导出 Markdown
- 生成交接包
- 长对话跳转
- 显示插件入口
- 恢复安装按钮
- 检查更新
- 更多修复入口
- 日志和卸载说明

高级区不应该变成新的第一层菜单。

### 6.4 错误文案

内部可以记录工程错误，但 UI 应显示：

- `本地状态暂时没有连上。稍后再试一次。`
- `历史可能没显示完整。`
- `当前先按安全回退方式继续使用。`
- `这次没有改动账号、模型或 API 地址。`

## 7. 安全边界

Codex Pro 不做：

- 不上传历史
- 不上传账号数据
- 不上传本地登录文件
- 不重写旧加密会话内容（`encrypted_content`）
- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 不做批量删除
- 不静默更新
- 不开机自启
- 不修改 Codex 安装包

Codex Pro 必须做：

- 所有 mutation 前快照
- 删除后可撤销
- 更新前备份，失败回滚
- local bridge 只绑定 `127.0.0.1`
- local bridge 使用 token 鉴权
- 错误和诊断文本要脱敏
- issue 模板提醒不要贴密钥、本地登录文件原文或旧加密会话内容原文

脱敏规则的单一依据见：`docs/redaction-and-privacy.md`。新增 issue 诊断文本、Recovery Evidence、Handoff / export 输出或 bridge 错误文案前，应先确认输出分级和 redaction fixture。

## 8. 安装 / 更新 / 卸载体验

详细体验规划见：`docs/install-update-uninstall-experience.md`。v0.3.0 的目标是先把脚本 + 绿色包体验收口到接近普通 Windows 软件，不在该阶段承诺 EXE 安装器。

### 当前 first public release 路径

当前公开首发允许采用脚本 + 绿色包：

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

安装结果只显示：

- 主入口
- 当前模式
- 下一步
- 日志

v0.3.0 要进一步固定为第一层四行输出：

1. 当前状态
2. 日常入口
3. 下一步
4. 日志位置

入口状态、开始菜单路径、诊断缓存、端口等维护信息只进入高级 / verbose 输出。

### 长期目标

长期目标是：

```text
Codex-Pro-Setup-x64.exe
```

目标体验：

1. 下载
2. 双击
3. 安装
4. 继续打开 Codex

### 更新

- 一键检查更新
- 用户确认后一键安装更新
- 更新前备份
- 失败回滚
- 更新后提示重新打开 Codex
- 不做静默强制更新
- 不注册开机自启
- 不把轻量守护扩成后台更新器

### 卸载

- 一键卸载
- 停止本地轻量保护
- 恢复原生 Codex 入口
- 删除 Codex Pro 自己的入口
- 默认不删 Codex 历史
- 默认不删历史快照
- 默认不删仓库代码
- 只有用户明确选择时才清理工具数据

## 9. 架构原则

长期架构分为七层：

1. **Installer / Updater**
   - 安装、更新、回滚、卸载
   - 不进入普通 UI 主路径

2. **Takeover / Launcher**
   - 原生入口接管
   - Codex 启动
   - CDP 探测
   - bridge 自检
   - 注入与安全回退
   - 不做历史修复业务

3. **Local Bridge**
   - 本机窄通道
   - `127.0.0.1`
   - token 鉴权
   - 不扩成通用平台

4. **Pro Core**
   - product-state 单一事实源
   - recovery plan
   - safety policy
   - snapshot / restore
   - delete / undo
   - export / handoff
   - update policy

5. **Codex Data Adapters**
   - rollout
   - `session_index.jsonl`
   - SQLite
   - workspace roots
   - config 读取
   - provider metadata 可见性修复

6. **Native Presentation**
   - Codex 内原生化 UI
   - `历史` 入口
   - 救援卡
   - 侧栏修复条
   - hover actions
   - 高级折叠区

7. **Release Evidence**
   - tests
   - smoke
   - real state validation
   - real UI validation
   - pack dry-run
   - 隐私扫描
   - release gate

职责边界：

- UI 不做业务判断，只消费 `/status`、`productState`、`recoveryPlan`
- launcher 不做历史修复业务，只做入口、连接、降级和日志
- bridge 是窄通道，不直接承担数据策略
- `product-state` 是单一事实源
- `service` 不应继续变成无限总管，新增能力应逐步拆到明确 service / adapter
- `inject-ui` 要防止变成屎山，至少用内部清晰分区；未来可在不引入重前端框架的前提下构建为单文件注入产物

## 10. 不做清单

首发和中期默认不做：

- 插件市场
- 云同步
- 批量删除
- 自动静默更新
- 开机自启
- 自动改 provider
- 自动改 `base_url`
- 自动改登录方式
- 重写 `encrypted_content`
- 修改 Codex 安装包
- 上下文破限承诺
- 上传会话给 AI 总结
- macOS 首发承诺
- 把本地网页预览当作真实用户体验

如果未来确实要做其中某项，必须重新经过产品边界、安全边界和 release gate 评审。

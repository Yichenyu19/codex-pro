# Codex Pro 脱敏与隐私输出规范

## 1. 目标

Codex Pro 的隐私策略必须围绕“本地优先、用户可复制文本默认安全”展开：

- 用户可复制文本默认经过脱敏或只输出最小必要信息。
- 导出文件默认不包含密钥、token、`auth.json` 原文或旧加密内容原文。
- issue 诊断文本应该可以直接分享给维护者，而不是要求用户理解哪些字段危险。
- 本地路径尽量折叠，只在确实有助于诊断时保留 basename。
- 不上传、不云处理、不调用外部模型。
- 脱敏不能成为“看起来安全”的装饰；所有新增导出、诊断、错误、日志摘要都必须明确输出分级和测试 fixture。

## 2. 需要脱敏的内容

以下内容不得以原文进入 issue、可复制诊断文本、Recovery Evidence、Handoff 包或公开 release evidence：

- Windows 用户目录，例如 `C:\Users\Alice\...`。
- `auth.json` 原文、片段或可还原账号令牌。
- API Key，例如 `sk-...`、`rk-...`、`pk-...`、`OPENAI_API_KEY=...`。
- `Bearer` token。
- session token、refresh token、access token、bridge token。
- `base_url` 中的 token query、key query、签名 query 或私有代理身份信息。
- `encrypted_content` 原文。
- cookie、Authorization header、代理认证 header。
- 环境变量中看起来像密钥、token、密码、secret 的值。
- 私有代理地址中携带的账号、token、query 或明显内部域名。
- workspace 绝对路径。
- 日志绝对路径。

## 3. 不一定要脱敏但要谨慎的内容

以下内容通常有诊断价值，不一定默认删除，但在 issue 诊断文本里应尽量最小化：

- provider 名：可保留低风险标识，例如 `openai`、`apigather`，但不要输出完整私有网关配置。
- 工作区 basename：可保留 `project-name`，但不保留完整父级路径。
- 文件名：可保留 `service.js`、`config.toml`，但不保留完整用户目录。
- thread id：通常可保留，用于定位本地会话；公开 issue 中如用户敏感，可允许手动替换。
- package version：应保留。
- Codex version：应保留。
- Windows version：应保留。

## 4. 输出分级

### 4.1 普通 UI 文案

- 面向普通用户，只说明状态、下一步和安全边界。
- 不出现密钥、token、绝对路径、`auth.json` 原文、`encrypted_content` 原文。
- 不展示 `CDP`、`bridge`、`SQLite`、`rollout` 等工程细节，除非用户主动打开高级区。

### 4.2 高级诊断

- 可以出现 provider 名、计数、状态枚举、日志位置提示。
- 本地路径尽量折叠为 `[local-path]\basename` 或 `%USERPROFILE%\...`。
- 错误消息短句化，不直接透传长堆栈里的敏感参数。

### 4.3 issue 诊断文本

- 默认应是维护者可读、用户可直接复制的安全文本。
- 必须经过统一 redaction helper。
- 不包含 `auth.json` 原文、密钥、token、cookie、`encrypted_content` 原文。
- 对 `base_url` 只保留是否配置、是否 localhost、是否存在 query 风险等低风险摘要。

### 4.4 本地导出 Markdown

- 单会话 Markdown 导出可以包含会话明文内容，但必须跳过 `encrypted_content` 原文。
- 明文里的本地路径和常见 secret-looking token 应脱敏。
- 文件名只做安全文件名，不等于隐私脱敏；标题进入正文时仍应考虑脱敏。

### 4.5 Handoff 包

- Handoff 是“可能被粘贴给下一轮 AI 或 issue”的高风险文本。
- 必须不调用外部模型。
- 必须跳过 `encrypted_content` 原文。
- 应默认脱敏本地路径、密钥、token、cookie、可疑 `base_url` query。
- 只保留对继续工作有用的目标、上下文、文件 basename 和恢复建议。

### 4.6 release evidence

- pack 清单、release gate、真实 UI 验证摘要可以保留版本和模式。
- 不应包含真实用户路径、真实 `.codex` 历史、账号数据或私有目录。
- 真实 UI 截图要避免显示用户密钥、账号令牌、私有路径或会话敏感内容。

### 4.7 日志

- 本地日志可以比 issue 文本更详细，但仍不应写入密钥、token、cookie、`auth.json` 原文或 `encrypted_content` 原文。
- 日志路径在 UI 中只在必要时显示，高级区可以显示 `%USERPROFILE%\.codex-pro\launcher.log`。

## 5. redaction 策略

### 5.1 路径折叠

- Windows 绝对路径：`C:\Users\Alice\Project\src\bridge.js` → `[local-path]\bridge.js`。
- 非用户盘符路径：`D:\Work\Project` → `[local-path]\Project`。
- Unix/macOS home 路径：`/Users/alice/project/file.js` → `[local-path]/file.js`。
- 默认保留 basename，避免维护者完全失去诊断线索。

### 5.2 key / token 模式替换

- `Bearer abc...` → `Bearer [secret]`。
- `OPENAI_API_KEY=sk-...` → `OPENAI_API_KEY=[secret]`。
- `session_token: ...` → `session_token: [secret]`。
- `password=...`、`secret=...`、`auth_token=...` 等统一替换。

### 5.3 `auth.json` 禁止原文

- 如果用户把 `auth.json` 内容贴到诊断区，应替换为 `[auth-json-redacted]` 或只保留“存在 / 不存在 / mtime”。
- issue 模板只允许提示用户不要粘贴原文。

### 5.4 `encrypted_content` 禁止原文

- 遇到 JSON 字段 `encrypted_content` 时，只保留字段存在与计数。
- 单会话导出和 Handoff 不解密、不重写、不导出密文。

### 5.5 `base_url` query 脱敏

- `base_url = "https://proxy.example/v1?token=abc"` → `base_url = "[base-url]"` 或移除 query。
- 分享型诊断优先只输出：
  - 是否配置了 `base_url`
  - 是否 localhost
  - 是否含 query 参数
  - 是否可能影响历史可见性

### 5.6 只保留必要 basename

- 文件线索保留 `service.js`、`history-guard-ui.js` 这类 basename。
- 不保留完整父级路径，除非用户明确在本地私下调试。

### 5.7 provider 仅保留低风险标识

- `openai`、`codex`、`apigather` 这类普通 provider id 可保留。
- 若 provider id 本身包含 token、域名、邮箱、私有组织名，应经过 `redactText`。

### 5.8 错误消息短句化

- bridge / UI 返回给用户的错误应是短句。
- 需要长堆栈时放到本地日志，并在 issue 诊断文本中生成脱敏摘要。

## 6. API 设计建议

统一 helper 建议放在 `src/redaction.js`：

- `redactText(text, options)`
  - 面向普通字符串。
  - 组合路径、key/token、`encrypted_content`、`auth.json`、base URL query 等规则。

- `redactPath(path, options)`
  - 面向单个路径。
  - 默认折叠为 `[local-path]\basename` 或 `[local-path]/basename`。

- `redactObject(value, options)`
  - 面向将要序列化为 JSON 的诊断对象。
  - 对敏感 key 直接替换为 `[secret]` / `[encrypted-content]` / `[auth-json-redacted]`。
  - 对普通 string 继续走 `redactText`。

- `buildShareableDiagnostics(status)`
  - 面向未来“issue 诊断文本一键复制”。
  - 只收 status / doctor / management 的安全字段。
  - 不直接暴露完整对象。

- 测试 fixture
  - 覆盖 Windows 路径、Unix home 路径、Bearer token、API key、key-value secret、`encrypted_content`、`auth.json`、`base_url` query、嵌套对象。

## 7. 接入顺序

1. issue diagnosis
   - 先做 shareable diagnostics，因为它最容易被用户粘贴到公开 issue。
2. Handoff
   - Handoff 可能被发给下一轮 AI 或论坛，必须尽早接入统一 helper。
3. export
   - 单会话 Markdown 已有基础脱敏，应统一到同一 helper 并补 fixture。
4. bridge errors
   - bridge 错误返回应避免直接透传敏感路径和堆栈。
5. logs
   - 本地日志保留调试价值，但密钥和旧加密内容仍不得原文写入。
6. release evidence
   - release gate 和 pack 扫描继续覆盖真实路径、旧口径和敏感词。

## 8. v0.2.5 / v0.3.0 边界

- v0.2.5
  - 只要求 pack 清单干净、隐私路径扫描干净、issue 模板明确不要粘贴敏感内容。
  - 可以存在最小 redaction helper，但不要求所有业务路径一次性接入。

- v0.3.0
  - 开始统一 `src/redaction.js` helper。
  - Handoff、export、issue diagnostics、bridge errors 应分批接入。
  - 新增用户可复制文本前，必须先补 redaction fixture。

- v0.5.0
  - Recovery Evidence 发布前必须完成统一 redaction。
  - issue 诊断文本一键复制必须默认可分享。

## 9. 绝对不能进入 issue / export / handoff 的内容

- `auth.json` 原文。
- API key。
- `Bearer` token。
- session / refresh / access token。
- cookie。
- password / secret。
- `encrypted_content` 原文。
- 带 token query 的 `base_url`。
- 可还原用户身份的完整本地路径。
- 私有代理认证信息。
- 任何能让第三方直接访问账号、会话、代理或本地文件的内容。

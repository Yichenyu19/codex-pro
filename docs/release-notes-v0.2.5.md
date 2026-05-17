# Codex Pro v0.2.5 Release Notes

## Release title

```text
Codex Pro v0.2.5 — compatibility-ready history recovery for Codex Desktop
```

## 一句话定位

`Codex Pro v0.2.5` 是面向 Windows 的首个公开候选版本：用户安装一次后继续正常打开 `Codex`，Codex Pro 在本机提供历史保护、恢复、删除撤销、导出、交接包、低噪声更新和安全回退。

## What is Codex Pro

Codex Pro is an unofficial, local-first enhancement layer for Codex Desktop on Windows.

It is designed for users who want Codex Desktop to feel safer and more recoverable without changing their daily workflow:

1. Install once.
2. Keep opening `Codex` normally.
3. If history looks incomplete, open `历史`.
4. Follow the fixed recovery path:
   1. 修复历史显示
   2. 重建历史索引
   3. 打开高级修复

Codex Pro is not affiliated with OpenAI. It does not replace Codex, fork Codex, modify the Codex app bundle, upload local history, or act as a plugin market.

## What is new in v0.2.5

v0.2.5 focuses on making the first public release credible, recoverable, and safe rather than maximizing feature count.

### Main path

- Keep opening `Codex` normally after installation.
- Take over desktop / start-menu Codex entries where supported, so the enhancement chain can attach in the background.
- Keep `Codex Pro.cmd` as a maintenance / rescue entry, not the daily primary path.
- Use compatibility mode as a safe fallback when the current Codex Desktop environment cannot support full page enhancement.

### History recovery

- History visibility diagnosis.
- History snapshots.
- Repair history display.
- Rebuild `session_index.jsonl`.
- Repair workspace roots visibility.
- Repair SQLite visibility metadata needed for local history display.
- Repair provider visibility metadata without changing the user's provider configuration.
- Restore latest snapshot.
- Resume fallback candidates from local history when the sidebar does not show enough sessions.

### Native-feeling UI when supported

- Lightweight `历史` entry inside Codex.
- One recovery card and one primary next step.
- Advanced actions folded away by default.
- Sidebar row delete action that appears as a secondary hover / focus action.
- Current session is protected from showing the delete action by default.

### Session actions

- Single-session delete.
- Snapshot before delete.
- Undo after delete.
- Single-session Markdown export.
- Local handoff export for continuing work in a new Codex conversation.
- Lightweight current-page Timeline / jump points.

### Advanced repair and plugin visibility

- Plugin entry visibility repair from the advanced area.
- Plugin install-button visibility repair from the advanced area.
- Plain-language failure messages.
- No “crack”, “bypass”, or forced-install product language.

### Update and release evidence

- Check for updates.
- User-confirmed install update path.
- Install / uninstall smoke validation.
- Real Codex state validation.
- Real Codex UI validation for `takeover_injection` or `takeover_compatibility`.
- npm package dry-run validation.
- Privacy-path and stale-copy scanning.

## What is intentionally not included

v0.2.5 intentionally does not include:

- EXE installer.
- Full Codex++ parity.
- macOS production support.
- Plugin market.
- Universal page enhancement guarantee.
- Batch delete.
- Silent forced updates.
- Startup registration.
- Cloud sync.
- Automatic provider switching.
- Automatic `base_url` changes.
- Login-method switching.
- Rewriting old `encrypted_content`.
- A promise that every missing history item can be recovered.

These are not accidental omissions. They are release boundaries for a safer first public version.

## Safety boundaries

Codex Pro v0.2.5 is local-first.

It does not upload:

- Codex history.
- Account data.
- `auth.json`.
- Local tokens or keys.
- Old encrypted session content.

It does not automatically modify:

- `model_provider`.
- `base_url`.
- Login method.
- Old `encrypted_content`.
- Message bodies.

Mutation-style operations should stay narrow and recoverable:

- Repair operations are scoped to history visibility and local recovery metadata.
- Delete is single-session only.
- Delete creates a snapshot first.
- Delete has an undo path.
- High-risk future actions must stay in the advanced area and require clear confirmation.

## Installation summary

Current first public release path:

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

After installation:

- Continue opening `Codex` normally.
- Use `历史` inside Codex when history looks incomplete.
- Use `Codex Pro.cmd` only for maintenance, rescue, diagnostics, update, or uninstall.

This release uses scripts plus a portable package. A `Codex-Pro-Setup-x64.exe` style installer is planned later, but is not part of v0.2.5.

## Upgrade / uninstall summary

Update:

- Check update from the advanced area or maintenance entry.
- Install update only after user confirmation.
- Reopen Codex after updating.
- Do not treat update as silent background replacement.

Uninstall:

- Restore the original Codex shortcut where possible.
- Remove Codex Pro-created maintenance entries.
- Do not delete Codex history by default.
- Do not delete history snapshots by default.
- Only remove tool-private data when the user explicitly requests data removal.

## Known limitations

- Full page enhancement depends on the current Codex Desktop environment.
- If page enhancement is unavailable, Codex Pro should fall back to compatibility mode instead of showing a hard failure.
- Restoring history visibility is not the same as decrypting old provider-bound content.
- If local history data is truly missing, Codex Pro cannot recreate it from nothing.
- Some planned Pro capabilities, such as project move support, are not part of v0.2.5.
- Windows is the supported first-release platform. macOS is later work.

## Compatibility mode explanation

Compatibility mode is a safe fallback, not a failed install.

When compatibility mode is active:

- The user can keep opening and using Codex.
- History protection can still run.
- Snapshots remain available.
- Repair history display remains available.
- Rebuild history index remains available.
- Restore latest snapshot remains available.
- The user should still follow the fixed recovery path:
  1. 修复历史显示
  2. 重建历史索引
  3. 打开高级修复

The release should be described as compatibility-ready: native page enhancement is used when available, and unsupported cases fall back to the local recovery path.

## Codex++ parity status

Codex++ is an important reference project. Codex Pro uses it as a product and mechanism reference, not as source code to copy.

v0.2.5 already covers or partially covers several high-demand areas:

- Local helper / bridge pattern.
- Native-entry takeover.
- Single-session delete.
- Delete undo.
- Markdown export.
- Provider visibility repair.
- History recovery.
- `session_index.jsonl` rebuild.
- Workspace roots repair.
- SQLite visibility repair.
- Handoff export.
- Update check / install.
- Windows shortcut recovery.
- Uninstall restoring the native entry.

v0.2.5 is not full Codex++ parity. The parity target continues in later releases, especially around polish, project move support, and longer-term stability.

Codex Pro's intended advantage is not “more buttons”. It is:

- More native daily entry: keep opening `Codex`.
- More native UI: `历史`, one card, one primary action, advanced folded area.
- More complete history recovery center.
- Clearer safety boundaries.
- Mature compatibility fallback.
- Stronger release evidence.
- Better fit for ordinary Windows users.

## Suggested GitHub release body

```md
# Codex Pro v0.2.5 — compatibility-ready history recovery for Codex Desktop

Codex Pro is an unofficial, local-first enhancement layer for Codex Desktop on Windows.

Install once, then keep opening `Codex` normally. If history looks incomplete, open `历史` and follow the fixed recovery path:

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

This release focuses on a credible first public path: history protection, recovery, delete undo, single-session Markdown export, local handoff export, plugin entry / install-button visibility repair from the advanced area, lightweight Timeline jump points, update check / install, and compatibility-mode fallback.

## Highlights

- Continue opening `Codex` normally after installation.
- Native-feeling `历史` entry when page enhancement is available.
- Compatibility mode when page enhancement is not available.
- History snapshots, repair, index rebuild, workspace roots repair, SQLite visibility repair, and provider visibility metadata repair.
- Single-session delete with snapshot and undo.
- Single-session Markdown export.
- Local handoff export for long-running work.
- Advanced-area plugin visibility repair and lightweight Timeline.
- Update check and user-confirmed install update path.
- Release evidence: tests, package dry-run, install / uninstall smoke, real Codex state validation, real Codex UI validation, and privacy-path scanning.

## Safety boundaries

Codex Pro does not upload local history, account data, `auth.json`, tokens, or old encrypted session content.

It does not automatically change `model_provider`, `base_url`, login method, or old `encrypted_content`.

It does not do batch delete, cloud sync, startup registration, silent forced updates, or plugin-market behavior.

## Not included in v0.2.5

- EXE installer.
- Full Codex++ parity.
- macOS production support.
- Universal page enhancement guarantee.
- Batch delete.
- Silent forced updates.
- Automatic provider / API / login switching.
- Rewriting old encrypted session content.

## Compatibility note

This release is compatibility-ready. When native page enhancement is available, Codex Pro integrates into Codex as a quiet `历史` repair path. When it is not available, Codex Pro falls back to compatibility mode and keeps the local recovery path available.

Codex Pro is not affiliated with OpenAI.
```

## 中文 release notes

```md
# Codex Pro v0.2.5 — Codex Desktop 历史恢复首个 compatibility-ready 公开版本

Codex Pro 是面向 Windows 的非官方、本地优先 Codex Desktop 增强层。

安装一次后，继续像平常一样打开 `Codex`。如果历史显示不完整，先在 Codex 内打开 `历史`，按固定三步处理：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

## 本版重点

- 保持普通用户主路径：继续打开 `Codex`。
- 支持原生入口接管和自动附着。
- 支持页面增强时，在 Codex 内显示原生感 `历史` 入口。
- 页面增强不可用时，进入兼容模式，继续保留本地历史保护和恢复路径。
- 提供历史快照、修复历史显示、重建索引、workspace roots 修复、SQLite 可见性修复和 provider 可见性 metadata 修复。
- 支持单会话删除、删除前快照和撤销。
- 支持单会话 Markdown 导出。
- 支持本地交接包，方便长任务重开或交给新对话继续。
- 高级区提供插件入口 / 安装按钮可见性修复和轻量 Timeline。
- 支持检查更新和用户确认后安装更新。
- 发布验证覆盖测试、pack 清单、安装 / 卸载 smoke、真实 Codex 状态验证、真实 Codex UI 验证和隐私路径扫描。

## 安全边界

Codex Pro 不上传你的历史、账号数据、`auth.json`、token、密钥或旧加密会话内容。

它不会自动修改：

- `model_provider`
- `base_url`
- 登录方式
- 旧会话里的 `encrypted_content`
- 对话正文

删除只做单会话删除，删除前会先快照，并提供撤销路径。

## 本版刻意不包含

- EXE 安装器
- 全量 Codex++ parity
- macOS 正式支持
- 插件市场
- 所有环境都能完整页面增强的承诺
- 批量删除
- 静默强制更新
- 开机自启
- 云同步
- 自动切 provider / API 地址 / 登录方式
- 重写旧加密会话内容

## 兼容模式说明

兼容模式不是安装失败。它表示当前 Codex Desktop 环境暂时不能完整挂载页面增强，但 Codex Pro 仍会保留历史保护、快照、修复历史显示、重建历史索引和恢复入口。

如果进入兼容模式，继续正常打开 `Codex`，并按固定三步处理历史问题即可。

Codex Pro 与 OpenAI 无隶属关系。
```

## English release notes

```md
# Codex Pro v0.2.5 — compatibility-ready history recovery for Codex Desktop

Codex Pro is an unofficial, local-first enhancement layer for Codex Desktop on Windows.

Install once, then keep opening `Codex` normally. If history looks incomplete, open `历史` and follow the fixed recovery path:

1. Repair history display
2. Rebuild the history index
3. Open advanced repair

## Highlights

- Keep the normal daily flow: open `Codex` as usual.
- Native-entry takeover and automatic attach where supported.
- Native-feeling `历史` entry inside Codex when page enhancement is available.
- Compatibility mode when page enhancement is not available.
- History snapshots, history display repair, index rebuild, workspace roots repair, SQLite visibility repair, and provider visibility metadata repair.
- Single-session delete with snapshot and undo.
- Single-session Markdown export.
- Local handoff export for continuing long-running work in a new conversation.
- Advanced-area plugin entry / install-button visibility repair and lightweight Timeline jump points.
- Update check and user-confirmed install update path.
- Release evidence covering tests, package dry-run, install / uninstall smoke, real Codex state validation, real Codex UI validation, and privacy-path scanning.

## Safety boundaries

Codex Pro does not upload local history, account data, `auth.json`, tokens, keys, or old encrypted session content.

It does not automatically modify:

- `model_provider`
- `base_url`
- login method
- old `encrypted_content`
- message bodies

Delete is single-session only, creates a snapshot first, and provides an undo path.

## Intentionally not included

- EXE installer
- Full Codex++ parity
- macOS production support
- Plugin market
- A guarantee that full page enhancement works in every environment
- Batch delete
- Silent forced updates
- Startup registration
- Cloud sync
- Automatic provider / API / login switching
- Rewriting old encrypted session content

## Compatibility mode

Compatibility mode is not a failed install. It means the current Codex Desktop environment cannot fully mount the page enhancement, but Codex Pro still keeps local history protection, snapshots, repair history display, rebuild history index, and restore paths available.

If compatibility mode is active, keep using Codex normally and follow the fixed recovery path.

Codex Pro is not affiliated with OpenAI.
```

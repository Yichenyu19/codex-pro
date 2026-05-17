# AI Operator Guide

This file is for AI assistants, coding agents, and automation tools working on this repository.

## Current Release Track (Read First)

The active product is `Codex Pro`.

Long-term product planning is centralized in `docs/codex-pro-product-spec.md`, `docs/codexplusplus-parity.md`, `docs/roadmap.md`, `docs/architecture-risk-register.md`, `docs/redaction-and-privacy.md`, `docs/internal-architecture-guidelines.md`, `docs/feedback-triage.md`, and `docs/v0.3-implementation-guardrails.md`. Treat those files as the planning source of truth before adding new feature surfaces.

Treat it as a lightweight Codex Desktop enhancement layer for Windows:

- ordinary users continue opening `Codex` normally
- desktop and start-menu `Codex` entries may be taken over to trigger the enhancement chain
- `Codex Pro.cmd` is a maintenance / rescue entry, not the daily primary path
- injected UI should feel like a quiet Codex-native history and repair capability
- compatibility mode is acceptable when injection is unavailable, as long as recovery actions remain clear

Do not reposition the project as:

- a Codex fork
- a plugin marketplace
- a general desktop manager
- a replacement shell for Codex
- a feature-heavy all-in-one enhancer

## Product Scope

The current implemented release slice already includes:

- history snapshots and restore latest snapshot
- sidebar workspace repair
- `session_index.jsonl` rebuild
- provider / SQLite visibility metadata repair
- history visibility diagnosis
- native-entry takeover
- local bridge for Codex Pro actions
- injected history / repair UI when supported
- compatibility-mode recovery when injection is unavailable
- single-session delete with snapshot and undo
- single-session Markdown export
- local handoff export
- plugin-entry / install-button visibility repair from the advanced area
- lightweight current-page Timeline
- low-noise update check and one-click install
- install / uninstall smoke validation

Anything outside this scope should still be treated as a later release idea unless it directly fixes a release blocker. Examples include project move support, a standalone EXE installer shell, or broader platform expansion.

## Safety Boundaries

Never add behavior that:

- automatically changes `model_provider`
- automatically changes `base_url`
- automatically changes login method
- rewrites old `encrypted_content`
- performs batch deletion
- deletes user history without a snapshot and an undo path
- introduces cloud sync
- introduces a complex database
- introduces a heavy or long-lived background service expansion
- breaks install / uninstall shortcut restoration

The legacy `codex-provider` CLI alias may remain for compatibility, but do not present it as the ordinary user path.

## Ordinary User Path

The ordinary user story is:

1. Install once.
2. Continue opening `Codex` normally.
3. If history is incomplete, use `历史`.
4. If automatic repair is not enough, follow the fixed recovery path:
   1. 修复历史显示
   2. 重建历史索引
   3. 打开高级修复
5. Use `Codex Pro.cmd` only for maintenance, rescue, diagnostics, or uninstall.

## Development Rules

- Prefer small, verified changes over broad rewrites.
- Do not move or delete files without explicit user confirmation.
- Do not introduce dependencies unless the release blocker cannot be solved otherwise.
- Keep ordinary UI copy free of first-layer engineering terms such as CDP, bridge, SQLite, rollout, and provider identity.
- Keep engineering details in logs, advanced diagnostics, and maintainer docs.
- Preserve existing snapshots, restore, undo, takeover, and uninstall recovery behavior.
- Do not claim universal injection; use the supported-environment / compatibility-mode wording.
- Do not auto-commit.

## Main Validation Commands

Use project scripts as the source of truth.

```powershell
npm test
node .\scripts\validate-install-smoke.mjs
node .\scripts\validate-history-continuity.mjs
node .\scripts\validate-real-codex-state.mjs
py .\scripts\validate-real-codex-ui.py
pwsh -File .\scripts\validate-release.ps1
npm pack --dry-run --json
```

If the current directory is not a Git repository, record that `git diff` cannot be audited. Do not invent a diff conclusion.

## Release Asset Rules

Before GitHub publication, verify that public files and package contents do not contain:

- local user paths
- temporary artifact directories
- real `.codex` data
- stale repository links
- old daily-entry instructions
- hidden promises that injection works everywhere

The package should not include `artifacts/`, `.trellis/`, `.workflow/`, desktop build outputs, test binaries, temporary `.tgz` files, or real user data.

## Reference Docs

Read these before release work:

- `README.md`
- `docs/codex-pro-product-spec.md`
- `docs/codexplusplus-parity.md`
- `docs/roadmap.md`
- `docs/architecture-risk-register.md`
- `docs/redaction-and-privacy.md`
- `docs/internal-architecture-guidelines.md`
- `docs/feedback-triage.md`
- `docs/v0.3-implementation-guardrails.md`
- `docs/release-notes-v0.2.5.md`
- `docs/quick-start-zh.txt`
- `docs/release-checklist.md`
- `docs/real-ui-validation.md`
- `.trellis/spec.md`
- `.trellis/tasks.md`
- `.trellis/workspace-journal.md`

`.trellis/` is local project memory. It is useful for agent continuity but should not be treated as the public user-facing product surface.


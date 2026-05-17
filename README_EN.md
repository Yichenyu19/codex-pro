<div align="center">

# Codex Pro

### Make local Codex Desktop history less likely to “look lost”, with a native-feeling and recoverable repair path on Windows.

![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
[![Node](https://img.shields.io/badge/node-24%2B-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

> `Codex Pro` is an unofficial, local-first enhancement layer for Codex Desktop. It is not affiliated with OpenAI, does not modify the Codex app bundle, and does not upload local history, account data, or `auth.json`.

It is not a new Codex, a plugin market, a cloud sync tool, or a provider manager. v0.2.5 focuses on one thing first: making local history safer, more recoverable, and easier to repair from the normal Codex flow.

Codex++ is an important reference project. Codex Pro will align with its high-demand capabilities in phases, but v0.2.5 is not full Codex++ parity and does not copy Codex++ source code.

## 30-Second Start

1. Install once:

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

2. **Keep opening `Codex` normally.**
3. If history looks incomplete, use the fixed recovery path:
   1. Repair history display
   2. Rebuild the history index
   3. Open advanced repair

`Codex Pro.cmd` is a maintenance / rescue entry only. It is not the daily primary path.

Safety boundaries are intentional: Codex Pro does not upload local history, account data, `auth.json`, or old encrypted session content; does not automatically change `model_provider`, `base_url`, or login method; does not rewrite old `encrypted_content`; and does not promise to recover history that no longer exists locally or decrypt old content across provider / account boundaries.

v0.2.5 is a **compatibility-ready first public release**: when page enhancement is available it integrates into Codex, and when it is not available it falls back to compatibility mode while keeping local protection, snapshots, repair, and index rebuild available. It is not an EXE installer and does not promise universal injection.

## What It Is

`Codex Pro` is a lightweight enhancement layer for Codex Desktop. The current public slice focuses on making history protection, recovery, delete undo, single-session Markdown export, local handoff export, advanced-area plugin entry / install-button visibility repair, and long-conversation jump points stable first; project moves and other Pro capabilities should land in later verified phases.

It does not replace Codex, fork Codex, or become a plugin market. It focuses on:

- session safety and recovery
- native-feeling history repair inside Codex when injection is available
- compatibility-mode fallback when injection is not available
- safe single-session delete with snapshot and undo
- single-session Markdown export from the advanced recovery area
- local handoff export for continuing work in a new Codex conversation
- plugin-entry and install-button visibility repair from the advanced area when Codex already exposes the relevant plugin UI in the page
- long-conversation jump points from the advanced area
- low-noise update prompts plus one-click install from the advanced area; reopen Codex after updating

It does not automatically change your:

- `model_provider`
- `base_url`
- login method

It also does not rewrite old `encrypted_content`.

## Daily Flow

For ordinary users, the flow is simple:

1. Install once
2. Continue opening `Codex` normally
3. If history is incomplete, repair it from inside Codex
4. If the current machine cannot inject, keep using compatibility mode and follow the fixed recovery path

Ordinary users can stop here. The rest is mainly for troubleshooting, release checks, and maintenance.

## For Maintainers / Advanced Users

## Low-Frequency Maintenance Commands

```powershell
codex-pro status
codex-pro snapshot
codex-pro repair-sidebar
codex-pro rebuild-index
codex-pro resume-fallback --query repair --limit 10
codex-pro restore-latest
codex-pro start-guard
codex-pro stop-guard
codex-pro guard-status
```

## Install And Uninstall

Install:

```powershell
pwsh -File .\scripts\Install-Codex-Pro.ps1
```

Uninstall:

```powershell
pwsh -File .\scripts\Uninstall-Codex-Pro.ps1
```

Uninstall restores taken-over native `Codex` shortcuts when possible. If a shortcut was created by Codex Pro, uninstall removes it. By default, uninstall does not delete your Codex history, snapshots, or repository files.

## Release Validation

Current first-release checks are:

```powershell
npm test
node .\scripts\validate-install-smoke.mjs
node .\scripts\validate-history-continuity.mjs
node .\scripts\validate-real-codex-state.mjs
py .\scripts\validate-real-codex-ui.py
pwsh -File .\scripts\validate-release.ps1
```

## Safety Boundaries

- No automatic `model_provider` changes.
- No automatic `base_url` changes.
- No automatic login-method changes.
- No rewrite of old `encrypted_content`.
- No batch delete.
- No cloud sync.
- No heavy or long-lived background service expansion.

## For AI Agents

The current release-track notes live in [AGENTS.md](AGENTS.md). The short version is:

- ordinary users continue opening `Codex` normally
- `Codex Pro.cmd` is maintenance / rescue only
- compatibility mode is acceptable when injection is unavailable
- ordinary UI should stay quiet and native-feeling

## License

MIT



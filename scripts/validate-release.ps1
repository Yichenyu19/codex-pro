param(
    [switch]$SkipRealUi,
    [switch]$SkipRealState
)

$ErrorActionPreference = "Stop"

function Assert-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Hint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "缺少命令：$Name。$Hint"
    }
}

function Invoke-NativeStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host $Title
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Title (exit code $LASTEXITCODE)"
    }
}

function Read-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "缺少验证产物：$Path"
    }

    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Assert-CommandExists -Name "node" -Hint "请先安装 Node.js 24+。"
Assert-CommandExists -Name "npm" -Hint "请先安装 npm。"
Assert-CommandExists -Name "py" -Hint "请先安装 Python 3.11+ 并确保 py 启动器可用。"

Invoke-NativeStep "[1/5] Running npm test..." {
    npm test
}

Invoke-NativeStep "[2/5] Running install/uninstall smoke validation..." {
    node ".\scripts\validate-install-smoke.mjs"
}

Invoke-NativeStep "[3/5] Running history continuity validation..." {
    node ".\scripts\validate-history-continuity.mjs"
}

if ($SkipRealState) {
    Write-Host "[4/5] Skipped real Codex state validation."
} else {
    Invoke-NativeStep "[4/5] Running real Codex state validation..." {
        node ".\scripts\validate-real-codex-state.mjs"
    }
}

if ($SkipRealUi) {
    Write-Host "[5/5] Skipped real Codex UI validation."
} else {
    Invoke-NativeStep "[5/5] Running real Codex UI validation..." {
        py ".\scripts\validate-real-codex-ui.py"
    }
}

$RealStateSummaryPath = Join-Path $RepoRoot "artifacts\real-codex-state\validation-summary.json"
$RealUiSummaryPath = Join-Path $RepoRoot "artifacts\real-codex\validation-summary.json"
$RealUiArtifactDir = Join-Path $RepoRoot "artifacts\real-codex"
$RealUiScreenshotPaths = @(
    (Join-Path $RealUiArtifactDir "real-codex-hover-delete-visible.png"),
    (Join-Path $RealUiArtifactDir "real-codex-repair-entry-open-panel.png"),
    (Join-Path $RealUiArtifactDir "real-codex-repair-entry-after-open-click.png")
)
$RealUiCompatibilityNotePath = Join-Path $RealUiArtifactDir "compatibility-note.txt"

if (-not $SkipRealState) {
    $RealStateSummary = Read-JsonFile -Path $RealStateSummaryPath
    $TakeoverReady = [bool]$RealStateSummary.takeover.normalOpenCodexReady
    $CompatibilityMode = [bool]$RealStateSummary.management.compatibilityMode
    Write-Host "Real state gate: takeoverReady=$TakeoverReady compatibilityMode=$CompatibilityMode"
    Write-Host "Real state recovery summary: $($RealStateSummary.recoveryPlan.summary)"

    if (-not $TakeoverReady) {
        if ($SkipRealUi) {
            throw "Release gate failed: 当前机器没有检测到被增强接管的 Codex 主入口，而且你还跳过了真实 UI takeover 验收，无法证明首发主路径成立。"
        }
        Write-Host "Real state note: 当前机器还不在已安装接管状态；首发主路径将以真实 UI takeover 验收产物为准。"
    }
}

if (-not $SkipRealUi) {
    $RealUiSummary = Read-JsonFile -Path $RealUiSummaryPath
    $UiMode = [string]$RealUiSummary.mode
    $LaunchPath = [string]$RealUiSummary.launchPath

    Write-Host "Real UI gate: launchPath=$LaunchPath mode=$UiMode"

    if ($LaunchPath -ne "takeover") {
        throw "Release gate failed: 真实 UI 验收没有走 takeover 主路径。"
    }

    if ($UiMode -notin @("takeover_injection", "takeover_compatibility")) {
        throw "Release gate failed: 真实 UI 验收模式不是 takeover_injection / takeover_compatibility。当前模式：$UiMode"
    }

    if (-not [bool]$RealUiSummary.takeoverEvidence.desktopTakenOver) {
        throw "Release gate failed: 桌面 Codex 快捷方式没有被成功接管。"
    }

    if (-not [bool]$RealUiSummary.takeoverEvidence.launcherStarted) {
        throw "Release gate failed: 被接管的 Codex 入口没有真正拉起自动附着链。"
    }

    if ($RealUiSummary.takeoverEvidence.PSObject.Properties.Name -contains "launchFallback") {
        throw "Release gate failed: takeover 验收仍依赖回退启动路径，主路径证据还不够硬。"
    }

    if ($UiMode -eq "takeover_injection") {
        foreach ($ScreenshotPath in $RealUiScreenshotPaths) {
            if (-not (Test-Path -LiteralPath $ScreenshotPath)) {
                throw "Release gate failed: 注入模式缺少真实页面截图产物：$ScreenshotPath"
            }
        }
        if (Test-Path -LiteralPath $RealUiCompatibilityNotePath) {
            throw "Release gate failed: 注入模式下仍残留 compatibility-note.txt，真实 UI 产物可能混杂。"
        }
        Write-Host "Release verdict: takeover 主路径注入通过，可按原生增强口径发版。"
    } else {
        if (-not $RealUiSummary.recoveryPlan -or -not $RealUiSummary.management -or -not $RealUiSummary.takeover) {
            throw "Release gate failed: takeover 兼容模式产物缺少 recoveryPlan / management / takeover 摘要。"
        }
        if (-not (Test-Path -LiteralPath $RealUiCompatibilityNotePath)) {
            throw "Release gate failed: 兼容模式缺少 compatibility-note.txt，无法证明本次没有采到新的注入页面截图。"
        }
        $RealUiAnyPngArtifacts = Get-ChildItem -Path $RealUiArtifactDir -Filter "real-codex*.png" -File -ErrorAction SilentlyContinue
        foreach ($PngArtifact in $RealUiAnyPngArtifacts) {
            throw "Release gate failed: 兼容模式下仍残留真实注入截图，产物可能混入旧结果：$($PngArtifact.FullName)"
        }
        Write-Host "Release verdict: takeover 主路径以兼容模式通过，可按兼容模式继续可用的口径发版。"
    }
}

Write-Host ""
Write-Host "Release validation passed."
Write-Host "Install smoke artifacts: $RepoRoot\artifacts\install-smoke"
Write-Host "History continuity artifacts: $RepoRoot\artifacts\history-continuity"
Write-Host "Real state artifacts: $RepoRoot\artifacts\real-codex-state"
Write-Host "Real UI artifacts: $RepoRoot\artifacts\real-codex"

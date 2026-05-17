param(
    [string]$DesktopPath,
    [string]$StartMenuPath,
    [switch]$SkipInstallDependencies,
    [switch]$SkipPythonSetup,
    [switch]$SkipGuardBootstrap
)

$ErrorActionPreference = 'Stop'

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

function Invoke-NativeCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    $output = & $FilePath @ArgumentList 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $detail = ($output | Out-String).Trim()
        if ($detail) {
            throw "$FailureMessage`n$detail"
        }
        throw $FailureMessage
    }
    return ($output | Out-String).TrimEnd()
}

function Invoke-NativeQuiet {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    $null = Invoke-NativeCapture -FilePath $FilePath -ArgumentList $ArgumentList -FailureMessage $FailureMessage
}

function Get-UiModeLabel {
    param(
        [string]$UiIntegrationMode
    )

    switch ($UiIntegrationMode) {
        'injected_ready' { return '原生增强已就绪' }
        'injected_repair_available' { return '原生增强已就绪（已准备好修复入口）' }
        'compatibility_ready' { return '兼容模式继续可用' }
        'compatibility_repair_needed' { return '兼容模式继续可用（建议先修复历史显示）' }
        'diagnosis_unknown_ready' { return '已安装，等待本机确认' }
        'diagnosis_unknown_repair_needed' { return '已安装，等待本机确认（建议先修复历史显示）' }
        default { return '已安装' }
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Desktop = if ($DesktopPath) { $DesktopPath } else { [Environment]::GetFolderPath('Desktop') }
$ProgramsRoot = if ($StartMenuPath) { $StartMenuPath } else { [Environment]::GetFolderPath('Programs') }
$StartMenuDir = Join-Path $ProgramsRoot 'Codex Pro'
$LauncherPath = Join-Path $Desktop 'Codex Pro.cmd'
$StartMenuLauncherPath = Join-Path $StartMenuDir 'Open Codex Pro.cmd'
$DoctorPath = Join-Path $StartMenuDir 'History Check.cmd'
$RepairPath = Join-Path $StartMenuDir 'Repair History.cmd'
$UpdatePath = Join-Path $StartMenuDir 'Update Codex Pro.cmd'
$DiagnoseInjectionPath = Join-Path $StartMenuDir 'Injection Check.cmd'
$GuardStatusPath = Join-Path $StartMenuDir 'Protection Status.cmd'
$UninstallPath = Join-Path $StartMenuDir 'Uninstall.cmd'
$QuickStartPath = Join-Path $StartMenuDir 'Quick Start.txt'
$TakeoverResultPath = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-pro-takeover-" + [guid]::NewGuid().ToString() + ".json")

Set-Location $RepoRoot
New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null

Assert-CommandExists -Name "node" -Hint "请先安装 Node.js 24+ 并确保 node 在 PATH 中。"
Assert-CommandExists -Name "pwsh" -Hint "请先安装 PowerShell 7。"
if (-not $SkipInstallDependencies) {
    Assert-CommandExists -Name "npm" -Hint "请先安装 npm，并确保 npm 在 PATH 中。"
    Write-Host "Installing dependencies..."
    Invoke-NativeQuiet -FilePath "npm" -ArgumentList @("install") -FailureMessage "安装 Node.js 依赖失败。"
}
if (-not $SkipPythonSetup) {
    Assert-CommandExists -Name "py" -Hint "请先安装 Python 3.11+，并确保 py 启动器可用。"
    Write-Host "Preparing Python launcher..."
    Invoke-NativeQuiet -FilePath "py" -ArgumentList @("-m", "pip", "install", "-r", "$RepoRoot\launcher-python\requirements.txt") -FailureMessage "安装 Python launcher 依赖失败。"
}

Write-Host "Creating maintenance launcher..."
$launcher = @"
@echo off
setlocal
py "$RepoRoot\launcher-python\launcher.py"
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $LauncherPath -Value $launcher -Encoding ASCII

$startMenuLauncher = @"
@echo off
setlocal
call "$LauncherPath"
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $StartMenuLauncherPath -Value $startMenuLauncher -Encoding ASCII

$doctorLauncher = @"
@echo off
setlocal
node "$RepoRoot\src\cli.js" codex-pro doctor
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $DoctorPath -Value $doctorLauncher -Encoding ASCII

$repairLauncher = @"
@echo off
setlocal
node "$RepoRoot\src\cli.js" codex-pro repair-sidebar
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $RepairPath -Value $repairLauncher -Encoding ASCII

$updateLauncher = @"
@echo off
setlocal
node "$RepoRoot\src\cli.js" codex-pro update
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $UpdatePath -Value $updateLauncher -Encoding ASCII

$diagnoseInjectionLauncher = @"
@echo off
setlocal
py "$RepoRoot\launcher-python\launcher.py" --diagnose-cdp
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $DiagnoseInjectionPath -Value $diagnoseInjectionLauncher -Encoding ASCII

$guardStatusLauncher = @"
@echo off
setlocal
node "$RepoRoot\src\cli.js" codex-pro guard-status
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $GuardStatusPath -Value $guardStatusLauncher -Encoding ASCII

$quickStartSource = Join-Path $RepoRoot 'docs\quick-start-zh.txt'
Copy-Item -LiteralPath $quickStartSource -Destination $QuickStartPath -Force

$uninstallLauncher = @"
@echo off
setlocal
pwsh -File "$RepoRoot\scripts\Uninstall-Codex-Pro.ps1"
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $UninstallPath -Value $uninstallLauncher -Encoding ASCII

Write-Host "正在接管原生 Codex 入口..."
Invoke-NativeQuiet -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "takeover-install", "--desktop-path", "$Desktop", "--start-menu-path", "$ProgramsRoot") -FailureMessage "接管原生 Codex 入口失败。"
$TakeoverStatusJson = Invoke-NativeCapture -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "takeover-status", "--desktop-path", "$Desktop", "--start-menu-path", "$ProgramsRoot", "--json") -FailureMessage "读取 Codex 入口接管状态失败。"
$TakeoverStatus = $TakeoverStatusJson | ConvertFrom-Json

if (-not $SkipGuardBootstrap) {
    Write-Host "正在启动本地轻量守护..."
    Invoke-NativeQuiet -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "start-guard") -FailureMessage "启动本地轻量守护失败。"

    Write-Host "正在做首次历史检查..."
    $DoctorJson = Invoke-NativeCapture -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "doctor", "--json") -FailureMessage "首次历史体检失败。"
    $DoctorResult = $DoctorJson | ConvertFrom-Json

    Write-Host "正在创建首次历史快照..."
    Invoke-NativeQuiet -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "snapshot") -FailureMessage "创建首次历史快照失败。"
}
else {
    $DoctorJson = Invoke-NativeCapture -FilePath "node" -ArgumentList @("$RepoRoot\src\cli.js", "codex-pro", "doctor", "--json") -FailureMessage "读取当前历史状态失败。"
    $DoctorResult = $DoctorJson | ConvertFrom-Json
}

$TakeoverReady = [bool]$TakeoverStatus.desktopTakenOver -or [bool]$TakeoverStatus.startMenuTakenOver
$PrimaryEntry = if ($TakeoverReady) { "Codex（继续像平常一样打开）" } else { "Codex（当前暂未接管；维护入口临时可用）" }
$ModeLabel = Get-UiModeLabel -UiIntegrationMode $DoctorResult.uiIntegrationMode
$NextAction = if ($TakeoverReady) {
    if ($DoctorResult.historyVisibility.severity -and $DoctorResult.historyVisibility.severity -ne 'ok') {
        '继续打开 Codex；如果历史不完整，先点“修复历史显示”，再点“重建历史索引”。'
    }
    elseif ($DoctorResult.uiIntegrationMode -like 'compatibility_*') {
        '继续正常打开 Codex；如果历史没显示完整，按“修复历史显示 -> 重建历史索引 -> 打开高级修复”处理。'
    }
    else {
        '继续正常打开 Codex 即可；平时不需要改用新的日常入口。'
    }
}
else {
    '先用维护入口临时启动；确认已安装 Codex 后，重新运行安装脚本会再次尝试创建并接管原生 Codex 入口。'
}

Write-Host ""
Write-Host "安装完成。"
Write-Host ""
Write-Host "当前状态：$ModeLabel"
Write-Host "日常入口：$PrimaryEntry"
Write-Host "下一步：$NextAction"
Write-Host "日志位置：$HOME\.codex-pro\launcher.log"
Write-Host ""
Write-Host "安全边界：不会改 provider、base_url、登录方式或 encrypted_content。"
Write-Host "维护入口：$LauncherPath（只在修复、更新、卸载或排障时使用）"
Write-Host "高级入口：开始菜单 Codex Pro 文件夹（Repair History / Protection Status / Update Codex Pro / Injection Check / Uninstall）"
Write-Host ""
Write-Host "固定恢复路径：修复历史显示 -> 重建历史索引 -> 打开高级修复"
Write-Host ""
Write-Host "入口状态："
Write-Host "  - 桌面 Codex 已接管：$(if ($TakeoverStatus.desktopTakenOver) { '是' } else { '否' })"
Write-Host "  - 开始菜单 Codex 已接管：$(if ($TakeoverStatus.startMenuTakenOver) { '是' } else { '否' })"
Write-Host ""
Write-Host "开始菜单高级入口："
Write-Host "  文件夹：$StartMenuDir"
Write-Host "  修复：$RepairPath"
Write-Host "  更新：$UpdatePath"
Write-Host "  状态：$GuardStatusPath"
Write-Host "  诊断：$DoctorPath"
Write-Host "  注入诊断：$DiagnoseInjectionPath"
Write-Host "  卸载：$UninstallPath"
Write-Host "  快速开始：$QuickStartPath"
Write-Host ""
Write-Host "高级排障信息（普通用户平时不用看）："
Write-Host "  启动器日志：$HOME\.codex-pro\launcher.log"
Write-Host "  注入诊断缓存：$HOME\.codex-pro\cdp-diagnosis.json"
Write-Host ""
Write-Host "如果要手动排查，请先在 Codex 内打开“历史”；仍不完整时再使用开始菜单里的 Repair History、Protection Status 和 Injection Check。"


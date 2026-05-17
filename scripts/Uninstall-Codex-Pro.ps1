param(
    [string]$DesktopPath,
    [string]$StartMenuPath,
    [switch]$SkipStopGuard,
    [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'

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
$DataRoot = Join-Path $HOME '.codex-pro'

Set-Location $RepoRoot

if (-not $SkipStopGuard) {
    Write-Host "正在停止本地轻量守护..."
    node "$RepoRoot\src\cli.js" codex-pro stop-guard
}

Write-Host "正在恢复原生 Codex 入口..."
node "$RepoRoot\src\cli.js" codex-pro takeover-remove

if (Test-Path -LiteralPath $LauncherPath) {
    Remove-Item -LiteralPath $LauncherPath -Force
    Write-Host "已移除维护入口：$LauncherPath"
}

foreach ($Item in @(
    @{ Path = $StartMenuLauncherPath; Label = "已移除开始菜单维护入口" },
    @{ Path = $DoctorPath; Label = "已移除历史检查入口" },
    @{ Path = $RepairPath; Label = "已移除修复入口" },
    @{ Path = $UpdatePath; Label = "已移除更新入口" },
    @{ Path = $DiagnoseInjectionPath; Label = "已移除注入检查入口" },
    @{ Path = $GuardStatusPath; Label = "已移除保护状态入口" },
    @{ Path = $UninstallPath; Label = "已移除卸载入口" },
    @{ Path = $QuickStartPath; Label = "已移除快速开始说明" }
)) {
    if (Test-Path -LiteralPath $Item.Path) {
        Remove-Item -LiteralPath $Item.Path -Force
        Write-Host "$($Item.Label): $($Item.Path)"
    }
}

if (Test-Path -LiteralPath $StartMenuDir) {
    $Remaining = Get-ChildItem -LiteralPath $StartMenuDir -Force -ErrorAction SilentlyContinue
    if (-not $Remaining) {
        Remove-Item -LiteralPath $StartMenuDir -Force
        Write-Host "已移除开始菜单 Codex Pro 文件夹：$StartMenuDir"
    }
}

if ($RemoveData -and (Test-Path -LiteralPath $DataRoot)) {
    Remove-Item -LiteralPath $DataRoot -Force -Recurse
    Write-Host "已按 -RemoveData 清理 Codex Pro 私有数据：$DataRoot"
}

Write-Host ""
Write-Host "卸载完成。"
Write-Host "当前状态：已恢复原生 Codex 入口，并移除 Codex Pro 创建的维护入口。"
Write-Host "保留内容：Codex 历史、历史快照和仓库代码默认保留。"
if ($RemoveData) {
    Write-Host "工具数据：已按 -RemoveData 清理 Codex Pro 私有日志和数据。"
}
else {
    Write-Host "工具数据：未清理；只有显式使用 -RemoveData 才会删除 Codex Pro 私有日志和数据。"
}
Write-Host "下一步：继续像平常一样打开 Codex。"


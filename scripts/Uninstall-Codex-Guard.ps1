param(
    [string]$DesktopPath,
    [string]$StartMenuPath,
    [switch]$SkipStopGuard,
    [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'
$NextScript = Join-Path $PSScriptRoot 'Uninstall-Codex-Pro.ps1'
Write-Host 'Uninstall-Codex-Guard.ps1 is kept for compatibility. Delegating to Uninstall-Codex-Pro.ps1...'
& $NextScript @PSBoundParameters

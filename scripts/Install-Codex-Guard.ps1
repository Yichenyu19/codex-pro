param(
    [string]$DesktopPath,
    [string]$StartMenuPath,
    [switch]$SkipInstallDependencies,
    [switch]$SkipPythonSetup,
    [switch]$SkipGuardBootstrap
)

$ErrorActionPreference = 'Stop'
$NextScript = Join-Path $PSScriptRoot 'Install-Codex-Pro.ps1'
Write-Host 'Install-Codex-Guard.ps1 is kept for compatibility. Delegating to Install-Codex-Pro.ps1...'
& $NextScript @PSBoundParameters

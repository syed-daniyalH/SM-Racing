[CmdletBinding()]
param(
    [string]$RuntimeBackendPath = "C:\Users\Tech\Desktop\Alex Racing\apps\backend",
    [string]$TrackedBackendPath = "C:\Users\Tech\Desktop\Alex Racing\apps\frontend\backend",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $RuntimeBackendPath)) {
    throw "Runtime backend path not found: $RuntimeBackendPath"
}

if (-not (Test-Path -LiteralPath $TrackedBackendPath)) {
    throw "Tracked backend path not found: $TrackedBackendPath"
}

$roboArgs = @(
    $RuntimeBackendPath
    $TrackedBackendPath
    "/E"
    "/R:1"
    "/W:1"
    "/XD", "__pycache__", ".pytest_cache", "logs"
    "/XF", ".env", "*.pyc"
)

if ($DryRun) {
    $roboArgs += "/L"
}

Write-Host "Syncing runtime backend into tracked backend..."
Write-Host "Source: $RuntimeBackendPath"
Write-Host "Target: $TrackedBackendPath"
if ($DryRun) {
    Write-Host "Mode: dry-run"
}

& robocopy @roboArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ge 8) {
    throw "Robocopy failed with exit code $exitCode"
}

Write-Host "Sync complete."

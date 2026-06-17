#!/usr/bin/env pwsh
#Requires -PSEdition Desktop
#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

function Write-Info  { Write-Host "✓ $($args -join ' ')" -ForegroundColor Green }
function Write-Warn  { Write-Host "⚠ $($args -join ' ')" -ForegroundColor Yellow }
function Write-Error { Write-Host "✗ $($args -join ' ')" -ForegroundColor Red; exit 1 }

# ── Install bun if missing ───────────────────────────────────────────────────
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Info 'Bun not found — installing...'
  try {
    $null = & powershell -NoProfile -Command "irm bun.sh/install.ps1 | iex" 2>&1
  } catch {
    Write-Error "Bun install failed: $($_.Exception.Message)"
  }
  # Refresh PATH so bun is available immediately
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') +
              ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Error 'Bun installed but not found in PATH. Restart your shell and try again.'
  }
  Write-Info "Bun $(& bun --version) installed"
} else {
  Write-Info "Bun $(& bun --version) found"
}

# ── Install clew-code ───────────────────────────────────────────────────────
Write-Info 'Installing clew-code via bun...'
# --ignore-scripts skips sharp (from @xenova/transformers) install script,
# which fails on Node.js <14 or missing build tools. clew imports sharp
# dynamically — it's only needed for image/ComputerUse features.
& bun install -g clew-code --ignore-scripts

Write-Host "`nDone! Run clew to start." -ForegroundColor Green

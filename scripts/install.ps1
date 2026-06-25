#!/usr/bin/env pwsh
#Requires -PSEdition Desktop

$ErrorActionPreference = 'Stop'

function Write-Info { Write-Host "[OK] $($args -join ' ')" -ForegroundColor Green }
function Write-Warn { Write-Host "[!] $($args -join ' ')" -ForegroundColor Yellow }
function Write-Fail {
  Write-Host "[X] $($args -join ' ')" -ForegroundColor Red
  exit 1
}

function Split-PathList([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return @()
  }
  return $PathValue.Split([IO.Path]::PathSeparator) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { $_.Trim().Trim('"').TrimEnd('\') }
}

function Test-PathListContains([string]$PathValue, [string]$Needle) {
  if ([string]::IsNullOrWhiteSpace($Needle)) {
    return $false
  }
  $normalizedNeedle = $Needle.Trim().Trim('"').TrimEnd('\')
  foreach ($entry in (Split-PathList $PathValue)) {
    if ([string]::Equals($entry, $normalizedNeedle, [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

function Get-BunGlobalBin {
  try {
    $bin = (& bun pm bin -g 2>$null | Select-Object -First 1).Trim()
    if (-not [string]::IsNullOrWhiteSpace($bin)) {
      return $bin
    }
  } catch {
    # Fall through to Bun's default Windows global bin.
  }
  return (Join-Path $env:USERPROFILE '.bun\bin')
}

function Get-ClewCommandPath([string]$BinDir) {
  $command = Get-Command clew -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($name in @('clew.cmd', 'clew.exe', 'clew')) {
    $candidate = Join-Path $BinDir $name
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Get-ClewVersion([string]$CommandPath) {
  if ([string]::IsNullOrWhiteSpace($CommandPath)) {
    return 'unknown'
  }

  try {
    $versionOutput = (& $CommandPath --version 2>$null | Select-Object -First 1).Trim()
    if (-not [string]::IsNullOrWhiteSpace($versionOutput)) {
      return $versionOutput
    }
  } catch {
    # Keep installer completion non-fatal if version probing fails.
  }

  return 'unknown'
}

Write-Host 'Setting up Clew Code...'
Write-Host ''

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Info 'Bun not found - installing...'
  try {
    $null = & powershell -NoProfile -Command 'irm bun.sh/install.ps1 | iex' 2>&1
  } catch {
    Write-Fail "Bun install failed: $($_.Exception.Message)"
  }

  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') +
    [IO.Path]::PathSeparator +
    [Environment]::GetEnvironmentVariable('Path', 'Machine')

  $bunDefaultBin = Join-Path $env:USERPROFILE '.bun\bin'
  if (-not (Test-PathListContains $env:Path $bunDefaultBin)) {
    $env:Path = "$bunDefaultBin$([IO.Path]::PathSeparator)$env:Path"
  }

  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Fail 'Bun installed but was not found in PATH. Restart your shell and try again.'
  }
}

Write-Info "Bun $(& bun --version) found"
Write-Info 'Installing clew-code via Bun...'

# --ignore-scripts skips sharp (from @xenova/transformers) install script,
# which is only needed for image/ComputerUse features and can fail on machines
# without native build tooling.
& bun install -g clew-code --ignore-scripts

$bunGlobalBin = Get-BunGlobalBin
if (-not (Test-PathListContains $env:Path $bunGlobalBin)) {
  $env:Path = "$bunGlobalBin$([IO.Path]::PathSeparator)$env:Path"
}

$clewPath = Get-ClewCommandPath $bunGlobalBin
if ([string]::IsNullOrWhiteSpace($clewPath)) {
  Write-Fail "clew-code installed, but the clew command was not found in $bunGlobalBin."
}

$clewVersion = Get-ClewVersion $clewPath

Write-Host ''
Write-Host 'Clew Code successfully installed!' -ForegroundColor Green
Write-Host ''
Write-Host "  Version:  $clewVersion"
Write-Host "  Location: $clewPath"
Write-Host ''
Write-Host '  Next: Run clew --help to get started'
Write-Host ''

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$isOnPermanentPath =
  (Test-PathListContains $userPath $bunGlobalBin) -or
  (Test-PathListContains $machinePath $bunGlobalBin)

if (-not $isOnPermanentPath) {
  Write-Warn 'Setup notes:'
  Write-Host "  - Native installation exists but $bunGlobalBin is not in your PATH."
  Write-Host '    Add it via System Properties -> Environment Variables -> User PATH -> New.'
  Write-Host '    Then restart your terminal.'
  Write-Host ''
}

Write-Host 'Installation complete!' -ForegroundColor Green

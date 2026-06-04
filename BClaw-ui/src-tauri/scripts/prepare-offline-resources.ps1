# Prepare offline bundled resources for BClaw
# Run this before building the Tauri app for fully offline deployment
#
# Usage:
#   .\prepare-offline-resources.ps1              # Default: prod skills
#   .\prepare-offline-resources.ps1 -Env dev     # Use dev skills
#   .\prepare-offline-resources.ps1 -Env prod    # Use prod skills

param(
    [ValidateSet("prod", "dev")]
    [string]$Env = "prod"
)

$ErrorActionPreference = "Stop"
$ResourcesDir = Join-Path $PSScriptRoot ".." "resources"
$NodeVersion = "22.12.0"

function Write-Step($msg) {
    Write-Host "[prepare] $msg" -ForegroundColor Cyan
}

# ── 1. Prepare Node.js ──────────────────────────────────────
$NodeDir = Join-Path $ResourcesDir "node"
$NodeExe = Join-Path $NodeDir "node.exe"

if (Test-Path $NodeExe) {
    Write-Step "Node.js already bundled at $NodeDir"
} else {
    Write-Step "Downloading Node.js v$NodeVersion ..."
    New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null

    $ZipUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    $ZipPath = Join-Path $NodeDir "node.zip"

    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
    Expand-Archive -Path $ZipPath -DestinationPath $NodeDir -Force
    Remove-Item $ZipPath

    # Move extracted contents up one level
    $Extracted = Join-Path $NodeDir "node-v$NodeVersion-win-x64"
    if (Test-Path $Extracted) {
        Get-ChildItem $Extracted | Move-Item -Destination $NodeDir -Force
        Remove-Item $Extracted
    }

    if (Test-Path $NodeExe) {
        Write-Step "Node.js bundled successfully"
    } else {
        throw "Node.js bundle failed - node.exe not found"
    }
}

# ── 2. Prepare openclaw ─────────────────────────────────────
$OpenclawDir = Join-Path $ResourcesDir "openclaw"
$OpenclawMjs = Join-Path $OpenclawDir "openclaw.mjs"

if (Test-Path $OpenclawMjs) {
    Write-Step "openclaw already bundled at $OpenclawDir"
} else {
    # Auto-detect openclaw source from repo root
    $RepoRoot = Resolve-Path (Join-Path $PSScriptRoot ".." ".." "..")
    $SourceCandidates = @(
        (Join-Path $RepoRoot "openclaw.mjs"),
        (Join-Path $RepoRoot "packages" "openclaw" "openclaw.mjs")
    )

    $SourceDir = $null
    foreach ($c in $SourceCandidates) {
        if (Test-Path $c) {
            $SourceDir = Split-Path $c -Parent
            break
        }
    }

    if (-not $SourceDir) {
        throw "Cannot find openclaw source. Expected openclaw.mjs at repo root."
    }

    Write-Step "Bundling openclaw from $SourceDir ..."

    # Ensure dependencies are installed and built
    if (-not (Test-Path (Join-Path $SourceDir "node_modules"))) {
        Write-Step "Running npm install in openclaw source..."
        Push-Location $SourceDir
        try {
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        } finally {
            Pop-Location
        }
    }

    # Check if build is needed (look for dist/ or similar)
    # openclaw.mjs might be source or built - copy everything to be safe
    Write-Step "Copying openclaw to bundled resources..."
    New-Item -ItemType Directory -Force -Path $OpenclawDir | Out-Null

    # Use robocopy for reliable directory mirroring
    $ExcludeDirs = "node_modules", ".git", ".github", "test", "tests", "docs", ".claude"
    $RobocopyArgs = @("/MIR", "/R:2", "/W:1", "/XD") + $ExcludeDirs + @($SourceDir, $OpenclawDir)
    & robocopy @RobocopyArgs | Out-Null

    # Copy node_modules separately (needed for runtime)
    $SourceNodeModules = Join-Path $SourceDir "node_modules"
    $TargetNodeModules = Join-Path $OpenclawDir "node_modules"
    if (Test-Path $SourceNodeModules) {
        Write-Step "Copying node_modules (this may take a while)..."
        New-Item -ItemType Directory -Force -Path $TargetNodeModules | Out-Null
        # Use robocopy with /E for subdirectories, exclude heavy dev-only packages if needed
        & robocopy $SourceNodeModules $TargetNodeModules /E /R:2 /W:1 /XD "@types" ".bin" | Out-Null
    }

    if (Test-Path $OpenclawMjs) {
        Write-Step "openclaw bundled successfully"
    } else {
        throw "openclaw bundle failed - openclaw.mjs not found"
    }
}

# ── 3. Prepare skills for target environment ────────────────
$SkillsSource = Join-Path $ResourcesDir "skills" $Env
$SkillsPack = Join-Path $ResourcesDir "skills" ".pack"

if (Test-Path $SkillsSource) {
    Write-Step "Preparing skills for environment '$Env' ..."
    if (Test-Path $SkillsPack) {
        Remove-Item -Recurse -Force $SkillsPack
    }
    New-Item -ItemType Directory -Force -Path $SkillsPack | Out-Null
    Copy-Item -Path (Join-Path $SkillsSource "*") -Destination $SkillsPack -Recurse -Force
    Write-Step "Skills staged at $SkillsPack"
} else {
    Write-Warning "Skills directory not found: $SkillsSource"
}

# ── Summary ─────────────────────────────────────────────────
Write-Host ""
Write-Host "Offline resources ready!" -ForegroundColor Green
Write-Host "  Node.js:  $NodeExe"
Write-Host "  openclaw: $OpenclawMjs"
if (Test-Path $SkillsPack) {
    Write-Host "  skills:   $SkillsPack (env=$Env)"
}
Write-Host ""
Write-Host "Next step: run 'npm run tauri build' to create the installer."
Write-Host ""
Write-Host "NOTE: To bundle ONLY the '$Env' skills, update tauri.conf.json:" -ForegroundColor Yellow
Write-Host '  "resources/skills/.pack": "skills"' -ForegroundColor Yellow
Write-Host "Or keep the default 'resources/skills' to include both dev and prod at runtime." -ForegroundColor DarkGray

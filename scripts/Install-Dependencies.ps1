[CmdletBinding()]
param(
  [switch] $WithContentEngine,
  [switch] $WithPublisher,
  [switch] $SkipBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot "runtime\remotion"
$vendorRoot = Join-Path $repoRoot ".vendor"
New-Item -ItemType Directory -Path $vendorRoot -Force | Out-Null

# CN: Remotion 依赖保留在独立运行时目录。
# EN: Keep Remotion dependencies isolated inside the bundled runtime.
Push-Location $runtimeRoot
try {
  npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "Remotion dependency installation failed" }
} finally {
  Pop-Location
}

if ($WithContentEngine) {
  $contentRoot = Join-Path $vendorRoot "cheat-on-content"
  if (-not (Test-Path -LiteralPath $contentRoot)) {
    git clone https://github.com/XBuilderLAB/cheat-on-content.git $contentRoot
    if ($LASTEXITCODE -ne 0) { throw "Content engine clone failed" }
  }
}

if ($WithPublisher) {
  & (Join-Path $PSScriptRoot "Install-SocialAutoUpload.ps1") -ToolRoot (Join-Path $vendorRoot "social-auto-upload") -SkipBrowser:$SkipBrowser
}

[ordered]@{
  runtime = $runtimeRoot
  content_engine = if ($WithContentEngine) { Join-Path $vendorRoot "cheat-on-content" } else { $null }
  publisher = if ($WithPublisher) { Join-Path $vendorRoot "social-auto-upload" } else { $null }
} | ConvertTo-Json -Depth 4

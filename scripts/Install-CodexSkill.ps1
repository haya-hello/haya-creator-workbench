[CmdletBinding()]
param(
  [string] $DestinationRoot = (Join-Path $env:USERPROFILE ".codex\skills"),
  [switch] $Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $DestinationRoot "haya-creator-workbench"

if ((Test-Path -LiteralPath $destination) -and -not $Force) {
  throw "目标已存在，请使用 -Force 更新 / Destination exists; use -Force to update: $destination"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
$trackedFiles = & git -C $repoRoot ls-files
if ($LASTEXITCODE -ne 0 -or -not $trackedFiles) {
  throw "无法读取 Git 跟踪文件 / Unable to read tracked files"
}

# 中文：只安装 Git 已跟踪文件，避免复制素材、Cookie、缓存或本机配置。
# English: Install tracked files only, excluding footage, cookies, caches, and local configuration.
foreach ($relative in $trackedFiles) {
  $source = Join-Path $repoRoot $relative
  $target = Join-Path $destination $relative
  $targetParent = Split-Path -Parent $target
  if ($targetParent) { New-Item -ItemType Directory -Force -Path $targetParent | Out-Null }
  Copy-Item -LiteralPath $source -Destination $target -Force
}

[ordered] @{
  status = "installed"
  destination = $destination
  files = @($trackedFiles).Count
} | ConvertTo-Json

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $TaskRoot,

  [string] $Account = "creator",
  [string] $Title = "",
  [string] $Description = "",
  [string] $Tags = "",
  [string] $Thumbnail = "",
  [string] $Thumbnail4x3 = "",
  [string] $PredictionFile = "",
  [switch] $Force
)

$ErrorActionPreference = "Stop"

# 中文：发布包只引用正式成片，不复制或改写原始视频。
# English: A publish package references the approved final video without copying or modifying source media.
$task = (Resolve-Path -LiteralPath $TaskRoot).Path
$statePath = Join-Path $task ".naive-video-state.json"
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  throw "缺少任务状态文件 / Missing task state: $statePath"
}

$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string] $state.stage -ne "final_ready") {
  throw "只有 final_ready 任务可以建立发布包 / Only final_ready tasks can be packaged: $($state.stage)"
}

$finalReference = [string] $state.outputs.final
if (-not $finalReference) {
  throw "状态文件缺少 outputs.final / State is missing outputs.final"
}

$finalPath = if ([System.IO.Path]::IsPathRooted($finalReference)) {
  [System.IO.Path]::GetFullPath($finalReference)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $task $finalReference))
}
if (-not (Test-Path -LiteralPath $finalPath -PathType Leaf)) {
  throw "正式成片不存在 / Final video does not exist: $finalPath"
}

function Convert-ToTaskReference {
  param([string] $PathValue)

  if (-not $PathValue) {
    return $null
  }

  $resolved = if ([System.IO.Path]::IsPathRooted($PathValue)) {
    [System.IO.Path]::GetFullPath($PathValue)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $task $PathValue))
  }

  $taskPrefix = $task.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if ($resolved.StartsWith($taskPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolved.Substring($taskPrefix.Length).Replace('\', '/')
  }
  return $resolved.Replace('\', '/')
}

$publishDir = Join-Path $task "publish"
if (-not (Test-Path -LiteralPath $publishDir)) {
  New-Item -ItemType Directory -Path $publishDir | Out-Null
}

$manifestPath = Join-Path $publishDir "douyin.json"
$copyPath = Join-Path $publishDir "douyin-copy.md"
if ((Test-Path -LiteralPath $manifestPath) -and -not $Force) {
  throw "发布清单已存在；如需重建请显式使用 -Force / Manifest exists; use -Force to rebuild: $manifestPath"
}

$manifest = [ordered] @{
  schema_version = "1.0"
  platform = "douyin"
  account = $Account
  source = [ordered] @{
    task = $task.Replace('\', '/')
    state_file = ".naive-video-state.json"
    project_name = [string] $state.project_name
  }
  media = [ordered] @{
    video = Convert-ToTaskReference $finalPath
    thumbnail = Convert-ToTaskReference $Thumbnail
    thumbnail_4_3 = Convert-ToTaskReference $Thumbnail4x3
  }
  copy = [ordered] @{
    title = $Title
    description = $Description
    tags = @($Tags -split ',' | Where-Object { $_ } | ForEach-Object { $_.Trim().Trim("'", '"').TrimStart('#') })
  }
  publish = [ordered] @{
    schedule = $null
    declaration = $null
    browser_mode = "headed"
  }
  workflow = [ordered] @{
    require_prediction = $true
    prediction_file = Convert-ToTaskReference $PredictionFile
  }
  approval = [ordered] @{
    status = "draft"
    approved_at = $null
    approved_by = $null
  }
  result = [ordered] @{
    status = "not_started"
    attempted_at = $null
    log = $null
    published_url = $null
  }
  created_at = (Get-Date).ToString("s")
  updated_at = (Get-Date).ToString("s")
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$tagText = if ($manifest.copy.tags.Count -gt 0) {
  ($manifest.copy.tags | ForEach-Object { "#$_" }) -join " "
} else {
  "待填写"
}
$titleText = if ($Title) { $Title } else { "待填写" }
$descriptionText = if ($Description) { $Description } else { "待填写" }
$thumbnailText = if ($manifest.media.thumbnail) { [string] $manifest.media.thumbnail } else { "待制作或选择" }
$thumbnailLandscapeText = if ($manifest.media.thumbnail_4_3) { [string] $manifest.media.thumbnail_4_3 } else { "待制作或选择" }

$copyDocument = @"
# 抖音发布草案

## 标题

$titleText

## 简介

$descriptionText

## 话题

$tagText

## 发布资产

- 视频：$($manifest.media.video)
- 3:4 竖版封面：$thumbnailText
- 4:3 横版封面：$thumbnailLandscapeText
- 账号：$Account

## 发布闸门

- 当前状态：草案，尚未批准发布。
- 发布前必须补齐发布前预测，并把 `douyin.json` 中的 `approval.status` 改为 `approved`。
- 只有用户明确确认后，才可以运行带 `-ConfirmPublish` 的发布命令。
"@
$copyDocument | Set-Content -LiteralPath $copyPath -Encoding UTF8

[ordered] @{
  ok = $true
  task = $task
  manifest = $manifestPath
  copy = $copyPath
  stage = [string] $state.stage
  video = $finalPath
} | ConvertTo-Json -Depth 4

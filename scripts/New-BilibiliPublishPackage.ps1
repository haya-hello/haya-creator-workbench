[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $TaskRoot,

  [string] $Account = "creator",
  [string] $Title = "",
  [string] $Description = "",
  [string] $Tags = "",
  [int] $Tid = 208,
  [string] $Thumbnail = "",
  [switch] $Public,
  [switch] $Force
)

$ErrorActionPreference = "Stop"

# 中文：B 站发布包只引用已通过 QA 的正式成片，默认仅自己可见。
# English: A Bilibili package references a QA-approved final video and defaults to owner-only visibility.
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

$manifestPath = Join-Path $publishDir "bilibili.json"
$copyPath = Join-Path $publishDir "bilibili-copy.md"
if ((Test-Path -LiteralPath $manifestPath) -and -not $Force) {
  throw "发布清单已存在；如需重建请显式使用 -Force / Manifest exists; use -Force to rebuild: $manifestPath"
}

$manifest = [ordered] @{
  schema_version = "1.0"
  platform = "bilibili"
  account = $Account
  source = [ordered] @{
    task = $task.Replace('\', '/')
    state_file = ".naive-video-state.json"
    project_name = [string] $state.project_name
  }
  media = [ordered] @{
    video = Convert-ToTaskReference $finalPath
    thumbnail = Convert-ToTaskReference $Thumbnail
  }
  copy = [ordered] @{
    title = $Title
    description = $Description
    tags = @($Tags -split ',' | Where-Object { $_ } | ForEach-Object { $_.Trim().Trim("'", '"').TrimStart('#') })
  }
  publish = [ordered] @{
    tid = $Tid
    schedule = $null
    only_self = (-not $Public)
  }
  workflow = [ordered] @{
    default_action = "draft"
    require_explicit_publish = $true
    draft_capable_uploader_verified = $false
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
    published_id = $null
    published_url = $null
  }
  created_at = (Get-Date).ToString("s")
  updated_at = (Get-Date).ToString("s")
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$visibilityText = if ($manifest.publish.only_self) { "仅自己可见" } else { "公开投稿" }
$tagText = if ($manifest.copy.tags.Count -gt 0) { ($manifest.copy.tags | ForEach-Object { "#$_" }) -join " " } else { "待填写" }
$thumbnailText = if ($manifest.media.thumbnail) { [string] $manifest.media.thumbnail } else { "未指定" }
$copyDocument = @"
# B 站发布草案

## 标题

$(if ($Title) { $Title } else { "待填写" })

## 简介

$(if ($Description) { $Description } else { "待填写" })

## 标签

$tagText

## 发布资产

- 视频：$($manifest.media.video)
- 封面：$thumbnailText
- 账号：$Account
- 分区 ID：$Tid
- 可见性：$visibilityText

## 发布闸门

- 当前状态：草案，尚未批准投稿。
- 普通上传默认只停在草稿箱，不调用提交命令；当前 `biliup` 提交即创建稿件，不能把“仅自己可见”当成草稿。
- 只有用户明确说“替我投稿/发布 B 站”时，才允许带 `-ConfirmPublish` 提交；公开投稿还必须显式添加 `-ConfirmPublicPublish`。
- 只有用户明确确认后，才允许运行带 `-ConfirmPublish` 的投稿命令。
"@
$copyDocument | Set-Content -LiteralPath $copyPath -Encoding UTF8

[ordered] @{
  ok = $true
  task = $task
  manifest = $manifestPath
  copy = $copyPath
  stage = [string] $state.stage
  video = $finalPath
  only_self = [bool] $manifest.publish.only_self
} | ConvertTo-Json -Depth 4

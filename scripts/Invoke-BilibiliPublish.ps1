[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $Manifest,

  [ValidateSet("Validate", "AccountCheck", "Login", "Publish")]
  [string] $Action = "Validate",

  [string] $ToolRoot,
  [switch] $ConfirmLogin,
  [switch] $ConfirmPublish,
  [switch] $ConfirmPublicPublish
)

$ErrorActionPreference = "Stop"

if (-not $ToolRoot) {
  $ToolRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ".vendor\social-auto-upload"
}

# 中文：B 站投稿会直接创建平台内容，因此必须通过清单批准和显式确认。
# English: A Bilibili upload creates platform content directly, so manifest approval and explicit confirmation are mandatory.
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$publishDir = Split-Path -Parent $manifestPath
$taskRoot = Split-Path -Parent $publishDir
$data = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

$errors = New-Object System.Collections.Generic.List[string]
$blockers = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Resolve-TaskReference {
  param([string] $Reference)
  if (-not $Reference) { return $null }
  if ([System.IO.Path]::IsPathRooted($Reference)) {
    return [System.IO.Path]::GetFullPath($Reference)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $taskRoot $Reference))
}

if ([string] $data.schema_version -ne "1.0") {
  $errors.Add("不支持的发布包版本 / Unsupported schema: $($data.schema_version)") | Out-Null
}
if ([string] $data.platform -ne "bilibili") {
  $errors.Add("当前桥接器只支持 B 站 / This bridge supports Bilibili only") | Out-Null
}
if (-not [string] $data.account) {
  $errors.Add("缺少账号名 / Missing account name") | Out-Null
}

$statePath = Resolve-TaskReference ([string] $data.source.state_file)
$videoPath = Resolve-TaskReference ([string] $data.media.video)
$thumbnailPath = Resolve-TaskReference ([string] $data.media.thumbnail)
$state = $null

if (-not $statePath -or -not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  $errors.Add("任务状态文件不存在 / Task state is missing: $statePath") | Out-Null
} else {
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string] $state.stage -ne "final_ready") {
    $errors.Add("任务尚未 final_ready / Task is not final_ready: $($state.stage)") | Out-Null
  }
  # 中文：兼容新版布尔完整解码记录与旧版 passed 字符串；状态字段缺失时由完整解码结果作为 QA 门槛。
  # English: Accept current boolean full-decode records and legacy passed strings; an omitted status falls back to full-decode QA.
  $fullDecodeValue = $state.final_probe.full_decode
  $fullDecodePassed = ($fullDecodeValue -eq $true) -or ([string] $fullDecodeValue -eq "passed")
  $statusProperty = $state.final_probe.PSObject.Properties["status"]
  $statusPassed = ($null -eq $statusProperty) -or ([string] $state.final_probe.status -in @("ok", "pass", "passed"))
  if (-not $fullDecodePassed -or -not $statusPassed) {
    $errors.Add("正式成片 QA 未通过 / Final QA is not passed") | Out-Null
  }
}

if (-not $videoPath -or -not (Test-Path -LiteralPath $videoPath -PathType Leaf)) {
  $errors.Add("发布视频不存在 / Publish video is missing: $videoPath") | Out-Null
}
if ($thumbnailPath -and -not (Test-Path -LiteralPath $thumbnailPath -PathType Leaf)) {
  $blockers.Add("封面路径无效 / Thumbnail is missing: $thumbnailPath") | Out-Null
}
if (-not [string] $data.copy.title) {
  $blockers.Add("缺少标题 / Missing title") | Out-Null
}
if (-not [string] $data.copy.description) {
  $blockers.Add("缺少简介 / Missing description") | Out-Null
}
if (@($data.copy.tags).Count -eq 0) {
  $blockers.Add("缺少标签 / Missing tags") | Out-Null
}
if ([int] $data.publish.tid -le 0) {
  $blockers.Add("缺少有效的分区 ID / Missing valid category tid") | Out-Null
}
if ([string] $data.approval.status -ne "approved") {
  $blockers.Add("发布包尚未获得用户批准 / Manifest is not approved") | Out-Null
}

$tool = [System.IO.Path]::GetFullPath($ToolRoot)
$sau = Join-Path $tool ".venv\Scripts\sau.exe"
if (-not (Test-Path -LiteralPath $sau -PathType Leaf)) {
  $errors.Add("上传器运行入口不存在 / Uploader runtime is missing: $sau") | Out-Null
}

$validation = [ordered] @{
  ok = ($errors.Count -eq 0)
  ready_to_publish = ($errors.Count -eq 0 -and $blockers.Count -eq 0)
  checked_at = (Get-Date).ToString("s")
  manifest = $manifestPath
  task = $taskRoot
  account = [string] $data.account
  video = $videoPath
  thumbnail = $thumbnailPath
  tid = [int] $data.publish.tid
  only_self = [bool] $data.publish.only_self
  errors = @($errors)
  blockers = @($blockers)
  warnings = @($warnings)
}

if ($Action -eq "Validate") {
  $validation | ConvertTo-Json -Depth 6
  if (-not $validation.ok) { exit 1 }
  exit 0
}
if (-not $validation.ok) {
  $validation | ConvertTo-Json -Depth 6
  exit 1
}

Push-Location $tool
try {
  if ($Action -eq "AccountCheck") {
    & $sau bilibili check --account ([string] $data.account) 2>&1 | Out-String -Width 240
    exit $LASTEXITCODE
  }
  if ($Action -eq "Login") {
    if (-not $ConfirmLogin) {
      throw "登录会创建或更新 B 站账号文件；请添加 -ConfirmLogin / Login requires -ConfirmLogin"
    }
    & $sau bilibili login --account ([string] $data.account)
    exit $LASTEXITCODE
  }
  if (-not $validation.ready_to_publish) {
    $validation | ConvertTo-Json -Depth 6
    throw "发布包仍有阻塞项，不能投稿 / Manifest still has blockers"
  }
  if (-not $ConfirmPublish) {
    throw "真实投稿必须显式添加 -ConfirmPublish / Publishing requires -ConfirmPublish"
  }
  if (-not [bool] $data.publish.only_self -and -not $ConfirmPublicPublish) {
    throw "公开投稿必须额外添加 -ConfirmPublicPublish / Public publishing requires -ConfirmPublicPublish"
  }

  $cliArgs = @(
    "bilibili", "upload-video",
    "--account", [string] $data.account,
    "--file", $videoPath,
    "--title", [string] $data.copy.title,
    "--desc", [string] $data.copy.description,
    "--tid", [string] $data.publish.tid,
    "--tags", (@($data.copy.tags) -join ",")
  )
  if ($thumbnailPath) { $cliArgs += @("--thumbnail", $thumbnailPath) }
  if ([string] $data.publish.schedule) { $cliArgs += @("--schedule", [string] $data.publish.schedule) }
  if ([bool] $data.publish.only_self) { $cliArgs += "--only-self" }

  $logDir = Join-Path $publishDir "logs"
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
  }
  $logName = "bilibili-upload-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss")
  $logPath = Join-Path $logDir $logName

  & $sau @cliArgs 2>&1 | Tee-Object -FilePath $logPath
  $uploadExitCode = $LASTEXITCODE
  $logText = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Raw -Encoding UTF8 } else { "" }
  $bvidMatch = [regex]::Match($logText, 'BV[0-9A-Za-z]{10}')
  $data.result.attempted_at = (Get-Date).ToString("s")
  $data.result.log = "logs/$logName"
  $data.result.status = if ($uploadExitCode -eq 0) {
    if ([bool] $data.publish.only_self) { "submitted_private" } else { "uploaded_pending_url" }
  } else { "failed" }
  if ($bvidMatch.Success) {
    $data.result.published_id = $bvidMatch.Value
    $data.result.published_url = "https://www.bilibili.com/video/$($bvidMatch.Value)"
  }
  $data.updated_at = (Get-Date).ToString("s")
  $data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  exit $uploadExitCode
} finally {
  Pop-Location
}

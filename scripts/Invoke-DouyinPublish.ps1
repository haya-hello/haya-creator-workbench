[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $Manifest,

  [ValidateSet("Validate", "AccountCheck", "Login", "Prepare", "Publish")]
  [string] $Action = "Validate",

  [string] $ToolRoot,
  [switch] $ConfirmLogin,
  [switch] $ConfirmPublish,
  [switch] $Headless
)

$ErrorActionPreference = "Stop"

if (-not $ToolRoot) {
  $ToolRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ".vendor\social-auto-upload"
}

# 中文：任何真实发布都必须同时通过文件闸门和显式确认参数。
# English: Every real publish must pass both manifest gates and an explicit confirmation flag.
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$publishDir = Split-Path -Parent $manifestPath
$taskRoot = Split-Path -Parent $publishDir
$data = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

$errors = New-Object System.Collections.Generic.List[string]
$blockers = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Resolve-TaskReference {
  param([string] $Reference)

  if (-not $Reference) {
    return $null
  }
  if ([System.IO.Path]::IsPathRooted($Reference)) {
    return [System.IO.Path]::GetFullPath($Reference)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $taskRoot $Reference))
}

if ([string] $data.schema_version -ne "1.0") {
  $errors.Add("不支持的发布包版本 / Unsupported schema: $($data.schema_version)") | Out-Null
}
if ([string] $data.platform -ne "douyin") {
  $errors.Add("当前桥接器只支持抖音 / This bridge currently supports Douyin only") | Out-Null
}
if (-not [string] $data.account) {
  $errors.Add("缺少账号名 / Missing account name") | Out-Null
}

$statePath = Resolve-TaskReference ([string] $data.source.state_file)
$videoPath = Resolve-TaskReference ([string] $data.media.video)
$archiveMasterPath = Resolve-TaskReference ([string] $data.media.archive_master)
$thumbnailPath = Resolve-TaskReference ([string] $data.media.thumbnail)
$thumbnailLandscapePath = Resolve-TaskReference ([string] $data.media.thumbnail_4_3)
$predictionPath = Resolve-TaskReference ([string] $data.workflow.prediction_file)
$state = $null

if (-not $statePath -or -not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  $errors.Add("任务状态文件不存在 / Task state is missing: $statePath") | Out-Null
} else {
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string] $state.stage -ne "final_ready") {
    $errors.Add("任务尚未 final_ready / Task is not final_ready: $($state.stage)") | Out-Null
  }
  # 中文：兼容旧版字符串 QA 与新版布尔 QA；英文：Accept both legacy string QA and current boolean QA.
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
} elseif ($state) {
  $stateFinal = Resolve-TaskReference ([string] $state.outputs.final)
  $expectedMaster = if ($archiveMasterPath) { $archiveMasterPath } else { $videoPath }
  if ($stateFinal -and -not $stateFinal.Equals($expectedMaster, [System.StringComparison]::OrdinalIgnoreCase)) {
    $errors.Add("归档母版与状态文件正式入口不一致 / Archive master does not match state.outputs.final") | Out-Null
  }

  $videoItem = Get-Item -LiteralPath $videoPath
  if ($videoItem.Length -gt 300MB) {
    $warnings.Add("视频超过 300MB，建议先生成上传兼容版；最高画质母版继续保留 / Video exceeds 300MB; consider an upload-optimized copy") | Out-Null
  }
  $publishBitRate = if ($data.media.upload_probe) { [long] $data.media.upload_probe.bit_rate } else { [long] $state.final_probe.bit_rate }
  if ($publishBitRate -gt 20000000) {
    $warnings.Add("视频平均码率超过 20Mbps，浏览器上传耗时会明显增加 / Bitrate exceeds 20Mbps and browser upload may be slow") | Out-Null
  }
  if ($archiveMasterPath) {
    if (-not (Test-Path -LiteralPath $archiveMasterPath -PathType Leaf)) {
      $errors.Add("归档母版不存在 / Archive master is missing: $archiveMasterPath") | Out-Null
    }
    if ([string] $data.media.upload_probe.full_decode -ne "passed") {
      $errors.Add("上传兼容版没有完整解码记录 / Upload copy lacks a full-decode record") | Out-Null
    }
    $durationDelta = [Math]::Abs(([double] $data.media.upload_probe.duration) - ([double] $state.final_probe.duration))
    if ($durationDelta -gt 0.1) {
      $errors.Add("上传兼容版与母版时长不一致 / Upload copy duration differs from the master") | Out-Null
    }
  }
}

if (-not [string] $data.copy.title) {
  $blockers.Add("缺少标题 / Missing title") | Out-Null
}
if (-not [string] $data.copy.description) {
  $blockers.Add("缺少简介 / Missing description") | Out-Null
}
if (@($data.copy.tags).Count -eq 0) {
  $blockers.Add("缺少话题标签 / Missing tags") | Out-Null
}
if ($thumbnailPath) {
  if (-not (Test-Path -LiteralPath $thumbnailPath -PathType Leaf)) {
    $blockers.Add("封面路径无效 / Thumbnail is missing: $thumbnailPath") | Out-Null
  }
} else {
  $warnings.Add("尚未指定 3:4 封面；上传器可以不带封面运行，但不建议正式发布 / No 3:4 thumbnail is configured") | Out-Null
}
if ($thumbnailLandscapePath -and -not (Test-Path -LiteralPath $thumbnailLandscapePath -PathType Leaf)) {
  $blockers.Add("4:3 封面路径无效 / 4:3 thumbnail is missing: $thumbnailLandscapePath") | Out-Null
}

if ([bool] $data.workflow.require_prediction) {
  if (-not $predictionPath -or -not (Test-Path -LiteralPath $predictionPath -PathType Leaf)) {
    $blockers.Add("尚未完成并关联发布前预测 / Required pre-publish prediction is missing") | Out-Null
  }
}
if ([string] $data.approval.status -ne "approved") {
  $blockers.Add("发布包尚未获得用户批准 / Manifest is not approved") | Out-Null
}

$tool = [System.IO.Path]::GetFullPath($ToolRoot)
$sau = Join-Path $tool ".venv\Scripts\sau.exe"
if (-not (Test-Path -LiteralPath $sau -PathType Leaf)) {
  $errors.Add("上传器运行入口不存在 / Uploader runtime is missing: $sau") | Out-Null
}
if (-not (Test-Path -LiteralPath (Join-Path $tool "conf.py") -PathType Leaf)) {
  $errors.Add("上传器缺少 conf.py / Uploader conf.py is missing") | Out-Null
}

$prepareBlockers = @($blockers | Where-Object { $_ -notmatch "发布包尚未获得用户批准|Manifest is not approved" })
$validation = [ordered] @{
  ok = ($errors.Count -eq 0)
  ready_to_prepare = ($errors.Count -eq 0 -and $prepareBlockers.Count -eq 0)
  ready_to_publish = ($errors.Count -eq 0 -and $blockers.Count -eq 0)
  checked_at = (Get-Date).ToString("s")
  manifest = $manifestPath
  task = $taskRoot
  account = [string] $data.account
  video = $videoPath
  archive_master = $archiveMasterPath
  thumbnail = $thumbnailPath
  thumbnail_4_3 = $thumbnailLandscapePath
  prediction = $predictionPath
  errors = @($errors)
  blockers = @($blockers)
  warnings = @($warnings)
}

if ($Action -eq "Validate") {
  $validation | ConvertTo-Json -Depth 6
  if (-not $validation.ok) {
    exit 1
  }
  exit 0
}

if (-not $validation.ok) {
  $validation | ConvertTo-Json -Depth 6
  exit 1
}

if ($Action -eq "Prepare" -and $Headless) {
  throw "人工检查模式必须打开可见浏览器 / Prepare requires a headed browser"
}

Push-Location $tool
try {
  if ($Action -eq "AccountCheck") {
    & $sau douyin check --account ([string] $data.account) 2>&1 | Out-String -Width 240
    exit $LASTEXITCODE
  }

  if ($Action -eq "Login") {
    if (-not $ConfirmLogin) {
      throw "登录会创建或更新账号 Cookie；请在用户明确同意后添加 -ConfirmLogin / Login requires -ConfirmLogin"
    }
    & $sau douyin login --account ([string] $data.account) --headed
    exit $LASTEXITCODE
  }

  if ($Action -eq "Prepare" -and -not $validation.ready_to_prepare) {
    $validation | ConvertTo-Json -Depth 6
    throw "发布页面仍有阻塞项，不能进入人工检查 / Manifest is not ready for manual review"
  }
  if ($Action -eq "Publish" -and -not $validation.ready_to_publish) {
    $validation | ConvertTo-Json -Depth 6
    throw "发布包仍有阻塞项，不能发布 / Manifest still has blockers"
  }
  if ($Action -eq "Publish" -and -not $ConfirmPublish) {
    throw "真实发布必须显式添加 -ConfirmPublish / Real publishing requires -ConfirmPublish"
  }

  $cliArgs = @(
    "douyin", "upload-video",
    "--account", [string] $data.account,
    "--file", $videoPath,
    "--title", [string] $data.copy.title,
    "--desc", [string] $data.copy.description,
    "--tags", (@($data.copy.tags) -join ",")
  )
  if ([string] $data.publish.schedule) {
    $cliArgs += @("--schedule", [string] $data.publish.schedule)
  }
  if ($thumbnailPath) {
    $cliArgs += @("--thumbnail-portrait", $thumbnailPath)
  }
  if ($thumbnailLandscapePath) {
    $cliArgs += @("--thumbnail-landscape", $thumbnailLandscapePath)
  }
  if ([string] $data.publish.declaration) {
    $cliArgs += @("--declaration", [string] $data.publish.declaration)
  }
  if ($Action -eq "Prepare") {
    $cliArgs += "--manual-review"
  }
  if ($Headless) {
    $cliArgs += "--headless"
  } else {
    $cliArgs += "--headed"
  }

  $logDir = Join-Path $publishDir "logs"
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
  }
  $logName = "douyin-upload-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss")
  $logPath = Join-Path $logDir $logName

  & $sau @cliArgs 2>&1 | Tee-Object -FilePath $logPath
  $uploadExitCode = $LASTEXITCODE
  $data.result.attempted_at = (Get-Date).ToString("s")
  $data.result.log = "logs/$logName"
  $data.result.status = if ($uploadExitCode -eq 0) {
    if ($Action -eq "Prepare") { "manually_published_pending_url" } else { "uploaded_pending_url" }
  } else {
    if ($Action -eq "Prepare") { "manual_review_closed_without_publish" } else { "failed" }
  }
  $data.updated_at = (Get-Date).ToString("s")
  $data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  exit $uploadExitCode
} finally {
  Pop-Location
}

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("haya-publish-test-" + [Guid]::NewGuid().ToString("N"))

try {
  foreach ($relative in @("final", "publish", "qa", "fake-tool\.venv\Scripts")) {
    New-Item -ItemType Directory -Path (Join-Path $tempRoot $relative) -Force | Out-Null
  }
  $video = Join-Path $tempRoot "final\final-video.mp4"
  $cover = Join-Path $tempRoot "final\cover.png"
  $prediction = Join-Path $tempRoot "prediction.md"
  $fakeUploader = Join-Path $tempRoot "fake-tool\.venv\Scripts\sau.exe"
  $fakeConfig = Join-Path $tempRoot "fake-tool\conf.py"
  [System.IO.File]::WriteAllBytes($video, [byte[]](1, 2, 3, 4))
  [System.IO.File]::WriteAllBytes($cover, [byte[]](5, 6, 7, 8))
  Set-Content -LiteralPath $prediction -Value "immutable prediction" -Encoding UTF8
  Set-Content -LiteralPath $fakeUploader -Value "offline test only" -Encoding UTF8
  Set-Content -LiteralPath $fakeConfig -Value "# offline test only" -Encoding UTF8

  $state = [ordered]@{
    stage = "final_ready"
    project_name = "offline-gate-test"
    outputs = [ordered]@{ final = "final/final-video.mp4" }
    final_probe = [ordered]@{ full_decode = $true; status = "pass"; bit_rate = 1000000 }
  }
  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $tempRoot ".naive-video-state.json") -Encoding UTF8

  # CN: 使用伪造媒体和伪造上传器只测试本地闸门，绝不连接平台。
  # EN: Fake media and a fake uploader exercise local gates without platform access.
  & (Join-Path $repoRoot "scripts\New-DouyinPublishPackage.ps1") `
    -TaskRoot $tempRoot -Title "Gate test" -Description "Offline" -Tags "test" `
    -Thumbnail $cover -Thumbnail4x3 $cover -PredictionFile $prediction | Out-Null
  $douyinPath = Join-Path $tempRoot "publish\douyin.json"
  $douyin = Get-Content -LiteralPath $douyinPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $douyin.approval.status = "approved"
  $douyin.approval.approved_at = (Get-Date).ToString("o")
  $douyin.approval.approved_by = "offline-test"
  $douyin | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $douyinPath -Encoding UTF8

  $douyinBlocked = $false
  $douyinError = $null
  try {
    & (Join-Path $repoRoot "scripts\Invoke-DouyinPublish.ps1") -Manifest $douyinPath -Action Publish -ToolRoot (Join-Path $tempRoot "fake-tool") | Out-Null
  } catch {
    $douyinError = $_.Exception.Message
    $douyinBlocked = $douyinError -match "ConfirmPublish"
  }
  if (-not $douyinBlocked) { throw "Douyin publish did not reach the explicit-confirmation gate: $douyinError" }

  & (Join-Path $repoRoot "scripts\New-BilibiliPublishPackage.ps1") `
    -TaskRoot $tempRoot -Title "Gate test" -Description "Offline" -Tags "test" -Thumbnail $cover | Out-Null
  $bilibiliPath = Join-Path $tempRoot "publish\bilibili.json"
  $bilibili = Get-Content -LiteralPath $bilibiliPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $bilibili.approval.status = "approved"
  $bilibili.approval.approved_at = (Get-Date).ToString("o")
  $bilibili.approval.approved_by = "offline-test"
  $bilibili | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $bilibiliPath -Encoding UTF8

  $bilibiliBlocked = $false
  $bilibiliError = $null
  try {
    & (Join-Path $repoRoot "scripts\Invoke-BilibiliPublish.ps1") -Manifest $bilibiliPath -Action Publish -ToolRoot (Join-Path $tempRoot "fake-tool") | Out-Null
  } catch {
    $bilibiliError = $_.Exception.Message
    $bilibiliBlocked = $bilibiliError -match "ConfirmPublish"
  }
  if (-not $bilibiliBlocked) { throw "Bilibili publish did not reach the explicit-confirmation gate: $bilibiliError" }

  [ordered]@{ status = "pass"; douyin_gate = "pass"; bilibili_gate = "pass" } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

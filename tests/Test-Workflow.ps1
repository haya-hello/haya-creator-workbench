$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$required = @(
  "SKILL.md",
  "agents\openai.yaml",
  "runtime\remotion\src\Root.tsx",
  "modules\auto-talking-head-editor\SKILL.md",
  "modules\talking-head-video-pipeline\SKILL.md",
  "scripts\Invoke-DouyinPublish.ps1",
  "scripts\Invoke-BilibiliPublish.ps1",
  "scripts\Set-PublishApproval.ps1",
  "scripts\Install-CodexSkill.ps1"
)

foreach ($relative in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relative))) {
    throw "Missing required file: $relative"
  }
}

# CN: PowerShell 测试只解析发布脚本，不连接真实平台。
# EN: Parse publishing scripts without contacting live platforms.
Get-ChildItem -LiteralPath (Join-Path $repoRoot "scripts") -Filter "*.ps1" | ForEach-Object {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { throw "PowerShell parse failed: $($_.Name): $($errors[0].Message)" }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("haya-workbench-test-" + [Guid]::NewGuid().ToString("N"))
try {
  & (Join-Path $repoRoot "scripts\Initialize-Workbench.ps1") -WorkspaceRoot $tempRoot -AccountSlug "sample" | Out-Null
  $config = Get-Content -LiteralPath (Join-Path $tempRoot ".creator-workbench.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($config.editing_defaults.motion_density -ne "none") { throw "Latest no-motion default is missing" }
  if (-not $config.editing_defaults.preserve_source_fps) { throw "Source-fps preservation is missing" }
  if (-not $config.publishing_defaults.require_current_explicit_publish) { throw "Publish gate is missing" }
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

& (Join-Path $repoRoot "scripts\Test-Privacy.ps1") -Root $repoRoot | Out-Null
& (Join-Path $PSScriptRoot "Test-PublishGates.ps1") | Out-Null
[ordered]@{ status = "pass"; required_files = $required.Count } | ConvertTo-Json

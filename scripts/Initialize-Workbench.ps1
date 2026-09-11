[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $WorkspaceRoot,
  [string] $AccountSlug = "creator"
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$safeAccount = $AccountSlug -replace '[\\/:*?"<>|]', '-'

# CN: 仅创建可迁移工作区，不写入密钥、Cookie 或浏览器状态。
# EN: Create a portable workspace without credentials, cookies, or browser state.
foreach ($relative in @("accounts\$safeAccount", "jobs\$safeAccount", "inbox", "archive")) {
  New-Item -ItemType Directory -Path (Join-Path $root $relative) -Force | Out-Null
}

$config = [ordered]@{
  schema_version = "1.0"
  account = $safeAccount
  accounts_root = "accounts"
  jobs_root = "jobs"
  editing_defaults = [ordered]@{
    motion_density = "none"
    asr_model = "medium"
    voice_profile = "talk-clean"
    final_outputs = 1
    preserve_source_fps = $true
  }
  publishing_defaults = [ordered]@{
    action = "Prepare"
    require_current_explicit_publish = $true
    transcode_only_after_rejection = $true
  }
  created_at = (Get-Date).ToString("o")
}

$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root ".creator-workbench.json") -Encoding UTF8
$config | ConvertTo-Json -Depth 6

[CmdletBinding()]
param([string] $Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = "Stop"
$forbidden = @(
  'D:\\自媒体项目',
  'C:\\Users\\lenovo',
  '抖音蛤鸭',
  'VID[0-9]{8,}',
  'ghp_[A-Za-z0-9]{20,}',
  'sk-[A-Za-z0-9]{20,}',
  'password\s*[:=]\s*["''][^"'']{6,}["'']'
)
$extensions = @('.md', '.json', '.yaml', '.yml', '.ps1', '.py', '.mjs', '.ts', '.tsx')
$violations = [System.Collections.Generic.List[string]]::new()

# CN: 仅扫描可跟踪文本，忽略第三方和生成目录。
# EN: Scan trackable text only and ignore vendored or generated directories.
Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
  $extensions -contains $_.Extension.ToLowerInvariant() -and
  $_.Name -ne 'Test-Privacy.ps1' -and
  $_.FullName -notmatch '\\.vendor\\|\\node_modules\\|\\.git\\'
} | ForEach-Object {
  $content = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
  foreach ($pattern in $forbidden) {
    if ($content -match $pattern) {
      $violations.Add("$($_.FullName): $pattern") | Out-Null
    }
  }
}

if ($violations.Count -gt 0) {
  throw "Privacy scan failed:`n$($violations -join [Environment]::NewLine)"
}

[ordered]@{ status = "pass"; scanned_root = [System.IO.Path]::GetFullPath($Root) } | ConvertTo-Json

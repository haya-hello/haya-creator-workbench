[CmdletBinding(DefaultParameterSetName = "Approve")]
param(
  [Parameter(Mandatory = $true)]
  [string] $Manifest,

  [Parameter(Mandatory = $true, ParameterSetName = "Approve")]
  [switch] $Approve,

  [Parameter(Mandatory = $true, ParameterSetName = "Revoke")]
  [switch] $Revoke,

  [string] $ApprovedBy = ""
)

$ErrorActionPreference = "Stop"
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$data = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json

if ([string] $data.schema_version -ne "1.0") {
  throw "不支持的清单版本 / Unsupported manifest schema: $($data.schema_version)"
}

# 中文：批准与执行分开，避免一次命令同时获得授权并发布。
# English: Keep approval separate from execution so one command cannot authorize and publish.
if ($PSCmdlet.ParameterSetName -eq "Approve") {
  $data.approval.status = "approved"
  $data.approval.approved_at = (Get-Date).ToString("s")
  $data.approval.approved_by = if ($ApprovedBy) { $ApprovedBy } else { [Environment]::UserName }
} else {
  $data.approval.status = "draft"
  $data.approval.approved_at = $null
  $data.approval.approved_by = $null
}
$data.updated_at = (Get-Date).ToString("s")
$data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

[ordered] @{
  ok = $true
  manifest = $manifestPath
  approval = [string] $data.approval.status
  approved_at = $data.approval.approved_at
} | ConvertTo-Json -Depth 4

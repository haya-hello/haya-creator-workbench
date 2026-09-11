[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PortraitSource,

    [Parameter(Mandatory = $true)]
    [string]$LandscapeSource
)

$ErrorActionPreference = "Stop"
$initializer = Join-Path $PSScriptRoot "new-auto-talking-head-job.ps1"

# CN: 使用只读 PlanOnly 验证竖版、横版和混合比例三条路由。
# EN: Use read-only PlanOnly probes for portrait, landscape, and mixed routes.
$portrait = & $initializer -MaterialPath $PortraitSource -PlanOnly | ConvertFrom-Json
$landscape = & $initializer -MaterialPath $LandscapeSource -PlanOnly | ConvertFrom-Json
$mixed = & $initializer -MaterialPath @($PortraitSource, $LandscapeSource) -PlanOnly | ConvertFrom-Json

$cases = @(
    [ordered]@{
        name = "portrait-9x16"
        pass = $portrait.settings.detected_aspect_ratio -eq "9:16" -and
            $portrait.routing.layout_profile -eq "portrait-9x16" -and
            @($portrait.blockers).Count -eq 0
    },
    [ordered]@{
        name = "landscape-16x9"
        pass = $landscape.settings.detected_aspect_ratio -eq "16:9" -and
            $landscape.routing.layout_profile -eq "landscape-16x9" -and
            @($landscape.blockers).Count -eq 0
    },
    [ordered]@{
        name = "mixed-review-required"
        pass = $mixed.settings.detected_aspect_ratio -eq "mixed" -and
            $mixed.routing.layout_profile -eq "review-required" -and
            @($mixed.blockers).Count -gt 0
    }
)

$failed = @($cases | Where-Object { -not $_.pass })
$result = [ordered]@{
    ok = $failed.Count -eq 0
    cases = $cases
}
$result | ConvertTo-Json -Depth 5
if ($failed.Count -gt 0) {
    exit 1
}

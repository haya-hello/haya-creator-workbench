[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$JobPath,

    [ValidateSet("Auto", "codex-direct", "web-upload")]
    [string]$EntryChannel = "Auto",

    [ValidateSet("Auto", "new-auto", "revision")]
    [string]$Operation = "Auto"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$portableRuntimeRoot = Join-Path $repoRoot "runtime\remotion"

$absoluteJobPath = [System.IO.Path]::GetFullPath($JobPath)
if (-not (Test-Path -LiteralPath $absoluteJobPath -PathType Container)) {
    throw "任务目录不存在: $absoluteJobPath"
}

$autoManifestPath = Join-Path $absoluteJobPath ".auto-talking-head-job.json"
$statePath = Join-Path $absoluteJobPath ".naive-video-state.json"
$webStatePath = Join-Path $absoluteJobPath ".web-task-state.json"
$lockPath = Join-Path $absoluteJobPath ".talking-head-workflow.json"

if (-not (Test-Path -LiteralPath $statePath)) {
    throw "缺少真人剪辑状态文件: $statePath"
}

$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
$autoManifest = if (Test-Path -LiteralPath $autoManifestPath) {
    Get-Content -LiteralPath $autoManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $null
}
$existingLock = if (Test-Path -LiteralPath $lockPath) {
    Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    $null
}

$resolvedChannel = if ($EntryChannel -ne "Auto") {
    $EntryChannel
} elseif (Test-Path -LiteralPath $webStatePath) {
    "web-upload"
} else {
    "codex-direct"
}
$originChannel = if ($existingLock -and $existingLock.origin_channel) {
    [string]$existingLock.origin_channel
} elseif (Test-Path -LiteralPath $webStatePath) {
    "web-upload"
} else {
    $resolvedChannel
}
$resolvedOperation = if ($Operation -ne "Auto") {
    $Operation
} elseif ($autoManifest -and [string]$state.stage -ne "final_ready") {
    "new-auto"
} else {
    "revision"
}

$aspectRatio = if ($autoManifest -and $autoManifest.settings.aspect_ratio) {
    [string]$autoManifest.settings.aspect_ratio
} elseif ($state.style_profile.aspect_ratio) {
    [string]$state.style_profile.aspect_ratio
} else {
    "unknown"
}

$layoutProfile = switch ($aspectRatio) {
    "9:16" { "portrait-9x16" }
    "16:9" { "landscape-16x9" }
    default { "review-required" }
}

$blockers = [System.Collections.Generic.List[string]]::new()
if ($layoutProfile -eq "review-required") {
    $blockers.Add("素材不是单一且已确认的 9:16 或 16:9，必须先确认构图")
}
if ($autoManifest -and $autoManifest.blockers) {
    foreach ($blocker in @($autoManifest.blockers)) {
        if ($blocker -and -not $blockers.Contains([string]$blocker)) {
            $blockers.Add([string]$blocker)
        }
    }
}

$taskFamily = if ($autoManifest) { "auto-edit" } else { "managed-pipeline" }
$lockStatus = if ($blockers.Count -gt 0) { "blocked" } else { "locked" }
$workflowId = "talking-head/$resolvedChannel/$resolvedOperation/$layoutProfile"
$workflowLock = [ordered]@{
    schema_version = "1.0"
    lock_type = "talking-head-workflow"
    status = $lockStatus
    workflow_id = $workflowId
    origin_channel = $originChannel
    active_channel = $resolvedChannel
    channel_switched = $originChannel -ne $resolvedChannel
    active_operation = $resolvedOperation
    task_family = $taskFamily
    layout_profile = $layoutProfile
    aspect_ratio = $aspectRatio
    allowed_operations = @("new-auto", "revision")
    primary_skills = [ordered]@{
        new_auto = "auto-talking-head-editor"
        revision = "talking-head-video-pipeline"
        reference_build = "reference-effect-lab"
    }
    production_root = $portableRuntimeRoot
    job_path = $absoluteJobPath
    state_file = ".naive-video-state.json"
    invariants = @(
        "source-immutable",
        "actual-display-ratio",
        "main-audio-is-clock",
        "captions-and-motion-share-semantic-timeline",
        "preview-before-final",
        "one-final-output",
        "no-generic-fallback"
    )
    forbidden_fallbacks = @(
        if ($resolvedChannel -eq "codex-direct") { "auto-talking-head-web" }
        "generic-video-skill"
        "silent-layout-conversion"
        "multiple-final-renders"
    )
    blockers = @($blockers)
    updated_at = (Get-Date).ToString("o")
}

$workflowLock | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $lockPath -Encoding UTF8

[ordered]@{
    status = $lockStatus
    workflow_id = $workflowId
    entry_channel = $resolvedChannel
    origin_channel = $originChannel
    channel_switched = $originChannel -ne $resolvedChannel
    active_operation = $resolvedOperation
    task_family = $taskFamily
    layout_profile = $layoutProfile
    aspect_ratio = $aspectRatio
    lock_path = $lockPath
    blockers = @($blockers)
}

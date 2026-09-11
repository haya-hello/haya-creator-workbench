[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$MaterialPath,

    [string]$JobPath,

    [string]$Topic,

    [ValidateSet("Auto", "9:16", "16:9")]
    [string]$AspectRatio = "Auto",

    [ValidateSet("none", "calm", "balanced", "energetic")]
    [string]$MotionDensity = "none",

    [ValidateSet("codex-direct", "web-upload")]
    [string]$EntryChannel = "codex-direct",

    [ValidateRange(0.5, 2.0)]
    [double]$Speed = 1.0,

    [string]$RuntimeRoot,

    [switch]$PlanOnly,

    # CN: 允许初始化由网站预先创建、但尚无流水线状态的任务目录。
    # EN: Allow initializing a web-created job directory that has no pipeline state yet.
    [switch]$InitializeExisting
)

$ErrorActionPreference = "Stop"

# CN: 仅接受常见视频容器，避免把任务目录中的派生文件再次作为原片。
# EN: Accept common source containers only so derived job files are not re-ingested.
$videoExtensions = @(".mp4", ".mov", ".mkv", ".m4v")
$resolvedSources = [System.Collections.Generic.List[string]]::new()

foreach ($item in $MaterialPath) {
    $resolved = Resolve-Path -LiteralPath $item -ErrorAction Stop
    if (Test-Path -LiteralPath $resolved.Path -PathType Leaf) {
        $extension = [System.IO.Path]::GetExtension($resolved.Path).ToLowerInvariant()
        if ($videoExtensions -notcontains $extension) {
            throw "不支持的素材格式: $($resolved.Path)"
        }
        $resolvedSources.Add($resolved.Path)
        continue
    }

    $files = Get-ChildItem -LiteralPath $resolved.Path -File |
        Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object Name
    foreach ($file in $files) {
        $resolvedSources.Add($file.FullName)
    }
}

$sourcePaths = @($resolvedSources | Select-Object -Unique)
if ($sourcePaths.Count -eq 0) {
    throw "没有找到可用视频素材。"
}

if (-not $JobPath) {
    $firstParent = Split-Path -Parent $sourcePaths[0]
    $safeTopic = if ($Topic) { $Topic -replace '[\\/:*?"<>|]', '-' } else { "$(Get-Date -Format 'yyyy-MM-dd')-自动真人剪辑" }
    $JobPath = Join-Path $firstParent "$safeTopic-auto-edit"
}

$absoluteJobPath = [System.IO.Path]::GetFullPath($JobPath)

# CN: 优先使用项目已安装的 Remotion ffprobe，减少系统依赖差异。
# EN: Prefer the project's bundled Remotion ffprobe to reduce machine-specific differences.
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$productionRoot = if ($RuntimeRoot) { [System.IO.Path]::GetFullPath($RuntimeRoot) } else { Join-Path $repoRoot "runtime\remotion" }
$bundledFfprobe = Join-Path $productionRoot "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"
$ffprobe = if (Test-Path -LiteralPath $bundledFfprobe) { $bundledFfprobe } else { "ffprobe" }

function Get-GreatestCommonDivisor {
    param([int]$Left, [int]$Right)
    while ($Right -ne 0) {
        $remainder = $Left % $Right
        $Left = $Right
        $Right = $remainder
    }
    return [Math]::Abs($Left)
}

function Get-VideoProbe {
    param([string]$SourcePath)

    $arguments = @(
        "-v", "error",
        "-print_format", "json",
        "-show_entries", "stream=index,codec_name,codec_type,width,height,avg_frame_rate,duration:stream_tags=rotate:stream_side_data=rotation:format=duration,size",
        $SourcePath
    )
    $raw = & $ffprobe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "ffprobe 探测失败: $SourcePath"
    }

    $probe = $raw | ConvertFrom-Json
    $video = @($probe.streams | Where-Object { $_.codec_type -eq "video" }) | Select-Object -First 1
    $audio = @($probe.streams | Where-Object { $_.codec_type -eq "audio" }) | Select-Object -First 1
    if (-not $video) {
        throw "素材没有视频流: $SourcePath"
    }

    $rotation = 0
    if ($video.tags -and $null -ne $video.tags.rotate) {
        $rotation = [int][double]$video.tags.rotate
    }
    if ($video.side_data_list) {
        $sideRotation = @($video.side_data_list | Where-Object { $null -ne $_.rotation } | Select-Object -First 1)
        if ($sideRotation.Count -gt 0) {
            $rotation = [int][double]$sideRotation[0].rotation
        }
    }

    $encodedWidth = [int]$video.width
    $encodedHeight = [int]$video.height
    $quarterTurn = ([Math]::Abs($rotation) % 180) -eq 90
    $displayWidth = if ($quarterTurn) { $encodedHeight } else { $encodedWidth }
    $displayHeight = if ($quarterTurn) { $encodedWidth } else { $encodedHeight }
    $gcd = Get-GreatestCommonDivisor -Left $displayWidth -Right $displayHeight
    $ratio = "$([int]($displayWidth / $gcd)):$([int]($displayHeight / $gcd))"

    $fps = 0.0
    if ($video.avg_frame_rate -match '^([0-9.]+)/([0-9.]+)$' -and [double]$Matches[2] -ne 0) {
        $fps = [double]$Matches[1] / [double]$Matches[2]
    }

    return [ordered]@{
        path = $SourcePath
        file_name = [System.IO.Path]::GetFileName($SourcePath)
        size_bytes = (Get-Item -LiteralPath $SourcePath).Length
        video_codec = $video.codec_name
        encoded_width = $encodedWidth
        encoded_height = $encodedHeight
        rotation = $rotation
        display_width = $displayWidth
        display_height = $displayHeight
        display_aspect_ratio = $ratio
        fps = [Math]::Round($fps, 3)
        duration_seconds = [Math]::Round([double]$probe.format.duration, 3)
        has_audio = [bool]$audio
    }
}

$probes = @($sourcePaths | ForEach-Object { Get-VideoProbe -SourcePath $_ })
$detectedRatios = @($probes.display_aspect_ratio | Select-Object -Unique)
$detectedRatio = if ($detectedRatios.Count -eq 1) { $detectedRatios[0] } else { "mixed" }
$ratioDecision = if ($AspectRatio -eq "Auto") { $detectedRatio } else { $AspectRatio }
$supportedRatios = @("9:16", "16:9")
$requiresRatioReview = $detectedRatio -eq "mixed" -or
    ($AspectRatio -ne "Auto" -and $AspectRatio -ne $detectedRatio) -or
    ($supportedRatios -notcontains $ratioDecision)
$layoutProfile = switch ($ratioDecision) {
    "9:16" { "portrait-9x16" }
    "16:9" { "landscape-16x9" }
    default { "review-required" }
}
$missingAudio = @($probes | Where-Object { -not $_.has_audio })

$jobManifest = [ordered]@{
    schema_version = "1.0"
    skill = "auto-talking-head-editor"
    created_at = (Get-Date).ToString("o")
    job_path = $absoluteJobPath
    source_order = "user-list-then-filename"
    sources = $probes
    routing = [ordered]@{
        entry_channel = $EntryChannel
        task_family = "auto-edit"
        layout_profile = $layoutProfile
        workflow_id = "talking-head/$EntryChannel/auto-edit/$layoutProfile"
    }
    settings = [ordered]@{
        aspect_ratio = $ratioDecision
        detected_aspect_ratio = $detectedRatio
        requires_ratio_review = $requiresRatioReview
        duplicate_strategy = "later-complete-retake"
        silence_profile = "natural"
        caption_timing = "working-cut-word-level"
        caption_size = "large"
        motion_density = $MotionDensity
        voice_profile = "talk-clean"
        speed = $Speed
        final_outputs = 1
    }
    blockers = @(
        if ($requiresRatioReview) { "素材比例混合、不是 9:16/16:9，或指定比例与源片不一致" }
        if ($missingAudio.Count -gt 0) { "至少一段素材没有可用音频" }
    )
}

if ($PlanOnly) {
    $jobManifest | ConvertTo-Json -Depth 8
    return
}

if (Test-Path -LiteralPath $absoluteJobPath) {
    if (-not $InitializeExisting) {
        throw "任务目录已经存在，未覆盖: $absoluteJobPath"
    }
    foreach ($protectedState in @(".auto-talking-head-job.json", ".naive-video-state.json")) {
        $protectedPath = Join-Path $absoluteJobPath $protectedState
        if (Test-Path -LiteralPath $protectedPath) {
            throw "任务目录已经初始化，未覆盖状态文件: $protectedPath"
        }
    }
} else {
    if ($EntryChannel -eq "web-upload") {
        throw "web-upload 渠道必须使用网站已创建的任务目录并传入 -InitializeExisting"
    }
    $null = New-Item -ItemType Directory -Path $absoluteJobPath
}

if ($InitializeExisting -and $EntryChannel -ne "web-upload") {
    throw "-InitializeExisting 只允许用于 web-upload 渠道"
}

foreach ($folder in @("edit", "preview", "final", "qa", "qa\source-probes")) {
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $absoluteJobPath $folder)
}

$manifestPath = Join-Path $absoluteJobPath ".auto-talking-head-job.json"
$statePath = Join-Path $absoluteJobPath ".naive-video-state.json"
$jobManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$state = [ordered]@{
    schema_version = "1.0"
    skill = "auto-talking-head-editor"
    stage = "intake_ready"
    main_video = $sourcePaths[0]
    source_videos = $sourcePaths
    master_audio = "approved_working_cut"
    preview_required = $true
    approval = [ordered]@{ status = "pending" }
    style_profile = [ordered]@{
        aspect_ratio = $ratioDecision
        layout_profile = $layoutProfile
        motion_density = $MotionDensity
        caption_size = "large"
        safe_zones = @("face", "captions", "screen-recording", "product-ui")
    }
    outputs = [ordered]@{
        edl = "edit/rough-cut-edl.json"
        captions = $null
        motion_plan = $null
        preview = $null
        final = $null
    }
    last_error = $null
    updated_at = (Get-Date).ToString("o")
}
$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding UTF8

$lockScript = Join-Path $PSScriptRoot "Set-TalkingHeadWorkflowLock.ps1"
$workflowLock = & $lockScript -JobPath $absoluteJobPath -EntryChannel $EntryChannel -Operation new-auto

[ordered]@{
    status = "created"
    job_path = $absoluteJobPath
    manifest = $manifestPath
    state = $statePath
    source_count = $sourcePaths.Count
    detected_aspect_ratio = $detectedRatio
    workflow = $workflowLock
    blockers = $jobManifest.blockers
} | ConvertTo-Json -Depth 5

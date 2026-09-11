# State contract

Each item uses one recoverable job directory:

```text
job/
  source/       immutable inputs or references
  edit/         transcripts, EDL, working audio, captions
  preview/      review frames and short previews
  final/        exactly one active publishable video
  publish/      per-platform manifests and copy
  qa/           probes, reports, and platform evidence
  .creator-job.json
  .talking-head-workflow.json
  .naive-video-state.json
```

Recommended progression:

```text
idea -> draft_ready -> prediction_locked -> shot
-> edl_proposed | edl_approved -> captions_ready -> preview_ready
-> final_ready -> upload_prepared -> published | publish_uncertain
-> retrospective_ready -> closed
```

Use atomic state writes. Store relative artifact paths when possible. Do not store secrets. Never mark `published` when visibility or platform identity is unknown.

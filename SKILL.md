---
name: haya-creator-workbench
description: Run an end-to-end creator workflow from a real idea or talking-head footage through content shaping, automatic editing, captions, QA, packaging, upload, explicit publishing, and post-publication review. Use when one content task should move across writing, video production, and platform delivery without losing state. Do not use for isolated reference-video breakdowns or unconditional background publishing.
---

# Haya Creator Workbench

Treat one post or video as one recoverable job. Route by the user's current input instead of requiring workbench names.

## Route the request

- Idea, experience, draft, topic, score, prediction, or retrospective: read [references/content-workflow.md](references/content-workflow.md).
- Raw talking-head footage, revision, captions, audio, preview, or export: read [references/editing-workflow.md](references/editing-workflow.md).
- Cover, title, upload, schedule, publish, or platform result: read [references/publishing-workflow.md](references/publishing-workflow.md).
- New installation, machine, or project: read [references/installation.md](references/installation.md).
- State recovery or cross-stage handoff: read [references/state-contract.md](references/state-contract.md).

## Current workflow contract

1. Preserve the creator's facts, judgment, and voice before optimizing structure.
2. Keep source media immutable. Detect coded dimensions, rotation, displayed aspect ratio, and source frame rate before editing.
3. Remove only high-confidence pauses, false starts, and retakes. Prefer the later complete retake. Stop when meaning differs.
4. Use the approved working audio as the timing source for word-level captions. Human-review terminology, omissions, line breaks, flicker, overlap, and safe areas.
5. Default to no visual motion. Add motion only when the current request explicitly asks for it.
6. Render one H.264/AAC deliverable after review. Preserve a sensible source frame rate instead of forcing 60 fps.
7. Upload only a `final_ready` result that passed decode and visual QA. Try the final file before transcoding.
8. Separate `prepare` from `publish`. A real platform submission requires current explicit authorization and a manifest approval gate.
9. Record platform result, URL or ID, and uncertainty. Never infer success from a redirect alone.
10. Feed published results back into the content calibration loop.

## Boundaries

- Never place footage, final videos, drafts, account analytics, cookies, tokens, browser profiles, or private state in this skill repository.
- Do not copy `cheat-on-content`; install it as an attributed upstream dependency when its calibrated scoring loop is needed.
- Do not reuse approval from an earlier turn or another platform.
- One platform attempt uses one persistent session and one upload. On unexpected page behavior, preserve evidence and stop instead of restarting.

Initialize a portable workspace with `scripts/Initialize-Workbench.ps1`. The bundled editing runtime and publishing bridges use relative or explicitly supplied paths.

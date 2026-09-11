# Automatic talking-head editing

## Current default

This baseline supersedes earlier motion-heavy defaults:

- Keep the displayed source aspect ratio.
- Keep a sensible source frame rate; do not force 60 fps.
- Process clips in the supplied shooting order.
- Preserve originals and build a traceable EDL.
- Remove natural dead air, false starts, and clear repeated retakes conservatively.
- Prefer the later complete retake when it fully replaces an earlier attempt.
- Stop on a changed fact, negation, conclusion, or other semantic ambiguity.
- Apply light voice cleanup and loudness organization without aggressive denoising.
- Generate phrase-level captions from final working-audio word timestamps.
- Human-review terminology, missing words, line breaks, dangling single characters, flicker, overlap, and platform safe areas.
- Use static captions and no visual motion unless the current request explicitly opts in.
- Review with Studio, representative frames, and only necessary short clips.
- Export one H.264/AAC final video after approval and full-decode it.

## Task fingerprint

Persist the channel, operation, layout, active Skill, job root, and single final output. Mixed or unsupported displayed aspect ratios require review. A revision reruns only the changed layer. A speed-only revision can retime the approved final timeline without rerunning ASR or editing decisions.

`runtime/remotion` contains the minimal current composition and automatic job runner. `modules/auto-talking-head-editor` initializes the media job; `modules/talking-head-video-pipeline` supplies state and QA checks. Configure paths through parameters or workspace configuration.

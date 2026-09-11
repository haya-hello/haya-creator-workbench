# Project handoff

Updated: 2026-09-11

## Status

The repository is an active, sanitized public package of the latest creator workflow. The root `SKILL.md` routes content, editing, publishing, installation, and recovery. The September baseline replaces older motion-heavy editing defaults.

## Entrypoints

- Skill: `SKILL.md`
- Natural-language routing: `WORKBENCHES.md`
- Remotion runtime: `runtime/remotion`
- Automatic editor module: `modules/auto-talking-head-editor`
- Stateful video module: `modules/talking-head-video-pipeline`
- Publishing bridges: `scripts/Invoke-DouyinPublish.ps1` and `scripts/Invoke-BilibiliPublish.ps1`

## Validation

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-Workflow.ps1
cd runtime\remotion
npm.cmd run typecheck
npm.cmd audit --omit=dev
```

## Protected boundary

Never add creator footage, finished videos, drafts, predictions, analytics, cookies, tokens, browser profiles, logs, or private workspace state.

## Next step

Create the GitHub repository, push the validated initial release, and verify remote Skill discovery.

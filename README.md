# Haya Creator Workbench

A portable Codex skill for one continuous creator workflow:

```text
real idea or footage
-> content shaping and prediction
-> automatic talking-head editing
-> captions, audio, preview, and QA
-> title, cover, and platform package
-> automatic upload
-> explicit automatic publishing
-> result registration and retrospective
```

This repository is rebuilt from the workflow validated in September 2026. The current editing default is static, high-quality captions with light voice enhancement and no visual motion unless explicitly requested.

## Included

- One router Skill at `SKILL.md`.
- Portable content, editing, publishing, installation, and state contracts.
- Current automatic talking-head modules and a minimal Remotion runtime.
- Douyin and Bilibili manifest, validation, upload, and explicit-publish bridges.
- Workspace initialization, privacy scanning, and offline tests.

## Excluded

Private footage, final videos, scripts, predictions, account data, cookies, browser sessions, logs, local absolute paths, and creator-specific analytics are intentionally excluded.

## Quick start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-CodexSkill.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Initialize-Workbench.ps1 -WorkspaceRoot "D:\creator-workspace"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-Dependencies.ps1 -WithContentEngine -WithPublisher
```

Then invoke `$haya-creator-workbench` in Codex and provide an idea, draft, or ordered talking-head footage.

Real publishing is never implied by rendering or upload. Use `Prepare` to upload and fill the platform form. Use `Publish` only with the current explicit confirmation switches documented in `references/publishing-workflow.md`.

The repository includes GitHub Actions validation for the portable runtime, workflow contract, privacy rules, and offline publish gates.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7+
- Git
- Node.js 20+
- FFmpeg and FFprobe
- Python 3.10+; Faster-Whisper is optional until transcription is requested

## Validation

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-Workflow.ps1
```

## Attribution and license

See `THIRD_PARTY_NOTICES.md`. This repository uses the MIT License.

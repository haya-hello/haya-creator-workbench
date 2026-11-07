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

## 分步入口

这条主链路已经拆成八个可恢复步骤，适合从任意已知状态继续：

1. 内容成形：事实、判断、主张、拍摄稿和预测
2. 素材接收与建档：原片、比例、音频、状态和任务目录
3. 粗剪与工作片：EDL、重复重说、气口和语义闸门
4. 音频、字幕与质量检查：最终工作音频、词级时间轴和安全区
5. 视觉设计与预览：版式、参考图、动效和审批
6. 正式导出：唯一 H.264/AAC 成片与完整解码
7. 发布包、上传与发布：Prepare、批准、Publish 和平台核验
8. 发布登记与复盘：事实回填、T+N 数据和可验证改进

每一步的输入、输出和停止条件见 [`steps/README.md`](steps/README.md)。不要把私人素材、字幕、预测、账号数据、Cookie 或浏览器状态放进这个仓库。

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

## Public release notes

公开打包的来源与取舍记录在 [`docs/RESEARCH.md`](docs/RESEARCH.md)。仓库只发布通用流程、模板和脱敏运行时代码；真实账号操作仍需要用户自己的授权和本地状态。

## Attribution and license

See `THIRD_PARTY_NOTICES.md`. This repository uses the MIT License.

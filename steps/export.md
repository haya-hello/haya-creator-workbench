# 06 正式导出 / Export

## 目标

只生成一个平台通用、可直接上传的正式成片，并留下可核验的技术证据。

## 操作

1. 从批准的工作时间轴导出 H.264/AAC、faststart 和合理的源帧率。
2. 核对文件存在、时长、分辨率、帧率、音频流和封装元数据。
3. 做完整解码和代表帧检查；确认正式文件与 QA 预览使用同一时间轴。
4. 将任务状态推进到 `final_ready`，记录唯一正式文件和哈希（如果任务需要）。

## 闸门

正式文件完整可解码、音视频同步、比例正确。平台没有明确拒绝前不提前生成上传兼容副本。

详见 [../modules/talking-head-video-pipeline/references/workflows/export.md](../modules/talking-head-video-pipeline/references/workflows/export.md)。

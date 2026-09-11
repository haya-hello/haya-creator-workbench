# 自动真人剪辑任务契约

## 任务目录

```text
<job>/
  .auto-talking-head-job.json
  .naive-video-state.json
  edit/
    rough-cut-edl.json
  preview/
  final/
  qa/
    source-probes/
```

原片只通过绝对路径引用，不复制到任务目录。`edit/` 和 `preview/` 是派生数据；`final/` 只允许存在一个当前正式成片。

## 阶段

```text
intake_ready
  -> source_checked
  -> edl_proposed
  -> edl_approved
  -> working_cut_ready
  -> captions_ready
  -> design_ready
  -> motion_ready（仅用户当次明确要求动效）
  -> preview_ready
  -> rendering
  -> final_ready
```

任何失败写入 `last_error` 并保留上一成功阶段，不虚报完成。

## EDL 最低结构

```json
{
  "schema_version": "1.0",
  "strategy": "chronological-later-complete-retake-natural-breath-cut",
  "timing_source": "local-faster-whisper-word-timestamps",
  "audio_fade_seconds": 0.003,
  "sources": [
    {
      "source": "D:\\path\\clip.mp4",
      "semantic_exclusions": [
        {
          "start": 12.3,
          "end": 16.1,
          "text": "未完成或重复内容",
          "replacement_source": "D:\\path\\later.mp4",
          "reason": "后一次表达完整",
          "confidence": 0.96
        }
      ],
      "segments": [
        {"start": 0.8, "end": 12.3},
        {"start": 16.1, "end": 28.5}
      ]
    }
  ],
  "ambiguous_cuts": [],
  "expected_duration_seconds": 52.4
}
```

## 自动应用阈值

以下条件同时满足时，语义剪点可视为高置信度：

- 后一表达覆盖前一表达的主要词序或语义；
- 前一表达在句中停止、出现明确改口，或后一表达明显更完整；
- 删除区间没有只在前一版本出现的新事实、数字、否定词或结论；
- 剪点能落在词尾或静音边界；
- `confidence >= 0.92`。

任一条件不满足，写入 `ambiguous_cuts`，不得自动删除。

## 同步真源

获批工作片的主音频是唯一时间基准。字幕由该音频的词级时间生成并完成文字、断句和可读性复核；默认不生成动效。用户当次明确要求动效时，动效引用字幕文本锚点；速度变化通过同一个源时间到成片时间函数计算。不得把原片 ASR 秒数、工作片字幕秒数和手写动效秒数混用。

## QA 最低结果

在 `.naive-video-state.json` 中至少记录：

- `source_probe`：每个源片的编码宽高、旋转、显示宽高、比例、帧率、时长、音频；
- `outputs.edl`、`outputs.captions`、可选的 `outputs.motion_plan`、`outputs.preview`、`outputs.final`；
- `sync_check`：字幕/声音和动效/关键词的最大观察偏差；
- `final_probe`：编码、像素格式、尺寸、帧率、时长、音频、完整解码；
- `visual_check`：代表帧是否通过；
- `last_error`：失败时的具体阶段和原因。

## 单一成片规则

`final/` 内只保留一个当前发布文件。高质量工作底片、同步检查片和渲染缓存只能放在 `edit/` 或 `qa/`。正式成片未被平台拒绝前，不生成上传兼容副本。

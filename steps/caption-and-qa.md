# 04 音频、字幕与质量检查 / Captions and QA

## 目标

让最终工作音频成为唯一时间基准，生成可读、可发布的字幕并提前发现音视频和安全区问题。

## 操作

1. 对工作片做轻度人声处理和响度整理；不默认强降噪或强去齿音。
2. 基于处理后的同一时间轴做词级转写；人工校正术语、错字、漏字、断句和数字。
3. 用真实首词和末词时间重建字幕；1.1 倍速等时间变换只在一个映射函数中完成。
4. 检查接缝、爆音、吞字、字幕闪烁、重叠、单字悬挂、脸部遮挡和平台安全区。

## 输出

词级转写、字幕文件、工作音频和 QA 报告。

## 闸门

字幕、音频、画面和可选动效都引用同一个工作时间轴；完整解码和代表帧检查通过。动效默认关闭，只有当次明确要求才启用。

详见 [../references/editing-workflow.md](../references/editing-workflow.md) 与 [../modules/talking-head-video-pipeline/references/quality-gates.md](../modules/talking-head-video-pipeline/references/quality-gates.md)。

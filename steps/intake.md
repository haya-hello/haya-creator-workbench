# 02 素材接收与建档 / Intake

## 目标

建立一条可恢复任务，把素材、账号和输出目录绑定起来，同时保护原片。

## 输入

- 按拍摄顺序提供的一段或多段视频，或已有任务目录。
- 可选的脚本、字幕、截图和平台目标。

## 操作

1. 创建任务目录和状态文件；记录渠道、当前操作、显示比例、主音频和唯一正式输出位置。
2. 用 `ffprobe` 检查编码尺寸、旋转元数据、实际显示比例、帧率、时长和音频流，并查看代表帧。
3. 只登记原片路径，不覆盖、重命名或转码原片；混合比例、旋转冲突或没有主音频时停止。
4. 选择 `new-auto` 或 `revision`，再进入对应编辑模块。

## 输出

`edit/`、`preview/`、`final/`、`qa/` 目录，任务状态和工作流指纹。

## 闸门

任务能在中断后恢复；原片仍可读取；显示比例和音频基准已确定。

详见 [../references/installation.md](../references/installation.md) 与 [../modules/auto-talking-head-editor/SKILL.md](../modules/auto-talking-head-editor/SKILL.md)。

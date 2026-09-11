# 真人剪辑台分流

真人剪辑台按三个相互独立的维度路由，不能把画幅、入口和任务阶段混成一类。

## 1. 执行渠道

| `entry_channel` | 触发场景 | 约束 |
| --- | --- | --- |
| `codex-direct` | 用户在 Codex 对话中直接提供本地素材并要求剪辑 | 当前 Codex 直接操作正式任务目录；禁止转交网站或嵌套 Codex CLI |
| `web-upload` | 用户明确要求从本地网站上传、运行或测试网站流程 | 网站写入独立任务目录，再由网站后端调用 Codex CLI；不得读取历史任务素材 |

渠道只说明“本次从哪里执行”，不决定横竖版。锁文件同时保存首次建任务的 `origin_channel` 和当前操作的 `active_channel`。网站创建的任务可以在用户明确要求后切到 Codex 直接返修，但必须保留原始渠道记录并重新生成工作流指纹；没有明确要求网站时，当前操作默认 `codex-direct`。

## 2. 当前操作

| `operation` | 判断 | 主 Skill |
| --- | --- | --- |
| `new-auto` | 新提供原片，希望去气口、删重说、加好字幕和人声后直出；默认不加动效 | `auto-talking-head-editor` |
| `revision` | 已有任务，只改字幕、动效、剪点、音频或重新导出 | `talking-head-video-pipeline`，只重跑变化层 |
| `reference-build` | 目标是先复刻一张截图或参考视频中的效果 | 转到“参考动效实验室”，不在真人剪辑台内直接生产 |

当前操作可以变化，但既有任务的渠道、画幅和时间轴真源不能因此被重置。

## 3. 版式配置

| `layout_profile` | 自动识别 | 版式原则 |
| --- | --- | --- |
| `portrait-9x16` | 实际显示比例为 `9:16` | 独立竖版排版，默认只保留较大静态字幕；显式启用动效后才使用顶部与两侧安全区；禁止缩放复用横版布局 |
| `landscape-16x9` | 实际显示比例为 `16:9` | 独立横版排版，默认只保留较大静态字幕；显式启用动效后才向两侧展开并保护中间人脸；禁止缩放复用竖版布局 |
| `review-required` | 混合比例、非 9:16/16:9，或指定比例与原片冲突 | 停止并只确认构图选择，不自动裁切或拉伸 |

画幅必须读取编码尺寸、rotation/display matrix 和代表帧后决定。用户无需在任务入口手工分类；只有自动检测冲突时才确认。

## 工作流指纹

开始实际剪辑或返修前必须先运行 `scripts/Set-TalkingHeadWorkflowLock.ps1` 写入本次渠道与操作，再读取任务根目录 `.talking-head-workflow.json` 并向用户简要报告：

```text
原始渠道：codex-direct | web-upload
当前渠道：codex-direct | web-upload
当前操作：new-auto | revision
版式：portrait-9x16 | landscape-16x9 | review-required
主 Skill：auto-talking-head-editor | talking-head-video-pipeline
任务目录：绝对路径
唯一输出：final/ 中一个正式成片
```

锁文件状态为 `blocked` 时不得继续。锁文件不存在时，先运行 `scripts/Set-TalkingHeadWorkflowLock.ps1`；不得自行选择通用视频流程。

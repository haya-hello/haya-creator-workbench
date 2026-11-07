# 03 粗剪与工作片 / Edit

## 目标

从有序原片生成一个可审阅的工作时间轴，删除高置信度的气口、明确重复和未完成重说。

## 操作

1. 逐段转写并建立 EDL；记录源片、保留区间、删除理由、预期时长和歧义项。
2. 先按用户提供顺序串联；后一次完整重说覆盖前一次未完成表达时保留后一次。
3. 只删除高置信度内容；结论、否定、事实或语义变化不自动删除。
4. 把语义删除和自然气口合并成一个工作片，不生成多个互相竞争的“成片版本”。

## 输出

`edit/rough-cut-edl.json` 和唯一 `working_video`，以及需要用户确认的 `ambiguous_cuts`。

## 闸门

`ambiguous_cuts` 非空时停在 EDL 审核；没有歧义才进入字幕和设计。源片保持不变。

详见 [../references/editing-workflow.md](../references/editing-workflow.md) 与 [../modules/auto-talking-head-editor/SKILL.md](../modules/auto-talking-head-editor/SKILL.md)。

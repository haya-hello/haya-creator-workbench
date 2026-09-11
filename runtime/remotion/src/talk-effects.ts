import { generatedTalkCaptions } from "./talk-captions.generated";

export type TalkEffectType =
  | "hook-title"
  | "keyword-callout"
  | "chapter-bar"
  | "summary-card"
  | "lower-third"
  | "focus-frame"
  | "quote-card"
  | "stat-badge"
  | "split-compare"
  | "checklist-card"
  | "timeline-pin"
  | "question-bubble"
  | "definition-card"
  | "stacked-keywords"
  | "signal-scan"
  | "punchline-banner";

export type TalkMotionPreset = "rise" | "scale" | "slide-left" | "slide-right" | "scan" | "soft";

export type TalkCaption = {
  start: number;
  end: number;
  text: string;
  emphasis?: string;
};

export type TalkEffect = {
  id: string;
  type: TalkEffectType;
  start: number;
  duration: number;
  text: string;
  subtext?: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  accent?: string;
  stackId?: string;
  role?: "primary" | "supporting" | "accent";
  zIndex?: number;
  motion?: TalkMotionPreset;
};

export type TalkEffectStackItem = Omit<TalkEffect, "id" | "start" | "duration" | "stackId"> & {
  offset?: number;
  duration?: number;
};

export type TalkEffectStack = {
  id: string;
  start: number;
  duration: number;
  semanticTag: "number" | "list" | "compare" | "warning" | "process" | "confirmation" | "result" | "question" | "verify";
  effects: TalkEffectStackItem[];
};

// CN: 将一个语义段展开成主动效、辅助卡片和强调线的组合；EN: Expand one semantic segment into a primary effect plus supporting layers.
export const expandEffectStacks = (stacks: TalkEffectStack[]): TalkEffect[] =>
  stacks.flatMap((stack) =>
    stack.effects.map((effect, index) => ({
      ...effect,
      id: `${stack.id}-${index + 1}-${effect.type}`,
      stackId: stack.id,
      start: stack.start + (effect.offset ?? 0),
      duration: effect.duration ?? stack.duration,
    })),
  );

export type TalkVideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  sourceVideo: string;
  sourceFit: "cover" | "contain";
  title: string;
  speakerLabel: string;
  accent: string;
  stylePreset?: "default" | "text-editorial" | "codex-normal" | "codex-normal-rich" | "codex-reference-portrait";
  captionPreset?: "default" | "cover-xhs" | "cover-compact";
  captionBottom?: number;
  captionFontSize?: number;
  captionSideInset?: number;
  /** CN: 纯字幕模式禁用字幕自身的淡入淡出和进度线；EN: Caption-only mode disables caption fades and the progress line. */
  captionStatic?: boolean;
  /** CN: 仅放大动效组件，不改变字幕或源画面；EN: Scale motion components only, leaving captions and source untouched. */
  effectScale?: number;
};

export const talkVideoConfig: TalkVideoConfig = {
  width: 1080,
  height: 1920,
  fps: 60,
  durationSeconds: 85.64,
  // CN: 8 月 9 日八段口播已去明显气口、拼接，并转为 H.264 工作母版。
  // EN: The Aug 9 eight-part take is jump-cut, joined, and transcoded to an H.264 working master.
  sourceVideo: "assets/talk-source-0809-ai-quality-1080p-60fps.mp4",
  sourceFit: "cover",
  title: "AI 会做事后，人更该会验收",
  speakerLabel: "AI 实战记录",
  accent: "#7669ee",
  stylePreset: "text-editorial",
};

// CN: 这里是包装型重点字幕，不做逐字字幕，避免和原片字幕完全重复。
// EN: These are editorial caption strips, not word-by-word subtitles, to avoid duplicating burned-in captions.
const fallbackTalkCaptions: TalkCaption[] = [
  { start: 0.6, end: 6.8, text: "别觉得老师该主动找你，凭啥呀", emphasis: "凭啥呀" },
  { start: 8.5, end: 15.2, text: "为了见老师一面，我烦了他快一个月", emphasis: "快一个月" },
  { start: 23.0, end: 29.0, text: "发消息、约时间、被拒、再约", emphasis: "再约" },
  { start: 38.0, end: 45.5, text: "终于聊上了，在他办公室", emphasis: "终于" },
  { start: 51.5, end: 58.8, text: "体系改不了，就靠更灵活的方式补", emphasis: "更灵活" },
  { start: 60.0, end: 68.0, text: "社团是学生自己搞的，灵活", emphasis: "社团" },
  { start: 76.0, end: 84.8, text: "场地、实习、活动资源，老师都说会支持", emphasis: "会支持" },
  { start: 97.0, end: 105.2, text: "别总觉得老师应该主动来找你", emphasis: "主动" },
  { start: 116.0, end: 123.5, text: "学生先组织起来，学校才敢支持", emphasis: "先组织" },
  { start: 137.0, end: 145.2, text: "学生要早一点接触市场", emphasis: "市场" },
  { start: 158.0, end: 166.0, text: "科技园这件事，也说明了同一个问题", emphasis: "科技园" },
  { start: 178.0, end: 186.5, text: "资源一直在那儿，得你自己去够", emphasis: "自己去够" },
  { start: 204.0, end: 212.2, text: "学校不是没有资源，是你要开口", emphasis: "开口" },
  { start: 229.0, end: 237.5, text: "资源不会自己长脚跑来找你", emphasis: "不会" },
  { start: 247.0, end: 256.0, text: "别光等，主动去敲老师的门", emphasis: "主动" },
];

export const talkCaptions: TalkCaption[] =
  generatedTalkCaptions.length > 0 ? generatedTalkCaptions : fallbackTalkCaptions;

export const talkEffectsPlan: TalkEffect[] = [
  {
    id: "hook-judgement",
    type: "hook-title",
    start: 0,
    duration: 3.8,
    text: "AI开始自己做事后",
    subtext: "值钱的是判断",
    position: "top-right",
    accent: "#7669ee",
  },
  {
    id: "codex-is-not-the-approver",
    type: "quote-card",
    start: 7.95,
    duration: 3.8,
    text: "Codex 可以开始工作",
    subtext: "但不能替你验收结果",
    position: "top-left",
    accent: "#8b7cf6",
  },
  {
    id: "input-to-delivery",
    type: "timeline-pin",
    start: 15.883,
    duration: 4.2,
    text: "视频 + 剧本 -> 字幕 -> 节奏",
    subtext: "生成很快，但仍要回到画面里看",
    position: "top-right",
    accent: "#6579e8",
  },
  {
    id: "misjudgement",
    type: "quote-card",
    start: 27.1,
    duration: 4.1,
    text: "识别正确，也可能不适合",
    subtext: "定位音效、断句和节奏的问题",
    position: "top-right",
    accent: "#9276ff",
  },
  {
    id: "half-done",
    type: "stat-badge",
    start: 40.233,
    duration: 3.8,
    text: "半成品",
    subtext: "有输出，不代表有结果",
    position: "top-left",
    accent: "#667eea",
  },
  {
    id: "three-checks",
    type: "checklist-card",
    start: 49.916,
    duration: 4.4,
    text: "验收三步",
    subtext: "判断错在哪里 | 校验人声、音效、时间轴 | 逐段检查修改",
    position: "top-left",
    accent: "#8b7cf6",
  },
  {
    id: "define-good",
    type: "definition-card",
    start: 61.533,
    duration: 4.3,
    text: "定义什么叫做好",
    subtext: "知道哪里会出错，并有能力验收",
    position: "top-left",
    accent: "#6579e8",
  },
  {
    id: "real-project",
    type: "stacked-keywords",
    start: 72.65,
    duration: 4.6,
    text: "别先背一百个工具",
    subtext: "真实项目 | 从输入到交付 | 完整做一次",
    position: "top-right",
    accent: "#9276ff",
  },
];

// CN: 组合式动效示例，正式制作时根据当前文案替换文字与语义标签；EN: Example stack plan, replace copy and semantic tags for each script.
export const talkEffectStackPlan = expandEffectStacks([
  {
    id: "example-acceptance-stack",
    start: 0.6,
    duration: 4.4,
    semanticTag: "result",
    effects: [
      {
        type: "hook-title",
        text: "AI开始自己做事后",
        subtext: "值钱的是判断",
        position: "top-right",
        accent: "#7669ee",
        role: "primary",
        zIndex: 20,
      },
      {
        type: "keyword-callout",
        text: "判断",
        subtext: "先看结果，再决定是否交付",
        position: "bottom-left",
        accent: "#9b8cff",
        role: "supporting",
        offset: 0.55,
        duration: 3.2,
        zIndex: 21,
      },
    ],
  },
]);

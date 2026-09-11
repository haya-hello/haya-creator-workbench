import type {TalkCaption, TalkEffect, TalkVideoConfig} from "./talk-effects";

// CN: 任务运行器会在用户本地覆盖此数据，请勿提交真实字幕。
// EN: The local job runner replaces this data; never commit real captions.
export const autoTalkingHeadJobConfig: TalkVideoConfig = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 1,
  sourceVideo: "assets/auto-talking-head/working-talk-clean.mp4",
  sourceFit: "cover",
  title: "Talking-head video",
  speakerLabel: "Creator",
  accent: "#34d399",
  stylePreset: "text-editorial",
  captionPreset: "cover-compact",
  captionBottom: 230,
  captionFontSize: 56,
  captionSideInset: 90,
  captionStatic: true,
};

export const autoTalkingHeadJobCaptions: TalkCaption[] = [];
export const autoTalkingHeadJobEffects: TalkEffect[] = [];

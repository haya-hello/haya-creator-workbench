import React from "react";
import { AbsoluteFill } from "remotion";
import { TalkEnhancer } from "./TalkEnhancer";
import {
  autoTalkingHeadJobCaptions,
  autoTalkingHeadJobConfig,
  autoTalkingHeadJobEffects,
} from "./auto-talking-head-job-data";

// CN: 只渲染字幕和参考动效，避免逐帧重复解码真人底片。
// EN: Render captions and reference motion only to avoid decoding the talking-head master per frame.
export const AutoTalkingHeadOverlay: React.FC = () => (
  <TalkEnhancer
    config={autoTalkingHeadJobConfig}
    effects={autoTalkingHeadJobEffects}
    captions={autoTalkingHeadJobCaptions}
    sourceLayer={<AbsoluteFill style={{ backgroundColor: "transparent" }} />}
    transparentBackground
  />
);

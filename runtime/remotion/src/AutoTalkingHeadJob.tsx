import React from "react";
import { TalkEnhancer } from "./TalkEnhancer";
import {
  autoTalkingHeadJobCaptions,
  autoTalkingHeadJobConfig,
  autoTalkingHeadJobEffects,
} from "./auto-talking-head-job-data";

// CN: 通用自动真人剪辑合成入口；EN: Generic composition for automatic talking-head jobs.
export const AutoTalkingHeadJob: React.FC = () => (
  <TalkEnhancer
    config={autoTalkingHeadJobConfig}
    effects={autoTalkingHeadJobEffects}
    captions={autoTalkingHeadJobCaptions}
  />
);

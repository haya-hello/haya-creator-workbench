import React from "react";
import {Composition} from "remotion";
import {AutoTalkingHeadJob} from "./AutoTalkingHeadJob";
import {AutoTalkingHeadOverlay} from "./AutoTalkingHeadOverlay";
import {autoTalkingHeadJobConfig} from "./auto-talking-head-job-data";

// CN: 只注册通用自动口播合成，不携带任务专用素材。
// EN: Register only generic talking-head compositions without task-specific media.
export const RemotionRoot: React.FC = () => {
  const durationInFrames = Math.max(
    1,
    Math.ceil(autoTalkingHeadJobConfig.durationSeconds * autoTalkingHeadJobConfig.fps),
  );

  return (
    <>
      <Composition
        id="AutoTalkingHeadJob"
        component={AutoTalkingHeadJob}
        width={autoTalkingHeadJobConfig.width}
        height={autoTalkingHeadJobConfig.height}
        fps={autoTalkingHeadJobConfig.fps}
        durationInFrames={durationInFrames}
      />
      <Composition
        id="AutoTalkingHeadOverlay"
        component={AutoTalkingHeadOverlay}
        width={autoTalkingHeadJobConfig.width}
        height={autoTalkingHeadJobConfig.height}
        fps={autoTalkingHeadJobConfig.fps}
        durationInFrames={durationInFrames}
      />
    </>
  );
};

import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TalkCaption, TalkEffect, TalkEffectType, TalkMotionPreset, TalkVideoConfig } from "./talk-effects";
import { talkCaptions } from "./talk-effects";
import { CodexReferencePortraitEffect } from "./CodexReferencePortraitEffect";

type Props = {
  config: TalkVideoConfig;
  effects: TalkEffect[];
  captions?: TalkCaption[];
  sourceLayer?: React.ReactNode;
  midLayer?: React.ReactNode;
  transparentBackground?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getEffectProgress = (frame: number, fps: number, effect: TalkEffect) => {
  const startFrame = Math.round(effect.start * fps);
  const durationFrames = Math.round(effect.duration * fps);
  const localFrame = frame - startFrame;
  const visible = localFrame >= 0 && localFrame <= durationFrames;
  const enter = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 22, stiffness: 105, mass: 0.9 },
  });
  const exit = interpolate(localFrame, [durationFrames - 12, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return { visible, localFrame, enter, exit };
};

const activeCaption = (captions: TalkCaption[], second: number) =>
  captions.find((caption) => second >= caption.start && second < caption.end);

const positionStyle = (position: TalkEffect["position"], portrait = false): React.CSSProperties => {
  const edge = portrait ? 80 : 88;
  const top = portrait ? 120 : 96;
  if (position === "top-right") {
    return { top, right: edge };
  }
  if (position === "bottom-left") {
    return { left: edge, bottom: 430 };
  }
  if (position === "bottom-right") {
    return { right: edge, bottom: 430 };
  }
  if (position === "center") {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  return { top, left: edge };
};

const splitCaption = (caption: TalkCaption) => {
  if (!caption.emphasis || !caption.text.includes(caption.emphasis)) {
    return [{ text: caption.text, emphasis: false }];
  }

  const [before, after] = caption.text.split(caption.emphasis);
  return [
    { text: before, emphasis: false },
    { text: caption.emphasis, emphasis: true },
    { text: after, emphasis: false },
  ].filter((part) => part.text.length > 0);
};

const splitEffectText = (value?: string) =>
  (value ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

const groupMotionTransform = (motion: TalkMotionPreset | undefined, enter: number) => {
  const progress = interpolate(enter, [0, 1], [1, 0]);
  if (motion === "scale") {
    return `scale(${interpolate(enter, [0, 1], [0.86, 1])})`;
  }
  if (motion === "slide-left") {
    return `translateX(${progress * 38}px)`;
  }
  if (motion === "slide-right") {
    return `translateX(${-progress * 38}px)`;
  }
  if (motion === "scan") {
    return `translateX(${progress * 22}px)`;
  }
  if (motion === "soft") {
    return `translateY(${progress * 12}px)`;
  }
  return `translateY(${progress * 28}px)`;
};

const contentFont = "Arial, Microsoft YaHei UI, Microsoft YaHei, sans-serif";

// 中文：极光品牌渐变；英文：Aurora brand gradient inspired by the supplied logo.
const auroraGradient = "linear-gradient(112deg, #18d6c6 0%, #1598ff 36%, #3f5bed 70%, #a43de8 100%)";

const creatorTextShadow =
  "0 3px 0 rgba(0,0,0,0.62), 0 5px 9px rgba(0,0,0,0.65), -1px 0 rgba(0,0,0,0.5), 1px 0 rgba(0,0,0,0.5)";

const editorialLabel: Record<TalkEffectType, string> = {
  "hook-title": "KEY POINT",
  "keyword-callout": "HIGHLIGHT",
  "chapter-bar": "CHAPTER",
  "summary-card": "SUMMARY",
  "lower-third": "NOTE",
  "focus-frame": "FOCUS",
  "quote-card": "QUOTE",
  "stat-badge": "METRIC",
  "split-compare": "COMPARE",
  "checklist-card": "CHECKLIST",
  "timeline-pin": "PROCESS",
  "question-bubble": "QUESTION",
  "definition-card": "DEFINE",
  "stacked-keywords": "SIGNALS",
  "signal-scan": "SCAN",
  "punchline-banner": "TAKEAWAY",
};

const EditorialTextEffect: React.FC<{
  effect: TalkEffect;
  enter: number;
  exit: number;
  accent: string;
  portrait: boolean;
}> = ({ effect, enter, exit, accent, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = splitEffectText(effect.subtext);
  const accentColor = portrait ? accent : "#4db7ff";
  const accentBackground = portrait ? accent : auroraGradient;
  const editorialAuroraPosition = `${(frame / fps * 18) % 180}% 50%`;
  const isList = effect.type === "checklist-card" || effect.type === "stacked-keywords";
  const isProcess = effect.type === "timeline-pin";
  const isCompare = effect.type === "split-compare";
  const isMetric = effect.type === "stat-badge";
  const isQuote = effect.type === "quote-card";
  const isQuestion = effect.type === "question-bubble";
  const isDefinition = effect.type === "definition-card";
  const isScan = effect.type === "signal-scan";
  const isHeroHeader = effect.type === "hook-title" || effect.type === "chapter-bar";
  const isSupporting = effect.role === "supporting" || effect.role === "accent" || effect.type === "keyword-callout";
  const titleSize = isMetric
    ? (portrait ? 76 : 62)
    : effect.type === "hook-title"
      ? (portrait ? 76 : 78)
      : effect.type === "chapter-bar"
        ? (portrait ? 64 : 68)
        : isSupporting
          ? (portrait ? 34 : 25)
        : portrait
          ? 64
          : 38;
  const titleColor = isMetric || isQuestion ? accentColor : "#f8fafc";

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle(effect.position, portrait),
        width: isSupporting ? (portrait ? 620 : 520) : portrait ? 820 : isHeroHeader ? 900 : 760,
        opacity: exit,
        transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
        borderLeft: isQuote || isDefinition ? `${portrait ? 6 : 4}px solid ${accentColor}` : undefined,
        paddingLeft: isHeroHeader ? (portrait ? 28 : 24) : isQuote || isDefinition ? (portrait ? 24 : 18) : 0,
        color: "#f8fafc",
        fontFamily: contentFont,
        textShadow: creatorTextShadow,
      }}
    >
      <div
        style={{
          width: isHeroHeader ? 6 : isScan ? (portrait ? 180 : 120) : isSupporting ? (portrait ? 68 : 54) : portrait ? 112 : 76,
          height: isHeroHeader ? (portrait ? 106 : 96) : isSupporting ? (portrait ? 5 : 3) : portrait ? 8 : 5,
          marginBottom: isHeroHeader ? 0 : portrait ? 18 : 12,
          position: isHeroHeader ? "absolute" : "relative",
          left: isHeroHeader ? 0 : undefined,
          top: isHeroHeader ? 0 : undefined,
          background: isScan ? `linear-gradient(90deg, transparent, ${accentColor}, transparent)` : accentBackground,
          backgroundSize: portrait ? undefined : "220% 100%",
          backgroundPosition: portrait ? undefined : editorialAuroraPosition,
          boxShadow: isHeroHeader ? `0 0 0 1px rgba(255,255,255,0.12)` : `0 0 16px ${accentColor}66`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: portrait ? 14 : 10, color: "rgba(226, 232, 240, 0.76)", fontSize: isSupporting ? (portrait ? 15 : 13) : portrait ? 18 : 17, fontWeight: 900, letterSpacing: "0.2em" }}>
        <span>{editorialLabel[effect.type]}</span>
        {isHeroHeader ? <span style={{ color: accentColor, letterSpacing: "0.16em" }}>· 01</span> : null}
      </div>
      {isQuestion ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: portrait ? 20 : 14, marginTop: 8 }}>
          <span style={{ color: accentColor, fontSize: portrait ? 92 : 70, lineHeight: 0.8, fontWeight: 950 }}>?</span>
          <span style={{ color: titleColor, fontSize: titleSize, lineHeight: 1.08, fontWeight: 950, letterSpacing: "-0.03em", WebkitTextStroke: "0.7px rgba(0,0,0,0.36)" }}>{effect.text}</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, color: titleColor, fontSize: titleSize, lineHeight: 1.08, fontWeight: 950, fontStyle: isQuote ? "italic" : "normal", letterSpacing: "-0.03em", WebkitTextStroke: "0.7px rgba(0,0,0,0.36)" }}>
          {isQuote ? <span style={{ color: accentColor, marginRight: 8 }}>“</span> : null}
          {effect.text}
        </div>
      )}
      {isQuote ? <div style={{ marginTop: 4, color: "rgba(226, 232, 240, 0.7)", fontSize: portrait ? 22 : 17, letterSpacing: "0.12em" }}>SPOKEN NOTE</div> : null}
      {isCompare ? (
        <div style={{ display: "flex", gap: 24, marginTop: 18, color: "#f8fafc", fontSize: portrait ? 30 : 24, fontWeight: 850 }}>
          <span style={{ color: "rgba(226, 232, 240, 0.76)" }}>{items[0] ?? "旧方式"}</span>
          <span style={{ color: accentColor }}>→</span>
          <span style={{ color: accentColor }}>{items[1] ?? "新方式"}</span>
        </div>
      ) : isList ? (
        <div style={{ display: "grid", gap: portrait ? 12 : 8, marginTop: portrait ? 18 : 12 }}>
          {items.map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "baseline", gap: 12, color: "#f8fafc", fontSize: portrait ? 30 : 24, lineHeight: 1.22, fontWeight: 820 }}>
              <span style={{ color: accentColor, fontSize: portrait ? 24 : 18 }}>■</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : isProcess ? (
        <div style={{ marginTop: 14, color: "#f8fafc", fontSize: portrait ? 30 : 24, lineHeight: 1.28, fontWeight: 820 }}>
          {items.map((item, index) => <React.Fragment key={item}><span style={{ color: index === items.length - 1 ? accentColor : "#f8fafc" }}>{item}</span>{index < items.length - 1 ? <span style={{ color: accentColor, padding: "0 8px" }}>→</span> : null}</React.Fragment>)}
        </div>
      ) : items.length > 0 ? (
        <div style={{ marginTop: isHeroHeader ? 16 : isSupporting ? 6 : 10, color: accentColor, fontSize: isMetric ? (portrait ? 30 : 24) : isSupporting ? (portrait ? 22 : 16) : portrait ? 34 : isHeroHeader ? 32 : 27, lineHeight: 1.2, fontWeight: 900, borderLeft: isScan ? `2px solid ${accentColor}` : undefined, paddingLeft: isScan ? (portrait ? 16 : 12) : 0 }}>{items.join(" · ")}</div>
      ) : null}
    </div>
  );
};

const CodexNormalEffect: React.FC<{
  effect: TalkEffect;
  enter: number;
  exit: number;
  accent: string;
  portrait: boolean;
}> = ({ effect, enter, exit, accent, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - Math.round(effect.start * fps);
  const durationFrames = Math.max(1, Math.round(effect.duration * fps));
  const progress = clamp(localFrame / durationFrames, 0, 1);
  const items = splitEffectText(effect.subtext);
  const alignRight = effect.position?.includes("right") ?? false;
  const supporting = effect.role === "supporting" || effect.role === "accent" || effect.type === "keyword-callout";
  const titleSize = supporting
    ? effect.text.length > 12 ? 29 : 34
    : effect.text.length > 17 ? 36 : effect.text.length > 12 ? 41 : effect.text.length > 9 ? 47 : 54;

  return (
    <div
      style={{
        position: "absolute",
        top: portrait ? (supporting ? 292 : 112) : supporting ? 220 : 84,
        left: alignRight ? undefined : portrait ? 70 : 84,
        right: alignRight ? (portrait ? 70 : 84) : undefined,
        width: portrait ? (supporting ? 430 : 840) : supporting ? 420 : 760,
        opacity: exit,
        transform: `translateY(${interpolate(enter, [0, 1], [-24, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        transformOrigin: alignRight ? "right top" : "left top",
        fontFamily: contentFont,
      }}
    >
      <div style={{ color: accent, fontSize: 16, fontWeight: 950, letterSpacing: "0.14em" }}>
        {editorialLabel[effect.type]}
      </div>
      <div
        style={{
          marginTop: 10,
          padding: supporting ? "12px 18px 14px" : "18px 24px 20px",
          borderRadius: supporting ? 13 : 16,
          color: "#111827",
          background: "rgba(250,251,248,0.96)",
          border: "1px solid rgba(19,36,28,0.13)",
          boxShadow: "0 18px 42px rgba(0,0,0,0.24)",
          fontSize: portrait ? titleSize : Math.max(38, titleSize - 6),
          fontWeight: 950,
          lineHeight: 1.12,
          letterSpacing: "-0.035em",
        }}
      >
        {effect.text}
      </div>
      {items.length > 0 && !supporting ? (
        <div style={{ display: "grid", gridTemplateColumns: items.length === 2 ? "1fr 1fr" : "1fr", gap: 10, marginTop: 12 }}>
          {items.slice(0, 3).map((item, index) => {
            const itemEnter = spring({
              frame: localFrame - 8 - index * 11,
              fps,
              config: { damping: 20, stiffness: 118, mass: 0.82 },
            });
            const active = index === Math.min(items.length - 1, Math.floor(progress * items.length));
            return (
              <div
                key={`${effect.id}-${item}`}
                style={{
                  minHeight: 56,
                  padding: "12px 16px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  color: active ? "#062d1d" : "#26352f",
                  background: active ? `${accent}e8` : "rgba(250,251,248,0.94)",
                  border: `1px solid ${active ? accent : "rgba(19,36,28,0.12)"}`,
                  boxShadow: active ? `0 12px 30px ${accent}35` : "0 10px 24px rgba(0,0,0,0.16)",
                  fontSize: portrait ? 24 : 21,
                  fontWeight: 900,
                  opacity: itemEnter,
                  transform: `translateX(${interpolate(itemEnter, [0, 1], [alignRight ? 28 : -28, 0])}px) scale(${active ? 1.018 : 1})`,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      ) : null}
      <div style={{ height: supporting ? 3 : 4, marginTop: supporting ? 8 : 12, overflow: "hidden", borderRadius: 99, background: "rgba(255,255,255,0.28)" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 99, background: accent }} />
      </div>
    </div>
  );
};

// CN: 白绿工具感的扩展版：按语义类型给出不同结构，并把部分组件迁到左右中下区域；EN: White-green tool style with distinct semantic structures and lower side placements.
const CodexNormalRichEffect: React.FC<{
  effect: TalkEffect;
  enter: number;
  exit: number;
  accent: string;
  portrait: boolean;
}> = ({ effect, enter, exit, accent, portrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - Math.round(effect.start * fps);
  const items = splitEffectText(effect.subtext);
  const right = effect.position?.includes("right") ?? false;
  const lower = effect.position?.includes("bottom") ?? false;
  const x = right ? undefined : portrait ? 54 : 70;
  // CN: 竖屏下半区组件缩窄并贴左右，避开居中人脸和抬高后的字幕；EN: Portrait lower components stay narrow and lateral to protect the face and raised captions.
  const y = lower ? (portrait ? 1030 : 550) : portrait ? 250 : 96;
  const width = portrait ? (lower ? 300 : 650) : 710;
  const slide = interpolate(enter, [0, 1], [right ? 38 : -38, 0]);
  const shell: React.CSSProperties = {
    position: "absolute",
    top: y,
    left: x,
    right: right ? (portrait ? 54 : 70) : undefined,
    width,
    opacity: exit,
    transform: `translateX(${slide}px) translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
    fontFamily: contentFont,
    color: "#10261d",
  };
  const paper: React.CSSProperties = {
    background: "rgba(252,255,250,0.97)",
    border: `3px solid ${accent}`,
    boxShadow: "0 18px 42px rgba(8, 40, 25, 0.22)",
    borderRadius: 22,
  };
  const heading: React.CSSProperties = { fontSize: portrait ? 58 : 46, lineHeight: 1.04, fontWeight: 950, letterSpacing: "-0.055em" };
  const chips = (items.length ? items : ["关键词", "语义重点"]).slice(0, 3);
  const progress = clamp(localFrame / Math.max(1, Math.round(effect.duration * fps)), 0, 1);

  if (effect.type === "focus-frame") {
    return <div style={shell}><div style={{ ...paper, height: portrait ? 232 : 170, padding: 20, position: "relative" }}><div style={{ position: "absolute", inset: 16, border: `5px solid ${accent}`, borderRadius: 14, opacity: 0.85 }} /><div style={{ position: "relative", zIndex: 1, ...heading, textAlign: "center", paddingTop: portrait ? 55 : 32 }}>{effect.text}</div></div></div>;
  }
  if (effect.type === "split-compare") {
    const [leftText = "原来的做法", rightText = "更好的做法"] = chips;
    return <div style={shell}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><div style={{ ...paper, padding: 20, borderColor: "#d5dfd8", color: "#52645b", ...heading, fontSize: portrait ? 38 : 30 }}>{leftText}</div><div style={{ ...paper, padding: 20, background: `${accent}e8`, ...heading, fontSize: portrait ? 38 : 30 }}>{rightText}</div></div></div>;
  }
  if (effect.type === "checklist-card" || effect.type === "stacked-keywords") {
    return <div style={shell}><div style={{ ...paper, padding: 22 }}><div style={{ ...heading, fontSize: portrait ? 46 : 38 }}>{effect.text}</div><div style={{ display: "grid", gap: 10, marginTop: 18 }}>{chips.map((item, index) => <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: portrait ? 30 : 24, fontWeight: 900 }}><span style={{ width: 18, height: 18, borderRadius: effect.type === "stacked-keywords" ? 9 : 4, background: index === Math.floor(progress * chips.length) ? accent : "#d7e5dc" }} />{item}</div>)}</div></div></div>;
  }
  if (effect.type === "timeline-pin") {
    return <div style={shell}><div style={{ ...paper, padding: 22 }}><div style={{ ...heading, fontSize: portrait ? 44 : 36 }}>{effect.text}</div><div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>{chips.map((item, index) => <React.Fragment key={item}><div style={{ display: "grid", justifyItems: "center", gap: 6, fontSize: portrait ? 22 : 18, fontWeight: 850 }}><span style={{ width: 20, height: 20, borderRadius: 10, background: index <= Math.floor(progress * chips.length) ? accent : "#d7e5dc" }} />{item}</div>{index < chips.length - 1 ? <div style={{ flex: 1, height: 4, background: `${accent}88` }} /> : null}</React.Fragment>)}</div></div></div>;
  }
  if (effect.type === "stat-badge") {
    return <div style={shell}><div style={{ ...paper, padding: "18px 24px", display: "flex", alignItems: "center", gap: 18 }}><div style={{ color: accent, fontSize: portrait ? 88 : 66, lineHeight: 0.9, fontWeight: 950 }}>{effect.text}</div><div style={{ fontSize: portrait ? 30 : 24, lineHeight: 1.12, fontWeight: 900 }}>{chips.join("\n")}</div></div></div>;
  }
  if (effect.type === "question-bubble") {
    return <div style={shell}><div style={{ ...paper, padding: 24, borderRadius: 36 }}><div style={{ color: accent, fontSize: 26, fontWeight: 950 }}>QUESTION</div><div style={{ ...heading, marginTop: 8, fontSize: portrait ? 46 : 36 }}>{effect.text}</div></div></div>;
  }
  if (effect.type === "signal-scan") {
    return <div style={shell}><div style={{ ...paper, padding: 20, overflow: "hidden" }}><div style={{ height: 6, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, transform: `translateX(${interpolate(progress, [0, 1], [-40, 40])}%)` }} /><div style={{ ...heading, marginTop: 16, fontSize: portrait ? 43 : 34 }}>{effect.text}</div><div style={{ marginTop: 8, color: "#3d5a4b", fontSize: portrait ? 25 : 20, fontWeight: 800 }}>{chips.join(" · ")}</div></div></div>;
  }
  if (effect.type === "punchline-banner") {
    return <div style={{ ...shell, top: portrait ? 1090 : 640, width: portrait ? 900 : 1200, left: portrait ? 90 : 360, right: undefined }}><div style={{ ...paper, textAlign: "center", padding: "18px 28px", background: "rgba(252,255,250,0.98)", ...heading, fontSize: portrait ? 52 : 42 }}>{effect.text}</div></div>;
  }
  return <div style={shell}><div style={{ ...paper, padding: 22 }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 14, height: 14, borderRadius: 7, background: accent }} /><div style={{ color: "#43805d", fontSize: 20, fontWeight: 950, letterSpacing: "0.1em" }}>{editorialLabel[effect.type]}</div></div><div style={{ ...heading, marginTop: 12 }}>{effect.text}</div>{effect.subtext ? <div style={{ marginTop: 12, fontSize: portrait ? 28 : 22, lineHeight: 1.2, color: "#416151", fontWeight: 800 }}>{chips.join(" · ")}</div> : null}<div style={{ marginTop: 18, height: 5, borderRadius: 5, background: "#d6eadc" }}><div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 5, background: accent }} /></div></div></div>;
};

const EmptySourceSlate: React.FC<{ config: TalkVideoConfig }> = ({ config }) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #111827 0%, #18181b 48%, #0f172a 100%)",
      color: "#f8fafc",
      fontFamily: contentFont,
    }}
  >
    <div
      style={{
        width: 960,
        height: 540,
        border: "1px solid rgba(255,255,255,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 800 }}>{config.title}</div>
        <div style={{ marginTop: 18, fontSize: 24, color: "#cbd5e1" }}>
          将原片放入 public/assets 后填写 sourceVideo
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

const SourceVideoLayer: React.FC<{ config: TalkVideoConfig }> = ({ config }) => {
  if (!config.sourceVideo) {
    return <EmptySourceSlate config={config} />;
  }

  return (
    <AbsoluteFill style={{ background: "#030712" }}>
      <OffthreadVideo
        src={staticFile(config.sourceVideo)}
        muted={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: config.sourceFit,
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionBar: React.FC<{
  caption?: TalkCaption;
  accent: string;
  preset?: "default" | "cover-xhs" | "cover-compact";
  portraitBottom?: number;
  portraitFontSize?: number;
  portraitSideInset?: number;
  captionStatic?: boolean;
}> = ({ caption, accent, preset = "default", portraitBottom, portraitFontSize, portraitSideInset, captionStatic = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const xhsCover = preset === "cover-xhs" && !portrait;
  const compactCover = preset === "cover-compact" && !portrait;
  const displayAccent = xhsCover ? "#1769ff" : accent;
  const second = frame / fps;
  const auroraPosition = `${(second * 18) % 180}% 50%`;

  if (!caption) {
    return null;
  }

  const progress = clamp((second - caption.start) / Math.max(0.1, caption.end - caption.start), 0, 1);
  const introEnd = Math.min(caption.end, caption.start + 0.12);
  const outroStart = Math.max(caption.start, caption.end - 0.12);
  const cueIntro = interpolate(second, [caption.start, introEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cueOutro = interpolate(second, [outroStart, caption.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const parts = splitCaption(caption);

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 100,
        left: compactCover ? "50%" : portrait ? (portraitSideInset ?? 90) : xhsCover ? 0 : 120,
        right: compactCover ? "auto" : portrait ? (portraitSideInset ?? 90) : xhsCover ? 0 : 120,
        width: compactCover ? 1220 : undefined,
        bottom: portrait ? (portraitBottom ?? 230) : xhsCover ? 84 : 92,
        minHeight: portrait ? 112 : xhsCover ? 92 : 82,
        padding: portrait ? "20px 42px 18px" : xhsCover ? "16px 80px 22px" : "17px 38px 15px",
        opacity: captionStatic ? 1 : Math.min(cueIntro, cueOutro),
        transform: compactCover
          ? `translate(-50%, ${captionStatic ? 0 : interpolate(cueIntro, [0, 1], [8, 0])}px)`
          : `translateY(${captionStatic ? 0 : interpolate(cueIntro, [0, 1], [8, 0])}px)`,
        background: xhsCover || compactCover
          ? "linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.48) 16%, rgba(0,0,0,0.54) 50%, rgba(0,0,0,0.48) 84%, rgba(0,0,0,0.08))"
          : "linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.76) 14%, rgba(0,0,0,0.8) 86%, rgba(0,0,0,0.06))",
        boxShadow: xhsCover ? "0 8px 20px rgba(0,0,0,0.12)" : "0 10px 28px rgba(0,0,0,0.42)",
        backdropFilter: xhsCover ? "blur(2px)" : "blur(4px)",
        borderRadius: compactCover ? 18 : 0,
        border: xhsCover ? "1px solid rgba(112, 194, 255, 0.22)" : undefined,
      }}
    >
      <div
        style={{
          color: xhsCover ? "#fff8e8" : "#f8fafc",
          fontSize: portrait ? (portraitFontSize ?? 56) : xhsCover ? 46 : 48,
          lineHeight: 1.18,
          fontWeight: 860,
          textAlign: "center",
          // CN: 多行字幕采用均衡换行，避免末尾单字孤行。
          // EN: Balance multi-line captions to avoid a single orphan character on the last line.
          textWrap: "balance",
          fontFamily: contentFont,
          textShadow: xhsCover ? "0 2px 3px rgba(0,0,0,0.82), 0 0 8px rgba(0,0,0,0.34)" : "0 2px 4px rgba(0,0,0,0.86)",
          WebkitTextStroke: xhsCover ? "0.45px rgba(0,0,0,0.5)" : "0.5px rgba(0,0,0,0.5)",
        }}
      >
        {parts.map((part, index) => (
          <span
            key={`${part.text}-${index}`}
            style={{
              color: part.emphasis ? (xhsCover ? "#57d6f4" : displayAccent) : xhsCover ? "#fff8e8" : "#f8fafc",
              fontWeight: part.emphasis ? 950 : 860,
              textDecoration: xhsCover && part.emphasis ? "underline" : "none",
              textDecorationColor: xhsCover && part.emphasis ? "#57d6f4" : undefined,
              textDecorationThickness: xhsCover && part.emphasis ? 5 : undefined,
              textUnderlineOffset: xhsCover && part.emphasis ? 5 : undefined,
              textShadow: undefined,
              backgroundImage: undefined,
              backgroundSize: undefined,
              backgroundPosition: undefined,
              backgroundClip: undefined,
              WebkitBackgroundClip: undefined,
              WebkitTextFillColor: undefined,
            }}
          >
            {part.text}
          </span>
        ))}
      </div>
      {!captionStatic ? (
        <div
          style={{
            position: "absolute",
            left: xhsCover ? "50%" : portrait ? 86 : 112,
            right: xhsCover ? "auto" : portrait ? 86 : 112,
            bottom: 0,
            height: xhsCover ? 5 : portrait ? 4 : 3,
            width: xhsCover ? `${Math.max(42, progress * 560)}px` : `${progress * 100}%`,
            transform: xhsCover ? "translateX(-50%)" : undefined,
            background: xhsCover ? auroraGradient : `${displayAccent}dd`,
            backgroundSize: xhsCover ? "260% 100%" : undefined,
            backgroundPosition: xhsCover ? auroraPosition : undefined,
            boxShadow: undefined,
          }}
        />
      ) : null}
    </div>
  );
};

const HookTitle: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 840 : 620,
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`,
      color: "#f8fafc",
      fontFamily: contentFont,
    }}
  >
    <div style={{ height: portrait ? 10 : 8, width: portrait ? 128 : 96, background: accent, marginBottom: portrait ? 22 : 18, boxShadow: `0 0 18px ${accent}66` }} />
    <div
      style={{
        fontSize: portrait ? 76 : 54,
        lineHeight: 1.04,
        fontWeight: 950,
        letterSpacing: 0,
        textShadow: creatorTextShadow,
        WebkitTextStroke: "1px rgba(0,0,0,0.38)",
      }}
    >
      {effect.text}
    </div>
    {effect.subtext ? (
      <div
        style={{
          marginTop: 6,
          fontSize: portrait ? 62 : 44,
          lineHeight: 1.02,
          color: accent,
          fontWeight: 950,
          textShadow: creatorTextShadow,
          WebkitTextStroke: "1px rgba(0,0,0,0.35)",
        }}
      >
        {effect.subtext}
      </div>
    ) : null}
  </div>
);

const CompactPanel: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position),
      width: effect.type === "summary-card" ? 500 : 400,
      padding: effect.type === "summary-card" ? "30px 34px" : "22px 26px",
      opacity: exit,
      transform:
        effect.position === "center"
          ? `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [0.96, 1])})`
          : `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
      background: "rgba(15, 23, 42, 0.78)",
      borderLeft: `5px solid ${accent}`,
      borderTop: "1px solid rgba(255,255,255,0.14)",
      borderRight: "1px solid rgba(255,255,255,0.1)",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 20px 54px rgba(0,0,0,0.32)",
      backdropFilter: "blur(10px)",
      color: "#f8fafc",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ fontSize: effect.type === "summary-card" ? 38 : 30, lineHeight: 1.15, fontWeight: 820 }}>
      {effect.text}
    </div>
    {effect.subtext ? (
      <div style={{ marginTop: 12, fontSize: effect.type === "summary-card" ? 24 : 20, lineHeight: 1.32, color: "#cbd5e1" }}>
        {effect.subtext}
      </div>
    ) : null}
  </div>
);

const ChapterBar: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position),
      width: 560,
      height: 86,
      opacity: exit,
      transform: `translateX(${interpolate(enter, [0, 1], [26, 0])}px)`,
      display: "grid",
      gridTemplateColumns: "150px 1fr",
      background: "rgba(3, 7, 18, 0.78)",
      border: "1px solid rgba(255,255,255,0.16)",
      boxShadow: "0 18px 48px rgba(0,0,0,0.34)",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#111827",
        background: accent,
        fontSize: 24,
        fontWeight: 860,
      }}
    >
      {effect.text}
    </div>
    <div style={{ display: "flex", alignItems: "center", padding: "0 24px", color: "#f8fafc", fontSize: 20 }}>
      {effect.subtext}
    </div>
  </div>
);

const FocusFrame: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      left: 180,
      top: 560,
      width: 1080,
      height: 620,
      opacity: exit,
      transform: `scale(${interpolate(enter, [0, 1], [0.985, 1])})`,
      border: `3px solid ${accent}`,
      boxShadow: `0 0 0 999px rgba(2, 6, 23, 0.16), 0 0 34px ${accent}55`,
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: -54,
        padding: "10px 16px",
        background: accent,
        color: "#111827",
        fontSize: 20,
        fontWeight: 800,
      }}
    >
      {effect.text}
    </div>
  </div>
);

const QuoteCard: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 820 : 520,
      padding: portrait ? "38px 44px 40px" : "28px 34px 30px",
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
      background: "rgba(2, 6, 23, 0.72)",
      borderTop: `4px solid ${accent}`,
      boxShadow: "0 20px 56px rgba(0,0,0,0.32)",
      backdropFilter: "blur(12px)",
      color: "#f8fafc",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ color: accent, fontSize: portrait ? 64 : 46, lineHeight: 0.8, fontWeight: 900 }}>“</div>
    <div style={{ marginTop: 8, fontSize: portrait ? 50 : 34, lineHeight: 1.18, fontWeight: 840 }}>{effect.text}</div>
    {effect.subtext ? <div style={{ marginTop: portrait ? 18 : 14, color: "#cbd5e1", fontSize: portrait ? 30 : 20, lineHeight: 1.35 }}>{effect.subtext}</div> : null}
  </div>
);

const StatBadge: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 620 : 360,
      padding: portrait ? "32px 36px" : "22px 26px",
      opacity: exit,
      transform: `scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
      background: "rgba(248, 250, 252, 0.92)",
      boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
      color: "#0f172a",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ color: accent, fontSize: portrait ? 78 : 52, lineHeight: 1, fontWeight: 920 }}>{effect.text}</div>
    {effect.subtext ? <div style={{ marginTop: portrait ? 14 : 8, fontSize: portrait ? 30 : 20, lineHeight: 1.3, fontWeight: 760 }}>{effect.subtext}</div> : null}
  </div>
);

const SplitCompare: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => {
  const items = splitEffectText(effect.subtext);
  const [left = "旧方式", right = "新方式"] = items;

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle(effect.position),
        width: 620,
        opacity: exit,
        transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        fontFamily: "Arial, Microsoft YaHei, sans-serif",
        color: "#f8fafc",
      }}
    >
      <div style={{ marginBottom: 12, fontSize: 24, fontWeight: 820 }}>{effect.text}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[left, right].map((item, index) => (
          <div
            key={item}
            style={{
              padding: "20px 22px",
              background: index === 0 ? "rgba(15,23,42,0.72)" : `${accent}e6`,
              color: index === 0 ? "#e5e7eb" : "#0f172a",
              border: "1px solid rgba(255,255,255,0.14)",
              fontSize: 22,
              lineHeight: 1.25,
              fontWeight: 800,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

const ChecklistCard: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => {
  const items = splitEffectText(effect.subtext);

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle(effect.position, portrait),
        width: portrait ? 820 : 500,
        padding: portrait ? "34px 38px" : "24px 28px",
        opacity: exit,
        transform: `translateX(${interpolate(enter, [0, 1], [-18, 0])}px)`,
        background: "rgba(3, 7, 18, 0.76)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.32)",
        backdropFilter: "blur(10px)",
        color: "#f8fafc",
        fontFamily: "Arial, Microsoft YaHei, sans-serif",
      }}
    >
      <div style={{ fontSize: portrait ? 46 : 30, lineHeight: 1.18, fontWeight: 840 }}>{effect.text}</div>
      <div style={{ marginTop: portrait ? 22 : 16, display: "grid", gap: portrait ? 14 : 10 }}>
        {items.map((item) => (
          <div key={item} style={{ display: "grid", gridTemplateColumns: portrait ? "24px 1fr" : "18px 1fr", gap: portrait ? 16 : 12, alignItems: "start" }}>
            <div style={{ width: portrait ? 16 : 12, height: portrait ? 16 : 12, marginTop: portrait ? 10 : 8, background: accent }} />
            <div style={{ color: "#cbd5e1", fontSize: portrait ? 28 : 20, lineHeight: 1.28, fontWeight: 680 }}>{item}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TimelinePin: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 840 : 560,
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [14, 0])}px)`,
      color: "#f8fafc",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ height: portrait ? 5 : 3, background: "rgba(255,255,255,0.18)" }}>
      <div style={{ width: `${interpolate(enter, [0, 1], [8, 74])}%`, height: "100%", background: accent }} />
    </div>
    <div style={{ marginTop: portrait ? 20 : 14, display: "flex", gap: portrait ? 20 : 14, alignItems: "center" }}>
      <div style={{ width: portrait ? 20 : 14, height: portrait ? 20 : 14, background: accent }} />
      <div style={{ fontSize: portrait ? 42 : 28, lineHeight: 1.15, fontWeight: 840 }}>{effect.text}</div>
    </div>
    {effect.subtext ? <div style={{ marginTop: portrait ? 12 : 8, marginLeft: portrait ? 40 : 28, fontSize: portrait ? 27 : 19, color: "#cbd5e1" }}>{effect.subtext}</div> : null}
  </div>
);

const QuestionBubble: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position),
      width: 470,
      padding: "24px 28px",
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
      background: "rgba(255, 255, 255, 0.9)",
      color: "#0f172a",
      boxShadow: "0 20px 52px rgba(0,0,0,0.26)",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ color: accent, fontSize: 20, fontWeight: 900 }}>QUESTION</div>
    <div style={{ marginTop: 8, fontSize: 30, lineHeight: 1.18, fontWeight: 860 }}>{effect.text}</div>
    {effect.subtext ? <div style={{ marginTop: 10, color: "#475569", fontSize: 20, lineHeight: 1.32 }}>{effect.subtext}</div> : null}
  </div>
);

const DefinitionCard: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 820 : 520,
      padding: portrait ? "32px 38px 36px" : "22px 28px 26px",
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
      background: "rgba(15, 23, 42, 0.8)",
      border: `1px solid ${accent}88`,
      boxShadow: `0 18px 54px rgba(0,0,0,0.32), inset 0 0 0 1px ${accent}22`,
      backdropFilter: "blur(10px)",
      color: "#f8fafc",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div style={{ color: accent, fontSize: portrait ? 24 : 18, fontWeight: 900 }}>DEFINE</div>
    <div style={{ marginTop: portrait ? 14 : 10, fontSize: portrait ? 52 : 36, lineHeight: 1.12, fontWeight: 860 }}>{effect.text}</div>
    {effect.subtext ? <div style={{ marginTop: portrait ? 18 : 12, color: "#dbeafe", fontSize: portrait ? 29 : 20, lineHeight: 1.34 }}>{effect.subtext}</div> : null}
  </div>
);

const StackedKeywords: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => {
  const items = splitEffectText(effect.subtext);

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle(effect.position, portrait),
        width: portrait ? 840 : 460,
        opacity: exit,
        transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        fontFamily: "Arial, Microsoft YaHei, sans-serif",
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: portrait ? 46 : 28, lineHeight: 1.16, fontWeight: 840 }}>{effect.text}</div>
      <div style={{ marginTop: portrait ? 20 : 14, display: "flex", flexWrap: "wrap", gap: portrait ? 14 : 10 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              padding: portrait ? "14px 20px" : "10px 14px",
              background: "rgba(3, 7, 18, 0.76)",
              borderBottom: `3px solid ${accent}`,
              color: "#f8fafc",
              fontSize: portrait ? 28 : 20,
              fontWeight: 780,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

const SignalScan: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string; portrait: boolean }> = ({
  effect,
  enter,
  exit,
  accent,
  portrait,
}) => (
  <div
    style={{
      position: "absolute",
      ...positionStyle(effect.position, portrait),
      width: portrait ? 840 : 520,
      height: portrait ? 148 : 96,
      opacity: exit,
      transform: `translateX(${interpolate(enter, [0, 1], [24, 0])}px)`,
      overflow: "hidden",
      background: "rgba(2, 6, 23, 0.7)",
      border: "1px solid rgba(255,255,255,0.14)",
      color: "#f8fafc",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: portrait ? 140 : 90,
        left: `${interpolate(enter, [0, 1], [-18, 100])}%`,
        background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`,
      }}
    />
    <div style={{ position: "absolute", left: portrait ? 34 : 24, top: portrait ? 26 : 18, fontSize: portrait ? 40 : 26, lineHeight: 1.15, fontWeight: 840 }}>{effect.text}</div>
    {effect.subtext ? <div style={{ position: "absolute", left: portrait ? 34 : 24, top: portrait ? 84 : 54, color: "#cbd5e1", fontSize: portrait ? 26 : 18 }}>{effect.subtext}</div> : null}
  </div>
);

const PunchlineBanner: React.FC<{ effect: TalkEffect; enter: number; exit: number; accent: string }> = ({
  effect,
  enter,
  exit,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 180,
      opacity: exit,
      transform: `translateY(${interpolate(enter, [0, 1], [-20, 0])}px)`,
      padding: "20px 88px",
      background: `linear-gradient(90deg, rgba(2,6,23,0.12), ${accent}ee, rgba(2,6,23,0.12))`,
      color: "#0f172a",
      textAlign: "center",
      fontFamily: "Arial, Microsoft YaHei, sans-serif",
      fontSize: 34,
      lineHeight: 1.18,
      fontWeight: 900,
      boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
    }}
  >
    {effect.text}
  </div>
);

const EffectLayer: React.FC<{ effect: TalkEffect; config: TalkVideoConfig }> = ({ effect, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { visible, enter, exit } = getEffectProgress(frame, fps, effect);
  const accent = effect.accent ?? config.accent;
  const portrait = config.height > config.width;
  const effectScale = config.effectScale ?? 1;

  if (!visible) {
    return null;
  }

  let renderedEffect: React.ReactNode;
  if (config.stylePreset === "codex-normal") {
    renderedEffect = <CodexNormalEffect effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (config.stylePreset === "codex-normal-rich") {
    renderedEffect = <CodexNormalRichEffect effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (config.stylePreset === "codex-reference-portrait" && portrait) {
    renderedEffect = <CodexReferencePortraitEffect effect={effect} enter={enter} exit={exit} accent={accent} config={config} />;
  } else if (config.stylePreset === "text-editorial") {
    renderedEffect = <EditorialTextEffect effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "hook-title") {
    renderedEffect = <HookTitle effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "chapter-bar") {
    renderedEffect = <ChapterBar effect={effect} enter={enter} exit={exit} accent={accent} />;
  } else if (effect.type === "focus-frame") {
    renderedEffect = <FocusFrame effect={effect} enter={enter} exit={exit} accent={accent} />;
  } else if (effect.type === "quote-card") {
    renderedEffect = <QuoteCard effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "stat-badge") {
    renderedEffect = <StatBadge effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "split-compare") {
    renderedEffect = <SplitCompare effect={effect} enter={enter} exit={exit} accent={accent} />;
  } else if (effect.type === "checklist-card") {
    renderedEffect = <ChecklistCard effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "timeline-pin") {
    renderedEffect = <TimelinePin effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "question-bubble") {
    renderedEffect = <QuestionBubble effect={effect} enter={enter} exit={exit} accent={accent} />;
  } else if (effect.type === "definition-card") {
    renderedEffect = <DefinitionCard effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "stacked-keywords") {
    renderedEffect = <StackedKeywords effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "signal-scan") {
    renderedEffect = <SignalScan effect={effect} enter={enter} exit={exit} accent={accent} portrait={portrait} />;
  } else if (effect.type === "punchline-banner") {
    renderedEffect = <PunchlineBanner effect={effect} enter={enter} exit={exit} accent={accent} />;
  } else {
    renderedEffect = <CompactPanel effect={effect} enter={enter} exit={exit} accent={accent} />;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: effect.zIndex ?? (effect.role === "primary" ? 20 : 10),
        pointerEvents: "none",
        // CN: 动效整体可单独放大，字幕与源画面仍保持原尺寸；EN: Motion can scale independently while captions and source stay unchanged.
        transform: `${groupMotionTransform(effect.motion, enter)} scale(${effectScale})`,
        transformOrigin: "center center",
      }}
    >
      {renderedEffect}
    </div>
  );
};

export const TalkEnhancer: React.FC<Props> = ({
  config,
  effects,
  captions = talkCaptions,
  sourceLayer,
  midLayer,
  transparentBackground = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = frame / fps;
  const caption = activeCaption(captions, second);

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: transparentBackground ? "transparent" : "#030712" }}>
      {sourceLayer ?? <SourceVideoLayer config={config} />}
      {!transparentBackground ? (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(3,7,18,0.18) 0%, rgba(3,7,18,0.02) 45%, rgba(3,7,18,0.34) 100%)",
          }}
        />
      ) : null}

      {effects.map((effect) => (
        <EffectLayer key={effect.id} effect={effect} config={config} />
      ))}

      {midLayer}

      <CaptionBar
        caption={caption}
        accent={config.accent}
        preset={config.captionPreset}
        portraitBottom={config.captionBottom}
        portraitFontSize={config.captionFontSize}
        portraitSideInset={config.captionSideInset}
        captionStatic={config.captionStatic}
      />
    </AbsoluteFill>
  );
};

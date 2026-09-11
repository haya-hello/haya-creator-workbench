import React from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { TalkEffect, TalkVideoConfig } from "./talk-effects";

// CN: 仅用于本地真人剪辑项目的竖版参考动效，不作为公开通用默认样式。
// EN: Portrait reference motion for the local talking-head project only, not a public default.
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const font = 'Arial, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
const mint = "#98f4b9";
const ink = "#122219";

const words = (value?: string) => (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);

export const CodexReferencePortraitEffect: React.FC<{
  effect: TalkEffect;
  enter: number;
  exit: number;
  accent: string;
  config: TalkVideoConfig;
}> = ({ effect, enter, exit, accent, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - Math.round(effect.start * fps));
  const move = interpolate(enter, [0, 1], [62, 0], clamp);
  const base: React.CSSProperties = { position: "absolute", opacity: exit, fontFamily: font, color: ink };
  const chips = words(effect.subtext);
  const card: React.CSSProperties = { background: "rgba(255,255,255,.97)", border: "2px solid #d8f5e1", boxShadow: "0 16px 36px rgba(9,42,24,.22)" };

  if (effect.type === "hook-title") {
    const rows = [effect.text, ...chips].slice(0, 3);
    return <div style={{ ...base, top: 132, left: 38, right: 38, transform: `translateY(${move}px)` }}>
      {rows.map((row, index) => {
        const p = interpolate(local, [index * 10, index * 10 + 20], [0, 1], clamp);
        return <div key={row} style={{ width: index === 1 ? "72%" : index === 2 ? "82%" : "64%", marginLeft: index === 1 ? "28%" : 0, marginTop: index ? 17 : 0, padding: "17px 22px", boxSizing: "border-box", borderRadius: 8, background: index === rows.length - 1 ? mint : "rgba(255,255,255,.96)", boxShadow: "0 13px 27px rgba(0,0,0,.2)", fontSize: index === 0 ? 37 : 29, lineHeight: 1.15, fontWeight: 950, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [index % 2 ? 180 : -180, 0])}px)` }}>{row}</div>;
      })}
    </div>;
  }

  if (effect.type === "checklist-card") {
    const rows = chips.length ? chips : ["明确问题", "展示过程", "落到结论"];
    return <div style={{ ...base, top: 730, left: 54, width: 465, transform: `translateX(${-move}px)` }}>
      <div style={{ color: "#2e9660", fontSize: 18, fontWeight: 950, letterSpacing: ".13em" }}>NOTE STACK</div>
      {rows.slice(0, 3).map((row, index) => <div key={row} style={{ ...card, marginTop: 14, padding: "19px 21px", borderLeft: `10px solid ${index === 2 ? mint : accent}`, fontSize: 31, fontWeight: 950, transform: `translateX(${index * 17}px)` }}>{row}</div>)}
    </div>;
  }

  if (effect.type === "split-compare") {
    const [left = "只讲安装", right = "接到业务"] = chips;
    return <div style={{ ...base, left: 54, right: 54, top: 840, transform: `translateY(${move}px)` }}>
      <div style={{ color: "#fff", fontSize: 22, fontWeight: 950, textShadow: "0 2px 7px #000" }}>A / B 对照</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
        <div style={{ ...card, padding: "22px 18px", color: "#64746a", fontSize: 34, lineHeight: 1.14, fontWeight: 950 }}>{left}</div>
        <div style={{ padding: "22px 18px", background: mint, border: `2px solid ${mint}`, boxShadow: "0 16px 36px rgba(9,42,24,.24)", fontSize: 34, lineHeight: 1.14, fontWeight: 950 }}>{right}</div>
      </div>
    </div>;
  }

  if (effect.type === "timeline-pin") {
    const steps = chips.length ? chips : ["提取", "Excel", "定时总结"];
    return <div style={{ ...base, left: 52, right: 52, bottom: 500, transform: `translateY(${move}px)` }}>
      <div style={{ ...card, padding: "23px 24px" }}><div style={{ fontSize: 42, fontWeight: 950 }}>{effect.text}</div><div style={{ display: "flex", alignItems: "center", marginTop: 24 }}>{steps.slice(0, 3).map((step, index) => <React.Fragment key={step}><div style={{ display: "grid", justifyItems: "center", gap: 8, flex: 1, fontSize: 24, fontWeight: 900, textAlign: "center" }}><span style={{ width: 26, height: 26, borderRadius: "50%", background: index <= Math.floor(local / Math.max(1, effect.duration * fps / 3)) ? mint : "#d8e8dc" }} />{step}</div>{index < steps.length - 1 ? <div style={{ width: 30, height: 5, background: "#9ce8b5" }} /> : null}</React.Fragment>)}</div></div>
    </div>;
  }

  if (effect.type === "quote-card") {
    return <AbsoluteFill style={{ opacity: exit, background: "linear-gradient(145deg,#dffff0,#f9fffb 52%,#b9f4cc)", fontFamily: font }}>
      <div style={{ position: "absolute", left: 46, right: 46, top: 142, padding: "42px 36px", minHeight: 940, boxSizing: "border-box", background: "#fff", border: "2px solid #cbeed5", boxShadow: "0 28px 66px rgba(27,100,54,.2)", transform: `translateY(${move}px)` }}><div style={{ color: "#2b8d52", fontSize: 19, fontWeight: 950, letterSpacing: ".15em" }}>REAL WORKFLOW</div><div style={{ marginTop: 17, fontSize: 54, lineHeight: 1.1, fontWeight: 950 }}>{effect.text}</div>{(chips.length ? chips : ["业务数据", "Excel", "每日总结"]).slice(0, 3).map((line, index) => <div key={line} style={{ marginTop: 26, padding: "22px 24px", border: "1px solid #d8eadc", background: index === 2 ? "#edfff2" : "#fff", fontSize: 31, fontWeight: 900 }}><span style={{ color: "#318b53", marginRight: 13 }}>0{index + 1}</span>{line}</div>)}</div>
      <div style={{ position: "absolute", left: 58, bottom: 282, width: 176, height: 176, overflow: "hidden", borderRadius: "50%", border: `8px solid ${mint}`, boxShadow: "0 18px 42px rgba(0,0,0,.25)" }}><OffthreadVideo src={staticFile(config.sourceVideo)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.42)" }} /></div>
    </AbsoluteFill>;
  }

  if (effect.type === "stacked-keywords") {
    const rows = chips.length ? chips : ["需求", "工具", "业务", "价值"];
    return <div style={{ ...base, left: 52, right: 52, top: 202, transform: `translateY(${move}px)` }}><div style={{ fontSize: 48, lineHeight: 1.1, fontWeight: 950, color: "#fff", textShadow: "0 2px 9px #000" }}>{effect.text}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginTop: 25 }}>{rows.slice(0, 4).map((row, index) => <div key={row} style={{ ...card, minHeight: 168, padding: 20, transform: `translateY(${index % 2 ? 15 : 0}px)`, fontSize: 35, fontWeight: 950 }}><div style={{ color: "#3b9b5b", fontSize: 17, letterSpacing: ".1em" }}>EVIDENCE 0{index + 1}</div><div style={{ marginTop: 24 }}>{row}</div></div>)}</div></div>;
  }

  if (effect.type === "question-bubble") {
    const rows = [effect.text, ...chips].slice(0, 3);
    return <div style={{ ...base, left: 56, right: 56, top: 360, transform: `translateY(${move}px)` }}>{rows.map((row, index) => <div key={row} style={{ width: index === 1 ? "80%" : "67%", marginLeft: index === 1 ? "20%" : 0, marginTop: index ? 20 : 0, padding: "19px 23px", borderRadius: 60, background: index === rows.length - 1 ? mint : "#fff", boxShadow: "0 13px 28px rgba(0,0,0,.22)", fontSize: 35, lineHeight: 1.18, fontWeight: 950 }}>{row}</div>)}</div>;
  }

  return <div style={{ ...base, left: 54, right: 54, bottom: 470, transform: `translateY(${move}px)` }}><div style={{ padding: "23px 27px", borderLeft: `14px solid ${mint}`, background: "rgba(255,255,255,.97)", boxShadow: "0 16px 35px rgba(0,0,0,.2)", fontSize: 47, lineHeight: 1.1, fontWeight: 950 }}>{effect.text}</div></div>;
};

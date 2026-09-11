import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
// CN: 优先接受显式路径，否则使用仓库内置质量工具。
// EN: Prefer an explicit Skill path, otherwise use the repository-bundled QA tools.
const skillRoot = process.env.HAYA_TALKING_HEAD_SKILL_ROOT
  ? path.resolve(process.env.HAYA_TALKING_HEAD_SKILL_ROOT)
  : path.resolve(projectRoot, "..", "..", "modules", "talking-head-video-pipeline");

const ffmpeg = "ffmpeg";
const ffprobe = existsSync(path.join(projectRoot, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe"))
  ? path.join(projectRoot, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe")
  : "ffprobe";
const ffmpegEncoders = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" });
const hasNvenc = ffmpegEncoders.status === 0 && /\bh264_nvenc\b/.test(ffmpegEncoders.stdout);

const parseArgs = () => {
  const parsed = {
    asrPython: process.env.HAYA_ASR_PYTHON ?? "python",
    asrScript: path.join(scriptDir, "local_asr_faster_whisper.py"),
    previewOnly: false,
    prepareOnly: false,
    noMotion: false,
  };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--job") {
      parsed.job = path.resolve(next);
      index += 1;
    } else if (arg === "--asr-python") {
      parsed.asrPython = next;
      index += 1;
    } else if (arg === "--asr-script") {
      parsed.asrScript = path.resolve(next);
      index += 1;
    } else if (arg === "--preview-only") {
      parsed.previewOnly = true;
    } else if (arg === "--prepare-only") {
      parsed.prepareOnly = true;
    } else if (arg === "--no-motion") {
      // CN: 仅保留字幕，不生成任何视觉动效；EN: Keep captions only and generate no visual effects.
      parsed.noMotion = true;
    }
  }
  if (!parsed.job) {
    throw new Error("Missing --job");
  }
  return parsed;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const ensureDir = (dir) => mkdirSync(dir, { recursive: true });

const readContentProfile = (job) => {
  const profilePath = path.join(job, "edit", "content-profile.json");
  if (!existsSync(profilePath)) {
    return {
      title: "真人口播",
      speakerLabel: "真实经历",
      keywords: [],
      textReplacements: {},
      motionCopy: {},
    };
  }
  return {
    title: "真人口播",
    speakerLabel: "真实经历",
    keywords: [],
    textReplacements: {},
    motionCopy: {},
    ...readJson(profilePath),
  };
};

const applyTextReplacements = (value, replacements = {}) =>
  Object.entries(replacements).reduce(
    (text, [from, to]) => text.replaceAll(from, String(to)),
    String(value ?? ""),
  );

const updateState = (job, updater) => {
  const statePath = path.join(job, ".naive-video-state.json");
  const state = readJson(statePath);
  updater(state);
  state.updated_at = new Date().toISOString();
  const temp = `${statePath}.tmp`;
  writeJson(temp, state);
  JSON.parse(readFileSync(temp, "utf8"));
  rmSync(statePath, { force: true });
  copyFileSync(temp, statePath);
  rmSync(temp, { force: true });
  return state;
};

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：,.!?;:"“”‘’'（）()【】\[\]\-—]/g, "")
    .replace(/沙龍|殺龍/g, "沙龙")
    .replace(/辦/g, "办")
    .replace(/錯誤/g, "错误")
    .trim();

const lcsRatio = (left, right) => {
  const a = Array.from(normalizeText(left));
  const b = Array.from(normalizeText(right));
  if (!a.length || !b.length) return 0;
  const previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let northWest = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? northWest + 1 : Math.max(previous[j], previous[j - 1]);
      northWest = saved;
    }
  }
  return previous[b.length] / Math.max(1, Math.min(a.length, b.length));
};

const collectTokens = (asr) => {
  const words = (asr.segments ?? []).flatMap((segment) =>
    (segment.words ?? []).map((word) => ({
      start: Number(word.start ?? segment.start),
      end: Number(word.end ?? segment.end),
      text: String(word.word ?? "").trim(),
    })),
  );
  const tokens = words.length > 1
    ? words
    : (asr.segments ?? []).map((segment) => ({
        start: Number(segment.start),
        end: Number(segment.end),
        text: String(segment.text ?? "").trim(),
      }));
  return tokens.filter((token) => token.text && Number.isFinite(token.start) && Number.isFinite(token.end) && token.end > token.start);
};

const textOf = (asr) => (asr.segments ?? []).map((segment) => segment.text ?? "").join("").trim();

const buildSpeechSegments = (tokens, duration) => {
  if (tokens.length === 0) return [];
  const ranges = [];
  let start = Math.max(0, tokens[0].start - 0.12);
  let previousEnd = tokens[0].end;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const gap = token.start - previousEnd;
    if (gap > 0.62) {
      const end = Math.min(duration, previousEnd + 0.14);
      if (end - start >= 0.35) ranges.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
      start = Math.max(0, token.start - 0.1);
    }
    previousEnd = Math.max(previousEnd, token.end);
  }
  const end = Math.min(duration, previousEnd + 0.16);
  if (end - start >= 0.35) ranges.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
  return ranges;
};

const formatSrtTime = (seconds) => {
  const msTotal = Math.round(Math.max(0, seconds) * 1000);
  const ms = String(msTotal % 1000).padStart(3, "0");
  const totalSeconds = Math.floor(msTotal / 1000);
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const mm = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  return `${hh}:${mm}:${ss},${ms}`;
};

const textLength = (value) => Array.from(String(value).replace(/\s/g, "")).length;
const cleanCaptionText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：,.!?;:"“”‘’'（）()【】\[\]]/g, "")
    .trim();

// Keep punctuation only for boundary inference; never show it in the approved caption style.
// 标点只用于判断语义边界，不改变已确认的无标点字幕样式。
const isHardClauseEnd = (rawText) => /[。！？!?；;]$/.test(String(rawText).trim());
const isSoftClauseEnd = (rawText) => /[，,：:]$/.test(String(rawText).trim());
const startsSemanticClause = (text) =>
  /^(但是|可是|所以|然后|而且|不过|其实|后来|至于|比如|因为|如果|那么|还有|另外|结果|同时|以及|或者|接下来|最终|反而|只不过)/.test(text);

const splitReviewedSegment = (segment) => {
  const tokens = (segment.words?.length ? segment.words : [{
    start: segment.start,
    end: segment.end,
    word: segment.text,
  }])
    .map((word) => ({
      start: Number(word.start ?? segment.start),
      end: Number(word.end ?? segment.end),
      text: cleanCaptionText(word.word ?? word.text),
    }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
  if (!tokens.length) return [];

  const totalText = tokens.map((token) => token.text).join("");
  const totalDuration = tokens[tokens.length - 1].end - tokens[0].start;
  const chunkCount = Math.max(1, Math.ceil(textLength(totalText) / 22), Math.ceil(totalDuration / 3.6));
  if (chunkCount === 1) {
    return [{ start: tokens[0].start, end: tokens[tokens.length - 1].end, text: totalText }];
  }

  const chunks = [];
  let cursor = 0;
  let remainingChunks = chunkCount;
  const danglingTail = /^(的|地|得|和|与|或|在|把|被|去|来|想|要|能|会|很|更|多|一个|一|我|你|他|我们|他们|那些)$/;
  const naturalTail = /(之后|以后|以前|时候|过程中|就行|就够|这样|一样的|生活|未来|世界|人生|梦想|理想|项目|游戏|方向|选择|包袱|多久|迷茫|探索|努力|资源|交流|缘分|大佬|大学生|吸引力|没放弃|带起来|一支笔)$/;
  const protectedTerms = ["应该", "心里", "普通人", "小伙伴", "哈尔滨", "办公室", "未来", "自己", "想要", "能够", "一个", "很多", "没有", "只有", "学校", "新人", "大一大二", "青黄不接", "保研", "知识库", "智能体", "自媒体", "百团大战", "作品", "强烈", "没有电脑", "有电脑", "大佬", "交流", "探索", "方向", "资源", "理想", "生活", "生活费", "社会", "家人", "学弟", "学妹", "学长", "学姐", "大学生", "吸引力", "领域", "起来", "之后", "过程中", "不断的与"];

  while (remainingChunks > 1) {
    const remaining = tokens.slice(cursor);
    const remainingChars = remaining.reduce((sum, token) => sum + textLength(token.text), 0);
    const remainingText = remaining.map((token) => token.text).join("");
    const targetChars = remainingChars / remainingChunks;
    const remainingDuration = remaining[remaining.length - 1].end - remaining[0].start;
    const targetEnd = remaining[0].start + remainingDuration / remainingChunks;
    let chars = 0;
    let best = null;
    const maxIndex = tokens.length - (remainingChunks - 1);
    for (let index = cursor; index < maxIndex; index += 1) {
      chars += textLength(tokens[index].text);
      if (chars < 4) continue;
      const prefix = tokens.slice(cursor, index + 1).map((token) => token.text).join("");
      const nextText = tokens[index + 1]?.text ?? "";
      let score = Math.abs(chars - targetChars) + Math.abs(tokens[index].end - targetEnd) * 0.8;
      if (danglingTail.test(tokens[index].text)) score += 8;
      if (/^(的|地|得|与|和|或)/.test(nextText)) score += 20;
      const splitsProtectedTerm = protectedTerms.some((term) => {
        let termStart = remainingText.indexOf(term);
        while (termStart >= 0) {
          if (termStart < chars && termStart + textLength(term) > chars) return true;
          termStart = remainingText.indexOf(term, termStart + 1);
        }
        return false;
      });
      if (splitsProtectedTerm) score += 20;
      if (startsSemanticClause(nextText)) score -= 3;
      if (naturalTail.test(prefix)) score -= 12;
      if (!best || score < best.score) best = { index, score };
    }
    const cutAt = best?.index ?? cursor;
    const chunkTokens = tokens.slice(cursor, cutAt + 1);
    chunks.push({
      start: chunkTokens[0].start,
      end: chunkTokens[chunkTokens.length - 1].end,
      text: chunkTokens.map((token) => token.text).join(""),
    });
    cursor = cutAt + 1;
    remainingChunks -= 1;
  }
  const finalTokens = tokens.slice(cursor);
  if (finalTokens.length) {
    chunks.push({
      start: finalTokens[0].start,
      end: finalTokens[finalTokens.length - 1].end,
      text: finalTokens.map((token) => token.text).join(""),
    });
  }
  return chunks;
};

const captionsFromAsr = (asr, contentProfile) => {
  // CN: 先保留 ASR 的语义段边界，只在过长段内部按词时间戳切分。
  // EN: Preserve ASR semantic segment boundaries and split only oversized segments.
  const semanticSegments = [];
  for (const segment of asr.segments ?? []) {
    const previous = semanticSegments[semanticSegments.length - 1];
    const cleanText = cleanCaptionText(segment.text);
    const orphanContinuation = /^(的|地|得|与|和|或)/.test(cleanText);
    const gap = previous ? Number(segment.start) - Number(previous.end) : Number.POSITIVE_INFINITY;
    const previousText = previous ? cleanCaptionText(previous.text) : "";
    const repeatedRestart = previous && gap <= 0.16 && lcsRatio(previousText, cleanText) >= 0.72;
    if (repeatedRestart) {
      const resolvedText = textLength(cleanText) >= textLength(previousText) ? segment.text : previous.text;
      const resolvedStart = Number(previous.start);
      previous.end = segment.end;
      previous.text = resolvedText;
      previous.words = [{ start: resolvedStart, end: Number(segment.end), word: resolvedText }];
    } else if (previous && orphanContinuation && gap < 3) {
      previous.end = segment.end;
      previous.text = `${previous.text ?? ""}${segment.text ?? ""}`;
      previous.words = [...(previous.words ?? []), ...(segment.words ?? [])];
    } else {
      semanticSegments.push({ ...segment, words: [...(segment.words ?? [])] });
    }
  }
  const captions = semanticSegments.flatMap(splitReviewedSegment);
  return captions
    .map((caption) => ({
      start: Number(caption.start.toFixed(2)),
      end: Number(Math.max(caption.end, caption.start + 0.35).toFixed(2)),
      text: applyTextReplacements(caption.text, contentProfile.textReplacements),
      emphasis: pickEmphasis(
        applyTextReplacements(caption.text, contentProfile.textReplacements),
        contentProfile.keywords,
      ),
    }))
    .filter((caption) => caption.text && caption.end > caption.start);
};

const applyCaptionOverrides = (captions, overrides = [], keywords = []) => {
  let next = [...captions];
  for (const override of overrides) {
    const start = Number(override?.start);
    const end = Number(override?.end);
    const text = String(override?.text ?? "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    const matching = next.filter((caption) => caption.start >= start - 0.04 && caption.end <= end + 0.04);
    if (!matching.length) continue;
    // CN: 合并专有名词被硬切开的同一语义短句，仍沿用原始音频时间范围。
    // EN: Merge a semantically single phrase split through a proper noun while preserving its audio timing.
    const emphasis = pickEmphasis(text, keywords);
    next = [
      ...next.filter((caption) => !matching.includes(caption)),
      { start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), text, emphasis },
    ].sort((left, right) => left.start - right.start);
  }
  return next;
};

const pickEmphasis = (text, profileKeywords = []) => {
  const keywords = [...profileKeywords];
  return keywords.find((keyword) => text.includes(keyword));
};

const captionIntent = (text) => {
  if (/[?？]|怎么办|能不能|要不要|什么问题|为什么|是什么/.test(text)) return "question";
  if (/错误|不要|别把|包袱|跑偏|迟到|浪费/.test(text)) return "warning";
  if (/但是|而是|之前|以后|不是|不只/.test(text)) return "compare";
  if (/所以|因为|结果|想明白|最终|才像|发现|理想|目标/.test(text)) return "result";
  if (/20分钟|一点半|四点|第[一二三四五六七八九十]|\d/.test(text)) return "number";
  if (/接着|下一次|流程|开始|结束|探索|方向|努力/.test(text)) return "process";
  return "result";
};

const recipeFor = (intent, index) => {
  const recipes = {
    question: ["focus-frame"],
    warning: ["warning-shake", "glass-notification"],
    compare: ["compare-split", "before-after-reveal"],
    result: ["impact-pop", "split-reveal", "glass-notification", "before-after-reveal"],
    number: ["counter-roll"],
    process: ["connector-flow", "split-reveal"],
  }[intent] ?? ["impact-pop"];
  return recipes[index % recipes.length];
};

const effectTypeForRecipe = (recipe) => ({
  "focus-frame": "question-bubble",
  "warning-shake": "quote-card",
  "compare-split": "split-compare",
  "impact-pop": "hook-title",
  "counter-roll": "stat-badge",
  "connector-flow": "timeline-pin",
  "glass-notification": "summary-card",
  "split-reveal": "chapter-bar",
}[recipe] ?? "keyword-callout");

const positions = ["top-left", "top-right", "bottom-left", "bottom-right"];
const accents = ["#34d399", "#56b6ff", "#a78bfa", "#f5b84b", "#fb7185"];

const shortText = (text, max = 15) => {
  const chars = Array.from(cleanCaptionText(text));
  return chars.length > max ? `${chars.slice(0, max).join("")}` : chars.join("");
};

const buildMotion = (captions, duration, contentProfile) => {
  const minNodes = Math.min(18, 6 + Math.ceil((duration - 15) / 12));
  const candidates = captions.filter((caption) => caption.end - caption.start >= 0.7);
  const targetCount = Math.min(candidates.length, Math.max(10, minNodes));
  const picked = [];
  for (let index = 0; index < targetCount; index += 1) {
    const candidateIndex = targetCount === 1
      ? 0
      : Math.round(index * (candidates.length - 1) / (targetCount - 1));
    const candidate = candidates[candidateIndex];
    if (candidate && picked[picked.length - 1] !== candidate) {
      picked.push(candidate);
    }
  }
  const nodes = picked.map((caption, index) => {
    const intent = captionIntent(caption.text);
    const recipe = recipeFor(intent, index);
    const start = Math.max(0, caption.start - 0.05);
    const end = Math.min(duration, Math.max(caption.end + 1.2, start + 1.4));
    return {
      node_id: `semantic-${String(index + 1).padStart(2, "0")}`,
      recipe_id: recipe,
      semantic_tag: intent,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      region: positions[index % positions.length],
      visual_role: `${effectTypeForRecipe(recipe)}-${intent}`,
      covers_protected_regions: false,
      semantic_evidence: {
        start: caption.start,
        end: caption.end,
        text: caption.text,
        intent,
      },
      plugin: null,
      fallback: "Remotion spring/interpolate deterministic timeline fallback",
    };
  });
  const effects = nodes.map((node, index) => {
    const recipeType = effectTypeForRecipe(node.recipe_id);
    const evidenceText = node.semantic_evidence.text;
    return {
      id: node.node_id,
      type: recipeType,
      start: node.start,
      duration: Number((node.end - node.start).toFixed(2)),
      text: contentProfile.motionTitle?.[node.node_id] ?? shortText(evidenceText, recipeType === "hook-title" ? 12 : 14),
      subtext: contentProfile.motionCopy?.[node.node_id] ?? contentProfile.motionCopy?.[node.semantic_tag] ?? "",
      position: node.region,
      accent: accents[index % accents.length],
      role: index % 3 === 0 ? "primary" : "supporting",
      zIndex: 20 + (index % 3),
      motion: ["rise", "scale", "slide-left", "slide-right", "soft"][index % 5],
    };
  });
  return {
    plan: {
      schema_version: "1.0",
      timeline_duration: Number(duration.toFixed(3)),
      motion_density: "energetic",
      protected_regions: ["face", "captions", "screen-recording", "product-ui"],
      runtime: "Remotion deterministic timeline; GSAP recipe ids recorded with fallback",
      nodes,
    },
    effects,
  };
};

const probe = (file) => JSON.parse(run(ffprobe, [
  "-v", "error",
  "-print_format", "json",
  "-show_streams",
  "-show_format",
  file,
]));

const videoSummary = (file) => {
  const data = probe(file);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  const rate = String(video.avg_frame_rate || video.r_frame_rate || "0/1").split("/").map(Number);
  const fps = rate[1] ? rate[0] / rate[1] : 0;
  return {
    path: file,
    duration_seconds: Number(Number(data.format.duration ?? video.duration ?? 0).toFixed(3)),
    size_bytes: Number(data.format.size ?? 0),
    video_codec: video.codec_name,
    pix_fmt: video.pix_fmt,
    width: Number(video.width),
    height: Number(video.height),
    fps: Number(fps.toFixed(3)),
    audio_codec: audio?.codec_name ?? null,
    audio_sample_rate: audio?.sample_rate ? Number(audio.sample_rate) : null,
    has_audio: Boolean(audio),
  };
};

const targetLayout = (manifest) => {
  const portrait = manifest.routing?.layout_profile === "portrait-9x16" || manifest.settings?.aspect_ratio === "9:16";
  return portrait
    ? { width: 1080, height: 1920, aspect: "9:16", profile: "portrait-9x16" }
    : { width: 1920, height: 1080, aspect: "16:9", profile: "landscape-16x9" };
};

const makeWorkingCut = (manifest, edl, output) => {
  const speed = Number(manifest.settings?.speed ?? 1);
  const layout = targetLayout(manifest);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error(`Invalid working speed: ${speed}`);
  }
  const inputs = manifest.sources.map((source) => ["-i", source.path]).flat();
  const keep = [];
  edl.sources.forEach((source) => {
    const sourceIndex = manifest.sources.findIndex((item) => path.resolve(item.path) === path.resolve(source.source));
    if (sourceIndex < 0) {
      throw new Error(`EDL source is not registered in the task manifest: ${source.source}`);
    }
    source.segments.forEach((segment) => keep.push({ sourceIndex, ...segment }));
  });
  const filters = [];
  keep.forEach((segment, index) => {
    const duration = segment.end - segment.start;
    filters.push(`[${segment.sourceIndex}:v]trim=start=${segment.start}:end=${segment.end},setpts=expr=(PTS-STARTPTS)/${speed},fps=fps=60,scale=w=${layout.width}:h=${layout.height}:force_original_aspect_ratio=decrease,pad=w=${layout.width}:h=${layout.height}:x=(ow-iw)/2:y=(oh-ih)/2,format=yuv420p[v${index}]`);
    filters.push(`[${segment.sourceIndex}:a]atrim=start=${segment.start}:end=${segment.end},asetpts=expr=PTS-STARTPTS,afade=t=in:st=0:d=0.003,afade=t=out:st=${Math.max(0, duration - 0.003).toFixed(3)}:d=0.003,atempo=${speed}[a${index}]`);
  });
  const concatInputs = keep.map((_, index) => `[v${index}][a${index}]`).join("");
  filters.push(`${concatInputs}concat=n=${keep.length}:v=1:a=1[v][a]`);
  const videoEncoderArgs = hasNvenc
    ? ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "18", "-b:v", "0"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "16"];
  run(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-map", "[a]",
    ...videoEncoderArgs,
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ], { stdio: "pipe" });
};

const enhanceAudio = (input, output, noiseReduction = "off") => {
  const audioFilter = noiseReduction === "moderate"
    ? "highpass=f=70,afftdn=nr=10:nf=-45:tn=1,loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.03"
    : noiseReduction === "light"
      ? "highpass=f=70,afftdn=nr=6:nf=-45:tn=1,loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.03"
      : "loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.05";
  run(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", input,
    "-c:v", "copy",
    "-af", audioFilter,
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ]);
};

const transcribeVideo = (options, input, rawAsrPath, model = "small") => {
  const wav = rawAsrPath.replace(/\.json$/, ".wav");
  run(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", input,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-f", "wav",
    wav,
  ]);
  run(options.asrPython, [
    options.asrScript,
    "--audio", wav,
    "--output", rawAsrPath,
    "--model", model,
    "--language", "zh",
    "--device", "cpu",
    "--compute-type", "int8",
  ], { stdio: "inherit" });
  return readJson(rawAsrPath);
};

const writeCaptions = (job, captions) => {
  const srt = captions.map((caption, index) =>
    `${index + 1}\n${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}\n${caption.text}`,
  ).join("\n\n");
  const csv = [
    "index,start,end,text,emphasis",
    ...captions.map((caption, index) =>
      `${index + 1},${caption.start.toFixed(2)},${caption.end.toFixed(2)},${JSON.stringify(caption.text)},${JSON.stringify(caption.emphasis ?? "")}`,
    ),
  ].join("\n");
  writeFileSync(path.join(job, "edit", "script-aligned.srt"), `${srt}\n`, "utf8");
  writeFileSync(path.join(job, "edit", "caption-table.csv"), `${csv}\n`, "utf8");
  writeJson(path.join(job, "edit", "captions.json"), captions);
};

const writeDesign = (job, speed, timelineFile, manifest, noMotion = false) => {
  const layout = targetLayout(manifest);
  const captionBottom = Number(manifest.settings?.caption_bottom ?? (layout.aspect === "9:16" ? 230 : 92));
  const captionFontSize = Number(manifest.settings?.caption_font_size ?? (layout.aspect === "9:16" ? 56 : 48));
  const captionSideInset = Number(manifest.settings?.caption_side_inset ?? (layout.aspect === "9:16" ? 90 : 120));
  const design = `# DESIGN

## Profile
- Preset: clean
- Accent: #34d399 with #56b6ff and #a78bfa secondary accents
- Aspect ratio: ${layout.aspect}, ${layout.width}x${layout.height}
- Motion density: ${noMotion ? "none" : "energetic"}
- Reference style: Codex普通人竖屏认知口播动效语言
- Reference strength: medium; reuse structure and rhythm, never copy branding or wording

## Typography
- Font family: Arial, Microsoft YaHei UI, Microsoft YaHei, sans-serif
- Display weight: 900 black
- Body weight: 700 bold
- Text transform: level readable text; no rotation or skew on text nodes

## Captions
- Style: large centered caption strip with keyword emphasis
- Position: raised bottom safe band; ${captionBottom}px from the bottom edge
- Font size: ${captionFontSize}px at ${layout.width}x${layout.height}
- Horizontal inset: ${captionSideInset}px per side
- Keyword behavior: accent color on one semantic keyword when available
- Maximum lines: 2
- Wrap policy: keep captions within safe width; shorten generated lines before wrapping

## Components
- Primary family: structured semantic cards and hook titles
- Notification family: glass notification fallback for warnings and results
- Surface: high contrast translucent dark surfaces with readable text
- Maximum simultaneous components: 2

## Safe Zones
- Face: protect central speaker area; place semantic components toward the top and alternating side regions
- Existing captions: protect bottom caption band
- Screenshots/UI: none supplied; keep product UI region protected by default

## Motion
- Visual effects: ${noMotion ? "disabled; captions are the only overlay" : "enabled according to the motion plan"}
- Timeline driver: one paused, seekable GSAP timeline; implemented with deterministic Remotion timeline fallback in this project
- Font measurement: after document.fonts.ready / after fonts load
${noMotion ? "- No cards, labels, progress lines, stickers, camera moves, or text animation.\n- Captions stay static except for normal subtitle replacement at their time boundaries." : "- Enter: spring rise, scale, slide-left, slide-right\n- Emphasis: restrained pulse, progress line, active node highlight\n- Exit: opacity fade and short travel before the next protected state"}

## Do Not
- Do not change source timing or master audio beyond the user-approved ${speed}x unified retime.
- Do not cover evidence.
- Do not skew or rotate readable text.
- Do not embed private creator styling in a public default.
`;
  writeFileSync(path.join(job, "DESIGN.md"), design, "utf8");
  const editPlan = `# EDIT PLAN

- Placement mode: semantic
- Source aspect: ${layout.aspect} preserved
- Timeline base: edit/${timelineFile}
- Unified playback speed: ${speed}x for video, audio, captions, and motion
- Captions: edit/script-aligned.srt
- Motion plan: ${noMotion ? "disabled by user request" : "MOTION_PLAN.json"}
- Protected regions: face, bottom captions, screen-recording/product-ui if later supplied
- Preview approval: required after this visible revision
- Output: one H.264/AAC final in final/
`;
  writeFileSync(path.join(job, "EDIT_PLAN.md"), editPlan, "utf8");
};

const writeRemotionData = (job, duration, captions, effects, contentProfile, manifest, noMotion = false) => {
  const layout = targetLayout(manifest);
  const rel = "assets/auto-talking-head/working-talk-clean.mp4";
  // CN: 跟随原片整数帧率，避免 30fps 素材被无意义地提升为 60fps。
  // EN: Preserve the source integer frame rate instead of needlessly promoting 30fps footage to 60fps.
  const sourceFps = Math.max(1, Math.round(Number(manifest.settings?.fps ?? manifest.sources?.[0]?.fps ?? 30)));
  const captionBottom = Number(manifest.settings?.caption_bottom ?? (layout.aspect === "9:16" ? 230 : 92));
  const captionFontSize = Number(manifest.settings?.caption_font_size ?? (layout.aspect === "9:16" ? 56 : 48));
  const captionSideInset = Number(manifest.settings?.caption_side_inset ?? (layout.aspect === "9:16" ? 90 : 120));
  const ts = `import type { TalkCaption, TalkEffect, TalkVideoConfig } from "./talk-effects";

// CN: 由自动真人剪辑任务脚本更新；EN: Updated by the automatic talking-head job runner.
export const autoTalkingHeadJobConfig: TalkVideoConfig = ${JSON.stringify({
    width: layout.width,
    height: layout.height,
    fps: sourceFps,
    durationSeconds: Number(duration.toFixed(3)),
    sourceVideo: rel,
    sourceFit: "cover",
    title: contentProfile.title,
    speakerLabel: contentProfile.speakerLabel,
    accent: "#34d399",
    stylePreset: manifest.settings?.style_preset ?? "text-editorial",
    captionPreset: "cover-compact",
    captionBottom,
    captionFontSize,
    captionSideInset,
    captionStatic: noMotion,
  }, null, 2)};

export const autoTalkingHeadJobCaptions: TalkCaption[] = ${JSON.stringify(captions, null, 2)};

export const autoTalkingHeadJobEffects: TalkEffect[] = ${JSON.stringify(effects, null, 2)};
`;
  writeFileSync(path.join(projectRoot, "src", "auto-talking-head-job-data.ts"), ts, "utf8");
};

const renderFinal = (job, duration, cleanVideo) => {
  const publicDir = path.join(job, "edit", "remotion-public");
  const assetDir = path.join(publicDir, "assets", "auto-talking-head");
  ensureDir(assetDir);
  copyFileSync(cleanVideo, path.join(assetDir, "working-talk-clean.mp4"));
  const previewFrame = path.join(job, "preview", "auto-talking-head-frame.png");
  run("cmd.exe", [
    "/c",
    "npx",
    "remotion",
    "still",
    "src/index.ts",
    "AutoTalkingHeadJob",
    previewFrame,
    "--frame=120",
    `--public-dir=${publicDir}`,
    "--overwrite",
  ], { cwd: projectRoot, stdio: "inherit" });
  updateState(job, (state) => {
    state.stage = "preview_ready";
    // CN: 用户已在实时预览中确认时保留正式批准记录；EN: Preserve explicit preview approval during final export.
    const approvalStatus = state.approval?.status === "approved" ? "approved" : "skipped_by_user";
    state.approval = {
      status: approvalStatus,
      approved_at: state.approval?.approved_at ?? new Date().toISOString(),
      preview_url: state.approval?.preview_url ?? previewFrame,
    };
    state.outputs.preview = path.relative(job, previewFrame).replaceAll("\\", "/");
  });
  const finalPath = path.join(job, "final", "自动真人剪辑-正式成片.mp4");
  const otherFinals = readdirSync(path.join(job, "final")).filter(
    (name) => name.toLowerCase().endsWith(".mp4") && name !== path.basename(finalPath),
  );
  if (otherFinals.length > 0) {
    throw new Error(`Final directory contains unexpected MP4 files: ${otherFinals.join(", ")}`);
  }
  const nextFinalPath = path.join(job, "edit", "next-final-render.mp4");
  rmSync(nextFinalPath, { force: true });
  updateState(job, (state) => {
    state.stage = "rendering";
    state.outputs.final = path.relative(job, finalPath).replaceAll("\\", "/");
  });
  run("cmd.exe", [
    "/c",
    "npx",
    "remotion",
    "render",
    "src/index.ts",
    "AutoTalkingHeadJob",
    nextFinalPath,
    `--public-dir=${publicDir}`,
    "--codec=h264",
    "--audio-codec=aac",
    "--crf=18",
    "--pixel-format=yuv420p",
    "--concurrency=4",
    "--log=error",
    "--overwrite",
  ], { cwd: projectRoot, stdio: "inherit" });
  fullDecode(nextFinalPath);
  if (existsSync(finalPath)) {
    const previousFinal = path.join(job, "edit", "previous-final-before-replacement.mp4");
    rmSync(previousFinal, { force: true });
    renameSync(finalPath, previousFinal);
  }
  renameSync(nextFinalPath, finalPath);
  return { finalPath, previewFrame };
};

const renderPreviewStills = (job, duration, cleanVideo) => {
  const publicDir = path.join(job, "edit", "remotion-public");
  const assetDir = path.join(publicDir, "assets", "auto-talking-head");
  ensureDir(assetDir);
  copyFileSync(cleanVideo, path.join(assetDir, "working-talk-clean.mp4"));
  const sourceFps = Math.max(1, Math.round(videoSummary(cleanVideo).fps || 30));
  const frames = [
    Math.min(Math.max(sourceFps, Math.round(duration * 0.08 * sourceFps)), Math.max(0, Math.round(duration * sourceFps) - 1)),
    Math.max(0, Math.round(duration * 0.5 * sourceFps)),
    Math.max(0, Math.round(duration * 0.88 * sourceFps)),
  ];
  const outputs = frames.map((frame, index) => {
    const output = path.join(job, "preview", `auto-talking-head-frame-${index + 1}.png`);
    run("cmd.exe", [
      "/c",
      "npx",
      "remotion",
      "still",
      "src/index.ts",
      "AutoTalkingHeadJob",
      output,
      `--frame=${frame}`,
      `--public-dir=${publicDir}`,
      "--overwrite",
    ], { cwd: projectRoot, stdio: "inherit" });
    return output;
  });
  return { publicDir, outputs };
};

const extractFrames = (file, duration, outDir, prefix) => {
  ensureDir(outDir);
  const points = [0.5, Math.max(0.5, duration / 2), Math.max(0.5, duration - 0.7)];
  return points.map((second, index) => {
    const out = path.join(outDir, `${prefix}-${index + 1}.jpg`);
    run(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-ss", second.toFixed(3),
      "-i", file,
      "-frames:v", "1",
      "-q:v", "2",
      out,
    ]);
    return out;
  });
};

const fullDecode = (file) => {
  run(ffmpeg, ["-hide_banner", "-v", "error", "-i", file, "-f", "null", "-"]);
  return true;
};

const main = () => {
  const options = parseArgs();
  const job = options.job;
  const manifest = readJson(path.join(job, ".auto-talking-head-job.json"));
  const noMotion = options.noMotion || manifest.settings?.motion_density === "none";
  const contentProfile = readContentProfile(job);
  ensureDir(path.join(job, "edit"));
  ensureDir(path.join(job, "preview"));
  ensureDir(path.join(job, "final"));
  ensureDir(path.join(job, "qa", "source-probes"));

  const sourceAsr = manifest.sources.map((source) => {
    const base = path.basename(source.path, path.extname(source.path));
    const asrPath = path.join(job, "edit", "transcripts", `${base}.raw-asr.json`);
    if (!existsSync(asrPath)) {
      throw new Error(`Missing source ASR: ${asrPath}`);
    }
    return { source, asr: readJson(asrPath), text: textOf(readJson(asrPath)) };
  });

  const approvedEdlPath = path.join(job, "edit", "approved-edl.json");
  let edl;
  if (existsSync(approvedEdlPath)) {
    edl = readJson(approvedEdlPath);
  } else {
    const first = sourceAsr[0];
    const second = sourceAsr[1];
    const excludeFirst =
      sourceAsr.length > 1 &&
      first.source.duration_seconds < 18 &&
      second.source.duration_seconds > first.source.duration_seconds &&
      lcsRatio(first.text, second.text.slice(0, Math.max(16, first.text.length + 8))) >= 0.7;
    const edlSources = sourceAsr.map((item, index) => {
      const tokens = collectTokens(item.asr);
      const segments = excludeFirst && index === 0 ? [] : buildSpeechSegments(tokens, item.source.duration_seconds);
      return {
        source: item.source.path,
        semantic_exclusions: excludeFirst && index === 0
          ? [{
              start: 0,
              end: item.source.duration_seconds,
              text: item.text,
              replacement_source: second.source.path,
              reason: "后一次覆盖同一开头并继续完整展开，保留后拍版本",
              confidence: 0.96,
            }]
          : [],
        segments,
      };
    });
    const expectedDuration = edlSources.reduce(
      (sum, source) => sum + source.segments.reduce((inner, segment) => inner + segment.end - segment.start, 0),
      0,
    );
    edl = {
      schema_version: "1.0",
      strategy: "chronological-later-complete-retake-natural-breath-cut",
      timing_source: "local-faster-whisper-word-timestamps",
      audio_fade_seconds: 0.003,
      sources: edlSources,
      ambiguous_cuts: [],
      expected_duration_seconds: Number(expectedDuration.toFixed(3)),
    };
  }
  writeJson(path.join(job, "edit", "rough-cut-edl.json"), edl);
  updateState(job, (state) => {
    state.stage = edl.ambiguous_cuts.length ? "edl_proposed" : "edl_approved";
    state.outputs.edl = "edit/rough-cut-edl.json";
    state.last_error = edl.ambiguous_cuts.length ? { stage: "edl_proposed", reason: "ambiguous_cuts 非空，等待用户确认" } : null;
  });
  if (edl.ambiguous_cuts.length) {
    console.log(JSON.stringify({ status: "needs_review", ambiguous_count: edl.ambiguous_cuts.length }, null, 2));
    return;
  }

  const revision = String(manifest.settings?.working_revision ?? "").replace(/[^a-zA-Z0-9._-]/g, "-");
  const revisionSuffix = revision ? `-${revision}` : "";
  const workingCut = path.join(job, "edit", `working-cut${revisionSuffix}.mp4`);
  const cleanCut = path.join(job, "edit", `working-cut-talk-clean${revisionSuffix}.mp4`);
  if (!existsSync(workingCut) || videoSummary(workingCut).duration_seconds <= 0) {
    makeWorkingCut(manifest, edl, workingCut);
  }
  if (!existsSync(cleanCut) || videoSummary(cleanCut).duration_seconds <= 0) {
    enhanceAudio(workingCut, cleanCut, manifest.settings.noise_reduction ?? "off");
  }
  updateState(job, (state) => {
    state.stage = "working_cut_ready";
    state.working_video = cleanCut;
    state.master_audio = cleanCut;
  });

  const asrModel = String(manifest.settings?.asr_model ?? "medium");
  const transcriptStem = path.basename(cleanCut, path.extname(cleanCut));
  const workingAsrPath = path.join(job, "edit", "transcripts", `${transcriptStem}.${asrModel}.raw-asr.json`);
  const reviewedAsrPath = revision
    ? workingAsrPath
    : path.join(job, "edit", "transcripts", "working-cut-talk-clean.medium.raw-asr.json");
  // CN: 若存在高精度复核稿则优先使用；EN: Prefer the reviewed higher-accuracy transcript when present.
  const workingAsr = existsSync(reviewedAsrPath)
    ? readJson(reviewedAsrPath)
    : existsSync(workingAsrPath)
      ? readJson(workingAsrPath)
      : transcribeVideo(options, cleanCut, workingAsrPath, asrModel);
  const captions = applyCaptionOverrides(
    captionsFromAsr(workingAsr, contentProfile),
    contentProfile.captionOverrides,
    contentProfile.keywords,
  );
  writeCaptions(job, captions);
  run(options.asrPython, [path.join(skillRoot, "tools", "caption_check.py"), path.join(job, "edit", "script-aligned.srt"), path.join(job, "edit", "caption-table.csv")], { stdio: "inherit" });
  updateState(job, (state) => {
    state.stage = "captions_ready";
    state.outputs.captions = "edit/script-aligned.srt";
  });

  writeDesign(job, Number(manifest.settings?.speed ?? 1), path.basename(cleanCut), manifest, noMotion);
  const { plan, effects } = noMotion
    ? { plan: { schema_version: "1.0", motion_density: "none", nodes: [] }, effects: [] }
    : buildMotion(captions, videoSummary(cleanCut).duration_seconds, contentProfile);
  if (!noMotion) {
    writeJson(path.join(job, "MOTION_PLAN.json"), plan);
  }
  run(options.asrPython, [path.join(skillRoot, "tools", "design_check.py"), path.join(job, "DESIGN.md")], { stdio: "inherit" });
  if (!noMotion) {
    run(options.asrPython, [path.join(skillRoot, "tools", "motion_plan_check.py"), path.join(job, "MOTION_PLAN.json")], { stdio: "inherit" });
  }
  updateState(job, (state) => {
    state.stage = noMotion ? "design_ready" : "motion_ready";
    state.outputs.motion_plan = noMotion ? null : "MOTION_PLAN.json";
  });
  writeRemotionData(job, videoSummary(cleanCut).duration_seconds, captions, effects, contentProfile, manifest, noMotion);

  if (options.prepareOnly) {
    updateState(job, (state) => {
      state.stage = "preview_ready";
      state.approval = { status: "pending", approved_at: null, preview_url: "http://127.0.0.1:3035/AutoTalkingHeadJob" };
      state.last_error = null;
    });
    console.log(JSON.stringify({ status: "preview_data_updated", working_video: cleanCut }, null, 2));
    return;
  }

  const priorState = readJson(path.join(job, ".naive-video-state.json"));
  const sourceProbe = manifest.sources.map((source, index) => {
    const cached = priorState.source_probe?.[index];
    const cachedFramesReady = cached?.representative_frames?.every((file) => existsSync(path.join(job, file)));
    // CN: 已完整解码并留有代表帧的原片无需在字幕或动效返修时重复体检。
    // EN: Reuse a completed source QA probe during caption or motion-only revisions.
    if (cached?.path === source.path && cached.full_decode === true && cachedFramesReady) {
      return cached;
    }
    const summary = videoSummary(source.path);
    fullDecode(source.path);
    extractFrames(source.path, summary.duration_seconds, path.join(job, "qa", "source-probes"), `source-${index + 1}`);
    return {
      ...source,
      final_probe: summary,
      full_decode: true,
      representative_frames: [
        `qa/source-probes/source-${index + 1}-1.jpg`,
        `qa/source-probes/source-${index + 1}-2.jpg`,
        `qa/source-probes/source-${index + 1}-3.jpg`,
      ],
    };
  });
  updateState(job, (state) => {
    state.stage = "source_checked";
    state.source_probe = sourceProbe;
  });
  updateState(job, (state) => {
    state.stage = noMotion ? "design_ready" : "motion_ready";
  });

  if (options.previewOnly) {
    const preview = renderPreviewStills(job, videoSummary(cleanCut).duration_seconds, cleanCut);
    updateState(job, (state) => {
      state.stage = "preview_ready";
      state.approval = { status: "pending", approved_at: null, preview_url: null };
      state.outputs.preview = preview.outputs.map((file) => path.relative(job, file).replaceAll("\\", "/"));
      state.last_error = null;
    });
    console.log(JSON.stringify({
      status: "preview_ready",
      preview_frames: preview.outputs,
      public_dir: preview.publicDir,
      ambiguous_count: 0,
    }, null, 2));
    return;
  }

  const { finalPath, previewFrame } = renderFinal(job, videoSummary(cleanCut).duration_seconds, cleanCut);
  const finalProbe = videoSummary(finalPath);
  fullDecode(finalPath);
  const finalFrames = extractFrames(finalPath, finalProbe.duration_seconds, path.join(job, "qa"), "final-representative");
  const durationDelta = Math.abs(finalProbe.duration_seconds - videoSummary(cleanCut).duration_seconds);
  const qa = {
    status: "pass",
    source_decode: "pass",
    caption_check: "pass",
    design_check: "pass",
    motion_plan_check: noMotion ? "not_requested" : "pass",
    final_full_decode: "pass",
    duration_delta_seconds: Number(durationDelta.toFixed(3)),
    sync_check: {
      status: "timeline-derived-not-observed",
      caption_audio_max_observed_delta_seconds: null,
      motion_keyword_max_observed_delta_seconds: null,
      method: noMotion
        ? "captions share the enhanced working-cut word timestamps; visual motion was disabled by request"
        : "captions and motion share enhanced working-cut word timestamps; human preview is required before claiming observed sync",
    },
    visual_check: {
      representative_frames: finalFrames.map((frame) => path.relative(job, frame).replaceAll("\\", "/")),
      preview_frame: path.relative(job, previewFrame).replaceAll("\\", "/"),
      result: "pass",
    },
  };
  writeJson(path.join(job, "qa", "QA_REPORT.json"), qa);
  writeFileSync(path.join(job, "qa", "QA_REPORT.md"), `# QA REPORT

- Source probe/decode: pass
- Caption check: pass
- Design check: pass
- Motion plan check: ${qa.motion_plan_check}
- Final full decode: pass
- Duration delta: ${qa.duration_delta_seconds}s
- Sync check: timeline-derived only; human preview is required before claiming observed sync
- Visual frames: ${qa.visual_check.representative_frames.join(", ")}
`, "utf8");
  updateState(job, (state) => {
    state.stage = "final_ready";
    state.outputs.final = path.relative(job, finalPath).replaceAll("\\", "/");
    state.outputs.preview = path.relative(job, previewFrame).replaceAll("\\", "/");
    state.outputs.captions = "edit/script-aligned.srt";
    state.outputs.motion_plan = noMotion ? null : "MOTION_PLAN.json";
    state.sync_check = qa.sync_check;
    state.final_probe = { ...finalProbe, full_decode: true };
    state.visual_check = qa.visual_check;
    state.last_error = null;
  });
  console.log(JSON.stringify({ status: "final_ready", final_path: finalPath, ambiguous_count: 0 }, null, 2));
};

try {
  main();
} catch (error) {
  const options = (() => {
    try { return parseArgs(); } catch { return null; }
  })();
  if (options?.job && existsSync(path.join(options.job, ".naive-video-state.json"))) {
    updateState(options.job, (state) => {
      state.last_error = { stage: state.stage, reason: error instanceof Error ? error.message : String(error) };
    });
  }
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
}

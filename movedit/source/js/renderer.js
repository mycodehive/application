import { ffmpegService } from "./ffmpeg-service.js";
import { getRuntimeFile, getState } from "./state.js";

const safeName = (name, fallback = "media") => {
  const ext = (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  return fallback + ext;
};

function xfadeName(type) {
  const map = {
    fade: "fade",
    crossfade: "fade",
    slideleft: "slideleft",
    slideright: "slideright",
    wipeleft: "wipeleft",
    wiperight: "wiperight"
  };
  return map[type] || "fade";
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#","");
  const r = parseInt(clean.slice(0,2),16);
  const g = parseInt(clean.slice(2,4),16);
  const b = parseInt(clean.slice(4,6),16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

async function subtitlePng(sub, project, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const scale = width / project.resolution.width;
  const fontSize = Math.max(12, sub.fontSize * scale);
  ctx.font = "700 " + fontSize + 'px "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = String(sub.text || "").split(/\n/);
  const lineHeight = fontSize * 1.25;
  const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 1);
  const padX = 18 * scale, padY = 10 * scale;
  let y = height - 95 * scale;
  if (sub.position === "top") y = 95 * scale;
  if (sub.position === "center") y = height / 2;
  const boxH = lines.length * lineHeight + padY * 2;
  ctx.fillStyle = hexToRgba(sub.backgroundColor, sub.backgroundOpacity);
  ctx.fillRect(width/2 - maxWidth/2 - padX, y - boxH/2, maxWidth + padX*2, boxH);
  ctx.fillStyle = sub.textColor;
  lines.forEach((line, i) => {
    const offset = (i - (lines.length - 1)/2) * lineHeight;
    ctx.fillText(line, width/2, y + offset);
  });
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("자막 이미지를 만들지 못했습니다.")), "image/png"));
}

export function buildRenderPlan(project, quality = "1080p") {
  const portrait = Number(project.resolution?.height) > Number(project.resolution?.width);
  const width = quality === "720p" ? (portrait ? 720 : 1280) : (portrait ? 1080 : 1920);
  const height = quality === "720p" ? (portrait ? 1280 : 720) : (portrait ? 1920 : 1080);
  const mainClips = project.clips.filter(c => c.track === "video1").sort((a,b) => a.timelineStart - b.timelineStart);
  const overlays = project.clips.filter(c => c.track === "overlay" || c.track === "image").sort((a,b) => a.timelineStart - b.timelineStart);
  return {
    width,
    height,
    fps: project.fps || 30,
    duration: project.duration,
    mainClips,
    overlays,
    subtitles: [...project.subtitles].sort((a,b) => a.startTime - b.startTime),
    transitions: project.transitions
  };
}

async function prepareAssets(project, plan, progress) {
  const requiredIds = new Set([
    ...plan.mainClips.map(c => c.assetId),
    ...plan.overlays.map(c => c.assetId)
  ]);
  const names = new Map();
  let index = 0;
  for (const assetId of requiredIds) {
    const asset = project.assets.find(a => a.id === assetId);
    const file = getRuntimeFile(assetId);
    if (!asset || !file) throw new Error("미디어 파일 재연결이 필요합니다: " + (asset?.name || assetId));
    const filename = safeName(asset.name, "asset_" + index++);
    await ffmpegService.writeFile(filename, file);
    names.set(assetId, filename);
    progress?.("미디어 준비 중 · " + asset.name);
  }
  return names;
}

async function normalizeMainClips(project, plan, fileNames, progress) {
  const normalized = [];
  for (let i = 0; i < plan.mainClips.length; i++) {
    const clip = plan.mainClips[i];
    const input = fileNames.get(clip.assetId);
    const out = "main_" + i + ".mp4";
    progress?.("클립 정규화 " + (i+1) + "/" + plan.mainClips.length);
    const hasAudio = await ffmpegService.probeHasAudio(input);
    const videoFilter = "scale=" + plan.width + ":" + plan.height + ":force_original_aspect_ratio=decrease,pad=" + plan.width + ":" + plan.height + ":(ow-iw)/2:(oh-ih)/2:black,fps=" + plan.fps + ",setsar=1";
    const args = ["-y","-ss",String(clip.sourceIn),"-t",String(clip.duration),"-i",input];

    if (hasAudio) {
      args.push(
        "-map","0:v:0","-map","0:a:0",
        "-vf",videoFilter,
        "-af","aresample=48000,volume=" + (clip.volume ?? 1),
        "-c:v","libx264","-preset","ultrafast","-crf","20","-pix_fmt","yuv420p",
        "-c:a","aac","-b:a","160k","-ar","48000","-ac","2",
        out
      );
    } else {
      args.push(
        "-f","lavfi","-t",String(clip.duration),"-i","anullsrc=r=48000:cl=stereo",
        "-map","0:v:0","-map","1:a:0",
        "-vf",videoFilter,
        "-c:v","libx264","-preset","ultrafast","-crf","20","-pix_fmt","yuv420p",
        "-c:a","aac","-b:a","160k","-ar","48000","-ac","2",
        "-shortest",out
      );
    }
    await ffmpegService.exec(args);
    normalized.push({ clip, file: out });
  }
  return normalized;
}

function buildMainGraph(normalized, project) {
  if (normalized.length === 1) {
    return {
      graph: "[0:v]setpts=PTS-STARTPTS[vmain];[0:a]asetpts=PTS-STARTPTS[amain]",
      video: "vmain",
      audio: "amain",
      duration: normalized[0].clip.duration
    };
  }

  let graph = "";
  let video = "0:v";
  let audio = "0:a";
  let duration = normalized[0].clip.duration;

  for (let i = 1; i < normalized.length; i++) {
    const prevClip = normalized[i-1].clip;
    const clip = normalized[i].clip;
    const transition = project.transitions.find(t => t.fromClipId === prevClip.id && t.toClipId === clip.id);
    const td = transition ? Math.min(transition.duration, prevClip.duration - 0.02, clip.duration - 0.02) : 0.02;
    const type = transition ? xfadeName(transition.type) : "fade";
    const offset = Math.max(0, duration - td);
    const vOut = "vx" + i;
    const aOut = "ax" + i;
    graph += "[" + video + "][" + i + ":v]xfade=transition=" + type + ":duration=" + td + ":offset=" + offset + "[" + vOut + "];";
    graph += "[" + audio + "][" + i + ":a]acrossfade=d=" + td + ":c1=tri:c2=tri[" + aOut + "];";
    video = vOut;
    audio = aOut;
    duration += clip.duration - td;
  }

  graph += "[" + video + "]setpts=PTS-STARTPTS[vmain];[" + audio + "]asetpts=PTS-STARTPTS[amain]";
  return { graph, video:"vmain", audio:"amain", duration };
}

async function addVisualInputs(project, plan, fileNames, normalizedCount, args, filters, startVideoLabel, progress) {
  let inputIndex = normalizedCount;
  let currentVideo = startVideoLabel;
  const overlayAudioLabels = [];

  for (let i = 0; i < plan.overlays.length; i++) {
    const clip = plan.overlays[i];
    const input = fileNames.get(clip.assetId);
    const asset = project.assets.find(a => a.id === clip.assetId);
    const isImage = clip.type === "image" || asset?.kind === "image";

    if (isImage) {
      args.push("-loop","1","-t",String(clip.duration),"-i",input);
    } else {
      args.push("-ss",String(clip.sourceIn),"-t",String(clip.duration),"-i",input);
    }

    const idx = inputIndex++;
    const ov = "ov" + i;
    const next = "vov" + i;
    filters.push(
      "[" + idx + ":v]scale=" + Math.round(clip.width) + ":" + Math.round(clip.height) +
      ",format=rgba,colorchannelmixer=aa=" + (clip.opacity ?? 1) +
      ",setpts=PTS-STARTPTS+" + clip.timelineStart + "/TB[" + ov + "]"
    );
    filters.push(
      "[" + currentVideo + "][" + ov + "]overlay=x=" + Math.round(clip.x) +
      ":y=" + Math.round(clip.y) +
      ":enable='between(t," + clip.timelineStart + "," + (clip.timelineStart + clip.duration) + ")'[" + next + "]"
    );
    currentVideo = next;

    if (!isImage && (clip.volume ?? 0) > 0 && await ffmpegService.probeHasAudio(input)) {
      const aLabel = "ova" + i;
      const delay = Math.round(clip.timelineStart * 1000);
      filters.push(
        "[" + idx + ":a]atrim=duration=" + clip.duration +
        ",asetpts=PTS-STARTPTS,aresample=48000,volume=" + (clip.volume ?? 1) +
        ",adelay=" + delay + "|" + delay + "[" + aLabel + "]"
      );
      overlayAudioLabels.push(aLabel);
    }
    progress?.("Overlay 준비 " + (i+1) + "/" + plan.overlays.length);
  }

  for (let i = 0; i < plan.subtitles.length; i++) {
    const sub = plan.subtitles[i];
    const blob = await subtitlePng(sub, project, plan.width, plan.height);
    const name = "subtitle_" + i + ".png";
    await ffmpegService.writeFile(name, blob);
    const duration = Math.max(0.1, sub.endTime - sub.startTime);
    args.push("-loop","1","-t",String(duration),"-i",name);
    const idx = inputIndex++;
    const label = "sub" + i;
    const next = "vsub" + i;
    filters.push("[" + idx + ":v]format=rgba,setpts=PTS-STARTPTS+" + sub.startTime + "/TB[" + label + "]");
    filters.push("[" + currentVideo + "][" + label + "]overlay=0:0:enable='between(t," + sub.startTime + "," + sub.endTime + ")'[" + next + "]");
    currentVideo = next;
  }

  return { currentVideo, overlayAudioLabels };
}

export async function renderProject({ quality = "1080p", onMessage } = {}) {
  const { project } = getState();
  const plan = buildRenderPlan(project, quality);
  if (!plan.mainClips.length) throw new Error("VIDEO 1 트랙에 렌더링할 영상이 없습니다.");

  onMessage?.("FFmpeg 초기화");
  await ffmpegService.load();
  const fileNames = await prepareAssets(project, plan, fileNames => onMessage?.(fileNames));
  const normalized = await normalizeMainClips(project, plan, fileNames, onMessage);

  const args = ["-y"];
  normalized.forEach(item => args.push("-i", item.file));

  const main = buildMainGraph(normalized, project);
  const filters = main.graph.split(";").filter(Boolean);
  const visual = await addVisualInputs(project, plan, fileNames, normalized.length, args, filters, "vmain", onMessage);

  let audioLabel = "amain";
  if (visual.overlayAudioLabels.length) {
    const mixInputs = ["[" + audioLabel + "]", ...visual.overlayAudioLabels.map(label => "[" + label + "]")].join("");
    filters.push(mixInputs + "amix=inputs=" + (visual.overlayAudioLabels.length + 1) + ":duration=longest:dropout_transition=0[aout]");
    audioLabel = "aout";
  }

  onMessage?.("최종 MP4 인코딩");
  args.push(
    "-filter_complex", filters.join(";"),
    "-map","[" + visual.currentVideo + "]",
    "-map","[" + audioLabel + "]",
    "-t",String(Math.max(0.1, plan.duration)),
    "-r",String(plan.fps),
    "-c:v","libx264","-preset","veryfast","-crf", quality === "720p" ? "24" : "22",
    "-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","192k","-ar","48000","-ac","2",
    "-movflags","+faststart",
    "output.mp4"
  );

  await ffmpegService.exec(args);
  const data = await ffmpegService.readFile("output.mp4");
  ffmpegService.finish();
  return new Blob([data.buffer], { type:"video/mp4" });
}

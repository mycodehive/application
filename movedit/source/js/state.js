import { CONFIG, uid } from "./config.js";

const createProject = () => ({
  version: 1,
  name: "새 프로젝트",
  aspectRatio: "16:9",
  resolution: { ...CONFIG.resolution },
  fps: CONFIG.fps,
  duration: 0,
  assets: [],
  clips: [],
  subtitles: [],
  transitions: [],
  tracks: CONFIG.tracks.map(track => ({ ...track }))
});

let project = createProject();
let selected = null;
let playhead = 0;
let playing = false;
let zoom = 100;
const runtimeFiles = new Map();
const objectUrls = new Map();
const listeners = new Set();
const history = [];
const future = [];

const cloneProject = value => JSON.parse(JSON.stringify(value));
const snapshot = () => cloneProject(project);

function coverRect(asset, width, height) {
  if (!asset) return { x: 0, y: 0, width, height };
  const sourceWidth = Math.max(1, Number(asset.width) || width);
  const sourceHeight = Math.max(1, Number(asset.height) || height);
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  return {
    x: (width - fittedWidth) / 2,
    y: (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight
  };
}

function emit(reason = "change") {
  listeners.forEach(fn => fn({ project, selected, playhead, playing, zoom, reason }));
}

function recalcDuration() {
  const clipEnd = project.clips.reduce((max, clip) => Math.max(max, clip.timelineStart + clip.duration), 0);
  const subtitleEnd = project.subtitles.reduce((max, item) => Math.max(max, item.endTime), 0);
  project.duration = Math.max(clipEnd, subtitleEnd, 0);
  if (playhead > project.duration) playhead = project.duration;
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > CONFIG.historyLimit) history.shift();
  future.length = 0;
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ project, selected, playhead, playing, zoom, reason: "init" });
  return () => listeners.delete(fn);
}

export function getState() {
  return { project, selected, playhead, playing, zoom };
}

export function getRuntimeFile(assetId) {
  return runtimeFiles.get(assetId) || null;
}

export function getObjectUrl(assetId) {
  return objectUrls.get(assetId) || null;
}

export function setRuntimeAsset(assetId, file, url) {
  runtimeFiles.set(assetId, file);
  if (url) objectUrls.set(assetId, url);
}

export function revokeAllObjectUrls() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

export function mutate(label, fn, options = {}) {
  if (options.history !== false) pushHistory();
  fn(project);
  recalcDuration();
  emit(label);
}

export function setProjectName(name) {
  project.name = name || "새 프로젝트";
  emit("project-name");
}

export function setProjectAspectRatio(aspectRatio) {
  const preset = CONFIG.canvasPresets[aspectRatio];
  if (!preset) return;

  mutate("project-aspect-ratio", p => {
    const oldWidth = Number(p.resolution?.width) || CONFIG.resolution.width;
    const oldHeight = Number(p.resolution?.height) || CONFIG.resolution.height;
    const newWidth = preset.width;
    const newHeight = preset.height;
    if (oldWidth === newWidth && oldHeight === newHeight) {
      p.aspectRatio = aspectRatio;
      return;
    }

    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;
    const overlayScale = Math.min(scaleX, scaleY);

    p.clips.forEach(clip => {
      if (clip.track === "video1" || clip.fitMode === "cover") {
        const asset = p.assets.find(item => item.id === clip.assetId);
        Object.assign(clip, coverRect(asset, newWidth, newHeight));
        clip.fitMode = "cover";
        return;
      }

      const oldCenterX = (Number(clip.x) || 0) + (Number(clip.width) || oldWidth) / 2;
      const oldCenterY = (Number(clip.y) || 0) + (Number(clip.height) || oldHeight) / 2;
      const width = Math.max(1, (Number(clip.width) || oldWidth) * overlayScale);
      const height = Math.max(1, (Number(clip.height) || oldHeight) * overlayScale);
      const centerX = (oldCenterX / oldWidth) * newWidth;
      const centerY = (oldCenterY / oldHeight) * newHeight;

      clip.width = width;
      clip.height = height;
      clip.x = Math.min(newWidth - width, Math.max(0, centerX - width / 2));
      clip.y = Math.min(newHeight - height, Math.max(0, centerY - height / 2));
    });

    const textScale = newWidth / oldWidth;
    p.subtitles.forEach(sub => {
      sub.fontSize = Math.max(12, Math.round((Number(sub.fontSize) || 42) * textScale));
    });

    p.aspectRatio = aspectRatio;
    p.resolution = { width: newWidth, height: newHeight };
  });
}

export function setSelected(kind, id) {
  selected = kind && id ? { kind, id } : null;
  emit("selection");
}

export function setPlayhead(time) {
  playhead = Math.max(0, Math.min(Number(time) || 0, project.duration || 0));
  emit("playhead");
}

export function setPlaying(value) {
  playing = Boolean(value);
  emit("playing");
}

export function setZoom(value) {
  zoom = Number(value) || 100;
  emit("zoom");
}

export function addAsset(meta, file, url) {
  const asset = { id: uid("asset"), ...meta };
  mutate("asset-add", p => p.assets.push(asset), { history: false });
  setRuntimeAsset(asset.id, file, url);
  return asset;
}

export function addClip(data, options = {}) {
  const clip = {
    id: uid("clip"),
    assetId: data.assetId,
    name: data.name || "Clip",
    type: data.type || "video",
    timelineStart: data.timelineStart || 0,
    duration: data.duration || 1,
    sourceIn: data.sourceIn || 0,
    sourceOut: data.sourceOut ?? data.duration ?? 1,
    track: data.track || "video1",
    fitMode: data.fitMode || "manual",
    x: data.x ?? 0,
    y: data.y ?? 0,
    width: data.width || project.resolution.width,
    height: data.height || project.resolution.height,
    opacity: data.opacity ?? 1,
    volume: data.volume ?? 1
  };
  mutate("clip-add", p => p.clips.push(clip), { history: options.history !== false });
  if (options.select !== false) setSelected("clip", clip.id);
  return clip;
}

function syncLinkedAudioForClip(p, clip) {
  if (!clip || clip.type === "audio") return;
  p.clips
    .filter(item => item.type === "audio" && item.sourceVideoClipId === clip.id)
    .forEach(audio => {
      audio.timelineStart = clip.timelineStart;
      audio.duration = clip.duration;
      audio.sourceIn = clip.sourceIn;
      audio.sourceOut = clip.sourceOut;
    });
}

export function updateClip(id, patch, label = "clip-update") {
  mutate(label, p => {
    const clip = p.clips.find(item => item.id === id);
    if (!clip) return;
    Object.assign(clip, patch);
    clip.duration = Math.max(CONFIG.minClipDuration, Number(clip.duration) || CONFIG.minClipDuration);
    clip.timelineStart = Math.max(0, Number(clip.timelineStart) || 0);
    clip.sourceIn = Math.max(0, Number(clip.sourceIn) || 0);
    clip.sourceOut = Math.max(clip.sourceIn + CONFIG.minClipDuration, Number(clip.sourceOut) || clip.sourceIn + clip.duration);
    syncLinkedAudioForClip(p, clip);
  });
}

export function removeSelected() {
  if (!selected) return;
  if (selected.kind === "clip") {
    mutate("clip-delete", p => {
      const clip = p.clips.find(c => c.id === selected.id);
      const linkedAudioIds = clip?.type === "audio"
        ? []
        : p.clips.filter(c => c.type === "audio" && c.sourceVideoClipId === selected.id).map(c => c.id);
      p.clips = p.clips.filter(c => c.id !== selected.id && !linkedAudioIds.includes(c.id));
      p.transitions = p.transitions.filter(t => t.fromClipId !== selected.id && t.toClipId !== selected.id);
    });
  } else if (selected.kind === "subtitle") {
    mutate("subtitle-delete", p => p.subtitles = p.subtitles.filter(s => s.id !== selected.id));
  }
  selected = null;
  emit("selection");
}

export function splitSelectedClip() {
  if (!selected || selected.kind !== "clip") return false;
  const clip = project.clips.find(c => c.id === selected.id);
  if (!clip || clip.type === "image") return false;
  const local = playhead - clip.timelineStart;
  if (local <= CONFIG.minClipDuration || local >= clip.duration - CONFIG.minClipDuration) return false;
  pushHistory();
  const leftDuration = local;
  const rightDuration = clip.duration - local;
  const right = {
    ...cloneProject(clip),
    id: uid("clip"),
    timelineStart: playhead,
    duration: rightDuration,
    sourceIn: clip.sourceIn + local,
    sourceOut: clip.sourceOut
  };
  clip.duration = leftDuration;
  clip.sourceOut = clip.sourceIn + leftDuration;

  const linkedAudio = project.clips.find(c => c.type === "audio" && c.sourceVideoClipId === clip.id);
  if (linkedAudio) {
    linkedAudio.duration = leftDuration;
    linkedAudio.sourceOut = linkedAudio.sourceIn + leftDuration;
    const rightAudio = {
      ...cloneProject(linkedAudio),
      id: uid("clip"),
      name: linkedAudio.name.replace(/ · Audio$/, "") + " · Audio",
      sourceVideoClipId: right.id,
      timelineStart: playhead,
      duration: rightDuration,
      sourceIn: linkedAudio.sourceIn + local,
      sourceOut: linkedAudio.sourceOut
    };
    project.clips.push(rightAudio);
  }

  project.clips.push(right);
  recalcDuration();
  selected = { kind: "clip", id: right.id };
  emit("clip-split");
  return true;
}

export function addSubtitle(time = playhead) {
  const subtitle = {
    id: uid("sub"),
    text: "새 자막",
    startTime: Math.max(0, time),
    endTime: Math.max(0, time) + 3,
    fontSize: 42,
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.6,
    position: "bottom"
  };
  mutate("subtitle-add", p => p.subtitles.push(subtitle));
  setSelected("subtitle", subtitle.id);
  return subtitle;
}

export function updateSubtitle(id, patch) {
  mutate("subtitle-update", p => {
    const sub = p.subtitles.find(s => s.id === id);
    if (!sub) return;
    Object.assign(sub, patch);
    sub.startTime = Math.max(0, Number(sub.startTime) || 0);
    sub.endTime = Math.max(sub.startTime + 0.1, Number(sub.endTime) || sub.startTime + 0.1);
  });
}

function reflowMainTrack(p) {
  const clips = p.clips.filter(c => c.track === "video1").sort((a,b) => a.timelineStart - b.timelineStart);
  if (!clips.length) return;
  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1];
    const current = clips[i];
    const tr = p.transitions.find(t => t.fromClipId === prev.id && t.toClipId === current.id);
    const overlap = tr ? Math.min(tr.duration, prev.duration - 0.05, current.duration - 0.05) : 0;
    current.timelineStart = Math.max(0, prev.timelineStart + prev.duration - overlap);
    syncLinkedAudioForClip(p, current);
  }
  syncLinkedAudioForClip(p, clips[0]);
}

export function setTransition(fromClipId, type, duration) {
  const source = project.clips.find(c => c.id === fromClipId);
  const resolvedId = source?.type === "audio" && source.sourceVideoClipId ? source.sourceVideoClipId : fromClipId;
  const ordered = project.clips.filter(c => c.track === "video1").sort((a,b) => a.timelineStart - b.timelineStart);
  const index = ordered.findIndex(c => c.id === resolvedId);
  const from = ordered[index];
  const next = ordered[index + 1];

  if (!from) return { ok:false, reason:"VIDEO 1 클립을 선택해야 합니다." };
  if (type !== "none" && !next) return { ok:false, reason:"전환 효과를 적용하려면 뒤에 VIDEO 1 클립이 있어야 합니다." };

  mutate("transition-update", p => {
    p.transitions = p.transitions.filter(t => t.fromClipId !== resolvedId);
    const clips = p.clips.filter(c => c.track === "video1").sort((a,b) => a.timelineStart - b.timelineStart);
    const currentIndex = clips.findIndex(c => c.id === resolvedId);
    const currentFrom = clips[currentIndex];
    const currentNext = clips[currentIndex + 1];

    if (type !== "none" && currentFrom && currentNext) {
      const requested = Math.max(0.1, Number(duration) || 0.5);
      const safeDuration = Math.max(0.1, Math.min(requested, currentFrom.duration - 0.05, currentNext.duration - 0.05, 2));
      p.transitions.push({
        id: uid("transition"),
        fromClipId: currentFrom.id,
        toClipId: currentNext.id,
        type,
        duration: safeDuration
      });
    }
    reflowMainTrack(p);
  });

  return { ok:true, fromClipId:resolvedId, toClipId:next?.id || null };
}

export function undo() {
  if (!history.length) return;
  future.push(snapshot());
  project = history.pop();
  recalcDuration();
  emit("undo");
}

export function redo() {
  if (!future.length) return;
  history.push(snapshot());
  project = future.pop();
  recalcDuration();
  emit("redo");
}

export function exportProject() {
  return JSON.stringify(project, null, 2);
}

export function importProject(data) {
  pushHistory();
  project = { ...createProject(), ...data };
  if (!project.aspectRatio) {
    project.aspectRatio = Number(project.resolution?.height) > Number(project.resolution?.width) ? "9:16" : "16:9";
  }
  project.assets = Array.isArray(data.assets) ? data.assets : [];
  project.clips = Array.isArray(data.clips) ? data.clips : [];
  project.subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];
  project.transitions = Array.isArray(data.transitions) ? data.transitions : [];
  selected = null;
  playhead = 0;
  recalcDuration();
  emit("project-import");
}

export function relinkAsset(assetId, file, url) {
  setRuntimeAsset(assetId, file, url);
  emit("asset-relink");
}

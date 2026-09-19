import { CONFIG, uid } from "./config.js";

const createProject = () => ({
  version: 1,
  name: "새 프로젝트",
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

export function addClip(data) {
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
    x: data.x || 0,
    y: data.y || 0,
    width: data.width || project.resolution.width,
    height: data.height || project.resolution.height,
    opacity: data.opacity ?? 1,
    volume: data.volume ?? 1
  };
  mutate("clip-add", p => p.clips.push(clip));
  setSelected("clip", clip.id);
  return clip;
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
  });
}

export function removeSelected() {
  if (!selected) return;
  if (selected.kind === "clip") {
    mutate("clip-delete", p => {
      p.clips = p.clips.filter(c => c.id !== selected.id);
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

export function setTransition(fromClipId, type, duration) {
  mutate("transition-update", p => {
    p.transitions = p.transitions.filter(t => t.fromClipId !== fromClipId);
    if (type === "none") return;
    const clips = p.clips.filter(c => c.track === "video1").sort((a,b) => a.timelineStart - b.timelineStart);
    const index = clips.findIndex(c => c.id === fromClipId);
    const next = clips[index + 1];
    const from = clips[index];
    if (!from || !next) return;
    const safeDuration = Math.min(Number(duration) || 0.5, from.duration - 0.05, next.duration - 0.05, 2);
    p.transitions.push({
      id: uid("transition"),
      fromClipId,
      toClipId: next.id,
      type,
      duration: Math.max(0.1, safeDuration)
    });
  });
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

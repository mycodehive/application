export const CONFIG = {
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  minClipDuration: 0.1,
  pixelsPerSecond: 50,
  historyLimit: 80,
  largeFileBytes: 500 * 1024 * 1024,
  ffmpeg: {
    packageVersion: "0.12.15",
    utilVersion: "0.12.2",
    coreVersion: "0.12.10"
  },
  tracks: [
    { id: "video1", label: "VIDEO 1", type: "video" },
    { id: "overlay", label: "VIDEO 2 / OVERLAY", type: "overlay" },
    { id: "image", label: "IMAGE", type: "image" },
    { id: "subtitle", label: "SUBTITLE", type: "subtitle" },
    { id: "audio", label: "AUDIO", type: "audio" }
  ]
};

export const TRANSITIONS = ["none","fade","crossfade","slideleft","slideright","wipeleft","wiperight"];

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const uid = (prefix = "id") =>
  prefix + "_" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

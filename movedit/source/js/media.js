import { CONFIG } from "./config.js";
import { addAsset, addClip, getState } from "./state.js";

const isVideo = file => file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name);
const isImage = file => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);

function coverRect(asset, project) {
  const sourceWidth = Math.max(1, Number(asset.width) || project.resolution.width);
  const sourceHeight = Math.max(1, Number(asset.height) || project.resolution.height);
  const scale = Math.max(
    project.resolution.width / sourceWidth,
    project.resolution.height / sourceHeight
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (project.resolution.width - width) / 2,
    y: (project.resolution.height - height) / 2,
    width,
    height
  };
}

function videoMetadata(file, url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      resolve({
        kind: "video",
        name: file.name,
        mime: file.type,
        size: file.size,
        duration: Number(video.duration) || 0,
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080
      });
    };
    video.onerror = () => reject(new Error("Video Metadata 로드 실패: " + file.name));
  });
}

function imageMetadata(file, url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve({
      kind: "image",
      name: file.name,
      mime: file.type,
      size: file.size,
      duration: 5,
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    img.onerror = () => reject(new Error("Image 로드 실패: " + file.name));
  });
}

export async function importMediaFiles(files, { toast } = {}) {
  const imported = [];
  for (const file of files) {
    if (!isVideo(file) && !isImage(file)) {
      toast?.("지원하지 않는 파일입니다: " + file.name, "error");
      continue;
    }
    if (file.size > CONFIG.largeFileBytes) {
      toast?.("대용량 영상은 브라우저 렌더링 속도가 느릴 수 있습니다: " + file.name);
    }
    const url = URL.createObjectURL(file);
    try {
      const meta = isVideo(file) ? await videoMetadata(file, url) : await imageMetadata(file, url);
      const asset = addAsset(meta, file, url);
      imported.push(asset);
      if (meta.width >= 3840 || meta.height >= 2160) {
        toast?.("4K 미디어가 감지되었습니다. 현재 편집기는 1080p 출력을 권장합니다.");
      }
    } catch (error) {
      URL.revokeObjectURL(url);
      console.error(error);
      toast?.(error.message, "error");
    }
  }
  return imported;
}

export function addAssetToTimeline(assetId, preferredTime = null) {
  const { project, playhead } = getState();
  const asset = project.assets.find(a => a.id === assetId);
  if (!asset) return null;

  const fitted = coverRect(asset, project);

  if (asset.kind === "video") {
    const videoClips = project.clips.filter(c => c.track === "video1");
    const end = videoClips.reduce((max, clip) => Math.max(max, clip.timelineStart + clip.duration), 0);
    const time = preferredTime == null ? end : preferredTime;
    return addClip({
      assetId: asset.id,
      name: asset.name,
      type: "video",
      track: "video1",
      timelineStart: time,
      duration: asset.duration,
      sourceIn: 0,
      sourceOut: asset.duration,
      fitMode: "cover",
      ...fitted
    });
  }

  return addClip({
    assetId: asset.id,
    name: asset.name,
    type: "image",
    track: "image",
    timelineStart: preferredTime ?? playhead,
    duration: 5,
    sourceIn: 0,
    sourceOut: 5,
    fitMode: "cover",
    ...fitted
  });
}

export async function createThumbnail(asset, url) {
  if (asset.kind === "image") return url;
  const canvas = document.createElement("canvas");
  canvas.width = 160; canvas.height = 90;
  const ctx = canvas.getContext("2d");
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = url;
  return new Promise(resolve => {
    const finish = () => {
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.72)); }
      catch { resolve(""); }
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, Math.max(0, (asset.duration || 1) * 0.1));
    };
    video.onseeked = finish;
    video.onerror = () => resolve("");
  });
}

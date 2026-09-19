import { getObjectUrl, getState, setPlayhead, setPlaying, subscribe, updateClip } from "./state.js";
import { CONFIG, clamp } from "./config.js";

export function formatTime(seconds = 0) {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return [h,m,s].map(v => String(v).padStart(2,"0")).join(":") + "." + String(milli).padStart(3,"0");
}

function activeAt(item, time, startKey = "timelineStart", durationKey = "duration") {
  const start = item[startKey];
  return time >= start && time < start + item[durationKey];
}

export function initPreview({ canvas, stage, empty, scrub, currentEl, totalEl, playBtn, masterVolume }) {
  const ctx = canvas.getContext("2d");
  const mediaPool = new Map();
  let raf = 0;
  let lastFrame = performance.now();
  let overlayDrag = null;
  let snapGuides = { left:false, right:false, top:false, bottom:false };
  let lastProjectRatio = 16 / 9;

  function fitCanvasToStage(project = getState().project) {
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const style = getComputedStyle(stage);
    const padX = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
    const padY = parseFloat(style.paddingTop || 0) + parseFloat(style.paddingBottom || 0);
    const availableWidth = Math.max(40, stageRect.width - padX);
    const availableHeight = Math.max(40, stageRect.height - padY);
    const projectWidth = Math.max(1, Number(project?.resolution?.width) || 1920);
    const projectHeight = Math.max(1, Number(project?.resolution?.height) || 1080);
    const ratio = projectWidth / projectHeight;
    lastProjectRatio = ratio;

    let displayWidth = availableWidth;
    let displayHeight = displayWidth / ratio;
    if (displayHeight > availableHeight) {
      displayHeight = availableHeight;
      displayWidth = displayHeight * ratio;
    }

    canvas.style.width = Math.max(1, Math.floor(displayWidth)) + "px";
    canvas.style.height = Math.max(1, Math.floor(displayHeight)) + "px";
  }

  function snapThreshold(project) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: CONFIG.snapThresholdPx * project.resolution.width / Math.max(1, rect.width),
      y: CONFIG.snapThresholdPx * project.resolution.height / Math.max(1, rect.height)
    };
  }

  function snapPosition(x, y, width, height, project) {
    const threshold = snapThreshold(project);
    const result = { x, y, guides:{left:false,right:false,top:false,bottom:false} };
    const maxX = project.resolution.width;
    const maxY = project.resolution.height;

    if (Math.abs(x) <= threshold.x) {
      result.x = 0;
      result.guides.left = true;
    }
    if (Math.abs((x + width) - maxX) <= threshold.x) {
      result.x = maxX - width;
      result.guides.right = true;
    }
    if (Math.abs(y) <= threshold.y) {
      result.y = 0;
      result.guides.top = true;
    }
    if (Math.abs((y + height) - maxY) <= threshold.y) {
      result.y = maxY - height;
      result.guides.bottom = true;
    }

    return result;
  }

  function drawSnapGuides(project) {
    if (!Object.values(snapGuides).some(Boolean)) return;
    ctx.save();
    ctx.strokeStyle = "#67d4ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([7,5]);
    if (snapGuides.left) {
      ctx.beginPath(); ctx.moveTo(1,0); ctx.lineTo(1,canvas.height); ctx.stroke();
    }
    if (snapGuides.right) {
      ctx.beginPath(); ctx.moveTo(canvas.width-1,0); ctx.lineTo(canvas.width-1,canvas.height); ctx.stroke();
    }
    if (snapGuides.top) {
      ctx.beginPath(); ctx.moveTo(0,1); ctx.lineTo(canvas.width,1); ctx.stroke();
    }
    if (snapGuides.bottom) {
      ctx.beginPath(); ctx.moveTo(0,canvas.height-1); ctx.lineTo(canvas.width,canvas.height-1); ctx.stroke();
    }
    ctx.restore();
  }

  function getMedia(clip) {
    const url = getObjectUrl(clip.assetId);
    if (!url) return null;
    if (mediaPool.has(clip.id)) return mediaPool.get(clip.id);
    const media = clip.type === "image" ? new Image() : document.createElement("video");
    media.src = url;
    if (clip.type !== "image") {
      media.muted = true;
      media.preload = "auto";
      media.playsInline = true;
    }
    mediaPool.set(clip.id, media);
    return media;
  }

  function syncVideoPlayback(state) {
    const master = Number(masterVolume.value);
    state.project.clips.forEach(clip => {
      if (clip.type === "image") return;
      const media = getMedia(clip);
      if (!media) return;
      const active = activeAt(clip, state.playhead);
      const shouldPlay = state.playing && active;
      const expected = clip.sourceIn + (state.playhead - clip.timelineStart);
      if (active && media.readyState >= 1 && Math.abs((media.currentTime || 0) - expected) > 0.28) {
        try { media.currentTime = clamp(expected, 0, media.duration || expected); } catch {}
      }
      media.volume = clamp(master * (clip.volume ?? 1), 0, 1);
      media.muted = !shouldPlay || media.volume === 0;
      if (shouldPlay) {
        if (media.paused) media.play().catch(() => {});
      } else if (!media.paused) {
        media.pause();
      }
    });
  }

  function drawSubtitle(sub, project) {
    const text = sub.text || "";
    if (!text) return;
    const scale = canvas.width / project.resolution.width;
    const fontSize = sub.fontSize * scale;
    ctx.font = "700 " + fontSize + 'px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = text.split(/\n/);
    const lineHeight = fontSize * 1.25;
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 1);
    const padX = 18 * scale, padY = 10 * scale;
    const x = canvas.width / 2;
    let y = canvas.height - 95 * scale;
    if (sub.position === "top") y = 95 * scale;
    if (sub.position === "center") y = canvas.height / 2;
    const boxH = lines.length * lineHeight + padY * 2;
    ctx.globalAlpha = sub.backgroundOpacity;
    ctx.fillStyle = sub.backgroundColor;
    ctx.fillRect(x - maxWidth/2 - padX, y - boxH/2, maxWidth + padX*2, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sub.textColor;
    lines.forEach((line, i) => {
      const offset = (i - (lines.length - 1)/2) * lineHeight;
      ctx.fillText(line, x, y + offset);
    });
  }

  function drawClip(clip, media, project, time, alpha = 1) {
    if (!media) return;
    const state = getState();
    const sourceTime = clip.sourceIn + (time - clip.timelineStart);
    if (clip.type !== "image" && !state.playing && media.readyState >= 1 && Math.abs(media.currentTime - sourceTime) > 0.04) {
      try { media.currentTime = clamp(sourceTime, 0, media.duration || sourceTime); } catch {}
    }
    const sx = canvas.width / project.resolution.width;
    const sy = canvas.height / project.resolution.height;
    let x = clip.x * sx, y = clip.y * sy, w = clip.width * sx, h = clip.height * sy;

    if (clip.track === "video1" && media.videoWidth && media.videoHeight) {
      const sourceRatio = media.videoWidth / media.videoHeight;
      const canvasRatio = canvas.width / canvas.height;
      if (sourceRatio > canvasRatio) {
        h = canvas.height;
        w = canvas.height * sourceRatio;
        y = 0;
        x = (canvas.width - w) / 2;
      } else {
        w = canvas.width;
        h = canvas.width / sourceRatio;
        x = 0;
        y = (canvas.height - h) / 2;
      }
    }

    ctx.globalAlpha = (clip.opacity ?? 1) * alpha;
    try { ctx.drawImage(media, x, y, w, h); } catch {}
    ctx.globalAlpha = 1;

    const selected = state.selected;
    if (selected?.kind === "clip" && selected.id === clip.id && clip.track !== "video1") {
      ctx.strokeStyle = "#73a6ff"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#73a6ff"; ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
    }
  }

  function renderFrame(state = getState()) {
    const { project, playhead } = state;
    const projectWidth = Number(project.resolution.width) || 1920;
    const projectHeight = Number(project.resolution.height) || 1080;
    const landscape = projectWidth >= projectHeight;
    canvas.width = landscape ? 960 : Math.round(960 * projectWidth / projectHeight);
    canvas.height = landscape ? Math.round(960 * projectHeight / projectWidth) : 960;
    fitCanvasToStage(project);
    ctx.fillStyle = "#000"; ctx.fillRect(0,0,canvas.width,canvas.height);

    syncVideoPlayback(state);

    const activeMain = project.clips
      .filter(c => c.track === "video1" && activeAt(c, playhead))
      .sort((a,b) => a.timelineStart - b.timelineStart);

    if (activeMain.length === 2) {
      const first = activeMain[0];
      const second = activeMain[1];
      const tr = project.transitions.find(t => t.fromClipId === first.id && t.toClipId === second.id);
      if (tr) {
        const progress = clamp((playhead - second.timelineStart) / Math.max(0.01, tr.duration), 0, 1);
        drawClip(first, getMedia(first), project, playhead, 1 - progress);
        drawClip(second, getMedia(second), project, playhead, progress);
      } else {
        activeMain.forEach(clip => drawClip(clip, getMedia(clip), project, playhead));
      }
    } else {
      activeMain.forEach(clip => drawClip(clip, getMedia(clip), project, playhead));
    }

    project.clips
      .filter(c => c.track !== "video1" && c.track !== "audio" && activeAt(c, playhead))
      .sort((a,b) => (a.track === "overlay" ? 1 : 2) - (b.track === "overlay" ? 1 : 2))
      .forEach(clip => drawClip(clip, getMedia(clip), project, playhead));

    project.subtitles.filter(s => playhead >= s.startTime && playhead < s.endTime).forEach(s => drawSubtitle(s, project));
    drawSnapGuides(project);

    empty.classList.toggle("hidden", Boolean(project.clips.length || project.subtitles.length));
    currentEl.textContent = formatTime(playhead);
    totalEl.textContent = formatTime(project.duration);
    scrub.value = project.duration ? Math.round((playhead / project.duration) * 1000) : 0;
  }

  function tick(now) {
    const state = getState();
    if (!state.playing) return;
    const delta = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const next = state.playhead + delta;
    if (next >= state.project.duration) {
      setPlayhead(state.project.duration);
      setPlaying(false);
      renderFrame();
      return;
    }
    setPlayhead(next);
    raf = requestAnimationFrame(tick);
  }

  function setPlayback(value) {
    cancelAnimationFrame(raf);
    setPlaying(value);
    if (value) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      syncVideoPlayback(getState());
    }
  }

  playBtn.addEventListener("click", () => setPlayback(!getState().playing));
  scrub.addEventListener("input", () => {
    const state = getState();
    setPlayhead((Number(scrub.value) / 1000) * state.project.duration);
  });
  masterVolume.addEventListener("input", () => syncVideoPlayback(getState()));

  canvas.addEventListener("pointerdown", event => {
    const state = getState();
    if (state.selected?.kind !== "clip") return;
    const clip = state.project.clips.find(c => c.id === state.selected.id);
    if (!clip || clip.track === "video1") return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / rect.width;
    const py = (event.clientY - rect.top) * canvas.height / rect.height;
    const sx = canvas.width / state.project.resolution.width;
    const sy = canvas.height / state.project.resolution.height;
    const x = clip.x * sx, y = clip.y * sy, w = clip.width * sx, h = clip.height * sy;
    if (px < x || px > x+w || py < y || py > y+h) return;
    const resize = Math.abs(px - (x+w)) < 20 && Math.abs(py - (y+h)) < 20;
    overlayDrag = { id: clip.id, startX:px, startY:py, initial:{...clip}, resize };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!overlayDrag) return;
    const state = getState();
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / rect.width;
    const py = (event.clientY - rect.top) * canvas.height / rect.height;
    const sx = state.project.resolution.width / canvas.width;
    const sy = state.project.resolution.height / canvas.height;
    const dx = (px - overlayDrag.startX) * sx;
    const dy = (py - overlayDrag.startY) * sy;
    const c = overlayDrag.initial;
    if (overlayDrag.resize) {
      const ratio = c.width / c.height;
      let width = Math.max(24, c.width + dx);
      let height = event.shiftKey ? width / ratio : Math.max(24, c.height + dy);
      const threshold = snapThreshold(state.project);
      snapGuides = { left:false, right:false, top:false, bottom:false };

      if (Math.abs((c.x + width) - state.project.resolution.width) <= threshold.x) {
        width = state.project.resolution.width - c.x;
        if (event.shiftKey) height = width / ratio;
        snapGuides.right = true;
      }
      if (Math.abs((c.y + height) - state.project.resolution.height) <= threshold.y) {
        height = state.project.resolution.height - c.y;
        if (event.shiftKey) width = height * ratio;
        snapGuides.bottom = true;
      }

      updateClip(c.id,{width,height,fitMode:"manual"},"overlay-resize");
    } else {
      let x = c.x + dx;
      let y = c.y + dy;
      const snapped = snapPosition(x, y, c.width, c.height, state.project);
      x = snapped.x;
      y = snapped.y;
      snapGuides = snapped.guides;

      if (c.fitMode === "cover") {
        x = clamp(x, state.project.resolution.width - c.width, 0);
        y = clamp(y, state.project.resolution.height - c.height, 0);
      }

      updateClip(c.id,{x,y},"overlay-move");
    }
  });

  canvas.addEventListener("pointerup", () => {
    overlayDrag = null;
    snapGuides = { left:false, right:false, top:false, bottom:false };
    renderFrame(getState());
  });

  const resizeObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => {
        fitCanvasToStage(getState().project);
        renderFrame(getState());
      })
    : null;
  if (stage && resizeObserver) resizeObserver.observe(stage);
  window.addEventListener("resize", () => fitCanvasToStage(getState().project));

  subscribe(state => {
    playBtn.textContent = state.playing ? "❚❚" : "▶";
    renderFrame(state);
  });

  return {
    toggle: () => setPlayback(!getState().playing),
    pause: () => setPlayback(false),
    renderFrame
  };
}

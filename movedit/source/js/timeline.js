import { CONFIG, clamp } from "./config.js";
import { getState, setPlayhead, setSelected, setZoom, subscribe, updateClip, updateSubtitle } from "./state.js";

const basePps = CONFIG.pixelsPerSecond;
export const timeToPixel = (time, zoom = getState().zoom) => time * basePps * (zoom / 100);
export const pixelToTime = (px, zoom = getState().zoom) => px / (basePps * (zoom / 100));

function trackMeta(id) {
  return CONFIG.tracks.find(t => t.id === id) || { id, label: id, type: id };
}

export function initTimeline({ timeline, tracks, ruler, playheadEl, scroll, onAssetDrop }) {
  let drag = null;

  function drawRuler(project, zoom) {
    ruler.innerHTML = "";
    const duration = Math.max(project.duration + 8, 30);
    const pps = basePps * (zoom / 100);
    const step = pps < 25 ? 5 : pps > 90 ? 0.5 : 1;
    for (let t = 0; t <= duration; t += step) {
      const mark = document.createElement("div");
      mark.className = "ruler-mark";
      mark.style.left = timeToPixel(t, zoom) + "px";
      mark.textContent = step < 1 ? t.toFixed(1) + "s" : Math.round(t) + "s";
      ruler.appendChild(mark);
    }
  }

  function clipElement(clip, zoom) {
    const el = document.createElement("div");
    const typeClass = clip.type === "image" ? "image" : clip.track === "overlay" ? "overlay" : "";
    el.className = "clip " + typeClass;
    el.dataset.clipId = clip.id;
    el.style.left = timeToPixel(clip.timelineStart, zoom) + "px";
    el.style.width = Math.max(12, timeToPixel(clip.duration, zoom)) + "px";
    el.innerHTML = '<span class="handle left"></span><div class="clip-body"></div><span class="handle right"></span>';
    el.querySelector(".clip-body").textContent = clip.name || clip.type;
    if (getState().selected?.kind === "clip" && getState().selected.id === clip.id) el.classList.add("selected");

    el.addEventListener("pointerdown", event => {
      const action = event.target.classList.contains("left") ? "trim-left" : event.target.classList.contains("right") ? "trim-right" : "move";
      drag = {
        kind: "clip",
        action,
        id: clip.id,
        startX: event.clientX,
        initial: { ...clip }
      };
      el.setPointerCapture(event.pointerId);
      setSelected("clip", clip.id);
      event.preventDefault();
    });
    return el;
  }

  function subtitleElement(sub, zoom) {
    const el = document.createElement("div");
    el.className = "clip subtitle";
    el.dataset.subtitleId = sub.id;
    el.style.left = timeToPixel(sub.startTime, zoom) + "px";
    el.style.width = Math.max(12, timeToPixel(sub.endTime - sub.startTime, zoom)) + "px";
    el.innerHTML = '<span class="handle left"></span><div class="clip-body"></div><span class="handle right"></span>';
    el.querySelector(".clip-body").textContent = sub.text || "자막";
    if (getState().selected?.kind === "subtitle" && getState().selected.id === sub.id) el.classList.add("selected");

    el.addEventListener("pointerdown", event => {
      const action = event.target.classList.contains("left") ? "trim-left" : event.target.classList.contains("right") ? "trim-right" : "move";
      drag = {
        kind: "subtitle",
        action,
        id: sub.id,
        startX: event.clientX,
        initial: { ...sub }
      };
      el.setPointerCapture(event.pointerId);
      setSelected("subtitle", sub.id);
      event.preventDefault();
    });
    return el;
  }

  function render(state) {
    const { project, zoom, playhead } = state;
    drawRuler(project, zoom);
    tracks.innerHTML = "";
    const duration = Math.max(project.duration + 8, 30);
    timeline.style.width = Math.max(scroll.clientWidth, CONFIG.tracks[0] ? CONFIG.tracks.length : 1, CONFIG.tracks[0] && (118 + timeToPixel(duration, zoom))) + "px";

    CONFIG.tracks.forEach(track => {
      const row = document.createElement("div");
      row.className = "track-row";
      const label = document.createElement("div");
      label.className = "track-label";
      label.innerHTML = "<strong>" + track.label + "</strong><span>" + track.type.toUpperCase() + "</span>";
      const lane = document.createElement("div");
      lane.className = "track-lane";
      lane.dataset.track = track.id;

      lane.addEventListener("dragover", e => e.preventDefault());
      lane.addEventListener("drop", e => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData("application/x-movedit-asset");
        if (!assetId || !onAssetDrop) return;
        const rect = lane.getBoundingClientRect();
        const time = pixelToTime(e.clientX - rect.left, zoom);
        onAssetDrop(assetId, time, track.id);
      });

      if (track.id === "subtitle") {
        project.subtitles.forEach(sub => lane.appendChild(subtitleElement(sub, zoom)));
      } else {
        project.clips.filter(c => c.track === track.id).forEach(clip => lane.appendChild(clipElement(clip, zoom)));
      }
      row.append(label, lane);
      tracks.appendChild(row);
    });

    playheadEl.style.left = (118 + timeToPixel(playhead, zoom)) + "px";
  }

  function moveDrag(event) {
    if (!drag) return;
    const deltaTime = pixelToTime(event.clientX - drag.startX, getState().zoom);
    if (drag.kind === "clip") {
      const c = drag.initial;
      if (drag.action === "move") {
        updateClip(drag.id, { timelineStart: Math.max(0, c.timelineStart + deltaTime) }, "clip-move");
      } else if (drag.action === "trim-left") {
        const delta = clamp(deltaTime, -c.sourceIn, c.duration - CONFIG.minClipDuration);
        updateClip(drag.id, {
          timelineStart: Math.max(0, c.timelineStart + delta),
          duration: c.duration - delta,
          sourceIn: c.sourceIn + delta
        }, "clip-trim");
      } else {
        const delta = clamp(deltaTime, -(c.duration - CONFIG.minClipDuration), Math.max(0, c.sourceOut - c.sourceIn - c.duration));
        updateClip(drag.id, {
          duration: c.duration + delta,
          sourceOut: c.sourceOut + delta
        }, "clip-trim");
      }
    } else {
      const s = drag.initial;
      if (drag.action === "move") {
        const len = s.endTime - s.startTime;
        const start = Math.max(0, s.startTime + deltaTime);
        updateSubtitle(drag.id, { startTime: start, endTime: start + len });
      } else if (drag.action === "trim-left") {
        updateSubtitle(drag.id, { startTime: clamp(s.startTime + deltaTime, 0, s.endTime - 0.1) });
      } else {
        updateSubtitle(drag.id, { endTime: Math.max(s.startTime + 0.1, s.endTime + deltaTime) });
      }
    }
  }

  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", () => { drag = null; });

  ruler.addEventListener("pointerdown", event => {
    const rect = ruler.getBoundingClientRect();
    setPlayhead(pixelToTime(event.clientX - rect.left, getState().zoom));
  });

  scroll.addEventListener("pointerdown", event => {
    if (event.target.closest(".clip") || event.target.closest(".track-label") || event.target === ruler) return;
    const lane = event.target.closest(".track-lane");
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    setPlayhead(pixelToTime(event.clientX - rect.left, getState().zoom));
  });

  subscribe(render);
  return {
    setZoom: value => setZoom(value),
    scrollToPlayhead() {
      const x = 118 + timeToPixel(getState().playhead, getState().zoom);
      if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth) {
        scroll.scrollLeft = Math.max(0, x - scroll.clientWidth * 0.4);
      }
    }
  };
}

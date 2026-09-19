import { getObjectUrl, getRuntimeFile, getState, subscribe, setProjectName, setProjectAspectRatio, setPlayhead, setSelected, updateClip, updateSubtitle, setTransition, undo, redo, removeSelected, splitSelectedClip, addSubtitle, exportProject, importProject, relinkAsset } from "./state.js";
import { importMediaFiles, addAssetToTimeline, createThumbnail } from "./media.js";
import { initTimeline } from "./timeline.js";
import { initPreview } from "./preview.js";
import { renderProject } from "./renderer.js";
import { ffmpegService } from "./ffmpeg-service.js";
import { CONFIG } from "./config.js";

const $ = id => document.getElementById(id);
const els = {
  projectName:$("projectName"), aspectRatio:$("aspectRatioSelect"), undo:$("undoBtn"), redo:$("redoBtn"), saveProject:$("saveProjectBtn"),
  projectFile:$("projectFileInput"), render:$("renderBtn"), mediaInput:$("mediaInput"), dropZone:$("dropZone"),
  mediaList:$("mediaList"), engineStatus:$("engineStatus"), engineHint:$("engineHint"),
  workspace:document.querySelector(".workspace"),
  leftPanelResizer:$("leftPanelResizer"), rightPanelResizer:$("rightPanelResizer"), timelinePanelResizer:$("timelinePanelResizer"),
  canvas:$("previewCanvas"), previewStage:$("previewStage"), previewEmpty:$("previewEmpty"),
  scrub:$("previewScrub"), current:$("currentTime"), total:$("totalTime"), play:$("playBtn"),
  prev:$("prevBtn"), next:$("nextBtn"), split:$("splitBtn"), masterVolume:$("masterVolume"),
  timeline:$("timeline"), tracks:$("tracks"), ruler:$("ruler"), playhead:$("playhead"), timelineScroll:$("timelineScroll"),
  addSubtitle:$("addSubtitleBtn"), deleteBtn:$("deleteBtn"), zoom:$("zoomSelect"),
  selectionLabel:$("selectionLabel"), inspectorEmpty:$("inspectorEmpty"), clipInspector:$("clipInspector"), subtitleInspector:$("subtitleInspector"),
  clipStart:$("clipStart"), clipDuration:$("clipDuration"), clipSourceIn:$("clipSourceIn"), clipSourceOut:$("clipSourceOut"),
  clipX:$("clipX"), clipY:$("clipY"), clipWidth:$("clipWidth"), clipHeight:$("clipHeight"), clipOpacity:$("clipOpacity"), clipVolume:$("clipVolume"),
  transitionType:$("transitionType"), transitionDuration:$("transitionDuration"), deleteClip:$("deleteClipBtn"),
  subtitleText:$("subtitleText"), subtitleStart:$("subtitleStart"), subtitleEnd:$("subtitleEnd"), subtitleFontSize:$("subtitleFontSize"),
  subtitlePosition:$("subtitlePosition"), subtitleColor:$("subtitleColor"), subtitleBgColor:$("subtitleBgColor"), subtitleBgOpacity:$("subtitleBgOpacity"),
  deleteSubtitle:$("deleteSubtitleBtn"), toastRoot:$("toastRoot"),
  renderModal:$("renderModal"), renderMessage:$("renderMessage"), renderProgress:$("renderProgress"), renderPercent:$("renderPercent"),
  cancelRender:$("cancelRenderBtn"), resultModal:$("resultModal"), resultVideo:$("resultVideo"), downloadResult:$("downloadResultBtn"), closeResult:$("closeResultBtn")
};

const quality = document.createElement("select");
quality.id = "renderQuality";
quality.className = "tool-btn";
quality.innerHTML = '<option value="1080p">1080p</option><option value="720p">720p</option>';
els.render.parentElement.insertBefore(quality, els.render);

const thumbCache = new Map();
let resultUrl = null;

function toast(message, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  els.toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function addFiles(files) {
  const state = getState();
  const newFiles = [];
  for (const file of files) {
    const existing = state.project.assets.find(a => a.name === file.name && !getRuntimeFile(a.id));
    if (existing) {
      const url = URL.createObjectURL(file);
      relinkAsset(existing.id, file, url);
      toast("미디어 재연결: " + file.name, "ok");
    } else {
      newFiles.push(file);
    }
  }
  if (newFiles.length) {
    const assets = await importMediaFiles(newFiles, { toast });
    if (assets.length) toast(assets.length + "개 미디어를 가져왔습니다.", "ok");
  }
}

els.dropZone.addEventListener("click", () => els.mediaInput.click());
els.mediaInput.addEventListener("change", async () => {
  await addFiles([...els.mediaInput.files]);
  els.mediaInput.value = "";
});
["dragenter","dragover"].forEach(type => els.dropZone.addEventListener(type, e => {
  e.preventDefault(); els.dropZone.classList.add("drag");
}));
["dragleave","drop"].forEach(type => els.dropZone.addEventListener(type, e => {
  e.preventDefault(); els.dropZone.classList.remove("drag");
}));
els.dropZone.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));

async function renderMediaList(state) {
  const { project } = state;
  const existingIds = new Set([...els.mediaList.children].map(el => el.dataset.assetId));
  if (existingIds.size === project.assets.length && project.assets.every(a => existingIds.has(a.id))) return;

  els.mediaList.innerHTML = "";
  for (const asset of project.assets) {
    const item = document.createElement("div");
    item.className = "media-item";
    item.dataset.assetId = asset.id;
    item.draggable = true;
    const url = getObjectUrl(asset.id);
    let thumb = thumbCache.get(asset.id) || "";
    if (!thumb && url) {
      try { thumb = await createThumbnail(asset, url); thumbCache.set(asset.id, thumb); } catch {}
    }
    const visual = thumb
      ? '<img class="media-thumb" src="' + thumb + '" alt="">'
      : '<div class="media-thumb placeholder">' + (asset.kind === "video" ? "▶" : "▧") + '</div>';
    const status = getRuntimeFile(asset.id) ? "" : " · 재연결 필요";
    const duration = asset.kind === "video" ? (asset.duration || 0).toFixed(1) + "s · " : "";
    const audioInfo = asset.kind === "video" && asset.hasAudio === true ? " · AUDIO 분리" : "";
    item.innerHTML = visual + '<div><div class="media-name" title="' + escapeHtml(asset.name) + '">' + escapeHtml(asset.name) + '</div>' +
      '<div class="media-meta">' + asset.kind.toUpperCase() + ' · ' + duration + asset.width + "×" + asset.height + audioInfo + status + '</div></div>';
    item.addEventListener("dblclick", () => {
      if (!getRuntimeFile(asset.id)) return toast("원본 파일을 다시 가져와 재연결해주세요.", "error");
      addAssetToTimeline(asset.id);
    });
    item.addEventListener("dragstart", e => {
      e.dataTransfer.setData("application/x-movedit-asset", asset.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    els.mediaList.appendChild(item);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

const timelineApi = initTimeline({
  timeline: els.timeline,
  tracks: els.tracks,
  ruler: els.ruler,
  playheadEl: els.playhead,
  scroll: els.timelineScroll,
  onAssetDrop(assetId, time, trackId) {
    if (!getRuntimeFile(assetId)) return toast("원본 파일을 다시 연결해주세요.", "error");
    const clip = addAssetToTimeline(assetId, time);
    if (!clip) return;
    const asset = getState().project.assets.find(a => a.id === assetId);
    if (trackId === "overlay" && asset?.kind === "video") {
      updateClip(clip.id, {
        track:"overlay",
        type:"video",
        fitMode:"cover"
      }, "overlay-add");
    } else if (asset?.kind === "image") {
      updateClip(clip.id, { track:"image", fitMode:"cover" }, "image-add");
    }
  }
});

const previewApi = initPreview({
  canvas:els.canvas, stage:els.previewStage, empty:els.previewEmpty, scrub:els.scrub,
  currentEl:els.current, totalEl:els.total, playBtn:els.play, masterVolume:els.masterVolume
});

function initWorkspaceResizers() {
  const workspace = els.workspace;
  if (!workspace) return;

  const saved = {
    left: Number(localStorage.getItem("movedit:leftPanel")),
    right: Number(localStorage.getItem("movedit:rightPanel")),
    timeline: Number(localStorage.getItem("movedit:timelinePanel"))
  };
  if (saved.left > 0) workspace.style.setProperty("--left-panel", saved.left + "px");
  if (saved.right > 0) workspace.style.setProperty("--right-panel", saved.right + "px");
  if (saved.timeline > 0) workspace.style.setProperty("--timeline-panel", saved.timeline + "px");

  const startResize = (kind, event) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const rect = workspace.getBoundingClientRect();
    const styles = getComputedStyle(workspace);
    const start = {
      x:event.clientX,
      y:event.clientY,
      left:parseFloat(styles.getPropertyValue("--left-panel")) || 250,
      right:parseFloat(styles.getPropertyValue("--right-panel")) || 270,
      timeline:parseFloat(styles.getPropertyValue("--timeline-panel")) || 290
    };
    handle.classList.add("is-dragging");
    document.body.classList.add("workspace-resizing");
    handle.setPointerCapture?.(event.pointerId);

    const move = e => {
      const width = rect.width;
      const height = rect.height;
      if (kind === "left") {
        const maxLeft = Math.max(180, width - start.right - 360);
        const value = Math.min(maxLeft, Math.max(170, start.left + (e.clientX - start.x)));
        workspace.style.setProperty("--left-panel", value + "px");
      } else if (kind === "right") {
        const maxRight = Math.max(210, width - start.left - 360);
        const value = Math.min(maxRight, Math.max(210, start.right - (e.clientX - start.x)));
        workspace.style.setProperty("--right-panel", value + "px");
      } else {
        const maxTimeline = Math.max(190, height - 220);
        const value = Math.min(maxTimeline, Math.max(170, start.timeline - (e.clientY - start.y)));
        workspace.style.setProperty("--timeline-panel", value + "px");
      }
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      handle.classList.remove("is-dragging");
      document.body.classList.remove("workspace-resizing");
      const current = getComputedStyle(workspace);
      localStorage.setItem("movedit:leftPanel", parseFloat(current.getPropertyValue("--left-panel")) || 250);
      localStorage.setItem("movedit:rightPanel", parseFloat(current.getPropertyValue("--right-panel")) || 270);
      localStorage.setItem("movedit:timelinePanel", parseFloat(current.getPropertyValue("--timeline-panel")) || 290);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once:true });
  };

  els.leftPanelResizer?.addEventListener("pointerdown", e => startResize("left", e));
  els.rightPanelResizer?.addEventListener("pointerdown", e => startResize("right", e));
  els.timelinePanelResizer?.addEventListener("pointerdown", e => startResize("timeline", e));

  const reset = () => {
    workspace.style.setProperty("--left-panel","250px");
    workspace.style.setProperty("--right-panel","270px");
    workspace.style.setProperty("--timeline-panel","290px");
    localStorage.removeItem("movedit:leftPanel");
    localStorage.removeItem("movedit:rightPanel");
    localStorage.removeItem("movedit:timelinePanel");
  };
  [els.leftPanelResizer,els.rightPanelResizer,els.timelinePanelResizer]
    .forEach(handle => handle?.addEventListener("dblclick", reset));
}

initWorkspaceResizers();

els.prev.addEventListener("click", () => setPlayhead(getState().playhead - 1));
els.next.addEventListener("click", () => setPlayhead(getState().playhead + 1));
els.split.addEventListener("click", () => {
  if (!splitSelectedClip()) toast("Playhead가 선택 영상 Clip 내부에 있어야 합니다.");
});
els.addSubtitle.addEventListener("click", () => addSubtitle());
els.deleteBtn.addEventListener("click", removeSelected);
els.deleteClip.addEventListener("click", removeSelected);
els.deleteSubtitle.addEventListener("click", removeSelected);
els.zoom.addEventListener("change", () => timelineApi.setZoom(els.zoom.value));
els.aspectRatio.addEventListener("change", () => {
  setProjectAspectRatio(els.aspectRatio.value);
  const p = getState().project;
  toast("Canvas를 " + els.aspectRatio.value + " · " + p.resolution.width + "×" + p.resolution.height + "로 변경했습니다.", "ok");
});
els.undo.addEventListener("click", undo);
els.redo.addEventListener("click", redo);
els.projectName.addEventListener("change", () => setProjectName(els.projectName.value));

els.saveProject.addEventListener("click", () => {
  const name = (getState().project.name || "movedit-project").replace(/[\\/:*?"<>|]+/g,"_");
  downloadText(name + ".movedit.json", exportProject());
  toast("프로젝트 정보를 저장했습니다. 원본 미디어는 포함되지 않습니다.", "ok");
});

els.projectFile.addEventListener("change", async () => {
  const file = els.projectFile.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    importProject(data);
    els.projectName.value = data.name || "불러온 프로젝트";
    toast("프로젝트를 불러왔습니다. 필요한 원본 미디어를 다시 가져와주세요.", "ok");
  } catch (error) {
    console.error(error); toast("프로젝트 파일을 읽을 수 없습니다.", "error");
  }
  els.projectFile.value = "";
});

function bindNumber(el, getter, patchKey, subtitle = false) {
  el.addEventListener("change", () => {
    const selected = getState().selected;
    if (!selected) return;
    const value = Number(el.value);
    if (subtitle) {
      updateSubtitle(selected.id, { [patchKey]: value });
    } else {
      const patch = { [patchKey]: value };
      if (["x","y","width","height"].includes(patchKey)) patch.fitMode = "manual";
      updateClip(selected.id, patch);
    }
  });
}
[
  [els.clipStart,"timelineStart"],[els.clipDuration,"duration"],[els.clipSourceIn,"sourceIn"],[els.clipSourceOut,"sourceOut"],
  [els.clipX,"x"],[els.clipY,"y"],[els.clipWidth,"width"],[els.clipHeight,"height"],
  [els.clipOpacity,"opacity"],[els.clipVolume,"volume"]
].forEach(([el,key]) => bindNumber(el,null,key,false));

els.transitionType.addEventListener("change", () => {
  const selected = getState().selected;
  if (selected?.kind === "clip") setTransition(selected.id, els.transitionType.value, Number(els.transitionDuration.value));
});
els.transitionDuration.addEventListener("change", () => {
  const selected = getState().selected;
  if (selected?.kind === "clip") setTransition(selected.id, els.transitionType.value, Number(els.transitionDuration.value));
});

els.subtitleText.addEventListener("input", () => {
  const selected = getState().selected;
  if (selected?.kind === "subtitle") updateSubtitle(selected.id,{text:els.subtitleText.value});
});
[
  [els.subtitleStart,"startTime"],[els.subtitleEnd,"endTime"],[els.subtitleFontSize,"fontSize"],[els.subtitleBgOpacity,"backgroundOpacity"]
].forEach(([el,key]) => bindNumber(el,null,key,true));
[
  [els.subtitlePosition,"position"],[els.subtitleColor,"textColor"],[els.subtitleBgColor,"backgroundColor"]
].forEach(([el,key]) => el.addEventListener("change", () => {
  const selected = getState().selected;
  if (selected?.kind === "subtitle") updateSubtitle(selected.id,{[key]:el.value});
}));

function renderInspector(state) {
  const { project, selected } = state;
  els.inspectorEmpty.classList.toggle("hidden", Boolean(selected));
  els.clipInspector.classList.add("hidden");
  els.subtitleInspector.classList.add("hidden");
  if (!selected) {
    els.selectionLabel.textContent = "선택된 항목 없음";
    return;
  }

  if (selected.kind === "clip") {
    const clip = project.clips.find(c => c.id === selected.id);
    if (!clip) return;
    els.selectionLabel.textContent = clip.name + " · " + clip.track;
    els.clipInspector.classList.remove("hidden");
    els.clipStart.value = clip.timelineStart.toFixed(2);
    els.clipDuration.value = clip.duration.toFixed(2);
    els.clipSourceIn.value = clip.sourceIn.toFixed(2);
    els.clipSourceOut.value = clip.sourceOut.toFixed(2);
    els.clipX.value = Math.round(clip.x); els.clipY.value = Math.round(clip.y);
    els.clipWidth.value = Math.round(clip.width); els.clipHeight.value = Math.round(clip.height);
    els.clipOpacity.value = clip.opacity ?? 1; els.clipVolume.value = clip.volume ?? 1;
    const tr = project.transitions.find(t => t.fromClipId === clip.id);
    els.transitionType.value = tr?.type || "none";
    els.transitionDuration.value = tr?.duration || 0.5;
  } else {
    const sub = project.subtitles.find(s => s.id === selected.id);
    if (!sub) return;
    els.selectionLabel.textContent = "Subtitle";
    els.subtitleInspector.classList.remove("hidden");
    els.subtitleText.value = sub.text;
    els.subtitleStart.value = sub.startTime.toFixed(2);
    els.subtitleEnd.value = sub.endTime.toFixed(2);
    els.subtitleFontSize.value = sub.fontSize;
    els.subtitlePosition.value = sub.position;
    els.subtitleColor.value = sub.textColor;
    els.subtitleBgColor.value = sub.backgroundColor;
    els.subtitleBgOpacity.value = sub.backgroundOpacity;
  }
}

subscribe(state => {
  els.projectName.value = state.project.name;
  const aspect = state.project.aspectRatio || (state.project.resolution.height > state.project.resolution.width ? "9:16" : "16:9");
  els.aspectRatio.value = aspect;
  const portrait = aspect === "9:16";
  quality.options[0].textContent = "1080p · " + (portrait ? "1080×1920" : "1920×1080");
  quality.options[1].textContent = "720p · " + (portrait ? "720×1280" : "1280×720");
  renderMediaList(state);
  renderInspector(state);
  if (["playhead","playing","zoom"].includes(state.reason)) {
    timelineApi.scrollToPlayhead();
  }
});

ffmpegService.onStatus((status, detail) => {
  const labels = {
    "not-loaded":"Not loaded", loading:"Loading…", ready:"Ready", rendering:"Rendering", error:"Error"
  };
  els.engineStatus.textContent = labels[status] || status;
  els.engineHint.textContent = detail || (status === "ready" ? "렌더링 준비 완료" : "최초 렌더링 시 엔진을 불러옵니다.");
});
ffmpegService.onProgress(({ progress }) => {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    els.renderPercent.textContent = "처리 중";
    return;
  }
  const pct = Math.round(progress * 100);
  els.renderProgress.style.width = pct + "%";
  els.renderPercent.textContent = pct + "%";
});

els.render.addEventListener("click", async () => {
  if (!getState().project.clips.some(c => c.track === "video1")) return toast("VIDEO 1 트랙에 영상을 먼저 배치해주세요.", "error");
  els.renderModal.classList.remove("hidden");
  els.renderProgress.style.width = "0%";
  els.renderPercent.textContent = "처리 중";
  els.renderMessage.textContent = "렌더링 준비 중…";
  try {
    const blob = await renderProject({
      quality: quality.value,
      onMessage: message => { els.renderMessage.textContent = message; }
    });
    els.renderModal.classList.add("hidden");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    els.resultVideo.src = resultUrl;
    els.downloadResult.href = resultUrl;
    const name = (getState().project.name || "movedit-output").replace(/[\\/:*?"<>|]+/g,"_");
    els.downloadResult.download = name + ".mp4";
    els.resultModal.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    els.renderModal.classList.add("hidden");
    if (error?.name === "AbortError") toast("렌더링을 취소했습니다.");
    else toast("렌더링 실패: " + error.message, "error");
  }
});

els.cancelRender.addEventListener("click", () => ffmpegService.cancel());
els.closeResult.addEventListener("click", () => {
  els.resultVideo.pause(); els.resultModal.classList.add("hidden");
});

window.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;
  const editing = ["INPUT","TEXTAREA","SELECT"].includes(tag) || document.activeElement?.isContentEditable;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault(); els.saveProject.click(); return;
  }
  if (editing) return;
  if (event.code === "Space") { event.preventDefault(); previewApi.toggle(); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); }
  else if (event.key.toLowerCase() === "s") { event.preventDefault(); splitSelectedClip(); }
});

window.addEventListener("beforeunload", () => {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
});

toast("MovEdit 준비 완료 · 미디어를 가져와 시작하세요.", "ok");

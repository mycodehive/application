import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { CONFIG } from "./config.js";

class FFmpegService {
  constructor() {
    this.ffmpeg = null;
    this.loaded = false;
    this.loading = null;
    this.status = "not-loaded";
    this.statusListeners = new Set();
    this.progressListeners = new Set();
    this.cancelled = false;
  }

  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onProgress(fn) {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  setStatus(status, detail = "") {
    this.status = status;
    this.statusListeners.forEach(fn => fn(status, detail));
  }

  async load() {
    if (this.loaded && this.ffmpeg) return this.ffmpeg;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      this.setStatus("loading", "FFmpeg 엔진을 불러오는 중");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => console.debug("[ffmpeg]", message));
      ffmpeg.on("progress", ({ progress, time }) => {
        this.progressListeners.forEach(fn => fn({
          progress: Number.isFinite(progress) ? progress : null,
          time: Number.isFinite(time) ? time : null
        }));
      });

      const canUseMt = globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
      const corePackage = canUseMt ? "@ffmpeg/core-mt" : "@ffmpeg/core";
      const envBase = import.meta.env.VITE_FFMPEG_CORE_BASE;
      const baseURL = envBase
        ? envBase.replace(/\/$/, "")
        : "https://cdn.jsdelivr.net/npm/" + corePackage + "@" + CONFIG.ffmpeg.coreVersion + "/dist/esm";

      const loadConfig = {
        coreURL: await toBlobURL(baseURL + "/ffmpeg-core.js", "text/javascript"),
        wasmURL: await toBlobURL(baseURL + "/ffmpeg-core.wasm", "application/wasm")
      };
      if (canUseMt) {
        loadConfig.workerURL = await toBlobURL(baseURL + "/ffmpeg-core.worker.js", "text/javascript");
      }

      await ffmpeg.load(loadConfig);
      this.ffmpeg = ffmpeg;
      this.loaded = true;
      this.cancelled = false;
      this.setStatus("ready", canUseMt ? "Multi-thread core" : "Single-thread core");
      return ffmpeg;
    })().catch(error => {
      this.loading = null;
      this.setStatus("error", error.message);
      throw error;
    });

    const result = await this.loading;
    this.loading = null;
    return result;
  }

  async writeFile(name, source) {
    const ffmpeg = await this.load();
    const data = source instanceof Uint8Array ? source : await fetchFile(source);
    await ffmpeg.writeFile(name, data);
  }

  async writeText(name, text) {
    const ffmpeg = await this.load();
    await ffmpeg.writeFile(name, new TextEncoder().encode(text));
  }

  async readFile(name) {
    const ffmpeg = await this.load();
    return ffmpeg.readFile(name);
  }

  async deleteFile(name) {
    if (!this.ffmpeg) return;
    try { await this.ffmpeg.deleteFile(name); } catch {}
  }

  async exec(args) {
    const ffmpeg = await this.load();
    if (this.cancelled) throw new DOMException("렌더링이 취소되었습니다.", "AbortError");
    this.setStatus("rendering");
    const code = await ffmpeg.exec(args);
    if (this.cancelled) throw new DOMException("렌더링이 취소되었습니다.", "AbortError");
    if (code !== 0) throw new Error("FFmpeg 작업이 실패했습니다. exit code=" + code);
    return code;
  }

  async probeHasAudio(filename) {
    const ffmpeg = await this.load();
    const lines = [];
    const listener = ({ message }) => lines.push(message);
    ffmpeg.on("log", listener);
    try {
      await ffmpeg.exec(["-hide_banner", "-i", filename]);
    } catch {
      // 입력 정보만 확인하는 명령은 출력 파일이 없어 실패 코드가 정상일 수 있다.
    } finally {
      if (typeof ffmpeg.off === "function") ffmpeg.off("log", listener);
    }
    return lines.some(line => /Stream.*Audio:/i.test(line));
  }

  cancel() {
    this.cancelled = true;
    if (this.ffmpeg) {
      try { this.ffmpeg.terminate(); } catch {}
    }
    this.ffmpeg = null;
    this.loaded = false;
    this.loading = null;
    this.setStatus("not-loaded", "취소 후 엔진 재초기화 필요");
  }

  finish() {
    if (this.loaded) this.setStatus("ready");
  }
}

export const ffmpegService = new FFmpegService();

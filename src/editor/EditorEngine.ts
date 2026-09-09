import { getMp4MimeType } from '../recording/mp4';
import { audioPosition, clamp, defaultSettings, drawEditorFrame, type AudioLayer } from './model';

type Sound = { element: HTMLAudioElement; source?: MediaElementAudioSourceNode; gain?: GainNode };
export function mediaReady(element: HTMLMediaElement, event: string, action: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timeout); element.removeEventListener(event, success); element.removeEventListener('error', failure); };
    const success = () => { clean(); resolve(); };
    const failure = () => { clean(); reject(new Error('This media could not be decoded. Try an MP4 video or MP3/WAV audio supported by your browser.')); };
    const timeout = window.setTimeout(failure, 30000);
    element.addEventListener(event, success, { once: true }); element.addEventListener('error', failure, { once: true });
    try { action(); } catch (error) { clean(); reject(error); }
  });
}

export class EditorEngine {
  readonly video = document.createElement('video');
  settings = defaultSettings();
  layers: AudioLayer[] = [];
  private sounds = new Map<string, Sound>();
  private context: AudioContext | null = null;
  private mix: GainNode | null = null;
  private videoSource: MediaElementAudioSourceNode | null = null;
  private videoGain: GainNode | null = null;
  private output: MediaStreamAudioDestinationNode | null = null;
  private frame = 0;
  private disposed = false;
  private recorder: MediaRecorder | null = null;
  private exportFailure: Error | null = null;
  private exportStarted = false;
  private exportRequest = 0;
  private playing = false;
  private playRequest = 0;
  private ctx: CanvasRenderingContext2D;
  onTime: (time: number, playing: boolean) => void = () => {};
  onError: (message: string) => void = () => {};
  onProgress: (progress: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Video editing requires canvas support.');
    this.ctx = ctx;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.addEventListener('ended', this.ended);
    this.video.addEventListener('error', this.failed);
    this.video.addEventListener('waiting', this.waiting);
    this.video.addEventListener('playing', this.resumed);
    document.addEventListener('visibilitychange', this.visibility);
    this.tick();
  }

  private visibility = () => {
    if (document.hidden) {
      if (this.recorder) this.cancelExport('Export stopped because the editor was hidden. Keep this page visible while exporting.');
      else this.pause();
    }
  };
  private ended = () => { if (this.recorder && this.exportStarted) this.finishExport(); else this.pause(); };
  private failed = () => {
    const message = 'The video could not be played. Try a browser-supported MP4 file.';
    if (this.recorder) this.cancelExport(message); else { this.pause(); this.onError(message); }
  };
  private waiting = () => {
    this.sounds.forEach((sound) => sound.element.pause());
    if (this.recorder?.state === 'recording' && this.exportStarted) this.recorder.pause();
  };
  private resumed = () => { if (this.recorder?.state === 'paused') this.recorder.resume(); };

  async load(url: string): Promise<{ duration: number; width: number; height: number }> {
    this.pause();
    await mediaReady(this.video, 'loadeddata', () => { this.video.src = url; this.video.load(); });
    if (this.disposed) throw new Error('Editor closed.');
    if (!Number.isFinite(this.video.duration) || this.video.duration <= 0 || !this.video.videoWidth) throw new Error('This video has no readable duration or frames.');
    return { duration: this.video.duration, width: this.video.videoWidth, height: this.video.videoHeight };
  }

  async addAudio(layer: AudioLayer): Promise<number> {
    const element = document.createElement('audio');
    element.preload = 'auto';
    try {
      await mediaReady(element, 'loadedmetadata', () => { element.src = layer.url; element.load(); });
      if (this.disposed) throw new Error('Editor closed.');
      if (!Number.isFinite(element.duration) || element.duration <= 0) throw new Error('This audio file has no readable duration.');
      this.sounds.set(layer.id, { element });
      return element.duration;
    } catch (error) { element.removeAttribute('src'); element.load(); throw error; }
  }

  removeAudio(id: string) {
    const sound = this.sounds.get(id);
    if (!sound) return;
    sound.element.pause(); sound.source?.disconnect(); sound.gain?.disconnect();
    sound.element.removeAttribute('src'); sound.element.load(); this.sounds.delete(id);
  }

  private async prepareAudio() {
    if (!this.context) {
      this.context = new AudioContext();
      this.mix = this.context.createGain();
      this.output = this.context.createMediaStreamDestination();
      this.mix.connect(this.context.destination);
      this.mix.connect(this.output);
      this.videoSource = this.context.createMediaElementSource(this.video);
      this.videoGain = this.context.createGain();
      this.videoSource.connect(this.videoGain); this.videoGain.connect(this.mix);
    }
    for (const sound of this.sounds.values()) {
      if (!sound.source) {
        sound.source = this.context.createMediaElementSource(sound.element);
        sound.gain = this.context.createGain(); sound.source.connect(sound.gain); sound.gain.connect(this.mix!);
      }
    }
    await this.context.resume();
  }

  private syncAudio(time: number, play: boolean) {
    if (this.videoGain) this.videoGain.gain.value = this.settings.muted ? 0 : 1;
    for (const layer of this.layers) {
      const sound = this.sounds.get(layer.id);
      if (!sound) continue;
      if (sound.gain) sound.gain.gain.value = layer.volume / 100;
      const position = audioPosition(time, layer.start, layer.duration);
      if (position === null || !play) { sound.element.pause(); continue; }
      if ((sound.element.paused && Math.abs(sound.element.currentTime - position) > .01) || Math.abs(sound.element.currentTime - position) > .15) sound.element.currentTime = position;
      if (sound.element.paused && !sound.element.ended) void sound.element.play().catch(() => {
        if (this.recorder) this.cancelExport(`Could not play audio: ${layer.name}`);
        else { this.pause(); this.onError(`Could not play audio: ${layer.name}`); }
      });
      // Seeking back into an ended layer clears its ended state asynchronously.
      else if (sound.element.ended && position < layer.duration) sound.element.currentTime = position;
    }
  }

  private tick = () => {
    if (this.disposed) return;
    try {
      if (this.video.readyState >= 2) {
        if (this.playing && this.settings.end > 0 && this.video.currentTime >= this.settings.end) {
          if (this.recorder) this.finishExport(); else this.pause();
        }
        drawEditorFrame(this.ctx, this.video, this.settings);
        this.syncAudio(this.video.currentTime, this.playing && !this.video.paused && this.video.readyState >= 3);
        this.onTime(this.video.currentTime, this.playing);
        if (this.recorder) this.onProgress(clamp((this.video.currentTime - this.settings.start) / (this.settings.end - this.settings.start), 0, 1));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video rendering failed.';
      if (this.recorder) this.cancelExport(message); else { this.pause(); this.onError(message); }
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  async seek(time: number) {
    this.pause();
    const target = clamp(time, this.settings.start, this.settings.end);
    if (Math.abs(this.video.currentTime - target) > .001) await mediaReady(this.video, 'seeked', () => { this.video.currentTime = target; });
    if (this.video.readyState >= 2) drawEditorFrame(this.ctx, this.video, this.settings);
    this.onTime(target, false);
  }

  async play() {
    let request = ++this.playRequest;
    await this.prepareAudio();
    if (this.disposed || request !== this.playRequest) return;
    if (this.video.currentTime < this.settings.start || this.video.currentTime >= this.settings.end - .03) {
      const seeking = this.seek(this.settings.start);
      request = this.playRequest;
      await seeking;
      if (this.disposed || request !== this.playRequest) return;
    }
    if (this.videoGain) this.videoGain.gain.value = this.settings.muted ? 0 : 1;
    await this.video.play();
    if (this.disposed || request !== this.playRequest) { this.video.pause(); return; }
    this.playing = true;
    this.syncAudio(this.video.currentTime, true);
  }

  pause() {
    this.playRequest++;
    this.video.pause(); this.playing = false;
    this.sounds.forEach((sound) => sound.element.pause());
    this.onTime(this.video.currentTime, false);
  }

  private finishExport() {
    this.pause();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }
  cancelExport(message = 'Export cancelled.') {
    this.exportRequest++;
    this.exportFailure = new Error(message);
    this.finishExport();
  }

  async exportMp4(): Promise<Blob> {
    if (this.recorder) throw new Error('An export is already running.');
    if (!window.MediaRecorder || !this.ctx.canvas.captureStream) throw new Error('MP4 export is unavailable in this browser.');
    const request = ++this.exportRequest;
    const mimeType = getMp4MimeType((type) => MediaRecorder.isTypeSupported(type), true);
    await this.prepareAudio();
    if (request !== this.exportRequest) throw new Error('Export cancelled.');
    await this.seek(this.settings.start);
    if (request !== this.exportRequest) throw new Error('Export cancelled.');
    if (this.disposed) throw new Error('Editor closed.');
    const stream = this.ctx.canvas.captureStream(30);
    stream.addTrack(this.output!.stream.getAudioTracks()[0].clone());
    this.exportFailure = null;
    this.exportStarted = false;
    return new Promise((resolve, reject) => {
      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 }); }
      catch (error) { stream.getTracks().forEach((track) => track.stop()); reject(error); return; }
      this.recorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => this.cancelExport('MP4 encoding failed. Try a shorter clip or another browser.');
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.recorder = null; this.exportStarted = false;
        this.pause();
        if (this.exportFailure) { reject(this.exportFailure); return; }
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) reject(new Error('No video was exported.'));
        else resolve(blob);
      };
      try {
        recorder.start(250);
        this.exportStarted = true;
        void this.play().catch((error) => this.cancelExport(error instanceof Error ? error.message : 'Could not start export.'));
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop()); this.recorder = null; reject(error);
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.cancelExport('Editor closed.');
    this.pause(); cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.visibility);
    this.video.removeEventListener('ended', this.ended); this.video.removeEventListener('error', this.failed);
    this.video.removeEventListener('waiting', this.waiting); this.video.removeEventListener('playing', this.resumed);
    this.sounds.forEach((_, id) => this.removeAudio(id));
    this.video.removeAttribute('src'); this.video.load();
    this.videoSource?.disconnect(); this.videoGain?.disconnect(); this.mix?.disconnect();
    this.output?.stream.getTracks().forEach((track) => track.stop());
    if (this.context) void this.context.close().catch(() => {});
  }
}

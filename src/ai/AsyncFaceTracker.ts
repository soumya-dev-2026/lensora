import type { FaceFeatures } from '../types/filters';

/** Keeps inference off the UI thread and never queues old camera frames. */
export class AsyncFaceTracker {
  private worker: Worker | null = null;
  private pending = false;
  private disposed = false;
  private face: FaceFeatures | null = null;
  private error: Error | null = null;
  private requestedAt = 0;
  private lastRequest = -Infinity;
  private resultTime = -Infinity;
  private input = document.createElement('canvas');
  private context = this.input.getContext('2d', { alpha: false });
  private fallback: import('./FaceTracker').FaceTracker | null = null;
  inferenceMs = 0;
  completedFrames = 0;

  async initialize(): Promise<void> {
    try {
      if (typeof OffscreenCanvas === 'undefined') throw new Error('Worker canvas unavailable');
      await new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' });
        this.worker = worker;
        worker.onmessage = ({ data }) => {
          if (this.disposed) { data.face?.mask?.close(); return; }
          if (data.type === 'ready') resolve();
          if (data.type === 'face') {
            this.releaseFace();
            this.face = data.face;
            this.resultTime = data.timestamp;
            this.inferenceMs = performance.now() - this.requestedAt;
            this.completedFrames++;
            this.pending = false;
          }
          if (data.type === 'error') {
            this.error = new Error(data.message);
            this.pending = false;
            reject(this.error);
          }
        };
        worker.onerror = () => {
          this.error = new Error('Face processing failed. Restart the camera to retry.');
          this.pending = false;
          reject(this.error);
        };
        worker.postMessage({ type: 'initialize' });
      });
    } catch (error) {
      this.worker?.terminate(); this.worker = null;
      if (this.disposed) return;
      // Preserve face effects on WebViews without worker WebGL/OffscreenCanvas.
      const { FaceTracker } = await import('./FaceTracker');
      if (this.disposed) return;
      const tracker = new FaceTracker();
      this.fallback = tracker;
      try { await tracker.initialize(); }
      catch (fallbackError) { tracker.dispose(); this.fallback = null; throw fallbackError; }
      if (this.disposed) tracker.dispose();
      this.error = null;
    }
  }

  detect(source: HTMLVideoElement | HTMLCanvasElement, timestamp: number): FaceFeatures | null {
    if (this.disposed) return null;
    if (this.error) throw this.error;
    if (timestamp - this.resultTime > 500) this.releaseFace();
    const interval = Math.max(1000 / 12, this.inferenceMs * 1.15);
    if (!this.pending && timestamp - this.lastRequest >= interval) {
      this.lastRequest = timestamp;
      this.requestedAt = performance.now();
      if (this.fallback) {
        this.face = this.fallback.detect(source, timestamp);
        this.resultTime = timestamp;
        this.inferenceMs = performance.now() - this.requestedAt;
        this.completedFrames++;
        return this.face;
      }
      if (!this.worker || !this.context) return this.face;
      const width = 'videoWidth' in source ? source.videoWidth : source.width;
      const height = 'videoHeight' in source ? source.videoHeight : source.height;
      if (!width || !height) return this.face;
      const scale = Math.min(1, 256 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (this.input.width !== w || this.input.height !== h) { this.input.width = w; this.input.height = h; }
      this.context.drawImage(source, 0, 0, w, h);
      this.pending = true;
      void createImageBitmap(this.input).then((image) => {
        if (this.disposed) { image.close(); return; }
        try { this.worker!.postMessage({ type: 'frame', image, timestamp }, [image]); }
        catch (error) { image.close(); throw error; }
      }).catch((error) => { if (!this.disposed) { this.error = error; this.pending = false; } });
    }
    return this.face;
  }

  private releaseFace(): void {
    const mask = this.face?.mask;
    if (mask && 'close' in mask) mask.close();
    this.face = null;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate(); this.worker = null;
    this.fallback?.dispose(); this.fallback = null;
    this.releaseFace();
  }
}

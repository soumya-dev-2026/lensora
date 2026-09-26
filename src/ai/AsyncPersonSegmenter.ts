import type { PersonMask } from './PersonSegmenter';

export class AsyncPersonSegmenter {
  private worker: Worker | null = null;
  private pending = false;
  private disposed = false;
  private mask: PersonMask | null = null;
  private error: Error | null = null;
  private requestedAt = 0;
  inferenceMs = 0;

  initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.disposed) return;
        if (data.type === 'ready') resolve();
        if (data.type === 'mask') { this.mask = data.mask; this.pending = false; this.inferenceMs = performance.now() - this.requestedAt; }
        if (data.type === 'error') {
          this.error = new Error(data.message);
          this.pending = false;
          reject(this.error);
        }
      };
      worker.onerror = () => {
        this.error = new Error('Could not start camera mask processing.');
        this.pending = false;
        reject(this.error);
      };
      worker.postMessage({ type: 'initialize' });
    });
  }

  segment(input: HTMLCanvasElement | (() => HTMLCanvasElement), timestamp: number): PersonMask | null {
    if (this.error) throw this.error;
    if (!this.pending && !this.disposed && this.worker) {
      const frame = typeof input === 'function' ? input() : input;
      this.pending = true;
      this.requestedAt = performance.now();
      void createImageBitmap(frame).then((image) => {
        if (this.disposed) { image.close(); return; }
        try { this.worker!.postMessage({ type: 'frame', image, timestamp }, [image]); }
        catch (error) { image.close(); throw error; }
      }).catch((error) => {
        if (!this.disposed) { this.error = error instanceof Error ? error : new Error(String(error)); this.pending = false; }
      });
    }
    return this.mask;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.mask = null;
  }
}

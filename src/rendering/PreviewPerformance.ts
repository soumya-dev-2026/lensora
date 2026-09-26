export class AdaptivePreviewQuality {
  scale = 1;
  private averageMs = 0;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private previousTime: number | null = null;
  private levels = [1, 0.85, 0.7, 0.55];

  record(time: number, renderMs: number, locked: boolean): void {
    const gap = this.previousTime === null ? 0 : time - this.previousTime;
    this.previousTime = time;
    if (gap > 500 || locked) { this.slowSince = this.fastSince = null; return; }
    this.averageMs = this.averageMs ? this.averageMs * 0.85 + renderMs * 0.15 : renderMs;
    const slow = this.averageMs > 26 || (gap > 45 && gap < 500);
    const fast = this.averageMs < 16 && gap > 0 && gap < 38;
    if (slow) {
      this.fastSince = null;
      this.slowSince ??= time;
      if (time - this.slowSince >= 1000) {
        this.scale = this.levels[Math.min(this.levels.length - 1, this.levels.indexOf(this.scale) + 1)];
        this.slowSince = null;
      }
    } else if (fast) {
      this.slowSince = null;
      this.fastSince ??= time;
      if (time - this.fastSince >= 6000) {
        this.scale = this.levels[Math.max(0, this.levels.indexOf(this.scale) - 1)];
        this.fastSince = null;
      }
    } else this.slowSince = this.fastSince = null;
  }
}

export interface PreviewStats {
  fps: number; renderMs: number; worstRenderMs: number; maskMs: number; faceMs: number;
  renderScale: number; frames: number;
}

/** Updated at most once a second, without React renders or per-frame console output. */
export class PreviewPerformance {
  snapshot: PreviewStats = { fps: 0, renderMs: 0, worstRenderMs: 0, maskMs: 0, faceMs: 0, renderScale: 1, frames: 0 };
  private started: number | null = null;
  private frames = 0;
  private cost = 0;
  private worst = 0;

  record(time: number, cost: number, scale: number, maskMs = 0, faceMs = 0): void {
    if (this.started === null || time - this.started > 3000) { this.started = time; this.frames = 0; this.cost = this.worst = 0; }
    this.frames++; this.cost += cost; this.worst = Math.max(this.worst, cost);
    const elapsed = time - this.started;
    if (elapsed < 1000) return;
    this.snapshot = { fps: Math.round(this.frames * 1000 / elapsed), renderMs: this.cost / this.frames,
      worstRenderMs: this.worst, renderScale: scale, maskMs, faceMs, frames: this.snapshot.frames + this.frames };
    this.started = time; this.frames = 0; this.cost = this.worst = 0;
  }
}

declare global { interface Window { __lensoraPerformance?: PreviewPerformance; } }

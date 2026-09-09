// The model is 256x256 internally. Upsampling its result to the full camera
// resolution before CPU mask processing adds cost without recovering detail.
export function segmentationSize(width: number, height: number): [number, number] {
  const scale = Math.min(1, 384 / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export class SegmentationInput {
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d', { alpha: false });
  readonly frame = document.createElement('canvas');
  private frameContext = this.frame.getContext('2d', { alpha: false });

  capture(video: HTMLVideoElement): HTMLCanvasElement {
    if (!this.context || !this.frameContext) throw new Error('Unable to prepare the camera frame.');
    // Freeze once so inference and rendering cannot sample different camera frames.
    if (this.frame.width !== video.videoWidth || this.frame.height !== video.videoHeight) {
      this.frame.width = video.videoWidth;
      this.frame.height = video.videoHeight;
    }
    this.frameContext.drawImage(video, 0, 0);
    const [width, height] = segmentationSize(this.frame.width, this.frame.height);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.drawImage(this.frame, 0, 0, width, height);
    return this.canvas;
  }
}

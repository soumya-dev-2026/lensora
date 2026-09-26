// The model is 256x256 internally. Passing a larger image adds upload and
// canvas work without recovering segmentation detail.
export function segmentationSize(width: number, height: number): [number, number] {
  const scale = Math.min(1, 256 / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export class SegmentationInput {
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d', { alpha: false });
  readonly frame = document.createElement('canvas');
  private frameContext = this.frame.getContext('2d', { alpha: false });

  capture(video: HTMLVideoElement, maximumDimension = 1280, freezeFrame = true): HTMLCanvasElement {
    if (!this.context || !this.frameContext) throw new Error('Unable to prepare the camera frame.');
    if (!freezeFrame) {
      const [width, height] = segmentationSize(video.videoWidth, video.videoHeight);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width; this.canvas.height = height;
      }
      this.context.drawImage(video, 0, 0, width, height);
      return this.canvas;
    }
    // Freeze once so inference and rendering cannot sample different camera
    // frames. Cap high-resolution cameras at the output resolution so each
    // frame does not upload pixels the preview cannot display.
    const scale = Math.min(1, maximumDimension / Math.max(video.videoWidth, video.videoHeight));
    const frameWidth = Math.max(1, Math.round(video.videoWidth * scale));
    const frameHeight = Math.max(1, Math.round(video.videoHeight * scale));
    if (this.frame.width !== frameWidth || this.frame.height !== frameHeight) {
      this.frame.width = frameWidth;
      this.frame.height = frameHeight;
    }
    this.frameContext.drawImage(video, 0, 0, frameWidth, frameHeight);
    const [width, height] = segmentationSize(this.frame.width, this.frame.height);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.drawImage(this.frame, 0, 0, width, height);
    return this.canvas;
  }
}

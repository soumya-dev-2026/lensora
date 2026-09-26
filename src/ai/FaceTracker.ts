import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { loadModel } from './modelCache';
import type { FaceFeatures } from '../types/filters';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

function trackingCanvas(): HTMLCanvasElement | OffscreenCanvas {
  return typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
}

// Build closed contours from MediaPipe's official connection sets. Lips contain
// separate outer and inner loops; even-odd fill leaves teeth/mouth untouched.
export function contourLoops(connections: { start: number; end: number }[]): number[][] {
  const neighbors = new Map<number, number[]>();
  for (const { start, end } of connections) {
    neighbors.set(start, [...(neighbors.get(start) ?? []), end]);
    neighbors.set(end, [...(neighbors.get(end) ?? []), start]);
  }
  const visited = new Set<number>();
  const loops: number[][] = [];
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current: number | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      loop.push(current);
      visited.add(current);
      current = neighbors.get(current)?.find((next) => !visited.has(next));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export class FaceTracker {
  private tracker: FaceLandmarker | null = null;
  private canvas = trackingCanvas();
  private context = this.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  private input = trackingCanvas();
  private inputContext = this.input.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  private lips = contourLoops(FaceLandmarker.FACE_LANDMARKS_LIPS);
  private eyeLoops = [
    ...contourLoops(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE),
    ...contourLoops(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
  ];

  async initialize(moduleWorker = false): Promise<void> {
    if (!this.context) throw new Error('Face effects require canvas support.');
    const [vision, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_ROOT, moduleWorker), loadModel(MODEL_URL)]);
    this.tracker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate: 'GPU' },
      runningMode: 'VIDEO', numFaces: 1,
      minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  }

  detect(video: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, timestamp: number): FaceFeatures | null {
    if (!this.inputContext) return null;
    const sourceWidth = 'videoWidth' in video ? video.videoWidth : video.width;
    const sourceHeight = 'videoHeight' in video ? video.videoHeight : video.height;
    if (!sourceWidth || !sourceHeight) return null;
    const scale = Math.min(1, 256 / Math.max(sourceWidth, sourceHeight));
    const inputWidth = Math.max(1, Math.round(sourceWidth * scale));
    const inputHeight = Math.max(1, Math.round(sourceHeight * scale));
    if (this.input.width !== inputWidth || this.input.height !== inputHeight) {
      this.input.width = inputWidth; this.input.height = inputHeight;
    }
    this.inputContext.drawImage(video, 0, 0, inputWidth, inputHeight);
    const points = this.tracker?.detectForVideo(this.input, timestamp).faceLandmarks[0];
    if (!points || !this.context) return null;
    const width = 512;
    const height = Math.max(1, Math.round(width * ('videoHeight' in video ? video.videoHeight / video.videoWidth : video.height / video.width)));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.context;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const trace = (loops: number[][]) => {
      ctx.beginPath();
      for (const loop of loops) {
        loop.forEach((index, i) => {
          const { x, y } = points[index];
          if (i === 0) ctx.moveTo(x * width, y * height);
          else ctx.lineTo(x * width, y * height);
        });
        ctx.closePath();
      }
    };
    const eyes = this.eyeLoops.map((loop) => this.eyeBounds(loop.map((i) => points[i]), video));
    // Keep the exact feature channels used by the beauty controls. Do not add
    // enlarged eye protection regions, which can appear as visible eye patches.
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(0.5px)';
    trace(this.lips); ctx.fillStyle = '#ff0000'; ctx.fill('evenodd');
    trace(this.eyeLoops); ctx.fillStyle = '#00ff00'; ctx.fill('evenodd');
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    const top = points[10], bottom = points[152], left = points[234], right = points[454];
    const aspect = width / height;
    const roll = Math.atan2((right.y - left.y), (right.x - left.x) * aspect);
    const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    return { mask: this.canvas, eyes, pose: {
      center: [(top.x + bottom.x) / 2, (top.y + bottom.y) / 2],
      radius: [Math.max(distance(left, right) / aspect / 2, 0.001), Math.max(distance(top, bottom) / 2, 0.001)], roll,
    } };
  }

  private eyeBounds(points: NormalizedLandmark[], video: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): [number, number, number, number] {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    // Circular falloff in camera pixels remains stable when the head tilts.
    const aspect = ('videoWidth' in video ? video.videoWidth / video.videoHeight : video.width / video.height);
    const radiusX = Math.max(...points.map((p) => Math.hypot(p.x - centerX, (p.y - centerY) / aspect))) * 1.7;
    return [centerX, centerY, Math.max(radiusX, 0.001), Math.max(radiusX * aspect, 0.001)];
  }

  dispose(): void {
    this.tracker?.close();
    this.tracker = null;
  }
}

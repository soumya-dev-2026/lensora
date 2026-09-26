import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { loadModel } from './modelCache';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
// SelfieMulticlass: background, hair, body-skin, face-skin, clothes, others.
const PERSON_CLASSES = [1, 2, 3, 4];

// Only grow face support far enough to cover attached eyewear, not room objects.
export function nearbyFace(face: Float32Array, width: number, height: number,
  horizontal = new Float32Array(face.length), expanded = new Float32Array(face.length),
  deque = new Int32Array(Math.max(width, height))): Float32Array {
  const radius = Math.max(1, Math.round(Math.min(width, height) * 0.025));
  // A monotonic deque visits each pixel once per axis instead of repeatedly
  // scanning a neighborhood. The result is identical to the old max filter.
  for (let y = 0; y < height; y++) {
    let head = 0, tail = 0, next = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      while (next <= Math.min(width - 1, x + radius)) {
        while (tail > head && face[row + deque[tail - 1]] <= face[row + next]) tail--;
        deque[tail++] = next++;
      }
      while (deque[head] < x - radius) head++;
      horizontal[row + x] = face[row + deque[head]];
    }
  }
  for (let x = 0; x < width; x++) {
    let head = 0, tail = 0, next = 0;
    for (let y = 0; y < height; y++) {
      while (next <= Math.min(height - 1, y + radius)) {
        while (tail > head && horizontal[deque[tail - 1] * width + x] <= horizontal[next * width + x]) tail--;
        deque[tail++] = next++;
      }
      while (deque[head] < y - radius) head++;
      expanded[y * width + x] = horizontal[deque[head] * width + x];
    }
  }
  return expanded;
}

export function temporalWeight(delta: number, elapsed: number): number {
  // Smooth only small confidence fluctuations. Moving edges use the current
  // mask immediately, including at high camera frame rates.
  const movement = Math.min(1, Math.max(0, (Math.abs(delta) - 0.04) / 0.16));
  const current = 0.45 + 0.55 * movement;
  return 1 - Math.pow(1 - current, Math.min(3, Math.max(0.25, elapsed / (1000 / 30))));
}

export interface PersonMask {
  data: Uint8Array;
  regions: Uint8Array;
  width: number;
  height: number;
}

export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private previousMask: Float32Array | null = null;
  private previousRegions: Float32Array | null = null;
  private lastTimestamp = 0;
  private currentMask = new Float32Array(0);
  private currentRegions = new Float32Array(0);
  // Alternate buffers so the compositor can finish uploading the previous
  // frame while the next mask is prepared, without allocating every frame.
  private outputMasks: Uint8Array[] = [];
  private outputRegions: Uint8Array[] = [];
  private outputIndex = 0;
  private faceHorizontal = new Float32Array(0);
  private faceExpanded = new Float32Array(0);
  private faceDeque = new Int32Array(0);
  private weights = new Float32Array(256);
  private maskWidth = 0;
  private maskHeight = 0;

  async initialize(): Promise<void> {
    // Module workers need the ESM loader, which publishes ModuleFactory explicitly.
    const [vision, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_ROOT, true), loadModel(MODEL_URL)]);
    this.segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  segment(video: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, timestamp: number): PersonMask | null {
    if (!this.segmenter) return null;

    let mask: PersonMask | null = null;
    this.segmenter.segmentForVideo(video, timestamp, (result) => {
      const confidences = result.confidenceMasks;
      if (!confidences || confidences.length !== 6) {
        throw new Error('The person model did not return the expected six segmentation classes.');
      }
      const confidence = confidences[0];
      const pixels = confidence.width * confidence.height;
      if (this.currentMask.length !== pixels) {
        this.currentMask = new Float32Array(pixels);
        this.currentRegions = new Float32Array(pixels * 2);
        this.outputMasks = [new Uint8Array(pixels), new Uint8Array(pixels)];
        this.outputRegions = [new Uint8Array(pixels * 2), new Uint8Array(pixels * 2)];
        this.faceHorizontal = new Float32Array(pixels);
        this.faceExpanded = new Float32Array(pixels);
      }
      if (this.faceDeque.length < Math.max(confidence.width, confidence.height)) {
        this.faceDeque = new Int32Array(Math.max(confidence.width, confidence.height));
      }
      const current = this.currentMask;
      const currentRegions = this.currentRegions;
      current.fill(0);
      currentRegions.fill(0);
      this.outputIndex = 1 - this.outputIndex;
      const outputMask = this.outputMasks[this.outputIndex];
      const regions = this.outputRegions[this.outputIndex];
      // Sum only person probabilities, preserving soft boundaries between body
      // parts. Accessory confidence is allowed only close to detected face skin.
      const channels = confidences.map((channel) => channel.getAsFloat32Array());
      for (const category of PERSON_CLASSES) {
        const values = channels[category];
        for (let i = 0; i < current.length; i++) {
          current[i] += values[i];
          if (category === 1) currentRegions[i * 2 + 1] = values[i];
          if (category === 2 || category === 3) currentRegions[i * 2] += values[i];
        }
      }
      const faceSupport = nearbyFace(channels[3], confidence.width, confidence.height, this.faceHorizontal, this.faceExpanded, this.faceDeque);
      const accessories = channels[5];
      for (let i = 0; i < current.length; i++) {
        const support = Math.min(1, Math.max(0, (faceSupport[i] - 0.15) / 0.5));
        current[i] = Math.min(1, current[i] + accessories[i] * support);
      }
      const elapsed = timestamp - this.lastTimestamp;
      if (!this.previousMask || !this.previousRegions || this.maskWidth !== confidence.width || this.maskHeight !== confidence.height || elapsed > 250 || elapsed <= 0) {
        // Copy callback-owned data and seed the first frame without fading in.
        this.previousMask = new Float32Array(current);
        this.previousRegions = new Float32Array(currentRegions);
        this.maskWidth = confidence.width;
        this.maskHeight = confidence.height;
      } else {
        // Evaluate the expensive time-based exponent only 256 times per frame.
        for (let i = 0; i < this.weights.length; i++) this.weights[i] = temporalWeight(i / 255, elapsed);
        for (let i = 0; i < current.length; i++) {
          const weight = this.weights[Math.min(255, Math.round(Math.abs(current[i] - this.previousMask[i]) * 255))];
          this.previousMask[i] += (current[i] - this.previousMask[i]) * weight;
        }
        for (let i = 0; i < currentRegions.length; i++) {
          const weight = this.weights[Math.min(255, Math.round(Math.abs(currentRegions[i] - this.previousRegions[i]) * 255))];
          this.previousRegions[i] += (currentRegions[i] - this.previousRegions[i]) * weight;
        }
      }
      this.lastTimestamp = timestamp;
      for (let i = 0; i < current.length; i++) outputMask[i] = Math.round(Math.min(1, this.previousMask[i]) * 255);
      for (let i = 0; i < regions.length; i++) regions[i] = Math.round(Math.min(1, this.previousRegions[i]) * 255);
      mask = {
        data: outputMask,
        regions,
        width: confidence.width,
        height: confidence.height,
      };
    });
    return mask;
  }

  dispose(): void {
    this.segmenter?.close();
    this.segmenter = null;
    this.previousMask = null;
    this.previousRegions = null;
    this.currentMask = new Float32Array(0);
    this.currentRegions = new Float32Array(0);
    this.outputMasks = [];
    this.outputRegions = [];
    this.outputIndex = 0;
    this.lastTimestamp = 0;
    this.maskWidth = 0;
    this.maskHeight = 0;
  }
}

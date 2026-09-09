import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
// SelfieMulticlass: background, hair, body-skin, face-skin, clothes, others.
const PERSON_CLASSES = [1, 2, 3, 4];

// Only grow face support far enough to cover attached eyewear, not room objects.
export function nearbyFace(face: Float32Array, width: number, height: number): Float32Array {
  const radius = Math.max(1, Math.round(Math.min(width, height) * 0.025));
  const horizontal = new Float32Array(face.length);
  const expanded = new Float32Array(face.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 0;
    for (let dx = -radius; dx <= radius; dx++) value = Math.max(value, face[y * width + Math.min(width - 1, Math.max(0, x + dx))]);
    horizontal[y * width + x] = value;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 0;
    for (let dy = -radius; dy <= radius; dy++) value = Math.max(value, horizontal[Math.min(height - 1, Math.max(0, y + dy)) * width + x]);
    expanded[y * width + x] = value;
  }
  return expanded;
}

export function temporalWeight(delta: number, elapsed: number): number {
  // Suppress small confidence fluctuations; follow real motion without trails.
  const movement = Math.min(1, Math.max(0, (Math.abs(delta) - 0.08) / 0.35));
  const current = 0.45 + 0.5 * movement;
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
  private maskWidth = 0;
  private maskHeight = 0;

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  segment(video: HTMLVideoElement, timestamp: number): PersonMask | null {
    if (!this.segmenter) return null;

    let mask: PersonMask | null = null;
    this.segmenter.segmentForVideo(video, timestamp, (result) => {
      const confidences = result.confidenceMasks;
      if (!confidences || confidences.length !== 6) {
        throw new Error('The person model did not return the expected six segmentation classes.');
      }
      const confidence = confidences[0];
      const current = new Float32Array(confidence.width * confidence.height);
      const regions = new Uint8Array(current.length * 2);
      const currentRegions = new Float32Array(regions.length);
      // Sum only person probabilities, preserving soft boundaries between body
      // parts. Accessory confidence is allowed only close to detected face skin.
      for (const category of PERSON_CLASSES) {
        const values = confidences[category].getAsFloat32Array();
        for (let i = 0; i < current.length; i++) {
          current[i] += values[i];
          if (category === 1) currentRegions[i * 2 + 1] = values[i];
          if (category === 2 || category === 3) currentRegions[i * 2] += values[i];
        }
      }
      const faceSupport = nearbyFace(confidences[3].getAsFloat32Array(), confidence.width, confidence.height);
      const accessories = confidences[5].getAsFloat32Array();
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
        for (let i = 0; i < current.length; i++) {
          const weight = temporalWeight(current[i] - this.previousMask[i], elapsed);
          this.previousMask[i] += (current[i] - this.previousMask[i]) * weight;
        }
        for (let i = 0; i < currentRegions.length; i++) {
          const weight = temporalWeight(currentRegions[i] - this.previousRegions[i], elapsed);
          this.previousRegions[i] += (currentRegions[i] - this.previousRegions[i]) * weight;
        }
      }
      this.lastTimestamp = timestamp;
      for (let i = 0; i < regions.length; i++) regions[i] = Math.round(Math.min(1, this.previousRegions[i]) * 255);
      mask = {
        data: Uint8Array.from(this.previousMask, (value) => Math.round(value * 255)),
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
    this.lastTimestamp = 0;
    this.maskWidth = 0;
    this.maskHeight = 0;
  }
}

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
// SelfieMulticlass: background, hair, body-skin, face-skin, clothes, others.
const PERSON_CLASSES = [1, 2, 3, 4];
const CURRENT = 0.7;
const PREVIOUS = 0.3;

export interface PersonMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private previousMask: Float32Array | null = null;
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
      // Sum only person probabilities, preserving soft boundaries between body
      // parts. Background and "others" (accessories/objects) never contribute.
      for (const category of PERSON_CLASSES) {
        const values = confidences[category].getAsFloat32Array();
        for (let i = 0; i < current.length; i++) current[i] += values[i];
      }
      if (!this.previousMask || this.maskWidth !== confidence.width || this.maskHeight !== confidence.height) {
        // Copy callback-owned data and seed the first frame without fading in.
        this.previousMask = new Float32Array(current);
        this.maskWidth = confidence.width;
        this.maskHeight = confidence.height;
      } else {
        for (let i = 0; i < current.length; i++) {
          this.previousMask[i] = current[i] * CURRENT + this.previousMask[i] * PREVIOUS;
        }
      }
      mask = {
        data: Uint8Array.from(this.previousMask, (value) => Math.round(value * 255)),
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
    this.maskWidth = 0;
    this.maskHeight = 0;
  }
}

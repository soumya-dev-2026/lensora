import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';

export interface PersonMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;

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
      // The selfie model has one confidence channel: 1 = person, 0 = background.
      // Category labels are class IDs, not an opacity mask.
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) return;
      mask = {
        data: Uint8Array.from(confidence.getAsFloat32Array(), (value) => Math.round(value * 255)),
        width: confidence.width,
        height: confidence.height,
      };
    });
    return mask;
  }

  dispose(): void {
    this.segmenter?.close();
    this.segmenter = null;
  }
}

import { FaceTracker } from './FaceTracker';

const tracker = new FaceTracker();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'initialize') {
      await tracker.initialize(true);
      self.postMessage({ type: 'ready' });
      return;
    }
    const image = data.image as ImageBitmap;
    try {
      const face = tracker.detect(image, data.timestamp);
      if (face) {
        const mask = (face.mask as OffscreenCanvas).transferToImageBitmap();
        self.postMessage({ type: 'face', timestamp: data.timestamp, face: { ...face, mask } }, { transfer: [mask] });
      } else self.postMessage({ type: 'face', timestamp: data.timestamp, face: null });
    } finally { image.close(); }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Face tracking failed.' });
  }
};

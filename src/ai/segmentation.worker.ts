import { PersonSegmenter } from './PersonSegmenter';

const segmenter = new PersonSegmenter();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'initialize') {
      await segmenter.initialize();
      self.postMessage({ type: 'ready' });
      return;
    }
    const image = data.image as ImageBitmap;
    try {
      const mask = segmenter.segment(image, data.timestamp);
      // The segmenter reuses these buffers; structured cloning keeps its history intact.
      self.postMessage({ type: 'mask', mask });
    } finally { image.close(); }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Mask processing failed.' });
  }
};

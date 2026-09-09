import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { FaceLandmarker } from '@mediapipe/tasks-vision';

async function loadModule(path, replacement = (source) => source) {
  const source = replacement(await readFile(new URL(path, import.meta.url), 'utf8'));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

// Model API fixture, independent of GPU/browser availability.
const { PersonSegmenter, temporalWeight, nearbyFace } = await loadModule('../src/ai/PersonSegmenter.ts', (source) => source.replace(
  "import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';",
  `const FilesetResolver = { forVisionTasks: async () => ({}) };
   const ImageSegmenter = { createFromOptions: async (_, options) => {
     if (!options.outputConfidenceMasks || options.outputCategoryMask) throw new Error('Expected confidence output');
     if (!options.baseOptions.modelAssetPath.includes('selfie_multiclass_256x256')) throw new Error('Expected multiclass person model');
     return { segmentForVideo: (video, __, callback) => {
       const person = video.confidence ?? [0, 0.25, 0.5, 0.75, 1];
       const empty = person.map(() => 0);
       const channels = (video.channels ?? [person.map((v) => 1 - v), empty, empty, person, empty, empty])
         .map((channel) => new Float32Array(channel));
       callback({ confidenceMasks: channels.map((data) => ({ width: video.width ?? 5, height: video.height ?? 1, getAsFloat32Array: () => data })) });
       channels.forEach((data) => data.fill(0)); // MediaPipe releases callback-owned data after returning.
     }, close() {} };
   } };`,
));

test('person confidence preserves foreground and soft edges after callback data expires', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const result = segmenter.segment({}, 1);
  assert.deepEqual([...result.data], [0, 64, 128, 191, 255]);
  assert.equal(result.width, 5);
  assert.equal(result.height, 1);
  segmenter.dispose();
  assert.equal(segmenter.segment({}, 2), null);
});

test('keeps hair, body, face and clothes while rejecting background and other objects', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  // Each pixel belongs exclusively to one of the six documented classes.
  const channels = Array.from({ length: 6 }, (_, category) =>
    Array.from({ length: 6 }, (_, pixel) => Number(category === pixel)));
  const result = segmenter.segment({ channels, width: 6 }, 1);
  assert.deepEqual([...result.data], [0, 255, 255, 255, 255, 0]);
  assert.deepEqual([...result.regions], [0, 0, 0, 255, 255, 0, 255, 0, 0, 0, 0, 0]);
  // Once the person leaves, smoothing must not retain a foreground silhouette.
  const emptyScene = channels.map((channel, category) => channel.map(() => Number(category === 0)));
  const next = segmenter.segment({ channels: emptyScene, width: 6 }, 1 + 1000 / 30);
  assert.ok([...next.data].every((value) => value / 255 < 0.12));
  segmenter.dispose();
});

test('combines uncertain person classes without creating holes between skin and clothing', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const result = segmenter.segment({ width: 2, channels: [
    [0.02, 0.90], [0.20, 0.02], [0.25, 0.02],
    [0.25, 0.02], [0.25, 0.04], [0.03, 0],
  ] }, 1);
  assert.ok(result.data[0] >= 242);
  assert.equal(result.data[1], 25);
  segmenter.dispose();
});

test('unexpected model output fails instead of treating background as a person', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  assert.throws(() => segmenter.segment({ channels: [[1]], width: 1 }, 1), /expected six segmentation classes/);
  segmenter.dispose();
});

test('moving mask blends confidence once per frame without mutating earlier output', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const first = segmenter.segment({ confidence: [0, 1], width: 2 }, 1);
  const second = segmenter.segment({ confidence: [1, 0], width: 2 }, 1 + 1000 / 30);
  assert.deepEqual([...first.data], [0, 255]);
  assert.ok(second.data[0] > 230 && second.data[1] < 25);
  const third = segmenter.segment({ confidence: [1, 0], width: 2 }, 1 + 2000 / 30);
  assert.deepEqual([...second.data], [255, 0]);
  assert.deepEqual([...third.data], [255, 0]);
  // Same pixel count but different dimensions must also reset history.
  const resized = segmenter.segment({ confidence: [0, 1], width: 1, height: 2 }, 101);
  assert.deepEqual([...resized.data], [0, 255]);
  segmenter.dispose();
  await segmenter.initialize();
  const restarted = segmenter.segment({ confidence: [1, 0], width: 1, height: 2 }, 5);
  assert.deepEqual([...restarted.data], [255, 0]);
  segmenter.dispose();
});

test('preserves glasses classified as accessories near a face, but rejects distant objects', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const channels = Array.from({ length: 6 }, () => Array(9).fill(0));
  channels[0].fill(1);
  channels[0][2] = channels[0][3] = channels[0][8] = 0;
  channels[3][2] = 1;
  channels[5][3] = channels[5][8] = 1;
  const result = segmenter.segment({ channels, width: 9 }, 1);
  assert.equal(result.data[3], 255);
  assert.equal(result.data[8], 0);
  assert.equal(result.regions[3 * 2], 0); // Glasses must not be treated as skin.
  segmenter.dispose();
});

test('small jitter is damped, fast motion follows promptly, and smoothing is time based', () => {
  const slow = temporalWeight(0.03, 1000 / 30);
  const fast = temporalWeight(0.8, 1000 / 30);
  assert.ok(slow < 0.5 && fast > 0.9);
  const half = temporalWeight(0.03, 1000 / 60);
  assert.ok(Math.abs((1 - half) ** 2 - (1 - slow)) < 0.00001);
});

test('beauty-region masks damp jitter and old frames reset after a capture gap', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const first = segmenter.segment({ confidence: [0.5], width: 1 }, 1);
  const next = segmenter.segment({ confidence: [0.54], width: 1 }, 1 + 1000 / 30);
  assert.ok(next.regions[0] > first.regions[0]);
  assert.ok(next.regions[0] < Math.round(0.54 * 255));
  const resumed = segmenter.segment({ confidence: [0], width: 1 }, 1001);
  assert.deepEqual([...resumed.data], [0]);
  assert.deepEqual([...resumed.regions], [0, 0]);
  segmenter.dispose();
});

const { getMp4MimeType } = await loadModule('../src/recording/mp4.ts');
const { segmentationSize } = await loadModule('../src/ai/SegmentationInput.ts');

test('AI input is bounded independently of output size and preserves camera aspect', () => {
  assert.deepEqual(segmentationSize(1280, 720), [384, 216]);
  assert.deepEqual(segmentationSize(720, 1280), [216, 384]);
  assert.deepEqual(segmentationSize(3840, 2160), [384, 216]);
  assert.deepEqual(segmentationSize(320, 180), [320, 180]);
});

test('linear-time face expansion matches the reference neighborhood filter at edges and narrow dimensions', () => {
  for (const [width, height] of [[1, 9], [9, 1], [3, 5], [82, 85]]) {
    const input = Float32Array.from({ length: width * height }, (_, i) => ((i * 37 + i * i * 11) % 101) / 100);
    const actual = nearbyFace(input, width, height);
    const radius = Math.max(1, Math.round(Math.min(width, height) * 0.025));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let expected = 0;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) expected = Math.max(expected, input[yy * width + xx]);
      }
      assert.equal(actual[y * width + x], expected);
    }
  }
});

test('recording chooses MP4 even when WebM is available', () => {
  assert.equal(getMp4MimeType(() => true), 'video/mp4;codecs=avc1.424028');
  assert.equal(getMp4MimeType((type) => type === 'video/mp4' || type.startsWith('video/webm')), 'video/mp4');
  assert.throws(() => getMp4MimeType((type) => type.startsWith('video/webm')), /cannot record MP4/);
});

const { WebGLCompositor } = await loadModule('../src/rendering/WebGLCompositor.ts');
const { DEFAULT_FILTERS } = await loadModule('../src/types/filters.ts');
const { contourLoops } = await loadModule('../src/ai/FaceTracker.ts', (source) => source.replace(
  "import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';", ''
));

test('official lip topology creates closed outer and inner contours, preserving mouth opening', () => {
  for (const [connections, expected] of [
    [FaceLandmarker.FACE_LANDMARKS_LIPS, 2],
    [FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, 1],
    [FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, 1],
  ]) {
    const loops = contourLoops(connections);
    assert.equal(loops.length, expected);
    assert.equal(loops.flat().length, new Set(connections.flatMap(({ start, end }) => [start, end])).size);
    for (const loop of loops) {
      loop.forEach((point, i) => {
        const next = loop[(i + 1) % loop.length];
        assert.ok(connections.some(({ start, end }) => start === point && end === next || end === point && start === next));
      });
    }
  }
});
function fixture() {
  const calls = [];
  const uniforms = new Map();
  const gl = new Proxy({}, { get(_, key) {
    if (key === 'getUniformLocation') return (_, name) => name;
    if (key.startsWith('uniform')) return (name, ...values) => uniforms.set(name, values);
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key === 'getAttachedShaders') return () => [];
    if (key.startsWith('create')) return () => ({});
    if (key === key.toUpperCase()) return key;
    return (...args) => calls.push([key, ...args]);
  } });
  const canvas = { width: 720, height: 1280, getContext: () => gl };
  return { compositor: new WebGLCompositor(canvas), canvas, calls, uniforms };
}

test('images upload with camera orientation, complete mipmaps, and original aspect ratio', () => {
  const { compositor, calls, uniforms } = fixture();
  const image = { naturalWidth: 1600, naturalHeight: 900 };
  compositor.setBackground(image);
  assert.ok(calls.some(([name, ...args]) => name === 'texImage2D' && args.at(-1) === image));
  assert.ok(calls.some(([name]) => name === 'generateMipmap'));
  assert.ok(!calls.some(([name, property, value]) => name === 'pixelStorei' && property === 'UNPACK_FLIP_Y_WEBGL' && value === true));
  compositor.render({ videoWidth: 1280, videoHeight: 720 }, new Uint8Array(4), 2, 2, true);
  assert.deepEqual(uniforms.get('u_cameraScale'), [0.31640625, 1]);
  assert.deepEqual(uniforms.get('u_backgroundScale'), [0.31640625, 1]);
  assert.deepEqual(uniforms.get('u_mirror'), [1]);
  assert.deepEqual(uniforms.get('u_maskPixel'), [0.31640625 / 720, 1 / 1280]);
  assert.throws(() => compositor.setBackground({ naturalWidth: 0, naturalHeight: 0 }), /dimensions/);
});

test('blur and tint accept both endpoints and live background uses camera dimensions', () => {
  const { compositor, uniforms, canvas } = fixture();
  const video = { videoWidth: 1280, videoHeight: 720 };
  for (const amount of [0, 100]) {
    compositor.render(video, new Uint8Array(4), 2, 2, false, true, amount, amount);
    assert.deepEqual(uniforms.get('u_blur'), [amount / 100]);
    assert.deepEqual(uniforms.get('u_tint'), [amount / 100]);
    assert.deepEqual(uniforms.get('u_liveBackground'), [1]);
    assert.deepEqual(uniforms.get('u_backgroundTexel'), [1 / 1280, 1 / 720]);
  }
  canvas.width = 1280;
  canvas.height = 720;
  compositor.render(video, new Uint8Array(4), 2, 2, false);
  assert.deepEqual(uniforms.get('u_cameraScale'), [1, 1]);
  assert.deepEqual(uniforms.get('u_maskPixel'), [1 / 1280, 1 / 720]);
  assert.deepEqual(uniforms.get('u_liveBackground'), [0]);
});

test('preset SVGs have explicit raster dimensions for WebGL image upload', async () => {
  for (const name of ['studio', 'office', 'nature']) {
    const svg = await readFile(new URL(`../public/backgrounds/${name}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]*width="1280"[^>]*height="720"/);
  }
});

test('filter bypass is neutral and lost face disables eye and lip effects on the next frame', () => {
  const { compositor, uniforms } = fixture();
  const video = { videoWidth: 1280, videoHeight: 720 };
  const mask = new Uint8Array(4).fill(255);
  const regions = new Uint8Array(8);
  const face = { eyes: [[0.3, 0.4, 0.05, 0.09], [0.6, 0.4, 0.05, 0.09]], mask: {} };
  const filters = { ...DEFAULT_FILTERS, brightness: 60, whiteBalance: -80, skinSmoothing: 70, eyeSize: 100, redLips: 50, darkHair: 80 };
  compositor.render(video, mask, 2, 2, true, false, 0, 0, filters, regions, face);
  assert.deepEqual(uniforms.get('u_brightness'), [0.6]);
  assert.deepEqual(uniforms.get('u_whiteBalance'), [-0.8]);
  assert.deepEqual(uniforms.get('u_eye0'), face.eyes[0]);
  assert.deepEqual(uniforms.get('u_eyeSize'), [1]);
  compositor.render(video, mask, 2, 2, true, false, 0, 0, filters, regions, null);
  assert.deepEqual(uniforms.get('u_eyeSize'), [0]);
  assert.deepEqual(uniforms.get('u_redLips'), [0]);
  assert.deepEqual(uniforms.get('u_eye0'), [0, 0, 0, 0]);
  assert.deepEqual(uniforms.get('u_skinSmoothing'), [0.7]);
  compositor.render(video, mask, 2, 2, true, false, 0, 0, { ...filters, enabled: false }, regions, face);
  for (const key of Object.keys(DEFAULT_FILTERS).filter((key) => key !== 'enabled')) {
    assert.deepEqual(uniforms.get(`u_${key}`), [0]);
  }
});

test('camera mipmaps are generated only for live-background blur', () => {
  const { compositor, calls } = fixture();
  const video = { videoWidth: 1280, videoHeight: 720 };
  for (const [live, blur, expected] of [[false, 0, 0], [false, 60, 0], [true, 0, 0], [true, 60, 1]]) {
    calls.length = 0;
    compositor.render(video, new Uint8Array(4), 2, 2, false, live, blur);
    assert.equal(calls.filter(([name]) => name === 'generateMipmap').length, expected);
  }
});

test('moving edges follow the current mask at 30, 60 and 120 fps', async () => {
  for (const fps of [30, 60, 120]) {
    const segmenter = new PersonSegmenter();
    await segmenter.initialize();
    segmenter.segment({ confidence: [0.25, 0.75], width: 2 }, 1);
    const moved = segmenter.segment({ confidence: [0.75, 0.25], width: 2 }, 1 + 1000 / fps);
    assert.deepEqual([...moved.data], [191, 64]);
    segmenter.dispose();
  }
});

test('captured camera canvas preserves source aspect and texture dimensions', () => {
  const { compositor, uniforms, calls } = fixture();
  const captured = { width: 1280, height: 720 };
  compositor.render(captured, new Uint8Array(4), 2, 2, true, true);
  assert.deepEqual(uniforms.get('u_cameraScale'), [0.31640625, 1]);
  assert.deepEqual(uniforms.get('u_backgroundTexel'), [1 / 1280, 1 / 720]);
  assert.ok(calls.some(([name, ...args]) => name === 'texImage2D' && args.at(-1) === captured));
});

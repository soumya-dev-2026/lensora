import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadModule(path, replacement = (source) => source) {
  const source = replacement(await readFile(new URL(path, import.meta.url), 'utf8'));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

// Model API fixture, independent of GPU/browser availability.
const { PersonSegmenter } = await loadModule('../src/ai/PersonSegmenter.ts', (source) => source.replace(
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
  // Once the person leaves, smoothing must not retain a foreground silhouette.
  const emptyScene = channels.map((channel, category) => channel.map(() => Number(category === 0)));
  const next = segmenter.segment({ channels: emptyScene, width: 6 }, 2);
  assert.ok([...next.data].every((value) => value / 255 < 0.35));
  segmenter.dispose();
});

test('combines uncertain person classes without creating holes between skin and clothing', async () => {
  const segmenter = new PersonSegmenter();
  await segmenter.initialize();
  const result = segmenter.segment({ width: 2, channels: [
    [0.02, 0.10], [0.20, 0.02], [0.25, 0.02],
    [0.25, 0.02], [0.25, 0.04], [0.03, 0.80],
  ] }, 1);
  assert.deepEqual([...result.data], [242, 25]);
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
  const second = segmenter.segment({ confidence: [1, 0], width: 2 }, 2);
  assert.deepEqual([...first.data], [0, 255]);
  assert.deepEqual([...second.data], [178, 77]);
  const third = segmenter.segment({ confidence: [1, 0], width: 2 }, 3);
  assert.deepEqual([...third.data], [232, 23]);
  // Same pixel count but different dimensions must also reset history.
  const resized = segmenter.segment({ confidence: [0, 1], width: 1, height: 2 }, 4);
  assert.deepEqual([...resized.data], [0, 255]);
  segmenter.dispose();
  await segmenter.initialize();
  const restarted = segmenter.segment({ confidence: [1, 0], width: 1, height: 2 }, 5);
  assert.deepEqual([...restarted.data], [255, 0]);
  segmenter.dispose();
});

const { getMp4MimeType } = await loadModule('../src/recording/mp4.ts');

test('recording chooses MP4 even when WebM is available', () => {
  assert.equal(getMp4MimeType(() => true), 'video/mp4;codecs=avc1.424028');
  assert.equal(getMp4MimeType((type) => type === 'video/mp4' || type.startsWith('video/webm')), 'video/mp4');
  assert.throws(() => getMp4MimeType((type) => type.startsWith('video/webm')), /cannot record MP4/);
});

const { WebGLCompositor } = await loadModule('../src/rendering/WebGLCompositor.ts');
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

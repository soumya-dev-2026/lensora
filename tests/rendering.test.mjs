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
     return { segmentForVideo: (_, __, callback) => {
       const data = new Float32Array([0, 0.25, 0.5, 0.75, 1]);
       callback({ confidenceMasks: [{ width: 5, height: 1, getAsFloat32Array: () => data }] });
       data.fill(0); // MediaPipe releases callback-owned data after returning.
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
  assert.deepEqual(uniforms.get('u_liveBackground'), [0]);
});

test('preset SVGs have explicit raster dimensions for WebGL image upload', async () => {
  for (const name of ['studio', 'office', 'nature']) {
    const svg = await readFile(new URL(`../public/backgrounds/${name}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]*width="1280"[^>]*height="720"/);
  }
});

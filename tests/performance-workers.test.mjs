import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path, replace = (source) => source) {
  const { outputText } = ts.transpileModule(replace(await readFile(new URL(path, import.meta.url), 'utf8')), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { AdaptivePreviewQuality, PreviewPerformance } = await load('../src/rendering/PreviewPerformance.ts');
const { loadModel } = await load('../src/ai/modelCache.ts');

test('preview quality responds to sustained load, locks during recording, and recovers slowly', () => {
  const quality = new AdaptivePreviewQuality();
  for (let time = 0; time <= 1100; time += 50) quality.record(time, 40, false);
  assert.equal(quality.scale, 0.85);
  for (let time = 1150; time < 5000; time += 50) quality.record(time, 80, true);
  assert.equal(quality.scale, 0.85, 'recording keeps a stable render resolution');
  for (let time = 5000; time < 14000; time += 33.33) quality.record(time, 5, false);
  assert.equal(quality.scale, 1, 'quality restores once the device sustains the frame budget');
  quality.record(100000, 5, false);
  assert.equal(quality.scale, 1, 'resuming a hidden tab does not lower quality');
});

test('performance measurements report rendering and both inference costs without per-frame updates', () => {
  const metrics = new PreviewPerformance();
  for (let i = 0; i < 30; i++) metrics.record(i * 34, 8, 0.85, 45, 20);
  assert.equal(metrics.snapshot.frames, 0);
  metrics.record(1020, 12, 0.85, 45, 20);
  assert.ok(metrics.snapshot.fps >= 29 && metrics.snapshot.fps <= 31);
  assert.equal(metrics.snapshot.worstRenderMs, 12);
  assert.equal(metrics.snapshot.maskMs, 45);
  assert.equal(metrics.snapshot.faceMs, 20);
  assert.equal(metrics.snapshot.renderScale, 0.85);
});

test('public models are reused from cache; unavailable storage does not disable loading', async () => {
  const oldFetch = globalThis.fetch, oldCaches = globalThis.caches;
  const stored = new Map(); let downloads = 0;
  globalThis.fetch = async () => { downloads++; return new Response(new Uint8Array([1, 2, 3])); };
  globalThis.caches = { open: async () => ({ match: async (url) => stored.get(url)?.clone(), put: async (url, response) => stored.set(url, response) }) };
  try {
    assert.deepEqual(await loadModel('https://example.test/model'), new Uint8Array([1, 2, 3]));
    assert.deepEqual(await loadModel('https://example.test/model'), new Uint8Array([1, 2, 3]));
    assert.equal(downloads, 1);
    globalThis.caches.open = async () => { throw new Error('storage denied'); };
    assert.deepEqual(await loadModel('https://example.test/model'), new Uint8Array([1, 2, 3]));
    assert.equal(downloads, 2);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(loadModel('https://example.test/model'), /503/);
  } finally { globalThis.fetch = oldFetch; globalThis.caches = oldCaches; }
});

test('face worker drops queued frames and releases replaced, stale, and late masks', async () => {
  const previous = { Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas, document: globalThis.document, createImageBitmap: globalThis.createImageBitmap };
  let worker, resolveBitmap, captures = 0, closed = 0;
  globalThis.OffscreenCanvas = class {};
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() { captures++; } }) }) };
  globalThis.Worker = class {
    messages = [];
    constructor() { worker = this; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  };
  globalThis.createImageBitmap = () => new Promise((resolve) => { resolveBitmap = resolve; });
  try {
    const { AsyncFaceTracker } = await load('../src/ai/AsyncFaceTracker.ts', (s) => s.replace("new URL('./face.worker.ts', import.meta.url)", "'face.js'"));
    const tracker = new AsyncFaceTracker();
    const initialized = tracker.initialize();
    worker.onmessage({ data: { type: 'ready' } }); await initialized;
    const source = { width: 1280, height: 720 };
    tracker.detect(source, 0); tracker.detect(source, 100);
    assert.equal(captures, 1, 'pending inference skips both capture and bitmap allocation');
    resolveBitmap({ close() { closed++; } }); await Promise.resolve();
    assert.equal(worker.messages.length, 2);
    const face = { mask: { close() { closed++; } }, eyes: [] };
    worker.onmessage({ data: { type: 'face', timestamp: 100, face } });
    assert.equal(tracker.detect(source, 200), face);
    assert.equal(tracker.completedFrames, 1);
    assert.equal(tracker.detect(source, 701), null, 'stale face effects disappear');
    assert.equal(closed, 1);
    tracker.dispose();
    resolveBitmap({ close() { closed++; } }); await Promise.resolve();
    worker.onmessage({ data: { type: 'face', timestamp: 701, face } });
    assert.equal(closed, 3, 'late input and output bitmaps are closed');
    assert.equal(worker.terminated, true);
  } finally { Object.assign(globalThis, previous); }
});

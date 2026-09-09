import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path, replace = (s) => s) {
  const source = replace(await readFile(new URL(path, import.meta.url), 'utf8'));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const model = await load('../src/editor/model.ts');
const { cropPixels, outputSize, audioPosition, defaultSettings, drawEditorFrame } = model;

test('crop stays within source and output preserves aspect with even bounded dimensions', () => {
  assert.deepEqual(cropPixels({ x: 25, y: 0, width: 50, height: 100 }, 1280, 720), { x: 320, y: 0, width: 640, height: 720 });
  const edge = cropPixels({ x: 95, y: 90, width: 70, height: 70 }, 1000, 500);
  assert.deepEqual(edge, { x: 950, y: 450, width: 50, height: 50 });
  assert.deepEqual(outputSize(3840, 2160), [1920, 1080]);
  assert.deepEqual(outputSize(2160, 3840), [1080, 1920]);
  assert.deepEqual(outputSize(641, 481), [640, 480]);
});

test('audio offsets use source timeline and stop at the end of each track', () => {
  assert.equal(audioPosition(2, 3, 5), null);
  assert.equal(audioPosition(3, 3, 5), 0);
  assert.equal(audioPosition(4.5, 3, 5), 1.5);
  assert.equal(audioPosition(8, 3, 5), null);
  assert.equal(audioPosition(9, 0, 5), null);
});

function drawing() {
  const calls = [];
  const canvas = { width: 0, height: 0 };
  const ctx = new Proxy({ canvas }, { get(target, key) {
    return key in target ? target[key] : (...args) => calls.push([key, ...args]);
  } });
  canvas.getContext = () => ctx;
  return { ctx, canvas, calls };
}

test('preview/export renderer draws crop, ordered text/image/emoji overlays, and frame', () => {
  const { ctx, calls, canvas } = drawing();
  const video = { videoWidth: 1280, videoHeight: 720 };
  const image = { naturalWidth: 100, naturalHeight: 50 };
  const settings = { ...defaultSettings(), crop: { x: 25, y: 0, width: 50, height: 100 }, frame: 'polaroid', frameWidth: 5, overlays: [
    { kind: 'text', text: 'Hello', x: 50, y: 50, size: 10, color: '#fff' },
    { kind: 'image', image, x: 50, y: 50, size: 50 },
    { kind: 'emoji', text: '😎', x: 25, y: 25, size: 15, color: '#fff' },
  ] };
  drawEditorFrame(ctx, video, settings);
  assert.deepEqual([canvas.width, canvas.height], [640, 720]);
  assert.deepEqual(calls.find(([name]) => name === 'drawImage'), ['drawImage', video, 320, 0, 640, 720, 0, 0, 640, 720]);
  assert.ok(calls.some(([name, value]) => name === 'fillText' && value === 'Hello'));
  assert.ok(calls.some(([name, value]) => name === 'fillText' && value === '😎'));
  assert.deepEqual(calls.filter(([name]) => name === 'drawImage')[1], ['drawImage', image, 160, 280, 320, 160]);
  assert.deepEqual(calls.at(-1), ['fillRect', 0, 624, 640, 96]);
});

function fixture() {
  const frames = new Map(); let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  class Media extends EventTarget {
    constructor(kind) { super(); this.kind = kind; this.paused = true; this.readyState = 4; this.duration = 10; this.videoWidth = 1280; this.videoHeight = 720; this.position = 0; this.ended = false; }
    get currentTime() { return this.position; }
    set currentTime(value) { this.position = value; this.ended = false; queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); }
    load() { queueMicrotask(() => { this.dispatchEvent(new Event('loadedmetadata')); this.dispatchEvent(new Event('loadeddata')); }); }
    async play() { this.paused = false; this.dispatchEvent(new Event('playing')); }
    pause() { this.paused = true; }
    removeAttribute() {}
  }
  const doc = new EventTarget(); doc.createElement = (kind) => new Media(kind); doc.hidden = false;
  globalThis.document = doc;
  globalThis.window = { setTimeout, clearTimeout, MediaRecorder: true };
  const audioContexts = [];
  const track = () => ({ stopped: false, stop() { this.stopped = true; }, clone: track });
  const node = () => ({ connections: [], connect(other) { this.connections.push(other); }, disconnect() {} });
  globalThis.AudioContext = class {
    constructor() { this.sources = []; this.destination = node(); audioContexts.push(this); }
    createGain() { return { ...node(), gain: { value: 1 } }; }
    createMediaStreamDestination() { const output = track(); return { ...node(), stream: { getAudioTracks: () => [output], getTracks: () => [output] } }; }
    createMediaElementSource(element) { const source = { ...node(), element }; this.sources.push(source); return source; }
    async resume() {}
    async close() {}
  };
  const recorders = [];
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor(stream, options) { this.stream = stream; this.options = options; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['encoded fixture']) }); this.onstop?.(); }
  };
  const { canvas, calls } = drawing();
  const tracks = [track()];
  canvas.captureStream = () => ({ addTrack: (track) => tracks.push(track), getTracks: () => tracks });
  return { canvas, calls, audioContexts, recorders, tracks,
    tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); } };
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function engineModule() {
  globalThis.editorModel = model;
  return load('../src/editor/EditorEngine.ts', (source) => source
    .replace("import { getMp4MimeType } from '../recording/mp4';", "const getMp4MimeType = () => 'video/mp4';")
    .replace(/^import .*from '\.\/model';$/m, 'const { audioPosition, clamp, defaultSettings, drawEditorFrame } = globalThis.editorModel;'));
}

test('export mixes independent volumes, respects trim, and releases capture tracks', async () => {
  const f = fixture(); const { EditorEngine } = await engineModule();
  const engine = new EditorEngine(f.canvas);
  await engine.load('video');
  engine.settings = { ...defaultSettings(), start: 2, end: 4, muted: true };
  const music = { id: 'music', name: 'music', url: 'music', volume: 25, start: 1, duration: 10 };
  const voice = { id: 'voice', name: 'voice', url: 'voice', volume: 75, start: 3, duration: 10 };
  await engine.addAudio(music); await engine.addAudio(voice); engine.layers = [music, voice];
  const pending = engine.exportMp4();
  await turn();
  assert.equal(engine.video.currentTime, 2);
  assert.equal(f.recorders[0].state, 'recording');
  const sources = f.audioContexts[0].sources;
  assert.deepEqual(sources.map((source) => source.connections[0].gain.value), [0, .25, .75]);
  assert.equal(sources[1].element.currentTime, 1);
  assert.equal(sources[1].element.paused, false);
  assert.equal(sources[2].element.paused, true);
  engine.video.currentTime = 3.5; f.tick();
  assert.equal(sources[2].element.currentTime, .5);
  assert.equal(sources[2].element.paused, false);
  engine.video.currentTime = 4; f.tick();
  assert.ok((await pending).size > 0);
  assert.ok(f.tracks.every((track) => track.stopped));
  assert.ok(sources.every((source) => source.element.paused));
  engine.dispose();
});

test('cancelling export rejects partial output and pauses all playback', async () => {
  const f = fixture(); const { EditorEngine } = await engineModule(); const engine = new EditorEngine(f.canvas);
  await engine.load('video'); engine.settings.end = 8;
  const pending = engine.exportMp4(); const rejection = assert.rejects(pending, /cancelled/);
  await turn(); engine.cancelExport(); await rejection;
  assert.equal(engine.video.paused, true);
  assert.ok(f.tracks.every((track) => track.stopped));
  engine.dispose();
});

test('export can be cancelled during preparation before recorder creation', async () => {
  const f = fixture(); const { EditorEngine } = await engineModule(); const engine = new EditorEngine(f.canvas);
  await engine.load('video'); engine.settings.end = 8;
  const pending = engine.exportMp4(); engine.cancelExport();
  await assert.rejects(pending, /cancelled/);
  assert.equal(f.recorders.length, 0);
  engine.dispose();
});

test('editor controls forward uploaded media, trim/crop, mix and overlays to MP4 export', async () => {
  const { default: React } = await import('react');
  const { default: Renderer, act } = await import('react-test-renderer');
  globalThis.React = React;
  const calls = [];
  globalThis.EditorUiEngine = class {
    settings = defaultSettings(); layers = [];
    constructor() { globalThis.editorUiInstance = this; }
    async load() { return { width: 1280, height: 720, duration: 10 }; }
    pause() {}
    async seek() {}
    async addAudio() { return 5; }
    removeAudio() {}
    async exportMp4() { calls.push({ settings: this.settings, layers: this.layers }); return new Blob(['encoded edit']); }
    dispose() {}
  };
  globalThis.editorModel = model;
  globalThis.Image = class { naturalWidth = 100; naturalHeight = 100; async decode() {} };
  const { default: Editor } = await load('../src/editor/VideoEditor.tsx', (source) => source
    .replace(/^import .*;$/gm, '')
    .replace('function Tool(', `const React = globalThis.React;
      const { useEffect, useRef, useState } = React;
      const { clamp, defaultSettings } = globalThis.editorModel;
      const EditorEngine = globalThis.EditorUiEngine;
      const Icon = () => null;
      const Modal = ({ children }) => React.createElement('section', {}, children);
      function Tool(`));
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(Editor), { createNodeMock: () => ({ click() {} }) }); });
  const input = (label) => renderer.root.findByProps({ 'aria-label': label });
  const file = (name, type) => Object.assign(new Blob(['local media'], { type }), { name });
  await act(async () => input('Video file').props.onChange({ target: { files: [file('clip.mp4', 'video/mp4')], value: '' } }));
  await act(async () => input('Trim start seconds').props.onChange({ target: { value: '2' } }));
  await act(async () => input('Trim end seconds').props.onChange({ target: { value: '8' } }));
  await act(async () => input('Audio files').props.onChange({ target: { files: [file('music.mp3', 'audio/mpeg'), file('voice.wav', 'audio/wav')], value: '' } }));
  await act(async () => input('Volume: music.mp3').props.onChange({ target: { value: '20' } }));
  await act(async () => input('Volume: voice.wav').props.onChange({ target: { value: '70' } }));
  await act(async () => input('Mute video audio').props.onClick());
  await act(async () => input('Add text').props.onClick());
  await act(async () => input('Overlay content').props.onChange({ target: { value: 'My title' } }));
  await act(async () => input('Add emoji').props.onClick());
  await act(async () => input('Overlay image file').props.onChange({ target: { files: [file('logo.png', 'image/png')], value: '' } }));
  await act(async () => input('Crop video').props.onClick());
  await act(async () => renderer.root.findAllByType('button').find((button) => button.children.includes('1:1')).props.onClick());
  await act(async () => input('Video frame').props.onClick());
  await act(async () => renderer.root.findAllByType('button').find((button) => button.findAllByType('span').some((span) => span.children.includes('polaroid'))).props.onClick());
  await act(async () => input('Export MP4').props.onClick());
  assert.equal(calls.length, 1);
  const edit = calls[0];
  assert.equal(edit.settings.start, 2); assert.equal(edit.settings.end, 8);
  assert.equal(edit.settings.muted, true);
  assert.equal(edit.settings.crop.width, 56.25);
  assert.equal(edit.settings.frame, 'polaroid');
  assert.deepEqual(edit.settings.overlays.map((item) => item.kind), ['text', 'emoji', 'image']);
  assert.equal(edit.settings.overlays[0].text, 'My title');
  assert.deepEqual(edit.layers.map((item) => item.volume), [20, 70]);
  assert.ok(input('Save edited MP4'));
  await act(async () => renderer.unmount());
});

test('pausing during audio preparation prevents delayed preview playback', async () => {
  const f = fixture(); let resume;
  AudioContext.prototype.resume = () => new Promise((resolve) => { resume = resolve; });
  const { EditorEngine } = await engineModule(); const engine = new EditorEngine(f.canvas);
  await engine.load('video'); engine.settings.end = 8;
  const pending = engine.play();
  engine.pause(); resume(); await pending;
  assert.equal(engine.video.paused, true);
  engine.dispose();
});

test('hiding the page cancels MP4 export rather than returning incomplete video', async () => {
  const f = fixture(); const { EditorEngine } = await engineModule(); const engine = new EditorEngine(f.canvas);
  await engine.load('video'); engine.settings.end = 8;
  const pending = engine.exportMp4(); const rejected = assert.rejects(pending, /page visible/);
  await turn(); document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  await rejected;
  assert.ok(f.tracks.every((track) => track.stopped)); engine.dispose();
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { indexedDB } from 'fake-indexeddb';

globalThis.React = React;
async function load(path, preamble = '') {
  const source = `const React = globalThis.React; const { useCallback, useEffect, useId, useRef, useState } = React;\n${preamble}\n` + (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
function environment() {
  let id = 0;
  const timers = new Map(), events = new Map(), data = new Map();
  const addEventListener = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const removeEventListener = (name, fn) => events.get(name)?.delete(fn);
  globalThis.window = { setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (key) => timers.delete(key), setInterval, clearInterval, addEventListener, removeEventListener, MediaRecorder: true };
  globalThis.document = { visibilityState: 'visible', documentElement: { dataset: {} }, addEventListener, removeEventListener };
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  return {
    timers, data,
    tick: async () => { const [key, fn] = timers.entries().next().value; timers.delete(key); await act(async () => fn()); },
    emit: async (name, event = {}) => act(async () => { for (const fn of events.get(name) ?? []) fn(event); }),
  };
}
const { RecordingCountdown } = await load('../src/components/RecordingCountdown.tsx');
const { CompareButton } = await load('../src/components/CompareButton.tsx', 'const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;');
const prefs = await load('../src/storage/uiPreferences.ts');
globalThis.usabilityPrefs = prefs;
const { MotionToggle } = await load('../src/components/MotionToggle.tsx', 'const { readPreference, writePreference } = globalThis.usabilityPrefs; const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;');
globalThis.usabilityDefaults = {
  ...(await load('../src/types/filters.ts')), ...(await load('../src/types/effects.ts')),
};
const storage = await load('../src/storage/studioLooks.ts', 'const { DEFAULT_FILTERS, DEFAULT_EFFECTS } = globalThis.usabilityDefaults;');

test('countdown waits three seconds and cancels pending timers on skip/unmount', async () => {
  const env = environment();
  let starts = 0, cancelled = 0, renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(RecordingCountdown, { onComplete: () => starts++, onCancel: () => cancelled++ })); });
  await env.tick(); assert.equal(starts, 0);
  await env.tick(); assert.equal(starts, 0);
  await env.tick(); assert.equal(starts, 1);
  await act(async () => renderer.unmount());
  await act(async () => { renderer = Renderer.create(React.createElement(RecordingCountdown, { onComplete: () => starts++, onCancel: () => cancelled++ })); });
  await act(async () => renderer.root.findAllByType('button')[0].props.onClick());
  await act(async () => renderer.unmount());
  assert.equal(starts, 2); assert.equal(env.timers.size, 0);
  await act(async () => { renderer = Renderer.create(React.createElement(RecordingCountdown, { onComplete: () => starts++, onCancel: () => cancelled++ })); });
  document.visibilityState = 'hidden'; await env.emit('visibilitychange');
  assert.equal(cancelled, 1);
  await act(async () => renderer.unmount());
  assert.equal(env.timers.size, 0);
});

test('comparison releases on pointer cancellation, lost focus, key release, and unmount', async () => {
  const env = environment();
  let held = false, renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(CompareButton, { onChange: (value) => { held = value; } })); });
  const button = renderer.root.findByType('button');
  await act(async () => button.props.onPointerDown({ button: 0, pointerId: 1, preventDefault() {}, currentTarget: { focus() {}, setPointerCapture() {} } }));
  assert.equal(held, true);
  await act(async () => button.props.onPointerCancel()); assert.equal(held, false);
  await act(async () => button.props.onKeyDown({ key: ' ', preventDefault() {} })); assert.equal(held, true);
  await act(async () => button.props.onKeyUp({ key: ' ', preventDefault() {} })); assert.equal(held, false);
  await act(async () => button.props.onKeyDown({ key: 'Enter', preventDefault() {} }));
  await env.emit('blur'); assert.equal(held, false);
  await act(async () => button.props.onKeyDown({ key: 'Enter', preventDefault() {} }));
  await act(async () => renderer.unmount()); assert.equal(held, false);
});

test('animation choice persists and storage failures do not prevent toggling', async () => {
  const env = environment();
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(MotionToggle)); });
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { checked: false } }));
  assert.equal(document.documentElement.dataset.motion, 'off');
  assert.equal(env.data.get('studio-animations'), 'off');
  await act(async () => renderer.unmount());
  await act(async () => { renderer = Renderer.create(React.createElement(MotionToggle)); });
  assert.equal(renderer.root.findByType('input').props.checked, false);
  localStorage.setItem = () => { throw new Error('blocked'); };
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { checked: true } }));
  assert.equal(document.documentElement.dataset.motion, 'on');
  await act(async () => renderer.unmount());
});

test('complete looks persist uploaded images and all settings, reject invalid values, and delete independently', async () => {
  globalThis.indexedDB = indexedDB;
  const { DEFAULT_FILTERS, DEFAULT_EFFECTS } = globalThis.usabilityDefaults;
  const settings = { background: { kind: 'image', value: 'data:image/png;base64,preview' }, blur: 31, tint: 12, layout: 'landscape', filters: { ...DEFAULT_FILTERS, contrast: -35 }, effects: { ...DEFAULT_EFFECTS, sticker: 'crown', grain: 60 } };
  const one = await storage.saveStudioLook('Interview', settings);
  const two = await storage.saveStudioLook('Second', { ...settings, layout: 'square' });
  settings.effects.grain = 0;
  const restored = (await storage.loadStudioLooks()).find((look) => look.id === one.id);
  assert.equal(restored.effects.grain, 60); assert.equal(restored.filters.contrast, -35);
  assert.equal(restored.background.value, 'data:image/png;base64,preview'); assert.equal(restored.layout, 'landscape');
  assert.equal(restored.blur, 31); assert.equal(restored.tint, 12);
  await assert.rejects(storage.saveStudioLook('', settings));
  await assert.rejects(storage.saveStudioLook('Invalid', { ...settings, blur: Infinity }));
  assert.equal(storage.isStudioLook({ ...one, effects: { ...one.effects, sticker: 'invalid' } }), false);
  await storage.deleteStudioLook(one.id);
  assert.deepEqual((await storage.loadStudioLooks()).map((look) => look.id), [two.id]);
});

test('microphone monitoring adds no new permission request and preserves the recording track', async () => {
  let permissions = 0, reads = 0;
  const destinations = [];
  const output = { clone: () => ({ stop() {} }), stop() {} };
  const mic = { stop() {}, enabled: true };
  const analyser = { fftSize: 0, getFloatTimeDomainData(samples) { reads++; samples.fill(.1); }, disconnect() {} };
  globalThis.AudioContext = class {
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [output], getTracks: () => [output] } }; }
    createConstantSource() { return { offset: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createMediaStreamSource() { return { connect(target) { destinations.push(target); }, disconnect() {} }; }
    createAnalyser() { return analyser; }
    async resume() {} async close() {}
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { permissions++; return { getTracks: () => [mic], getAudioTracks: () => [mic] }; } } } });
  const { RecordingAudio } = await load('../src/recording/RecordingAudio.ts');
  const audio = new RecordingAudio();
  assert.equal(audio.level(), 0);
  await audio.unmute(); const recorded = audio.recordingTrack();
  assert.ok(Math.abs(audio.level() - .4) < .001);
  audio.level(); assert.equal(reads, 2); assert.equal(permissions, 1);
  assert.equal(destinations.length, 2); assert.equal(destinations[1], analyser);
  audio.mute(); assert.equal(audio.level(), 0); assert.ok(recorded);
  audio.dispose();
});

test('record preparation, countdown cancellation, skip, comparison, and saved-look application preserve the recording flow', async () => {
  const env = environment();
  let active = false, starts = 0, cameraStarts = 0, resolveResume;
  const { DEFAULT_FILTERS, DEFAULT_EFFECTS } = globalThis.usabilityDefaults;
  globalThis.usabilityApp = {
    ...globalThis.usabilityDefaults, ...prefs, RecordingCountdown, CompareButton,
    useCamera: () => ({ videoRef: { current: null }, isActive: active, facingMode: 'user', error: null, startCamera: async () => { cameraStarts++; }, stopCamera() {}, switchCamera() {}, isSupported: true, hasMultipleCameras: false }),
    RecordingAudio: class { async unmute() { return true; } resume() { return new Promise((resolve) => { resolveResume = resolve; }); } recordingTrack() { return { stop() {} }; } mute() {} dispose() {} },
  };
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'video/mp4'; }
    start() { starts++; this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['clip']) }); this.onstop?.(); }
  };
  const { default: App } = await load('../src/App.tsx', `
    const { DEFAULT_FILTERS, DEFAULT_EFFECTS, readPreference, writePreference, RecordingCountdown, CompareButton, useCamera, RecordingAudio } = globalThis.usabilityApp;
    const DEFAULT_LIVE_TEXT = { enabled: false }; const LiveTextControls = () => null; const LiveImageControls = () => null;
    const BACKGROUNDS = [{ src: '/backgrounds/studio.svg' }]; const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;
    const CameraPreview = () => null, BackgroundPicker = () => null, CameraFilters = () => null, CameraEffects = () => null, MicrophoneMeter = () => null, MotionToggle = () => null;
    const SavedLooks = () => null;
    const Modal = ({ children, open = true }) => open ? React.createElement('section', {}, children) : null;
    const getMp4MimeType = () => 'video/mp4';
  `);
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(App)); });
  const preview = () => renderer.root.find((node) => node.props.onProcessingState);
  const button = (label) => renderer.root.findByProps({ 'aria-label': label });
  await act(async () => preview().props.onStartCamera()); assert.equal(cameraStarts, 1);
  active = true;
  await act(async () => renderer.update(React.createElement(App)));
  preview().props.canvasRef.current = { captureStream: () => ({ addTrack() {}, getTracks: () => [] }) };
  assert.equal(preview().props.maskEnabled, false);
  await act(async () => button('Mask').props.onClick());
  assert.equal(preview().props.maskEnabled, true);
  await act(async () => preview().props.onProcessingState('ready'));
  let pending;
  await act(async () => { pending = button('Start recording').props.onClick(); });
  await act(async () => renderer.root.findAllByType('button').find((b) => b.children.includes('Cancel recording start')).props.onClick());
  await act(async () => { resolveResume(); await pending; }); assert.equal(starts, 0);
  await act(async () => { pending = button('Start recording').props.onClick(); });
  await act(async () => { resolveResume(); await pending; });
  assert.equal(starts, 0); assert.equal(env.timers.size, 1);
  await env.tick(); assert.equal(starts, 0);
  await act(async () => renderer.root.findAllByType('button').find((b) => b.children.includes('Cancel recording')).props.onClick());
  assert.equal(env.timers.size, 0); assert.equal(starts, 0);
  await act(async () => { pending = button('Start recording').props.onClick(); });
  await act(async () => { resolveResume(); await pending; });
  await act(async () => renderer.root.findAllByType('button').find((b) => b.children.includes('Skip countdown')).props.onClick());
  assert.equal(starts, 1); assert.equal(env.timers.size, 0); assert.ok(button('Stop recording'));
  const oldFilters = preview().props.filters, oldEffects = preview().props.effects;
  await act(async () => button('Hold to compare with original camera').props.onKeyDown({ key: ' ', preventDefault() {} }));
  assert.equal(preview().props.comparing, true); assert.equal(preview().props.filters, oldFilters); assert.equal(preview().props.effects, oldEffects);
  await env.emit('blur'); assert.equal(preview().props.comparing, false);
  await act(async () => button('Background filters').props.onClick());
  const looks = () => renderer.root.find((node) => node.props.onApply);
  const saved = { background: { kind: 'color', value: '#123456' }, blur: 25, tint: 8, layout: 'square', filters: { ...DEFAULT_FILTERS, contrast: 30 }, effects: { ...DEFAULT_EFFECTS, grain: 20 } };
  await act(async () => looks().props.onApply(saved)); assert.notEqual(preview().props.layout, 'square');
  await act(async () => button('Stop recording').props.onClick());
  await act(async () => looks().props.onApply(saved));
  assert.equal(preview().props.layout, 'square'); assert.equal(preview().props.blur, 25); assert.equal(preview().props.effects.grain, 20);
  await act(async () => renderer.unmount());
});

test('older saved looks gain neutral new settings while malformed settings remain rejected', () => {
  const { DEFAULT_FILTERS, DEFAULT_EFFECTS } = globalThis.usabilityDefaults;
  const legacy = { version: 1, id: 'legacy', name: 'Old studio', savedAt: 1, background: { kind: 'blur', value: '' }, blur: 25, tint: 0, layout: 'portrait', filters: { ...DEFAULT_FILTERS }, effects: { ...DEFAULT_EFFECTS } };
  for (const key of ['look', 'lookIntensity', 'sharpen']) delete legacy.filters[key];
  for (const key of ['vignette', 'outline', 'outlineWidth', 'outlineColor']) delete legacy.effects[key];
  const restored = storage.restoreStudioLook(legacy);
  assert.equal(restored.filters.look, 'none');
  assert.equal(restored.filters.sharpen, 0);
  assert.equal(restored.effects.outline, 0);
  assert.equal(restored.effects.vignette, 0);
  assert.equal(restored.blur, 25);
  for (const bad of [{ outlineColor: 'red' }, { outlineWidth: 0 }, { outline: 101 }]) assert.equal(storage.restoreStudioLook({ ...legacy, effects: { ...legacy.effects, ...bad } }), null);
  for (const bad of [{ look: 'unknown' }, { lookIntensity: -1 }, { contrast: undefined }]) assert.equal(storage.restoreStudioLook({ ...legacy, filters: { ...legacy.filters, ...bad } }), null);
});

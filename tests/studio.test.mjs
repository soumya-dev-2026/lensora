import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { indexedDB } from 'fake-indexeddb';

async function load(path, replace = (s) => s) {
  const source = replace(await readFile(new URL(path, import.meta.url), 'utf8'));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('background presets persist across reads, replace by slot, and restore independently', async () => {
  globalThis.indexedDB = indexedDB;
  const storage = await load('../src/storage/backgroundPresets.ts');
  const one = 'data:image/png;base64,one';
  const two = 'data:image/png;base64,two';
  await storage.saveBackgroundPreset('studio', one);
  await storage.saveBackgroundPreset('office', two);
  assert.deepEqual(await storage.loadBackgroundPresets(), { studio: one, office: two });
  await storage.saveBackgroundPreset('studio', two);
  assert.equal((await storage.loadBackgroundPresets()).studio, two);
  await storage.saveBackgroundPreset('studio', null);
  assert.deepEqual(await storage.loadBackgroundPresets(), { office: two });
});

function track() { return { stopped: false, enabled: true, stop() { this.stopped = true; }, clone() { return track(); } }; }
function audioFixture() {
  const output = track();
  const nodes = [];
  globalThis.AudioContext = class {
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [output], getTracks: () => [output] } }; }
    createConstantSource() { return { offset: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createMediaStreamSource() { const node = { connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; } }; nodes.push(node); return node; }
    async resume() {}
    async close() {}
  };
  return { output, nodes };
}

test('microphone changes preserve recording track and release microphone on mute', async () => {
  const { output, nodes } = audioFixture();
  const mic = track();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [mic], getTracks: () => [mic] }) } } });
  const { RecordingAudio } = await load('../src/recording/RecordingAudio.ts');
  const audio = new RecordingAudio();
  const recording = audio.recordingTrack();
  assert.equal(await audio.unmute(), true);
  assert.equal(nodes[0].connected, true);
  audio.mute();
  assert.equal(mic.stopped, true);
  assert.equal(nodes[0].connected, false);
  assert.equal(recording.stopped, false);
  assert.equal(output.stopped, false);
  audio.dispose();
  assert.equal(output.stopped, true);
});

test('late microphone permission after camera closes is released without connecting', async () => {
  const { nodes } = audioFixture();
  let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise((done) => { resolve = done; });
  const { RecordingAudio } = await load('../src/recording/RecordingAudio.ts');
  const audio = new RecordingAudio();
  const pending = audio.unmute();
  await new Promise((done) => setImmediate(done));
  audio.mute();
  const mic = track();
  resolve({ getAudioTracks: () => [mic], getTracks: () => [mic] });
  assert.equal(await pending, false);
  assert.equal(mic.stopped, true);
  assert.equal(nodes.length, 0);
  audio.dispose();
});

test('audio recordings choose a codec including AAC or the generic MP4 fallback', async () => {
  const { getMp4MimeType } = await load('../src/recording/mp4.ts');
  assert.equal(getMp4MimeType(() => true, true), 'video/mp4;codecs=avc1.424028,mp4a.40.2');
  assert.equal(getMp4MimeType((type) => type === 'video/mp4', true), 'video/mp4');
  assert.throws(() => getMp4MimeType((type) => type === 'video/mp4;codecs=avc1', true), /cannot record MP4/);
});

test('closing save preserves the clip on cancel; delete clears it and restarts the camera', async () => {
  const calls = [];
  globalThis.React = React;
  globalThis.studioFixture = {
    useCamera: () => ({ videoRef: { current: null }, isActive: true, facingMode: 'user', error: null,
      startCamera: async () => calls.push('start'), stopCamera: () => calls.push('stop'), switchCamera() {}, isSupported: true, hasMultipleCameras: false }),
  };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = { MediaRecorder: true, setInterval, clearInterval };
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'video/mp4'; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded clip']) }); this.onstop?.(); }
  };
  const { default: App } = await load('../src/App.tsx', (source) => source
    .replace(/^import .*;$/gm, '')
    .replace('function App()', `const React = globalThis.React;
      const { useCallback, useEffect, useRef, useState } = React;
      const { useCamera } = globalThis.studioFixture;
      const readPreference = (key, fallback = true) => key === 'countdown' ? false : fallback;
      const writePreference = () => {};
      const MicrophoneMeter = () => null, CompareButton = () => null, SavedLooks = () => null, MotionToggle = () => null, RecordingCountdown = () => null;
      const DEFAULT_LIVE_TEXT = { enabled: false }; const LiveTextControls = () => null; const LiveImageControls = () => null;
    const BACKGROUNDS = [{ src: 'studio.svg' }];
      const DEFAULT_FILTERS = {};
      const DEFAULT_EFFECTS = {};
      const CameraPreview = () => null, BackgroundPicker = () => null, CameraFilters = () => null, CameraEffects = () => null;
      const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;
      const GaugeSlider = globalThis.GaugeSlider;
      const SwipeSlider = ({ children }) => React.createElement('div', {}, children);
      const Modal = ({ title, children, onClose, open = true }) => open ? React.createElement('section', { title, onClose }, children) : null;
      const getMp4MimeType = () => 'video/mp4';
      class RecordingAudio { async unmute() { return true; } async resume() {} recordingTrack() { return { stop() {} }; } mute() {} dispose() {} }
      function App()`));
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(App)); });
  const preview = renderer.root.find((node) => node.props.onProcessingState);
  preview.props.canvasRef.current = { captureStream: () => ({ addTrack() {}, getTracks: () => [] }) };
  await act(async () => preview.props.onProcessingState('ready'));
  const button = (label) => renderer.root.findByProps({ 'aria-label': label });
  for (const [label, tab] of [['Background filters', 'background'], ['Camera filters', 'filters']]) {
    await act(async () => button(label).props.onClick());
    assert.equal(renderer.root.findAllByType('section').filter((node) => node.props.title === 'Studio settings').length, 1);
    assert.equal(renderer.root.findByProps({ id: `studio-tab-${tab}` }).props['aria-selected'], true);
    assert.equal(renderer.root.findByProps({ id: `studio-panel-${tab}` }).props.hidden, false);
    await act(async () => renderer.root.findAllByType('section').find((node) => node.props.title === 'Studio settings').props.onClose());
  }
  assert.ok(button('Mute microphone')); // Camera starts with microphone enabled.
  await act(async () => button('Mute microphone').props.onClick());
  assert.ok(button('Unmute microphone'));
  await act(async () => button('Unmute microphone').props.onClick());
  assert.ok(button('Mute microphone'));
  assert.ok(button('Open video editor'));
  assert.equal(button('Split camera').props.disabled, false);
  assert.equal(button('Mask').props['aria-pressed'], false);
  await act(async () => button('Mask').props.onClick());
  assert.equal(button('Mask').props['aria-pressed'], true);
  await act(async () => button('Mask').props.onClick());
  assert.equal(button('Mask').props['aria-pressed'], false);
  await act(async () => button('Start recording').props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Open video editor' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Split camera' }).length, 0);
  assert.equal(renderer.root.findByProps({ className: 'top-left' }).findAllByType('button').length, 3);
  assert.equal(button('Mask').props['aria-pressed'], false);
  assert.equal(button('Mask').props.disabled, true);
  await act(async () => button('Background filters').props.onClick());
  await act(async () => renderer.root.findByProps({ id: 'studio-tab-text' }).props.onClick());
  assert.equal(renderer.root.findByProps({ id: 'studio-panel-text' }).props.hidden, false);
  const textControls = renderer.root.find((node) => typeof node.props.onPosition === 'function' && !Array.isArray(node.props.value));
  await act(async () => textControls.props.onChange({ ...textControls.props.value, enabled: true, text: 'Live recording caption', color: '#ff0088', opacity: 60 }));
  assert.equal(preview.props.liveText.text, 'Live recording caption');
  assert.equal(preview.props.liveText.opacity, 60);
  const imageControls = renderer.root.find((node) => typeof node.props.onPosition === 'function' && Array.isArray(node.props.value));
  await act(async () => imageControls.props.onChange([{ id: 'logo', enabled: true, opacity: 40, x: 25, y: 75 }]));
  assert.equal(preview.props.liveImages[0].opacity, 40);
  assert.equal(preview.props.liveImages[0].x, 25);
  await act(async () => textControls.props.onPosition());
  await act(async () => button('Pause recording').props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Open video editor' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Split camera' }).length, 0);
  await act(async () => button('Resume recording').props.onClick());
  await act(async () => button('Stop recording').props.onClick());
  assert.ok(button('Open video editor'));
  assert.equal(button('Split camera').props.disabled, false);
  assert.equal(button('Mask').props['aria-pressed'], false);
  await act(async () => button('Mask').props.onClick());
  assert.equal(button('Mask').props['aria-pressed'], true);
  await act(async () => button('Mask').props.onClick());
  assert.equal(button('Mask').props['aria-pressed'], false);
  const dialog = (title) => renderer.root.findByProps({ title, onClose: renderer.root.findAllByType('section').find((n) => n.props.title === title)?.props.onClose });
  const original = renderer.root.findByProps({ className: 'recorded-preview' }).props.src;
  await act(async () => dialog('Your video is ready').props.onClose());
  assert.equal(renderer.root.findAllByProps({ className: 'recorded-preview' }).length, 0);
  await act(async () => button('Cancel, return to save video').props.onClick());
  assert.equal(renderer.root.findByProps({ className: 'recorded-preview' }).props.src, original);
  await act(async () => dialog('Your video is ready').props.onClose());
  await act(async () => dialog('Delete this recording?').props.onClose());
  assert.equal(renderer.root.findByProps({ className: 'recorded-preview' }).props.src, original);
  await act(async () => dialog('Your video is ready').props.onClose());
  await act(async () => button('OK, delete').props.onClick());
  assert.deepEqual(calls, ['stop', 'start']);
  assert.equal(renderer.root.findAllByType('section').length, 0);
  assert.ok(button('Start recording'));
  await act(async () => renderer.unmount());
});

test('effects panel updates independent settings, disables controls, and resets defaults', async () => {
  globalThis.React = React;
  const { DEFAULT_EFFECTS } = await load('../src/types/effects.ts');
  globalThis.effectDefaults = DEFAULT_EFFECTS;
  globalThis.GaugeSlider = (await load('../src/components/GaugeSlider.tsx', (source) =>
    `const React = globalThis.React; const { useId, useRef, useState } = React; const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;\n` + source.replace(/^import .*;$/gm, ''))).GaugeSlider;
  const { CameraEffects } = await load('../src/components/CameraEffects.tsx', (source) => source
    .replace(/^import .*;$/gm, '')
    .replace('export function CameraEffects', `const React = globalThis.React;
      const { useId, useState } = React;
      const DEFAULT_EFFECTS = globalThis.effectDefaults;
      const Icon = () => null; const AppVersion = () => null; const ColorPicker = () => null;
      const GaugeSlider = globalThis.GaugeSlider;
      const SwipeSlider = ({ children }) => React.createElement('div', {}, children);
      const Modal = ({ children }) => React.createElement('section', {}, children);
      export function CameraEffects`));
  let settings = { ...DEFAULT_EFFECTS }, renderer;
  const onChange = (value) => { settings = value; renderer.update(React.createElement(CameraEffects, { value, onChange, faceState: 'no-face' })); };
  await act(async () => { renderer = TestRenderer.create(React.createElement(CameraEffects, { value: settings, onChange, faceState: 'no-face' })); });
  const click = (label) => act(async () => renderer.root.findAllByType('button').find((button) => button.findAllByType('span').some((span) => span.children.join('') === label)).props.onClick());
  assert.equal(renderer.root.findAllByType('select').length, 0);
  await click('Crown'); await click('Scene'); await click('Neon'); await click('Rain');
  await click('Face');
  assert.equal(settings.sticker, 'crown'); assert.equal(settings.frame, 'neon'); assert.equal(settings.background, 'rain');
  assert.ok(renderer.root.findByProps({ role: 'status' }).children.join('').includes('Face the camera'));
  await act(async () => renderer.root.findAllByType('input').find((input) => input.props.id === 'effect-distortion').props.onChange({ target: { value: '70' } }));
  assert.equal(settings.distortion, 70);
  await act(async () => renderer.root.findByProps({ role: 'switch' }).props.onChange({ target: { checked: false } }));
  assert.equal(renderer.root.findByType('fieldset').props.disabled, true);
  assert.equal(settings.sticker, 'crown');
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Reset all effects' }).props.onClick());
  assert.deepEqual(settings, DEFAULT_EFFECTS);
  await act(async () => renderer.unmount());
});

test('noise cancellation defaults on, toggles the existing mic, and preserves recording audio', async () => {
  const { nodes, output } = audioFixture();
  const mic = track();
  let capture, suppressed = true;
  const updates = [];
  mic.getConstraints = () => ({ echoCancellation: true });
  mic.getSettings = () => ({ noiseSuppression: suppressed });
  mic.applyConstraints = async (constraints) => { updates.push(constraints); suppressed = constraints.noiseSuppression.ideal; };
  navigator.mediaDevices.getUserMedia = async (constraints) => { capture = constraints; return { getAudioTracks: () => [mic], getTracks: () => [mic] }; };
  const { RecordingAudio } = await load('../src/recording/RecordingAudio.ts');
  const audio = new RecordingAudio();
  const recording = audio.recordingTrack();
  assert.equal(await audio.unmute(), true);
  assert.equal(capture.audio.noiseSuppression.ideal, true);
  assert.equal(await audio.setNoiseCancellation(false), true);
  assert.equal(suppressed, false);
  assert.equal(updates.at(-1).echoCancellation, true);
  await Promise.all([audio.setNoiseCancellation(true), audio.setNoiseCancellation(false)]);
  assert.equal(suppressed, false);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].connected, true);
  assert.equal(recording.stopped, false);
  assert.equal(output.stopped, false);
  mic.applyConstraints = async () => { throw new Error('unsupported'); };
  assert.equal(await audio.setNoiseCancellation(true), false);
  assert.equal(mic.stopped, false);
  audio.dispose();
  const restored = new RecordingAudio(false);
  assert.equal(await restored.unmute(), true);
  assert.equal(capture.audio.noiseSuppression.ideal, false);
  restored.dispose();
});

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
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded clip']) }); this.onstop?.(); }
  };
  const { default: App } = await load('../src/App.tsx', (source) => source
    .replace(/^import .*;$/gm, '')
    .replace('function App()', `const React = globalThis.React;
      const { useCallback, useEffect, useRef, useState } = React;
      const { useCamera } = globalThis.studioFixture;
      const BACKGROUNDS = [{ src: 'studio.svg' }];
      const DEFAULT_FILTERS = {};
      const CameraPreview = () => null, BackgroundPicker = () => null, CameraFilters = () => null;
      const Icon = () => null;
      const Modal = ({ title, children, onClose }) => React.createElement('section', { title, onClose }, children);
      const getMp4MimeType = () => 'video/mp4';
      class RecordingAudio { async unmute() { return true; } async resume() {} recordingTrack() { return { stop() {} }; } mute() {} dispose() {} }
      function App()`));
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(App)); });
  const preview = renderer.root.find((node) => node.props.onProcessingState);
  preview.props.canvasRef.current = { captureStream: () => ({ addTrack() {}, getTracks: () => [] }) };
  await act(async () => preview.props.onProcessingState('ready'));
  const button = (label) => renderer.root.findByProps({ 'aria-label': label });
  assert.ok(button('Mute microphone')); // Camera starts with microphone enabled.
  await act(async () => button('Mute microphone').props.onClick());
  assert.ok(button('Unmute microphone'));
  await act(async () => button('Unmute microphone').props.onClick());
  assert.ok(button('Mute microphone'));
  await act(async () => button('Start recording').props.onClick());
  await act(async () => button('Stop recording').props.onClick());
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

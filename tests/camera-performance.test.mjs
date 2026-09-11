import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

async function load(path, replace = (s) => s) {
  const { outputText } = ts.transpileModule(replace(await readFile(new URL(path, import.meta.url), 'utf8')), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { FrameBudget } = await load('../src/rendering/FrameBudget.ts');

test('phone budget processes 15 synchronized frames per second from a 30 fps camera', () => {
  const budget = new FrameBudget(15);
  let frames = 0;
  for (let i = 0; i < 30; i++) {
    if (budget.shouldProcess(i * 1000 / 30)) { frames++; budget.recordCost(10); }
  }
  assert.equal(frames, 15);
});

test('expensive frames reduce processing frequency and recover as cost falls', () => {
  const budget = new FrameBudget(30);
  assert.equal(budget.shouldProcess(0), true);
  budget.recordCost(80);
  assert.equal(budget.shouldProcess(100), false);
  assert.equal(budget.shouldProcess(160), true);
  for (let i = 0; i < 30; i++) budget.recordCost(5);
  assert.equal(budget.shouldProcess(194), true);
});

test('normal preview skips AI; mask is opt-in, pauses while hidden, and cleans up', async () => {
  const frames = new Map(), events = new Map();
  let frameId = 0, resolveModel, segments = 0, trackers = 0;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = {
    hidden: false,
    createElement: () => ({ width: 720, height: 1280 }),
    addEventListener: (event, fn) => events.set(event, fn),
    removeEventListener: (event) => events.delete(event),
  };
  const video = {
    readyState: 2, currentTime: 0,
    requestVideoFrameCallback: (fn) => { frames.set(++frameId, fn); return frameId; },
    cancelVideoFrameCallback: (id) => frames.delete(id),
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.previewFixture = {
    React, FrameBudget,
    PersonSegmenter: class {
      initialize() { return new Promise((resolve) => { resolveModel = resolve; }); }
      segment() { segments++; return { data: new Uint8Array([255]), width: 1, height: 1 }; }
      dispose() {}
    },
    FaceTracker: class { async initialize() { trackers++; } detect() { return null; } dispose() {} },
    SegmentationInput: class { frame = {}; capture() { return this.frame; } },
    WebGLCompositor: class { setBackgroundColor() {} render() {} dispose() {} },
  };
  const { CameraPreview } = await load('../src/components/CameraPreview.tsx', (s) => `
    const { React, FrameBudget, PersonSegmenter, FaceTracker, SegmentationInput, WebGLCompositor } = globalThis.previewFixture;
    const { useEffect, useRef, useState } = React;
    const styles = new Proxy({}, { get: (_, key) => key });
    const drawLiveImages = () => {}, drawLiveText = () => {};
    const LiveImageHandle = () => null, LiveTextHandle = () => null;
    ${s.replace(/^import .*;$/gm, '')}`);
  const states = [];
  const props = {
    maskEnabled: false, layout: 'portrait', isActive: true, facingMode: 'user', videoRef: { current: video },
    canvasRef: { current: { width: 720, height: 1280, getContext: () => ({ drawImage() {} }) } },
    background: { kind: 'color', value: '#000000' }, onFaceTrackingState() {},
    onProcessingState: (state) => states.push(state),
  };
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(CameraPreview, props), {
    createNodeMock: (element) => element.type === 'video' ? video : element.type === 'canvas' ? props.canvasRef.current : null,
  }); });
  assert.equal(resolveModel, undefined, 'normal camera must not load segmentation');
  assert.equal(trackers, 0);
  const tick = async (time) => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id); video.currentTime = time / 1000;
    await act(async () => fn(time));
  };
  await tick(0);
  assert.equal(segments, 0);
  assert.equal(states.at(-1), 'ready', 'normal camera is ready for recording without AI');
  assert.equal(renderer.root.findAllByType('video')[0].props.className, 'sourceVideo');
  await act(async () => renderer.update(React.createElement(CameraPreview, { ...props, maskEnabled: true })));
  assert.equal(renderer.root.findAllByType('video')[0].props.className, 'startingPreview');
  assert.equal(trackers, 0);
  assert.equal(states.at(-1), 'loading');
  await act(async () => resolveModel());
  await tick(0);
  assert.equal(segments, 1);
  assert.equal(trackers, 1);
  assert.equal(renderer.root.findAllByType('video')[0].props.className, 'sourceVideo');
  assert.equal(states.at(-1), 'ready');
  await tick(33);
  assert.equal(segments, 1);
  document.hidden = true; events.get('visibilitychange')();
  assert.equal(frames.size, 0);
  document.hidden = false; events.get('visibilitychange')();
  assert.equal(frames.size, 1);
  await tick(1000);
  assert.equal(segments, 2);
  await act(async () => renderer.update(React.createElement(CameraPreview, props)));
  await tick(1100);
  assert.equal(segments, 2, 'turning mask off stops inference');
  assert.equal(states.at(-1), 'ready');
  await act(async () => renderer.unmount());
  assert.equal(frames.size, 0);
  assert.equal(events.size, 0);
});

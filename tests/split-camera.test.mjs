import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const { outputText } = ts.transpileModule(await readFile(new URL('../src/camera/CameraManager.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } });
const { CameraManager } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
function stream(id) {
  const track = Object.assign(new EventTarget(), { readyState: 'live', muted: false, stopped: false,
    getSettings: () => ({ deviceId: id }), stop() { this.stopped = true; this.readyState = 'ended'; } });
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
async function fixture(openSecond) {
  const primary = stream('front'), secondary = stream('rear'), requests = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    enumerateDevices: async () => ['front', 'rear'].map((deviceId) => ({ kind: 'videoinput', deviceId })),
    getUserMedia: async (constraints) => { requests.push(constraints); return requests.length === 1 ? primary : openSecond ? openSecond(primary, secondary) : secondary; },
  } } });
  const manager = new CameraManager();
  await manager.start();
  return { manager, primary, secondary, requests };
}
test('split opens a distinct camera without audio and releases it independently', async () => {
  const { manager, primary, secondary, requests } = await fixture();
  await manager.startSplitCamera();
  assert.equal(manager.getState().secondaryStream, secondary);
  assert.deepEqual(requests[1].video.deviceId, { exact: 'rear' });
  assert.equal(requests[1].audio, false);
  manager.stopSplitCamera();
  assert.equal(secondary.track.stopped, true);
  assert.equal(primary.track.stopped, false);
  assert.equal(manager.getState().isActive, true);
  manager.stop();
});
test('unsupported dual capture keeps the primary camera and reports the failure', async () => {
  const { manager, primary } = await fixture(() => { throw new DOMException('busy', 'NotReadableError'); });
  await manager.startSplitCamera();
  assert.equal(manager.getState().secondaryStream, null);
  assert.equal(manager.getState().splitPending, false);
  assert.match(manager.getState().splitError, /Could not open both/);
  assert.equal(primary.track.stopped, false);
  manager.stop();
});
test('stopping during an outstanding request releases a late second stream', async () => {
  let resolve;
  const { manager, secondary } = await fixture(() => new Promise((done) => { resolve = done; }));
  const pending = manager.startSplitCamera();
  await Promise.resolve();
  assert.equal(manager.getState().splitPending, true);
  manager.stop();
  resolve(secondary);
  await pending;
  assert.equal(secondary.track.stopped, true);
  assert.equal(manager.getState().secondaryStream, null);
  assert.equal(manager.getState().isActive, false);
});
test('opening a camera that interrupts the main camera leaves a restartable state', async () => {
  const { manager, primary, secondary } = await fixture((first, second) => { first.track.muted = true; return second; });
  await manager.startSplitCamera();
  assert.equal(manager.getState().isActive, false);
  assert.equal(manager.getState().splitPending, false);
  assert.equal(primary.track.stopped, true);
  assert.equal(secondary.track.stopped, true);
  assert.match(manager.getState().splitError, /Start the camera again/);
});
test('losing the second camera falls back to the still-active main camera', async () => {
  const { manager, primary, secondary } = await fixture();
  await manager.startSplitCamera();
  secondary.track.dispatchEvent(new Event('ended'));
  assert.equal(manager.getState().secondaryStream, null);
  assert.equal(manager.getState().isActive, true);
  assert.equal(primary.track.stopped, false);
  assert.match(manager.getState().splitError, /single-camera/);
  manager.stop();
});
test('losing the main camera releases both streams', async () => {
  const { manager, primary, secondary } = await fixture();
  await manager.startSplitCamera();
  primary.track.muted = true;
  primary.track.dispatchEvent(new Event('mute'));
  assert.equal(manager.getState().isActive, false);
  assert.equal(primary.track.stopped, true);
  assert.equal(secondary.track.stopped, true);
});

test('switch releases the front camera before requesting the exact rear camera', async () => {
  const { manager, primary, secondary, requests } = await fixture((first, second) => {
    assert.equal(first.track.stopped, true);
    return second;
  });
  await manager.switchCamera();
  assert.deepEqual(requests[1].video.facingMode, { exact: 'environment' });
  assert.equal(manager.getState().stream, secondary);
  assert.equal(manager.getState().facingMode, 'environment');
  manager.stop();
});

test('failed switch reacquires the previous camera instead of restoring a stopped stream', async () => {
  const recovered = stream('front');
  let attempts = 0;
  const { manager, primary } = await fixture(() => {
    if (++attempts === 1) throw new DOMException('busy', 'NotReadableError');
    return recovered;
  });
  await assert.rejects(manager.switchCamera());
  assert.equal(primary.track.stopped, true);
  assert.equal(manager.getState().stream, recovered);
  assert.equal(manager.getState().isActive, true);
  assert.equal(manager.getState().facingMode, 'user');
  manager.stop();
});

test('split waits for a second camera to unmute during sensor startup', async () => {
  const { manager, secondary } = await fixture((_first, second) => {
    second.track.muted = true;
    setTimeout(() => { second.track.muted = false; second.track.dispatchEvent(new Event('unmute')); }, 10);
    return second;
  });
  await manager.startSplitCamera();
  assert.equal(manager.getState().secondaryStream, secondary);
  assert.equal(manager.getState().splitError, null);
  manager.stop();
});

test('split requests the opposite facing camera when WebView omits device IDs', async () => {
  const { manager, primary, requests, secondary } = await fixture();
  primary.track.getSettings = () => ({});
  navigator.mediaDevices.enumerateDevices = async () => [];
  await manager.startSplitCamera();
  assert.deepEqual(requests[1].video.facingMode, { exact: 'environment' });
  assert.equal(manager.getState().secondaryStream, secondary);
  manager.stop();
});

test('split prefers the opposite facing camera over another same-facing lens', async () => {
  const { manager, requests } = await fixture();
  navigator.mediaDevices.enumerateDevices = async () => [
    { kind: 'videoinput', deviceId: 'front', label: 'Front camera' },
    { kind: 'videoinput', deviceId: 'front-wide', label: 'Front wide camera' },
    { kind: 'videoinput', deviceId: 'rear', label: 'Back camera' },
  ];
  await manager.startSplitCamera();
  assert.deepEqual(requests[1].video.deviceId, { exact: 'rear' });
  manager.stop();
});

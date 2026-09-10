import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path, transform = (s) => s) {
  const { outputText } = ts.transpileModule(transform(await readFile(new URL(path, import.meta.url), 'utf8')), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { drawLiveImages, liveImageLayout } = await load('../src/rendering/liveImages.ts');
const image = { id: 'logo', name: 'Logo', image: { naturalWidth: 400, naturalHeight: 200 }, src: 'blob:logo', enabled: true, size: 30, x: 50, y: 50, opacity: 35 };
test('live images render opacity and layer order into the recording canvas', () => {
  const calls = [];
  const ctx = { globalAlpha: 1, save() { this.saved = this.globalAlpha; }, restore() { this.globalAlpha = this.saved; }, drawImage(...args) { calls.push({ args, alpha: this.globalAlpha }); } };
  drawLiveImages(ctx, [image, { ...image, opacity: 0 }, { ...image, enabled: false }, { ...image, opacity: 100 }], 1280, 720);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.alpha), [.35, 1]);
  assert.deepEqual(calls[0].args.slice(1), [448, 264, 384, 192]);
  assert.equal(ctx.globalAlpha, 1);
});
test('image position and aspect ratio stay within every canvas orientation', () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [1280, 1280]]) {
    for (const ratio of [.1, 2, 10]) for (const edge of [-50, 150]) {
      const box = liveImageLayout({ ...image, size: 100, x: edge, y: edge, image: { naturalWidth: 100, naturalHeight: 100 * ratio } }, width, height);
      assert.ok(box.x - box.width / 2 >= -.001 && box.x + box.width / 2 <= width + .001);
      assert.ok(box.y - box.height / 2 >= -.001 && box.y + box.height / 2 <= height + .001);
      assert.ok(Math.abs(box.height / box.width - ratio) < .001);
    }
  }
});
test('image handle preserves grab offset, supports keyboard movement and keeps opacity', async () => {
  const { default: React } = await import('react');
  const { default: Renderer, act } = await import('react-test-renderer');
  globalThis.React = React; globalThis.liveImageLayout = liveImageLayout;
  const { LiveImageHandle } = await load('../src/components/LiveImageHandle.tsx', (s) => 'const React = globalThis.React; const { useRef } = React; const liveImageLayout = globalThis.liveImageLayout;\n' + s.replace(/^import .*;$/gm, ''));
  let value = image, renderer;
  const props = () => ({ value, width: 1280, height: 720, onChange(next) { value = next; renderer.update(React.createElement(LiveImageHandle, props())); } });
  await act(async () => { renderer = Renderer.create(React.createElement(LiveImageHandle, props())); });
  const handle = () => renderer.root.findByProps({ role: 'button' });
  const target = { focus() {}, setPointerCapture() {}, parentElement: { getBoundingClientRect: () => ({ width: 640, height: 360 }) } };
  await act(async () => handle().props.onPointerDown({ button: 0, pointerId: 1, clientX: 300, clientY: 180, preventDefault() {}, currentTarget: target }));
  await act(async () => handle().props.onPointerMove({ pointerId: 1, clientX: 364, clientY: 216, currentTarget: target }));
  assert.equal(value.x, 60); assert.equal(value.y, 60); assert.equal(value.opacity, 35);
  await act(async () => handle().props.onPointerCancel());
  await act(async () => handle().props.onKeyDown({ key: 'ArrowLeft', shiftKey: true, preventDefault() {} }));
  assert.equal(value.x, 55);
  await act(async () => renderer.unmount());
});
test('studio image upload, opacity adjustment and removal update the overlay collection', async () => {
  const { default: React } = await import('react');
  const { default: Renderer, act } = await import('react-test-renderer');
  globalThis.React = React;
  const { indexedDB } = await import('fake-indexeddb'); globalThis.indexedDB = indexedDB;
  globalThis.stickerStorage = await load('../src/storage/stickerLibrary.ts');
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,dGVzdA==' }) };
  globalThis.Image = class { naturalWidth = 400; naturalHeight = 200; async decode() {} };
  const { LiveImageControls } = await load('../src/components/LiveImageControls.tsx', (s) => 'const React = globalThis.React; const { useEffect, useRef, useState } = React; const Icon = () => null; const EmojiPicker = () => null; const { loadStickerLibrary, saveStickerLibrary, STICKER_PRESETS } = globalThis.stickerStorage;\n' + s.replace(/^import .*;$/gm, ''));
  let value = [], renderer;
  const props = () => ({ value, canPosition: true, onPosition() {}, onChange(next) { value = next; renderer.update(React.createElement(LiveImageControls, props())); } });
  await act(async () => { renderer = Renderer.create(React.createElement(LiveImageControls, props())); });
  const file = Object.assign(new Blob(['image'], { type: 'image/png' }), { name: 'logo.png' });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Upload overlay image' }).props.onChange({ target: { files: [file], value: '' } }));
  assert.equal(value.length, 1); assert.equal(value[0].name, 'logo.png'); assert.equal(value[0].enabled, true);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Image opacity' }).props.onChange({ target: { value: '45' } }));
  assert.equal(value[0].opacity, 45);
  await act(async () => renderer.root.findAllByType('button').find((button) => button.children.includes('Remove image')).props.onClick());
  assert.equal(value.length, 0);
  await act(async () => renderer.unmount());
});

test('sticker library remembers custom presets and active overlay settings across reads', async () => {
  const { IDBFactory } = await import('fake-indexeddb'); globalThis.indexedDB = new IDBFactory();
  const { loadStickerLibrary, saveStickerLibrary, STICKER_PRESETS } = await load('../src/storage/stickerLibrary.ts');
  const sticker = { id: 'custom', name: 'My logo', src: 'data:image/png;base64,dGVzdA==' };
  const overlay = { ...sticker, id: 'instance', x: 25, y: 75, size: 18, opacity: 45, enabled: true };
  await saveStickerLibrary({ stickers: [sticker], overlays: [overlay, { ...overlay, ...STICKER_PRESETS[0] }] });
  let saved = await loadStickerLibrary();
  assert.deepEqual(saved.stickers, [sticker]); assert.deepEqual(saved.overlays[0], overlay);
  assert.equal(saved.overlays[1].src, '/stickers/live.svg');
  const a = saveStickerLibrary({ stickers: [sticker], overlays: [{ ...overlay, opacity: 50 }] });
  const b = saveStickerLibrary({ stickers: [sticker], overlays: [{ ...overlay, opacity: 70 }] });
  await Promise.all([a, b]);
  assert.equal((await loadStickerLibrary()).overlays[0].opacity, 70);
  await saveStickerLibrary({ stickers: [sticker], overlays: [] });
  saved = await loadStickerLibrary(); assert.equal(saved.stickers.length, 1); assert.equal(saved.overlays.length, 0);
  await saveStickerLibrary({ stickers: [], overlays: [] });
  assert.deepEqual(await loadStickerLibrary(), { stickers: [], overlays: [] });
});

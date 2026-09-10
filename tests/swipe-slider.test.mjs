import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

globalThis.React = React;
const source = `const React = globalThis.React; const { useEffect, useId, useRef, useState } = React; const Icon = () => null;\n` + (await readFile(new URL('../src/components/SwipeSlider.tsx', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React } });
const { SwipeSlider } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture() {
  let resize, captures = 0, selected = 0;
  const scrolls = [];
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.document = { documentElement: { dataset: { motion: 'off' } } };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const items = Array.from({ length: 4 }, (_, i) => ({ offsetLeft: 6 + i * 120, focus() { selected = i; }, getBoundingClientRect: () => ({ left: 6 + i * 120, right: 116 + i * 120 }) }));
  const node = {
    clientWidth: 240, scrollWidth: 490, scrollLeft: 0, children: items, dataset: {},
    getBoundingClientRect: () => ({ left: 0, right: 240 }),
    querySelector: () => items[selected], querySelectorAll: () => items,
    scrollBy(options) { scrolls.push(options); }, scrollTo(options) { scrolls.push(options); },
    setPointerCapture() { captures++; }, hasPointerCapture: () => captures > 0,
    releasePointerCapture() { captures--; }, removeAttribute() {},
  };
  return { node, items, scrolls, resize: () => resize(), captures: () => captures, selected: () => selected };
}

test('swipe navigation responds to overflow, selection, keyboard and reduced motion', async () => {
  const f = fixture(); let renderer;
  const render = (selectedKey = 0) => React.createElement(SwipeSlider, { label: 'Looks', selectedKey }, [0,1,2,3].map(i => React.createElement('button', { key: i }, String(i))));
  await act(async () => { renderer = Renderer.create(render(), { createNodeMock: props => props.props.className?.includes('swipe-slider-track') ? f.node : null }); });
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Previous Looks' }).props.disabled, true);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Next Looks' }).props.onClick());
  assert.deepEqual(f.scrolls.at(-1), { left: 180, behavior: 'auto' });
  f.node.scrollLeft = 250;
  await act(async () => f.resize());
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Next Looks' }).props.disabled, true);
  const track = renderer.root.findAllByType('div').find(el => el.props.className?.includes('swipe-slider-track'));
  let prevented = false;
  await act(async () => track.props.onKeyDown({ key: 'End', target: f.items[0], currentTarget: f.node, preventDefault() { prevented = true; } }));
  assert.equal(prevented, true); assert.equal(f.selected(), 3);
  await act(async () => renderer.update(render(3)));
  assert.ok(f.scrolls.at(-1).left > 0);
  assert.equal(f.scrolls.at(-1).behavior, 'auto');
  f.node.scrollWidth = 240; f.node.scrollLeft = 0;
  await act(async () => f.resize());
  assert.equal(renderer.root.findAllByType('button').length, 4);
  await act(async () => renderer.unmount());
});

test('mouse drag suppresses accidental selection while taps and native touch remain usable', async () => {
  const f = fixture(); let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(SwipeSlider, { label: 'Looks' }, React.createElement('button', {}, 'Natural')), { createNodeMock: props => props.props.className?.includes('swipe-slider-track') ? f.node : null }); });
  const track = renderer.root.findAllByType('div').find(el => el.props.className?.includes('swipe-slider-track'));
  const event = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 150, clientY: 20, currentTarget: f.node, preventDefault() {} };
  track.props.onPointerDown(event);
  track.props.onPointerMove({ ...event, clientX: 147 });
  assert.equal(f.captures(), 0);
  track.props.onPointerMove({ ...event, clientX: 80 });
  assert.equal(f.captures(), 1); assert.equal(f.node.scrollLeft, 70);
  track.props.onPointerUp(); assert.equal(f.captures(), 0);
  let blocked = false;
  track.props.onClickCapture({ detail: 1, preventDefault() {}, stopPropagation() { blocked = true; } });
  assert.equal(blocked, true);
  blocked = false;
  track.props.onPointerDown({ ...event, pointerType: 'touch' });
  track.props.onPointerMove({ ...event, pointerType: 'touch', clientX: 50 });
  track.props.onClickCapture({ detail: 1, preventDefault() {}, stopPropagation() { blocked = true; } });
  assert.equal(blocked, false); assert.equal(f.captures(), 0);
  await act(async () => renderer.unmount());
});

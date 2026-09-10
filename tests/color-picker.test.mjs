import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path, transform = (s) => s) {
  const { outputText } = ts.transpileModule(transform(await readFile(new URL(path, import.meta.url), 'utf8')), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const color = await load('../src/utils/color.ts');
test('color conversion round trips colors including black, white and gray', () => {
  for (const hex of ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#808080', '#78f5e3', '#ff87ca']) assert.equal(color.hsvToHex(color.hexToHsv(hex)), hex);
  const base = { h: 10, s: 50, v: 80 };
  assert.deepEqual(color.wheelColor(0, 0, 100, base), { h: 10, s: 0, v: 80 });
  assert.equal(color.wheelColor(200, 0, 100, base).s, 100);
  assert.equal(color.wheelColor(0, -100, 100, base).h, 90);
});
test('picker orders white and black first and supports presets, wheel, brightness, opacity and hex', async () => {
  const { default: React } = await import('react');
  const { default: Renderer, act } = await import('react-test-renderer');
  globalThis.React = React; globalThis.colorUtils = color;
  const { ColorPicker } = await load('../src/components/ColorPicker.tsx', (s) => 'const React = globalThis.React; const { useEffect, useId, useRef, useState } = React; const { clampColor, hexToHsv, hsvToHex, wheelColor } = globalThis.colorUtils;\n' + s.replace(/^import .*;$/gm, ''));
  let value = '#ff0000', opacity = 100, renderer;
  const props = () => ({ label: 'Test color', value, opacity, onChange(next) { value = next; renderer.update(React.createElement(ColorPicker, props())); }, onOpacityChange(next) { opacity = next; renderer.update(React.createElement(ColorPicker, props())); } });
  await act(async () => { renderer = Renderer.create(React.createElement(ColorPicker, props())); });
  await act(async () => renderer.root.findByProps({ className: 'color-picker-trigger' }).props.onClick());
  const presets = renderer.root.findByProps({ 'aria-label': 'Test color presets' }).findAllByType('button');
  assert.deepEqual(presets.slice(0, 2).map((button) => button.props['aria-label']), ['Test color: White', 'Test color: Black']);
  await act(async () => presets[1].props.onClick()); assert.equal(value, '#000000');
  const input = (name) => renderer.root.findByProps({ 'aria-label': `Test color ${name}` });
  await act(async () => input('brightness').props.onChange({ target: { value: '100' } })); assert.equal(value, '#ffffff');
  const target = { closest: () => null, focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
  await act(async () => input('color wheel').props.onPointerDown({ button: 0, pointerId: 1, clientX: 200, clientY: 100, currentTarget: target, preventDefault() {} })); assert.equal(value, '#ff0000');
  await act(async () => input('brightness').props.onChange({ target: { value: '0' } })); assert.equal(value, '#000000');
  await act(async () => input('brightness').props.onChange({ target: { value: '100' } })); assert.equal(value, '#ff0000');
  await act(async () => input('opacity').props.onChange({ target: { value: '35' } })); assert.equal(opacity, 35);
  await act(async () => input('hex').props.onChange({ target: { value: '#0f0' } }));
  await act(async () => input('hex').props.onBlur()); assert.equal(value, '#00ff00');
  await act(async () => input('hex').props.onChange({ target: { value: 'badhex' } }));
  await act(async () => input('hex').props.onBlur()); assert.equal(value, '#00ff00'); assert.equal(input('hex').props['aria-invalid'], true);
  await act(async () => renderer.unmount());
});

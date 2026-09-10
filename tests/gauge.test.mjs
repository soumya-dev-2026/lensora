import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
globalThis.React = React;
const source = `const React = globalThis.React; const { useId, useRef, useState } = React; const Icon = () => null;\n` + (await readFile(new URL('../src/components/GaugeSlider.tsx', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React } });
const { GaugeSlider, gaugeValue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('gauge maps the arc to bounded, stepped values including signed ranges and the bottom gap', () => {
  const at = (degrees, min = 0, max = 100, step = 1) => gaugeValue(Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180), min, max, step);
  assert.equal(at(135), 0);
  assert.equal(at(270), 50);
  assert.equal(at(45), 100);
  assert.equal(at(100), 0);
  assert.equal(at(80), 100);
  assert.equal(at(270, -100, 100), 0);
  assert.equal(at(270, 0.1, 0.9, 0.1), 0.5);
  for (let degrees = 0; degrees < 360; degrees++) assert.ok(at(degrees) >= 0 && at(degrees) <= 100);
});

test('dial drag captures one pointer, cancels cleanly, and respects disabled fieldsets', async () => {
  const values = [];
  let disabled = false, focused = false, captured = false;
  let renderer;
  await act(async () => { renderer = Renderer.create(React.createElement(GaugeSlider, { label: 'Strength', value: 50, onChange: (value) => values.push(value) }), { createNodeMock: () => ({ matches: () => disabled, focus: () => { focused = true; } }) }); });
  const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }), setPointerCapture() { captured = true; }, hasPointerCapture: () => captured, releasePointerCapture() { captured = false; } };
  const event = (x, y, pointerId = 1) => ({ button: 0, pointerId, clientX: x, clientY: y, currentTarget: target, preventDefault() {} });
  const dial = renderer.root.findByProps({ className: 'gauge-dial' });
  await act(async () => dial.props.onPointerDown(event(100, 0)));
  assert.equal(focused, true); assert.equal(captured, true); assert.deepEqual(values, [50]);
  await act(async () => dial.props.onPointerMove(event(200, 100, 2)));
  assert.deepEqual(values, [50]);
  await act(async () => dial.props.onPointerMove(event(200, 100)));
  assert.equal(values.at(-1), 83);
  await act(async () => dial.props.onPointerCancel());
  await act(async () => dial.props.onPointerMove(event(0, 100)));
  assert.equal(values.length, 2);
  disabled = true;
  await act(async () => dial.props.onPointerDown(event(0, 100)));
  assert.equal(values.length, 2);
  await act(async () => renderer.unmount());
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const { outputText } = ts.transpileModule(await readFile(new URL('../src/rendering/liveText.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } });
const { DEFAULT_LIVE_TEXT, TEXT_FONTS, drawLiveText, liveTextLayout } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
function fixture() {
  const calls = [];
  const ctx = { font: '10px Arial', globalAlpha: 1, fillStyle: '#000',
    measureText(text) { return { width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)[1]) * .6 }; },
    save() { this.saved = { font: this.font, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle }; },
    restore() { Object.assign(this, this.saved); },
    fillText(text, x, y) { calls.push({ text, x, y, color: this.fillStyle, opacity: this.globalAlpha, align: this.textAlign, font: this.font }); },
  };
  return { ctx, calls };
}
test('live text draws color, opacity and selected font into the output context', () => {
  const { ctx, calls } = fixture();
  drawLiveText(ctx, { ...DEFAULT_LIVE_TEXT, enabled: true, text: 'Live caption', font: 'italic', color: '#ff0088', opacity: 35 }, 1280, 720);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].color, '#ff0088');
  assert.equal(calls[0].opacity, .35);
  assert.match(calls[0].font, /italic 400 48px Georgia/);
  assert.deepEqual([calls[0].x, calls[0].y], [640, 540]);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.fillStyle, '#000');
});
test('disabled, blank and fully transparent text do not alter the recorded frame', () => {
  const { ctx, calls } = fixture();
  for (const patch of [{ enabled: false }, { enabled: true, text: ' \n' }, { enabled: true, opacity: 0 }]) drawLiveText(ctx, { ...DEFAULT_LIVE_TEXT, ...patch }, 720, 1280);
  assert.equal(calls.length, 0);
});
test('captions stay within landscape, portrait and square canvases at all drag edges', () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [1280, 1280]]) {
    for (const [x, y] of [[-50, -50], [150, 150]]) {
      const { ctx } = fixture();
      const box = liveTextLayout(ctx, { ...DEFAULT_LIVE_TEXT, text: 'A long live caption '.repeat(12), size: 120, x, y }, width, height);
      assert.ok(box.x - box.width / 2 >= -.001);
      assert.ok(box.y - box.height / 2 >= -.001);
      assert.ok(box.x + box.width / 2 <= width + .001);
      assert.ok(box.y + box.height / 2 <= height + .001);
      assert.ok(box.lines.length > 1);
    }
  }
});
test('newlines and long unbroken text fit without clipping', () => {
  const { ctx } = fixture();
  const box = liveTextLayout(ctx, { ...DEFAULT_LIVE_TEXT, text: 'Title\n' + 'W'.repeat(200), size: 120 }, 720, 1280);
  assert.equal(box.lines[0], 'Title');
  assert.ok(box.lines.every((line) => ctx.measureText(line).width <= 720 * .9));
  assert.ok(box.height <= 1280 * .9);
});
test('all font choices resolve to distinct canvas font declarations', () => {
  const { ctx } = fixture();
  const fonts = TEXT_FONTS.map(({ id }) => liveTextLayout(ctx, { ...DEFAULT_LIVE_TEXT, font: id }, 1280, 720).font);
  assert.equal(new Set(fonts).size, TEXT_FONTS.length);
});

test('multiline alignment uses the text block edges without changing its position', () => {
  for (const align of ['left', 'center', 'right']) {
    const { ctx, calls } = fixture();
    const value = { ...DEFAULT_LIVE_TEXT, enabled: true, text: 'Long caption\nShort', align };
    const box = liveTextLayout(ctx, value, 1280, 720);
    drawLiveText(ctx, value, 1280, 720);
    const expected = align === 'left' ? box.x - box.width / 2 + box.padding
      : align === 'right' ? box.x + box.width / 2 - box.padding : box.x;
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.align === align && call.x === expected));
    assert.equal(box.x, 640);
  }
});

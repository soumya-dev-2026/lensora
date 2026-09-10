import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/nativeDownloads.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
});
const { installNativeDownloads } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('native exports intercept blob links, write binary chunks, and share a file URI', async () => {
  let handler;
  let native = false;
  const written = [];
  globalThis.Capacitor = { isNativePlatform: () => native };
  globalThis.document = { addEventListener: (_type, fn) => { handler = fn; } };
  installNativeDownloads();
  assert.equal(handler, undefined, 'web downloads are untouched');
  native = true;
  installNativeDownloads();
  globalThis.Element = class {};
  globalThis.HTMLAnchorElement = class extends Element {
    href = 'blob:recording'; download = 'my/video.mp4';
    closest() { return this; }
  };
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(173);
  globalThis.fetch = async () => ({ blob: async () => new Blob([bytes]) });
  globalThis.FileReader = class {
    readAsDataURL(blob) { void blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload();
    }); }
  };
  globalThis.Directory = { Cache: 'CACHE' };
  globalThis.Filesystem = {
    writeFile: async (options) => written.push(options),
    appendFile: async (options) => written.push(options),
    getUri: async ({ path }) => ({ uri: `file:///cache/${path}` }),
  };
  let done;
  const shared = new Promise((resolve) => { done = resolve; });
  globalThis.Share = { share: async (options) => done(options) };
  let prevented = false;
  handler({ target: new HTMLAnchorElement(), preventDefault() { prevented = true; } });
  const result = await shared;
  assert.equal(prevented, true);
  assert.equal(written.length, 2);
  assert.deepEqual(Buffer.concat(written.map(({ data }) => Buffer.from(data, 'base64'))), Buffer.from(bytes));
  assert.match(result.files[0], /^file:\/\/\/cache\/exports\/\d+\/my_video.mp4$/);
});

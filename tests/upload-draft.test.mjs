import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';

function store() {
  const records = new Map();
  const storage = { get: async key => records.get(key), put: async (key, value) => records.set(key, structuredClone(value)), remove: async key => records.delete(key) };
  const context = vm.createContext({ window: {}, Date });
  vm.runInContext(readFileSync(new URL('../public/js/upload-draft.js', import.meta.url), 'utf8'), context);
  return { create: (key, now = Date.now) => context.window.GoshareDraft.create(key, storage, now), records };
}

test('a pending file survives a new page instance before parsing completes', async () => {
  const { create } = store();
  const file = new Blob(['document']);
  await create('tab-a').save({ pendingFile: file, name: '文档.docx' });
  const restored = await create('tab-a').load();
  assert.equal(await restored.pendingFile.text(), 'document');
  assert.equal(restored.name, '文档.docx');
});

test('parsed content and generated graphs survive reload without retaining the original file', async () => {
  const { create } = store();
  await create('tab-a').save({ pendingFile: new Blob(['document']) });
  await create('tab-a').save({ content: '<p>原文</p><pre data-goshare-diagram="mindmap">graph</pre>', codeType: 'docx', name: '文档.docx', markdownTheme: 'clean' });
  const restored = await create('tab-a').load();
  assert.match(restored.content, /data-goshare-diagram/);
  assert.equal(restored.codeType, 'docx');
  assert.equal(restored.pendingFile, undefined);
});

test('drafts are isolated by tab and expire after 24 hours; clearing removes them', async () => {
  const { create, records } = store();
  await create('tab-a', () => 1000).save({ content: 'a', codeType: 'markdown' });
  assert.equal(await create('tab-b').load(), null);
  assert.equal(await create('tab-a', () => 86401001).load(), null);
  assert.equal(records.size, 0);
  await create('tab-a').save({ content: 'a' });
  await create('tab-a').clear();
  assert.equal(await create('tab-a').load(), null);
});

test('ordered writes and clear cannot resurrect an old draft', async () => {
  const { create } = store();
  const draft = create('tab-a');
  await Promise.all([draft.save({ content: 'old' }), draft.save({ content: 'latest' })]);
  assert.equal((await draft.load()).content, 'latest');
  await Promise.all([draft.save({ content: 'pending' }), draft.clear()]);
  assert.equal(await draft.load(), null);
});

test('homepage cannot cache obsolete workflow markup across deployments', async () => {
  const response = await worker.fetch(new Request('https://example.com/'), { AUTH_ENABLED: 'false', DB: {}, CONTENT_BUCKET: {} });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const html = await response.text();
  assert.match(html, /id="upload-resume"/);
  assert.match(html, /upload-draft\.js\?v=upload-recovery-v1/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function page(selectedFile, savedDraft = null) {
  const elements = new Map(), opened = [], writes = [];
  let ready, loads = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', style: {}, dataset: {}, files: [], hidden: true,
      classList: { add() {}, remove() {} }, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      querySelector: () => null,
    });
    return elements.get(id);
  };
  if (selectedFile) element('html-file').files = [selectedFile];
  const context = vm.createContext({
    document: { getElementById: element, addEventListener(name, callback) { if (name === 'DOMContentLoaded') ready = callback; }, querySelector: () => null },
    window: {
      location: { pathname: '/', origin: 'https://example.com' }, addEventListener() {},
      GoshareDraft: { create: () => ({ load: async () => { loads++; return savedDraft; }, save: async draft => writes.push(draft), clear: async () => {} }) },
      GoshareShare: { createPublisher: () => ({}) },
      GoshareWorkflow: { create: () => ({ reset() {}, startFile: (...args) => opened.push(args) }) },
    },
    FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
    sessionStorage: { getItem: () => 'test-tab', setItem() {} },
    console: { log() {}, error() {} }, setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8'), context);
  return { element, opened, writes, init: () => ready(), loads: () => loads };
}
const file = { name: '文档.md', size: 16, content: '# 测试文档\n\n正文' };
const settle = () => new Promise(setImmediate);

test('a file selected before scripts initialize is imported once and opens success workflow', async () => {
  const p = page(file, { content: '旧草稿', codeType: 'markdown' });
  p.init(); await settle();
  assert.equal(p.element('html-input').value, file.content);
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0][0], file.name);
  assert.equal(p.loads(), 0, 'a newly selected file takes priority over an older draft');
  assert.equal(p.writes[0].pendingFile, file);
  assert.equal(p.writes.at(-1).content, file.content);
});

test('ordinary selection after initialization still imports and restores action controls', async () => {
  const p = page(); p.init(); await settle();
  p.element('html-file').listeners.change({ target: { files: [file] } }); await settle();
  assert.equal(p.element('html-input').value, file.content);
  assert.equal(p.opened.length, 1);
  assert.equal(p.element('html-file').disabled, false);
  assert.equal(p.element('upload-resume').hidden, false);
});

test('when no new file is selected, startup recovers the saved draft', async () => {
  const p = page(null, { content: '# 已保存正文', codeType: 'markdown', name: '原文件.md' });
  p.init(); await settle();
  assert.equal(p.element('html-input').value, '# 已保存正文');
  assert.equal(p.opened[0][0], '原文件.md');
  assert.equal(p.element('workflow-title').textContent, '已恢复上传文件');
});

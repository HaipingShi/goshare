import assert from 'node:assert/strict';
import { test } from 'node:test';
import mammoth from 'mammoth';
import { zipSync, strToU8 } from 'fflate';
import { docxFixture } from './fixtures/docx.mjs';
import { validateDocxArchive, convertDocx } from '../src/docx-import.js';
import { sanitizeDocxContent } from '../src/docx-content.js';
import { renderContent, normalizeContentForRendering } from '../src/renderers.js';
import worker from '../src/worker.js';

test('real DOCX preserves English/Chinese headings, paragraphs, nested/ordered lists, merged tables, and embedded images', async () => {
  const bytes = docxFixture();
  validateDocxArchive(bytes);
  const result = await convertDocx({ buffer: Buffer.from(bytes) }, mammoth);
  assert.deepEqual(result.warnings, []);
  const html = sanitizeDocxContent(result.html);
  assert.match(html, /<h1>DOCX 学习计划<\/h1>/);
  assert.match(html, /<h2>实践与复盘<\/h2>/);
  assert.match(html, /真实项目/);
  assert.match(html, /<ul><li>先理解要解决的问题<ul><li>确认目标和验收标准/);
  assert.match(html, /<ol><li>选择一个真实项目练习/);
  assert.match(html, /<table><thead><tr><th><p>阶段/);
  assert.match(html, /<td colspan="2"><p>每个阶段都需要团队反馈/);
  assert.match(html, /<img[^>]+src="data:image\/png;base64,/);
  assert.match(html, /alt="学习循环示意图"/);
  const normalized = normalizeContentForRendering(html, 'docx');
  assert.equal(normalized.contentType, 'docx');
  const rendered = await renderContent(normalized.content, 'docx', { markdownTheme: 'github' });
  assert.match(rendered, /data-article-content/);
  assert.match(rendered, /article-ai-analyze/);
  assert.match(rendered, /article-map-open/);
  assert.match(rendered, /markdown-theme-github/);
  assert(rendered.includes(html));
});

test('invalid archives, ordinary ZIPs, encrypted entries, oversized expansion and forged sizes are rejected', () => {
  assert.throws(() => validateDocxArchive(strToU8('not docx')), /DOCX/);
  assert.throws(() => validateDocxArchive(zipSync({ 'index.html': strToU8('<h1>site</h1>') })), /DOCX/);
  assert.throws(() => validateDocxArchive(new Uint8Array(10 * 1024 * 1024 + 1)), RangeError);
  assert.throws(() => validateDocxArchive(docxFixture({ 'huge.xml': new Uint8Array(21 * 1024 * 1024) })), RangeError);
  assert.throws(() => validateDocxArchive(docxFixture({ '../unsafe.xml': strToU8('unsafe') })), /路径/);
  const encrypted = docxFixture();
  const view = new DataView(encrypted.buffer);
  const central = view.getUint32(encrypted.length - 6, true);
  view.setUint16(central + 8, 1, true);
  assert.throws(() => validateDocxArchive(encrypted), /加密/);
  const forged = docxFixture();
  const forgedView = new DataView(forged.buffer);
  forgedView.setUint32(forgedView.getUint32(forged.length - 6, true) + 24, 1, true);
  forgedView.setUint32(22, 1, true);
  assert.throws(() => validateDocxArchive(forged), /解压|大小|目录/);
  const mismatched = docxFixture();
  const mismatchedView = new DataView(mismatched.buffer);
  mismatchedView.setUint16(mismatchedView.getUint32(mismatched.length - 6, true) + 10, 0, true);
  assert.throws(() => validateDocxArchive(mismatched), /目录/);
});

test('DOCX uses article analysis rather than rewriting images through generic beautification', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/pages/beautify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ htmlContent: '<h1>DOCX</h1><p>正文</p>', codeType: 'docx' }),
  }), { AUTH_ENABLED: 'false', AI_ENABLED: 'true', CONTENT_BUCKET: {}, DB: { prepare() { throw new Error('Must not charge quota'); } }, AI: { run() { throw new Error('Must not rewrite original content'); } } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /AI 分析全文/);
});

test('server sanitizer strips executable tags, events, CSS, remote/SVG images, unsafe links and DOM clobbering IDs', () => {
  const html = sanitizeDocxContent('<h1 onclick="alert(1)">标题</h1><script>alert(1)</script><iframe src="/admin"></iframe><svg><script>bad()</script></svg><p style="position:fixed">正文</p><a id="article-toolbar" href="javascript:alert(1)">链接</a><img src="https://example.com/tracker.png"/><img src="data:image/svg+xml;base64,PHN2Zz4="/><img alt="保留" src="data:image/png;base64,YQ=="/><a id="footnote-1" href="#footnote-ref-1">脚注</a>');
  assert(!/script|iframe|svg|onclick|position|javascript|tracker|article-toolbar/.test(html));
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /data:image\/png/);
  assert.match(html, /id="footnote-1"/);
});

test('DOCX preview supports image-heavy imports above 512KB and rejects results above 10MB', async () => {
  const env = { AUTH_ENABLED: 'false', AI_ENABLED: 'false', DB: {}, CONTENT_BUCKET: {} };
  const preview = (content, codeType = 'docx') => worker.fetch(new Request('https://example.com/api/pages/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ htmlContent: content, codeType }),
  }), env);
  const content = `<h1>标题</h1><p><img src="data:image/png;base64,${'YQAA'.repeat(150000)}"/></p><p>正文</p>`;
  const response = await preview(content);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.codeType, 'docx');
  assert.match(result.html, /data:image\/png/);
  assert.equal((await preview(content, 'markdown')).status, 413);
  assert.equal((await preview('x'.repeat(10 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await preview('<script>alert(1)</script>')).status, 400);
});

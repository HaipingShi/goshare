import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { detectCodeType, renderContent } from '../src/renderers.js';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../public/js/article-reader.js', import.meta.url), 'utf8'), context);
const { buildOutline, buildMindmap } = context.GoshareArticle;

test('outline handles skipped heading levels, repeated titles, and sibling sections', () => {
  const roots = buildOutline([
    { id: 'one', text: '文章', level: 1 },
    { id: 'two', text: '背景', level: 3 },
    { id: 'three', text: '背景', level: 2 },
    { id: 'four', text: '细节', level: 4 },
    { id: 'five', text: '第二篇', level: 1 },
  ]);
  assert.equal(roots.length, 2);
  assert.deepEqual(Array.from(roots[0].children, (node) => node.id), ['two', 'three']);
  assert.equal(roots[0].children[1].children[0].id, 'four');
  assert.deepEqual(Array.from(buildOutline([])), []);
});

test('mindmap labels cannot inject diagram nodes or markup', () => {
  const roots = buildOutline([{ id: 'one', text: '标题 "引号" <img> & 内容\n新行', level: 2 }]);
  const map = buildMindmap(roots, '目录');
  assert.equal(map.source.split('\n').length, 3);
  assert.match(map.source, /#quot;引号#quot;/);
  assert.match(map.source, /#60;img#62;/);
  assert(!map.source.includes('<img>'));
});

test('large mindmaps retain broad branches before deep children', () => {
  const first = { id: 'first', text: '第一章', level: 2, children: [] };
  let parent = first;
  for (let i = 0; i < 130; i++) {
    const child = { id: `deep-${i}`, text: `深层节点 ${i}`, level: 3, children: [] };
    parent.children.push(child);
    parent = child;
  }
  const map = buildMindmap([first, { id: 'last', text: '最后一章', level: 2, children: [] }], '文章', 120);
  assert.equal(map.count, 120);
  assert.match(map.source, /最后一章/);
  assert(!map.source.includes('深层节点 129'));
});

test('pure Mermaid mindmaps and timelines are detected', () => {
  assert.equal(detectCodeType('mindmap\n  root((知识))\n    目录\n    导图'), 'mermaid');
  assert.equal(detectCodeType('timeline\n  title 项目\n  2026 : 发布'), 'mermaid');
});

test('an article starting with a diagram retains following text and headings', async () => {
  const content = '```mermaid\nflowchart LR\n A-->B\n```\n\n# 阅读说明\n\n正文不能丢失。';
  assert.equal(detectCodeType(content), 'markdown');
  const html = await renderContent(content, detectCodeType(content));
  assert.match(html, /正文不能丢失/);
  assert.match(html, /data-article-content/);
});

test('a diagram keyword inside prose does not turn the whole article into a diagram', async () => {
  const html = await renderContent('# 图表指南\n\nmindmap 是思维导图的关键词。\n\n## 继续阅读\n\n文章结尾', 'markdown');
  assert.match(html, /article-section-2/);
  assert.match(html, /文章结尾/);
  assert(!html.includes('<div class="mermaid">'));
});

test('Markdown retains article text and renders embedded diagrams with shared reader controls', async () => {
  const html = await renderContent('# 文档\n\n正文\n\n## 背景\n\n```mermaid\nflowchart LR\n A-->B\n```\n\n## 总结\n\n结论', 'markdown', { markdownTheme: 'docs' });
  assert.match(html, /data-article-content/);
  assert.match(html, /<h1 id="article-section-1">文档<\/h1>/);
  assert.match(html, /<h2 id="article-section-3">总结<\/h2>/);
  assert.match(html, /id="article-outline-search"/);
  assert.match(html, /id="article-map-dialog"/);
  assert.match(html, /<div class="mermaid">flowchart LR/);
  assert.match(html, /正文/);
  assert.match(html, /结论/);
  assert.match(html, /\/js\/diagram-viewer.js/);
  assert.match(html, /\/js\/article-reader.js/);
  assert(!html.includes('setTimeout'));
});

test('an explicitly labelled programming code block is not turned into a diagram', async () => {
  const html = await renderContent('# 示例\n\n```text\nmindmap\n  example\n```', 'markdown');
  assert.match(html, /language-text/);
  assert(!html.includes('<div class="mermaid">'));
});

test('standalone Mermaid uses the same renderer and keeps escaped source', async () => {
  const html = await renderContent('mindmap\n root((学习))\n  阅读\n  实践', 'mermaid');
  assert.match(html, /\/js\/diagram-viewer.js/);
  assert.match(html, /class="mermaid"/);
  assert(!html.includes('securityLevel: \'loose\''));
  assert(!html.includes('mermaid.initialize'));
});

test('standalone Mermaid accepts Windows line endings and fenced source', async () => {
  const source = '```mermaid\r\nmindmap\r\n root((学习))\r\n  阅读\r\n```';
  const html = await renderContent(source, 'mermaid');
  assert.match(html, /root\(\(学习\)\)/);
  assert(!html.includes('```'));
});

test('Markdown renderer settings do not leak across themes or concurrent requests', async () => {
  const pages = await Promise.all(['docs', 'github', 'note'].map((markdownTheme) => renderContent('# 标题\n\n正文', 'markdown', { markdownTheme })));
  ['docs', 'github', 'note'].forEach((theme, i) => assert.match(pages[i], new RegExp(`markdown-theme-${theme}`)));
});

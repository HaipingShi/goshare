import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMindmap, composeArticle, stripArtifacts, buildRelationGraph, label, readArtifacts } from '../src/article-graphs.js';
import { validateDiagramKinds, validateArticleDiagrams } from '../src/article-analysis.js';
import { sanitizeDocxContent } from '../src/docx-content.js';
import { renderContent } from '../src/renderers.js';
import { extractArticleSource } from '../src/article-source.js';
import worker from '../src/worker.js';

const blocks = [{ id: 'block-1', text: '上传文档，然后解析并存储。' }, { id: 'block-2', text: '解析结果存入对象存储，元数据存入数据库。' }];
const analysis = { title: '文档处理', summary: '上传、解析与存储。', nodes: [{ title: '上传', summary: '上传原始文件', blockId: 'block-1', children: [{ title: '解析与存储', summary: '保存解析结果', blockId: 'block-2', children: [] }] }] };
const graph = { kind: 'flowchart', nodes: [{ id: 'n1', title: '上传文件', blockId: 'block-1' }, { id: 'n2', title: '解析', blockId: 'block-1' }], edges: [{ from: 'n1', to: 'n2', label: '处理', blockId: 'block-1' }] };

test('dense semantic outlines produce bounded, neutral, layered graphs with wrapped labels', () => {
  const roots = Array.from({ length: 8 }, (_, i) => ({ title: `主题 ${i}`, children: Array.from({ length: 9 }, (_, j) => ({ title: `这是一段过长的节点标题 ${i} ${j}`, children: [] })) }));
  const balanced = buildMindmap(roots, '清单');
  const compact = buildMindmap(roots, '清单', 24, 'compact');
  assert.equal(balanced.count, 24);
  assert.equal(compact.count, 18);
  assert.match(balanced.source, /^flowchart LR/);
  assert.match(balanced.source, /<br\/>/);
  assert.match(balanced.source, /color:#20334d/);
  assert(!balanced.source.includes('主题 6'));
  assert(!balanced.source.includes('classDef root '));
  assert.equal(label('Cloudflare Worker', 12), 'Cloudflare<br/>Worker');
});

test('diagram schema rejects invented node IDs and evidence while supporting honest unavailable results', () => {
  assert.deepEqual(validateDiagramKinds(['mindmap', 'flowchart', 'mindmap']), ['mindmap', 'flowchart']);
  assert.throws(() => validateDiagramKinds(['script']));
  assert.equal(validateArticleDiagrams([graph], blocks, ['flowchart'])[0].edges.length, 1);
  assert.throws(() => validateArticleDiagrams([{ ...graph, edges: [{ ...graph.edges[0], to: 'n999' }] }], blocks, ['flowchart']));
  assert.throws(() => validateArticleDiagrams([{ ...graph, nodes: [{ ...graph.nodes[0], blockId: 'block-999' }] }], blocks, ['flowchart']));
  assert.equal(validateArticleDiagrams([{ kind: 'architecture', unavailableReason: '原文没有系统组件关系' }], blocks, ['architecture'])[0].unavailableReason, '原文没有系统组件关系');
  assert.match(buildRelationGraph(graph), /n0 -->\|"处理"\| n1/);
});

test('relation graphs accept bounded symbolic IDs and still reject unsafe or duplicate IDs', () => {
  const architecture = { ...graph, kind: 'architecture', nodes: graph.nodes.map((node, i) => ({ ...node, id: `a${i + 1}` })), edges: [{ ...graph.edges[0], from: 'a1', to: 'a2' }] };
  const validated = validateArticleDiagrams([architecture], blocks, ['architecture'])[0];
  assert.equal(validated.nodes[0].id, 'a1');
  assert.match(buildRelationGraph(validated), /n0 -->\|"处理"\| n1/);
  for (const id of ['a1', 'bad\" --> injected', 'x'.repeat(33)]) {
    assert.throws(() => validateArticleDiagrams([{ ...architecture, nodes: [architecture.nodes[0], { ...architecture.nodes[1], id }] }], blocks, ['architecture']));
  }
});

test('generated analysis and graphs survive DOCX sanitization and remain separate from original evidence', async () => {
  const original = '<h1>文档处理</h1><p>上传文档，然后解析并存储。</p><table><tr><td>解析结果</td><td>对象存储</td></tr></table><p><img alt="结构示意" src="data:image/png;base64,YQ==" /></p>';
  const content = composeArticle(original, { ...analysis, diagrams: [graph] }, ['mindmap', 'flowchart']);
  assert.equal(readArtifacts(content).analysis.title, analysis.title);
  assert.deepEqual(readArtifacts(content).kinds, ['mindmap', 'flowchart']);
  const safe = sanitizeDocxContent(content);
  assert.equal((safe.match(/data-goshare-diagram=/g) || []).length, 2);
  assert.match(safe, /data-goshare-analysis="v1"/);
  assert.match(safe, /data:image\/png/);
  const source = extractArticleSource(await renderContent(safe, 'docx'));
  assert.equal(source.blocks.length, 4);
  assert.equal(source.blocks[2].id, 'block-3');
  assert.match(source.blocks[2].text, /解析结果.*对象存储/);
  assert.match(source.blocks[3].text, /结构示意/);
  assert(!source.blocks.some(block => block.text.includes('classDef')));
  assert.equal(stripArtifacts(content), original);
  assert.equal((composeArticle(content, analysis, ['mindmap']).match(/data-goshare-diagram=/g) || []).length, 1);
});

test('Markdown graph artifacts preserve original paragraph IDs and heading structure', async () => {
  const source = extractArticleSource(await renderContent(composeArticle('# 上传\n\n正文\n\n## 解析\n\n另一个段落', analysis, ['mindmap']), 'markdown'));
  assert.deepEqual(source.blocks.map(block => block.id), ['block-1', 'block-2', 'block-3', 'block-4']);
  assert.equal(source.headingAnalysis.nodes[0].children[0].title, '解析');
});

test('article source endpoint is authenticated and never consumes an AI call', async () => {
  const request = () => new Request('https://example.com/api/pages/article-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeType: 'markdown', htmlContent: '# 标题\n\n正文' }) });
  const env = { AUTH_ENABLED: 'false', DB: {}, CONTENT_BUCKET: {}, AI: { run() { throw new Error('Must not call AI'); } } };
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).blocks.length, 2);
  assert.equal((await worker.fetch(request(), { ...env, AUTH_ENABLED: 'true' })).status, 401);
});

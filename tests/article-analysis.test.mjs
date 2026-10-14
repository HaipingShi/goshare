import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/worker.js';
import { validateArticleBlocks, validateArticleAnalysis, buildArticleAnalysisPrompt } from '../src/article-analysis.js';

const blocks = [{ id: 'block-1', text: '学习从理解问题开始。' }, { id: 'block-2', text: '实践与复盘帮助形成可迁移的经验。' }];
const analysis = { title: '学习方法', summary: '以问题为起点，通过实践和复盘积累经验。', nodes: [
  { title: '建立学习闭环', summary: '理解问题后实践，并持续复盘。', blockId: 'block-1', children: [
    { title: '经验迁移', summary: '通过复盘形成可复用的方法。', blockId: 'block-2', children: [] },
  ] },
] };

test('AI input includes all paragraphs, including articles without headings', () => {
  const validated = validateArticleBlocks(blocks);
  const prompt = buildArticleAnalysisPrompt(validated);
  blocks.forEach((block) => assert(prompt.includes(block.text) && prompt.includes(block.id)));
  assert.match(prompt, /Do not merely copy/);
  assert.match(prompt, /untrusted source data/);
});

test('invalid or oversized articles are rejected rather than silently truncated', () => {
  assert.throws(() => validateArticleBlocks([]));
  assert.throws(() => validateArticleBlocks([blocks[0], blocks[0]]));
  assert.throws(() => validateArticleBlocks([{ id: 'block-1', text: 'x'.repeat(65537) }]), RangeError);
  assert.throws(() => validateArticleBlocks([{ id: 'https://example.com', text: 'text' }]));
});

test('AI hierarchy preserves real source references and strips extra output fields', () => {
  const result = validateArticleAnalysis({ ...analysis, script: 'untrusted' }, blocks);
  assert.equal(result.nodeCount, 2);
  assert.equal(result.nodes[0].children[0].blockId, 'block-2');
  assert(!('script' in result));
});

test('hallucinated source IDs, empty results, excessive nodes, and excessive depth fail validation', () => {
  assert.throws(() => validateArticleAnalysis({ ...analysis, nodes: [{ ...analysis.nodes[0], blockId: 'block-999' }] }, blocks));
  assert.throws(() => validateArticleAnalysis({ ...analysis, nodes: [] }, blocks));
  assert.throws(() => validateArticleAnalysis({ ...analysis, nodes: Array.from({ length: 61 }, () => ({ ...analysis.nodes[0], children: [] })) }, blocks));
  const deep = { ...analysis.nodes[0], children: [] };
  let parent = deep;
  for (let i = 0; i < 4; i++) {
    const child = { ...analysis.nodes[0], children: [] };
    parent.children.push(child);
    parent = child;
  }
  assert.throws(() => validateArticleAnalysis({ ...analysis, nodes: [deep] }, blocks));
});

function environment(overrides = {}) {
  let calls = 0;
  const env = {
    AUTH_ENABLED: 'false', AI_ENABLED: 'true', DAILY_AI_LIMIT: '0',
    DB: { prepare() { return { bind() { return this; }, first: async () => ({ count: 3 }), run: async () => ({}) }; } },
    CONTENT_BUCKET: {}, AI: { async run() { calls++; return { response: JSON.stringify(analysis) }; } },
    ...overrides,
  };
  return { env, calls: () => calls };
}
function request(body = { blocks }) {
  return new Request('https://example.com/api/pages/article-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('analysis endpoint returns validated semantic nodes and quota', async () => {
  const { env, calls } = environment();
  const response = await worker.fetch(request(), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.analysis.nodeCount, 2);
  assert.equal(calls(), 1);
  assert.equal(result.quota.unlimited, true);
});

test('authentication, AI disablement, and exhausted quota stop the model call', async () => {
  for (const [settings, status] of [[{ AUTH_ENABLED: 'true' }, 401], [{ AI_ENABLED: 'false' }, 403], [{ DAILY_AI_LIMIT: '3' }, 429]]) {
    const { env, calls } = environment(settings);
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, status);
    assert.equal(calls(), 0);
  }
});

test('invalid input is rejected before charging quota or calling AI', async () => {
  const { env, calls } = environment({ DB: { prepare() { throw new Error('Quota must not be touched'); } }, DAILY_AI_LIMIT: '3' });
  const response = await worker.fetch(request({ blocks: [{ id: 'block-1', text: 'x'.repeat(65537) }] }), env);
  assert.equal(response.status, 413);
  assert.equal(calls(), 0);
});

test('model failures and invented references return a recoverable error', async () => {
  const { env } = environment({ AI: { async run() { return { response: JSON.stringify({ ...analysis, nodes: [{ ...analysis.nodes[0], blockId: 'block-999' }] }) }; } } });
  const response = await worker.fetch(request(), env);
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.error.code, 'AI_ANALYSIS_FAILED');
  assert.equal(result.error.retryable, true);
});

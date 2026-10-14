import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotaDatabase } from './fixtures/d1.mjs';
import { reserveAi, settleAi, getAiUsage, runMeteredAi, reserveEstimate, aiBudget } from '../src/ai-quota.js';
import { generateShareMetadata } from '../src/worker.js';

const model = '@cf/zai-org/glm-4.7-flash';
const options = { messages: [{ role: 'user', content: '测试' }], max_completion_tokens: 512 };
const environment = overrides => ({ DB: quotaDatabase(), DAILY_AI_LIMIT: '50', ...overrides });

test('parallel reservations cannot overspend personal or whole-site limits', async () => {
  const env = environment({ DAILY_AI_LIMIT: '1' });
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveAi(env, 'ai:visitor', model, options)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'QUOTA_EXCEEDED'));
  const globalEnv = environment({ DAILY_AI_NEURON_BUDGET: String(reserveEstimate(model, options) / 1000) });
  const globalResults = await Promise.allSettled(['a', 'b'].map(scope => reserveAi(globalEnv, scope, model, options)));
  assert.equal(globalResults.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(globalResults.find(r => r.status === 'rejected').reason.code, 'AI_BUDGET_EXCEEDED');
});

test('failure refunds personal quota but accounts for consumed or uncertain Cloudflare compute', async () => {
  for (const mode of ['throw', 'invalid']) {
    const env = environment({ AI: { async run() { if (mode === 'throw') throw new Error('upstream'); return { usage: { neurons: 9.25 } }; } } });
    await assert.rejects(runMeteredAi(env, 'ai:v', model, options, () => { throw new Error('validation'); }));
    const state = await getAiUsage(env, 'ai:v');
    assert.equal(state.quota.used, 0);
    assert.equal(state.quota.reserved, 0);
    assert.equal(state.quota.remaining, 50);
    assert.equal(state.budget.reserved, 0);
    assert.equal(state.budget.used, mode === 'throw' ? reserveEstimate(model, options) / 1000 : 9.25);
  }
});

test('successful requests settle actual usage once and release unused reservations', async () => {
  const env = environment();
  const reservation = await reserveAi(env, 'ai:v', model, options);
  await settleAi(env, reservation, true, { usage: { neurons: 2 } });
  await settleAi(env, reservation, true, { usage: { neurons: 2 } });
  const state = await getAiUsage(env, 'ai:v');
  assert.equal(state.quota.used, 1);
  assert.equal(state.quota.reserved, 0);
  assert.equal(state.budget.used, 2);
  assert.equal(state.budget.reserved, 0);
});

test('unknown usage stays conservative, unsupported models and invalid budget settings cannot bypass protection', async () => {
  const env = environment();
  const r = await reserveAi(env, 'ai:v', model, options);
  await settleAi(env, r, true, {});
  assert.equal((await getAiUsage(env, 'ai:v')).budget.used, r.estimate / 1000);
  await assert.rejects(reserveAi(env, 'ai:v', 'unknown-model', options), e => e.code === 'AI_MODEL_BUDGET_UNSUPPORTED');
  assert.equal(aiBudget({ DAILY_AI_NEURON_BUDGET: '0' }), 8000);
  assert.equal(aiBudget({ DAILY_AI_NEURON_BUDGET: '100000' }), 10000);
});

test('settlement stays in the reservation UTC day and does not debit the new day', async () => {
  const env = environment();
  const r = await reserveAi(env, 'ai:v', model, options);
  env.DB.sqlite.exec("UPDATE ai_daily_usage SET day='2000-01-01'; UPDATE ai_budget_usage SET day='2000-01-01'; UPDATE ai_requests SET day='2000-01-01'");
  await settleAi(env, { ...r, day: '2000-01-01' }, false, { usage: { neurons: 1 } });
  assert.equal((await getAiUsage(env, 'ai:v')).budget.used, 0);
  const old = await getAiUsage(env, 'ai:v', '2000-01-01');
  assert.equal(old.budget.used, 1);
  assert.equal(old.quota.reserved, 0);
});

test('global exhaustion blocks every visitor, unknown failures cannot be retried beyond the budget', async () => {
  let calls = 0;
  const env = environment({ DAILY_AI_NEURON_BUDGET: String(reserveEstimate(model, options) / 1000),
    AI: { async run() { calls++; throw new Error('unknown upstream outcome'); } } });
  await assert.rejects(runMeteredAi(env, 'ai:a', model, options, r => r));
  await assert.rejects(runMeteredAi(env, 'ai:b', model, options, r => r), e => e.code === 'AI_BUDGET_EXCEEDED');
  assert.equal(calls, 1);
  assert.equal((await getAiUsage(env, 'ai:a')).quota.used, 0);
});

test('share-card AI shares the same personal and global meter and falls back when blocked or invalid', async () => {
  let calls = 0;
  const env = environment({ DAILY_AI_LIMIT: '1', AI: { async run() { calls++; return { response: JSON.stringify({ title: '标题', summary: '摘要' }), usage: { neurons: 3 } }; } } });
  const input = { env, aiScope: 'ai:v', content: '# 正文', codeType: 'markdown' };
  assert.equal((await generateShareMetadata(input)).source, 'ai');
  assert.equal((await getAiUsage(env, 'ai:v')).quota.used, 1);
  assert.equal((await getAiUsage(env, 'ai:v')).budget.used, 3);
  assert.equal((await generateShareMetadata(input)).source, 'fallback');
  assert.equal(calls, 1);
  const broken = environment({ AI: { async run() { return { response: '{}', usage: { neurons: 2 } }; } } });
  assert.equal((await generateShareMetadata({ ...input, env: broken })).source, 'fallback');
  assert.equal((await getAiUsage(broken, 'ai:v')).quota.used, 0);
  assert.equal((await getAiUsage(broken, 'ai:v')).budget.used, 2);
});

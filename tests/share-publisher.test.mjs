import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

function publisher(fetcher) {
  const context = vm.createContext({ window: {}, fetch: fetcher, crypto: { randomUUID } });
  vm.runInContext(readFileSync(new URL('../public/js/share-publisher.js', import.meta.url), 'utf8'), context);
  return context.window.GoshareShare.createPublisher(fetcher);
}
const payload = { htmlContent: '# 分享测试', codeType: 'markdown' };
const response = { ok: true, json: async () => ({ success: true, viewUrl: 'https://share.example.com/view/test' }) };

test('duplicate confirmations share one in-flight request and reuse the successful link', async () => {
  let calls = 0, resolve;
  const p = publisher(async () => { calls++; return new Promise(done => { resolve = done; }); });
  const first = p.publish(payload), second = p.publish(payload);
  assert.equal(first, second);
  resolve(response);
  const result = await first;
  assert.equal((await p.publish(payload)).viewUrl, result.viewUrl);
  assert.equal(calls, 1);
});

test('an uncertain network outcome retries with the identical request key', async () => {
  const keys = [];
  const p = publisher(async (url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    if (keys.length === 1) throw new Error('network');
    return response;
  });
  await assert.rejects(p.publish(payload));
  await p.publish(payload);
  assert.equal(keys[0], keys[1]);
});

test('changed content, theme, protection or suffix cannot reuse another share', async () => {
  const keys = [];
  const p = publisher(async (url, options) => { keys.push(options.headers['Idempotency-Key']); return response; });
  await p.publish(payload);
  for (const change of [{ htmlContent: 'changed' }, { markdownTheme: 'clean' }, { isProtected: true }, { customSuffix: 'other' }]) {
    await p.publish({ ...payload, ...change });
  }
  assert.equal(new Set(keys).size, 5);
});

test('server errors remain retryable and cannot turn into a cached success', async () => {
  let calls = 0;
  const p = publisher(async () => { calls++; return { ok: false, json: async () => ({ success: false, error: { message: 'quota' } }) }; });
  await assert.rejects(p.publish(payload), /quota/);
  await assert.rejects(p.publish(payload), /quota/);
  assert.equal(calls, 2);
});

test('a different payload cannot receive the link of an in-flight publication', async () => {
  let resolve;
  const p = publisher(() => new Promise(done => { resolve = done; }));
  const pending = p.publish(payload);
  await assert.rejects(p.publish({ ...payload, htmlContent: 'other' }), /等待/);
  resolve(response);
  assert.equal((await pending).viewUrl, 'https://share.example.com/view/test');
});

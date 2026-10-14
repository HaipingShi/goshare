import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProduction, validateProductionConfig, verifyProductionBindings } from '../scripts/production.mjs';

function fixture() {
  const config = {
    name: 'test-worker', account_id: 'a'.repeat(32), compatibility_date: '2026-05-20',
    workers_dev: false, preview_urls: false, keep_vars: true,
    routes: [{ pattern: 'share.example.com', custom_domain: true }],
    vars: { PUBLIC_SITE_URL: 'https://share.example.com', AUTH_ENABLED: 'false', DAILY_CREATE_LIMIT: '10' },
    assets: { binding: 'ASSETS' }, ai: { binding: 'AI' },
    d1_databases: [{ binding: 'DB', database_id: '11111111-1111-1111-1111-111111111111', migrations_dir: 'migrations' }],
    r2_buckets: [{ binding: 'CONTENT_BUCKET', bucket_name: 'test-content' }],
  };
  const version = { resources: {
    script_runtime: { compatibility_date: config.compatibility_date },
    bindings: [
      ...Object.entries(config.vars).map(([name, text]) => ({ name, type: 'plain_text', text })),
      { name: 'ASSETS', type: 'assets' }, { name: 'AI', type: 'ai' },
      { name: 'DB', type: 'd1', id: config.d1_databases[0].database_id },
      { name: 'CONTENT_BUCKET', type: 'r2_bucket', bucket_name: 'test-content' },
      ...['AUTH_PASSWORD', 'COOKIE_SECRET', 'AGENT_API_TOKEN'].map((name) => ({ name, type: 'secret_text' })),
    ],
  } };
  return { config, version };
}

test('rejects a template DB, mismatched domain, disabled preservation, and plaintext secrets', () => {
  for (const change of [
    (c) => { c.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000'; },
    (c) => { c.routes[0].pattern = 'old.example.com'; },
    (c) => { c.keep_vars = false; },
    (c) => { c.vars.AUTH_PASSWORD = 'must-not-be-stored-here'; },
  ]) {
    const { config } = fixture();
    change(config);
    assert.throws(() => validateProductionConfig(config));
  }
});

test('stops for production variable drift, resource drift, and missing secrets without printing values', () => {
  for (const name of ['DAILY_CREATE_LIMIT', 'DB', 'CONTENT_BUCKET', 'AGENT_API_TOKEN']) {
    const { config, version } = fixture();
    version.resources.bindings = version.resources.bindings.filter((binding) => binding.name !== name);
    assert.throws(() => verifyProductionBindings(config, version), new RegExp(name));
  }
  const { config, version } = fixture();
  config.vars.DAILY_CREATE_LIMIT = '50';
  assert.throws(() => verifyProductionBindings(config, version), /DAILY_CREATE_LIMIT.text/);
});

test('preserves additional dashboard variables and secrets but rejects unconfigured resources', () => {
  const { config, version } = fixture();
  version.resources.bindings.push({ name: 'EXTRA_VAR', type: 'plain_text', text: 'dashboard' }, { name: 'EXTRA_SECRET', type: 'secret_text' });
  assert.doesNotThrow(() => verifyProductionBindings(config, version));
  version.resources.bindings.push({ name: 'EXTRA_DB', type: 'd1', id: 'other' });
  assert.throws(() => verifyProductionBindings(config, version), /EXTRA_DB/);
});

test('check is local only; verify cannot publish or apply migrations', () => {
  for (const mode of ['check', 'verify']) {
    const { config, version } = fixture();
    const calls = [];
    runProduction(mode, config, (args) => {
      calls.push(args);
      if (args[0] === 'deployments') return { versions: [{ version_id: 'current', percentage: 100 }] };
      if (args[0] === 'versions') return version;
    });
    assert(!calls.some((args) => args.includes('apply') || (args[0] === 'deploy' && !args.includes('--dry-run'))));
    if (mode === 'check') assert.equal(calls.length, 1);
  }
});

test('deploy stops before database writes when remote drift is detected', () => {
  const { config, version } = fixture();
  version.resources.bindings.find((b) => b.name === 'AUTH_ENABLED').text = 'true';
  const calls = [];
  assert.throws(() => runProduction('deploy', config, (args) => {
    calls.push(args);
    if (args[0] === 'deployments') return { versions: [{ version_id: 'current', percentage: 100 }] };
    if (args[0] === 'versions') return version;
  }), /AUTH_ENABLED/);
  assert.equal(calls.length, 3);
  assert(!calls.some((args) => args.includes('apply')));
});

test('split deployments are not overwritten', () => {
  const { config } = fixture();
  assert.throws(() => runProduction('verify', config, () => ({ versions: [
    { version_id: 'a', percentage: 50 }, { version_id: 'b', percentage: 50 },
  ] })), /多版本/);
});

test('deploy verifies first, migrates second, and publishes last using the same config', () => {
  const { config, version } = fixture();
  const calls = [];
  runProduction('deploy', config, (args) => {
    calls.push(args);
    if (args[0] === 'deployments') return { versions: [{ version_id: 'current', percentage: 100 }] };
    if (args[0] === 'versions') return version;
  });
  assert.deepEqual(calls.map((args) => args.slice(0, 2)), [
    ['deploy', '--dry-run'], ['deployments', 'status'], ['versions', 'view'],
    ['d1', 'migrations'], ['deploy', '--config'],
  ]);
  assert(calls[3].includes('apply') && calls[3].includes('--remote'));
  assert(calls.every((args) => args.at(-2) === '--config' && args.at(-1) === calls[0].at(-1)));
});

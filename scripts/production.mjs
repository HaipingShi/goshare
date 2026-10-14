import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = resolve(root, 'wrangler.production.jsonc');
const modes = new Set(['check', 'verify', 'migrate', 'deploy', 'deploy-vars']);
const variablePlanPath = resolve(root, '.wrangler/production-vars-change.json');
const requiredSecrets = ['AUTH_PASSWORD', 'COOKIE_SECRET', 'AGENT_API_TOKEN'];

export function validateProductionConfig(config) {
  assert(config.name && /^[a-f0-9]{32}$/.test(config.account_id), '必须明确设置 Worker 名称和 Cloudflare account_id。');
  const database = config.d1_databases?.find((item) => item.binding === 'DB');
  assert(database && /^[a-f0-9-]{36}$/.test(database.database_id)
    && database.database_id !== '00000000-0000-0000-0000-000000000000', '必须设置真实的 DB database_id，不能使用模板占位值。');
  assert(database.migrations_dir === 'migrations', 'DB migrations_dir 必须指向 migrations。');
  assert(config.r2_buckets?.some((item) => item.binding === 'CONTENT_BUCKET' && item.bucket_name), '缺少 CONTENT_BUCKET。');
  assert(config.assets?.binding === 'ASSETS' && config.ai?.binding === 'AI', '缺少 ASSETS 或 AI 绑定。');
  const url = new URL(config.vars?.PUBLIC_SITE_URL);
  assert(url.protocol === 'https:' && url.origin === config.vars.PUBLIC_SITE_URL, 'PUBLIC_SITE_URL 必须是 HTTPS origin（不带路径）。');
  assert(config.routes?.length === 1 && config.routes[0].custom_domain === true
    && config.routes[0].pattern === url.hostname, '自定义域名必须与 PUBLIC_SITE_URL 完全一致。');
  assert(config.workers_dev === false && config.preview_urls === false, '生产仅使用自定义域名，必须明确关闭 workers.dev 和预览地址。');
  assert(config.keep_vars === true, '必须启用 keep_vars，保留控制台新增的变量。');
  for (const name of requiredSecrets) {
    assert(!(name in config.vars), `${name} 必须保留为线上 Secret，不能写入 vars。`);
  }
}

export function verifyProductionBindings(config, version) {
  const remote = new Map(version.resources.bindings.map((binding) => [binding.name, binding]));
  const expected = new Map(Object.entries(config.vars).map(([name, value]) => [name, { type: 'plain_text', text: String(value) }]));
  expected.set(config.assets.binding, { type: 'assets' });
  expected.set(config.ai.binding, { type: 'ai' });
  for (const database of config.d1_databases) expected.set(database.binding, { type: 'd1', id: database.database_id });
  for (const bucket of config.r2_buckets) expected.set(bucket.binding, { type: 'r2_bucket', bucket_name: bucket.bucket_name });
  for (const name of requiredSecrets) expected.set(name, { type: 'secret_text' });

  const differences = [];
  for (const [name, fields] of expected) {
    for (const [key, value] of Object.entries(fields)) {
      const binding = remote.get(name);
      const actual = key === 'id' ? binding?.id ?? binding?.database_id : binding?.[key];
      if (actual !== value) differences.push(`${name}.${key}`);
    }
  }
  // keep_vars preserves extra plain-text/JSON vars; Wrangler preserves existing secrets.
  for (const [name, binding] of remote) {
    if (!expected.has(name) && !['plain_text', 'json', 'secret_text', 'secret_key'].includes(binding.type)) {
      differences.push(`${name}（本地缺少线上资源绑定）`);
    }
  }
  const runtime = version.resources.script_runtime;
  if (runtime.compatibility_date !== config.compatibility_date) differences.push('compatibility_date');
  if (JSON.stringify([...(runtime.compatibility_flags || [])].sort())
    !== JSON.stringify([...(config.compatibility_flags || [])].sort())) differences.push('compatibility_flags');
  assert(differences.length === 0,
    `生产配置与线上不一致，已停止部署：${differences.join(', ')}。请核对并同步配置，不要直接覆盖。`);
}

// All operations use one explicit config; extra CLI arguments cannot redirect a deploy.
export function verifyVariablePlan(config, version, changes) {
  assert(changes && typeof changes === 'object' && !Array.isArray(changes) && Object.keys(changes).length,
    '配置变更需要本地 production-vars-change.json 计划。');
  const bindings = new Map(version.resources.bindings.map(binding => [binding.name, binding]));
  const baseline = { ...config, vars: { ...config.vars } };
  for (const [name, change] of Object.entries(changes)) {
    assert(['DAILY_AI_LIMIT', 'DAILY_AI_NEURON_BUDGET'].includes(name), `不允许通过 AI 额度变更计划修改 ${name}。`);
    assert(change && (change.from === null || typeof change.from === 'string') && typeof change.to === 'string'
      && change.to === config.vars[name], `${name} 的变更计划与本地目标配置不一致。`);
    const binding = bindings.get(name);
    assert(change.from === null ? !binding : binding?.type === 'plain_text' && binding.text === change.from,
      `${name} 的线上值已变化，停止配置变更。`);
    if (change.from === null) delete baseline.vars[name];
    else baseline.vars[name] = change.from;
  }
  assert(Number.isInteger(Number(config.vars.DAILY_AI_LIMIT)) && Number(config.vars.DAILY_AI_LIMIT) > 0,
    'AI 次数上限必须是正整数。');
  assert(Number(config.vars.DAILY_AI_NEURON_BUDGET) > 0 && Number(config.vars.DAILY_AI_NEURON_BUDGET) <= 10000,
    '免费 AI 预算必须在 0–10000 Neurons 之间。');
  verifyProductionBindings(baseline, version);
}

export function runProduction(mode, config, run, variableChanges) {
  assert(modes.has(mode), '支持的操作：check、verify、migrate、deploy、deploy-vars。');
  validateProductionConfig(config);
  const invoke = (args, json = false) => run([...args, '--config', configPath], json);
  if (mode === 'check' || mode === 'deploy' || mode === 'deploy-vars') invoke(['deploy', '--dry-run']);
  if (mode === 'check') return;

  const deployment = invoke(['deployments', 'status', '--json'], true);
  assert(deployment.versions?.length === 1 && deployment.versions[0].percentage === 100,
    '线上存在多版本流量分配，必须先人工核对，禁止直接覆盖。');
  const version = invoke(['versions', 'view', deployment.versions[0].version_id, '--json'], true);
  if (mode === 'deploy-vars') verifyVariablePlan(config, version, variableChanges);
  else verifyProductionBindings(config, version);
  console.log('生产变量、资源绑定、Secrets 名称和运行时兼容配置核对通过。');
  if (mode === 'verify') {
    invoke(['d1', 'migrations', 'list', 'DB', '--remote']);
    return;
  }
  invoke(['d1', 'migrations', 'apply', 'DB', '--remote']);
  if (mode === 'deploy' || mode === 'deploy-vars') invoke(['deploy']);
}

async function main() {
  assert(process.argv.length === 3 && modes.has(process.argv[2]), '请使用 npm run check:production / production:verify / deploy，不能附加覆盖参数。');
  assert(existsSync(configPath), '缺少 wrangler.production.jsonc；请从当前生产环境同步配置。不会回退到开源模板。参见 docs/PRODUCTION.md。');
  const { unstable_readConfig } = await import('wrangler');
  const config = unstable_readConfig({ config: configPath });
  const require = createRequire(import.meta.url);
  const wrangler = resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
  const mode = process.argv[2];
  const changes = mode === 'deploy-vars' ? JSON.parse(readFileSync(variablePlanPath, 'utf8')) : undefined;
  runProduction(mode, config, (args, json) => {
    const output = execFileSync(process.execPath, [wrangler, ...args], {
      cwd: root,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.account_id },
      stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      encoding: 'utf8',
    });
    return json ? JSON.parse(output) : undefined;
  }, changes);
  if (mode === 'deploy-vars') unlinkSync(variablePlanPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

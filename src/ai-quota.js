// Workers AI pricing checked 2026-10-14:
// https://developers.cloudflare.com/workers-ai/platform/pricing/
// Unknown models fail closed until their pricing is explicitly supported.
const PRICES = { '@cf/zai-org/glm-4.7-flash': { input: 5.5, output: 36.4 } }; // milli-Neurons / token
export const DEFAULT_AI_LIMIT = 50;
export const DEFAULT_AI_BUDGET = 8000;

export class AiQuotaError extends Error {
  constructor(code, message, state) { super(message); this.code = code; this.state = state; }
}

export function aiLimit(env) {
  const value = Number(env.DAILY_AI_LIMIT ?? DEFAULT_AI_LIMIT);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 10000) : DEFAULT_AI_LIMIT;
}
export function aiBudget(env) {
  const value = Number(env.DAILY_AI_NEURON_BUDGET ?? DEFAULT_AI_BUDGET);
  // The free-budget guard cannot be disabled or raised beyond the free allocation.
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10000) : DEFAULT_AI_BUDGET;
}
const dayNow = () => new Date().toISOString().slice(0, 10);
const resetAt = day => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString();

export function reserveEstimate(model, options) {
  const price = PRICES[model];
  if (!price) throw new AiQuotaError('AI_MODEL_BUDGET_UNSUPPORTED', '当前模型尚未配置免费预算计价，已停止 AI 调用。');
  const output = options.max_completion_tokens;
  if (!Number.isInteger(output) || output <= 0) throw new Error('AI output must have a finite token cap');
  // UTF-8 bytes overestimate byte-based text tokenization; include chat-template overhead.
  const input = new TextEncoder().encode(JSON.stringify(options.messages)).length + 2048;
  return Math.ceil(input * price.input + output * price.output);
}

export async function getAiUsage(env, scope, day = dayNow()) {
  const [personal, global] = await Promise.all([
    env.DB.prepare('SELECT used, reserved FROM ai_daily_usage WHERE scope = ? AND day = ?').bind(scope, day).first(),
    env.DB.prepare('SELECT spent_milli, reserved_milli FROM ai_budget_usage WHERE day = ?').bind(day).first(),
  ]);
  const limit = aiLimit(env), used = Number(personal?.used || 0), reserved = Number(personal?.reserved || 0);
  const budgetLimit = aiBudget(env), spent = Number(global?.spent_milli || 0) / 1000, held = Number(global?.reserved_milli || 0) / 1000;
  return {
    quota: { limit, used, reserved, remaining: limit ? Math.max(0, limit - used - reserved) : null, unlimited: limit === 0, day, resetAt: resetAt(day) },
    budget: { limit: budgetLimit, used: spent, reserved: held, remaining: Math.max(0, budgetLimit - spent - held), unit: 'neurons', day, resetAt: resetAt(day) },
  };
}

export async function reserveAi(env, scope, model, options) {
  const estimate = reserveEstimate(model, options), limit = aiLimit(env), ceiling = Math.floor(aiBudget(env) * 1000);
  const day = dayNow(), id = crypto.randomUUID();
  const stmt = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  // D1 batch is transactional. Both guards and reservations are updated atomically.
  const result = await env.DB.batch([
    stmt('INSERT OR IGNORE INTO ai_daily_usage (scope, day) VALUES (?, ?)', scope, day),
    stmt('INSERT OR IGNORE INTO ai_budget_usage (day) VALUES (?)', day),
    stmt(`INSERT INTO ai_requests (id, scope, day, reserved_milli, state)
      SELECT ?, ?, ?, ?, 'reserved' FROM ai_daily_usage p JOIN ai_budget_usage g ON p.day = g.day
      WHERE p.scope = ? AND p.day = ? AND (? = 0 OR p.used + p.reserved < ?)
        AND g.spent_milli + g.reserved_milli + ? <= ?`, id, scope, day, estimate, scope, day, limit, limit, estimate, ceiling),
    stmt(`UPDATE ai_daily_usage SET reserved = reserved + 1 WHERE scope = ? AND day = ?
      AND EXISTS (SELECT 1 FROM ai_requests WHERE id = ?)`, scope, day, id),
    stmt(`UPDATE ai_budget_usage SET reserved_milli = reserved_milli + ? WHERE day = ?
      AND EXISTS (SELECT 1 FROM ai_requests WHERE id = ?)`, estimate, day, id),
  ]);
  if (result[2].meta.changes !== 1) {
    const state = await getAiUsage(env, scope, day);
    if (limit && !state.quota.remaining) throw new AiQuotaError('QUOTA_EXCEEDED', '今日 AI 次数已达上限，文章分析、智能美化与分享卡片 AI 共用额度。', state);
    throw new AiQuotaError('AI_BUDGET_EXCEEDED', '全站今日免费 AI 预算不足，已暂停 AI。可直接预览原文，或等待北京时间 08:00 重置。', state);
  }
  return { id, scope, day, estimate, model };
}

export async function settleAi(env, reservation, succeeded, result) {
  const { id, scope, day, estimate, model } = reservation;
  const usage = result?.usage;
  let consumed = Number(usage?.neurons);
  if (usage?.neurons == null || !Number.isFinite(consumed) || consumed < 0) {
    const input = usage?.prompt_tokens, output = usage?.completion_tokens;
    consumed = Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output >= 0
      ? (input * PRICES[model].input + output * PRICES[model].output) / 1000 : estimate / 1000;
  }
  const charged = Math.ceil(consumed * 1000), success = succeeded ? 1 : 0;
  const stmt = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    stmt(`UPDATE ai_requests SET state = 'finalizing', charged_milli = ?, succeeded = ? WHERE id = ? AND state = 'reserved'`, charged, success, id),
    stmt(`UPDATE ai_daily_usage SET reserved = reserved - 1, used = used + ? WHERE scope = ? AND day = ?
      AND EXISTS (SELECT 1 FROM ai_requests WHERE id = ? AND state = 'finalizing')`, success, scope, day, id),
    stmt(`UPDATE ai_budget_usage SET reserved_milli = reserved_milli - ?, spent_milli = spent_milli + ? WHERE day = ?
      AND EXISTS (SELECT 1 FROM ai_requests WHERE id = ? AND state = 'finalizing')`, estimate, charged, day, id),
    stmt(`UPDATE ai_requests SET state = 'settled' WHERE id = ? AND state = 'finalizing'`, id),
  ]);
}

export async function runMeteredAi(env, scope, model, options, validate) {
  const reservation = await reserveAi(env, scope, model, options);
  let result, succeeded = false, value;
  try {
    result = await env.AI.run(model, options);
    value = await validate(result);
    succeeded = true;
  } finally {
    // An unknown failure may still have consumed Cloudflare compute. Keep its full
    // reservation in the global spent budget, but refund the personal request slot.
    // A crashed worker retains reservations until the UTC day changes (fail closed).
    await settleAi(env, reservation, succeeded, result);
  }
  return { value, ...await getAiUsage(env, scope, reservation.day) };
}

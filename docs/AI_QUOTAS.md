# AI 额度与免费预算保护

文章分析、关系图、智能美化和分享卡片标题/摘要都通过同一个 `runMeteredAi` 调用模型。新增 AI 功能必须使用此入口，不能直接调用 `env.AI.run`。

`DAILY_AI_LIMIT` 默认 50，按访问者指纹（IP、User-Agent、Accept-Language 的哈希）统计每日成功结果。文章分析和三种图合计一次；同一流程复用已有分析的排版优化不调用模型。分享卡片成功生成算额外一次；手工提供完整标题与摘要则不调用 AI。额度不足或卡片 AI 失败时，创建/编辑仍能使用规则提取的标题摘要。

如果模型已经返回通过原文引用校验的目录，却遗漏所选关系图，应用只补全一次关系图。第一次不完整结果不扣个人次数，补全得到完整结果才扣一次；两次模型计算都进入全站预算。补全也受额度和预算检查，失败后不循环重试。JSON 损坏、输出被截断、原文引用无效等错误不会自动重试。

失败包括上游报错、无效 JSON、无效原文引用、空内容等：均释放个人次数。个人次数以 AI 结果通过校验为成功，与之后是否成功发布分享页分别计数。创建链接次数继续沿用原先的独立额度。

## 全站预算

`DAILY_AI_NEURON_BUDGET` 默认 8000 Neurons，保留 2000 的余量。不能通过 0、负数或大于 10000 的配置关闭保护。所有访问者、所有上述 AI 功能共用该预算。每天 UTC 00:00（北京时间 08:00）重置，跨日请求结算到预留时的日期。

调用前依据 UTF-8 输入字节、聊天模板余量、最大输出 tokens 和模型单价保守预留预算。D1 事务同时检查个人 `used + reserved` 与全站 `spent + reserved`，原子预留，避免并发请求绕过限制。模型返回后优先用 `usage.neurons` 结算，其次使用输入/输出 token 用量；缺少用量或上游异常则保留整份预算估算。失败请求仍可能消耗 Cloudflare 计算量，因此仅退个人次数，不把无法确认的计算量退回全站预算。

每笔请求只能结算一次。进程中断、数据库故障导致未结算的预留会保守保留到当日结束，不自动释放，以免实际已发生的计算量被漏算。数据库不可用时不发起新模型请求。

目前仅支持已核验计价的 `@cf/zai-org/glm-4.7-flash`（每百万输入 5500、输出 36400 Neurons）。未知模型停止调用，需要核验并更新 `src/ai-quota.js` 的计价表。计价以 [Cloudflare 官方说明](https://developers.cloudflare.com/workers-ai/platform/pricing/) 为准；字节预估与余量是应用层保护，不是 Cloudflare 实时账单。

此账本覆盖部署后经本应用发起的调用，不自动读取 Cloudflare 账号下其他 Worker、Playground 或本地远程 AI 的用量。免费额度是账号总额，应给其他调用保留余量，或统一通过同一个预算入口。上线当日可依据 Cloudflare Dashboard 已用 Neurons 保守补录 `ai_budget_usage.spent_milli`（1 Neuron = 1000 milli-Neurons）。不要把默认预算理解为账号当前剩余量。

## 存储与预检

应用迁移 `0007_add_ai_budget.sql`，新增个人计数、全站预算与请求结算表。迁移会保留旧 AI 次数；旧账本无法区分历史失败，因此“失败退款”适用于新版本请求，不回退历史计数。账本不保存文章正文、提示词或模型输出。

`GET /api/v1/quota` 的 `quotas.ai` 返回 `limit`、`used`、`reserved`、`remaining` 和 `resetAt`；`quotas.aiBudget` 返回全站预算及预留，单位 `neurons`。

超限返回 `429 QUOTA_EXCEEDED` 或 `429 AI_BUDGET_EXCEEDED`，并附两类额度状态。未支持模型返回 `503 AI_MODEL_BUDGET_UNSUPPORTED`。这些情况均不会发起模型调用。

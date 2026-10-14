# 本地生产部署

## 生产配置的保存位置

真实生产配置保存在 Git 忽略的 `wrangler.production.jsonc` 中。账号 ID、数据库 ID、资源名称、域名和普通变量以该文件及 Cloudflare 当前设置为准；不要将生产配置的具体值复制到提交的文件中。

`AUTH_PASSWORD`、`COOKIE_SECRET`、`AGENT_API_TOKEN` 保留为 Cloudflare Secrets，本地配置不包含其值。本地部署记录也应放在 Git 忽略的目录中。

## 配置与命令

`wrangler.jsonc` 是开源模板和本地开发配置。`wrangler.production.jsonc` 是部署者自己的生产配置，包含明确的账号、真实数据库 ID、自定义域名及全部生产普通变量；它已被 Git 忽略，重新克隆仓库时不会自动出现，应从 Cloudflare 重新同步或从自己的备份恢复。不要把模板复制后直接部署到现有站点。

```sh
npm ci
npm test
npm run check:production   # 校验配置并 dry-run 打包，不发布
npm run production:verify # 只读核对线上变量/绑定/Secret 名称，列出待应用迁移
npm run deploy            # dry-run → 线上配置核对 → 远端迁移 → 发布
```

`npm run db:migrate:remote` 同样固定使用生产配置，并在写数据库前执行线上配置核对。`npm run dev` 和 `npm run db:migrate:local` 仍使用本地模板环境。

默认部署不会回退到模板；缺少生产配置、D1 ID 为占位值、URL 与域名不一致、缺少 Secrets、存在资源绑定或变量差异、线上正在分流多个版本时，命令会停止。命令不接受附加参数，避免迁移和发布误用不同配置。

生产配置启用 `keep_vars`，控制台新增的普通变量不会被删除。配置中明确写出的变量仍是 Wrangler 的发布输入，因此发布前会逐项与线上比对。若控制台配置发生变化，先从线上同步到本地；若确实要调整生产配置，先审阅并应用该变更，再更新本地配置和运行核对。额外的线上 Secrets 会由 Wrangler 保留。

主动修改 AI 次数或全站免费预算时，可将目标值写入被忽略的生产配置，并在被忽略的 `.wrangler/production-vars-change.json` 中记录各变量的 `{ "from": "旧值", "to": "目标值" }`；此前不存在的变量使用 `from: null`。执行 `npm run deploy:vars`。该命令只允许调整 `DAILY_AI_LIMIT` 和 `DAILY_AI_NEURON_BUDGET`，先逐项核对线上旧值、其他全部配置与绑定，再应用迁移和发布目标配置。成功后删除变更计划；以后恢复使用 `npm run deploy`，继续严格核对。不得把生产值或计划提交到仓库。

自动核对覆盖变量、D1/R2/AI/静态资源绑定、必需 Secret 名称及兼容日期/标志；不会验证 Secret 值，也不核对控制台域名、日志、路由或静态资源策略。调整这些设置时须同时检查 Cloudflare 和本地配置。直接运行 `npx wrangler deploy` 会绕过本项目的保护检查，应使用 `npm run deploy`。

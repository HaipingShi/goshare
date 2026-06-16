# AI Deploy Workflow for goshare

这份文件是给 AI coding agent 执行的 workflow。它负责把部署任务拆成可检查、可确认、可交付的阶段；详细解释和排错请查 `docs/AI_DEPLOY_GUIDE.md`。

## 执行原则

- 先读 `README.md`、`docs/AI_DEPLOY_WORKFLOW.md`、`docs/AI_DEPLOY_GUIDE.md`、`wrangler.jsonc`、`migrations/`、`package.json`。
- 每个阶段先向用户说明目的、会创建的资源、可能产生的费用或风险。
- 不要求用户把 `AUTH_PASSWORD`、`COOKIE_SECRET`、`AGENT_API_TOKEN` 粘贴到聊天里。
- 不提交真实 `database_id`、密码、token 或 Cloudflare 账号敏感信息。
- 不删除、重建、覆盖 Cloudflare 资源，除非用户单独确认。
- 默认保持 `AUTH_ENABLED=true`、`SECURITY_SCAN_ENABLED=true` 和每日额度限制。

## 阶段 0：启动确认

目标：确认用户具备最低部署条件，并避免后续迷路。

检查项：

- 用户是否有 Cloudflare 账号。
- 用户是否能登录 GitHub 或 GitLab。
- 用户是否要使用自定义域名。
- 用户是否接受先使用 `*.workers.dev` 地址。
- 用户是否希望启用 Workers AI。

用户不懂时的解释：

- Cloudflare 是运行 goshare 的云平台。
- 没有域名也能部署，先用 Cloudflare 分配的 `workers.dev` 地址。
- Workers AI 用量计入部署者自己的 Cloudflare 账号，不消耗原作者额度。

产出：

```txt
Cloudflare account ready: yes/no
Git account ready: yes/no
Domain plan: workers.dev/custom domain
Workers AI plan: enabled/disabled/undecided
```

## 阶段 1：选择部署路径

目标：选择最适合新手的部署方式。

首选路径：

- 使用 README 中的 Deploy to Cloudflare 按钮。

兜底路径：

- Deploy Button 失败或用户明确要求手动部署时，使用 Wrangler CLI。

确认点：

- 如果 Deploy Button 提示仓库名已存在，解释这是 Git 仓库重名，不一定是 Cloudflare 项目重复。建议换名，例如 `goshare-yourname`。
- 如果用户没有域名，继续使用 `workers.dev`。

产出：

```txt
Deployment path: deploy-button/wrangler-cli
Project name:
Git repository:
```

## 阶段 2：创建 Cloudflare 资源

目标：创建或绑定 goshare 必需的 Cloudflare 资源。

资源清单：

- Worker：运行 goshare。
- Static Assets：托管 `public/`。
- D1 database：保存短链、页面元数据、提交记录和 Agent 日志。
- R2 bucket：保存正文内容。
- Workers AI：可选，用于智能标题摘要和内容美化。

Deploy Button 操作：

1. 打开 README 中的 Deploy to Cloudflare。
2. 选择 Git 账号。
3. 填唯一 Project name。
4. 创建或选择 D1 database。
5. 创建或选择 R2 bucket。
6. 确认 Workers AI 绑定。
7. 点击 Deploy。

Wrangler CLI 兜底命令：

```bash
npm install
npx wrangler login
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
```

确认点：

- `wrangler d1 create` 返回的真实 `database_id` 只能用于部署者本地配置，不能提交到公开仓库。

产出：

```txt
Worker name:
D1 database name:
D1 database id:
R2 bucket:
Workers AI binding:
```

## 阶段 3：设置 Secrets 和变量

目标：让生产站点具备登录保护、Cookie 签名、Agent API 和正确链接生成能力。

必填：

```txt
AUTH_PASSWORD=<user-owned-password>
COOKIE_SECRET=<random-hex-string>
AGENT_API_TOKEN=<random-agent-token>
PUBLIC_SITE_URL=<final-site-url>
APP_LOGO_URL=/icon/web/icon-512.png
```

建议保留：

```txt
AUTH_ENABLED=true
SECURITY_SCAN_ENABLED=true
DAILY_CREATE_LIMIT=50
DAILY_AGENT_CREATE_LIMIT=200
DAILY_AI_LIMIT=20
```

可选：

```txt
AI_SHARE_METADATA_ENABLED=true
AI_SHARE_METADATA_MODEL=@cf/zai-org/glm-4.7-flash
MAX_SHARE_METADATA_CONTENT_KB=24
APP_FOOTER_TEXT=
APP_FOOTER_URL=
```

Wrangler CLI 示例：

```bash
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put COOKIE_SECRET
npx wrangler secret put AGENT_API_TOKEN
```

确认点：

- 终端输入 secret 时不显示明文是正常现象。
- `PUBLIC_SITE_URL` 必须是最终站点地址。没有自定义域名时填 `workers.dev` 地址。

产出：

```txt
AUTH_PASSWORD set: yes/no
COOKIE_SECRET set: yes/no
AGENT_API_TOKEN set: yes/no
PUBLIC_SITE_URL:
```

## 阶段 4：应用远端 D1 迁移

目标：让生产数据库具备当前版本需要的表和字段。

命令：

```bash
npm run db:migrate:remote
```

或：

```bash
npx wrangler d1 migrations apply goshare-db --remote
```

确认点：

- 迁移必须应用到远端生产 D1，不是本地 `.wrangler` 数据库。
- 如果 D1 名称不同，使用部署者实际数据库名。

产出：

```txt
Remote migration result:
Last applied migration:
```

## 阶段 5：部署 Worker

目标：把当前代码部署到 Cloudflare。

命令：

```bash
npx wrangler deploy
```

Deploy Button 路径：

- 如果 Cloudflare 已自动部署，确认部署状态为成功。
- 记录 Cloudflare 显示的 `workers.dev` 地址。

确认点：

- 部署完成后立刻记录最终访问地址。
- 如果使用自定义域名，记录自定义域名并确认 `PUBLIC_SITE_URL` 已更新。

产出：

```txt
Deploy result:
Worker URL:
Custom domain:
PUBLIC_SITE_URL:
```

## 阶段 6：冒烟测试

目标：确认用户部署出来的是可用产品，不只是命令成功。

测试清单：

1. 打开 `/login`，确认需要密码。
2. 登录后打开 `/`，创建一条 Markdown 分享。
3. 打开 `/share/<id>`，确认 H5 分享卡片正常。
4. 从卡片进入 `/view/<id>`，确认正文渲染正常。
5. 打开 `/bootstrap`，确认部署引导页能访问。
6. 使用 `AGENT_API_TOKEN` 调 `/api/agent/pages`，确认 Agent API 可创建页面。

Agent API 示例：

```bash
curl -X POST "$PUBLIC_SITE_URL/api/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Hello goshare\n\nCreated by an agent.",
    "codeType": "markdown",
    "markdownTheme": "github"
  }'
```

产出：

```txt
Login test: pass/fail
Create page test: pass/fail
Share card test: pass/fail
View page test: pass/fail
Bootstrap test: pass/fail
Agent API test: pass/fail/not configured
```

## 阶段 7：交付记录

目标：让用户部署完以后知道资源在哪里、站点在哪里、哪些事情还没做。

最终输出模板：

```txt
Deployment summary
- Git repository:
- Cloudflare account:
- Worker name:
- Worker URL:
- Custom domain:
- PUBLIC_SITE_URL:
- D1 database:
- D1 database id:
- R2 bucket:
- Workers AI:
- AUTH_ENABLED:
- AUTH_PASSWORD set:
- COOKIE_SECRET set:
- AGENT_API_TOKEN set:
- Last migration:
- Last deploy:

Smoke tests
- Login:
- Create page:
- Share card:
- View page:
- Bootstrap:
- Agent API:

Open items
-

Risks
-

Next steps
-
```

完成标准：

- 用户拿到一个可访问的 goshare 地址。
- 用户知道 Cloudflare 资源名和 Git 仓库位置。
- 用户知道是否还没绑定自定义域名。
- 用户知道 Secrets 是否已设置。
- 用户知道如何再次找到站点。

# AI Deploy Workflow for goshare

这份文件是给 AI coding agent 执行的 workflow。它负责把部署任务拆成可检查、可确认、可交付的阶段；详细解释和排错请查 `docs/AI_DEPLOY_GUIDE.md`。

## 执行原则

- 先读 `README.md`、`docs/AI_DEPLOY_WORKFLOW.md`、`docs/AI_DEPLOY_GUIDE.md`、`wrangler.jsonc`、`migrations/`、`package.json`。
- 每个阶段先向用户说明目的、会创建的资源、可能产生的费用或风险。
- 不要求用户把 `AUTH_PASSWORD`、`COOKIE_SECRET`、`AGENT_API_TOKEN` 粘贴到聊天里。
- 不提交真实 `database_id`、密码、token 或 Cloudflare 账号敏感信息。
- 不删除、重建、覆盖 Cloudflare 资源，除非用户单独确认。
- 默认保持 `AUTH_ENABLED=true`、`SECURITY_SCAN_ENABLED=true` 和每日额度限制。
- 安全检查只能说明“已按流程检查并降低风险”，不能声称项目获得无恶意代码认证。
- 默认使用 Wrangler CLI 自动化部署。Deploy Button 只作为用户没有本地终端、没有 Node.js，或 CLI 流程失败时的备选。

## 阶段 0：启动确认

目标：确认用户具备最低部署条件，并避免后续迷路。

检查项：

- 用户是否有 Cloudflare 账号。
- 用户是否有本地终端和 Node.js。
- 用户是否能使用 Git；如果没有 GitHub 账号，也可以直接 clone 或下载公开仓库源码。
- 用户是否要使用自定义域名。
- 用户是否接受先使用 `*.workers.dev` 地址。
- 用户是否理解 Workers AI 会计入部署者自己的 Cloudflare 账号用量。
- 用户的 Cloudflare 账号是否已完成验证/绑卡准备，并能创建 R2 bucket、D1 database 和 Workers AI 绑定。

用户不懂时的解释：

- Cloudflare 是运行 goshare 的云平台。
- 没有域名也能部署，先用 Cloudflare 分配的 `workers.dev` 地址。
- Workers AI 用量计入部署者自己的 Cloudflare 账号，不消耗原作者额度。
- 部分 Cloudflare 能力可能要求账号验证、绑卡或开通对应服务。goshare 完整部署需要 Workers、R2、D1 和 Workers AI 都可创建；如果账号能力不足，先完成 Cloudflare 账号准备，再继续部署。

产出：

```txt
Cloudflare account ready: yes/no
Local terminal ready: yes/no
Source access: git clone/download/fork
Domain plan: workers.dev/custom domain
Workers AI usage understood: yes/no
Cloudflare account ready for Workers/R2/D1/AI: yes/no/unknown
Cloudflare billing or card blocker: none/present/unknown
```

## 阶段 1：部署前安全检查

目标：在创建云资源前先检查仓库、配置和依赖的基础安全状态，并向用户解释检查结果的边界。

必须先说明：

- GitHub、CodeQL、Dependabot、Secret scanning、OpenSSF Scorecard 都是安全信号，不是“无恶意代码认证”。
- 这些检查不能证明代码绝对安全，只能发现常见漏洞、依赖风险、泄露 secret 和危险配置。
- 用户仍应只部署自己信任的仓库，并保管好 Cloudflare 账号、Secrets 和域名权限。

本地检查命令：

```bash
git status --short
git diff --check
npm run check
```

可选依赖检查：

```bash
npm audit --omit=dev
```

Secret 和敏感配置检查：

```bash
rg -n "(AUTH_PASSWORD|AGENT_API_TOKEN|COOKIE_SECRET|api[_-]?key|secret|token|database_id)" . \
  --glob '!node_modules' \
  --glob '!package-lock.json' \
  --glob '!docs/AI_DEPLOY_WORKFLOW.md' \
  --glob '!docs/AI_DEPLOY_GUIDE.md'
```

检查规则：

- 命中文档、示例变量名或占位符不等于泄露；AI agent 必须判断是否是真实 secret 或真实账号资源 ID。
- 如果发现真实密码、token、API key、Cloudflare credential，立即停止并提醒用户轮换凭据。
- 如果 `wrangler.jsonc` 里出现真实 D1 `database_id`，优先迁移到被忽略的 `wrangler.production.jsonc`，并恢复 `wrangler.jsonc` 的占位 ID。
- 如果使用 `wrangler.production.jsonc`，确认它被 `.gitignore` 忽略，且没有被暂存或提交。
- 如果 `AUTH_ENABLED=false`，必须解释公开创建入口的风险，并征求用户确认。
- 如果 `SECURITY_SCAN_ENABLED=false`，必须建议恢复为 `true`。
- 如果 `DAILY_CREATE_LIMIT`、`DAILY_AGENT_CREATE_LIMIT`、`DAILY_AI_LIMIT` 为 `0`，必须解释这会关闭对应限额。
- 如果 `npm audit --omit=dev` 有 high 或 critical 漏洞，部署前先向用户说明影响和可选处理方式。

GitHub 安全信号检查：

- 查看仓库是否有 `SECURITY.md`。
- 查看是否启用或计划启用 CodeQL / code scanning。
- 查看是否启用 Dependabot alerts / dependency graph。
- 查看 public repo 是否有 GitHub secret scanning / push protection。
- 如果配置了 OpenSSF Scorecard，只把分数作为安全健康度信号，不当作认证。

产出：

```txt
Security check summary
- Working tree reviewed: yes/no
- Whitespace diff check: pass/fail
- Dry-run check: pass/fail
- Dependency audit: pass/warn/not run
- Secrets found: yes/no/review required
- Real database_id committed: yes/no
- AUTH_ENABLED:
- SECURITY_SCAN_ENABLED:
- Daily limits:
- GitHub security signals:
- Stop before deploy: yes/no
```

停止条件：

- 发现真实 secret 已进入提交历史或即将被提交。
- 发现生产部署将公开创建入口，且用户没有明确确认。
- `npm run check` 失败。
- 用户不接受安全风险说明。

## 阶段 2：选择部署路径

目标：选择对 AI 用户摩擦最低的部署方式。

首选路径：

- 使用 Wrangler CLI 自动化部署。AI agent 在终端完成 clone、安装、登录、资源创建、迁移、Secrets 和部署。
- 如果用户没有 GitHub 账号，直接从公开仓库 clone 或下载源码，不要求用户 fork。

兜底路径：

- 用户没有本地终端/Node.js、无法使用 CLI、或明确要求网页部署时，才使用 README 中的 Deploy to Cloudflare 按钮。

确认点：

- Deploy Button 会展示 Cloudflare 资源配置表格，对新用户不友好；不要把它作为默认第一步。
- 如果 Deploy Button 提示仓库名已存在，解释这是 Git 仓库重名，不一定是 Cloudflare 项目重复。建议换名，例如 `goshare-yourname`。
- 如果用户没有域名，继续使用 `workers.dev`。

产出：

```txt
Deployment path: wrangler-cli/deploy-button/download
Project name:
Source repository:
```

## 阶段 3：创建 Cloudflare 资源

目标：创建或绑定 goshare 必需的 Cloudflare 资源。

资源清单：

- Worker：运行 goshare。
- Static Assets：托管 `public/`。
- D1 database：保存短链、页面元数据、提交记录和 Agent 日志。
- R2 bucket：保存正文内容。
- Workers AI：用于智能标题摘要和内容美化。

源码获取：

```bash
git clone https://github.com/HaipingShi/goshare.git
cd goshare
npm install
```

如果用户没有 Git，可以下载 GitHub ZIP 后解压进入目录；不要求 GitHub 登录或 fork。

Wrangler CLI 命令：

```bash
npx wrangler login
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
```

Cloudflare 账号能力要求：

- Workers AI 如果提示需要绑卡、开通或当前账号不可用：停止把部署标记为完成，并解释完整体验需要 Workers AI 提供智能美化和智能标题摘要；引导用户完成 Cloudflare 账号准备后再继续。
- R2 如果提示需要绑卡、开通或当前账号不可用：停止部署并解释 R2 是必需资源，因为正文内容存放在 R2；需要先按 Cloudflare 要求开通 R2。
- D1 如果不可创建：停止部署并解释 D1 是必须资源，用于短链、元数据和登录状态；需要先解决 Cloudflare 账号能力问题。

Deploy Button 备选操作：

1. 打开 README 中的 Deploy to Cloudflare。
2. 选择 Git 账号。
3. 填唯一 Project name。
4. 创建或选择 D1 database。
5. 创建或选择 R2 bucket。
6. 如果 Workers AI 要求绑卡或开通服务，先引导用户完成 Cloudflare 账号准备。
7. 点击 Deploy。

确认点：

- `wrangler d1 create` 返回的真实 `database_id` 只能写入部署者本地配置，不能提交到公开仓库。
- 推荐把真实生产配置写入 `wrangler.production.jsonc`，并确认该文件被 `.gitignore` 忽略。
- 公开 `wrangler.jsonc` 应保持 `00000000-0000-0000-0000-000000000000` 占位 ID。

产出：

```txt
Worker name:
D1 database name:
D1 database id:
R2 bucket:
Workers AI binding:
Cloudflare account ready for full deployment: yes/no
Resource blocker: none/r2/d1/ai/unknown
```

## 阶段 4：设置 Secrets 和变量

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

AI 和展示配置：

```txt
AI_ENABLED=true
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
- 如果 Cloudflare 提示 R2、D1 或 Workers AI 需要验证、绑卡或开通服务，先完成账号准备；不要把关闭能力当作完整部署成功。

产出：

```txt
AUTH_PASSWORD set: yes/no
COOKIE_SECRET set: yes/no
AGENT_API_TOKEN set: yes/no
PUBLIC_SITE_URL:
```

## 阶段 5：应用远端 D1 迁移

目标：让生产数据库具备当前版本需要的表和字段。

命令：

```bash
npm run db:migrate:remote
```

使用本地生产配置时：

```bash
npm run db:migrate:remote -- --config wrangler.production.jsonc
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

## 阶段 6：部署 Worker

目标：把当前代码部署到 Cloudflare。

命令：

```bash
npx wrangler deploy
```

使用本地生产配置时：

```bash
npx wrangler deploy --config wrangler.production.jsonc
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

## 阶段 7：冒烟测试

目标：确认用户部署出来的是可用产品，不只是命令成功。

测试清单：

1. 打开 `/login`，确认需要密码。
2. 登录后打开 `/`，创建一条 Markdown 分享。
3. 打开 `/share/<id>`，确认 H5 分享卡片正常。
4. 从卡片进入 `/view/<id>`，确认正文渲染正常。
5. 打开 `/bootstrap`，确认部署引导页能访问。
6. 打开 `/landing`，确认 repo 分发落地页能访问。
7. 使用 `AGENT_API_TOKEN` 调 `/api/agent/pages`，确认 Agent API 可创建页面。

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
Landing test: pass/fail
Agent API test: pass/fail/not configured
```

## 阶段 8：交付 Agent API 使用包

目标：让部署完成后的 goshare 能直接被 Codex、Claude Code、vibe coding agent 或其他自动化工具调用，不需要再经过网页 UI 创建分享页。

必须先说明：

- Agent API 使用 goshare 自己的 `AGENT_API_TOKEN`，不是 Cloudflare API Token。
- 不要把真实 token 打印到聊天里、写入 README、提交到 Git 仓库，或放进公开前端代码。
- Agent API 创建的内容同样会进入部署者自己的 R2/D1，并计入 `DAILY_AGENT_CREATE_LIMIT`。
- API 返回的 `url` / `cardUrl` 是适合转发的 H5 分享卡片，`viewUrl` 是正文页。

交付给用户的 API 资料：

```txt
Agent API endpoint:
Authorization: Bearer <AGENT_API_TOKEN>
Daily agent create limit:
Recommended URL to share: cardUrl
Content URL: viewUrl
Run id field: runId
Logs field: logs
```

AI agent 使用 Prompt：

```text
你可以直接调用我的 goshare Agent API 创建分享页，不需要打开网页 UI。

接口：POST <PUBLIC_SITE_URL>/api/agent/pages
鉴权：Authorization: Bearer <AGENT_API_TOKEN>

请求 JSON：
- content：HTML、Markdown、SVG 或 Mermaid 文本
- codeType：html、markdown、svg、mermaid 或 zip
- markdownTheme：Markdown 可选 bytedance、github、docs、clean、magazine、note、slate
- title / summary：可选；不填时 goshare 会尝试生成或提取
- isProtected：可选；true 时返回访问密码

创建成功后，把响应里的 cardUrl 或 url 发给我用于转发；需要正文页时使用 viewUrl。失败时先读取 error、logs 和 quota，不要重复盲打请求。
```

curl 模板：

```bash
curl -X POST "$PUBLIC_SITE_URL/api/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Hello goshare\n\nCreated directly from an AI agent.",
    "codeType": "markdown",
    "markdownTheme": "github",
    "title": "Hello goshare",
    "summary": "Created directly from an AI agent.",
    "isProtected": false
  }'
```

成功响应必须包含：

```txt
success: true
url/cardUrl:
viewUrl:
urlId:
runId:
status: completed
logs:
```

常见失败处理：

- `401 Agent API 未配置 AGENT_API_TOKEN`：回到 Cloudflare Worker Secrets 设置 `AGENT_API_TOKEN`。
- `401 请提供 Bearer Token`：请求缺少 `Authorization: Bearer ...`。
- `401 Bearer Token 无效`：token 和 Worker Secret 不一致，重新设置或确认调用端变量。
- `429 今日 Agent 创建次数已达上限`：达到 `DAILY_AGENT_CREATE_LIMIT`，第二天 UTC 重置，或在确认风险后调高限制。
- `400 请求格式错误`：请求体不是合法 JSON，或 content/codeType 字段不符合要求。

产出：

```txt
Agent API handoff
- Endpoint:
- Token stored as Worker Secret: yes/no
- Token exposed in chat/repo: no
- Daily agent create limit:
- Test runId:
- Test cardUrl:
- Test viewUrl:
- Recommended agent instruction delivered: yes/no
```

## 阶段 9：交付记录

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
- Agent API endpoint:
- Agent API handoff delivered:
- Last migration:
- Last deploy:

Security checks
- Local checks:
- Dependency audit:
- Secret scan:
- GitHub security signals:
- Risk accepted:

Smoke tests
- Login:
- Create page:
- Share card:
- View page:
- Bootstrap:
- Landing:
- Agent API:

Agent API handoff
- Endpoint:
- Daily agent create limit:
- Test runId:
- Test cardUrl:
- Test viewUrl:

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
- 用户拿到给 AI agent 直接创建分享页的 Agent API 使用包。
- 用户知道如何再次找到站点。
- 用户知道安全检查结果和剩余风险。

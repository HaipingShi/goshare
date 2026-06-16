# AI Deploy Guide for goshare

这份文件给 AI coding agent 使用，也给第一次接触 Cloudflare 的部署者做解释。目标不是炫技，而是让用户知道每一步在做什么、会创建什么资源、部署完去哪里找自己的站点。

## 文件索引

- `README.md`：项目简介、部署 prompt、环境变量、安全提示、Agent API 示例。
- `docs/AI_DEPLOY_WORKFLOW.md`：AI agent 必须优先执行的部署 workflow。
- `docs/AI_DEPLOY_GUIDE.md`：当前文件，给用户看的保姆级解释和排错清单。
- `wrangler.jsonc`：Cloudflare Worker 配置，包含 Worker 入口、静态资源、D1、R2、Workers AI 绑定。
- `migrations/`：D1 数据库迁移。远端生产数据库必须应用这些 SQL。
- `package.json`：本地检查、迁移和部署脚本。

AI agent 开始部署前，必须先读取这些文件。实际执行以 `docs/AI_DEPLOY_WORKFLOW.md` 为准；本文件用于解释每一步、处理新手问题和排错。不要只凭聊天历史判断项目状态。

## Prompt 和 Guide 的分工

README、`/landing` 和 `/bootstrap` 里的部署 Prompt 会刻意保持短，只负责启动 AI agent、指定必须读取的文件和交付目标。不要把所有部署细节塞回 Prompt 里。

详细规则放在这里：

- 执行顺序、检查点、停止条件和交付记录：看 `docs/AI_DEPLOY_WORKFLOW.md`。
- Cloudflare 新手解释、CLI 命令、Agent API 使用包和常见错误：看当前 `docs/AI_DEPLOY_GUIDE.md`。
- 变量示例、安全提示和 OpenAPI 片段：看 `README.md`。

AI agent 如果遇到不确定的部署细节，应回到这些文件查证，而不是要求用户复制更长的 Prompt。

## 给新手的解释

Cloudflare 可以理解成一个云平台。goshare 用它来运行一个自托管分享站：

- Workers：运行 goshare 的后端和页面。
- Static Assets：托管前端静态文件。
- D1：保存短链、页面元数据、登录状态、提交记录和 Agent 日志。
- R2：保存用户粘贴或上传的正文内容。
- Workers AI：用于智能美化和生成更友好的分享标题摘要。

没有自定义域名也可以部署。Cloudflare 会给 Worker 一个 `*.workers.dev` 地址，例如 `https://your-project.your-account.workers.dev`。部署完成后一定要记录这个地址，并把 `PUBLIC_SITE_URL` 设置成这个地址。

## 推荐部署路线

优先使用 **Wrangler CLI 自动化部署**。这是 AI coding agent 最适合执行的路径：它可以在终端里完成源码获取、Cloudflare 登录、资源创建、迁移、Secrets 和部署，避免用户被 Deploy Button 的资源表格劝退。

Deploy Button 只作为备选：当用户没有本地终端、没有 Node.js、无法使用 CLI，或明确要求网页部署时再使用。

如果用户没有 GitHub 账号，也不需要先注册 GitHub 或 fork。AI agent 可以直接从公开仓库 clone：

```bash
git clone https://github.com/HaipingShi/goshare.git
cd goshare
npm install
```

没有 Git 时，可以下载 GitHub ZIP 包解压后进入目录继续部署。

## 部署前检查

AI agent 应先确认这些问题：

1. 用户是否有 Cloudflare 账号。
2. 用户是否有本地终端和 Node.js。
3. 用户是否能使用 Git；不能也可以下载公开仓库 ZIP。
4. 用户是否准备使用自定义域名。
5. 用户是否只想自己使用，还是要公开给别人创建分享页。
6. 用户是否理解 Workers AI 会计入部署者自己的 Cloudflare 账号用量。
7. 用户的 Cloudflare 账号是否已完成验证/绑卡准备，并能创建 R2、D1 和 Workers AI。

默认建议：

- 没有域名：先用 `workers.dev`。
- 个人使用：保持 `AUTH_ENABLED=true`。
- Cloudflare 要求绑卡、验证或开通服务：先停止部署，引导用户完成账号准备，再继续完整部署。
- 公开创建入口：必须保留 `SECURITY_SCAN_ENABLED=true`，并设置每日额度。
- R2、D1 或 Workers AI 无法创建：不要继续假装完整部署成功；先解决 Cloudflare 账号能力问题。

## Wrangler CLI 优先流程

这条路径适合 AI agent 自动执行，也适合用户不想面对 Cloudflare 表格时使用。

```bash
git clone https://github.com/HaipingShi/goshare.git
cd goshare
npm install
npx wrangler login
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
```

如果 `wrangler r2 bucket create` 提示需要绑卡或开通：

- 先向用户解释：R2 是正文存储，当前版本依赖它保存分享内容。
- 不要继续假装部署完成。
- 让用户完成 Cloudflare 要求后再继续。

如果 Workers AI 提示需要绑卡或不可用：

- 先向用户解释：完整体验需要 Workers AI 提供智能美化和智能标题摘要。
- 停止把部署标记为完成，引导用户完成 Cloudflare 账号验证/绑卡或服务开通后再继续。

## Deploy Button 备选流程

Deploy Button 会展示 Cloudflare 资源配置表格，对新手可能比较吓人。只有 CLI 不可用或用户明确要求网页部署时才走这条路。

1. 打开 README 中的 Deploy to Cloudflare。
2. 选择 Git 账号。Cloudflare 会为用户创建一个新的 Git 仓库并连接部署。
3. 填 Project name。建议使用唯一名称，例如 `goshare-yourname`。
4. 如果提示 `A repository with that name already exists`，这是 Git 仓库重名，不一定表示 Cloudflare 已有重复项目。换一个名称即可。
5. 创建或选择 D1 database。D1 是 goshare 的元数据数据库。
6. 创建或选择 R2 bucket。R2 是正文内容存储。
7. Workers AI 是完整体验的一部分；如果 Cloudflare 要求绑卡或开通服务，先完成账号准备。
8. 点击 Deploy。

部署成功后，Cloudflare 页面通常会显示 Worker 地址。AI agent 必须让用户把这个地址复制保存。

## 必填 Secrets 和变量

生产环境至少需要这些值：

```txt
AUTH_PASSWORD=<登录后台和创建页的密码>
COOKIE_SECRET=<32字节以上随机字符串>
AGENT_API_TOKEN=<给 AI coding agent 调 HTTP API 的 Bearer Token>
PUBLIC_SITE_URL=<最终访问地址>
APP_LOGO_URL=/icon/web/icon-512.png
```

建议保留的安全默认值：

```txt
AUTH_ENABLED=true
SECURITY_SCAN_ENABLED=true
DAILY_CREATE_LIMIT=50
DAILY_AGENT_CREATE_LIMIT=200
DAILY_AI_LIMIT=20
```

AI 分享标题配置：

```txt
AI_ENABLED=true
AI_SHARE_METADATA_ENABLED=true
AI_SHARE_METADATA_MODEL=@cf/zai-org/glm-4.7-flash
MAX_SHARE_METADATA_CONTENT_KB=24
```

说明：

- `AUTH_PASSWORD` 是网页登录密码。不要让用户把它发到聊天里。
- `COOKIE_SECRET` 用来签发登录 Cookie。可以用 `openssl rand -hex 32` 生成。
- `AGENT_API_TOKEN` 是 goshare 自己的 API 访问令牌，不是 Cloudflare API Token。
- `PUBLIC_SITE_URL` 很重要。没有它时，Agent API 返回的链接和分享卡片图片可能不是最终生产地址。
- `APP_FOOTER_TEXT` 和 `APP_FOOTER_URL` 可选，首次部署可以不填。

## 完整部署命令

资源创建成功后继续：

```bash
npm install
npx wrangler login
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
npm run db:migrate:remote
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put COOKIE_SECRET
npx wrangler secret put AGENT_API_TOKEN
npx wrangler deploy
```

注意：

- `wrangler d1 create` 会返回真实 `database_id`。建议复制一份本地生产配置到 `wrangler.production.jsonc`，把真实 ID 写在那里；这个文件已被 `.gitignore` 忽略。
- 公开仓库里的 `wrangler.jsonc` 应保持占位配置，不要长期写入真实生产 `database_id`。
- 如果仓库里的 `database_id` 是 `00000000-0000-0000-0000-000000000000`，这是公开模板占位符，不是真实生产数据库。
- `secret put` 会在终端要求输入值，输入时不会显示明文，这是正常现象。

使用本地生产配置部署时，命令示例：

```bash
npm run db:migrate:remote -- --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

## 远端 D1 迁移

部署前或部署后都要确认远端 D1 已应用迁移：

```bash
npm run db:migrate:remote
```

如果使用手动命令，也可以等价执行：

```bash
npx wrangler d1 migrations apply goshare-db --remote
```

迁移成功后，D1 应包含短链、Agent run、页面提交、Markdown 模板和安全额度相关表或字段。

## 部署后给 AI agent 使用

goshare 不只是给人打开网页粘贴内容。部署完成后，Codex、Claude Code、vibe coding agent 或你自己的自动化脚本可以直接调用 HTTP API 创建分享页。

这适合这些场景：

- AI 生成了一份 Markdown 文档，直接发布成分享卡片。
- AI 写了一个 HTML demo，不想让用户复制到网页 UI。
- CI 或脚本生成报告后，自动生成一个 `/share/<id>` 链接。
- 多个 coding agent 需要把阶段性产物发给你预览。

### Agent API 是什么？

接口地址：

```txt
GET  <PUBLIC_SITE_URL>/api/v1/quota
POST <PUBLIC_SITE_URL>/api/v1/agent/pages
```

鉴权方式：

```txt
Authorization: Bearer <AGENT_API_TOKEN>
```

注意：

- `AGENT_API_TOKEN` 是 goshare 自己的 API 密码，不是 Cloudflare API Token。
- 不要把真实 token 发到聊天里，也不要提交到 Git 仓库。
- 创建的正文内容会保存到部署者自己的 R2，元数据和运行日志会保存到部署者自己的 D1。
- Agent API 使用 `DAILY_AGENT_CREATE_LIMIT` 做每日创建额度限制，默认每个 token 每天 200 次，按 UTC 日期重置。
- 创建前可以先请求 `/api/v1/quota` 预检额度；这不会消耗创建额度。
- 重试时带同一个 `Idempotency-Key`，避免超时后重复创建同一份内容。

### 给 AI agent 的使用说明

部署完成后，可以把下面这段交给要调用 goshare 的 AI agent。把 `<PUBLIC_SITE_URL>` 和 `<AGENT_API_TOKEN>` 换成你的环境变量或安全上下文，不要把真实 token 粘贴到公共聊天。

```text
你可以直接调用我的 goshare Agent API 创建分享页，不需要打开网页 UI。

接口：POST <PUBLIC_SITE_URL>/api/v1/agent/pages
额度预检：GET <PUBLIC_SITE_URL>/api/v1/quota
鉴权：Authorization: Bearer <AGENT_API_TOKEN>

安全要求：
- 从安全环境变量或本地 secret 管理器读取 AGENT_API_TOKEN。
- 不要把真实 token 写进聊天、前端代码、Git 仓库或日志。
- 创建前先预检 quota；请求失败时读取 error.code、error.message、quota 和 logs。
- 如果需要重试，使用相同 Idempotency-Key，最多重试 1 次。

请求 JSON：
- content：HTML、Markdown、SVG 或 Mermaid 文本
- codeType：html、markdown、svg、mermaid 或 zip
- markdownTheme：Markdown 可选 bytedance、github、docs、clean、magazine、note、slate
- title / summary：可选；不填时 goshare 会尝试生成或提取
- isProtected：可选；true 时返回访问密码

成功后，把响应里的 url 或 cardUrl 发给我用于转发；需要正文页时使用 viewUrl。失败时按 error.code 决策，不要重复盲打请求。
```

### curl 示例

```bash
curl -X POST "$PUBLIC_SITE_URL/api/v1/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY:-$(uuidgen 2>/dev/null || date +%s)}" \
  -d '{
    "content": "# Hello goshare\n\nCreated directly from an AI agent.",
    "codeType": "markdown",
    "markdownTheme": "github",
    "title": "Hello goshare",
    "summary": "Created directly from an AI agent.",
    "isProtected": false
  }'
```

成功响应契约：

```json
{
  "success": true,
  "id": "abc123",
  "url": "https://your-domain.example/share/abc123",
  "cardUrl": "https://your-domain.example/share/abc123",
  "viewUrl": "https://your-domain.example/view/abc123",
  "urlId": "abc123",
  "runId": "run_1234567890abcdef12",
  "status": "completed",
  "logs": [],
  "quota": { "remaining": 199, "limit": 200, "resetAt": "2026-06-17T00:00:00.000Z" }
}
```

失败响应契约：

```json
{
  "success": false,
  "error": { "code": "QUOTA_EXCEEDED", "message": "今日 Agent 创建次数已达上限", "retryable": false },
  "quota": { "remaining": 0, "limit": 200, "resetAt": "2026-06-17T00:00:00.000Z" },
  "logs": []
}
```

如果 `isProtected=true`，响应还会返回 `password`。这个密码只适合临时分享，不要当作长期强加密。

### 常见错误

| HTTP | error.code | 处理方式 |
| --- | --- | --- |
| 200 | - | 取 `url` 或 `cardUrl` 返回给用户 |
| 400 | `INVALID_JSON` / `INVALID_REQUEST` | 修正 JSON 或字段，不原样重试 |
| 401 | `UNAUTHORIZED` | 检查 `AGENT_API_TOKEN`，不要把 token 打印到聊天 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一个 `Idempotency-Key` 已用于不同内容，换 key 后再发 |
| 413 | `TOO_LARGE` | 截断、压缩或拆分内容 |
| 422 | `INVALID_CONTENT` | 内容未通过安全检测，不原样重试 |
| 429 | `QUOTA_EXCEEDED` | 停止请求，告诉用户 `quota.resetAt` |
| 5xx | `INTERNAL_ERROR` | 如果 `retryable=true`，退避后最多重试 1 次 |

## 部署后必须记录

AI agent 完成部署后，必须输出这份记录：

```txt
Git repository:
Cloudflare account:
Worker name:
Worker URL (*.workers.dev):
Custom domain:
PUBLIC_SITE_URL:
D1 database name:
D1 database id:
R2 bucket:
AUTH_ENABLED:
AUTH_PASSWORD set: yes/no
COOKIE_SECRET set: yes/no
AGENT_API_TOKEN set: yes/no
Agent API endpoint:
Agent API test runId:
Agent API test cardUrl:
Workers AI enabled: yes/no
Last migration result:
Last deploy result:
```

如果用户没有自定义域名，`Custom domain` 写 `not configured`，但 `Worker URL` 和 `PUBLIC_SITE_URL` 必须有值。

## 冒烟测试

部署完成后至少测试这些路径：

1. 打开 `/login`，确认需要密码登录。
2. 登录后打开 `/`，粘贴一段 Markdown 并生成分享页。
3. 打开返回的 `/share/<id>`，确认是 H5 分享卡片。
4. 从卡片进入 `/view/<id>`，确认正文正常渲染。
5. 打开 `/bootstrap`，确认部署引导页能访问。
6. 打开 `/landing`，确认 repo 分发落地页能访问。
7. 如果设置了 `AGENT_API_TOKEN`，用 Agent API 创建一条 Markdown 分享，并把 API 使用说明交付给用户。

Agent API 测试命令：

```bash
curl "$PUBLIC_SITE_URL/api/v1/quota" \
  -H "Authorization: Bearer $AGENT_API_TOKEN"

curl -X POST "$PUBLIC_SITE_URL/api/v1/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-test-$(date +%s)" \
  -d '{
    "content": "# Hello goshare\n\nCreated by an agent.",
    "codeType": "markdown",
    "markdownTheme": "github"
  }'
```

成功时应返回 `success: true`、`url`、`urlId`、`runId`、`status` 和 `logs`。

## 常见问题

### 我没有 Cloudflare 账号怎么办？

先注册 Cloudflare 账号，再回到 Deploy Button。Cloudflare 是部署 Worker、D1、R2 和 Workers AI 的平台，没有账号就没有地方运行 goshare。

### 我没有域名怎么办？

没关系。先用 Cloudflare 自动分配的 `*.workers.dev` 地址。部署完成后，把这个地址记录下来，并设置到 `PUBLIC_SITE_URL`。

### 我部署完找不到网站了怎么办？

去 Cloudflare Dashboard 的 Workers & Pages，找到项目名，打开 Worker 详情页。页面里会显示 `workers.dev` 地址和自定义域名。

### Project name 提示仓库已存在是什么意思？

这通常是 GitHub 或 GitLab 里已有同名仓库。换一个项目名即可，例如 `goshare-demo`、`goshare-yourname`。

### D1 database_id 是什么？

它是 Cloudflare 给 D1 数据库的唯一 ID。公开仓库里的全零 ID 是占位符。真实 ID 属于部署者账号，只应该保存在部署者自己的本地配置或 Cloudflare 项目中。

### APP_FOOTER_TEXT 是什么？

可选页脚文字，例如品牌名、备案号或官网说明。首次部署可以不填。

### Workers AI 会消耗谁的额度？

消耗部署者自己的 Cloudflare 账号额度，不消耗原作者的额度。Cloudflare 的免费额度和价格可能变化，最终以 Cloudflare 当前控制台为准。

### Cloudflare 提示 R2 或 AI 要绑卡怎么办？

这说明账号还没有准备好。goshare 完整部署要求可用的 R2、D1 和 Workers AI：R2 保存分享正文，D1 保存短链和元数据，Workers AI 提供智能美化和智能标题摘要。

先完成 Cloudflare 的账号验证、绑卡或服务开通，再继续部署。不要把关闭能力当作完整部署成功。

### 我没有 GitHub 账号怎么办？

不需要 GitHub 账号也能部署。AI agent 可以直接 `git clone https://github.com/HaipingShi/goshare.git`，或者下载公开仓库 ZIP 后在本地部署。只有 Deploy Button 路径才强依赖 Git 账号创建仓库。

### 可以关闭登录保护吗？

可以，但不建议。关闭 `AUTH_ENABLED` 后，任何访问者都能创建分享页，可能消耗部署者的 R2、D1、Workers 和 Workers AI 额度。公开创建入口时至少保留安全扫描和每日限额。

## AI agent 操作规则

- 不要把用户的 secret 打印到日志或聊天里。
- 不要提交真实 `database_id`、token、密码或账号敏感信息。
- 不要删除、重建、覆盖 Cloudflare 资源，除非用户明确确认。
- 命令失败时先解释错误含义，再给下一步。
- 最后必须给用户一份部署记录，尤其是最终访问地址。

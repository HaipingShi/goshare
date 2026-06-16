# AI Deploy Guide for goshare

这份文件给 AI coding agent 使用，也给第一次接触 Cloudflare 的部署者做解释。目标不是炫技，而是让用户知道每一步在做什么、会创建什么资源、部署完去哪里找自己的站点。

## 文件索引

- `README.md`：项目简介、Deploy Button、环境变量、安全提示、Agent API 示例。
- `docs/AI_DEPLOY_GUIDE.md`：当前文件，保姆级部署流程和排错清单。
- `wrangler.jsonc`：Cloudflare Worker 配置，包含 Worker 入口、静态资源、D1、R2、Workers AI 绑定。
- `migrations/`：D1 数据库迁移。远端生产数据库必须应用这些 SQL。
- `package.json`：本地检查、迁移和部署脚本。

AI agent 开始部署前，必须先读取这些文件。不要只凭聊天历史判断项目状态。

## 给新手的解释

Cloudflare 可以理解成一个云平台。goshare 用它来运行一个自托管分享站：

- Workers：运行 goshare 的后端和页面。
- Static Assets：托管前端静态文件。
- D1：保存短链、页面元数据、登录状态、提交记录和 Agent 日志。
- R2：保存用户粘贴或上传的正文内容。
- Workers AI：可选，用于智能美化和生成更友好的分享标题摘要。

没有自定义域名也可以部署。Cloudflare 会给 Worker 一个 `*.workers.dev` 地址，例如 `https://your-project.your-account.workers.dev`。部署完成后一定要记录这个地址，并把 `PUBLIC_SITE_URL` 设置成这个地址。

## 推荐部署路线

优先使用 README 中的 **Deploy to Cloudflare** 按钮。它适合第一次部署，会引导用户登录 Cloudflare、连接 Git 账号并创建资源。

如果按钮流程失败，再使用 Wrangler CLI 兜底。CLI 更可控，但需要本地安装 Node.js、npm，并完成 Cloudflare 登录。

## 部署前检查

AI agent 应先确认这些问题：

1. 用户是否有 Cloudflare 账号。
2. 用户是否能登录 GitHub 或 GitLab。
3. 用户是否准备使用自定义域名。
4. 用户是否只想自己使用，还是要公开给别人创建分享页。
5. 用户是否希望启用 Workers AI。

默认建议：

- 没有域名：先用 `workers.dev`。
- 个人使用：保持 `AUTH_ENABLED=true`。
- 不确定 AI 费用：先保留默认 AI 配置，需要时再关闭 `AI_ENABLED` 或 `AI_SHARE_METADATA_ENABLED`。
- 公开创建入口：必须保留 `SECURITY_SCAN_ENABLED=true`，并设置每日额度。

## Deploy Button 流程

1. 打开 README 中的 Deploy to Cloudflare。
2. 选择 Git 账号。Cloudflare 会为用户创建一个新的 Git 仓库并连接部署。
3. 填 Project name。建议使用唯一名称，例如 `goshare-yourname`。
4. 如果提示 `A repository with that name already exists`，这是 Git 仓库重名，不一定表示 Cloudflare 已有重复项目。换一个名称即可。
5. 创建或选择 D1 database。D1 是 goshare 的元数据数据库。
6. 创建或选择 R2 bucket。R2 是正文内容存储。
7. 确认 Workers AI 绑定。Workers AI 是可选能力，用于智能标题摘要和内容美化。
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

可选 AI 分享标题配置：

```txt
AI_SHARE_METADATA_ENABLED=true
AI_SHARE_METADATA_MODEL=@cf/zai-org/glm-4.7-flash
MAX_SHARE_METADATA_CONTENT_KB=24
```

说明：

- `AUTH_PASSWORD` 是网页登录密码。不要让用户把它发到聊天里。
- `COOKIE_SECRET` 用来签发登录 Cookie。可以用 `openssl rand -hex 32` 生成。
- `AGENT_API_TOKEN` 是 goshare 自己的 API 访问令牌，不是 Cloudflare API Token。
- `PUBLIC_SITE_URL` 很重要。没有它时，Agent API 返回的链接可能不是最终生产地址。
- `APP_FOOTER_TEXT` 和 `APP_FOOTER_URL` 可选，首次部署可以不填。

## Wrangler CLI 兜底流程

只有 Deploy Button 不适合或失败时，才引导用户走 CLI。

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

- `wrangler d1 create` 会返回真实 `database_id`。它可以写入本地 `wrangler.jsonc` 用于部署，但不要提交到公开仓库。
- 如果仓库里的 `database_id` 是 `00000000-0000-0000-0000-000000000000`，这是公开模板占位符，不是真实生产数据库。
- `secret put` 会在终端要求输入值，输入时不会显示明文，这是正常现象。

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
6. 如果设置了 `AGENT_API_TOKEN`，用 Agent API 创建一条 Markdown 分享。

Agent API 测试命令：

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

### 可以关闭登录保护吗？

可以，但不建议。关闭 `AUTH_ENABLED` 后，任何访问者都能创建分享页，可能消耗部署者的 R2、D1、Workers 和 Workers AI 额度。公开创建入口时至少保留安全扫描和每日限额。

## AI agent 操作规则

- 不要把用户的 secret 打印到日志或聊天里。
- 不要提交真实 `database_id`、token、密码或账号敏感信息。
- 不要删除、重建、覆盖 Cloudflare 资源，除非用户明确确认。
- 命令失败时先解释错误含义，再给下一步。
- 最后必须给用户一份部署记录，尤其是最终访问地址。

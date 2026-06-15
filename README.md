# QuickShare Cloudflare

> 把 AI 生成的 HTML、Markdown、SVG、Mermaid 变成一个干净链接，部署在你自己的 Cloudflare 账号里。
> Paste AI-generated HTML, Markdown, SVG, or Mermaid and share it from your own Cloudflare stack.

> 本项目基于 [joeseesun/quickshare-cloudflare](https://github.com/joeseesun/quickshare-cloudflare) 改造而来。感谢原作者开源 QuickShare Cloudflare；当前版本在原项目基础上加入了 goshare 品牌配置、Cloudflare Workers AI 美化、开源自部署引导页和页面提交数据等改动。
> This project is adapted from [joeseesun/quickshare-cloudflare](https://github.com/joeseesun/quickshare-cloudflare). Thanks to the original author for open-sourcing QuickShare Cloudflare.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HaipingShi/goshare)
[![GitHub stars](https://img.shields.io/github/stars/HaipingShi/goshare?style=social)](https://github.com/HaipingShi/goshare/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/HaipingShi/goshare?style=social)](https://github.com/HaipingShi/goshare/forks)
[![Issues](https://img.shields.io/github/issues/HaipingShi/goshare)](https://github.com/HaipingShi/goshare/issues)
[![Last commit](https://img.shields.io/github/last-commit/HaipingShi/goshare)](https://github.com/HaipingShi/goshare/commits/main)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](#license)

![QuickShare 首页：粘贴 Markdown 后自动识别内容类型](docs/assets/quickshare-home.png)

**[中文](#中文) | [English](#english)**

---

<a name="中文"></a>
## 中文

你让 AI 写了一个 HTML Demo、一段 Markdown 文档、一个 SVG 图标或一张 Mermaid 流程图。

发给别人时，最麻烦的不是内容本身，而是怎么让对方不用下载文件、不用登录平台、点开链接就能看。

QuickShare Cloudflare 把这件事压到一个动作：粘贴内容，生成链接。

内容正文进 R2，索引和权限进 D1，页面跑在 Cloudflare Workers。你拥有数据，也拥有部署。

![QuickShare 生成分享链接，并可切换 5 位访问密码](docs/assets/quickshare-generated-link.png)

## 为什么值得用

- **专为 AI 生成内容准备**：HTML、Markdown、SVG、Mermaid 都能粘贴，自动识别类型并按合适方式渲染。
- **Markdown 多模板渲染**：内置字节风格、GitHub 和技术文档模板，适合文章、README、提示词和说明文档。
- **一键部署到 Cloudflare**：Worker、Static Assets、R2、D1 都走同一个仓库配置，适合 Fork 后快速改成自己的工具。
- **正文不塞数据库**：大段内容放 R2，D1 只保存 ID、时间、类型、密码状态、owner 等元数据。
- **无账号的个人后台**：每个浏览器自动获得 owner cookie，只管理自己创建的内容。
- **可选 5 位数字密码**：适合临时发给朋友、客户、群聊或测试用户，不需要注册系统。
- **可编辑、可删除、可切换保护**：后台能查看列表、编辑正文、复制链接、打开预览、删除过期内容。
- **可收集页面提交数据**：分享页可通过内置 `window.goshare.submit()` 或 `data-goshare-submit` 表单写入 D1，owner 后台可查看最近提交。

## 适合场景

| 你有这些内容 | 用 QuickShare 后 |
| --- | --- |
| AI 生成的 HTML 小页面 | 发一个 `/view/<id>` 链接，对方直接看效果 |
| Markdown 文档或提示词 | 自动渲染成可读页面，不用贴进聊天窗口刷屏 |
| SVG 图标或 Mermaid 图 | 生成可分享预览，方便团队快速确认 |
| 临时内部资料 | 开启 5 位访问密码，降低误传播风险 |

## 功能截图

![QuickShare 分享页：Markdown 和 Mermaid 会被渲染成可读页面](docs/assets/quickshare-rendered-page.png)

| 内容管理后台 | 访问密码 |
| --- | --- |
| ![QuickShare 后台：按浏览器 owner 管理自己的分享内容](docs/assets/quickshare-admin.png) | ![QuickShare 密码访问页：输入 5 位数字密码后查看内容](docs/assets/quickshare-password-gate.png) |

## 一键部署

点击顶部的 **Deploy to Cloudflare** 按钮，Cloudflare 会读取 `wrangler.jsonc`，并在部署流程中绑定：

- D1 数据库：`DB`
- R2 存储桶：`CONTENT_BUCKET`
- Static Assets：`ASSETS`
- Worker 入口：`src/worker.js`

部署命令来自 `package.json`：

```bash
npm run db:migrate:remote && wrangler deploy
```

部署完成后建议立刻在 Cloudflare 控制台里修改变量：

```txt
AUTH_ENABLED=true
AUTH_PASSWORD=<your-strong-password>
COOKIE_SECRET=<openssl rand -hex 32>
```

`AUTH_ENABLED=true` 会保护首页和创建接口；已经生成的分享页仍然可以公开访问，除非你给单条内容开启访问密码。

## 开源与自部署传播

开源发布前请先阅读 [goshare 开源发布清单](docs/OPEN_SOURCE.md)，确认私有域名、真实 D1 ID、生产密码和 Cookie Secret 都没有提交。

部署完成后可以打开 `/bootstrap`，把项目说明、Deploy to Cloudflare 按钮和“一句话 AI 部署 prompt”做成一个可分享页面，引导其他用户部署自己的分享站。

自定义品牌时可以设置 `APP_NAME`、`APP_DESCRIPTION` 和 `APP_LOGO_URL`。`APP_LOGO_URL` 建议使用 512x512 PNG 或 WebP 图片，也可以先用默认 `/icon/web/icon-512.png`。

## 本地开发

### 前置条件

- [ ] 安装 Node.js 20+：`node --version`
- [ ] 安装依赖：`npm install`
- [ ] 登录 Cloudflare CLI：`npx wrangler login`
- [ ] 本地应用 D1 迁移：`npm run db:migrate:local`

### 启动

```bash
npm run dev
```

默认地址通常是 `http://127.0.0.1:8787`，以 Wrangler 输出为准。

### 验证

```bash
npm run check
```

这个命令会执行 `wrangler deploy --dry-run`，用于确认 Worker 配置、模块入口和绑定没有明显问题。

## Agent API

给 vibe coding agent 或其他自动化工具设置一个长期 Bearer Token 后，可以不经过 UI，直接用 HTTP API 创建分享页。

本地开发可在 `.dev.vars` 中设置：

```txt
AGENT_API_TOKEN=<replace-with-agent-api-token>
```

生产环境建议使用 Cloudflare Secret：

```bash
npx wrangler secret put AGENT_API_TOKEN
```

创建分享页：

```bash
curl -X POST "https://your-share-domain.example/api/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Hello goshare\n\nCreated by an agent.",
    "codeType": "markdown",
    "markdownTheme": "github",
    "isProtected": false
  }'
```

成功响应会包含 `success`、`url`、`urlId`、`runId`、`status` 和 `logs`：

```json
{
  "success": true,
  "url": "https://your-share-domain.example/view/abc1234",
  "urlId": "abc1234",
  "runId": "run_1234567890abcdef12",
  "status": "completed",
  "logs": [
    { "level": "info", "message": "agent_request_authenticated" },
    { "level": "info", "message": "page_created" }
  ]
}
```

OpenAPI 最小片段：

```yaml
paths:
  /api/agent/pages:
    post:
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: string
                htmlContent:
                  type: string
                zipContent:
                  type: string
                codeType:
                  type: string
                  enum: [html, markdown, svg, mermaid, zip]
                markdownTheme:
                  type: string
                  enum: [bytedance, github, docs]
                isProtected:
                  type: boolean
      responses:
        "201":
          description: Page created
          content:
            application/json:
              schema:
                type: object
                required: [success, url, urlId, runId, status, logs]
                properties:
                  success:
                    type: boolean
                  url:
                    type: string
                  urlId:
                    type: string
                  runId:
                    type: string
                  status:
                    type: string
                    enum: [completed]
                  logs:
                    type: array
                    items:
                      type: object
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

## 手动部署

不使用 Deploy Button 时，可以自己创建资源：

```bash
npx wrangler d1 create quickshare-db
npx wrangler r2 bucket create quickshare-content
```

把 D1 输出里的 `database_id` 写回 `wrangler.jsonc`，然后运行：

```bash
npm run deploy
```

## 绑定自定义域名

Cloudflare Workers 默认分配 `*.workers.dev` 域名。如果你想使用自己的自定义域名（例如 `share.example.com`），可以通过以下两种方式之一进行绑定：

### 方法 A：通过 Cloudflare 网页后台绑定（推荐，全自动）

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 导航至 **Workers & Pages** -> 选择你的 Worker 应用 `quickshare`。
3. 点击 **Settings** (设置) 选项卡 -> 选择 **Domains & Routes** (域名与路由)。
4. 点击 **Add Custom Domain** (添加自定义域名)。
5. 输入你的自定义域名（例如 `share.yourdomain.com`），点击保存。Cloudflare 会自动为你的域名配置 DNS 记录并申请 SSL 证书，无需手动操作。

### 方法 B：通过 `wrangler.jsonc` 配置文件绑定

1. 打开 [wrangler.jsonc](file:///Users/geesh/projects/tempshare/wrangler.jsonc)。
2. 找到 `routes` 配置项（已为您添加注释示例），取消注释并填写你的域名：
   ```json
   "routes": [
     { "pattern": "share.yourdomain.com/*", "custom_domain": true }
   ]
   ```
3. 运行部署命令：
   ```bash
   npm run deploy
   ```
   Wrangler 会自动在你的 Cloudflare 账户中注册并绑定该域名。

## 刷新 README 截图

先启动本地服务：

```bash
npm run dev
```

再开一个终端运行：

```bash
npm run capture:screenshots
```

如果你的本地服务不是 `8787` 端口：

```bash
SCREENSHOT_URL=http://127.0.0.1:9000 npm run capture:screenshots
```

截图会写入 `docs/assets/`。

## 数据模型

```mermaid
flowchart LR
  User["User pastes content"] --> Worker["Cloudflare Worker"]
  Worker --> R2["R2: pages/{id}.txt"]
  Worker --> D1["D1: id, owner, type, password, timestamps"]
  D1 --> Admin["Owner-only admin"]
  R2 --> View["Public /view/{id} page"]
```

D1 表 `pages` 保存：

- `id`：短链接 ID
- `r2_key`：R2 对象 key
- `created_at` / `updated_at`：创建和更新时间
- `owner_key`：浏览器 owner 身份哈希
- `password` / `is_protected`：访问密码和保护状态
- `code_type`：`html`、`markdown`、`svg`、`mermaid`
- `markdown_theme`：Markdown 渲染模板，默认 `bytedance`，可选 `github`、`docs`
- `content_size` / `content_sha256`：正文大小和哈希

R2 对象保存在 `pages/{id}.txt`。

分享页提交数据保存在 D1 表 `page_submissions`。非 ZIP 分享页会自动注入一个轻量 SDK：

```html
<form data-goshare-submit data-goshare-kind="lead">
  <input name="email" type="email">
  <button type="submit">提交</button>
  <p data-goshare-status></p>
</form>
```

或在页面脚本中调用：

```js
await window.goshare.submit({ email: 'user@example.com' }, { kind: 'lead' });
```

后台接口 `/api/admin/pages/:id/submissions` 会返回当前 owner 名下该页面的最近提交数据。

## Fork 后可以改什么

- 换品牌：修改 `APP_NAME`、`APP_LOGO_URL`、主题色和 footer。
- 换 Markdown 模板：调整 `public/css/markdown-bytedance.css` 或 `public/css/markdown-themes/`；GitHub 模板基于 MIT licensed `github-markdown-css`。
- 加登录：把 owner cookie 换成 GitHub、Google、邮箱验证码或 Cloudflare Access。
- 加过期时间：给 `pages` 表增加 `expires_at`，在读取和后台列表中过滤。
- 加公开广场：使用 `/api/pages/list/recent` 做最近分享列表。
- 加自定义域名：在 Cloudflare Workers 路由里绑定你的域名。

## Troubleshooting

| 问题 | 解决方法 |
| --- | --- |
| `No such module` 或静态资源 404 | 确认执行过 `npm install`，并通过 `npm run dev` 启动 Wrangler。 |
| D1 本地表不存在 | 运行 `npm run db:migrate:local`，再重启 `npm run dev`。 |
| 部署时报 D1 `database_id` 错误 | 手动部署时需要把 `wrangler d1 create` 输出写回 `wrangler.jsonc`；Deploy Button 流程会自动处理绑定。 |
| 首页任何人都能打开 | 默认 `AUTH_ENABLED=false` 方便体验；生产环境请在 Cloudflare 控制台设置为 `true`。 |
| 清理 Cookie 后后台看不到旧内容 | 后台按浏览器 owner cookie 区分内容。旧分享链接仍可访问，但当前浏览器会失去管理权。 |

## 致谢

- 原项目：[joeseesun/quickshare-cloudflare](https://github.com/joeseesun/quickshare-cloudflare)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [marked](https://github.com/markedjs/marked)
- [Playwright](https://playwright.dev/) 用于生成 README 截图

## License

ISC

---

<a name="english"></a>
## English

QuickShare Cloudflare turns AI-generated HTML, Markdown, SVG, and Mermaid into shareable links on your own Cloudflare account.

It stores large content bodies in R2, keeps metadata in D1, and serves everything through Cloudflare Workers.

## Features

- Paste HTML, Markdown, SVG, or Mermaid and get a clean `/view/<id>` URL.
- Optional 5-digit password per shared page.
- R2-backed content storage, D1-backed metadata.
- Owner-cookie based admin without user accounts.
- Admin page for listing, editing, opening, copying, protecting, and deleting your own shares.
- Deploy Button support for fast Cloudflare setup.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HaipingShi/goshare)

Recommended production variables:

```txt
AUTH_ENABLED=true
AUTH_PASSWORD=<your-strong-password>
COOKIE_SECRET=<openssl rand -hex 32>
```

## Custom Domain

By default, Cloudflare Workers are deployed to `*.workers.dev`. If you want to use your own custom domain (e.g., `share.example.com`), you can bind it in one of two ways:

### Method A: Via Cloudflare Dashboard (Recommended, Fully Automated)

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> select your Worker `quickshare`.
3. Go to the **Settings** tab -> click **Domains & Routes**.
4. Click **Add Custom Domain**.
5. Enter your domain (e.g., `share.yourdomain.com`) and save. Cloudflare will automatically configure DNS records and issue an SSL certificate for you.

### Method B: Via `wrangler.jsonc` Configuration

1. Open [wrangler.jsonc](file:///Users/geesh/projects/tempshare/wrangler.jsonc).
2. Uncomment the `routes` block and specify your custom domain:
   ```json
   "routes": [
     { "pattern": "share.yourdomain.com/*", "custom_domain": true }
   ]
   ```
3. Run the deploy command:
   ```bash
   npm run deploy
   ```
   Wrangler will register the custom domain routing inside your Cloudflare account.

## Local Development

```bash
npm install
npm run db:migrate:local
npm run dev
```

Run a dry deployment check:

```bash
npm run check
```

## Agent API

Set `AGENT_API_TOKEN` to let coding agents create share pages over HTTP without using the UI.

```bash
npx wrangler secret put AGENT_API_TOKEN
```

Create a page:

```bash
curl -X POST "https://your-share-domain.example/api/agent/pages" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Hello goshare\n\nCreated by an agent.",
    "codeType": "markdown",
    "markdownTheme": "github",
    "isProtected": false
  }'
```

The JSON response includes `success`, `url`, `urlId`, `runId`, `status`, and `logs`.

Minimal OpenAPI snippet:

```yaml
paths:
  /api/agent/pages:
    post:
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: string
                htmlContent:
                  type: string
                zipContent:
                  type: string
                codeType:
                  type: string
                  enum: [html, markdown, svg, mermaid, zip]
                markdownTheme:
                  type: string
                  enum: [bytedance, github, docs]
                isProtected:
                  type: boolean
      responses:
        "201":
          description: Page created
          content:
            application/json:
              schema:
                type: object
                required: [success, url, urlId, runId, status, logs]
                properties:
                  success:
                    type: boolean
                  url:
                    type: string
                  urlId:
                    type: string
                  runId:
                    type: string
                  status:
                    type: string
                    enum: [completed]
                  logs:
                    type: array
                    items:
                      type: object
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

Refresh README screenshots:

```bash
npm run capture:screenshots
```

Use another local URL:

```bash
SCREENSHOT_URL=http://127.0.0.1:9000 npm run capture:screenshots
```

## Architecture

- `src/worker.js`: Cloudflare Worker routes and API handlers
- `src/templates.js`: HTML templates for the index, admin, login, password, and error pages
- `src/renderers.js`: content type detection and rendering
- `public/`: static CSS, JS, icons, and assets
- `migrations/`: D1 schema migrations
- `docs/assets/`: README screenshots

## Notes

The admin page is intentionally lightweight. It uses an owner cookie to separate content created by different browsers. If the cookie is cleared, old public links still work, but that browser loses management access for those pages.

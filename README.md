# QuickShare

HTML/Markdown/SVG/Mermaid 内容分享工具。当前版本已改造成 Cloudflare Workers 应用，使用 R2 保存分享内容，使用 D1 保存页面元数据和密码保护状态。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/joeseesun/quickshare-cloudflare)

## 功能

- 创建并分享 HTML、Markdown、SVG、Mermaid 内容
- 可为分享链接启用 5 位数字密码
- R2 保存原始内容，避免把大正文塞进数据库
- D1 保存页面索引、创建时间、密码、内容类型和 R2 key
- 每个浏览器自动获得独立管理身份，可在后台管理自己创建的内容
- `/admin` 后台支持列表、查看、编辑、删除、切换密码保护
- Cloudflare Deploy Button 一键部署，并自动识别 D1/R2 绑定

## 技术栈

- Cloudflare Workers
- Cloudflare R2
- Cloudflare D1
- Workers Static Assets
- marked

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

默认本地地址由 Wrangler 输出，通常是 `http://localhost:8787`。

## 一键部署

点击 README 顶部的 **Deploy to Cloudflare** 按钮。Cloudflare 会读取 `wrangler.jsonc` 并在部署流程里创建和绑定：

- D1 数据库：`DB`
- R2 存储桶：`CONTENT_BUCKET`
- 静态资源绑定：`ASSETS`

部署命令来自 `package.json`：

```bash
npm run db:migrate:remote && wrangler deploy
```

D1 迁移使用绑定名 `DB`，这样用户在部署页修改数据库名称时迁移仍能正确执行。

## 环境变量

`wrangler.jsonc` 内置默认值：

```json
{
  "AUTH_ENABLED": "false",
  "AUTH_PASSWORD": "admin123",
  "COOKIE_SECRET": "change-me-before-production"
}
```

生产环境建议在 Cloudflare 控制台中修改：

- `AUTH_ENABLED=true`：开启创建页访问密码
- `AUTH_PASSWORD`：改为自己的强密码
- `COOKIE_SECRET`：改为随机字符串，例如 `openssl rand -hex 32`

## 手动部署

如果不使用一键部署，可以手动创建资源：

```bash
npx wrangler d1 create quickshare-db
npx wrangler r2 bucket create quickshare-content
```

把 D1 命令输出的 `database_id` 写回 `wrangler.jsonc` 后执行：

```bash
npm run deploy
```

## 数据结构

D1 表 `pages` 保存：

- `id`：短链接 ID
- `r2_key`：R2 对象 key
- `created_at`：创建时间戳
- `password` / `is_protected`：密码保护信息
- `code_type`：内容类型
- `content_size` / `content_sha256`：内容元信息
- `owner_key`：管理身份哈希，用于区分不同用户的内容列表
- `updated_at`：最后更新时间

R2 对象保存在 `pages/{id}.txt`。

## 内容管理

首页右上角的齿轮按钮会进入 `/admin`。系统会为当前浏览器保存一个私有 owner cookie，后台只展示这个 owner 创建的内容。

这个机制不需要注册账号，适合一键部署和轻量分享场景。清理浏览器 Cookie 后，仍然可以访问已经分享出去的链接，但当前浏览器会失去这些内容的管理权限。

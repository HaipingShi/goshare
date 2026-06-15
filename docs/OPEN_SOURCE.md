# goshare 开源发布清单

## 发布前必须确认

- 不提交 `.env`、`.dev.vars`、`.wrangler/`、`sessions/`。
- 不提交真实 `AUTH_PASSWORD`、`COOKIE_SECRET`、Cloudflare API Token 或其他密钥。
- `wrangler.jsonc` 不应包含个人自定义域名。
- `wrangler.jsonc` 中的 `database_id` 使用占位 UUID，用户部署时由 Cloudflare Deploy Button 或手动创建的 D1 数据库替换。
- 生产环境开启认证时，必须通过 Cloudflare Secret 设置 `AUTH_PASSWORD` 和 `COOKIE_SECRET`。
- `public/css/markdown-themes/github.css` 来自 MIT licensed `github-markdown-css`，发布时保留文件头来源说明。

## 推荐公开配置

这些值可以放在 `wrangler.jsonc` 的 `vars` 中：

```txt
APP_NAME=goshare
APP_DESCRIPTION=分享 AI 生成内容的最佳方式
APP_LOGO_URL=/icon/web/icon-512.png
APP_FOOTER_TEXT=
APP_FOOTER_URL=
APP_REPO_URL=https://github.com/HaipingShi/goshare
PUBLIC_SITE_URL=
AUTH_ENABLED=false
COOKIE_PREFIX=goshare
AI_ENABLED=true
AI_BEAUTIFY_MODEL=@cf/zai-org/glm-4.7-flash
MAX_BEAUTIFY_CONTENT_KB=120
```

这些值必须使用 Cloudflare Secret：

```txt
AUTH_PASSWORD
COOKIE_SECRET
```

设置命令：

```bash
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put COOKIE_SECRET
```

## 手动部署流程

```bash
npm install
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
npm run db:migrate:remote
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put COOKIE_SECRET
npm run deploy
```

部署后在 Cloudflare Dashboard 绑定自己的域名，并将 `PUBLIC_SITE_URL` 改成最终访问地址。

## 自举分享方式

部署完成后，打开：

```txt
/bootstrap
```

这个页面会展示：

- 项目结构和部署资源说明。
- Deploy to Cloudflare 按钮。
- 用户可编辑的一句话 AI 部署 prompt。
- 手动部署命令。

推荐的传播方式：

1. 将 `APP_REPO_URL` 改成公开 GitHub 仓库地址。
2. 将 `PUBLIC_SITE_URL` 改成你的线上地址。
3. 打开 `/bootstrap`。
4. 复制页面内容或直接分享该 URL。
5. 用户把页面生成的一句话给 AI，即可被引导部署自己的分享站。

## 页面提交数据

非 ZIP 分享页会自动注入 `window.goshare`，可以写入 D1 表 `page_submissions`：

```js
await window.goshare.submit({ email: 'user@example.com' }, { kind: 'lead' });
```

HTML 表单也可以零代码提交：

```html
<form data-goshare-submit data-goshare-kind="lead">
  <input name="email" type="email">
  <button type="submit">提交</button>
  <p data-goshare-status></p>
</form>
```

默认限制：

- 单次提交 JSON 不超过 64KB。
- 受密码保护的页面需要先通过访问密码验证。
- ZIP 静态网站暂不注入 SDK。
- owner 可通过后台提交数据面板查看最近 50 条提交。

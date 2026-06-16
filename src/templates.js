const DEFAULT_APP_NAME = 'goshare';
const DEFAULT_APP_DESCRIPTION = '分享 AI 生成内容的最佳方式';
const DEFAULT_REPO_URL = 'https://github.com/HaipingShi/goshare';
const DEFAULT_APP_LOGO_URL = '/icon/web/icon-512.png';

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAppConfig(env = {}) {
  const appName = String(env.APP_NAME || DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;
  const appDescription = String(env.APP_DESCRIPTION || DEFAULT_APP_DESCRIPTION).trim() || DEFAULT_APP_DESCRIPTION;
  const footerText = String(env.APP_FOOTER_TEXT || '').trim();
  const footerUrl = String(env.APP_FOOTER_URL || '').trim();
  const repoUrl = String(env.APP_REPO_URL || DEFAULT_REPO_URL).trim() || DEFAULT_REPO_URL;
  const publicSiteUrl = String(env.PUBLIC_SITE_URL || '').trim();
  const logoUrl = String(env.APP_LOGO_URL || DEFAULT_APP_LOGO_URL).trim() || DEFAULT_APP_LOGO_URL;

  return {
    appName,
    appDescription,
    footerText,
    footerUrl,
    repoUrl,
    publicSiteUrl,
    logoUrl,
  };
}

function buildDeployButtonUrl(repoUrl) {
  return `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(repoUrl)}`;
}

function safeScriptString(value) {
  return JSON.stringify(String(value || ''))
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function cssString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatShareDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '刚刚发布';
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function appTitleSpans(appName) {
  return appName.split('').map((char) => `<span>${escapeHtml(char)}</span>`).join('');
}

function head({ title, extraHead = '', env, defaultOg = true } = {}) {
  const config = getAppConfig(env);
  const defaultOgTags = defaultOg ? `
    <meta property="og:title" content="${escapeHtml(config.appName)} | ${escapeHtml(config.appDescription)}">
    <meta property="og:description" content="一个简单、高效的HTML代码分享平台">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${escapeHtml(config.logoUrl)}">` : '';
  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/icon/web/favicon.ico" sizes="any">
    <link rel="apple-touch-icon" href="${escapeHtml(config.logoUrl)}">
    <link rel="icon" type="image/png" sizes="192x192" href="/icon/web/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="${escapeHtml(config.logoUrl)}">
    <meta name="theme-color" content="#6366f1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(config.appName)}">
    ${defaultOgTags}
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/atom-one-dark.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Roboto:wght@300;400;500;700&family=Fira+Code:wght@300;400;500&display=swap" rel="stylesheet">
    ${extraHead}
  `;
}

function chromeStart(title, options = {}) {
  const htmlAttrs = options.htmlAttrs || 'lang="zh-CN"';
  return `<!DOCTYPE html>
<html ${htmlAttrs}>
<head>
  ${head({ title, extraHead: options.extraHead, env: options.env, defaultOg: options.defaultOg })}
</head>
<body>
  <div class="app-container">
    <div class="grid-background"></div>
    <div id="particles-js"></div>
    <div class="content-container">`;
}

function chromeEnd({ includeMain = true, includeAdminLink = false, includeAdmin = false } = {}) {
  return `
    </div>
    ${includeAdminLink ? `
    <a class="admin-entry-link" href="/admin" aria-label="内容管理" title="内容管理">
      <i class="fas fa-cog"></i>
    </a>` : ''}
    <div class="theme-toggle">
      <button id="theme-toggle-btn" class="theme-toggle-btn" aria-label="切换主题">
        <i class="fas fa-moon"></i>
      </button>
    </div>
    <div id="error-toast" class="toast error-toast">
      <div class="toast-content">
        <i class="fas fa-exclamation-circle toast-icon"></i>
        <span id="error-message" class="toast-message"></span>
      </div>
    </div>
    <div id="success-toast" class="toast success-toast">
      <div class="toast-content">
        <i class="fas fa-check-circle toast-icon"></i>
        <span id="success-message" class="toast-message"></span>
      </div>
    </div>
    <!-- 智能检测与警告弹窗 -->
    <div id="alert-modal" class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <i class="fas fa-exclamation-triangle modal-warn-icon"></i>
          <h3 id="modal-title" class="modal-title">警告提示</h3>
        </div>
        <div class="modal-body" id="modal-message">
          <!-- 动态注入警告信息 -->
        </div>
        <div class="modal-footer">
          <button id="modal-close-btn" class="cyber-btn cyber-btn-primary">我知道了</button>
        </div>
      </div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/html.min.js"></script>
  <script src="/js/theme.js"></script>
  <script src="/js/particles-config.js"></script>
  ${includeMain ? '<script src="/js/main.js?v=cloudflare"></script><script src="/js/syntax-highlight.js"></script>' : ''}
  ${includeAdmin ? '<script src="/js/admin.js?v=cloudflare"></script>' : ''}
</body>
</html>`;
}

function appHeader(env) {
  const config = getAppConfig(env);
  return `
    <header class="app-header">
      <div class="title-container" style="--app-title-ghost: '${escapeHtml(cssString(config.appName))}';">
        <h1 class="cyber-title">${appTitleSpans(config.appName)}</h1>
      </div>
      <p class="app-description">${escapeHtml(config.appDescription)}</p>
    </header>`;
}

function appFooter(env) {
  const config = getAppConfig(env);
  const defaultText = `@2026 ${config.appName}`;
  const text = config.footerText || defaultText;
  const footerContent = config.footerUrl
    ? `<a href="${escapeHtml(config.footerUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
    : escapeHtml(text);

  return `
    <footer class="app-footer">
      <p class="footer-text">${footerContent}</p>
    </footer>`;
}

export function renderIndexPage(env) {
  const config = getAppConfig(env);
  return `${chromeStart(`${config.appName} | 分享 HTML 代码的简单方式`, { env })}
<div class="main-container">
  ${appHeader(env)}
  <div class="content-area">
    <div class="card input-card">
      <div class="input-section">
        <div id="loading-indicator" class="loading-indicator">
          <div class="spinner"></div>
          <span>处理中...</span>
        </div>
        <div id="code-input-container" role="tabpanel">
          <div id="code-type-indicator" class="code-type-indicator html-type">
            <i class="fas fa-code"></i>
            <span id="code-type-text">HTML</span>
          </div>
          <textarea id="html-input" class="cyber-input" placeholder="在这里粘贴你的 HTML/Markdown/SVG/Mermaid 代码..." aria-label="HTML 代码输入区域"></textarea>
        </div>
        <div style="display: none;">
          <input id="html-file" type="file" class="hidden" accept=".html,.htm,.md,.markdown,.svg,.txt,.zip" aria-label="上传文件" />
          <p id="file-name" class="mt-3" style="color: var(--primary);"></p>
        </div>
        <div class="input-actions">
          <div class="input-actions-left">
            <label for="html-file" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="上传 HTML/ZIP/Markdown/SVG 文件" aria-label="上传文件">
              <i class="fas fa-file-upload mr-1" aria-hidden="true"></i>上传文件
            </label>
            <label class="markdown-theme-control" for="markdown-theme-select">
              <span>Markdown 模板</span>
              <select id="markdown-theme-select" class="markdown-theme-select" disabled>
                <option value="bytedance">字节风格</option>
                <option value="github">GitHub</option>
                <option value="docs">技术文档</option>
              </select>
            </label>
          </div>
          <div class="input-actions-right">
            <button id="clear-button" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="清空内容" aria-label="清空内容">
              <i class="fas fa-eraser mr-1" aria-hidden="true"></i>清除
            </button>
            <button id="preview-render-button" class="cyber-btn cyber-btn-primary tooltip micro-interaction" data-tooltip="先渲染预览" aria-label="渲染预览">
              <i class="fas fa-eye mr-1" aria-hidden="true"></i>预览
            </button>
            <button id="beautify-button" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="调用 Cloudflare AI 美化" aria-label="智能美化" disabled>
              <i class="fas fa-magic mr-1" aria-hidden="true"></i>智能美化
            </button>
            <button id="generate-button" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="确认后生成分享链接" aria-label="确认生成分享链接" disabled>
              <i class="fas fa-link mr-1" aria-hidden="true"></i>确认生成
            </button>
          </div>
        </div>
      </div>
    </div>
    <div id="preview-section" class="card preview-card" hidden aria-live="polite">
      <div class="preview-card-header">
        <div>
          <h3 class="section-title">渲染预览</h3>
          <p id="preview-status" class="preview-status">未生成预览</p>
        </div>
        <div class="preview-card-actions">
          <button id="preview-refresh-button" class="action-btn tooltip micro-interaction" data-tooltip="重新预览" aria-label="重新预览">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <iframe id="render-preview-frame" class="render-preview-frame" title="渲染预览" sandbox="allow-scripts"></iframe>
    </div>
    <div id="result-section" class="card result-card" style="display: none;" aria-live="polite">
      <h3 class="section-title" style="color: var(--primary); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">链接已生成</h3>
      <div id="result-meta" class="result-meta" style="display: none;"></div>
      <div class="result-container">
        <div id="result-url" class="result-url" tabindex="0"></div>
        <div class="action-buttons">
          <button id="share-card-button" class="action-btn share-card-btn tooltip micro-interaction" data-tooltip="打开分享卡片" aria-label="打开分享卡片">
            <i class="fas fa-id-card" aria-hidden="true"></i>
          </button>
          <button id="preview-button" class="action-btn preview-btn tooltip micro-interaction" data-tooltip="打开内容页" aria-label="打开内容页">
            <i class="fas fa-external-link-alt" aria-hidden="true"></i>
          </button>
          <button id="copy-button" class="action-btn tooltip micro-interaction" data-tooltip="复制链接" aria-label="复制链接">
            <i class="fas fa-copy" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="password-protection-toggle">
        <div class="protection-controls">
          <div class="switch-container">
            <input type="checkbox" id="password-toggle" class="switch-checkbox">
            <label for="password-toggle" class="switch-label"></label>
          </div>
          <div id="password-info" class="password-info" style="display: none; margin-left: 15px;">
            <span id="generated-password" class="generated-password" style="display: inline-block; cursor: pointer;" title="点击复制密码"></span>
            <a href="#" id="copy-password-link" class="copy-password-link" style="display: inline-block; margin-left: 10px;">复制密码和网址</a>
          </div>
        </div>
      </div>
    </div>
    <div class="card instructions-card">
      <h3 class="instructions-title">
        <i class="fas fa-info-circle"></i> 使用说明与支持类型
      </h3>
      <div class="instructions-grid">
        <div class="instructions-col">
          <h4 class="instructions-col-title">📝 代码与文档类型</h4>
          <ul class="instructions-list">
            <li><strong>HTML</strong>: 支持单页面（包含内联 CSS 和 JS）直接渲染</li>
            <li><strong>Markdown</strong>: 自动解析并渲染为美观排版的文档</li>
            <li><strong>SVG / Mermaid</strong>: 自动渲染为矢量图形、流程图与图表</li>
          </ul>
        </div>
        <div class="instructions-col">
          <h4 class="instructions-col-title">📦 ZIP 静态网站托管</h4>
          <ul class="instructions-list">
            <li>将静态网页的<b>所有构建产物</b>打包成 ZIP 格式压缩上传</li>
            <li>压缩包最外层根目录<b>必须</b>包含 <code>index.html</code> 首页入口文件</li>
            <li>Vite/React 等项目请先在构建配置中设置 <code>base: './'</code>，然后运行 <code>npm run build</code> 构建打包，最后将 <code>dist</code> 文件夹下的<b>所有内容</b>直接压缩后上传（不要包含源码文件夹 <code>src</code> 或外层 <code>dist</code> 文件夹本身）</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  ${appFooter(env)}
</div>
${chromeEnd({ includeMain: true, includeAdminLink: true })}`;
}

export function renderBootstrapPage(env) {
  const config = getAppConfig(env);
  const deployUrl = buildDeployButtonUrl(config.repoUrl);
  const displaySiteUrl = config.publicSiteUrl || 'https://your-share-domain.example';
  const extraHead = `
    <style>
      body {
        min-height: 100vh;
        overflow-x: hidden;
      }
      .bootstrap-shell {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      .bootstrap-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: 28px;
        align-items: center;
        padding: 24px 0 18px;
      }
      .bootstrap-kicker {
        color: var(--secondary);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.78rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .bootstrap-title {
        font-family: 'Orbitron', sans-serif;
        font-size: clamp(2rem, 5vw, 4.25rem);
        line-height: 1;
        color: var(--text-primary);
        margin-bottom: 16px;
      }
      .bootstrap-lede {
        max-width: 720px;
        color: var(--text-secondary);
        font-size: 1.05rem;
        line-height: 1.8;
      }
      .bootstrap-icon {
        width: 180px;
        height: 180px;
        justify-self: end;
        border-radius: 28px;
        box-shadow: 0 24px 70px rgba(99, 102, 241, 0.35);
      }
      .bootstrap-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
      }
      .bootstrap-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .bootstrap-card {
        min-height: 100%;
      }
      .bootstrap-card h2,
      .bootstrap-card h3 {
        font-family: 'Orbitron', sans-serif;
        font-size: 1rem;
        color: var(--text-primary);
        margin-bottom: 12px;
      }
      .bootstrap-card p,
      .bootstrap-card li,
      .bootstrap-card label {
        color: var(--text-secondary);
        line-height: 1.7;
      }
      .bootstrap-card ul,
      .bootstrap-card ol {
        padding-left: 20px;
      }
      .bootstrap-wide {
        grid-column: span 2;
      }
      .bootstrap-agent-card {
        border-color: rgba(245, 158, 11, 0.55);
        box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.12), 0 20px 60px rgba(15, 23, 42, 0.3);
      }
      .bootstrap-agent-note {
        margin: 0 0 14px;
        color: rgba(255, 255, 255, 0.82);
      }
      .bootstrap-form {
        display: grid;
        gap: 12px;
      }
      .bootstrap-field {
        display: grid;
        gap: 6px;
      }
      .bootstrap-field input {
        width: 100%;
        min-height: 42px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 10px 12px;
        background: var(--bg-input);
        color: var(--text-primary);
        font: inherit;
      }
      .bootstrap-checks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .bootstrap-check {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .bootstrap-output {
        width: 100%;
        min-height: 170px;
        resize: vertical;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.92);
        color: var(--text-primary);
        font-family: 'Fira Code', monospace;
        font-size: 0.86rem;
        line-height: 1.6;
      }
      .bootstrap-code {
        overflow: auto;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 14px;
        background: rgba(15, 23, 42, 0.92);
        color: var(--text-primary);
        font-family: 'Fira Code', monospace;
        font-size: 0.82rem;
        line-height: 1.6;
      }
      .bootstrap-field-list {
        display: grid;
        gap: 12px;
        margin: 0;
      }
      .bootstrap-field-list div {
        display: grid;
        gap: 4px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-color);
      }
      .bootstrap-field-list div:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      .bootstrap-field-list dt {
        color: var(--text-primary);
        font-weight: 700;
      }
      .bootstrap-field-list dd {
        margin: 0;
        color: var(--text-secondary);
        line-height: 1.6;
      }
      @media (max-width: 860px) {
        .bootstrap-hero,
        .bootstrap-grid {
          grid-template-columns: 1fr;
        }
        .bootstrap-wide {
          grid-column: span 1;
        }
        .bootstrap-icon {
          justify-self: start;
          width: 96px;
          height: 96px;
          border-radius: 18px;
        }
        .bootstrap-checks {
          grid-template-columns: 1fr;
        }
      }
    </style>`;
  const starterPrompt = `请作为我的 ${config.appName} Cloudflare 部署向导，逐步检查并引导我完成生产部署。源码仓库是 ${config.repoUrl}，目标站点域名是 ${displaySiteUrl}。请按顺序确认 Worker、Static Assets、R2、D1、远端 migrations、AUTH_PASSWORD、COOKIE_SECRET、AGENT_API_TOKEN、APP_LOGO_URL、PUBLIC_SITE_URL、自定义域名和 /api/agent/pages 冒烟测试。每一步先告诉我目的和风险，再给我需要执行的命令或 Cloudflare 控制台操作。`;

  return `${chromeStart(`${config.appName} | 自部署引导`, { htmlAttrs: 'lang="zh-CN" data-page="bootstrap-page"', extraHead, env })}
<main class="bootstrap-shell">
  <section class="bootstrap-hero">
    <div>
      <div class="bootstrap-kicker">Self-host your share station</div>
      <h1 class="bootstrap-title">${escapeHtml(config.appName)}</h1>
      <p class="bootstrap-lede">${escapeHtml(config.appName)} 可以把 AI 生成的 HTML、Markdown、SVG、Mermaid 和静态 ZIP 变成一个可分享链接。这个页面用于把项目、部署步骤和 AI 引导词打包成一个可直接分享的入口。</p>
      <div class="bootstrap-actions">
        <a class="cyber-btn cyber-btn-primary micro-interaction" href="${escapeHtml(deployUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fas fa-cloud-upload-alt mr-1" aria-hidden="true"></i>Deploy to Cloudflare
        </a>
        <a class="cyber-btn cyber-btn-secondary micro-interaction" href="${escapeHtml(config.repoUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-github mr-1" aria-hidden="true"></i>查看源码
        </a>
      </div>
    </div>
    <img id="bootstrap-logo-preview" class="bootstrap-icon" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.appName)} icon">
  </section>

  <section class="bootstrap-grid">
    <article class="card bootstrap-card">
      <h2><i class="fas fa-layer-group" aria-hidden="true"></i> 项目组成</h2>
      <ul>
        <li>Worker API 负责渲染、创建分享页和 AI 美化。</li>
        <li>R2 保存用户提交的原始内容或静态网站文件。</li>
        <li>D1 保存短链、owner、密码状态和内容元数据。</li>
        <li>Workers AI 提供预览后的一键美化能力。</li>
      </ul>
    </article>
    <article class="card bootstrap-card">
      <h2><i class="fas fa-sliders-h" aria-hidden="true"></i> 部署时配置</h2>
      <ul>
        <li><code>APP_NAME</code>：你的分享站名称。</li>
        <li><code>APP_LOGO_URL</code>：你的 logo 图片 URL，建议使用 512x512 PNG。</li>
        <li><code>AUTH_ENABLED</code>：生产默认保持 <code>true</code>，保护首页、创建接口、预览和后台。</li>
        <li><code>AUTH_PASSWORD</code>：后台入口密码，必须用 Secret。</li>
        <li><code>COOKIE_SECRET</code>：Cookie 签名密钥，必须用 Secret。</li>
        <li><code>PUBLIC_SITE_URL</code>：绑定后的公开域名。</li>
      </ul>
    </article>
    <article class="card bootstrap-card">
      <h2><i class="fas fa-shield-alt" aria-hidden="true"></i> 开源安全</h2>
      <ul>
        <li>不要提交 <code>.env</code>、<code>.dev.vars</code> 或真实生产脚本。</li>
        <li>不要把个人域名、真实数据库 ID 当成模板默认值。</li>
        <li>公开仓库只保留可复制、可替换的示例配置。</li>
      </ul>
    </article>

    <article class="card bootstrap-card bootstrap-wide">
      <h2><i class="fas fa-circle-question" aria-hidden="true"></i> Cloudflare 部署表单怎么填</h2>
      <p>Deploy to Cloudflare 会读取仓库里的 <code>wrangler.jsonc</code>。页面里的字段不是让你买额外服务，而是在为这个 Worker 创建项目、数据库、存储桶和环境变量。</p>
      <dl class="bootstrap-field-list">
        <div>
          <dt>Project name</dt>
          <dd>Cloudflare Worker 的项目名。建议填 <code>goshare</code> 或你自己的短名称，例如 <code>my-share</code>。这个名字会影响 workers.dev 默认域名。</dd>
        </div>
        <div>
          <dt>Select D1 database</dt>
          <dd>D1 是 Cloudflare 的轻量数据库，用来保存短链 ID、标题摘要、访问密码状态、owner 和页面提交数据。首次部署选择 <code>Create new</code> 即可。</dd>
        </div>
        <div>
          <dt>R2 bucket / CONTENT_BUCKET</dt>
          <dd>R2 是对象存储，用来保存用户粘贴的 HTML、Markdown、SVG、Mermaid 或 ZIP 文件正文。首次部署选择创建新 bucket。</dd>
        </div>
        <div>
          <dt>APP_NAME / APP_DESCRIPTION / APP_LOGO_URL</dt>
          <dd>站点品牌配置。<code>APP_LOGO_URL</code> 可以先保留默认 <code>/icon/web/icon-512.png</code>；如果要用自己的图片，必须是公网可访问 URL。</dd>
        </div>
        <div>
          <dt>PUBLIC_SITE_URL</dt>
          <dd>站点最终公开地址，例如 <code>https://share.example.com</code>。还没有域名时可以先留空，部署完成后把 workers.dev 地址或自定义域名补进去。</dd>
        </div>
        <div>
          <dt>AUTH_PASSWORD / COOKIE_SECRET / AGENT_API_TOKEN</dt>
          <dd>这些是 Secret，不建议写进代码仓库。<code>AUTH_PASSWORD</code> 是后台入口密码；<code>COOKIE_SECRET</code> 用于签名登录 Cookie；<code>AGENT_API_TOKEN</code> 给 AI coding agent 调 API 创建分享页。</dd>
        </div>
        <div>
          <dt>AUTH_ENABLED</dt>
          <dd>生产默认保持 <code>true</code>。关闭后首页、创建接口、预览、智能美化和后台管理会暴露给所有访问者，可能带来资源消耗和垃圾内容风险。</dd>
        </div>
        <div>
          <dt>AI_ENABLED / AI_SHARE_METADATA_ENABLED</dt>
          <dd>控制 Cloudflare Workers AI 功能。开启后会消耗部署者自己的 Cloudflare 账号额度；关闭后分享页仍可创建，只是智能美化和 AI 标题摘要不可用或改用规则提取。</dd>
        </div>
        <div>
          <dt>SECURITY_SCAN_ENABLED</dt>
          <dd>创建分享页前的规则扫描。默认开启，会拦截明显钓鱼、凭据采集、Cookie 外传、自动跳转和高混淆脚本。它是防护栏，不是完整杀毒引擎。</dd>
        </div>
        <div>
          <dt>DAILY_CREATE_LIMIT / DAILY_AGENT_CREATE_LIMIT / DAILY_AI_LIMIT</dt>
          <dd>每日额度，按 UTC 日期重置。默认网页创建 50 次/访问者、Agent API 200 次/token、智能美化 20 次/访问者；设置为 <code>0</code> 表示不限制。</dd>
        </div>
        <div>
          <dt>APP_FOOTER_TEXT / APP_FOOTER_URL</dt>
          <dd>这是可选页脚配置，不需要在首次部署表单里填写。部署完成后，如果你想在页面底部显示品牌、备案号或官网链接，再到 Worker Variables 手动新增即可。</dd>
        </div>
      </dl>
    </article>

    <article class="card bootstrap-card bootstrap-wide bootstrap-agent-card">
      <h2><i class="fas fa-terminal" aria-hidden="true"></i> 给 AI Agent 的部署 Prompt</h2>
      <p class="bootstrap-agent-note">复制下面这段话给 Codex、Claude Code 或其他 coding agent，让它陪你完成 Cloudflare 生产部署和冒烟测试。</p>
      <form class="bootstrap-form" id="bootstrap-prompt-form">
        <div class="bootstrap-field">
          <label for="bootstrap-domain">我的域名</label>
          <input id="bootstrap-domain" type="text" placeholder="share.example.com" value="${escapeHtml(config.publicSiteUrl.replace(/^https?:\/\//, ''))}">
        </div>
        <div class="bootstrap-field">
          <label for="bootstrap-name">站点名称</label>
          <input id="bootstrap-name" type="text" value="${escapeHtml(config.appName)}">
        </div>
        <div class="bootstrap-field">
          <label for="bootstrap-logo">Logo 图片 URL</label>
          <input id="bootstrap-logo" type="url" placeholder="https://example.com/logo.png" value="${escapeHtml(config.logoUrl.startsWith('/') ? '' : config.logoUrl)}">
        </div>
        <div class="bootstrap-checks">
          <label class="bootstrap-check"><input id="bootstrap-ai" type="checkbox" checked> 启用 AI 美化</label>
          <label class="bootstrap-check"><input id="bootstrap-auth" type="checkbox" checked> 开启后台密码</label>
        </div>
        <textarea id="bootstrap-prompt" class="bootstrap-output" readonly>${escapeHtml(starterPrompt)}</textarea>
        <div class="bootstrap-actions">
          <button id="bootstrap-copy" type="button" class="cyber-btn cyber-btn-primary micro-interaction">
            <i class="fas fa-copy mr-1" aria-hidden="true"></i>复制部署 Prompt
          </button>
          <a class="cyber-btn cyber-btn-secondary micro-interaction" href="${escapeHtml(deployUrl)}" target="_blank" rel="noopener noreferrer">
            <i class="fas fa-external-link-alt mr-1" aria-hidden="true"></i>打开部署页
          </a>
        </div>
      </form>
    </article>

    <article class="card bootstrap-card">
      <h2><i class="fas fa-list-check" aria-hidden="true"></i> 手动部署</h2>
      <pre class="bootstrap-code">npm install
npx wrangler d1 create goshare-db
npx wrangler r2 bucket create goshare-content
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put COOKIE_SECRET
npx wrangler secret put AGENT_API_TOKEN
npm run deploy</pre>
    </article>
  </section>
</main>
${appFooter(env)}
<script>
  (function() {
    const repoUrl = ${safeScriptString(config.repoUrl)};
    const promptInput = document.getElementById('bootstrap-prompt');
    const domainInput = document.getElementById('bootstrap-domain');
    const nameInput = document.getElementById('bootstrap-name');
    const logoInput = document.getElementById('bootstrap-logo');
    const logoPreview = document.getElementById('bootstrap-logo-preview');
    const aiInput = document.getElementById('bootstrap-ai');
    const authInput = document.getElementById('bootstrap-auth');
    const copyButton = document.getElementById('bootstrap-copy');

    function renderPrompt() {
      const name = (nameInput.value || 'goshare').trim();
      const domain = (domainInput.value || 'share.example.com').trim();
      const logoUrl = (logoInput.value || '').trim();
      const aiText = aiInput.checked ? '启用 Workers AI 美化功能' : '先不启用 AI 美化功能';
      const authText = authInput.checked ? '开启后台访问密码' : '首页暂时不加后台密码';
      const logoText = logoUrl ? '自定义 logo 地址是 ' + logoUrl + '，' : '';
      promptInput.value = '请作为我的 ' + name + ' Cloudflare 部署向导，逐步检查并引导我完成生产部署。源码仓库是 ' + repoUrl + '，目标站点域名是 ' + domain + '。' + logoText + '请按顺序确认 Worker、Static Assets、R2、D1、远端 migrations、' + authText + '、' + aiText + '、AUTH_PASSWORD、COOKIE_SECRET、AGENT_API_TOKEN、APP_LOGO_URL、PUBLIC_SITE_URL、自定义域名和 /api/agent/pages 冒烟测试。每一步先告诉我目的和风险，再给我需要执行的命令或 Cloudflare 控制台操作。';
      if (logoPreview && logoUrl) logoPreview.src = logoUrl;
    }

    [domainInput, nameInput, logoInput, aiInput, authInput].forEach((element) => {
      element.addEventListener('input', renderPrompt);
      element.addEventListener('change', renderPrompt);
    });

    copyButton.addEventListener('click', async () => {
      await navigator.clipboard.writeText(promptInput.value);
      copyButton.innerHTML = '<i class="fas fa-check mr-1" aria-hidden="true"></i>已复制';
      setTimeout(() => {
        copyButton.innerHTML = '<i class="fas fa-copy mr-1" aria-hidden="true"></i>复制这句话';
      }, 1600);
    });

    renderPrompt();
  })();
</script>
${chromeEnd({ includeMain: false })}`;
}

export function renderShareCardPage({ page, shareUrl, viewUrl }, env) {
  const config = getAppConfig(env);
  const title = page.title || page.id;
  const summary = page.summary || '一份通过 goshare 发布的内容。';
  const codeType = String(page.code_type || 'html').toUpperCase();
  const isProtected = page.is_protected === 1 || page.is_protected === true;
  const createdDate = formatShareDate(page.created_at);
  const extraHead = `
    <meta name="description" content="${escapeHtml(summary)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(summary)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:image" content="${escapeHtml(config.logoUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(summary)}">
    <style>
      body[data-page="share-card-page"] {
        min-height: 100vh;
        background:
          radial-gradient(circle at 20% 10%, rgba(99, 102, 241, 0.18), transparent 30%),
          radial-gradient(circle at 82% 18%, rgba(34, 211, 238, 0.14), transparent 26%),
          linear-gradient(145deg, #090f1f 0%, #111827 52%, #172033 100%);
        color: #f8fafc;
      }

      body[data-page="share-card-page"] .app-container {
        min-height: 100vh;
      }

      body[data-page="share-card-page"] .content-container {
        width: min(100%, 720px);
        min-height: 100vh;
        margin: 0 auto;
        padding: 24px;
        display: flex;
        align-items: center;
      }

      .share-cover {
        width: 100%;
      }

      .share-card {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.84);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(18px);
      }

      .share-card::before {
        content: "";
        display: block;
        height: 6px;
        background: linear-gradient(90deg, #22d3ee, #6366f1, #f43f5e);
      }

      .share-card-inner {
        padding: clamp(24px, 7vw, 48px);
      }

      .share-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 40px;
      }

      .share-logo {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        object-fit: cover;
        background: rgba(255, 255, 255, 0.08);
      }

      .share-brand-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .share-app-name {
        font: 700 0.98rem 'Orbitron', sans-serif;
        letter-spacing: 0;
      }

      .share-app-desc {
        color: #94a3b8;
        font-size: 0.84rem;
      }

      .share-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 18px;
      }

      .share-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        color: #cbd5e1;
        font-size: 0.82rem;
      }

      .share-title {
        margin: 0;
        color: #f8fafc;
        font-size: clamp(2rem, 7vw, 4rem);
        line-height: 1.05;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }

      .share-summary {
        margin: 18px 0 0;
        color: #cbd5e1;
        font-size: clamp(1rem, 3.4vw, 1.22rem);
        line-height: 1.7;
        overflow-wrap: anywhere;
      }

      .share-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 36px;
      }

      .share-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.07);
        text-decoration: none;
        cursor: pointer;
      }

      .share-button.primary {
        border-color: transparent;
        background: linear-gradient(135deg, #2563eb, #0891b2);
      }

      .share-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
        color: #94a3b8;
        font-size: 0.86rem;
      }

      @media (max-width: 640px) {
        body[data-page="share-card-page"] .content-container {
          padding: 16px;
          align-items: stretch;
        }

        .share-card {
          min-height: calc(100vh - 32px);
          display: flex;
          align-items: center;
        }

        .share-actions {
          flex-direction: column;
        }

        .share-button {
          width: 100%;
        }
      }
    </style>`;

  return `${chromeStart(`${title} | ${config.appName}`, { htmlAttrs: 'lang="zh-CN" data-page="share-card-page"', extraHead, env, defaultOg: false })}
<main class="share-cover" aria-label="分享卡片">
  <article class="share-card">
    <div class="share-card-inner">
      <div class="share-brand">
        <img class="share-logo" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.appName)} logo">
        <div class="share-brand-text">
          <span class="share-app-name">${escapeHtml(config.appName)}</span>
          <span class="share-app-desc">${escapeHtml(config.appDescription)}</span>
        </div>
      </div>
      <div class="share-badges">
        <span class="share-badge"><i class="fas fa-file-code" aria-hidden="true"></i>${escapeHtml(codeType)}</span>
        <span class="share-badge"><i class="fas ${isProtected ? 'fa-lock' : 'fa-unlock'}" aria-hidden="true"></i>${isProtected ? '需要访问密码' : '公开分享'}</span>
      </div>
      <h1 class="share-title">${escapeHtml(title)}</h1>
      <p class="share-summary">${escapeHtml(summary)}</p>
      <div class="share-actions">
        <a class="share-button primary" href="${escapeHtml(viewUrl)}">
          <i class="fas fa-external-link-alt" aria-hidden="true"></i>
          <span>打开内容</span>
        </a>
        <button class="share-button" type="button" data-copy-share="${escapeHtml(shareUrl)}">
          <i class="fas fa-copy" aria-hidden="true"></i>
          <span>复制卡片链接</span>
        </button>
      </div>
      <div class="share-meta">
        <span>${escapeHtml(createdDate)}</span>
        <span>${escapeHtml(page.id)}</span>
      </div>
    </div>
  </article>
</main>
<script>
document.querySelector('[data-copy-share]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const link = button.getAttribute('data-copy-share');
  try {
    await navigator.clipboard.writeText(link);
    button.querySelector('span').textContent = '已复制';
    setTimeout(() => {
      button.querySelector('span').textContent = '复制卡片链接';
    }, 1400);
  } catch {
    window.prompt('复制链接', link);
  }
});
</script>
${chromeEnd({ includeMain: false })}`;
}

export function renderAdminPage(env) {
  const config = getAppConfig(env);
  const extraHead = `
    <style>
      body {
        overflow: auto;
        min-height: 100vh;
      }
      .admin-shell {
        width: min(1180px, calc(100vw - 32px));
        min-height: calc(100vh - 64px);
        margin: 32px auto;
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.26);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
      [data-theme="light"] .admin-shell {
        background: rgba(255, 255, 255, 0.92);
      }
      .admin-sidebar {
        border-right: 1px solid var(--border-color);
        padding: 22px 16px;
        background: rgba(15, 23, 42, 0.32);
      }
      [data-theme="light"] .admin-sidebar {
        background: rgba(241, 245, 249, 0.86);
      }
      .admin-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-primary);
        text-decoration: none;
        font-family: 'Orbitron', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        margin-bottom: 28px;
      }
      .admin-brand i {
        color: var(--primary-light);
      }
      .admin-nav {
        display: grid;
        gap: 8px;
      }
      .admin-nav a,
      .admin-nav button {
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--text-secondary);
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 6px;
        font: inherit;
        cursor: pointer;
      }
      .admin-nav a.active,
      .admin-nav a:hover,
      .admin-nav button:hover {
        background: rgba(var(--primary-rgb), 0.16);
        color: var(--text-primary);
      }
      .admin-main {
        min-width: 0;
        padding: 24px;
      }
      .admin-topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
      }
      .admin-kicker {
        color: var(--text-secondary);
        font-size: 0.82rem;
        margin-bottom: 4px;
      }
      .admin-title {
        font-size: 1.42rem;
        line-height: 1.2;
        margin: 0;
      }
      .admin-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-button {
        min-height: 36px;
        border: 1px solid var(--border-color);
        background: rgba(var(--primary-rgb), 0.14);
        color: var(--text-primary);
        border-radius: 6px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        text-decoration: none;
        font-size: 0.9rem;
      }
      .admin-button.primary {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
      }
      .admin-button.danger {
        background: rgba(244, 63, 94, 0.14);
        border-color: rgba(244, 63, 94, 0.42);
        color: #fb7185;
      }
      .admin-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 16px;
      }
      .admin-submissions-panel {
        grid-column: 1 / -1;
      }
      .admin-panel {
        min-width: 0;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.42);
      }
      [data-theme="light"] .admin-panel {
        background: rgba(255, 255, 255, 0.82);
      }
      .admin-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border-color);
      }
      .admin-panel-title {
        font-size: 1rem;
        margin: 0;
      }
      .admin-table-wrap {
        overflow: auto;
      }
      .admin-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 690px;
      }
      .admin-table th,
      .admin-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(99, 102, 241, 0.16);
        text-align: left;
        vertical-align: middle;
        font-size: 0.9rem;
      }
      .admin-table th {
        color: var(--text-secondary);
        font-weight: 600;
        white-space: nowrap;
      }
      .admin-table tr {
        cursor: pointer;
      }
      .admin-table tr:hover {
        background: rgba(var(--primary-rgb), 0.08);
      }
      .admin-table tr.selected {
        background: rgba(var(--primary-rgb), 0.16);
      }
      .admin-submissions-table {
        min-width: 760px;
      }
      .admin-submission-payload {
        max-width: 520px;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      .admin-id {
        font-family: 'Fira Code', monospace;
        color: var(--primary-light);
        font-size: 0.78rem;
      }
      .admin-page-title {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 180px;
      }
      .admin-page-name {
        color: var(--text-primary);
        font-weight: 600;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .admin-page-summary {
        max-width: 320px;
        color: var(--text-secondary);
        font-size: 0.78rem;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 8px;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.78rem;
        white-space: nowrap;
      }
      .admin-badge.protected {
        color: #fbbf24;
        border-color: rgba(251, 191, 36, 0.42);
        background: rgba(251, 191, 36, 0.1);
      }
      .admin-form {
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .admin-field {
        display: grid;
        gap: 7px;
      }
      .admin-label {
        color: var(--text-secondary);
        font-size: 0.84rem;
      }
      .admin-input,
      .admin-textarea,
      .admin-select {
        width: 100%;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-input);
        color: var(--text-primary);
        padding: 10px 11px;
        font: inherit;
      }
      .admin-textarea {
        min-height: 240px;
        resize: vertical;
        font-family: 'Fira Code', monospace;
        font-size: 0.86rem;
        line-height: 1.5;
      }
      .admin-inline {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-checkbox {
        width: 18px;
        height: 18px;
      }
      .admin-muted {
        color: var(--text-secondary);
        font-size: 0.84rem;
      }
      .admin-empty,
      .admin-loading {
        padding: 30px 16px;
        color: var(--text-secondary);
        text-align: center;
      }
      .admin-error {
        display: none;
        border: 1px solid var(--error-border);
        background: var(--error-bg);
        color: var(--error-text);
        border-radius: 6px;
        padding: 10px 12px;
        margin-bottom: 14px;
      }
      .admin-error.show {
        display: block;
      }
      @media (max-width: 920px) {
        .admin-shell {
          grid-template-columns: 1fr;
          margin: 16px auto;
          width: min(100vw - 20px, 760px);
        }
        .admin-sidebar {
          border-right: 0;
          border-bottom: 1px solid var(--border-color);
        }
        .admin-nav {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-grid {
          grid-template-columns: 1fr;
        }
        .admin-submissions-panel {
          grid-column: auto;
        }
        .admin-topbar {
          flex-direction: column;
        }
      }
    </style>`;

  return `${chromeStart(`${config.appName} | 内容管理`, { htmlAttrs: 'lang="zh-CN" data-page="admin-page"', extraHead, env })}
<div class="admin-shell">
  <aside class="admin-sidebar">
    <a class="admin-brand" href="/">
      <i class="fas fa-bolt"></i>
      <span>${escapeHtml(config.appName)}</span>
    </a>
    <nav class="admin-nav" aria-label="后台导航">
      <a class="active" href="/admin"><i class="fas fa-list"></i><span>内容管理</span></a>
      <a href="/"><i class="fas fa-plus"></i><span>新建分享</span></a>
    </nav>
  </aside>
  <main class="admin-main">
    <div class="admin-topbar">
      <div>
        <div class="admin-kicker">Workspace</div>
        <h1 class="admin-title">我的分享内容</h1>
      </div>
      <div class="admin-actions">
        <button id="admin-refresh" class="admin-button"><i class="fas fa-sync-alt"></i><span>刷新</span></button>
        <a class="admin-button primary" href="/"><i class="fas fa-plus"></i><span>新建</span></a>
      </div>
    </div>
    <div id="admin-error" class="admin-error"></div>
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-header">
          <h2 class="admin-panel-title">列表</h2>
          <span id="admin-count" class="admin-muted">0 条</span>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>类型</th>
                <th>状态</th>
                <th>大小</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="admin-pages-body">
              <tr><td class="admin-loading" colspan="6">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="admin-panel" aria-label="编辑内容">
        <div class="admin-panel-header">
          <h2 class="admin-panel-title">编辑</h2>
          <span id="admin-selected-id" class="admin-muted">未选择</span>
        </div>
        <form id="admin-edit-form" class="admin-form">
          <div class="admin-field">
            <label class="admin-label" for="admin-content">内容</label>
            <textarea id="admin-content" class="admin-textarea" disabled placeholder="从左侧选择一条内容"></textarea>
          </div>
          <div class="admin-field">
            <label class="admin-label" for="admin-code-type">类型</label>
            <select id="admin-code-type" class="admin-select" disabled>
              <option value="html">HTML</option>
              <option value="markdown">Markdown</option>
              <option value="svg">SVG</option>
              <option value="mermaid">Mermaid</option>
              <option value="zip">ZIP (静态网页)</option>
            </select>
          </div>
          <div class="admin-field">
            <label class="admin-label" for="admin-markdown-theme">Markdown 模板</label>
            <select id="admin-markdown-theme" class="admin-select" disabled>
              <option value="bytedance">字节风格</option>
              <option value="github">GitHub</option>
              <option value="docs">技术文档</option>
            </select>
          </div>
          <label class="admin-inline admin-muted">
            <input id="admin-protected" type="checkbox" class="admin-checkbox" disabled>
            <span>启用访问密码</span>
          </label>
          <div class="admin-inline">
            <a id="admin-open" class="admin-button" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true">
              <i class="fas fa-external-link-alt"></i><span>打开</span>
            </a>
            <button id="admin-copy" type="button" class="admin-button" disabled>
              <i class="fas fa-copy"></i><span>复制链接</span>
            </button>
            <button id="admin-save" type="submit" class="admin-button primary" disabled>
              <i class="fas fa-save"></i><span>保存</span>
            </button>
            <button id="admin-delete" type="button" class="admin-button danger" disabled>
              <i class="fas fa-trash"></i><span>删除</span>
            </button>
          </div>
          <p id="admin-password" class="admin-muted"></p>
        </form>
      </section>
      <section class="admin-panel admin-submissions-panel" aria-label="提交数据">
        <div class="admin-panel-header">
          <h2 class="admin-panel-title">提交数据</h2>
          <div class="admin-inline">
            <span id="admin-submissions-count" class="admin-muted">未选择</span>
            <button id="admin-submissions-refresh" class="admin-button" disabled>
              <i class="fas fa-sync-alt"></i><span>刷新</span>
            </button>
          </div>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table admin-submissions-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>数据</th>
              </tr>
            </thead>
            <tbody id="admin-submissions-body">
              <tr><td class="admin-empty" colspan="3">从左侧选择一条内容</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</div>
${chromeEnd({ includeMain: false, includeAdmin: true })}`;
}

export function renderLoginPage({ error = null } = {}, env) {
  const config = getAppConfig(env);
  const extraHead = '<link rel="stylesheet" href="/css/login.css">';
  return `${chromeStart(`${config.appName} | 登录`, { htmlAttrs: 'lang="zh-CN" data-page="login-page"', extraHead, env })}
<div class="main-container">
  ${appHeader(env)}
  <div class="content-area">
    <div class="login-card">
      <h2 class="card-title"><i class="fas fa-lock" style="margin-right: 10px; color: var(--accent);"></i>请输入访问密码</h2>
      ${error ? `<div class="error-message">${escapeHtml(error)}</div>` : ''}
      <form action="/login" method="post" class="login-form">
        <div class="form-group">
          <div class="password-field">
            <input type="password" name="password" id="password-input" class="cyber-input" placeholder="请输入访问密码..." required autofocus>
            <button type="button" id="toggle-password" class="toggle-password" aria-label="显示密码">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
        <div class="form-group">
          <button type="submit" class="submit-btn">
            <span>登录</span>
            <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </form>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const passwordInput = document.getElementById('password-input');
          const toggleButton = document.getElementById('toggle-password');
          toggleButton.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleButton.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
          });
        });
      </script>
    </div>
  </div>
  ${appFooter(env)}
</div>
${chromeEnd({ includeMain: false })}`;
}

export function renderPasswordPage({ id, error = null }, env) {
  const config = getAppConfig(env);
  const safeId = escapeHtml(id);
  const extraHead = `
    <meta name="format-detection" content="telephone=no">
    <meta name="format-detection" content="date=no">
    <meta name="format-detection" content="address=no">
    <meta name="format-detection" content="email=no">
    <meta name="robots" content="noai, noimageai">
    <meta name="apple-itunes-app" content="app-id=0,app-argument=none">
    <style>
      .non-password {
        -webkit-text-security: none !important;
        -moz-text-security: none !important;
      }
      input[type="text"] {
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-appearance: none;
        appearance: none;
      }
    </style>`;

  return `${chromeStart(`${config.appName} | 密码保护`, { htmlAttrs: 'lang="zh-CN" data-page="password-page"', extraHead, env })}
<div class="main-container">
  ${appHeader(env)}
  <div class="code-input-area">
    <div class="centered-password-container">
      <div class="card password-card centered-password-card">
        <h2 class="card-title"><i class="fas fa-lock" style="margin-right: 10px; color: var(--accent);"></i>此内容已加密</h2>
        <p class="password-description">请输入密码</p>
        ${error ? `<div class="error-message">${escapeHtml(error)}</div>` : ''}
        <form action="/view/${safeId}" method="get" class="password-form" id="passwordForm" onsubmit="return false;" autocomplete="off" data-lpignore="true" data-1p-ignore>
          <div class="password-input-container">
            <input type="password" name="password" style="display:none" aria-hidden="true">
            <input type="text" name="pin_code" maxlength="5" class="password-input non-password" placeholder="*****" autocomplete="off" autofocus inputmode="numeric" pattern="[0-9]*" onkeypress="return event.charCode >= 48 && event.charCode <= 57" oninput="handlePasswordInput(this.value)" readonly onfocus="this.removeAttribute('readonly');" data-lpignore="true" data-form-type="other" data-1p-ignore spellcheck="false" autocorrect="off" autocapitalize="off">
            <div class="digit-indicators">
              <span class="digit-indicator"></span>
              <span class="digit-indicator"></span>
              <span class="digit-indicator"></span>
              <span class="digit-indicator"></span>
              <span class="digit-indicator"></span>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
  ${appFooter(env)}
</div>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      const input = document.querySelector('.password-input');
      if (input) {
        input.blur();
        input.type = 'email';
        setTimeout(function() {
          input.type = 'text';
          input.focus();
        }, 100);
      }
    }, 300);
  });

  const pageId = '${safeId}';

  function handlePasswordInput(value) {
    const indicators = document.querySelectorAll('.digit-indicator');
    indicators.forEach(indicator => {
      indicator.classList.remove('filled', 'correct', 'incorrect');
    });
    for (let i = 0; i < value.length; i++) {
      if (i < indicators.length) indicators[i].classList.add('filled');
    }
    if (value.length === 5) validatePassword(value);
  }

  function validatePassword(password) {
    fetch('/validate-password/' + pageId + '?password=' + encodeURIComponent(password), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(response => response.json())
      .then(data => {
        const indicators = document.querySelectorAll('.digit-indicator');
        const passwordInput = document.querySelector('.password-input');
        if (data.valid) {
          indicators.forEach(indicator => indicator.classList.add('correct'));
          setTimeout(() => {
            window.location.href = '/view/' + pageId + '?password=' + encodeURIComponent(password);
          }, 500);
        } else {
          indicators.forEach(indicator => indicator.classList.add('incorrect'));
          setTimeout(() => {
            passwordInput.value = '';
            indicators.forEach(indicator => indicator.classList.remove('filled', 'correct', 'incorrect'));
          }, 1000);
        }
      })
      .catch(error => console.error('Error validating password:', error));
  }
</script>
${chromeEnd({ includeMain: false })}`;
}

export function renderErrorPage({ title = '页面未找到', message = '您请求的页面不存在' }, env) {
  const config = getAppConfig(env);
  return `${chromeStart(title, { env })}
<div class="main-container">
  <header class="app-header">
    <h1 class="app-title">${escapeHtml(config.appName)}</h1>
  </header>
  <div class="card error-card">
    <div class="error-icon">
      <i class="fas fa-exclamation-triangle"></i>
    </div>
    <h2 class="error-title">${escapeHtml(title)}</h2>
    <p class="error-message">${escapeHtml(message)}</p>
    <a href="/" class="back-btn">
      <i class="fas fa-arrow-left"></i> 返回首页
    </a>
  </div>
  ${appFooter(env)}
</div>
${chromeEnd({ includeMain: false })}`;
}

const APP_NAME = 'HTML-GO';

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function appTitleSpans() {
  return APP_NAME.split('').map((char) => `<span>${escapeHtml(char)}</span>`).join('');
}

function head({ title, extraHead = '' }) {
  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/icon/web/favicon.ico" sizes="any">
    <link rel="apple-touch-icon" href="/icon/web/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/icon/web/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/icon/web/icon-512.png">
    <meta name="theme-color" content="#6366f1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="${APP_NAME}">
    <meta property="og:title" content="${APP_NAME} | 分享AI生成内容的最佳方式">
    <meta property="og:description" content="一个简单、高效的HTML代码分享平台">
    <meta property="og:type" content="website">
    <meta property="og:image" content="/icon/web/icon-512.png">
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
  ${head({ title, extraHead: options.extraHead })}
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

function appHeader() {
  return `
    <header class="app-header">
      <div class="title-container">
        <h1 class="cyber-title">${appTitleSpans()}</h1>
      </div>
      <p class="app-description">分享AI生成内容的最佳方式</p>
    </header>`;
}

function appFooter() {
  return `
    <footer class="app-footer">
      <p class="footer-text">@2025 <a href="https://x.com/vista8" target="_blank" rel="noopener noreferrer">向阳乔木</a></p>
    </footer>`;
}

export function renderIndexPage() {
  return `${chromeStart(`${APP_NAME} | 分享 HTML 代码的简单方式`)}
<div class="main-container">
  ${appHeader()}
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
          <input id="html-file" type="file" class="hidden" accept=".html,.htm" aria-label="上传 HTML 文件" />
          <p id="file-name" class="mt-3" style="color: var(--primary);"></p>
        </div>
        <div class="mt-4 flex justify-between" style="display: flex; justify-content: space-between; margin-top: 1rem;">
          <div>
            <label for="html-file" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="上传HTML文件" aria-label="上传HTML文件">
              <i class="fas fa-file-upload mr-1" aria-hidden="true"></i>上传文件
            </label>
          </div>
          <div style="display: flex; gap: 12px;">
            <button id="clear-button" class="cyber-btn cyber-btn-secondary tooltip micro-interaction" data-tooltip="清空内容" aria-label="清空内容">
              <i class="fas fa-eraser mr-1" aria-hidden="true"></i>清除
            </button>
            <button id="generate-button" class="cyber-btn cyber-btn-primary tooltip micro-interaction" data-tooltip="生成分享链接" aria-label="生成分享链接">
              <i class="fas fa-link mr-1" aria-hidden="true"></i>生成链接
            </button>
          </div>
        </div>
      </div>
    </div>
    <div id="result-section" class="card result-card" style="display: none;" aria-live="polite">
      <h3 class="section-title" style="color: var(--primary); font-family: 'Orbitron', sans-serif; margin-bottom: 1rem;">链接已生成</h3>
      <div class="result-container">
        <div id="result-url" class="result-url" tabindex="0"></div>
        <div class="action-buttons">
          <button id="preview-button" class="action-btn preview-btn tooltip micro-interaction" data-tooltip="在新窗口预览" aria-label="在新窗口预览">
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
  </div>
  ${appFooter()}
</div>
${chromeEnd({ includeMain: true, includeAdminLink: true })}`;
}

export function renderAdminPage() {
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
      .admin-id {
        font-family: 'Fira Code', monospace;
        color: var(--primary-light);
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
        .admin-topbar {
          flex-direction: column;
        }
      }
    </style>`;

  return `${chromeStart(`${APP_NAME} | 内容管理`, { htmlAttrs: 'lang="zh-CN" data-page="admin-page"', extraHead })}
<div class="admin-shell">
  <aside class="admin-sidebar">
    <a class="admin-brand" href="/">
      <i class="fas fa-bolt"></i>
      <span>${APP_NAME}</span>
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
                <th>ID</th>
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
    </div>
  </main>
</div>
${chromeEnd({ includeMain: false, includeAdmin: true })}`;
}

export function renderLoginPage({ error = null } = {}) {
  const extraHead = '<link rel="stylesheet" href="/css/login.css">';
  return `${chromeStart(`${APP_NAME} | 登录`, { htmlAttrs: 'lang="zh-CN" data-page="login-page"', extraHead })}
<div class="main-container">
  ${appHeader()}
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
  ${appFooter()}
</div>
${chromeEnd({ includeMain: false })}`;
}

export function renderPasswordPage({ id, error = null }) {
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

  return `${chromeStart(`${APP_NAME} | 密码保护`, { htmlAttrs: 'lang="zh-CN" data-page="password-page"', extraHead })}
<div class="main-container">
  ${appHeader()}
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
  ${appFooter()}
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

export function renderErrorPage({ title = '页面未找到', message = '您请求的页面不存在' }) {
  return `${chromeStart(title)}
<div class="main-container">
  <header class="app-header">
    <h1 class="app-title">${APP_NAME}</h1>
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
  ${appFooter()}
</div>
${chromeEnd({ includeMain: false })}`;
}

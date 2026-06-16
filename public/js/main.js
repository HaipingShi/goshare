// goshare 主要JavaScript文件
// 处理所有用户交互和功能

// 错误提示功能
function showErrorToast(message) {
  const errorToast = document.getElementById('error-toast');
  const errorMessage = document.getElementById('error-message');
  if (errorToast && errorMessage) {
    errorMessage.textContent = message;
    errorToast.classList.add('show');
    
    setTimeout(() => {
      errorToast.classList.remove('show');
    }, 3000);
  } else {
    console.error('错误提示元素不存在:', message);
  }
}

function getApiErrorMessage(data, fallback) {
  if (data?.message) return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (data?.error?.message) return data.error.message;
  return fallback;
}

// 成功提示功能
function showSuccessToast(message) {
  const successToast = document.getElementById('success-toast');
  const successMessage = document.getElementById('success-message');
  if (successToast && successMessage) {
    successMessage.textContent = message;
    successToast.classList.add('show');
    
    setTimeout(() => {
      successToast.classList.remove('show');
    }, 3000);
  } else {
    console.error('成功提示元素不存在:', message);
  }
}

// 智能检测警告弹窗
function showWarningModal(title, message) {
  const modal = document.getElementById('alert-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  if (modal && modalTitle && modalMessage) {
    modalTitle.textContent = title;
    // 用 <code> 替换 Markdown 的行内代码块 `code`
    modalMessage.innerHTML = message
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    modal.classList.add('show');
  } else {
    console.warn('警告弹窗元素不存在，回退到 showErrorToast:', message);
    showErrorToast(message);
  }
}

// 使用延迟加载确保所有元素已经完全渲染好
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM完全加载，初始化应用...');
  
  // 弹窗关闭事件
  const alertModal = document.getElementById('alert-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (alertModal && modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      alertModal.classList.remove('show');
    });
    alertModal.addEventListener('click', (e) => {
      if (e.target === alertModal) {
        alertModal.classList.remove('show');
      }
    });
  }
  
  // DOM 元素
  const htmlInput = document.getElementById('html-input');
  const fileInput = document.getElementById('html-file');
  const codeInputContainer = document.getElementById('code-input-container');
  const fileName = document.getElementById('file-name');
  const clearButton = document.getElementById('clear-button');
  const previewRenderButton = document.getElementById('preview-render-button');
  const beautifyButton = document.getElementById('beautify-button');
  const generateButton = document.getElementById('generate-button');
  const previewRefreshButton = document.getElementById('preview-refresh-button');
  const previewSection = document.getElementById('preview-section');
  const previewStatus = document.getElementById('preview-status');
  const renderPreviewFrame = document.getElementById('render-preview-frame');
  const markdownThemeSelect = document.getElementById('markdown-theme-select');
  const resultSection = document.getElementById('result-section');
  const resultMeta = document.getElementById('result-meta');
  const resultUrl = document.getElementById('result-url');
  const copyButton = document.getElementById('copy-button');
  const previewButton = document.getElementById('preview-button');
  const shareCardButton = document.getElementById('share-card-button');
  const loadingIndicator = document.getElementById('loading-indicator');
  const passwordToggle = document.getElementById('password-toggle');
  const passwordInfo = document.getElementById('password-info');
  const generatedPassword = document.getElementById('generated-password');
  const copyPasswordOnly = document.getElementById('copy-password-button');
  const copyPasswordLink = document.getElementById('copy-password-link');
  const agentApiEndpoint = document.getElementById('agent-api-endpoint');
  const agentApiPrompt = document.getElementById('agent-api-prompt');
  const copyAgentApiPrompt = document.getElementById('copy-agent-api-prompt');
  
  // 创建代码编辑器
  let codeElement = null;
  let highlightEnabled = true;
  let uploadedZipContent = null;
  let uploadedCodeTypeOverride = null;
  let previewReady = false;
  let previewContent = '';
  let previewCodeType = '';
  let previewMarkdownTheme = '';

  function copyTextToClipboard(text) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (error) {
      console.error('复制失败:', error);
      return false;
    }
  }

  function renderAgentApiPrompt() {
    if (!agentApiPrompt || !agentApiEndpoint) return;
    const origin = window.location.origin;
    const endpoint = `${origin}/api/v1/pages/create`;
    const quotaEndpoint = `${origin}/api/v1/quota`;
    agentApiEndpoint.textContent = endpoint;
    agentApiPrompt.value = `你正在使用一个公开的 goshare demo 站点。你可以帮我把内容创建成分享页，不需要打开网页 UI，也不需要 AGENT_API_TOKEN。

接口：POST ${endpoint}
额度预检：GET ${quotaEndpoint}

安全要求：
- 这是公开 demo 接口，只适合体验和临时分享。
- 不要上传隐私、密钥、客户数据或不能公开的代码。
- 创建内容会受到安全扫描和每日额度限制。
- 创建前先请求额度预检；请求失败时读取 error.code、error.message 和 quota，不要重复盲打。
- 重试时使用相同 Idempotency-Key，避免超时后重复创建。

请求 JSON 字段：
- htmlContent：HTML、Markdown、SVG 或 Mermaid 文本。
- codeType：html、markdown、svg、mermaid 或 zip。
- markdownTheme：Markdown 可选 bytedance、github、docs、clean、magazine、note、slate。
- title / summary：可选；不填时 goshare 会尝试生成或提取。
- isProtected：可选；true 时返回临时访问密码。

成功响应契约：
{
  "success": true,
  "id": "abc123",
  "url": "${origin}/share/abc123",
  "cardUrl": "${origin}/share/abc123",
  "viewUrl": "${origin}/view/abc123",
  "quota": { "remaining": 9, "limit": 10, "resetAt": "2026-06-17T00:00:00.000Z" }
}

失败响应契约：
{
  "success": false,
  "error": { "code": "QUOTA_EXCEEDED", "message": "今日创建次数已达上限", "retryable": false },
  "quota": { "remaining": 0, "limit": 10, "resetAt": "2026-06-17T00:00:00.000Z" }
}

失败处理：
- 400 INVALID_JSON / INVALID_REQUEST：修正 JSON 或字段后再发。
- 409 IDEMPOTENCY_CONFLICT：同一个 Idempotency-Key 已用于不同内容，换 key 后再发。
- 413 TOO_LARGE：压缩、截断或拆分内容。
- 422 INVALID_CONTENT：内容未通过安全检测，不要原样重试。
- 429 QUOTA_EXCEEDED：停止请求，告诉我 resetAt。
- 429 RATE_LIMITED 或 5xx 且 retryable=true：退避后最多重试 1 次。

curl 示例：
curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen 2>/dev/null || date +%s)" \\
  -d '{
    "htmlContent": "# Hello goshare\\n\\nCreated directly from an AI agent.",
    "codeType": "markdown",
    "markdownTheme": "github",
    "title": "Hello goshare",
    "summary": "Created directly from an AI agent.",
    "isProtected": false
  }'

成功后：
- 把响应里的 url 或 cardUrl 发给我用于转发。
- 需要正文页时使用 viewUrl。
- 记录 id，方便排查本次创建。

如果你是站点拥有者或授权 agent，才使用需要 Bearer Token 的 ${origin}/api/v1/agent/pages。`;
  }
  
  // 初始化代码编辑器 - 简化版本，不使用双层结构
  function initCodeEditor() {
    if (htmlInput && codeInputContainer) {
      console.log('初始化简化版代码编辑器');
      
      // 不创建额外的代码元素，直接使用 textarea
      htmlInput.style.fontFamily = 'monospace';
      htmlInput.style.fontSize = '14px';
      htmlInput.style.lineHeight = '1.5';
      htmlInput.style.color = 'var(--text-primary)';
      htmlInput.style.backgroundColor = 'var(--bg-input)';
      htmlInput.style.border = '1px solid var(--border-color)';
      htmlInput.style.borderRadius = '8px';
      htmlInput.style.padding = '15px';
      htmlInput.style.boxSizing = 'border-box';
      htmlInput.style.width = '100%';
      htmlInput.style.minHeight = '200px';
      htmlInput.style.maxHeight = '500px';
      htmlInput.style.overflow = 'auto';
      htmlInput.style.whiteSpace = 'pre-wrap';
      htmlInput.style.wordBreak = 'break-word';
      htmlInput.style.resize = 'vertical';
      htmlInput.style.outline = 'none';
      
      // 如果有初始内容，更新代码类型指示器
      if (htmlInput.value) {
        const codeType = detectCodeType(htmlInput.value);
        updateCodeTypeIndicator(codeType, htmlInput.value);
      }
    }
  }
  
  // 显示加载指示器
  function showLoading() {
    if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
    }
  }
  
  // 隐藏加载指示器
  function hideLoading() {
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }

  function setActionLoading(button, label) {
    if (!button) return;
    button.dataset.originalHtml = button.dataset.originalHtml || button.innerHTML;
    button.innerHTML = `<i class="fas fa-spinner fa-spin loading-spinner"></i> ${label}`;
    button.disabled = true;
  }

  function restoreActionButton(button) {
    if (!button) return;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
    button.disabled = false;
  }

  function getCurrentCodeType(content) {
    return uploadedZipContent ? 'zip' : (uploadedCodeTypeOverride || detectCodeType(content));
  }

  function isMarkdownType(codeType) {
    return codeType === 'markdown';
  }

  function getMarkdownTheme() {
    return markdownThemeSelect ? markdownThemeSelect.value : 'bytedance';
  }

  function syncMarkdownThemeControl(codeType) {
    if (!markdownThemeSelect) return;
    const enabled = isMarkdownType(codeType) && !uploadedZipContent;
    markdownThemeSelect.disabled = !enabled;
  }

  function collectTextPayload() {
    if (!htmlInput) {
      return { ok: false, error: 'HTML输入元素不存在' };
    }

    const htmlContent = htmlInput.value.trim();
    if (!htmlContent) {
      return { ok: false, error: '请输入 HTML/Markdown/SVG/Mermaid 内容' };
    }

    const codeType = getCurrentCodeType(htmlContent);
    return {
      ok: true,
      htmlContent,
      codeType,
      markdownTheme: getMarkdownTheme(),
    };
  }

  function invalidatePreview() {
    previewReady = false;
    previewContent = '';
    previewCodeType = '';
    previewMarkdownTheme = '';
    if (generateButton) generateButton.disabled = true;
    if (beautifyButton) beautifyButton.disabled = !htmlInput || !htmlInput.value.trim() || Boolean(uploadedZipContent);
    if (previewStatus) previewStatus.textContent = '预览已失效';
    if (resultSection) {
      resultSection.style.display = 'none';
      resultSection.classList.remove('fade-in');
    }
  }

  function showPreview(html, codeType, statusText = '预览已生成', markdownTheme = getMarkdownTheme()) {
    if (previewSection) previewSection.hidden = false;
    if (renderPreviewFrame) renderPreviewFrame.srcdoc = html;
    if (previewStatus) previewStatus.textContent = statusText;
    previewReady = true;
    previewContent = htmlInput ? htmlInput.value.trim() : '';
    previewCodeType = codeType;
    previewMarkdownTheme = markdownTheme;
    if (generateButton) generateButton.disabled = false;
    if (beautifyButton) beautifyButton.disabled = Boolean(uploadedZipContent);
  }

  async function renderPreview() {
    syncToTextarea();

    if (uploadedZipContent) {
      showErrorToast('ZIP 静态网站请直接生成链接后预览');
      if (generateButton) generateButton.disabled = false;
      return;
    }

    const payload = collectTextPayload();
    if (!payload.ok) {
      showErrorToast(payload.error);
      return;
    }

    setActionLoading(previewRenderButton, '预览中...');
    if (previewRefreshButton) previewRefreshButton.disabled = true;

    try {
      const response = await fetch('/api/pages/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent: payload.htmlContent,
          codeType: payload.codeType,
          markdownTheme: payload.markdownTheme,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, '预览失败'));

      showPreview(data.html, data.codeType || payload.codeType, undefined, data.markdownTheme || payload.markdownTheme);
    } catch (error) {
      showErrorToast(error.message || '预览失败');
    } finally {
      restoreActionButton(previewRenderButton);
      if (previewRefreshButton) previewRefreshButton.disabled = false;
    }
  }

  async function beautifyContent() {
    const payload = collectTextPayload();
    if (!payload.ok) {
      showErrorToast(payload.error);
      return;
    }

    if (payload.codeType === 'zip') {
      showErrorToast('ZIP 静态网站暂不支持智能美化');
      return;
    }

    setActionLoading(beautifyButton, '美化中...');
    if (previewRenderButton) previewRenderButton.disabled = true;

    try {
      const response = await fetch('/api/pages/beautify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent: payload.htmlContent,
          codeType: payload.codeType,
          markdownTheme: payload.markdownTheme,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(getApiErrorMessage(data, '智能美化失败'));

      htmlInput.value = data.htmlContent;
      uploadedCodeTypeOverride = data.codeType || 'html';
      updateCodeTypeIndicator(uploadedCodeTypeOverride, htmlInput.value);
      showSuccessToast('智能美化完成');
      await renderPreview();
    } catch (error) {
      showErrorToast(error.message || '智能美化失败');
    } finally {
      restoreActionButton(beautifyButton);
      if (previewRenderButton) previewRenderButton.disabled = false;
    }
  }
  
  // 同步内容 - 简化版本，只更新代码类型指示器
  function syncToTextarea() {
    if (htmlInput) {
      // 如果有强制覆盖的代码类型则使用它，否则调用检测函数
      const codeType = uploadedCodeTypeOverride || detectCodeType(htmlInput.value);
      updateCodeTypeIndicator(codeType, htmlInput.value);
      syncMarkdownThemeControl(codeType);
    }
  }
  
  // 更新语法高亮 - 简化版本
  function updateHighlighting() {
    // 简化版本不需要高亮功能
    console.log('简化版本不使用语法高亮');
  }
  
  // 切换高亮状态 - 简化版本
  function toggleHighlighting() {
    // 简化版本不需要高亮功能
    console.log('简化版本不使用语法高亮切换');
  }
  
  // 格式化 URL 显示
  function formatUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const id = path.split('/').pop();
      
      // 创建带样式的 URL 显示
      return `<span style="color: var(--text-secondary);">${urlObj.origin}</span><span style="color: var(--primary);">/view/</span><span style="color: var(--accent); font-weight: bold;">${id}</span>`;
    } catch (e) {
      return url; // 如果解析失败，返回原始 URL
    }
  }
  
  // 文件上传处理
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      const isZip = file.name.endsWith('.zip');
      const isTextFile = file.name.endsWith('.html') || 
                         file.name.endsWith('.htm') || 
                         file.name.endsWith('.md') || 
                         file.name.endsWith('.markdown') || 
                         file.name.endsWith('.svg') || 
                         file.name.endsWith('.txt');
      
      if (!isTextFile && !isZip) {
        showErrorToast('请上传 HTML、ZIP、Markdown、SVG 或 TXT 文件');
        return;
      }
      
      showLoading();
      fileName.textContent = file.name;
      
      if (isZip) {
        const reader = new FileReader();
        reader.onload = (e) => {
          uploadedZipContent = e.target.result;
          htmlInput.value = `[ZIP 静态网页: ${file.name}] (${(file.size / 1024).toFixed(1)} KB)\n此内容暂不支持在线编辑。点击“生成链接”即可发布此静态网站。`;
          htmlInput.disabled = true;
          updateCodeTypeIndicator('zip', htmlInput.value);
          syncMarkdownThemeControl('zip');
          invalidatePreview();
          if (generateButton) generateButton.disabled = false;
          hideLoading();
        };
        reader.readAsDataURL(file);
      } else {
        uploadedZipContent = null;
        
        // 根据后缀名强制指定代码类型，避免自动检测误差
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
          uploadedCodeTypeOverride = 'markdown';
        } else if (file.name.endsWith('.svg')) {
          uploadedCodeTypeOverride = 'svg';
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          uploadedCodeTypeOverride = 'html';
        } else {
          uploadedCodeTypeOverride = null;
        }
        
        htmlInput.disabled = false;
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          htmlInput.value = content;
          htmlInput.selectionStart = htmlInput.selectionEnd = content.length;
          syncToTextarea();
          invalidatePreview();
          hideLoading();
        };
        reader.readAsText(file);
      }
    });
  }
  
  // 清除按钮功能
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      console.log('清除按钮被点击');
      if (htmlInput) {
        htmlInput.value = '';
        htmlInput.disabled = false;
      }
      uploadedZipContent = null;
      uploadedCodeTypeOverride = null;
      if (fileName) {
        fileName.textContent = '';
      }
      if (resultSection) {
        resultSection.style.display = 'none';
        resultSection.classList.remove('fade-in');
      }
      if (resultMeta) {
        resultMeta.textContent = '';
        resultMeta.style.display = 'none';
      }
      if (resultUrl) {
        delete resultUrl.dataset.originalUrl;
        delete resultUrl.dataset.cardUrl;
        delete resultUrl.dataset.viewUrl;
        delete resultUrl.dataset.urlId;
      }
      if (previewSection) previewSection.hidden = true;
      if (renderPreviewFrame) renderPreviewFrame.srcdoc = '';
      invalidatePreview();
      // 同步到高亮区域
      syncToTextarea();
      // 显示成功提示
      showSuccessToast('内容已清除');
    });
  }
  
  // 密码开关事件监听
  if (passwordToggle) {
    passwordToggle.addEventListener('change', async () => {
      // 如果没有生成链接，则不做任何操作
      if (!resultUrl || !resultUrl.dataset.originalUrl) {
        return;
      }
      
      if (passwordToggle.checked) {
        // 显示密码区域和复制按钮
        if (passwordInfo) passwordInfo.style.display = 'block';
        if (copyPasswordLink) copyPasswordLink.style.display = 'inline-block';
        
        // 更新数据库状态为需要密码才能访问
        try {
          const urlId = resultUrl.dataset.urlId || resultUrl.dataset.originalUrl.split('/').pop();
          await fetch(`/api/pages/${urlId}/protect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isProtected: true }),
          });
        } catch (error) {
          console.error('更新保护状态错误:', error);
        }
      } else {
        // 隐藏密码区域和复制按钮
        if (passwordInfo) passwordInfo.style.display = 'none';
        if (copyPasswordLink) copyPasswordLink.style.display = 'none';
        
        // 更新数据库状态为不需要密码就能访问
        try {
          const urlId = resultUrl.dataset.urlId || resultUrl.dataset.originalUrl.split('/').pop();
          await fetch(`/api/pages/${urlId}/protect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isProtected: false }),
          });
        } catch (error) {
          console.error('更新保护状态错误:', error);
        }
      }
    });
  }
  
  // 代码类型检测函数
  function detectCodeType(code) {
    if (!code || typeof code !== 'string') {
      return 'html'; // 默认返回HTML而不是Markdown
    }
    
    const trimmedCode = code.trim();
    console.log('检测代码类型，前50个字符:', trimmedCode.substring(0, 50) + '...');
    
    // 检测纯Mermaid - 优先检查，因为这是最明确的格式
    if ((trimmedCode.startsWith('graph ') || 
        trimmedCode.startsWith('sequenceDiagram') || 
        trimmedCode.startsWith('classDiagram') || 
        trimmedCode.startsWith('gantt') || 
        trimmedCode.startsWith('pie') || 
        trimmedCode.startsWith('flowchart'))) {
      console.log('检测到纯Mermaid图表');
      return 'mermaid';
    }
    
    // 检测HTML - 只有明确的HTML文档才识别为HTML
    if (trimmedCode.startsWith('<!DOCTYPE html>') || 
        trimmedCode.startsWith('<html')) {
      console.log('检测到完整HTML文档');
      return 'html';
    }
    
    // 检测纯SVG - 只有当它是一个完整的SVG标签时
    if (trimmedCode.startsWith('<svg') && 
        trimmedCode.includes('</svg>') && 
        trimmedCode.includes('xmlns="http://www.w3.org/2000/svg"')) {
      console.log('检测到纯SVG');
      return 'svg';
    }
    
    // 检查是否包含明确的Markdown特征
    // 计算Markdown特征的数量和权重
    let markdownScore = 0;
    
    // 标题 (权重高)
    if (trimmedCode.includes('# ')) markdownScore += 2;
    if (trimmedCode.includes('## ')) markdownScore += 2;
    if (trimmedCode.includes('### ')) markdownScore += 2;
    
    // 列表
    if (/^-\s.+/m.test(trimmedCode)) markdownScore += 1;
    if (/^\*\s.+/m.test(trimmedCode)) markdownScore += 1;
    if (/^\d+\.\s.+/m.test(trimmedCode)) markdownScore += 1;
    
    // 代码块 (权重高)
    if (trimmedCode.includes('```')) markdownScore += 3;
    
    // 链接和图片 (权重高)
    if (/\[.+\]\(.+\)/.test(trimmedCode)) markdownScore += 2;
    if (/!\[.+\]\(.+\)/.test(trimmedCode)) markdownScore += 2;
    
    // 引用
    if (/^>\s.+/m.test(trimmedCode)) markdownScore += 2;
    
    // 表格
    if (/\|.+\|/.test(trimmedCode)) markdownScore += 2;
    
    // 格式化文本
    if (/\*\*.+\*\*/.test(trimmedCode)) markdownScore += 1;
    if (/__.+__/.test(trimmedCode)) markdownScore += 1;
    
    console.log('Markdown特征分数:', markdownScore);
    
    // 如果Markdown分数足够高，则返回Markdown
    if (markdownScore >= 3) {
      console.log('检测到Markdown内容');
      return 'markdown';
    }
    
    // 检查是否包含Markdown代码块标记
    if (trimmedCode.includes('```svg') || 
        trimmedCode.includes('```mermaid') ||
        trimmedCode.includes('```javascript') ||
        trimmedCode.includes('```python') ||
        trimmedCode.includes('```java') ||
        trimmedCode.includes('```html') ||
        trimmedCode.includes('```css')) {
      console.log('检测到Markdown代码块');
      return 'markdown';
    }
    
    // 检测纯文本 - 没有HTML标签的纯文本内容可能是Markdown
    if (!trimmedCode.includes('<') && !trimmedCode.includes('>')) {
      // 如果内容很短且没有明显的Markdown特征，可能是普通文本
      if (trimmedCode.length < 50 && markdownScore < 2) {
        console.log('检测到短纯文本，可能是HTML');
        return 'html';
      }
      console.log('检测到纯文本，可能是Markdown');
      return 'markdown';
    }
    
    // 检测HTML片段
    if (trimmedCode.startsWith('<') && 
        (trimmedCode.includes('<div') || 
         trimmedCode.includes('<p') || 
         trimmedCode.includes('<span') || 
         trimmedCode.includes('<h1') || 
         trimmedCode.includes('<body') || 
         trimmedCode.includes('<head'))) {
      console.log('检测到HTML片段');
      return 'html';
    }
    
    // 更智能的类型检测 - 处理混合内容
    // 如果包含 HTML 标签，但不是完整的 HTML 文档，我们需要进一步判断
    if (trimmedCode.includes('<') && trimmedCode.includes('>')) {
      // 计算 HTML 标签的数量
      const htmlTagsCount = (trimmedCode.match(/<\/?[a-z][\s\S]*?>/gi) || []).length;
      console.log('HTML标签数量:', htmlTagsCount);
      
      // 如果HTML标签数量很少，而Markdown特征分数较高，则可能是Markdown中嵌入了少量HTML
      if (htmlTagsCount < 5 && markdownScore >= 3) {
        console.log('检测到Markdown中嵌入了少量HTML');
        return 'markdown';
      }
      
      // 如果是SVG标签但嵌入在Markdown中
      if (trimmedCode.includes('<svg') && 
          trimmedCode.includes('</svg>') && 
          trimmedCode.includes('xmlns="http://www.w3.org/2000/svg"') &&
          markdownScore >= 3) {
        console.log('检测到Markdown中嵌入了SVG');
        return 'markdown';
      }
      
      // 如果内容中有大量HTML标签，可能是HTML
      if (htmlTagsCount > 10) {
        console.log('检测到大量HTML标签，可能是HTML');
        return 'html';
      }
      
      // 如果Markdown特征分数明显高于HTML标签数量
      if (markdownScore > htmlTagsCount * 1.5) {
        console.log('Markdown特征明显多于HTML标签');
        return 'markdown';
      }
      
      // 默认返回HTML
      console.log('默认判断为HTML');
      return 'html';
    }
    
    // 如果没有明确的特征，默认返回HTML
    console.log('没有明确特征，默认返回HTML');
    return 'html';
  }

  // 显示代码类型标记
  function updateCodeTypeIndicator(codeType, content) {
    // 获取已存在的指示器
    const indicator = document.getElementById('code-type-indicator');
    const codeTypeText = document.getElementById('code-type-text');
    
    if (!indicator || !codeTypeText) {
      console.error('代码类型指示器元素不存在');
      return;
    }
    
    // 如果没有内容，隐藏指示器
    if (!content || content.trim() === '') {
      indicator.style.display = 'none';
      return;
    } else {
      indicator.style.display = 'flex';
    }
    
    // 根据代码类型设置样式和图标
    let iconClass = '';
    let label = '';
    let className = '';
    
    switch(codeType) {
      case 'html':
        iconClass = 'fas fa-code';
        label = 'HTML';
        className = 'html-type';
        break;
      case 'markdown':
        iconClass = 'fab fa-markdown';
        label = 'Markdown';
        className = 'markdown-type';
        break;
      case 'svg':
        iconClass = 'fas fa-bezier-curve';
        label = 'SVG';
        className = 'svg-type';
        break;
      case 'mermaid':
        iconClass = 'fas fa-project-diagram';
        label = 'Mermaid';
        className = 'mermaid-type';
        break;
      case 'zip':
        iconClass = 'fas fa-file-archive';
        label = 'ZIP 静态网页';
        className = 'zip-type';
        break;
      default:
        iconClass = 'fas fa-code';
        label = 'Code';
        className = 'default-type';
    }
    
    // 更新指示器类名
    indicator.className = `code-type-indicator ${className}`;
    
    // 更新图标和文本
    const iconElement = indicator.querySelector('i');
    if (iconElement) {
      iconElement.className = iconClass;
    }
    
    // 更新文本
    codeTypeText.textContent = label;
    syncMarkdownThemeControl(codeType);
  }

  // 初始化代码编辑器
  initCodeEditor();
  renderAgentApiPrompt();

  if (copyAgentApiPrompt) {
    copyAgentApiPrompt.addEventListener('click', () => {
      if (!agentApiPrompt || !agentApiPrompt.value) {
        showErrorToast('没有可复制的 Agent Prompt');
        return;
      }

      if (copyTextToClipboard(agentApiPrompt.value)) {
        showSuccessToast('Agent Prompt 已复制');
        copyAgentApiPrompt.innerHTML = '<i class="fas fa-check mr-1" aria-hidden="true"></i>已复制';
        setTimeout(() => {
          copyAgentApiPrompt.innerHTML = '<i class="fas fa-copy mr-1" aria-hidden="true"></i>复制 Agent Prompt';
        }, 1400);
      } else {
        showErrorToast('复制 Agent Prompt 失败');
      }
    });
  }
  
  // 在输入框内容变化时检测代码类型并更新高亮
  if (htmlInput) {
    htmlInput.addEventListener('input', () => {
      // 手动修改内容时，清除强制指定类型，恢复自动检测
      uploadedCodeTypeOverride = null;
      const content = htmlInput.value;
      const codeType = detectCodeType(content);
      updateCodeTypeIndicator(codeType, content);
      
      // 同步到高亮区域
      syncToTextarea();
      invalidatePreview();
    });
    
    // 页面加载时检测初始内容
    if (htmlInput.value) {
      const content = htmlInput.value;
      
      // 检查是否在编辑页面上
      const isEditPage = window.location.pathname.includes('/edit/') || window.location.pathname.includes('/view/');
      
      // 如果是编辑页面，尝试从多个来源获取代码类型
      let codeType = 'html';
      if (isEditPage) {
        // 1. 尝试从 meta 标签中获取代码类型
        const metaCodeType = document.querySelector('meta[name="code-type"]');
        if (metaCodeType && metaCodeType.getAttribute('content')) {
          const typeFromMeta = metaCodeType.getAttribute('content');
          if (['html', 'markdown', 'svg', 'mermaid'].includes(typeFromMeta)) {
            codeType = typeFromMeta;
            console.log(`从 meta 标签中获取代码类型: ${codeType}`);
          }
        } else {
          // 2. 尝试从 URL 参数中获取代码类型
          const urlParams = new URLSearchParams(window.location.search);
          const typeFromUrl = urlParams.get('type');
          
          if (typeFromUrl && ['html', 'markdown', 'svg', 'mermaid'].includes(typeFromUrl)) {
            codeType = typeFromUrl;
            console.log(`从 URL 参数中获取代码类型: ${codeType}`);
          } else {
            // 3. 如果以上方法都失败，则使用检测函数
            codeType = detectCodeType(content);
            console.log(`检测到的代码类型: ${codeType}`);
          }
        }
      } else {
        // 如果不是编辑页面，使用检测函数
        codeType = detectCodeType(content);
      }
      
      updateCodeTypeIndicator(codeType, content);
    } else {
      // 初始时如果没有内容，隐藏指示器
      updateCodeTypeIndicator('html', '');
    }
  }

  if (previewRenderButton) {
    previewRenderButton.addEventListener('click', renderPreview);
  }

  if (previewRefreshButton) {
    previewRefreshButton.addEventListener('click', renderPreview);
  }

  if (beautifyButton) {
    beautifyButton.addEventListener('click', beautifyContent);
  }

  if (markdownThemeSelect) {
    markdownThemeSelect.addEventListener('change', invalidatePreview);
  }

  // 生成链接
  if (generateButton) {
    generateButton.addEventListener('click', async () => {
      console.log('生成链接按钮被点击');
      // 确保从编辑器同步到textarea
      syncToTextarea();
      
      if (!htmlInput) {
        showErrorToast('HTML输入元素不存在');
        return;
      }

      const htmlContent = htmlInput.value.trim();

      if (!htmlContent && !uploadedZipContent) {
        showErrorToast('请输入 HTML 内容或选择上传 ZIP 文件');
        return;
      }

      const currentCodeType = getCurrentCodeType(htmlContent);
      const currentMarkdownTheme = getMarkdownTheme();
      const themeChanged = isMarkdownType(currentCodeType) && previewMarkdownTheme !== currentMarkdownTheme;
      if (!uploadedZipContent && (!previewReady || previewContent !== htmlContent || previewCodeType !== currentCodeType || themeChanged)) {
        showErrorToast('请先预览当前内容，再确认生成链接');
        return;
      }

      try {
        // 显示加载指示器
        loadingIndicator.classList.add('show');
        
        // 添加按钮加载动画
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin loading-spinner"></i> 处理中...';
        generateButton.disabled = true;
        
        // 检查是否启用密码保护
        const isProtected = passwordToggle ? passwordToggle.checked : false;
        
        // 检测代码类型
        const codeType = currentCodeType;
        console.log('检测到的代码类型:', codeType);
        
        const bodyPayload = uploadedZipContent
          ? { zipContent: uploadedZipContent, isProtected, codeType }
          : { htmlContent, isProtected, codeType, markdownTheme: currentMarkdownTheme };
        
        // 调用 API 生成链接
        const response = await fetch('/api/v1/pages/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
        
        const data = await response.json();
        console.log('API响应数据:', data); // 调试输出
        
        if (data.success) {
          const cardUrl = data.cardUrl || data.url || `${window.location.origin}/share/${data.urlId}`;
          const viewUrl = data.viewUrl || `${window.location.origin}/view/${data.urlId}`;
          
          // 格式化 URL 显示
          const formattedUrl = formatUrl(cardUrl);
          if (resultUrl) {
            resultUrl.innerHTML = formattedUrl;
            
            // 保存原始 URL 用于复制和预览
            resultUrl.dataset.originalUrl = cardUrl;
            resultUrl.dataset.cardUrl = cardUrl;
            resultUrl.dataset.viewUrl = viewUrl;
            resultUrl.dataset.urlId = data.urlId;
          }

          if (resultMeta) {
            const title = data.title ? String(data.title) : '分享卡片';
            const summary = data.summary ? ` · ${data.summary}` : '';
            resultMeta.textContent = `${title}${summary}`;
            resultMeta.style.display = 'block';
          }
          
          // 无论是否启用了密码保护，都保存密码
          if (generatedPassword) {
            generatedPassword.textContent = data.password;
          }
          console.log('生成的密码:', data.password); // 调试输出
          
          // 根据开关状态显示或隐藏密码区域
          if (passwordToggle && passwordToggle.checked) {
            if (passwordInfo) passwordInfo.style.display = 'block';
            if (copyPasswordLink) copyPasswordLink.style.display = 'inline-block';
          } else {
            if (passwordInfo) passwordInfo.style.display = 'none';
            if (copyPasswordLink) copyPasswordLink.style.display = 'none';
          }
          
          // 显示结果区域
          if (resultSection) {
            resultSection.style.display = 'block';
            
            // 使用 setTimeout 确保动画效果正确显示
            setTimeout(() => {
              resultSection.classList.add('fade-in');
              // 添加光影效果和流动效果，只出现一次
              // 先移除之前的类，确保动画可以重新触发
              resultSection.classList.remove('glow-effect');
              resultSection.classList.remove('flow-effect');
              
              // 使用 setTimeout 确保在下一个渲染周期添加类
              setTimeout(() => {
                resultSection.classList.add('glow-effect');
                resultSection.classList.add('flow-effect');
                
                // 动画结束后不需要手动移除类，因为 CSS 中设置了 forwards
                // 但为了确保下次点击时可以再次触发动画，我们在动画完成后移除类
                setTimeout(() => {
                  resultSection.classList.remove('glow-effect');
                  resultSection.classList.remove('flow-effect');
                }, 3000);
              }, 10);
            }, 10);
          }
          
          // 添加成功反馈
          generateButton.classList.add('success-pulse');
          setTimeout(() => {
            generateButton.classList.remove('success-pulse');
          }, 500);
          
          // 隐藏加载指示器
          loadingIndicator.classList.remove('show');
          
          // 不需要显示生成链接的toast提示
        } else {
          throw new Error(getApiErrorMessage(data, '生成链接失败'));
        }
        
        // 恢复按钮状态
        generateButton.innerHTML = '<i class="fas fa-link mr-1"></i>确认生成';
        generateButton.disabled = false;
        
        // 隐藏加载指示器
        loadingIndicator.classList.remove('show');
      } catch (error) {
        console.error('生成链接错误:', error);
        
        // 如果是 ZIP 文件的校验提示，使用警告弹窗展示，方便用户阅读；否则展示 toast
        const msg = error.message || '生成链接时发生错误';
        if (msg.includes('源码') || msg.includes('编译') || msg.includes('压缩') || msg.includes('index.html')) {
          showWarningModal('ZIP 智能检测提示', msg);
        } else {
          showErrorToast(msg);
        }
        
        // 恢复按钮状态
        generateButton.innerHTML = '<i class="fas fa-link mr-1"></i>确认生成';
        generateButton.disabled = false;
        
        // 隐藏加载指示器
        loadingIndicator.classList.remove('show');
      }
    });
  }
  
  // 复制链接按钮 - 只复制链接
  if (copyButton) {
    copyButton.addEventListener('click', () => {
      if (!resultUrl || !resultUrl.dataset.originalUrl) {
        showErrorToast('没有可复制的链接');
        return;
      }
      
      // 始终只复制链接，不复制密码
      const textToCopy = resultUrl.dataset.originalUrl;
      console.log('要复制的链接:', textToCopy);
      
      // 使用传统的复制方法
      try {
        // 创建一个临时文本区域
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';  // 避免滚动到视图中
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        // 执行复制命令
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          showSuccessToast('链接已复制到剪贴板');
          copyButton.classList.add('success-pulse');
          setTimeout(() => {
            copyButton.classList.remove('success-pulse');
          }, 500);
        } else {
          throw new Error('execCommand 复制失败');
        }
      } catch (error) {
        console.error('复制失败:', error);
        showErrorToast('复制链接失败');
      }
    });
  }
  
  // 预览按钮
  if (previewButton) {
    previewButton.addEventListener('click', () => {
      if (!resultUrl || !resultUrl.dataset.originalUrl) {
        showErrorToast('没有可预览的链接');
        return;
      }
      
      window.open(resultUrl.dataset.viewUrl || resultUrl.dataset.originalUrl, '_blank');
    });
  }

  // 分享卡片按钮
  if (shareCardButton) {
    shareCardButton.addEventListener('click', () => {
      if (!resultUrl || !resultUrl.dataset.originalUrl) {
        showErrorToast('没有可打开的分享卡片');
        return;
      }

      window.open(resultUrl.dataset.cardUrl || resultUrl.dataset.originalUrl, '_blank');
    });
  }
  
  // 密码区域点击复制功能
  if (generatedPassword) {
    generatedPassword.addEventListener('click', () => {
      if (!generatedPassword.textContent) {
        showErrorToast('没有可复制的密码');
        return;
      }
      
      const textToCopy = generatedPassword.textContent;
      console.log('要复制的密码:', textToCopy); // 调试输出
      
      // 使用传统的复制方法
      const copyToClipboard = (text) => {
        try {
          // 创建一个临时文本区域
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';  // 避免滚动到视图中
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          // 执行复制命令
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          
          if (successful) {
            showSuccessToast('密码已复制到剪贴板');
            
            // 添加视觉反馈
            generatedPassword.classList.add('copied');
            setTimeout(() => {
              generatedPassword.classList.remove('copied');
            }, 500);
            
            return true;
          } else {
            throw new Error('execCommand 复制失败');
          }
        } catch (err) {
          console.error('复制失败:', err);
          showErrorToast('复制失败');
          return false;
        }
      };
      
      copyToClipboard(textToCopy);
    });
  }
  
  // 复制密码和链接按钮
  if (copyPasswordLink) {
    copyPasswordLink.addEventListener('click', (e) => {
      e.preventDefault(); // 防止默认的锚点行为
      
      if (!resultUrl || !resultUrl.dataset.originalUrl || !generatedPassword || !generatedPassword.textContent) {
        showErrorToast('没有可复制的内容');
        return;
      }
      
      const textToCopy = `链接: ${resultUrl.dataset.originalUrl}\n密码: ${generatedPassword.textContent}`;
      console.log('要复制的内容:', textToCopy); // 调试输出
      
      // 使用传统的复制方法
      const copyToClipboard = (text) => {
        try {
          // 创建一个临时文本区域
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';  // 避免滚动到视图中
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          // 执行复制命令
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          
          if (successful) {
            showSuccessToast('链接和密码已复制到剪贴板');
            
            // 添加视觉反馈
            copyPasswordLink.classList.add('success-pulse');
            setTimeout(() => {
              copyPasswordLink.classList.remove('success-pulse');
            }, 500);
            
            return true;
          } else {
            throw new Error('execCommand 复制失败');
          }
        } catch (err) {
          console.error('复制失败:', err);
          showErrorToast('复制失败');
          return false;
        }
      };
      
      copyToClipboard(textToCopy);
    });
  }
  
  // 初始化完成
  console.log('应用初始化完成');
});

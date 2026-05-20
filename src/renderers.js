import { marked } from 'marked';
import { escapeHtml } from './templates.js';

export const CODE_TYPES = {
  HTML: 'html',
  MARKDOWN: 'markdown',
  SVG: 'svg',
  MERMAID: 'mermaid',
  UNKNOWN: 'unknown',
};

export function detectCodeType(code) {
  if (!code || typeof code !== 'string') return CODE_TYPES.UNKNOWN;

  const trimmedCode = code.trim();

  if (trimmedCode.startsWith('<!DOCTYPE html>') || trimmedCode.startsWith('<html')) {
    return CODE_TYPES.HTML;
  }

  if (trimmedCode.startsWith('```html')) return CODE_TYPES.HTML;
  if (trimmedCode.startsWith('```mermaid')) return CODE_TYPES.MERMAID;
  if (trimmedCode.startsWith('```svg')) return CODE_TYPES.SVG;

  if (
    trimmedCode.startsWith('<svg') &&
    trimmedCode.includes('</svg>') &&
    trimmedCode.includes('xmlns="http://www.w3.org/2000/svg"')
  ) {
    return CODE_TYPES.SVG;
  }

  if (trimmedCode.includes('```mermaid')) {
    return isDefinitelyMarkdown(trimmedCode) ? CODE_TYPES.MARKDOWN : CODE_TYPES.MERMAID;
  }

  if (trimmedCode.includes('```svg')) {
    return isDefinitelyMarkdown(trimmedCode) ? CODE_TYPES.MARKDOWN : CODE_TYPES.SVG;
  }

  const mermaidPatterns = [
    /^\s*graph\s+[A-Za-z\s]/i,
    /^\s*flowchart\s+[A-Za-z\s]/i,
    /^\s*sequenceDiagram/i,
    /^\s*classDiagram/i,
    /^\s*gantt/i,
    /^\s*pie/i,
    /^\s*erDiagram/i,
    /^\s*journey/i,
    /^\s*stateDiagram/i,
    /^\s*gitGraph/i,
  ];

  if (mermaidPatterns.some((pattern) => pattern.test(trimmedCode)) && !containsMarkdownFeatures(trimmedCode)) {
    return CODE_TYPES.MERMAID;
  }

  const hasHtmlTags =
    trimmedCode.startsWith('<') &&
    (trimmedCode.includes('<div') ||
      trimmedCode.includes('<p') ||
      trimmedCode.includes('<span') ||
      trimmedCode.includes('<h1') ||
      trimmedCode.includes('<body') ||
      trimmedCode.includes('<head') ||
      trimmedCode.includes('<style') ||
      trimmedCode.includes('<script') ||
      trimmedCode.includes('<link') ||
      trimmedCode.includes('<meta'));

  if (hasHtmlTags) return CODE_TYPES.HTML;
  if (isDefinitelyMarkdown(trimmedCode)) return CODE_TYPES.MARKDOWN;

  return CODE_TYPES.HTML;
}

export function extractCodeBlocks(content) {
  if (!content || typeof content !== 'string') return [];

  const codeBlockRegex = /```([a-zA-Z0-9_]+)[\s\n]([\s\S]*?)```/g;
  const blocks = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const blockType = match[1].toLowerCase();
    const blockContent = match[2].trim();
    let contentType = CODE_TYPES.UNKNOWN;

    switch (blockType) {
      case 'html':
      case 'xml':
        contentType = CODE_TYPES.HTML;
        break;
      case 'svg':
        contentType = CODE_TYPES.SVG;
        break;
      case 'mermaid':
        contentType = CODE_TYPES.MERMAID;
        break;
      case 'markdown':
      case 'md':
        contentType = CODE_TYPES.MARKDOWN;
        break;
      default:
        contentType = detectCodeType(blockContent);
    }

    blocks.push({
      originalType: blockType,
      type: contentType,
      content: blockContent,
    });
  }

  return blocks;
}

export async function renderContent(content, contentType) {
  switch (contentType) {
    case CODE_TYPES.HTML:
      return renderHtml(content);
    case CODE_TYPES.MARKDOWN:
      return renderMarkdown(content);
    case CODE_TYPES.SVG:
      return renderSvg(content);
    case CODE_TYPES.MERMAID:
      return renderMermaid(content);
    default:
      return renderMarkdown(content);
  }
}

export function normalizeContentForRendering(rawContent) {
  const codeBlocks = extractCodeBlocks(rawContent);
  let processedContent = rawContent;
  let detectedType = CODE_TYPES.HTML;

  if (codeBlocks.length > 0) {
    if (codeBlocks.length === 1 && codeBlocks[0].content.length > rawContent.length * 0.7) {
      processedContent = codeBlocks[0].content;
      detectedType = codeBlocks[0].type;
    } else if (codeBlocks.length > 1) {
      processedContent = buildMultiCodeBlockDocument(codeBlocks);
      detectedType = CODE_TYPES.HTML;
    } else {
      detectedType = detectCodeType(rawContent);
    }
  } else {
    detectedType = detectCodeType(rawContent);

    if (rawContent.trim().startsWith('<!DOCTYPE html>') || rawContent.trim().startsWith('<html')) {
      detectedType = CODE_TYPES.HTML;
    }
  }

  const validTypes = new Set([CODE_TYPES.HTML, CODE_TYPES.MARKDOWN, CODE_TYPES.SVG, CODE_TYPES.MERMAID]);
  return {
    content: processedContent,
    contentType: validTypes.has(detectedType) ? detectedType : CODE_TYPES.HTML,
  };
}

function containsMarkdownFeatures(content) {
  return (
    content.includes('###') ||
    content.includes('##') ||
    content.includes('# ') ||
    /^-\s.+/m.test(content) ||
    /^\*\s.+/m.test(content) ||
    /^\d+\.\s.+/m.test(content) ||
    content.includes('```') ||
    /\[.+\]\(.+\)/.test(content) ||
    /!\[.+\]\(.+\)/.test(content) ||
    /^>\s.+/m.test(content) ||
    /\|.+\|/.test(content) ||
    /\*\*.+\*\*/.test(content) ||
    /__.+__/.test(content)
  );
}

function isDefinitelyMarkdown(content) {
  const markdownFeatureCount = [
    /^#{1,6}\s.+/m.test(content),
    /^[-*+]\s.+/m.test(content),
    /^\d+\.\s.+/m.test(content),
    /^>\s.+/m.test(content),
    /^```[\s\S]*?```/m.test(content),
    /\[.+?\]\(.+?\)/m.test(content),
    /!\[.+?\]\(.+?\)/m.test(content),
    /\|.+\|[\s\S]*?\|.+\|/m.test(content),
  ].filter(Boolean).length;

  return markdownFeatureCount >= 2 || (content.length < 1000 && markdownFeatureCount >= 1);
}

function renderHtml(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html')) {
    return content;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML-GO 查看器</title>
  ${viewerIcons()}
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/atom-one-dark.min.css">
  <style>
    body {
      font-family: 'Roboto', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 30px;
      margin-top: 20px;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e6e6e6;
      }
      .container {
        background-color: #2a2a2a;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    });
  </script>
</body>
</html>`;
}

function renderMarkdown(content) {
  const renderer = new marked.Renderer();
  const originalCodeRenderer = renderer.code.bind(renderer);

  renderer.code = function codeRenderer(tokenOrCode, infostring, escaped) {
    const code = typeof tokenOrCode === 'object' && tokenOrCode !== null ? tokenOrCode.text : tokenOrCode;
    const language = typeof tokenOrCode === 'object' && tokenOrCode !== null ? tokenOrCode.lang : infostring;
    const normalizedLanguage = String(language || '').toLowerCase();

    if (normalizedLanguage === 'mermaid' || isMermaidContent(code)) {
      return `<div class="mermaid">${escapeHtml(code)}</div>`;
    }

    if (normalizedLanguage === 'svg') {
      return `<div class="embedded-svg-container">${code}</div>`;
    }

    return originalCodeRenderer(tokenOrCode, infostring, escaped);
  };

  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer,
  });

  const processedContent = preprocessMarkdown(content);
  const htmlContent = processedContent.startsWith('<div class="mermaid">')
    ? processedContent
    : marked.parse(processedContent);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML-GO Markdown查看器</title>
  ${viewerIcons()}
  <link rel="stylesheet" href="/css/markdown-bytedance.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/atom-one-dark.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f5f5f7;
    }
    .embedded-svg-container {
      margin: 20px 0;
      overflow: auto;
      max-width: 100%;
    }
    .mermaid {
      margin: 20px 0;
      text-align: center;
      overflow: auto;
      background-color: white;
      padding: 10px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .mermaid-error {
      margin: 20px 0;
      padding: 10px;
      border-radius: 5px;
      background-color: #fff0f0;
      border: 1px solid #ffcccc;
      color: #cc0000;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
      }
      .mermaid {
        background-color: #2d2d2d;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      }
      .mermaid-error {
        background-color: #3a2222;
        border-color: #662222;
        color: #ff6666;
      }
    }
  </style>
  ${mermaidRuntimeScript()}
</head>
<body>
  <div class="markdown-body">
    ${htmlContent}
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    });
  </script>
</body>
</html>`;
}

function renderSvg(content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML-GO SVG查看器</title>
  ${viewerIcons()}
  <style>
    body {
      font-family: 'Roboto', sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: #f5f5f7;
    }
    .svg-container {
      max-width: 100%;
      overflow: auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    svg {
      display: block;
      max-width: 100%;
      height: auto;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e6e6e6;
      }
      .svg-container {
        background-color: #2a2a2a;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
    }
  </style>
</head>
<body>
  <div class="svg-container">
    ${content}
  </div>
</body>
</html>`;
}

function renderMermaid(content) {
  const mermaidCode = extractMermaidCode(content);
  const escapedMermaidCode = escapeHtml(mermaidCode);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML-GO Mermaid查看器</title>
  ${viewerIcons()}
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>
  <style>
    body {
      font-family: 'Roboto', sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: #f5f5f7;
    }
    .mermaid-container {
      max-width: 100%;
      overflow: auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .mermaid {
      display: block;
      max-width: 100%;
      margin: 0 auto;
    }
    pre.mermaid-code {
      background-color: #f8f9fa;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
      margin: 15px 0;
      border-left: 4px solid #4a6cf7;
      display: none;
    }
    .toggle-code-btn {
      background-color: #4a6cf7;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 15px;
      font-size: 14px;
    }
    .toggle-code-btn:hover {
      background-color: #3a56d4;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e6e6e6;
      }
      .mermaid-container {
        background-color: #2a2a2a;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
      pre.mermaid-code {
        background-color: #333;
        border-left: 4px solid #4a6cf7;
      }
    }
  </style>
</head>
<body>
  <div class="mermaid-container">
    <h2>Mermaid 图表查看器</h2>
    <button class="toggle-code-btn" onclick="toggleCode()">显示/隐藏代码</button>
    <pre class="mermaid-code"><code>${escapedMermaidCode}</code></pre>
    <div class="mermaid">
${escapedMermaidCode}
    </div>
  </div>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      securityLevel: 'loose',
      theme: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
      logLevel: 'info',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      er: { useMaxWidth: true },
      pie: { useMaxWidth: true }
    });
    setTimeout(() => {
      try {
        mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
      } catch (error) {
        console.error('Mermaid 图表渲染失败:', error);
      }
    }, 100);
    function toggleCode() {
      const codeBlock = document.querySelector('.mermaid-code');
      codeBlock.style.display = codeBlock.style.display === 'block' ? 'none' : 'block';
    }
  </script>
</body>
</html>`;
}

function buildMultiCodeBlockDocument(codeBlocks) {
  const blocks = codeBlocks
    .map((block, index) => {
      let body = '';
      if (block.type === CODE_TYPES.MERMAID) {
        body = `<div class="mermaid">\n${escapeHtml(block.content)}\n</div>`;
      } else if (block.type === CODE_TYPES.SVG || block.type === CODE_TYPES.HTML) {
        body = block.content;
      } else {
        body = `<pre>\n${escapeHtml(block.content)}\n</pre>`;
      }

      return `<div class="code-block">
  <div class="code-block-header">代码块 ${index + 1} (${escapeHtml(block.originalType)})</div>
  ${body}
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>多代码块内容</title>
<style>
.code-block { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
.code-block-header { font-weight: bold; margin-bottom: 10px; }
</style>
</head>
<body>
${blocks}
</body>
</html>`;
}

function preprocessMarkdown(content) {
  if (!content.includes('```') && isMermaidContent(content)) {
    return `<div class="mermaid">\n${escapeHtml(content)}\n</div>`;
  }
  return content;
}

function isMermaidContent(code = '') {
  const mermaidPatterns = [
    /^(graph|flowchart)\s+(TB|TD|BT|RL|LR)\b/m,
    /^sequenceDiagram\b/m,
    /^classDiagram\b/m,
    /^stateDiagram(-v2)?\b/m,
    /^erDiagram\b/m,
    /^gantt\b/m,
    /^pie\b/m,
    /^journey\b/m,
    /^gitGraph\b/m,
    /^mindmap\b/m,
    /^timeline\b/m,
    /^C4Context\b/m,
  ];

  return mermaidPatterns.some((pattern) => pattern.test(String(code).trim()));
}

function extractMermaidCode(content) {
  const trimmed = content.trim();
  if (!trimmed.includes('```mermaid') && isMermaidContent(trimmed)) return trimmed;

  const firstMatch = trimmed.match(/```mermaid\n([\s\S]+?)\n```/);
  if (firstMatch && firstMatch[1]) return firstMatch[1].trim();

  return trimmed;
}

function viewerIcons() {
  return `
  <link rel="icon" href="/icon/web/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/icon/web/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon/web/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/icon/web/icon-512.png">
  <meta name="theme-color" content="#6366f1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="HTML-GO">`;
}

function mermaidRuntimeScript() {
  return `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      const convertMermaidCodeBlocks = function() {
        const codeBlocks = document.querySelectorAll('pre code.language-mermaid');
        codeBlocks.forEach(function(codeBlock, index) {
          const code = codeBlock.textContent;
          const pre = codeBlock.parentNode;
          const mermaidDiv = document.createElement('div');
          mermaidDiv.className = 'mermaid';
          mermaidDiv.id = 'mermaid-converted-' + index;
          mermaidDiv.textContent = code;
          if (pre && pre.parentNode) pre.parentNode.replaceChild(mermaidDiv, pre);
        });
        return codeBlocks.length > 0;
      };

      try {
        convertMermaidCodeBlocks();
        mermaid.initialize({
          startOnLoad: true,
          securityLevel: 'loose',
          theme: isDarkMode ? 'dark' : 'default',
          flowchart: { useMaxWidth: true, htmlLabels: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
          er: { useMaxWidth: true },
          pie: { useMaxWidth: true }
        });

        setTimeout(function renderMermaidElements() {
          const hasNewCodeBlocks = convertMermaidCodeBlocks();
          const mermaidElements = document.querySelectorAll('.mermaid');
          let hasUnrenderedElements = hasNewCodeBlocks;

          mermaidElements.forEach(function(el) {
            if (el.querySelector('svg') === null && !el.classList.contains('mermaid-error')) {
              hasUnrenderedElements = true;
              try {
                if (typeof mermaid.run === 'function') {
                  mermaid.run({ nodes: [el] });
                } else if (typeof mermaid.init === 'function') {
                  mermaid.init(undefined, el);
                }
              } catch (err) {
                console.error('Failed to render Mermaid diagram:', err);
                el.innerHTML = '<pre>' + el.textContent + '</pre>';
                el.classList.add('mermaid-error');
              }
            }
          });

          if (hasUnrenderedElements) setTimeout(renderMermaidElements, 1000);
        }, 500);
      } catch (error) {
        console.error('Error initializing Mermaid:', error);
      }
    });
  </script>`;
}

import { marked } from 'marked';
import { sanitizeDocxContent } from './docx-content.js';
import { escapeHtml } from './templates.js';

export const CODE_TYPES = {
  HTML: 'html',
  MARKDOWN: 'markdown',
  DOCX: 'docx',
  SVG: 'svg',
  MERMAID: 'mermaid',
  ZIP: 'zip',
  UNKNOWN: 'unknown',
};

export const MARKDOWN_THEMES = {
  BYTEDANCE: 'bytedance',
  GITHUB: 'github',
  DOCS: 'docs',
  CLEAN: 'clean',
  MAGAZINE: 'magazine',
  NOTE: 'note',
  SLATE: 'slate',
};

const VALID_MARKDOWN_THEMES = new Set(Object.values(MARKDOWN_THEMES));

export function normalizeMarkdownTheme(theme) {
  const value = String(theme || '').trim().toLowerCase();
  return VALID_MARKDOWN_THEMES.has(value) ? value : MARKDOWN_THEMES.BYTEDANCE;
}

export function detectCodeType(code) {
  if (!code || typeof code !== 'string') return CODE_TYPES.UNKNOWN;

  const trimmedCode = code.trim();

  if (trimmedCode.startsWith('<!DOCTYPE html>') || trimmedCode.startsWith('<html')) {
    return CODE_TYPES.HTML;
  }

  const openingFence = /^```(html|mermaid|svg)\b[^\r\n]*\r?\n/.exec(trimmedCode);
  if (openingFence) {
    const closingFence = trimmedCode.indexOf('```', openingFence[0].length);
    if (closingFence !== -1 && !trimmedCode.slice(closingFence + 3).trim()) return openingFence[1];
  }

  if (
    trimmedCode.startsWith('<svg') &&
    trimmedCode.includes('</svg>') &&
    trimmedCode.includes('xmlns="http://www.w3.org/2000/svg"')
  ) {
    return CODE_TYPES.SVG;
  }

  if (trimmedCode.includes('```mermaid')) {
    const prose = trimmedCode.replace(/```[^\n]*\n[\s\S]*?```/g, '').trim();
    return prose || isDefinitelyMarkdown(trimmedCode) ? CODE_TYPES.MARKDOWN : CODE_TYPES.MERMAID;
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
    /^\s*mindmap\b/i,
    /^\s*timeline\b/i,
    /^\s*quadrantChart\b/i,
    /^\s*sankey-beta\b/i,
    /^\s*xychart-beta\b/i,
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

export async function renderContent(content, contentType, options = {}) {
  switch (contentType) {
    case CODE_TYPES.HTML:
      return renderHtml(content);
    case CODE_TYPES.DOCX:
      return renderMarkdown(sanitizeDocxContent(content), options.markdownTheme, { ...options, docx: true });
    case CODE_TYPES.MARKDOWN:
      return renderMarkdown(content, options.markdownTheme, options);
    case CODE_TYPES.SVG:
      return renderSvg(content);
    case CODE_TYPES.MERMAID:
      return renderMermaid(content);
    default:
      return renderMarkdown(content, options.markdownTheme, options);
  }
}

export function normalizeContentForRendering(rawContent, expectedType) {
  // 如果已明确预期类型是 Markdown，或者整文内容被判定为 Markdown，则不应当提取其中的代码块，而应整文渲染
  if (expectedType === CODE_TYPES.DOCX) {
    return { content: sanitizeDocxContent(rawContent), contentType: CODE_TYPES.DOCX };
  }

  if (expectedType === CODE_TYPES.MARKDOWN) {
    return {
      content: rawContent,
      contentType: CODE_TYPES.MARKDOWN,
    };
  }

  if (expectedType === CODE_TYPES.SVG) {
    return {
      content: rawContent,
      contentType: CODE_TYPES.SVG,
    };
  }

  if (expectedType === CODE_TYPES.MERMAID) {
    return {
      content: rawContent,
      contentType: CODE_TYPES.MERMAID,
    };
  }

  // 如果没有明确预期类型，我们先检测整文类型是否为 Markdown
  const rawDetectedType = detectCodeType(rawContent);
  if (rawDetectedType === CODE_TYPES.MARKDOWN) {
    return {
      content: rawContent,
      contentType: CODE_TYPES.MARKDOWN,
    };
  }

  const codeBlocks = extractCodeBlocks(rawContent);
  let processedContent = rawContent;
  let detectedType = expectedType || rawDetectedType;

  if (codeBlocks.length > 0) {
    if (codeBlocks.length === 1 && codeBlocks[0].content.length > rawContent.length * 0.7) {
      processedContent = codeBlocks[0].content;
      detectedType = codeBlocks[0].type;
    } else if (codeBlocks.length > 1) {
      processedContent = buildMultiCodeBlockDocument(codeBlocks);
      detectedType = CODE_TYPES.HTML;
    } else {
      detectedType = detectedType || detectCodeType(rawContent);
    }
  } else {
    detectedType = detectedType || detectCodeType(rawContent);

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
  <title>goshare 查看器</title>
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

function renderMarkdown(content, theme, options = {}) {
  const markdownTheme = normalizeMarkdownTheme(theme);
  const renderer = new marked.Renderer();
  const originalCodeRenderer = renderer.code.bind(renderer);
  let headingIndex = 0;
  renderer.heading = function headingRenderer({ tokens, depth }) {
    return `<h${depth} id="article-section-${++headingIndex}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };

  renderer.code = function codeRenderer(tokenOrCode, infostring, escaped) {
    const code = typeof tokenOrCode === 'object' && tokenOrCode !== null ? tokenOrCode.text : tokenOrCode;
    const language = typeof tokenOrCode === 'object' && tokenOrCode !== null ? tokenOrCode.lang : infostring;
    const normalizedLanguage = String(language || '').trim().split(/\s+/)[0].toLowerCase();

    if (normalizedLanguage === 'mermaid' || (!normalizedLanguage && isMermaidContent(code))) {
      return `<div class="mermaid">${escapeHtml(code)}</div>`;
    }

    if (normalizedLanguage === 'svg') {
      return `<div class="embedded-svg-container">${code}</div>`;
    }

    return originalCodeRenderer(tokenOrCode, infostring, escaped);
  };

  const processedContent = options.docx ? content : preprocessMarkdown(content);
  const htmlContent = options.docx || processedContent.startsWith('<div class="mermaid">')
    ? processedContent
    : marked.parse(processedContent, { gfm: true, breaks: true, renderer });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>goshare ${options.docx ? 'DOCX 文章' : 'Markdown'}查看器</title>
  ${viewerIcons()}
  <link rel="stylesheet" href="${getMarkdownThemeStylesheet(markdownTheme)}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/atom-one-dark.min.css">
  <link rel="stylesheet" href="/css/markdown-contrast.css">
  <link rel="stylesheet" href="/css/article-reader.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f5f5f7;
    }
    ${getMarkdownThemePageStyles(markdownTheme)}
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
<body class="markdown-page markdown-page-${markdownTheme}${options.previewMode ? ' workflow-preview' : ''}">
  ${articleReaderShell(htmlContent, `markdown-body markdown-theme-${markdownTheme}`, options.aiAnalysisEnabled !== false)}
  <script src="/js/article-reader.js" defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    });
  </script>
</body>
</html>`;
}

function getMarkdownThemeStylesheet(theme) {
  switch (normalizeMarkdownTheme(theme)) {
    case MARKDOWN_THEMES.GITHUB:
      return '/css/markdown-themes/github.css';
    case MARKDOWN_THEMES.DOCS:
      return '/css/markdown-themes/docs.css';
    case MARKDOWN_THEMES.CLEAN:
      return '/css/markdown-themes/clean.css';
    case MARKDOWN_THEMES.MAGAZINE:
      return '/css/markdown-themes/magazine.css';
    case MARKDOWN_THEMES.NOTE:
      return '/css/markdown-themes/note.css';
    case MARKDOWN_THEMES.SLATE:
      return '/css/markdown-themes/slate.css';
    case MARKDOWN_THEMES.BYTEDANCE:
    default:
      return '/css/markdown-bytedance.css';
  }
}

function getMarkdownThemePageStyles(theme) {
  switch (normalizeMarkdownTheme(theme)) {
    case MARKDOWN_THEMES.GITHUB:
      return `
    body.markdown-page-github {
      background-color: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      body.markdown-page-github {
        background-color: #0d1117;
      }
    }`;
    case MARKDOWN_THEMES.DOCS:
      return `
    body.markdown-page-docs {
      background-color: #f6f8fb;
    }
    @media (prefers-color-scheme: dark) {
      body.markdown-page-docs {
        background-color: #111827;
      }
    }`;
    case MARKDOWN_THEMES.SLATE:
      return `
    body.markdown-page-slate {
      background-color: #0f172a;
    }`;
    case MARKDOWN_THEMES.CLEAN:
      return `
    body.markdown-page-clean {
      background-color: #f8fafc;
    }`;
    case MARKDOWN_THEMES.MAGAZINE:
      return `
    body.markdown-page-magazine {
      background-color: #f8f1e8;
    }`;
    case MARKDOWN_THEMES.NOTE:
      return `
    body.markdown-page-note {
      background-color: #fff8dc;
    }`;
    case MARKDOWN_THEMES.BYTEDANCE:
    default:
      return '';
  }
}

function renderSvg(content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>goshare SVG查看器</title>
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
  <title>goshare Mermaid查看器</title>
  ${viewerIcons()}
  <link rel="stylesheet" href="/css/article-reader.css">
  ${mermaidRuntimeScript()}
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
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e6e6e6;
      }
      .mermaid-container {
        background-color: #2a2a2a;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
    }
  </style>
</head>
<body>
  <div class="mermaid-container">
    <h2>Mermaid 图表查看器</h2>
    <div class="mermaid">
${escapedMermaidCode}
    </div>
  </div>

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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="/css/article-reader.css">
${mermaidRuntimeScript()}
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
    /^(graph|flowchart)\s+(TB|TD|BT|RL|LR)\b/,
    /^sequenceDiagram\b/,
    /^classDiagram\b/,
    /^stateDiagram(-v2)?\b/,
    /^erDiagram\b/,
    /^gantt\b/,
    /^pie\b/,
    /^journey\b/,
    /^gitGraph\b/,
    /^mindmap\b/,
    /^timeline\b/,
    /^C4Context\b/,
  ];

  return mermaidPatterns.some((pattern) => pattern.test(String(code).trim()));
}

function extractMermaidCode(content) {
  const trimmed = content.trim();
  if (isMermaidContent(trimmed)) return trimmed;
  const firstMatch = trimmed.match(/^```mermaid\b[^\r\n]*\r?\n([\s\S]+?)\r?\n```\s*$/i);
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
  <meta name="apple-mobile-web-app-title" content="goshare">`;
}

function mermaidRuntimeScript() {
  return `<script src="/js/article-graphs.js" defer></script>
  <script src="/js/diagram-viewer.js" defer></script>`;
}

function articleReaderShell(content, className, aiEnabled) {
  return `
  <div class="reader-toolbar" id="article-toolbar" hidden>
    <button class="reader-button" id="article-outline-toggle" type="button" aria-controls="article-outline" aria-expanded="true">目录</button>
    <button class="reader-button" id="article-map-open" type="button">思维导图</button>
    <button class="reader-button" id="article-ai-analyze" type="button"${aiEnabled ? '' : ' disabled'}>AI 分析全文</button>
    <button class="reader-button" id="article-heading-mode" type="button" hidden>标题目录</button>
    <span id="article-node-count"></span>
    <span id="article-ai-status" role="status">${aiEnabled ? '' : '当前环境未启用 AI 分析'}</span>
    <progress id="article-progress" max="100" value="0" aria-label="阅读进度"></progress>
    <nav id="article-graph-nav" class="reader-graph-nav" aria-label="生成图形导航" hidden></nav>
  </div>
  <div class="reader-layout outline-hidden">
    <aside class="reader-outline" id="article-outline" aria-label="文章目录" hidden>
      <h2>文章目录</h2>
      <p id="article-ai-summary" hidden></p>
      <input id="article-outline-search" type="search" placeholder="搜索章节…" aria-label="搜索文章目录">
      <nav id="article-outline-list" aria-label="章节导航"></nav>
      <p id="article-outline-empty" hidden>没有匹配的章节</p>
    </aside>
    <article class="${className}" data-article-content>${content}</article>
  </div>
  <dialog class="reader-map-dialog" id="article-map-dialog" aria-labelledby="article-map-title">
    <header class="reader-map-header">
      <div><h2 id="article-map-title">文章思维导图</h2><p id="article-map-caption"></p></div>
      <button class="reader-button" id="article-map-close" type="button" aria-label="关闭思维导图">关闭</button>
    </header>
    <div class="reader-map-tools">
      <button class="reader-button" type="button" data-map-zoom="-0.2" aria-label="缩小思维导图">−</button>
      <span id="article-map-scale">100%</span>
      <button class="reader-button" type="button" data-map-zoom="0.2" aria-label="放大思维导图">+</button>
      <button class="reader-button" type="button" data-map-zoom="reset">重置</button>
    </div>
    <p class="reader-map-status" id="article-map-status" role="status"></p>
    <div class="reader-map-viewport" id="article-map-viewport"><div class="reader-map-stage" id="article-map-stage"></div></div>
    <details><summary>查看 Mermaid 源码</summary><pre><code id="article-map-source"></code></pre></details>
  </dialog>`;
}

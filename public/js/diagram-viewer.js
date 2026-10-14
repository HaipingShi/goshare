/* One Mermaid runtime for articles, previews, and standalone diagrams. */
(() => {
  let runtime;
  let queue = Promise.resolve();
  let sequence = 0;
  const sources = [
    'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.esm.min.mjs',
    'https://unpkg.com/mermaid@11.6.0/dist/mermaid.esm.min.mjs',
  ];

  function load() {
    if (!runtime) {
      runtime = (async () => {
        for (const source of sources) {
          try {
            const { default: mermaid } = await import(source);
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: 'strict',
              suppressErrorRendering: true,
              theme: document.body.classList.contains('markdown-page-slate') || matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
              flowchart: { useMaxWidth: true, htmlLabels: false },
            });
            return mermaid;
          } catch (error) {
            console.warn('Diagram runtime unavailable:', source);
          }
        }
        throw new Error('图表组件加载失败，请检查网络后重试。');
      })().catch((error) => { runtime = undefined; throw error; });
    }
    return runtime;
  }

  function render(source, target) {
    // Mermaid shares internal rendering state: serialize work and await each failure.
    const task = queue.then(async () => {
      const mermaid = await load();
      const id = `goshare-diagram-${++sequence}`;
      try {
        const { svg } = await mermaid.render(id, source);
        target.innerHTML = svg;
        target.querySelector('svg')?.setAttribute('role', 'img');
        target.querySelector('svg')?.setAttribute('aria-label', target.getAttribute('aria-label') || '文章思维导图');
      } finally {
        document.getElementById(`d${id}`)?.remove();
      }
    });
    queue = task.catch(() => {});
    return task;
  }

  function setupDiagram(node) {
    if (node.dataset.diagramReady) return;
    node.dataset.diagramReady = 'true';
    const source = node.textContent.trim();
    const figure = document.createElement('figure');
    figure.className = 'diagram-card';
    const caption = document.createElement('figcaption');
    caption.textContent = /^mindmap\b/.test(source) ? '思维导图' : 'Mermaid 图表';
    const stage = document.createElement('div');
    stage.className = 'diagram-stage';
    stage.setAttribute('aria-label', caption.textContent);
    const status = document.createElement('p');
    status.className = 'diagram-status';
    status.setAttribute('role', 'status');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'reader-button';
    retry.textContent = '重新渲染';
    retry.hidden = true;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '查看图表源码';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = source;
    pre.append(code);
    details.append(summary, pre);
    figure.append(caption, stage, status, retry, details);
    node.replaceWith(figure);
    async function draw() {
      retry.hidden = true;
      status.hidden = false;
      status.textContent = '正在渲染图表…';
      try {
        await render(source, stage);
        status.hidden = true;
        figure.dataset.rendered = 'true';
      } catch (error) {
        stage.replaceChildren();
        status.textContent = String(error?.message || '').includes('加载失败') ? error.message : '图表语法有误，请展开源码检查。';
        retry.hidden = false;
        details.open = true;
        figure.dataset.rendered = 'error';
      }
    }
    retry.addEventListener('click', draw);
    draw();
  }

  window.GoshareDiagrams = { render };
  function start() {
    document.querySelectorAll('pre code.language-mermaid').forEach((code) => {
      const node = document.createElement('div');
      node.className = 'mermaid';
      node.textContent = code.textContent;
      code.parentElement.replaceWith(node);
    });
    document.querySelectorAll('.mermaid').forEach(setupDiagram);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

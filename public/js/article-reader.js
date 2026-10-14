(() => {
  function buildOutline(headings) {
    const roots = [];
    const stack = [];
    headings.forEach((heading) => {
      const node = { ...heading, children: [] };
      while (stack.length && stack.at(-1).level >= node.level) stack.pop();
      (stack.length ? stack.at(-1).children : roots).push(node);
      stack.push(node);
    });
    return roots;
  }

  function buildMindmap(roots, title, limit = 24) {
    return GoshareGraphs.buildMindmap(roots, title, limit);
  }

  globalThis.GoshareArticle = { buildOutline, buildMindmap };
  if (typeof document === 'undefined') return;

  function start() {
    const article = document.querySelector('[data-article-content]');
    if (!article) return;
    const panel = document.getElementById('article-outline');
    const toolbar = document.getElementById('article-toolbar');
    const nav = document.getElementById('article-outline-list');
    const search = document.getElementById('article-outline-search');
    const toggle = document.getElementById('article-outline-toggle');
    const mapButton = document.getElementById('article-map-open');
    const dialog = document.getElementById('article-map-dialog');
    const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((heading) => !heading.closest('pre, .diagram-card, .mermaid, .embedded-svg-container'));
    const usedIds = new Set([...document.querySelectorAll('[id]')].map((node) => node.id));
    let records = headings.map((heading, index) => {
      if (!heading.id || document.getElementById(heading.id) !== heading) {
        let id = `article-section-${index + 1}`;
        while (usedIds.has(id)) id += '-section';
        heading.id = id;
        usedIds.add(id);
      }
      heading.tabIndex = -1;
      return { id: heading.id, text: heading.textContent.trim() || '未命名章节', level: Number(heading.tagName.slice(1)), element: heading };
    });
    let roots = buildOutline(records);
    const headingRecords = records;
    const headingRoots = roots;
    const sourceBlocks = new Map();
    const blocks = [...article.children].map((element, index) => {
      if (['SCRIPT', 'STYLE'].includes(element.tagName) || element.matches('[data-goshare-analysis], [data-goshare-diagram], [data-generated-diagram]')) return null;
      const clone = element.cloneNode(true);
      clone.querySelectorAll('script,style').forEach((node) => node.remove());
      const bodyText = element.classList.contains('diagram-card')
        ? element.querySelector('code')?.textContent : element.innerText || clone.textContent;
      const imageLabels = [...clone.querySelectorAll('img')].map((image) => image.alt?.trim()).filter(Boolean);
      const text = [bodyText, ...imageLabels.map((label) => `[图片说明：${label}]`)].filter(Boolean).join('\n');
      if (!text?.trim()) return null;
      if (!element.id) {
        let id = `article-block-${index + 1}`;
        while (usedIds.has(id)) id += '-block';
        element.id = id;
        usedIds.add(id);
      }
      element.tabIndex = -1;
      const id = `block-${index + 1}`;
      sourceBlocks.set(id, element);
      return { id, text: text.trim() };
    }).filter(Boolean);
    const links = new Map();
    const collapsible = [];
    function list(nodes) {
      const ul = document.createElement('ul');
      nodes.forEach((node) => {
        const li = document.createElement('li');
        li.dataset.outlineId = node.id;
        const row = document.createElement('div');
        row.className = 'outline-row';
        const link = document.createElement('a');
        link.href = `#${encodeURIComponent(node.targetId || node.id)}`;
        link.textContent = node.text;
        if (node.summary) link.title = node.summary;
        links.set(node.id, link);
        link.addEventListener('click', (event) => {
          event.preventDefault();
          node.element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
          node.element.focus({ preventScroll: true });
          try { history.replaceState(null, '', link.getAttribute('href')); } catch {}
        });
        row.append(link);
        li.append(row);
        if (node.children.length) {
          const children = list(node.children);
          const fold = document.createElement('button');
          fold.type = 'button';
          fold.className = 'outline-fold';
          fold.textContent = '−';
          fold.setAttribute('aria-label', `折叠 ${node.text}`);
          fold.setAttribute('aria-expanded', 'true');
          fold.addEventListener('click', () => {
            children.hidden = !children.hidden;
            fold.textContent = children.hidden ? '+' : '−';
            fold.setAttribute('aria-expanded', String(!children.hidden));
            fold.setAttribute('aria-label', `${children.hidden ? '展开' : '折叠'} ${node.text}`);
          });
          row.prepend(fold);
          li.append(children);
          collapsible.push({ children, fold, text: node.text });
        }
        ul.append(li);
      });
      return ul;
    }
    nav.append(list(roots));
    toolbar.hidden = false;
    function updateToolbarOffset() {
      document.documentElement.style.setProperty('--reader-toolbar-offset', `${toolbar.offsetHeight + 16}px`);
    }
    updateToolbarOffset();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateToolbarOffset).observe(toolbar);
    // Generated figures are appended after the original source, preserving its
    // block references. Expose them at the top so long articles do not hide them.
    const graphNav = document.getElementById('article-graph-nav');
    const figures = [...article.querySelectorAll('[data-generated-diagram]')];
    if (graphNav && figures.length) {
      const label = document.createElement('span');
      label.textContent = `已生成 ${figures.length} 张图形：`;
      graphNav.append(label);
      figures.forEach((figure, index) => {
        const kind = figure.dataset.generatedDiagram;
        const title = window.GoshareGraphs.GRAPH_LABELS[kind] || '图形';
        let id = `article-diagram-${index + 1}`;
        while (usedIds.has(id)) id += '-graph';
        figure.id = id;
        figure.tabIndex = -1;
        usedIds.add(id);
        const link = document.createElement('a');
        link.href = `#${id}`;
        link.className = 'reader-button reader-graph-link';
        link.setAttribute('aria-label', `查看${title}`);
        const update = () => {
          const state = figure.dataset.rendered;
          link.textContent = `${title} · ${state === 'true' ? '已就绪' : state === 'error' ? '渲染失败' : '加载中'}`;
        };
        update();
        new MutationObserver(update).observe(figure, { attributes: true, attributeFilter: ['data-rendered'] });
        link.addEventListener('click', event => {
          event.preventDefault();
          figure.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          figure.focus({ preventScroll: true });
        });
        graphNav.append(link);
      });
      graphNav.hidden = false;
      updateToolbarOffset();
    }
    document.getElementById('article-node-count').textContent = records.length ? `${records.length} 个章节` : '未检测到章节标题';
    panel.hidden = records.length === 0;
    toggle.disabled = records.length === 0;
    mapButton.disabled = records.length === 0;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    document.querySelector('.reader-layout').classList.toggle('outline-hidden', panel.hidden);
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      document.querySelector('.reader-layout').classList.toggle('outline-hidden', panel.hidden);
    });

    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase();
      function filter(nodes) {
        let found = false;
        nodes.forEach((node) => {
          const childMatch = filter(node.children);
          const matches = !query || node.text.toLocaleLowerCase().includes(query) || childMatch;
          links.get(node.id).closest('li').hidden = !matches;
          found ||= matches;
        });
        return found;
      }
      const found = filter(roots);
      document.getElementById('article-outline-empty').hidden = found;
      if (query) collapsible.forEach(({ children, fold, text }) => {
        children.hidden = false;
        fold.textContent = '−';
        fold.setAttribute('aria-expanded', 'true');
        fold.setAttribute('aria-label', `折叠 ${text}`);
      });
    });

    let active;
    let scheduled = false;
    function updatePosition() {
      scheduled = false;
      const offset = toolbar.offsetHeight + 24;
      let current = records[0];
      let closest = -Infinity;
      records.forEach((node) => {
        const top = node.element.getBoundingClientRect().top;
        if (top <= offset && top >= closest) { current = node; closest = top; }
      });
      if (current && current.id !== active) {
        links.get(active)?.removeAttribute('aria-current');
        links.get(current.id)?.setAttribute('aria-current', 'location');
        active = current.id;
      }
      const rect = article.getBoundingClientRect();
      const progress = Math.max(0, Math.min(100, (-rect.top / Math.max(1, article.offsetHeight - innerHeight)) * 100));
      document.getElementById('article-progress').value = progress;
    }
    addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updatePosition); } }, { passive: true });
    updatePosition();
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && article.contains(target)) {
        target.scrollIntoView({ block: 'start' });
        updatePosition();
      }
    } catch {}

    let mapRendered = false;
    const stage = document.getElementById('article-map-stage');
    const status = document.getElementById('article-map-status');
    let map;
    function updateMap(title, isAi = false) {
      const titleRoot = !isAi && roots.length === 1 && roots[0].level === 1;
      map = buildMindmap(titleRoot ? roots[0].children : roots,
        title || (titleRoot ? roots[0].text : '文章结构'));
      mapRendered = false;
      stage.replaceChildren();
      document.getElementById('article-map-source').textContent = map.source;
      document.getElementById('article-map-caption').textContent = isAi
        ? 'AI 分析全文提炼主题与关系；目录节点可跳转至原文。'
        : records.length - (titleRoot ? 1 : 0) > map.count
          ? `按标题层级生成，保留 ${map.count} 个节点；完整章节请查看目录。` : '按文章标题层级生成，帮助快速了解全文结构。';
    }
    updateMap();
    mapButton.addEventListener('click', async () => {
      dialog.showModal();
      if (mapRendered) return;
      status.textContent = '正在生成思维导图…';
      try {
        await window.GoshareDiagrams.render(map.source, stage);
        mapRendered = true;
        status.textContent = '';
      } catch (error) {
        status.textContent = '思维导图加载失败，可查看源码，关闭后重新打开重试。';
      }
    });
    document.getElementById('article-map-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    const viewport = document.getElementById('article-map-viewport');
    let scale = 1;
    document.querySelectorAll('[data-map-zoom]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.mapZoom;
      scale = action === 'reset' ? 1 : Math.max(0.4, Math.min(3, scale + Number(action)));
      stage.style.zoom = scale;
      document.getElementById('article-map-scale').textContent = `${Math.round(scale * 100)}%`;
      if (action === 'reset') { viewport.scrollTop = 0; viewport.scrollLeft = 0; }
    }));

    const aiButton = document.getElementById('article-ai-analyze');
    const headingButton = document.getElementById('article-heading-mode');
    const aiStatus = document.getElementById('article-ai-status');
    const aiSummary = document.getElementById('article-ai-summary');
    let cachedAnalysis;
    function applyOutline(nextRoots, nextRecords, title, isAi) {
      roots = nextRoots;
      records = nextRecords;
      links.clear();
      collapsible.length = 0;
      nav.replaceChildren(list(roots));
      search.value = '';
      document.getElementById('article-outline-empty').hidden = true;
      document.getElementById('article-node-count').textContent = `${isAi ? 'AI 提炼' : '标题'} · ${records.length} 个节点`;
      panel.hidden = records.length === 0;
      toggle.disabled = panel.hidden;
      mapButton.disabled = panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      document.querySelector('.reader-layout').classList.toggle('outline-hidden', panel.hidden);
      aiSummary.hidden = !isAi;
      aiButton.setAttribute('aria-pressed', String(isAi));
      headingButton.setAttribute('aria-pressed', String(!isAi));
      active = undefined;
      scale = 1;
      stage.style.zoom = 1;
      document.getElementById('article-map-scale').textContent = '100%';
      updateMap(title, isAi);
      updatePosition();
    }
    function applyAnalysis(analysis) {
      const flattened = [];
      let sequence = 0;
      function convert(nodes, level) {
        if (!Array.isArray(nodes) || level > 4 || sequence + nodes.length > 60) throw new Error('保存的目录结构超过限制。');
        return nodes.map((node) => {
          if (typeof node?.title !== 'string' || typeof node?.summary !== 'string') throw new Error('保存的目录格式无效。');
          const element = sourceBlocks.get(node.blockId);
          if (!element) throw new Error('AI 目录引用了不存在的原文段落。');
          const entry = { id: `article-ai-node-${++sequence}`, targetId: element.id, text: node.title, summary: node.summary, level, element, children: [] };
          flattened.push(entry);
          entry.children = convert(node.children, level + 1);
          return entry;
        });
      }
      const tree = convert(analysis.nodes, 1);
      aiSummary.textContent = analysis.summary;
      headingButton.hidden = false;
      applyOutline(tree, flattened, analysis.title, true);
    }

    function requestAnalysis() {
      if (window.parent !== window && location.href === 'about:srcdoc') {
        // The sandbox has an opaque origin; the parent preserves login cookies.
        return new Promise((resolve, reject) => {
          const requestId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          function receive(event) {
            if (event.source !== parent || event.data?.type !== 'goshare:article-analysis-result' || event.data.requestId !== requestId) return;
            clearTimeout(timer);
            removeEventListener('message', receive);
            resolve(event.data.result);
          }
          const timer = setTimeout(() => {
            removeEventListener('message', receive);
            reject(new Error('AI 分析超时，请稍后重试。'));
          }, 90000);
          addEventListener('message', receive);
          parent.postMessage({ type: 'goshare:article-analysis', requestId, blocks }, '*');
        });
      }
      return fetch('/api/pages/article-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }), signal: AbortSignal.timeout(90000),
      }).then(async (response) => {
        try { return await response.json(); }
        catch { throw new Error('AI 服务暂时不可用，请稍后重试。'); }
      });
    }
    aiButton.addEventListener('click', async () => {
      if (cachedAnalysis) { applyAnalysis(cachedAnalysis); return; }
      aiButton.disabled = true;
      mapButton.disabled = true;
      aiButton.textContent = '分析中…';
      aiStatus.textContent = '正在阅读全文并提炼主题节点…';
      try {
        const result = await requestAnalysis();
        if (!result.success) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'AI 分析失败。');
        applyAnalysis(result.analysis);
        cachedAnalysis = result.analysis;
        const remaining = result.quota?.remaining;
        aiStatus.textContent = `AI 分析完成${typeof remaining === 'number' ? ` · 今日剩余 ${remaining} 次` : ''}`;
      } catch (error) {
        aiStatus.textContent = error.message || 'AI 分析失败，请重试。';
      } finally {
        aiButton.disabled = false;
        mapButton.disabled = records.length === 0;
        aiButton.textContent = cachedAnalysis ? 'AI 目录' : 'AI 分析全文';
      }
    });
    const saved = article.querySelector('pre[data-goshare-analysis="v1"]');
    if (saved) {
      saved.hidden = true;
      try { cachedAnalysis = JSON.parse(saved.textContent); applyAnalysis(cachedAnalysis); aiButton.textContent = 'AI 目录'; aiStatus.textContent = '已载入保存的 AI 分析'; }
      catch { cachedAnalysis = undefined; aiStatus.textContent = '保存的目录无效，可重新分析。'; }
    }
    const sendBlocks = () => {
      if (parent !== window && location.href === 'about:srcdoc') parent.postMessage({ type: 'goshare:article-ready', blocks }, '*');
    };
    window.addEventListener('message', event => { if (event.source === parent && event.data?.type === 'goshare:request-article-blocks') sendBlocks(); });
    sendBlocks();
    headingButton.addEventListener('click', () => applyOutline(headingRoots, headingRecords, '', false));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

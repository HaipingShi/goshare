/* Upload → choices → evidence-based generation → preview → confirmation. */
(() => {
  function create({ getPayload, applyContent, renderPreview, setConfirmed, setTheme, aiEnabled, createShareLink }) {
    const dialog = document.getElementById('article-workflow-dialog');
    if (!dialog) return;
    const review = document.getElementById('workflow-review');
    const status = document.getElementById('workflow-status');
    const next = document.getElementById('workflow-next');
    const back = document.getElementById('workflow-back');
    const title = document.getElementById('workflow-title');
    const sections = [...dialog.querySelectorAll('[data-workflow-step]')];
    const choices = [...dialog.querySelectorAll('input[name="workflow-diagram"]')];
    const yes = document.getElementById('workflow-ai-yes');
    const no = document.getElementById('workflow-ai-no');
    let step = 0, eligible = false, busy = false, operation = 0, controller;
    let base = '', type = '', cached, cachedBase = '', profile = 'balanced';

    function showStep(value) {
      step = value;
      sections.forEach(section => { section.hidden = Number(section.dataset.workflowStep) !== value; });
      title.textContent = ['文件上传成功', '是否需要 AI 分析？', '选择需要的图形', '正在准备预览', '预览确认', '是否需要重新美观优化？'][value];
      document.getElementById('workflow-step-label').textContent = `步骤 ${Math.min(value + 1, 6)} / 6`;
      back.hidden = ![1, 2].includes(value);
      next.hidden = value === 3;
      next.textContent = value === 0 ? '继续选择处理方式' : value === 1 ? '下一步：选择图形' : value === 2 ? '生成并启动预览' : '保留当前预览，完成';
      status.textContent = '';
      next.disabled = false;
      document.getElementById('workflow-optimize').hidden = !eligible;
      updateChoices();
    }
    function updateChoices() {
      yes.disabled = !eligible || !aiEnabled;
      if (yes.disabled) no.checked = true;
      choices.forEach(input => {
        input.disabled = !eligible || (input.value !== 'mindmap' && !yes.checked);
        if (input.disabled) input.checked = false;
      });
      document.getElementById('workflow-format-note').hidden = eligible;
      document.getElementById('workflow-ai-disabled').hidden = aiEnabled;
    }
    [yes, no].forEach(input => input.addEventListener('change', updateChoices));
    function selectedKinds() { return choices.filter(input => input.checked && !input.disabled).map(input => input.value); }
    function open(initialStep = 1) {
      const payload = getPayload();
      if (!payload.ok) { status.textContent = payload.error; return; }
      base = GoshareGraphs.stripArtifacts(payload.htmlContent);
      type = payload.codeType;
      eligible = ['markdown', 'docx'].includes(type);
      const saved = GoshareGraphs.readArtifacts(payload.htmlContent);
      if (saved.analysis) { cached = saved.analysis; cachedBase = base; }
      showStep(initialStep);
      if (!dialog.open) dialog.showModal();
    }
    function reviewPreview() {
      const payload = getPayload();
      if (payload.ok) {
        base = GoshareGraphs.stripArtifacts(payload.htmlContent);
        type = payload.codeType;
        eligible = ['markdown', 'docx'].includes(type);
        const saved = GoshareGraphs.readArtifacts(payload.htmlContent);
        if (saved.analysis) { cached = saved.analysis; cachedBase = base; yes.checked = true; }
        if (saved.analysis || saved.kinds.length) choices.forEach(input => { input.checked = saved.kinds.includes(input.value); });
      }
      setConfirmed(false);
      busy = false;
      review.hidden = false;
      status.textContent = '预览已就绪，请核对正文、表格、图片和图形。';
      if (dialog.open) dialog.close();
      document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    async function request(url, body, signal) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || '请求失败，请重试。');
      return result;
    }
    async function generate(optimize = false) {
      if (busy) return;
      busy = true;
      const current = ++operation;
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
      const kinds = selectedKinds();
      const payload = getPayload();
      if (!payload.ok) { busy = false; status.textContent = payload.error; return; }
      if (!base) { base = GoshareGraphs.stripArtifacts(payload.htmlContent); type = payload.codeType; }
      showStep(3);
      setConfirmed(false);
      const check = () => { if (current !== operation) throw new Error('流程已取消'); };
      try {
        let analysis;
        if (eligible && (yes.checked || kinds.length)) {
          const canReuse = cached && cachedBase === base && kinds.filter(kind => kind !== 'mindmap').every(kind => cached.diagrams?.some(graph => graph.kind === kind));
          if (canReuse && yes.checked) analysis = cached;
          else {
            status.textContent = '正在读取全文、表格和图片说明…';
            const source = await request('/api/pages/article-source', { ...payload, htmlContent: base }, signal);
            check();
            if (yes.checked) {
              status.textContent = 'AI 正在提炼主题、步骤和关系…';
              const result = await request('/api/pages/article-analysis', { blocks: source.blocks, diagramKinds: kinds }, signal);
              check();
              analysis = result.analysis;
              cached = analysis;
              cachedBase = base;
              document.getElementById('workflow-summary').textContent = result.quota?.remaining == null ? 'AI 分析完成' : `AI 分析完成 · 今日剩余 ${result.quota.remaining} / ${result.quota.limit} 次${result.budget ? ` · 全站预算剩余 ${Math.floor(result.budget.remaining)} Neurons` : ''}`;
            } else {
              analysis = source.headingAnalysis;
              if (!analysis && kinds.length) throw new Error('原文没有标题，无法生成标题导图。请选择 AI 分析，或取消图形后直接预览。');
            }
          }
        }
        check();
        const skipped = analysis?.diagrams?.filter(graph => kinds.includes(graph.kind) && graph.unavailableReason) || [];
        document.getElementById('workflow-graph-note').textContent = skipped.map(graph => `${GoshareGraphs.GRAPH_LABELS[graph.kind]}：${graph.unavailableReason}`).join('；');
        status.textContent = optimize ? '正在精简分支、增加留白并重新启动预览…' : '图形已加入正文，预览启动中…';
        applyContent(GoshareGraphs.composeArticle(base, analysis, kinds, profile), type);
        if (optimize) setTheme('clean');
        if (!(await renderPreview({ workflow: true }))) throw new Error('预览未能启动，请检查页面错误提示后重试。');
        check();
        reviewPreview();
      } catch (error) {
        if (current !== operation) return;
        showStep(2);
        status.textContent = error.name === 'TimeoutError' || error.name === 'AbortError' ? '处理已取消或超时，可重试，也可关闭 AI 后直接预览原文。' : error.message;
      } finally { if (current === operation) busy = false; }
    }
    next.addEventListener('click', () => {
      if (step === 0 && getPayload().codeType === 'zip') { dialog.close(); return; }
      if (step < 2) showStep(step + 1);
      else if (step === 2) generate();
      else { dialog.close(); setConfirmed(true); createShareLink(); }
    });
    back.addEventListener('click', () => showStep(step - 1));
    function cancel() {
      operation++; controller?.abort(); busy = false;
      if (dialog.open) dialog.close();
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    document.getElementById('workflow-close').addEventListener('click', cancel);
    document.getElementById('workflow-confirm-preview').addEventListener('click', () => { setConfirmed(true); createShareLink(); });
    document.getElementById('workflow-review-optimize').addEventListener('click', () => { profile = 'compact'; generate(true); });
    document.getElementById('workflow-edit-options').addEventListener('click', () => open(1));
    document.getElementById('workflow-optimize').addEventListener('click', () => { profile = 'compact'; generate(true); });
    document.getElementById('workflow-ai-open').addEventListener('click', () => open(1));
    document.getElementById('workflow-graphs-open').addEventListener('click', () => open(2));
    return {
      reviewPreview,
      shareComplete() { review.hidden = true; document.getElementById('workflow-summary').textContent = '预览已确认，分享链接已生成'; },
      startFile(name, codeType) {
        cancel(); cached = undefined; cachedBase = ''; base = ''; profile = 'balanced';
        yes.checked = aiEnabled;
        no.checked = !aiEnabled;
        choices.forEach(input => { input.checked = input.value === 'mindmap'; });
        document.getElementById('workflow-summary').textContent = `已上传：${name}`;
        document.getElementById('workflow-file-label').textContent = name;
        document.getElementById('workflow-upload-note').textContent = codeType === 'zip' ? '静态网站包已读取，可关闭此窗口并生成分享链接。' : '文件已读取。接下来选择分析与图形，再确认预览。';
        review.hidden = true;
        open(0);
        if (codeType === 'zip') next.textContent = '完成';
      },
      reset() { cancel(); base = ''; cached = undefined; cachedBase = ''; review.hidden = true; document.getElementById('workflow-summary').textContent = ''; },
    };
  }
  window.GoshareWorkflow = { create };
})();

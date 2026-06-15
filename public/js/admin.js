(() => {
  const state = {
    pages: [],
    selected: null,
    submissions: [],
  };

  const elements = {
    body: document.getElementById('admin-pages-body'),
    count: document.getElementById('admin-count'),
    refresh: document.getElementById('admin-refresh'),
    error: document.getElementById('admin-error'),
    form: document.getElementById('admin-edit-form'),
    selectedId: document.getElementById('admin-selected-id'),
    content: document.getElementById('admin-content'),
    codeType: document.getElementById('admin-code-type'),
    markdownTheme: document.getElementById('admin-markdown-theme'),
    protected: document.getElementById('admin-protected'),
    open: document.getElementById('admin-open'),
    copy: document.getElementById('admin-copy'),
    save: document.getElementById('admin-save'),
    delete: document.getElementById('admin-delete'),
    password: document.getElementById('admin-password'),
    submissionsBody: document.getElementById('admin-submissions-body'),
    submissionsCount: document.getElementById('admin-submissions-count'),
    submissionsRefresh: document.getElementById('admin-submissions-refresh'),
  };

  document.addEventListener('DOMContentLoaded', () => {
    elements.refresh?.addEventListener('click', loadPages);
    elements.form?.addEventListener('submit', saveSelectedPage);
    elements.delete?.addEventListener('click', deleteSelectedPage);
    elements.copy?.addEventListener('click', copySelectedLink);
    elements.submissionsRefresh?.addEventListener('click', () => {
      if (state.selected) loadSubmissions(state.selected.id);
    });
    elements.codeType?.addEventListener('change', updateMarkdownThemeControl);
    loadPages();
  });

  async function loadPages() {
    showError('');
    renderLoading();

    try {
      const response = await fetch('/api/admin/pages');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '加载列表失败');

      state.pages = data.pages || [];
      renderRows();

      if (state.selected && state.pages.some((page) => page.id === state.selected.id)) {
        await selectPage(state.selected.id);
      } else {
        clearForm();
      }
    } catch (error) {
      showError(error.message);
      renderEmpty('加载失败');
    }
  }

  function renderLoading() {
    elements.body.innerHTML = '<tr><td class="admin-loading" colspan="6">加载中...</td></tr>';
  }

  function renderEmpty(message = '还没有内容') {
    elements.count.textContent = '0 条';
    elements.body.innerHTML = `<tr><td class="admin-empty" colspan="6">${escapeHtml(message)}</td></tr>`;
  }

  function renderRows() {
    elements.count.textContent = `${state.pages.length} 条`;

    if (!state.pages.length) {
      renderEmpty();
      return;
    }

    elements.body.innerHTML = state.pages.map((page) => {
      const selectedClass = state.selected?.id === page.id ? ' selected' : '';
      const title = page.title || page.id;
      const summary = page.summary || '';
      const status = page.is_protected
        ? '<span class="admin-badge protected"><i class="fas fa-lock"></i>受保护</span>'
        : '<span class="admin-badge"><i class="fas fa-unlock"></i>公开</span>';

      return `<tr class="${selectedClass}" data-id="${escapeHtml(page.id)}">
        <td>
          <div class="admin-page-title">
            <span class="admin-page-name">${escapeHtml(title)}</span>
            ${summary ? `<span class="admin-page-summary">${escapeHtml(summary)}</span>` : ''}
            <span class="admin-id">${escapeHtml(page.id)}</span>
          </div>
        </td>
        <td>${escapeHtml(page.code_type || 'html')}</td>
        <td>${status}</td>
        <td>${formatSize(page.content_size || 0)}</td>
        <td>${formatDate(page.updated_at || page.created_at)}</td>
        <td>
          <button class="admin-button" data-action="open" data-id="${escapeHtml(page.id)}">
            <i class="fas fa-external-link-alt"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    elements.body.querySelectorAll('tr[data-id]').forEach((row) => {
      row.addEventListener('click', () => selectPage(row.dataset.id));
    });

    elements.body.querySelectorAll('button[data-action="open"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        window.open(`/share/${button.dataset.id}`, '_blank', 'noopener,noreferrer');
      });
    });
  }

  async function selectPage(id) {
    showError('');

    try {
      const response = await fetch(`/api/admin/pages/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '读取内容失败');

      state.selected = data.page;
      renderRows();
      fillForm(data.page);
      await loadSubmissions(data.page.id);
    } catch (error) {
      showError(error.message);
    }
  }

  function fillForm(page) {
    const url = `${window.location.origin}/share/${page.id}`;
    elements.selectedId.textContent = page.title || page.id;
    elements.content.value = page.htmlContent || '';
    elements.codeType.value = page.code_type || 'html';
    elements.markdownTheme.value = page.markdown_theme || 'bytedance';
    elements.protected.checked = page.is_protected === 1 || page.is_protected === true;
    elements.open.href = url;
    elements.open.setAttribute('aria-disabled', 'false');
    elements.password.textContent = page.password ? `访问密码：${page.password}` : '';

    setFormDisabled(false);
    updateMarkdownThemeControl();

    if (page.code_type === 'zip') {
      elements.content.disabled = true;
      elements.codeType.disabled = true;
      elements.markdownTheme.disabled = true;
    }
  }

  function clearForm() {
    state.selected = null;
    elements.selectedId.textContent = '未选择';
    elements.content.value = '';
    elements.codeType.value = 'html';
    elements.markdownTheme.value = 'bytedance';
    elements.protected.checked = false;
    elements.open.href = '#';
    elements.open.setAttribute('aria-disabled', 'true');
    elements.password.textContent = '';
    state.submissions = [];
    renderSubmissionsEmpty('从左侧选择一条内容', '未选择');
    setFormDisabled(true);
  }

  function setFormDisabled(disabled) {
    elements.content.disabled = disabled;
    elements.codeType.disabled = disabled;
    elements.markdownTheme.disabled = disabled || elements.codeType.value !== 'markdown';
    elements.protected.disabled = disabled;
    elements.copy.disabled = disabled;
    elements.save.disabled = disabled;
    elements.delete.disabled = disabled;
    elements.submissionsRefresh.disabled = disabled;
  }

  async function loadSubmissions(pageId) {
    if (!pageId) {
      renderSubmissionsEmpty('从左侧选择一条内容', '未选择');
      return;
    }

    renderSubmissionsLoading();

    try {
      const response = await fetch(`/api/admin/pages/${encodeURIComponent(pageId)}/submissions?limit=50`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '加载提交数据失败');

      state.submissions = data.submissions || [];
      renderSubmissions();
    } catch (error) {
      renderSubmissionsEmpty(error.message || '加载提交数据失败', '加载失败');
    }
  }

  function renderSubmissionsLoading() {
    elements.submissionsCount.textContent = '加载中';
    elements.submissionsBody.innerHTML = '<tr><td class="admin-loading" colspan="3">加载中...</td></tr>';
  }

  function renderSubmissionsEmpty(message, countText = '0 条') {
    elements.submissionsCount.textContent = countText;
    elements.submissionsBody.innerHTML = `<tr><td class="admin-empty" colspan="3">${escapeHtml(message)}</td></tr>`;
  }

  function renderSubmissions() {
    elements.submissionsCount.textContent = `${state.submissions.length} 条`;

    if (!state.submissions.length) {
      renderSubmissionsEmpty('还没有提交数据');
      return;
    }

    elements.submissionsBody.innerHTML = state.submissions.map((submission) => {
      const payloadText = formatPayload(submission.payload);
      return `<tr>
        <td>${formatDate(submission.createdAt)}</td>
        <td>${escapeHtml(submission.kind || 'submission')}</td>
        <td><pre class="admin-submission-payload">${escapeHtml(payloadText)}</pre></td>
      </tr>`;
    }).join('');
  }

  async function saveSelectedPage(event) {
    event.preventDefault();
    if (!state.selected) return;

    const htmlContent = elements.content.value.trim();
    if (!htmlContent) {
      showError('内容不能为空');
      return;
    }

    elements.save.disabled = true;

    try {
      const response = await fetch(`/api/admin/pages/${encodeURIComponent(state.selected.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          codeType: elements.codeType.value,
          markdownTheme: elements.markdownTheme.value,
          isProtected: elements.protected.checked,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存失败');

      await loadPages();
      await selectPage(state.selected.id);
    } catch (error) {
      showError(error.message);
    } finally {
      if (state.selected) elements.save.disabled = false;
    }
  }

  async function deleteSelectedPage() {
    if (!state.selected) return;
    const confirmed = window.confirm(`确定删除 ${state.selected.id} 吗？删除后分享链接将不可访问。`);
    if (!confirmed) return;

    elements.delete.disabled = true;

    try {
      const response = await fetch(`/api/admin/pages/${encodeURIComponent(state.selected.id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '删除失败');

      state.selected = null;
      await loadPages();
    } catch (error) {
      showError(error.message);
    } finally {
      if (state.selected) elements.delete.disabled = false;
    }
  }

  async function copySelectedLink() {
    if (!state.selected) return;
    const url = `${window.location.origin}/share/${state.selected.id}`;
    try {
      await navigator.clipboard.writeText(url);
      elements.password.textContent = '链接已复制';
      setTimeout(() => {
        if (state.selected?.password) {
          elements.password.textContent = `访问密码：${state.selected.password}`;
        }
      }, 1400);
    } catch {
      showError('复制失败');
    }
  }

  function showError(message) {
    if (!message) {
      elements.error.textContent = '';
      elements.error.classList.remove('show');
      return;
    }

    elements.error.textContent = message;
    elements.error.classList.add('show');
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB'];
    let size = Number(bytes);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatPayload(payload) {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload || '');
    }
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateMarkdownThemeControl() {
    if (!elements.markdownTheme || !elements.codeType) return;
    elements.markdownTheme.disabled = elements.codeType.disabled || elements.codeType.value !== 'markdown';
  }
})();

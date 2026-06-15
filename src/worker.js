import * as fflate from 'fflate';
import {
  renderErrorPage,
  renderAdminPage,
  renderIndexPage,
  renderLoginPage,
  renderPasswordPage,
  renderBootstrapPage,
} from './templates.js';
import {
  CODE_TYPES,
  detectCodeType,
  normalizeContentForRendering,
  normalizeMarkdownTheme,
  renderContent,
} from './renderers.js';

const DEFAULT_COOKIE_PREFIX = 'quickshare';
const AUTH_TTL_SECONDS = 24 * 60 * 60;
const OWNER_TTL_SECONDS = 60 * 60 * 24 * 365 * 2;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
const MAX_PREVIEW_CONTENT_LENGTH = 512 * 1024;
const DEFAULT_MAX_BEAUTIFY_CONTENT_LENGTH = 120 * 1024;
const MAX_SUBMISSION_PAYLOAD_LENGTH = 64 * 1024;
const MAX_SUBMISSION_KIND_LENGTH = 40;
const DEFAULT_BEAUTIFY_MODEL = '@cf/zai-org/glm-4.7-flash';
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_CODE_TYPES = new Set([
  CODE_TYPES.HTML,
  CODE_TYPES.MARKDOWN,
  CODE_TYPES.SVG,
  CODE_TYPES.MERMAID,
  CODE_TYPES.ZIP,
]);

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error('Worker error:', error);
      return htmlResponse(renderErrorPage({
        title: '服务器错误',
        message: '处理请求时发生错误，请稍后再试',
      }, env), 500);
    }
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (pathname === '/' && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) {
      return redirect('/login');
    }
    return htmlResponse(renderIndexPage(env));
  }

  if (pathname === '/bootstrap' && request.method === 'GET') {
    return htmlResponse(renderBootstrapPage(env));
  }

  if (pathname === '/admin' && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) {
      return redirect('/login');
    }
    const owner = await getOwnerContext(request, env);
    return htmlResponse(renderAdminPage(env), 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
  }

  if (pathname === '/login' && request.method === 'GET') {
    if (!isAuthEnabled(env) || (await isAuthenticated(request, env))) {
      return redirect('/');
    }
    return htmlResponse(renderLoginPage({}, env));
  }

  if (pathname === '/login' && request.method === 'POST') {
    return handleLogin(request, env);
  }

  if (pathname === '/logout' && request.method === 'GET') {
    return redirect('/login', {
      'Set-Cookie': clearAuthCookie(env),
    });
  }

  if (pathname === '/api/pages/create' && request.method === 'POST') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return createPage(request, env);
  }

  if (pathname === '/api/pages/preview' && request.method === 'POST') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return previewPage(request, env);
  }

  if (pathname === '/api/pages/beautify' && request.method === 'POST') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return beautifyPage(request, env);
  }

  if (pathname === '/api/pages/list/recent' && request.method === 'GET') {
    return listRecentPages(request, env);
  }

  if (pathname === '/api/admin/pages' && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return listOwnedPages(request, env);
  }

  const adminSubmissionsMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)\/submissions$/);
  if (adminSubmissionsMatch && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return listOwnedPageSubmissions(request, env, adminSubmissionsMatch[1]);
  }

  const adminPageMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)$/);
  if (adminPageMatch && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return getOwnedPage(request, env, adminPageMatch[1]);
  }

  if (adminPageMatch && request.method === 'PUT') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return updateOwnedPage(request, env, adminPageMatch[1]);
  }

  if (adminPageMatch && request.method === 'DELETE') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return deleteOwnedPage(request, env, adminPageMatch[1]);
  }

  const protectMatch = pathname.match(/^\/api\/pages\/([^/]+)\/protect$/);
  if (protectMatch && request.method === 'POST') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return updateProtection(request, env, protectMatch[1]);
  }

  const submissionsMatch = pathname.match(/^\/api\/pages\/([^/]+)\/submissions$/);
  if (submissionsMatch && request.method === 'POST') {
    return createPageSubmission(request, env, submissionsMatch[1]);
  }

  const apiPageMatch = pathname.match(/^\/api\/pages\/([^/]+)$/);
  if (apiPageMatch && request.method === 'GET') {
    return getPageInfo(env, apiPageMatch[1]);
  }

  const validateMatch = pathname.match(/^\/validate-password\/([^/]+)$/);
  if (validateMatch && request.method === 'GET') {
    return validatePassword(env, validateMatch[1], url.searchParams.get('password'));
  }

  const viewMatch = pathname.match(/^\/view\/([^/]+)(?:\/(.*))?$/);
  if (viewMatch && request.method === 'GET') {
    const id = viewMatch[1];
    const subpath = viewMatch[2] || '';
    return viewPage(request, env, id, subpath);
  }

  if (env.ASSETS) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
  }

  return htmlResponse(renderErrorPage({
    title: '页面未找到',
    message: '您请求的页面不存在',
  }, env), 404);
}

async function handleLogin(request, env) {
  if (!isAuthEnabled(env)) return redirect('/');

  const formData = await request.formData();
  const password = String(formData.get('password') || '');
  const expectedPassword = getAuthPassword(env);

  if (!expectedPassword) {
    return htmlResponse(renderLoginPage({ error: '当前环境未设置 AUTH_PASSWORD。' }, env), 500);
  }

  if (password === expectedPassword) {
    return redirect('/', {
      'Set-Cookie': await createAuthCookie(request, env),
    });
  }

  return htmlResponse(renderLoginPage({ error: '密码错误，请重试' }, env), 401);
}

async function createPage(request, env) {
  assertBindings(env);
  const owner = await getOwnerContext(request, env);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: '请求格式错误' }, 400);
  }

  const htmlContent = String(payload.htmlContent || '').trim();
  const zipContent = String(payload.zipContent || '').trim();
  const isProtected = Boolean(payload.isProtected);
  const requestedCodeType = String(payload.codeType || '');

  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));
  const markdownTheme = codeType === CODE_TYPES.MARKDOWN
    ? normalizeMarkdownTheme(payload.markdownTheme)
    : normalizeMarkdownTheme();

  if (codeType === 'zip') {
    if (!zipContent) {
      return jsonResponse({ success: false, error: '请提供ZIP内容' }, 400);
    }
    if (zipContent.length > MAX_CONTENT_LENGTH) {
      return jsonResponse({ success: false, error: '内容过大，请控制在10MB以内' }, 413);
    }
  } else {
    if (!htmlContent) {
      return jsonResponse({ success: false, error: '请提供HTML内容' }, 400);
    }
    if (htmlContent.length > MAX_CONTENT_LENGTH) {
      return jsonResponse({ success: false, error: '内容过大，请控制在10MB以内' }, 413);
    }
  }

  const password = generateRandomPassword();
  const createdAt = Date.now();
  const updatedAt = createdAt;

  let contentHash;
  let contentSize;
  let zipBytes = null;
  let files = null;

  if (codeType === 'zip') {
    zipBytes = safeBase64UrlDecodeToBytes(zipContent);
    if (!zipBytes) {
      return jsonResponse({ success: false, error: 'ZIP内容格式错误' }, 400);
    }
    contentSize = zipBytes.byteLength;
    contentHash = await sha256Hex(zipContent);

    try {
      files = fflate.unzipSync(zipBytes);
    } catch (err) {
      console.error('解压失败:', err);
      return jsonResponse({ success: false, error: '解压 ZIP 文件失败，请确保压缩文件未损坏' }, 400);
    }

    // ZIP 结构校验
    const fileKeys = Object.keys(files);
    const hasIndexHtmlAtRoot = fileKeys.includes('index.html');
    const hasPackageJson = fileKeys.some(f => f === 'package.json' || f.endsWith('/package.json'));
    const anyIndexHtml = fileKeys.find(f => f === 'index.html' || f.endsWith('/index.html'));

    const hasSourceIndicators = fileKeys.some(f => f.startsWith('src/') || f === 'tsconfig.json' || f === 'vite.config.ts' || f === 'webpack.config.js');
    if (hasPackageJson && hasSourceIndicators) {
      return jsonResponse({
        success: false,
        error: '检测到上传的是前端项目源码包而非编译后的产物。请先在本地运行 `npm run build`，然后将生成的 `dist` 目录内的所有文件压缩后上传。'
      }, 400);
    }

    if (!hasIndexHtmlAtRoot) {
      if (hasPackageJson && !anyIndexHtml) {
        return jsonResponse({
          success: false,
          error: '检测到上传的是前端源码包而非编译产物。请先在本地运行 `npm run build`，然后选择生成的 `dist` 目录内的所有文件进行压缩上传。'
        }, 400);
      }
      
      if (anyIndexHtml) {
        const folderName = anyIndexHtml.split('/')[0];
        return jsonResponse({
          success: false,
          error: `入口文件 index.html 未处于压缩包最外层（当前位于 \`${folderName}/index.html\`）。请直接对 \`${folderName}\` 目录内的所有文件进行压缩，确保 index.html 处于压缩包根目录。`
        }, 400);
      }

      return jsonResponse({
        success: false,
        error: 'ZIP 压缩包内未找到 `index.html` 入口文件，静态网页需要以 index.html 作为首页入口。'
      }, 400);
    }
  } else {
    contentHash = await sha256Hex(htmlContent);
    const encoder = new TextEncoder();
    contentSize = encoder.encode(htmlContent).byteLength;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const urlId = await generatePageId(codeType === 'zip' ? zipContent : htmlContent, attempt);
    const r2Key = codeType === 'zip' ? `pages/${urlId}/index.html` : `pages/${urlId}.txt`;

    try {
      if (codeType === 'zip') {
        // Upload each file to R2
        for (const [filename, fileData] of Object.entries(files)) {
          if (filename.endsWith('/') || fileData.length === 0) continue; // skip directories
          const fileKey = `pages/${urlId}/${filename}`;
          const contentType = getContentType(filename);
          await env.CONTENT_BUCKET.put(fileKey, fileData, {
            httpMetadata: { contentType },
            customMetadata: {
              pageId: urlId,
              filename,
            },
          });
        }
      } else {
        await env.CONTENT_BUCKET.put(r2Key, htmlContent, {
          httpMetadata: { contentType: 'text/plain; charset=utf-8' },
          customMetadata: {
            pageId: urlId,
            codeType,
          },
        });
      }

      await env.DB.prepare(`
        INSERT INTO pages (id, r2_key, created_at, updated_at, owner_key, password, is_protected, code_type, markdown_theme, content_size, content_sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(urlId, r2Key, createdAt, updatedAt, owner.ownerKey, password, isProtected ? 1 : 0, codeType, markdownTheme, contentSize, contentHash)
        .run();

      return jsonResponse({
        success: true,
        urlId,
        password,
        isProtected,
      }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
    } catch (error) {
      console.error('创建页面错误:', error);
      if (attempt === 4) {
        return jsonResponse({ success: false, error: '创建页面失败' }, 500);
      }
    }
  }

  return jsonResponse({ success: false, error: '创建页面失败' }, 500);
}

async function previewPage(request, env) {
  assertBindings(env);

  const payload = await readJsonPayload(request);
  if (!payload.ok) return payload.response;

  const input = parseTextContentPayload(payload.data);
  if (!input.ok) return input.response;

  if (input.content.length > MAX_PREVIEW_CONTENT_LENGTH) {
    return jsonResponse({ success: false, error: '预览内容过大，请控制在512KB以内' }, 413);
  }

  if (input.codeType === CODE_TYPES.ZIP) {
    return jsonResponse({ success: false, error: 'ZIP 静态网站暂不支持内嵌预览，请直接生成链接后打开查看。' }, 400);
  }

  const normalized = normalizeContentForRendering(input.content, input.codeType);
  const renderedContent = await renderContent(normalized.content, normalized.contentType, {
    markdownTheme: input.markdownTheme,
  });
  const html = injectCodeTypeMeta(renderedContent, normalized.contentType || input.codeType);

  return jsonResponse({
    success: true,
    codeType: normalized.contentType || input.codeType,
    markdownTheme: input.markdownTheme,
    html,
  });
}

async function beautifyPage(request, env) {
  assertBindings(env);
  if (String(env.AI_ENABLED || 'true').toLowerCase() === 'false') {
    return jsonResponse({ success: false, error: '当前环境未启用智能美化。' }, 403);
  }
  if (!env.AI) {
    return jsonResponse({ success: false, error: '当前环境未配置 Cloudflare Workers AI binding。' }, 501);
  }

  const payload = await readJsonPayload(request);
  if (!payload.ok) return payload.response;

  const input = parseTextContentPayload(payload.data);
  if (!input.ok) return input.response;

  if (input.codeType === CODE_TYPES.ZIP) {
    return jsonResponse({ success: false, error: 'ZIP 静态网站暂不支持智能美化。' }, 400);
  }

  const maxBeautifyContentLength = getMaxBeautifyContentLength(env);
  if (input.content.length > maxBeautifyContentLength) {
    return jsonResponse({ success: false, error: `智能美化内容过大，请控制在${Math.floor(maxBeautifyContentLength / 1024)}KB以内。` }, 413);
  }

  const model = String(env.AI_BEAUTIFY_MODEL || DEFAULT_BEAUTIFY_MODEL);
  const prompt = buildBeautifyPrompt(input.content, input.codeType);

  let aiResult;
  try {
    aiResult = await env.AI.run(model, {
      messages: [
        {
          role: 'system',
          content: 'You are a senior frontend designer. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.35,
      max_completion_tokens: 4096,
    });
  } catch (error) {
    console.error('AI beautify failed:', error);
    return jsonResponse({ success: false, error: '智能美化调用失败，请稍后重试。' }, 502);
  }

  const parsed = parseBeautifyResult(aiResult);
  if (!parsed.ok) {
    return jsonResponse({ success: false, error: parsed.error }, 502);
  }

  const normalizedCodeType = normalizeDetectedCodeType(parsed.value.codeType || CODE_TYPES.HTML);
  const beautifiedContent = String(parsed.value.content || '').trim();
  if (!beautifiedContent) {
    return jsonResponse({ success: false, error: '智能美化未返回可用内容。' }, 502);
  }

  if (beautifiedContent.length > MAX_CONTENT_LENGTH) {
    return jsonResponse({ success: false, error: '智能美化结果过大，无法保存。' }, 413);
  }

  return jsonResponse({
    success: true,
    codeType: normalizedCodeType,
    htmlContent: beautifiedContent,
    warnings: Array.isArray(parsed.value.warnings) ? parsed.value.warnings.slice(0, 5) : [],
  });
}

async function listRecentPages(request, env) {
  assertBindings(env);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '10', 10), 1), 50);

  const result = await env.DB.prepare(`
    SELECT id, created_at
    FROM pages
    ORDER BY created_at DESC
    LIMIT ?
  `)
    .bind(limit)
    .all();

  return jsonResponse({
    success: true,
    pages: result.results || [],
  });
}

async function updateProtection(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }
  const owner = await getOwnerContext(request, env);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: '请求格式错误' }, 400);
  }

  const page = await getOwnedPageRecord(env, id, owner.ownerKey);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  await env.DB.prepare('UPDATE pages SET is_protected = ?, updated_at = ? WHERE id = ? AND owner_key = ?')
    .bind(payload.isProtected ? 1 : 0, Date.now(), id, owner.ownerKey)
    .run();

  return jsonResponse({
    success: true,
    message: '保护状态更新成功',
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function listOwnedPages(request, env) {
  assertBindings(env);
  const owner = await getOwnerContext(request, env);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '100', 10), 1), 200);

  const result = await env.DB.prepare(`
    SELECT id, created_at, COALESCE(updated_at, created_at) AS updated_at, is_protected, code_type, content_size
    FROM pages
    WHERE owner_key = ?
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT ?
  `)
    .bind(owner.ownerKey, limit)
    .all();

  return jsonResponse({
    success: true,
    pages: result.results || [],
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function getOwnedPage(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const owner = await getOwnerContext(request, env);
  const page = await getOwnedPageRecord(env, id, owner.ownerKey);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  let htmlContent = '';
  if (page.code_type === 'zip') {
    htmlContent = 'ZIP 格式内容暂不支持在线编辑。';
  } else {
    const object = await env.CONTENT_BUCKET.get(page.r2_key);
    if (!object) {
      return jsonResponse({ success: false, error: '内容对象不存在' }, 500);
    }
    htmlContent = await object.text();
  }

  return jsonResponse({
    success: true,
    page: {
      ...page,
      htmlContent,
    },
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function listOwnedPageSubmissions(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const owner = await getOwnerContext(request, env);
  const page = await getOwnedPageRecord(env, id, owner.ownerKey);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
  const result = await env.DB.prepare(`
    SELECT id, page_id, created_at, kind, payload_json
    FROM page_submissions
    WHERE page_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `)
    .bind(id, limit)
    .all();

  return jsonResponse({
    success: true,
    submissions: (result.results || []).map((submission) => ({
      id: submission.id,
      pageId: submission.page_id,
      createdAt: submission.created_at,
      kind: submission.kind,
      payload: parseStoredJson(submission.payload_json),
    })),
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function updateOwnedPage(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const owner = await getOwnerContext(request, env);
  const page = await getOwnedPageRecord(env, id, owner.ownerKey);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: '请求格式错误' }, 400);
  }

  if (page.code_type === 'zip') {
    // For ZIP, only allow updating protection state
    await env.DB.prepare(`
      UPDATE pages
      SET updated_at = ?, is_protected = ?
      WHERE id = ? AND owner_key = ?
    `)
      .bind(Date.now(), payload.isProtected ? 1 : 0, id, owner.ownerKey)
      .run();

    return jsonResponse({
      success: true,
      message: '保存成功 (仅更新保护状态)',
    }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
  }

  const htmlContent = String(payload.htmlContent || '').trim();
  const requestedCodeType = String(payload.codeType || '');
  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));
  const markdownTheme = codeType === CODE_TYPES.MARKDOWN
    ? normalizeMarkdownTheme(payload.markdownTheme)
    : normalizeMarkdownTheme();

  if (!htmlContent) {
    return jsonResponse({ success: false, error: '内容不能为空' }, 400);
  }

  if (htmlContent.length > MAX_CONTENT_LENGTH) {
    return jsonResponse({ success: false, error: '内容过大，请控制在10MB以内' }, 413);
  }

  const encoder = new TextEncoder();
  const contentSize = encoder.encode(htmlContent).byteLength;
  const contentHash = await sha256Hex(htmlContent);
  const updatedAt = Date.now();

  await env.CONTENT_BUCKET.put(page.r2_key, htmlContent, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: {
      pageId: id,
      codeType,
    },
  });

  await env.DB.prepare(`
    UPDATE pages
    SET updated_at = ?, is_protected = ?, code_type = ?, markdown_theme = ?, content_size = ?, content_sha256 = ?
    WHERE id = ? AND owner_key = ?
  `)
    .bind(updatedAt, payload.isProtected ? 1 : 0, codeType, markdownTheme, contentSize, contentHash, id, owner.ownerKey)
    .run();

  return jsonResponse({
    success: true,
    message: '保存成功',
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function deleteOwnedPage(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const owner = await getOwnerContext(request, env);
  const page = await getOwnedPageRecord(env, id, owner.ownerKey);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  if (page.code_type === 'zip') {
    // List all files with prefix pages/{id}/ and delete them
    const listed = await env.CONTENT_BUCKET.list({ prefix: `pages/${id}/` });
    if (listed.objects && listed.objects.length > 0) {
      for (const obj of listed.objects) {
        await env.CONTENT_BUCKET.delete(obj.key);
      }
    }
  } else {
    await env.CONTENT_BUCKET.delete(page.r2_key);
  }

  await env.DB.prepare('DELETE FROM page_submissions WHERE page_id = ?')
    .bind(id)
    .run();

  await env.DB.prepare('DELETE FROM pages WHERE id = ? AND owner_key = ?')
    .bind(id, owner.ownerKey)
    .run();

  return jsonResponse({
    success: true,
    message: '删除成功',
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function createPageSubmission(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const page = await getPageRecord(env, id);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  if (page.code_type === CODE_TYPES.ZIP) {
    return jsonResponse({ success: false, error: 'ZIP 静态网站暂不支持内置数据提交。' }, 400);
  }

  if (!(await canSubmitToPage(request, env, page))) {
    return jsonResponse({ success: false, error: '此页面需要先通过访问密码验证。' }, 403);
  }

  const payload = await readJsonPayload(request);
  if (!payload.ok) return payload.response;

  const parsed = parseSubmissionPayload(payload.data);
  if (!parsed.ok) return parsed.response;

  const createdAt = Date.now();
  const submissionId = await generateSubmissionId(id, createdAt);
  const submitterKey = await getSubmitterKey(request, env);
  const userAgent = String(request.headers.get('User-Agent') || '').slice(0, 200);

  await env.DB.prepare(`
    INSERT INTO page_submissions (id, page_id, created_at, kind, payload_json, submitter_key, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(submissionId, id, createdAt, parsed.kind, parsed.payloadJson, submitterKey, userAgent)
    .run();

  return jsonResponse({
    success: true,
    submission: {
      id: submissionId,
      pageId: id,
      createdAt,
      kind: parsed.kind,
    },
  }, 201);
}

async function getPageInfo(env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  const page = await getPageRecord(env, id);
  if (!page) {
    return jsonResponse({ success: false, error: '页面不存在' }, 404);
  }

  return jsonResponse({
    success: true,
    page: {
      id: page.id,
      createdAt: page.created_at,
      codeType: page.code_type,
      markdownTheme: page.markdown_theme,
      size: page.content_size,
    },
  });
}

async function validatePassword(env, id, password) {
  assertBindings(env);
  if (!isValidId(id) || !password) {
    return jsonResponse({ valid: false });
  }

  const page = await getPageRecord(env, id);
  if (!page) {
    return jsonResponse({ valid: false });
  }

  return jsonResponse({
    valid: page.is_protected === 1 && password === page.password,
  });
}

async function viewPage(request, env, id, subpath = '') {
  assertBindings(env);
  if (!isValidId(id)) {
    return htmlResponse(renderErrorPage({
      title: '页面未找到',
      message: '您请求的页面不存在或已被删除',
    }, env), 404);
  }

  const url = new URL(request.url);
  const page = await getPageRecord(env, id);

  if (!page) {
    return htmlResponse(renderErrorPage({
      title: '页面未找到',
      message: '您请求的页面不存在或已被删除',
    }, env), 404);
  }

  let passwordValidated = false;
  if (page.is_protected === 1) {
    const passwordFromUrl = url.searchParams.get('password');
    const passwordFromCookie = getCookie(request, getPagePasswordCookieName(env, id));
    const password = passwordFromUrl || passwordFromCookie;

    if (!password || password !== page.password) {
      return htmlResponse(renderPasswordPage({
        id,
        error: passwordFromUrl ? '密码错误，请重试' : null,
      }, env), passwordFromUrl ? 401 : 200);
    }

    if (passwordFromUrl === page.password) {
      passwordValidated = true;
    }
  }

  let response;
  if (page.code_type === 'zip') {
    // If request path does not end with slash and subpath is empty, redirect to /view/{id}/
    const hasTrailingSlash = url.pathname.endsWith('/');
    if (!hasTrailingSlash && !subpath) {
      const redirectUrl = new URL(url.href);
      redirectUrl.pathname = redirectUrl.pathname + '/';
      return redirect(redirectUrl.toString());
    }

    const fileSubpath = subpath ? decodeURIComponent(subpath) : 'index.html';
    const fileKey = `pages/${id}/${fileSubpath}`;
    const object = await env.CONTENT_BUCKET.get(fileKey);
    if (!object) {
      return htmlResponse(renderErrorPage({
        title: '文件未找到',
        message: `您请求的文件 ${fileSubpath} 不存在`,
      }, env), 404);
    }

    const fileData = await object.arrayBuffer();
    const contentType = getContentType(fileSubpath);
    
    response = new Response(fileData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } else {
    const object = await env.CONTENT_BUCKET.get(page.r2_key);
    if (!object) {
      return htmlResponse(renderErrorPage({
        title: '内容未找到',
        message: '页面元数据存在，但 R2 中的内容对象不存在',
      }, env), 500);
    }

    const rawContent = await object.text();
    const normalized = normalizeContentForRendering(rawContent, page.code_type);
    const renderedContent = await renderContent(normalized.content, normalized.contentType, {
      markdownTheme: page.markdown_theme,
    });
    const contentWithTypeInfo = injectGoshareDataSdk(
      injectCodeTypeMeta(renderedContent, normalized.contentType || page.code_type),
      page.id,
    );

    response = htmlResponse(contentWithTypeInfo);
  }

  if (passwordValidated) {
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    response.headers.append(
      'Set-Cookie',
      `${getPagePasswordCookieName(env, id)}=${page.password}; Max-Age=86400; Path=/view/${id}/; HttpOnly; SameSite=Lax${secure}`
    );
  }

  return response;
}

async function getPageRecord(env, id) {
  return env.DB.prepare(`
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, COALESCE(markdown_theme, 'bytedance') AS markdown_theme, content_size, content_sha256
    FROM pages
    WHERE id = ?
  `)
    .bind(id)
    .first();
}

async function getOwnedPageRecord(env, id, ownerKey) {
  return env.DB.prepare(`
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, COALESCE(markdown_theme, 'bytedance') AS markdown_theme, content_size, content_sha256
    FROM pages
    WHERE id = ? AND owner_key = ?
  `)
    .bind(id, ownerKey)
    .first();
}

async function readJsonPayload(request) {
  try {
    return {
      ok: true,
      data: await request.json(),
    };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '请求格式错误' }, 400),
    };
  }
}

function parseTextContentPayload(payload) {
  const htmlContent = String(payload.htmlContent || '').trim();
  const requestedCodeType = String(payload.codeType || '');
  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));

  if (!htmlContent) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '请提供可预览的内容' }, 400),
    };
  }

  return {
    ok: true,
    content: htmlContent,
    codeType,
    markdownTheme: normalizeMarkdownTheme(payload.markdownTheme),
  };
}

function parseSubmissionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '提交数据必须是 JSON 对象' }, 400),
    };
  }

  const kind = normalizeSubmissionKind(payload.kind);
  const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '提交内容必须是对象或数组' }, 400),
    };
  }

  let payloadJson;
  try {
    payloadJson = JSON.stringify(data);
  } catch {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '提交内容无法序列化' }, 400),
    };
  }

  if (!payloadJson || payloadJson.length > MAX_SUBMISSION_PAYLOAD_LENGTH) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: '提交内容过大，请控制在64KB以内' }, 413),
    };
  }

  return {
    ok: true,
    kind,
    payloadJson,
  };
}

function normalizeSubmissionKind(value) {
  const kind = String(value || 'submission')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_SUBMISSION_KIND_LENGTH);
  return kind || 'submission';
}

function parseStoredJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildBeautifyPrompt(content, codeType) {
  return `You are a senior frontend designer improving a one-off share page.

Return ONLY valid JSON with this shape:
{"codeType":"html","content":"<complete standalone HTML document>","warnings":[]}

Rules:
- Preserve the user's factual content and meaning.
- Do not invent customers, prices, rankings, credentials, sources, or business claims.
- Produce a complete standalone HTML document with inline CSS.
- Do not include external scripts, remote fonts, analytics, tracking pixels, forms that submit externally, or network fetch calls.
- Keep JavaScript out unless absolutely required for a static diagram interaction.
- Use a clean, polished, readable visual style suitable for sharing AI-generated content.
- Make it responsive for mobile and desktop.
- For Mermaid input, render the diagram as readable code plus a polished visual container; do not require external Mermaid runtime.
- For SVG input, preserve the SVG and frame it cleanly.
- Avoid markdown fences around the JSON.

Input type: ${codeType}
Input content:
${content}`;
}

function parseBeautifyResult(aiResult) {
  const rawText = extractAiText(aiResult).trim();
  if (!rawText) {
    return { ok: false, error: '智能美化未返回内容。' };
  }

  const jsonText = stripMarkdownFence(rawText);
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: '智能美化返回格式无效。' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    console.error('AI beautify JSON parse failed:', error, rawText.slice(0, 500));
    return { ok: false, error: '智能美化返回格式无法解析。' };
  }
}

function extractAiText(aiResult) {
  if (typeof aiResult === 'string') return aiResult;
  if (!aiResult || typeof aiResult !== 'object') return '';
  if (typeof aiResult.response === 'object' && aiResult.response !== null) {
    return JSON.stringify(aiResult.response);
  }
  if (typeof aiResult.response === 'string') return aiResult.response;
  if (typeof aiResult.result === 'string') return aiResult.result;
  if (typeof aiResult.text === 'string') return aiResult.text;
  if (typeof aiResult.output_text === 'string') return aiResult.output_text;
  if (Array.isArray(aiResult.choices)) {
    return aiResult.choices.map((choice) => {
      if (typeof choice?.message?.content === 'string') return choice.message.content;
      if (Array.isArray(choice?.message?.content)) {
        return choice.message.content.map((part) => String(part?.text || part || '')).join('');
      }
      if (typeof choice?.text === 'string') return choice.text;
      if (typeof choice?.delta?.content === 'string') return choice.delta.content;
      return '';
    }).join('');
  }
  if (Array.isArray(aiResult.output)) {
    return aiResult.output.map((item) => {
      if (typeof item?.content === 'string') return item.content;
      if (Array.isArray(item?.content)) {
        return item.content.map((part) => String(part?.text || part?.content || part || '')).join('');
      }
      return '';
    }).join('');
  }
  if (Array.isArray(aiResult.response)) {
    return aiResult.response.map((part) => String(part?.text || part || '')).join('');
  }
  console.error('AI beautify returned no text fields:', Object.keys(aiResult));
  return '';
}

function stripMarkdownFence(value) {
  const trimmed = String(value || '').trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function assertBindings(env) {
  if (!env.DB) throw new Error('Missing D1 binding: DB');
  if (!env.CONTENT_BUCKET) throw new Error('Missing R2 binding: CONTENT_BUCKET');
}

function normalizeDetectedCodeType(codeType) {
  return VALID_CODE_TYPES.has(codeType) ? codeType : CODE_TYPES.HTML;
}

function isValidId(id) {
  return VALID_ID_PATTERN.test(id);
}

function generateRandomPassword() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join('');
}

async function generatePageId(content, attempt) {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hash = await sha256Hex(`${content}:${Date.now()}:${attempt}:${randomHex}`);
  return hash.slice(0, 7);
}

async function generateSubmissionId(pageId, createdAt) {
  const randomToken = generateRandomToken(12);
  const hash = await sha256Hex(`${pageId}:${createdAt}:${randomToken}`);
  return `sub_${hash.slice(0, 18)}`;
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function injectCodeTypeMeta(html, contentType) {
  const meta = `<meta name="code-type" content="${contentType}">`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${meta}\n</head>`);
  }
  return html;
}

function injectGoshareDataSdk(html, pageId) {
  const script = `<script>
(function() {
  const pageId = ${JSON.stringify(pageId)};
  async function submit(data, options) {
    const kind = options && options.kind ? String(options.kind) : 'submission';
    const response = await fetch('/api/pages/' + encodeURIComponent(pageId) + '/submissions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, data })
    });
    const result = await response.json().catch(() => ({ success: false, error: '提交失败' }));
    if (!response.ok || !result.success) {
      throw new Error(result.error || '提交失败');
    }
    return result.submission;
  }

  window.goshare = Object.assign({}, window.goshare, { pageId, submit });

  document.addEventListener('submit', async function(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-goshare-submit]')) return;
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const statusTarget = form.querySelector('[data-goshare-status]');
    const originalButtonText = submitButton ? submitButton.textContent : '';
    if (submitButton) submitButton.disabled = true;
    if (statusTarget) statusTarget.textContent = '提交中...';

    try {
      const formData = new FormData(form);
      const data = {};
      for (const [key, value] of formData.entries()) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          data[key] = Array.isArray(data[key]) ? data[key].concat(value) : [data[key], value];
        } else {
          data[key] = value;
        }
      }
      await submit(data, { kind: form.getAttribute('data-goshare-kind') || 'form' });
      if (statusTarget) statusTarget.textContent = '已提交';
      form.reset();
    } catch (error) {
      if (statusTarget) statusTarget.textContent = error.message || '提交失败';
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
})();
</script>`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${script}\n</body>`);
  }
  return `${html}\n${script}`;
}

function isAuthEnabled(env) {
  return String(env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
}

function getAuthPassword(env) {
  return String(env.AUTH_PASSWORD || '');
}

function getMaxBeautifyContentLength(env) {
  const parsedKb = Number.parseInt(String(env.MAX_BEAUTIFY_CONTENT_KB || ''), 10);
  if (!Number.isFinite(parsedKb) || parsedKb <= 0) return DEFAULT_MAX_BEAUTIFY_CONTENT_LENGTH;
  return Math.min(parsedKb, 512) * 1024;
}

async function canSubmitToPage(request, env, page) {
  if (page.is_protected !== 1) return true;

  const url = new URL(request.url);
  const passwordFromQuery = url.searchParams.get('password');
  const passwordFromCookie = getCookie(request, getPagePasswordCookieName(env, page.id));
  const password = passwordFromQuery || passwordFromCookie;
  return Boolean(password && password === page.password);
}

async function getSubmitterKey(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptLanguage = request.headers.get('Accept-Language') || '';
  return sha256Hex(`${getCookiePrefix(env)}:${ip}:${userAgent}:${acceptLanguage}`);
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const pairs = cookie.split(';').map((part) => part.trim()).filter(Boolean);

  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (key === name) return value;
  }

  return null;
}

async function isAuthenticated(request, env) {
  if (!isAuthEnabled(env)) return true;

  const cookie = getCookie(request, getAuthCookieName(env));
  if (!cookie) return false;

  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = await sign(payload, env);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  const decodedPayload = safeBase64UrlDecode(payload);
  if (!decodedPayload) return false;

  const [, issuedAtRaw] = decodedPayload.split(':');
  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt)) return false;

  return Date.now() - issuedAt < AUTH_TTL_SECONDS * 1000;
}

async function getOwnerContext(request, env) {
  let ownerToken = getCookie(request, getOwnerCookieName(env));
  let cookieHeader = null;

  if (!ownerToken || !/^[a-zA-Z0-9_-]{32,160}$/.test(ownerToken)) {
    ownerToken = generateRandomToken();
    cookieHeader = buildOwnerCookie(request, env, ownerToken);
  }

  return {
    ownerToken,
    ownerKey: await sha256Hex(ownerToken),
    cookieHeader,
  };
}

function buildOwnerCookie(request, env, ownerToken) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${getOwnerCookieName(env)}=${ownerToken}; Max-Age=${OWNER_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function generateRandomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

async function createAuthCookie(request, env) {
  const payload = base64UrlEncode(`auth:${Date.now()}`);
  const signature = await sign(payload, env);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${getAuthCookieName(env)}=${payload}.${signature}; Max-Age=${AUTH_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearAuthCookie(env) {
  return `${getAuthCookieName(env)}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

function getCookiePrefix(env) {
  const prefix = String(env.COOKIE_PREFIX || DEFAULT_COOKIE_PREFIX).trim() || DEFAULT_COOKIE_PREFIX;
  return prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || DEFAULT_COOKIE_PREFIX;
}

function getAuthCookieName(env) {
  return `${getCookiePrefix(env)}_auth`;
}

function getOwnerCookieName(env) {
  return `${getCookiePrefix(env)}_owner`;
}

function getPagePasswordCookieName(env, id) {
  return `${getCookiePrefix(env)}_pw_${id}`;
}

async function sign(value, env) {
  const secret = String(env.COOKIE_SECRET || env.AUTH_PASSWORD || 'quickshare-local-secret');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeBase64UrlDecode(value) {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function htmlResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...headers,
    },
  });
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...headers,
    },
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      ...headers,
    },
  });
}

function unauthorizedJson() {
  return jsonResponse({ success: false, error: '未登录' }, 401);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function safeBase64UrlDecodeToBytes(value) {
  try {
    let base64 = value;
    if (base64.includes(';base64,')) {
      base64 = base64.split(';base64,')[1];
    }
    const padded = base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    case 'js':
    case 'mjs':
      return 'application/javascript; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'svg':
      return 'image/svg+xml; charset=utf-8';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    case 'txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

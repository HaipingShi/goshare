import * as fflate from 'fflate';
import {
  renderErrorPage,
  renderAdminPage,
  renderIndexPage,
  renderLoginPage,
  renderPasswordPage,
  renderBootstrapPage,
  renderShareCardPage,
} from './templates.js';
import {
  CODE_TYPES,
  detectCodeType,
  normalizeContentForRendering,
  normalizeMarkdownTheme,
  renderContent,
} from './renderers.js';

const DEFAULT_COOKIE_PREFIX = 'goshare';
const AUTH_TTL_SECONDS = 24 * 60 * 60;
const OWNER_TTL_SECONDS = 60 * 60 * 24 * 365 * 2;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
const MAX_PREVIEW_CONTENT_LENGTH = 512 * 1024;
const DEFAULT_MAX_BEAUTIFY_CONTENT_LENGTH = 120 * 1024;
const MAX_SUBMISSION_PAYLOAD_LENGTH = 64 * 1024;
const MAX_SUBMISSION_KIND_LENGTH = 40;
const DEFAULT_BEAUTIFY_MODEL = '@cf/zai-org/glm-4.7-flash';
const DEFAULT_SHARE_METADATA_MODEL = DEFAULT_BEAUTIFY_MODEL;
const DEFAULT_MAX_SHARE_METADATA_CONTENT_LENGTH = 24 * 1024;
const MAX_SHARE_TITLE_LENGTH = 80;
const MAX_SHARE_SUMMARY_LENGTH = 180;
const DEFAULT_DAILY_CREATE_LIMIT = 50;
const DEFAULT_DAILY_AGENT_CREATE_LIMIT = 200;
const DEFAULT_DAILY_AI_LIMIT = 20;
const MAX_SECURITY_SCAN_CONTENT_LENGTH = 256 * 1024;
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

  if (pathname === '/api/agent/pages' && request.method === 'POST') {
    return createAgentPage(request, env);
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

  const shareMatch = pathname.match(/^\/share\/([^/]+)$/);
  if (shareMatch && request.method === 'GET') {
    return sharePage(request, env, shareMatch[1]);
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

  const payload = await readJsonPayload(request);
  if (!payload.ok) return payload.response;

  const quota = await enforceDailyLimit(env, `create:${await getSubmitterKey(request, env)}`, getDailyCreateLimit(env));
  if (!quota.ok) {
    return dailyLimitResponse(quota, '今日创建次数已达上限');
  }

  const result = await createSharePageFromPayload(payload.data, env, {
    ownerKey: owner.ownerKey,
  });
  if (!result.ok) return createPageErrorResponse(result);

  const cardUrl = buildShareCardUrl(request, env, result.page.urlId);
  const viewUrl = buildViewUrl(request, env, result.page.urlId);
  return jsonResponse({
    success: true,
    url: cardUrl,
    cardUrl,
    viewUrl,
    urlId: result.page.urlId,
    password: result.page.password,
    isProtected: result.page.isProtected,
    title: result.page.title,
    summary: result.page.summary,
    securityWarnings: result.page.securityWarnings,
    quota: quotaSummary(quota),
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
}

async function createAgentPage(request, env) {
  assertBindings(env);
  const auth = await authenticateAgentRequest(request, env);
  if (!auth.ok) return auth.response;

  const runId = await generateAgentRunId();
  const logs = [];
  let runStarted = false;

  try {
    await createAgentRunRecord(env, runId, auth.agentKey);
    runStarted = true;
    await appendAgentRunLog(env, runId, logs, 'info', 'agent_request_authenticated');

    const payload = await readJsonPayload(request);
    if (!payload.ok) {
      return finishAgentRunWithFailure(env, runId, logs, '请求格式错误', 400);
    }
    await appendAgentRunLog(env, runId, logs, 'info', 'create_payload_received');

    const quota = await enforceDailyLimit(env, `agent-create:${auth.agentKey}`, getDailyAgentCreateLimit(env));
    if (!quota.ok) {
      await appendAgentRunLog(env, runId, logs, 'error', 'daily_limit_exceeded', quotaSummary(quota));
      return finishAgentRunWithFailure(env, runId, logs, '今日 Agent 创建次数已达上限', 429);
    }

    const result = await createSharePageFromPayload(payload.data, env, {
      ownerKey: auth.ownerKey,
    });
    if (!result.ok) {
      return finishAgentRunWithFailure(env, runId, logs, result.error, result.status, result.details);
    }

    const url = buildShareCardUrl(request, env, result.page.urlId);
    const viewUrl = buildViewUrl(request, env, result.page.urlId);
    await appendAgentRunLog(env, runId, logs, 'info', 'page_created', {
      url,
      viewUrl,
      urlId: result.page.urlId,
      title: result.page.title,
      summary: result.page.summary,
      codeType: result.page.codeType,
      markdownTheme: result.page.markdownTheme,
      isProtected: result.page.isProtected,
      contentSize: result.page.contentSize,
      securityWarnings: result.page.securityWarnings,
      quota: quotaSummary(quota),
    });
    await updateAgentRunStatus(env, runId, 'completed', result.page.urlId, null);
    await appendAgentRunLog(env, runId, logs, 'info', 'agent_run_completed');

    return jsonResponse({
      success: true,
      url,
      cardUrl: url,
      viewUrl,
      urlId: result.page.urlId,
      runId,
      status: 'completed',
      title: result.page.title,
      summary: result.page.summary,
      securityWarnings: result.page.securityWarnings,
      quota: quotaSummary(quota),
      logs,
    }, 201);
  } catch (error) {
    console.error('Agent API 创建页面错误:', error);
    if (runStarted) {
      try {
        await appendAgentRunLog(env, runId, logs, 'error', 'agent_run_failed', {
          error: 'Agent API 执行失败',
        });
        await updateAgentRunStatus(env, runId, 'failed', null, 'Agent API 执行失败');
      } catch (logError) {
        console.error('Agent API run 记录失败:', logError);
      }
    }

    return jsonResponse({
      success: false,
      runId,
      status: 'failed',
      error: 'Agent API 执行失败',
      logs,
    }, 500);
  }
}

async function createSharePageFromPayload(payload, env, options = {}) {
  const ownerKey = String(options.ownerKey || '');
  if (!ownerKey) {
    return createPageError('缺少 owner 信息', 500);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return createPageError('请求格式错误', 400);
  }

  const htmlContent = String(payload.htmlContent ?? payload.content ?? '').trim();
  const zipContent = String(payload.zipContent || '').trim();
  const isProtected = Boolean(payload.isProtected);
  const requestedCodeType = String(payload.codeType || '').trim().toLowerCase();

  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));
  const markdownTheme = codeType === CODE_TYPES.MARKDOWN
    ? normalizeMarkdownTheme(payload.markdownTheme)
    : normalizeMarkdownTheme();

  if (codeType === CODE_TYPES.ZIP) {
    if (!zipContent) {
      return createPageError('请提供ZIP内容', 400);
    }
    if (zipContent.length > MAX_CONTENT_LENGTH) {
      return createPageError('内容过大，请控制在10MB以内', 413);
    }
  } else {
    if (!htmlContent) {
      return createPageError('请提供HTML内容', 400);
    }
    if (htmlContent.length > MAX_CONTENT_LENGTH) {
      return createPageError('内容过大，请控制在10MB以内', 413);
    }
  }

  const password = generateRandomPassword();
  const createdAt = Date.now();
  const updatedAt = createdAt;

  let contentHash;
  let contentSize;
  let zipBytes = null;
  let files = null;
  let security = { findings: [] };

  if (codeType === CODE_TYPES.ZIP) {
    zipBytes = safeBase64UrlDecodeToBytes(zipContent);
    if (!zipBytes) {
      return createPageError('ZIP内容格式错误', 400);
    }
    contentSize = zipBytes.byteLength;
    contentHash = await sha256Hex(zipContent);

    try {
      files = fflate.unzipSync(zipBytes);
    } catch (err) {
      console.error('解压失败:', err);
      return createPageError('解压 ZIP 文件失败，请确保压缩文件未损坏', 400);
    }

    // ZIP 结构校验
    const fileKeys = Object.keys(files);
    const hasIndexHtmlAtRoot = fileKeys.includes('index.html');
    const hasPackageJson = fileKeys.some(f => f === 'package.json' || f.endsWith('/package.json'));
    const anyIndexHtml = fileKeys.find(f => f === 'index.html' || f.endsWith('/index.html'));

    const hasSourceIndicators = fileKeys.some(f => f.startsWith('src/') || f === 'tsconfig.json' || f === 'vite.config.ts' || f === 'webpack.config.js');
    if (hasPackageJson && hasSourceIndicators) {
      return createPageError('检测到上传的是前端项目源码包而非编译后的产物。请先在本地运行 `npm run build`，然后将生成的 `dist` 目录内的所有文件压缩后上传。', 400);
    }

    if (!hasIndexHtmlAtRoot) {
      if (hasPackageJson && !anyIndexHtml) {
        return createPageError('检测到上传的是前端源码包而非编译产物。请先在本地运行 `npm run build`，然后选择生成的 `dist` 目录内的所有文件进行压缩上传。', 400);
      }
      
      if (anyIndexHtml) {
        const folderName = anyIndexHtml.split('/')[0];
        return createPageError(`入口文件 index.html 未处于压缩包最外层（当前位于 \`${folderName}/index.html\`）。请直接对 \`${folderName}\` 目录内的所有文件进行压缩，确保 index.html 处于压缩包根目录。`, 400);
      }

      return createPageError('ZIP 压缩包内未找到 `index.html` 入口文件，静态网页需要以 index.html 作为首页入口。', 400);
    }

    security = scanShareContent({
      env,
      content: extractZipSecurityScanText(files),
      codeType,
    });
    if (!security.ok) {
      return createPageError(security.error, 422, security);
    }
  } else {
    contentHash = await sha256Hex(htmlContent);
    const encoder = new TextEncoder();
    contentSize = encoder.encode(htmlContent).byteLength;

    security = scanShareContent({
      env,
      content: htmlContent,
      codeType,
    });
    if (!security.ok) {
      return createPageError(security.error, 422, security);
    }
  }

  const metadata = await generateShareMetadata({
    env,
    content: codeType === CODE_TYPES.ZIP ? '' : htmlContent,
    codeType,
    providedTitle: payload.title,
    providedSummary: payload.summary,
  });
  const shareCardTheme = normalizeShareCardTheme(payload.shareCardTheme);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const urlId = await generatePageId(codeType === CODE_TYPES.ZIP ? zipContent : htmlContent, attempt);
    const r2Key = codeType === CODE_TYPES.ZIP ? `pages/${urlId}/index.html` : `pages/${urlId}.txt`;

    try {
      if (codeType === CODE_TYPES.ZIP) {
        for (const [filename, fileData] of Object.entries(files)) {
          if (filename.endsWith('/') || fileData.length === 0) continue;
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
        INSERT INTO pages (id, r2_key, created_at, updated_at, owner_key, password, is_protected, code_type, markdown_theme, content_size, content_sha256, title, summary, metadata_source, share_card_theme)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          urlId,
          r2Key,
          createdAt,
          updatedAt,
          ownerKey,
          password,
          isProtected ? 1 : 0,
          codeType,
          markdownTheme,
          contentSize,
          contentHash,
          metadata.title,
          metadata.summary,
          metadata.source,
          shareCardTheme,
        )
        .run();

      return {
        ok: true,
        page: {
          urlId,
          password,
          isProtected,
          codeType,
          markdownTheme,
          contentSize,
          contentHash,
          title: metadata.title,
          summary: metadata.summary,
          metadataSource: metadata.source,
          shareCardTheme,
          securityWarnings: security.findings || [],
        },
      };
    } catch (error) {
      console.error('创建页面错误:', error);
      if (attempt === 4) {
        return createPageError('创建页面失败', 500);
      }
    }
  }

  return createPageError('创建页面失败', 500);
}

function createPageError(error, status, details = {}) {
  return {
    ok: false,
    error,
    status,
    details,
  };
}

function createPageErrorResponse(result) {
  return jsonResponse({
    success: false,
    error: result.error,
    securityFindings: result.details?.findings || undefined,
  }, result.status || 500);
}

async function finishAgentRunWithFailure(env, runId, logs, error, statusCode = 500, details = {}) {
  await appendAgentRunLog(env, runId, logs, 'error', 'agent_run_failed', {
    error,
    securityFindings: details.findings,
  });
  await updateAgentRunStatus(env, runId, 'failed', null, error);

  return jsonResponse({
    success: false,
    runId,
    status: 'failed',
    error,
    securityFindings: details.findings,
    logs,
  }, statusCode);
}

async function authenticateAgentRequest(request, env) {
  const expectedToken = getAgentApiToken(env);
  if (!expectedToken) {
    return {
      ok: false,
      response: jsonResponse({
        success: false,
        status: 'not_configured',
        error: 'Agent API 未配置 AGENT_API_TOKEN',
      }, 503),
    };
  }

  const authHeader = String(request.headers.get('Authorization') || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      response: jsonResponse({
        success: false,
        status: 'unauthorized',
        error: '请提供 Bearer Token',
      }, 401, { 'WWW-Authenticate': 'Bearer realm="goshare-agent"' }),
    };
  }

  const providedToken = match[1].trim();
  const providedHash = await sha256Hex(providedToken);
  const expectedHash = await sha256Hex(expectedToken);
  if (!constantTimeEqual(providedHash, expectedHash)) {
    return {
      ok: false,
      response: jsonResponse({
        success: false,
        status: 'unauthorized',
        error: 'Bearer Token 无效',
      }, 401, { 'WWW-Authenticate': 'Bearer realm="goshare-agent"' }),
    };
  }

  return {
    ok: true,
    agentKey: await sha256Hex(`agent:${expectedToken}`),
    ownerKey: await sha256Hex(`agent-owner:${expectedToken}`),
  };
}

function getAgentApiToken(env) {
  return String(env.AGENT_API_TOKEN || '').trim();
}

async function createAgentRunRecord(env, runId, agentKey) {
  const createdAt = Date.now();
  await env.DB.prepare(`
    INSERT INTO agent_runs (id, created_at, updated_at, status, agent_key)
    VALUES (?, ?, ?, ?, ?)
  `)
    .bind(runId, createdAt, createdAt, 'running', agentKey)
    .run();
}

async function updateAgentRunStatus(env, runId, status, pageId, error) {
  await env.DB.prepare(`
    UPDATE agent_runs
    SET updated_at = ?, status = ?, page_id = ?, error = ?
    WHERE id = ?
  `)
    .bind(Date.now(), status, pageId, error, runId)
    .run();
}

async function appendAgentRunLog(env, runId, logs, level, message, data) {
  const createdAt = Date.now();
  const sequence = logs.length;
  const logId = await generateAgentRunLogId(runId, sequence, createdAt);
  const dataJson = data === undefined ? null : JSON.stringify(data);

  await env.DB.prepare(`
    INSERT INTO agent_run_logs (id, run_id, sequence, created_at, level, message, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(logId, runId, sequence, createdAt, level, message, dataJson)
    .run();

  const log = {
    time: new Date(createdAt).toISOString(),
    level,
    message,
  };
  if (data !== undefined) {
    log.data = data;
  }
  logs.push(log);
}

function buildPublicUrl(request, env, path) {
  const publicSiteUrl = String(env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const origin = publicSiteUrl || new URL(request.url).origin;
  return `${origin}${path}`;
}

function buildShareCardUrl(request, env, urlId) {
  return buildPublicUrl(request, env, `/share/${encodeURIComponent(urlId)}`);
}

function buildViewUrl(request, env, urlId) {
  return buildPublicUrl(request, env, `/view/${encodeURIComponent(urlId)}`);
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

  const quota = await enforceDailyLimit(env, `ai:${await getSubmitterKey(request, env)}`, getDailyAiLimit(env));
  if (!quota.ok) {
    return dailyLimitResponse(quota, '今日智能美化次数已达上限');
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
    quota: quotaSummary(quota),
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
    SELECT id, created_at, COALESCE(updated_at, created_at) AS updated_at, is_protected, code_type, content_size, COALESCE(title, id) AS title, COALESCE(summary, '') AS summary
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
  const metadata = await generateShareMetadata({
    env,
    content: htmlContent,
    codeType,
    providedTitle: payload.title,
    providedSummary: payload.summary,
  });

  await env.CONTENT_BUCKET.put(page.r2_key, htmlContent, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: {
      pageId: id,
      codeType,
    },
  });

  await env.DB.prepare(`
    UPDATE pages
    SET updated_at = ?, is_protected = ?, code_type = ?, markdown_theme = ?, content_size = ?, content_sha256 = ?, title = ?, summary = ?, metadata_source = ?
    WHERE id = ? AND owner_key = ?
  `)
    .bind(
      updatedAt,
      payload.isProtected ? 1 : 0,
      codeType,
      markdownTheme,
      contentSize,
      contentHash,
      metadata.title,
      metadata.summary,
      metadata.source,
      id,
      owner.ownerKey,
    )
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
      title: page.title,
      summary: page.summary,
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

async function sharePage(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return htmlResponse(renderErrorPage({
      title: '分享不存在',
      message: '您请求的分享卡片不存在或已被删除',
    }, env), 404);
  }

  const page = await getPageRecord(env, id);
  if (!page) {
    return htmlResponse(renderErrorPage({
      title: '分享不存在',
      message: '您请求的分享卡片不存在或已被删除',
    }, env), 404);
  }

  return htmlResponse(renderShareCardPage({
    page,
    shareUrl: buildShareCardUrl(request, env, id),
    viewUrl: buildViewUrl(request, env, id),
  }, env));
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
      injectShareMeta(
        injectCodeTypeMeta(renderedContent, normalized.contentType || page.code_type),
        {
          title: page.title,
          summary: page.summary,
          url: buildShareCardUrl(request, env, page.id),
        },
        env,
      ),
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
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, COALESCE(markdown_theme, 'bytedance') AS markdown_theme, content_size, content_sha256, COALESCE(title, id) AS title, COALESCE(summary, '') AS summary, COALESCE(metadata_source, 'fallback') AS metadata_source, COALESCE(share_card_theme, 'default') AS share_card_theme
    FROM pages
    WHERE id = ?
  `)
    .bind(id)
    .first();
}

async function getOwnedPageRecord(env, id, ownerKey) {
  return env.DB.prepare(`
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, COALESCE(markdown_theme, 'bytedance') AS markdown_theme, content_size, content_sha256, COALESCE(title, id) AS title, COALESCE(summary, '') AS summary, COALESCE(metadata_source, 'fallback') AS metadata_source, COALESCE(share_card_theme, 'default') AS share_card_theme
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

function scanShareContent({ env, content, codeType }) {
  if (!isSecurityScanEnabled(env)) {
    return { ok: true, findings: [] };
  }

  const source = prepareSecurityScanContent(content, codeType).slice(0, MAX_SECURITY_SCAN_CONTENT_LENGTH);
  const findings = [];

  addSecurityFinding(findings, {
    id: 'password-input',
    severity: 'high',
    message: '包含密码输入框，容易被用于钓鱼或凭据采集。',
    matched: /<input[^>]+type=["']?password/i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'credential-fields',
    severity: 'high',
    message: '包含验证码、助记词、私钥或银行卡等敏感信息采集字段。',
    matched: /<input[^>]+(?:name|id|placeholder)=["'][^"']*(otp|2fa|verification|验证码|助记词|mnemonic|seed|private.?key|私钥|card.?number|银行卡|cvv)[^"']*["']/i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'external-form-action',
    severity: 'high',
    message: '表单会提交到外部站点，可能收集访问者输入。',
    matched: /<form[^>]+action=["']https?:\/\//i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'external-credential-submit',
    severity: 'high',
    message: '页面同时包含表单输入和外部网络提交代码，存在凭据外传风险。',
    matched: /<(form|input|textarea|select)\b/i.test(source) && /\b(fetch|sendbeacon|xmlhttprequest|axios)\s*\(?\s*["'`]https?:\/\//i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'cookie-exfiltration',
    severity: 'high',
    message: '脚本读取 Cookie 并发起网络请求，存在会话信息外传风险。',
    matched: /document\.cookie/i.test(source) && /\b(fetch|sendbeacon|xmlhttprequest|navigator\.sendbeacon|new\s+image)\b/i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'automatic-redirect',
    severity: 'high',
    message: '页面包含自动跳转到外部站点的代码，可能用于钓鱼落地页。',
    matched: /<meta[^>]+http-equiv=["']refresh["'][^>]+url\s*=\s*https?:\/\//i.test(source)
      || /\b(location\.(href|replace|assign)|window\.open)\s*\(?\s*["'`]https?:\/\//i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'brand-impersonation',
    severity: 'high',
    message: '页面疑似冒充常见登录/支付/钱包服务并采集输入。',
    matched: /<(form|input)\b/i.test(source)
      && /(cloudflare|github|google|microsoft|apple|paypal|stripe|metamask|wallet|银行|支付宝|微信支付|登录|密码|验证码)/i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'dangerous-script-obfuscation',
    severity: 'high',
    message: '脚本包含 eval、Function 构造器或高度混淆执行模式。',
    matched: /\b(eval|settimeout|setinterval)\s*\(\s*(atob|unescape|decodeuricomponent|["'`][\s\S]{120,})/i.test(source)
      || /new\s+Function\s*\(/i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'external-script',
    severity: 'medium',
    message: '页面加载外部脚本，访问者会执行第三方代码。',
    matched: /<script[^>]+src=["']https?:\/\//i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'external-iframe',
    severity: 'medium',
    message: '页面嵌入外部 iframe，可能展示第三方登录或追踪内容。',
    matched: /<iframe[^>]+src=["']https?:\/\//i.test(source),
  });
  addSecurityFinding(findings, {
    id: 'inline-event-network',
    severity: 'medium',
    message: '页面包含点击/加载事件里的外部网络调用。',
    matched: /\son(?:click|load|submit|error)=["'][^"']*https?:\/\//i.test(source),
  });

  const highFindings = findings.filter((finding) => finding.severity === 'high');
  if (highFindings.length > 0) {
    return {
      ok: false,
      findings,
      error: `内容安全检测未通过：${highFindings.map((finding) => finding.message).join('；')}`,
    };
  }

  return {
    ok: true,
    findings,
    codeType,
  };
}

function prepareSecurityScanContent(content, codeType) {
  const source = String(content || '');
  if (codeType === CODE_TYPES.MARKDOWN) {
    return source.replace(/```[\s\S]*?```/g, '');
  }
  return source;
}

function addSecurityFinding(findings, finding) {
  if (!finding.matched) return;
  findings.push({
    id: finding.id,
    severity: finding.severity,
    message: finding.message,
  });
}

function extractZipSecurityScanText(files) {
  const textDecoder = new TextDecoder();
  const interestingFilePattern = /\.(html?|js|mjs|css|svg|txt|md)$/i;
  let result = '';

  for (const [filename, fileData] of Object.entries(files || {})) {
    if (!interestingFilePattern.test(filename)) continue;
    if (result.length >= MAX_SECURITY_SCAN_CONTENT_LENGTH) break;
    const chunk = textDecoder.decode(fileData.slice(0, 64 * 1024));
    result += `\n\n/* file: ${filename} */\n${chunk}`;
  }

  return result.slice(0, MAX_SECURITY_SCAN_CONTENT_LENGTH);
}

function isSecurityScanEnabled(env) {
  return String(env.SECURITY_SCAN_ENABLED || 'true').toLowerCase() !== 'false';
}

async function enforceDailyLimit(env, scope, limit) {
  const normalizedLimit = Number(limit);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    return {
      ok: true,
      unlimited: true,
      limit: 0,
      count: 0,
      remaining: null,
    };
  }

  const day = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT count FROM daily_usage WHERE scope = ? AND day = ?')
    .bind(scope, day)
    .first();
  const currentCount = Number(existing?.count || 0);

  if (currentCount >= normalizedLimit) {
    return {
      ok: false,
      limit: normalizedLimit,
      count: currentCount,
      remaining: 0,
      day,
    };
  }

  if (existing) {
    await env.DB.prepare('UPDATE daily_usage SET count = ?, updated_at = ? WHERE scope = ? AND day = ?')
      .bind(currentCount + 1, now, scope, day)
      .run();
  } else {
    await env.DB.prepare('INSERT INTO daily_usage (scope, day, count, updated_at) VALUES (?, ?, ?, ?)')
      .bind(scope, day, 1, now)
      .run();
  }

  return {
    ok: true,
    limit: normalizedLimit,
    count: currentCount + 1,
    remaining: Math.max(0, normalizedLimit - currentCount - 1),
    day,
  };
}

function dailyLimitResponse(quota, message) {
  return jsonResponse({
    success: false,
    error: message,
    quota: quotaSummary(quota),
  }, 429);
}

function quotaSummary(quota) {
  if (!quota) return undefined;
  return {
    limit: quota.limit,
    used: quota.count,
    remaining: quota.remaining,
    day: quota.day,
    unlimited: Boolean(quota.unlimited),
  };
}

function getDailyCreateLimit(env) {
  return getPositiveIntegerEnv(env, 'DAILY_CREATE_LIMIT', DEFAULT_DAILY_CREATE_LIMIT, 10000);
}

function getDailyAgentCreateLimit(env) {
  return getPositiveIntegerEnv(env, 'DAILY_AGENT_CREATE_LIMIT', DEFAULT_DAILY_AGENT_CREATE_LIMIT, 10000);
}

function getDailyAiLimit(env) {
  return getPositiveIntegerEnv(env, 'DAILY_AI_LIMIT', DEFAULT_DAILY_AI_LIMIT, 10000);
}

function getPositiveIntegerEnv(env, name, defaultValue, maxValue) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  if (parsed <= 0) return 0;
  return Math.min(parsed, maxValue);
}

async function generateShareMetadata({ env, content, codeType, providedTitle, providedSummary }) {
  const fallback = extractFallbackShareMetadata(content, codeType);
  const manualTitle = normalizeShareTitle(providedTitle);
  const manualSummary = normalizeShareSummary(providedSummary);

  if (manualTitle && manualSummary) {
    return {
      title: manualTitle,
      summary: manualSummary,
      source: 'manual',
    };
  }

  if (shouldUseShareMetadataAi(env, content, codeType)) {
    try {
      const aiMetadata = await generateAiShareMetadata(env, content, codeType);
      if (aiMetadata) {
        return {
          title: manualTitle || aiMetadata.title || fallback.title,
          summary: manualSummary || aiMetadata.summary || fallback.summary,
          source: 'ai',
        };
      }
    } catch (error) {
      console.error('AI share metadata failed:', error);
    }
  }

  return {
    title: manualTitle || fallback.title,
    summary: manualSummary || fallback.summary,
    source: manualTitle || manualSummary ? 'manual' : 'fallback',
  };
}

function shouldUseShareMetadataAi(env, content, codeType) {
  if (codeType === CODE_TYPES.ZIP) return false;
  if (!content || !env.AI) return false;
  const explicit = String(env.AI_SHARE_METADATA_ENABLED || '').trim().toLowerCase();
  if (explicit) return explicit !== 'false';
  return String(env.AI_ENABLED || 'true').toLowerCase() !== 'false';
}

async function generateAiShareMetadata(env, content, codeType) {
  const model = String(env.AI_SHARE_METADATA_MODEL || DEFAULT_SHARE_METADATA_MODEL);
  const prompt = buildShareMetadataPrompt(
    content.slice(0, getMaxShareMetadataContentLength(env)),
    codeType,
  );

  const aiResult = await env.AI.run(model, {
    messages: [
      {
        role: 'system',
        content: 'You write concise share-card metadata. Return only valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 512,
  });

  const rawText = extractAiText(aiResult).trim();
  if (!rawText) return null;

  const parsed = JSON.parse(stripMarkdownFence(rawText));
  if (!parsed || typeof parsed !== 'object') return null;

  const title = normalizeShareTitle(parsed.title);
  const summary = normalizeShareSummary(parsed.summary);
  if (!title && !summary) return null;
  return { title, summary };
}

function buildShareMetadataPrompt(content, codeType) {
  return `Read the user's shared content and produce share-card metadata.

Return ONLY JSON:
{"title":"short readable title","summary":"one concise sentence"}

Rules:
- Preserve the user's actual meaning.
- Do not invent facts, customers, prices, rankings, credentials, sources, or claims.
- Title max ${MAX_SHARE_TITLE_LENGTH} characters.
- Summary max ${MAX_SHARE_SUMMARY_LENGTH} characters.
- Prefer Chinese if the input is Chinese; otherwise use the input language.
- Avoid markdown fences.

Input type: ${codeType}
Input content:
${content}`;
}

function extractFallbackShareMetadata(content, codeType) {
  if (codeType === CODE_TYPES.ZIP) {
    return {
      title: '静态网页分享',
      summary: '一个通过 goshare 发布的静态网页。',
    };
  }

  const raw = String(content || '').trim();
  if (codeType === CODE_TYPES.MARKDOWN) {
    const heading = raw.match(/^#\s+(.+)$/m) || raw.match(/^##\s+(.+)$/m);
    const paragraph = raw
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('---'));
    return {
      title: normalizeShareTitle(heading?.[1]) || 'Markdown 分享',
      summary: normalizeShareSummary(paragraph) || '一份通过 goshare 发布的 Markdown 内容。',
    };
  }

  if (codeType === CODE_TYPES.HTML) {
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const description = raw.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
      || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1];
    const plainText = htmlToText(raw);
    return {
      title: normalizeShareTitle(htmlToText(title || '')) || 'HTML 分享',
      summary: normalizeShareSummary(description || plainText) || '一个通过 goshare 发布的 HTML 页面。',
    };
  }

  if (codeType === CODE_TYPES.SVG) {
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return {
      title: normalizeShareTitle(htmlToText(title || '')) || 'SVG 图形分享',
      summary: '一份通过 goshare 发布的 SVG 视觉内容。',
    };
  }

  if (codeType === CODE_TYPES.MERMAID) {
    const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean);
    return {
      title: normalizeShareTitle(firstLine) || 'Mermaid 图表分享',
      summary: '一份通过 goshare 发布的 Mermaid 图表。',
    };
  }

  const plainText = htmlToText(raw);
  return {
    title: normalizeShareTitle(plainText) || 'goshare 分享',
    summary: normalizeShareSummary(plainText) || '一份通过 goshare 发布的内容。',
  };
}

function normalizeShareTitle(value) {
  const normalized = normalizeMetadataText(value);
  if (!normalized) return '';
  return truncateText(normalized, MAX_SHARE_TITLE_LENGTH);
}

function normalizeShareSummary(value) {
  const normalized = normalizeMetadataText(value);
  if (!normalized) return '';
  return truncateText(normalized, MAX_SHARE_SUMMARY_LENGTH);
}

function normalizeMetadataText(value) {
  return htmlToText(String(value || ''))
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, maxLength) {
  const chars = Array.from(String(value || ''));
  if (chars.length <= maxLength) return chars.join('');
  return `${chars.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

function htmlToText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeShareCardTheme(value) {
  const theme = String(value || 'default').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(theme) ? theme : 'default';
}

function getMaxShareMetadataContentLength(env) {
  const parsedKb = Number.parseInt(String(env.MAX_SHARE_METADATA_CONTENT_KB || ''), 10);
  if (!Number.isFinite(parsedKb) || parsedKb <= 0) return DEFAULT_MAX_SHARE_METADATA_CONTENT_LENGTH;
  return Math.min(parsedKb, 128) * 1024;
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

async function generateAgentRunId() {
  const randomToken = generateRandomToken(12);
  const hash = await sha256Hex(`agent-run:${Date.now()}:${randomToken}`);
  return `run_${hash.slice(0, 18)}`;
}

async function generateAgentRunLogId(runId, sequence, createdAt) {
  const randomToken = generateRandomToken(8);
  const hash = await sha256Hex(`${runId}:${sequence}:${createdAt}:${randomToken}`);
  return `log_${hash.slice(0, 18)}`;
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

function injectShareMeta(html, metadata, env) {
  if (!html.includes('</head>')) return html;

  const title = metadata.title || 'goshare 分享';
  const summary = metadata.summary || '一份通过 goshare 发布的内容。';
  const imageUrl = resolveShareImageUrl(env, metadata.url);
  const meta = [
    `<meta property="og:title" content="${escapeHtmlAttribute(title)}">`,
    `<meta property="og:description" content="${escapeHtmlAttribute(summary)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escapeHtmlAttribute(metadata.url || '')}">`,
    `<meta property="og:image" content="${escapeHtmlAttribute(imageUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtmlAttribute(title)}">`,
    `<meta name="twitter:description" content="${escapeHtmlAttribute(summary)}">`,
  ].join('\n');

  return html.replace('</head>', `${meta}\n</head>`);
}

function resolveShareImageUrl(env, pageUrl) {
  const configured = String(env.APP_LOGO_URL || '/icon/web/icon-512.png').trim() || '/icon/web/icon-512.png';
  if (/^https?:\/\//i.test(configured)) return configured;

  const publicSiteUrl = String(env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (publicSiteUrl) {
    return `${publicSiteUrl}${configured.startsWith('/') ? configured : `/${configured}`}`;
  }

  try {
    const origin = new URL(pageUrl || '').origin;
    return `${origin}${configured.startsWith('/') ? configured : `/${configured}`}`;
  } catch {
    return configured;
  }
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

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  const secret = String(env.COOKIE_SECRET || env.AUTH_PASSWORD || 'goshare-local-secret');
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

import {
  renderErrorPage,
  renderAdminPage,
  renderIndexPage,
  renderLoginPage,
  renderPasswordPage,
} from './templates.js';
import {
  CODE_TYPES,
  detectCodeType,
  normalizeContentForRendering,
  renderContent,
} from './renderers.js';

const AUTH_COOKIE = 'quickshare_auth';
const OWNER_COOKIE = 'quickshare_owner';
const AUTH_TTL_SECONDS = 24 * 60 * 60;
const OWNER_TTL_SECONDS = 60 * 60 * 24 * 365 * 2;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_CODE_TYPES = new Set([
  CODE_TYPES.HTML,
  CODE_TYPES.MARKDOWN,
  CODE_TYPES.SVG,
  CODE_TYPES.MERMAID,
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
      }), 500);
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
    return htmlResponse(renderIndexPage());
  }

  if (pathname === '/admin' && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) {
      return redirect('/login');
    }
    const owner = await getOwnerContext(request, env);
    return htmlResponse(renderAdminPage(), 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
  }

  if (pathname === '/login' && request.method === 'GET') {
    if (!isAuthEnabled(env) || (await isAuthenticated(request, env))) {
      return redirect('/');
    }
    return htmlResponse(renderLoginPage());
  }

  if (pathname === '/login' && request.method === 'POST') {
    return handleLogin(request, env);
  }

  if (pathname === '/logout' && request.method === 'GET') {
    return redirect('/login', {
      'Set-Cookie': clearAuthCookie(),
    });
  }

  if (pathname === '/api/pages/create' && request.method === 'POST') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return createPage(request, env);
  }

  if (pathname === '/api/pages/list/recent' && request.method === 'GET') {
    return listRecentPages(request, env);
  }

  if (pathname === '/api/admin/pages' && request.method === 'GET') {
    if (!(await isAuthenticated(request, env))) return unauthorizedJson();
    return listOwnedPages(request, env);
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

  const apiPageMatch = pathname.match(/^\/api\/pages\/([^/]+)$/);
  if (apiPageMatch && request.method === 'GET') {
    return getPageInfo(env, apiPageMatch[1]);
  }

  const validateMatch = pathname.match(/^\/validate-password\/([^/]+)$/);
  if (validateMatch && request.method === 'GET') {
    return validatePassword(env, validateMatch[1], url.searchParams.get('password'));
  }

  const viewMatch = pathname.match(/^\/view\/([^/]+)$/);
  if (viewMatch && request.method === 'GET') {
    return viewPage(request, env, viewMatch[1]);
  }

  if (env.ASSETS) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
  }

  return htmlResponse(renderErrorPage({
    title: '页面未找到',
    message: '您请求的页面不存在',
  }), 404);
}

async function handleLogin(request, env) {
  if (!isAuthEnabled(env)) return redirect('/');

  const formData = await request.formData();
  const password = String(formData.get('password') || '');

  if (password === getAuthPassword(env)) {
    return redirect('/', {
      'Set-Cookie': await createAuthCookie(request, env),
    });
  }

  return htmlResponse(renderLoginPage({ error: '密码错误，请重试' }), 401);
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
  const isProtected = Boolean(payload.isProtected);
  const requestedCodeType = String(payload.codeType || '');

  if (!htmlContent) {
    return jsonResponse({ success: false, error: '请提供HTML内容' }, 400);
  }

  if (htmlContent.length > MAX_CONTENT_LENGTH) {
    return jsonResponse({ success: false, error: '内容过大，请控制在10MB以内' }, 413);
  }

  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));
  const password = generateRandomPassword();
  const createdAt = Date.now();
  const updatedAt = createdAt;
  const contentHash = await sha256Hex(htmlContent);
  const encoder = new TextEncoder();
  const contentSize = encoder.encode(htmlContent).byteLength;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const urlId = await generatePageId(htmlContent, attempt);
    const r2Key = `pages/${urlId}.txt`;

    try {
      await env.CONTENT_BUCKET.put(r2Key, htmlContent, {
        httpMetadata: { contentType: 'text/plain; charset=utf-8' },
        customMetadata: {
          pageId: urlId,
          codeType,
        },
      });

      await env.DB.prepare(`
        INSERT INTO pages (id, r2_key, created_at, updated_at, owner_key, password, is_protected, code_type, content_size, content_sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(urlId, r2Key, createdAt, updatedAt, owner.ownerKey, password, isProtected ? 1 : 0, codeType, contentSize, contentHash)
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

  const object = await env.CONTENT_BUCKET.get(page.r2_key);
  if (!object) {
    return jsonResponse({ success: false, error: '内容对象不存在' }, 500);
  }

  return jsonResponse({
    success: true,
    page: {
      ...page,
      htmlContent: await object.text(),
    },
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

  const htmlContent = String(payload.htmlContent || '').trim();
  const requestedCodeType = String(payload.codeType || '');
  const codeType = VALID_CODE_TYPES.has(requestedCodeType)
    ? requestedCodeType
    : normalizeDetectedCodeType(detectCodeType(htmlContent));

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
    SET updated_at = ?, is_protected = ?, code_type = ?, content_size = ?, content_sha256 = ?
    WHERE id = ? AND owner_key = ?
  `)
    .bind(updatedAt, payload.isProtected ? 1 : 0, codeType, contentSize, contentHash, id, owner.ownerKey)
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

  await env.CONTENT_BUCKET.delete(page.r2_key);
  await env.DB.prepare('DELETE FROM pages WHERE id = ? AND owner_key = ?')
    .bind(id, owner.ownerKey)
    .run();

  return jsonResponse({
    success: true,
    message: '删除成功',
  }, 200, owner.cookieHeader ? { 'Set-Cookie': owner.cookieHeader } : {});
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

async function viewPage(request, env, id) {
  assertBindings(env);
  if (!isValidId(id)) {
    return htmlResponse(renderErrorPage({
      title: '页面未找到',
      message: '您请求的页面不存在或已被删除',
    }), 404);
  }

  const url = new URL(request.url);
  const page = await getPageRecord(env, id);

  if (!page) {
    return htmlResponse(renderErrorPage({
      title: '页面未找到',
      message: '您请求的页面不存在或已被删除',
    }), 404);
  }

  if (page.is_protected === 1) {
    const password = url.searchParams.get('password');
    if (!password || password !== page.password) {
      return htmlResponse(renderPasswordPage({
        id,
        error: password ? '密码错误，请重试' : null,
      }), password ? 401 : 200);
    }
  }

  const object = await env.CONTENT_BUCKET.get(page.r2_key);
  if (!object) {
    return htmlResponse(renderErrorPage({
      title: '内容未找到',
      message: '页面元数据存在，但 R2 中的内容对象不存在',
    }), 500);
  }

  const rawContent = await object.text();
  const normalized = normalizeContentForRendering(rawContent);
  const renderedContent = await renderContent(normalized.content, normalized.contentType);
  const contentWithTypeInfo = injectCodeTypeMeta(renderedContent, normalized.contentType || page.code_type);

  return htmlResponse(contentWithTypeInfo);
}

async function getPageRecord(env, id) {
  return env.DB.prepare(`
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, content_size, content_sha256
    FROM pages
    WHERE id = ?
  `)
    .bind(id)
    .first();
}

async function getOwnedPageRecord(env, id, ownerKey) {
  return env.DB.prepare(`
    SELECT id, r2_key, created_at, COALESCE(updated_at, created_at) AS updated_at, owner_key, password, is_protected, code_type, content_size, content_sha256
    FROM pages
    WHERE id = ? AND owner_key = ?
  `)
    .bind(id, ownerKey)
    .first();
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

function isAuthEnabled(env) {
  return String(env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
}

function getAuthPassword(env) {
  return String(env.AUTH_PASSWORD || 'admin123');
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

  const cookie = getCookie(request, AUTH_COOKIE);
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
  let ownerToken = getCookie(request, OWNER_COOKIE);
  let cookieHeader = null;

  if (!ownerToken || !/^[a-zA-Z0-9_-]{32,160}$/.test(ownerToken)) {
    ownerToken = generateRandomToken();
    cookieHeader = buildOwnerCookie(request, ownerToken);
  }

  return {
    ownerToken,
    ownerKey: await sha256Hex(ownerToken),
    cookieHeader,
  };
}

function buildOwnerCookie(request, ownerToken) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${OWNER_COOKIE}=${ownerToken}; Max-Age=${OWNER_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
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
  return `${AUTH_COOKIE}=${payload}.${signature}; Max-Age=${AUTH_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearAuthCookie() {
  return `${AUTH_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
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

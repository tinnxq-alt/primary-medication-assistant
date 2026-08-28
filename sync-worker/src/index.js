const ENTITY_TYPES = new Set(["favorite", "note", "task", "setting"]);
const MAX_ENTITY_ID_LENGTH = 160;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_LIST_ROWS = 500;
const STATE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_COOKIE = "__Host-clinical_session";

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).includes(origin);
}

function responseHeaders(origin, env, extra = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    ...extra
  };
  if (origin && isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function json(data, status, origin, env, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, env, extra) });
}

function cleanToken(value, maxLength) {
  const token = String(value || "").normalize("NFKC").trim();
  if (!token || token.length > maxLength || !/^[a-zA-Z0-9._:-]+$/.test(token)) return "";
  return token;
}

function cleanEntityType(value) {
  const type = cleanToken(value, 32);
  return ENTITY_TYPES.has(type) ? type : "";
}

function cleanEntityId(value) {
  return cleanToken(value, MAX_ENTITY_ID_LENGTH);
}

function payloadText(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength <= MAX_PAYLOAD_BYTES ? text : null;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function cookieValue(request, name) {
  const cookies = String(request.headers.get("Cookie") || "").split(";");
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return "";
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function allowedGitHubUserIds(env) {
  return new Set(String(env.ALLOWED_GITHUB_USER_IDS || "").split(",").map((value) => value.trim()).filter((value) => /^\d+$/u.test(value)));
}

function callbackUrl(request, env) {
  if (env.GITHUB_CALLBACK_URL) return String(env.GITHUB_CALLBACK_URL);
  return `${new URL(request.url).origin}/auth/github/callback`;
}

function safeReturnTo(value, env) {
  const fallback = allowedOrigins(env)[0] || "/";
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return allowedOrigins(env).includes(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

async function accessIdentity(ctx) {
  if (!ctx?.access) return null;
  const identity = await ctx.access.getIdentity();
  const userId = cleanToken(identity?.user_uuid, 128);
  return userId ? { userId, provider: "cloudflare-access" } : null;
}

async function sessionIdentity(request, env, now = Date.now()) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !env.DB?.prepare) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT user_id, expires_at FROM user_sessions
    WHERE session_hash = ? AND expires_at > ?`).bind(tokenHash, new Date(now).toISOString()).first();
  if (!row?.user_id) return null;
  return { userId: cleanToken(row.user_id, 128), provider: "github" };
}

async function authenticatedUser(ctx, request, env, now = Date.now()) {
  return await accessIdentity(ctx) || (request && env ? await sessionIdentity(request, env, now) : null);
}

async function startGitHubLogin(request, env, now = Date.now()) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.DB?.prepare) {
    return json({ error: "LOGIN_NOT_CONFIGURED", message: "GitHub 登录尚未配置" }, 503, "", env);
  }
  const url = new URL(request.url);
  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const expiresAt = new Date(now + STATE_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO oauth_states
    (state_hash, code_verifier, return_to, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256(state), verifier, safeReturnTo(url.searchParams.get("return_to"), env), expiresAt, new Date(now).toISOString()).run();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", callbackUrl(request, env));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("allow_signup", "false");
  authorize.searchParams.set("prompt", "select_account");
  return Response.redirect(authorize.toString(), 302);
}

async function consumeOAuthState(env, state, now) {
  if (!state) return null;
  return await env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ?
    RETURNING code_verifier, return_to`).bind(await sha256(state), new Date(now).toISOString()).first();
}

async function exchangeGitHubCode(code, verifier, request, env, fetcher) {
  const tokenResponse = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(request, env),
      code_verifier: verifier
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error("github_token_exchange_failed");
  return tokenData.access_token;
}

async function identifyAndRevokeGitHubToken(accessToken, env, fetcher) {
  const userResponse = await fetcher("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "clinical-assistant-staging",
      "X-GitHub-Api-Version": "2026-03-10"
    }
  });
  const profile = await userResponse.json();
  if (!userResponse.ok || !Number.isSafeInteger(profile.id)) throw new Error("github_identity_failed");
  const basic = btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`);
  const revokeResponse = await fetcher(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "User-Agent": "clinical-assistant-staging",
      "X-GitHub-Api-Version": "2026-03-10"
    },
    body: JSON.stringify({ access_token: accessToken })
  });
  if (revokeResponse.status !== 204) throw new Error("github_token_revoke_failed");
  return { id: String(profile.id), login: String(profile.login || "") };
}

async function completeGitHubLogin(request, env, fetcher = fetch, now = Date.now()) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.DB?.prepare) {
    return json({ error: "LOGIN_NOT_CONFIGURED", message: "GitHub 登录尚未配置" }, 503, "", env);
  }
  const url = new URL(request.url);
  const stateRecord = await consumeOAuthState(env, url.searchParams.get("state"), now);
  const code = url.searchParams.get("code") || "";
  if (!stateRecord || !code) return json({ error: "INVALID_OAUTH_STATE", message: "登录请求无效或已过期" }, 400, "", env);
  let accessToken = "";
  try {
    accessToken = await exchangeGitHubCode(code, stateRecord.code_verifier, request, env, fetcher);
    const profile = await identifyAndRevokeGitHubToken(accessToken, env, fetcher);
    if (!allowedGitHubUserIds(env).has(profile.id)) {
      return json({ error: "USER_NOT_ALLOWED", message: "该 GitHub 账号不在测试白名单" }, 403, "", env);
    }
    const token = randomToken();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO user_sessions
      (session_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(await sha256(token), `github:${profile.id}`, expiresAt, issuedAt, issuedAt).run();
    return new Response(null, {
      status: 302,
      headers: { Location: safeReturnTo(stateRecord.return_to, env), "Cache-Control": "no-store", "Set-Cookie": sessionCookie(token) }
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "github_login_failed", error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "LOGIN_FAILED", message: "GitHub 登录失败，请重试" }, 502, "", env);
  }
}

async function logout(request, env, origin) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token && env.DB?.prepare) {
    await env.DB.prepare("DELETE FROM user_sessions WHERE session_hash = ?").bind(await sha256(token)).run();
  }
  return new Response(null, { status: 204, headers: responseHeaders(origin, env, { "Set-Cookie": sessionCookie("", 0) }) });
}

async function readJson(request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { error: { status: 415, code: "JSON_REQUIRED", message: "请求格式必须为 JSON" } };
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_PAYLOAD_BYTES + 2048) return { error: { status: 413, code: "REQUEST_TOO_LARGE", message: "请求内容过大" } };
  try { return { body: await request.json() }; } catch { return { error: { status: 400, code: "INVALID_JSON", message: "JSON 格式无效" } }; }
}

function parseEntityPath(pathname) {
  const match = pathname.match(/^\/api\/v1\/entities\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  let entityId = "";
  try { entityId = cleanEntityId(decodeURIComponent(match[2])); } catch { return null; }
  const entityType = cleanEntityType(match[1]);
  return entityType && entityId ? { entityType, entityId } : null;
}

async function listEntities(request, env, userId, origin) {
  const url = new URL(request.url);
  const entityType = url.searchParams.has("type") ? cleanEntityType(url.searchParams.get("type")) : "";
  if (url.searchParams.has("type") && !entityType) return json({ error: "INVALID_ENTITY_TYPE", message: "数据类型无效" }, 400, origin, env);
  const statement = entityType
    ? env.DB.prepare(`SELECT entity_type, entity_id, payload_json, revision, updated_at FROM user_entities
        WHERE user_id = ? AND entity_type = ? ORDER BY updated_at DESC LIMIT ?`).bind(userId, entityType, MAX_LIST_ROWS)
    : env.DB.prepare(`SELECT entity_type, entity_id, payload_json, revision, updated_at FROM user_entities
        WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).bind(userId, MAX_LIST_ROWS);
  const result = await statement.all();
  const entities = (result.results || []).map((row) => ({ type: row.entity_type, id: row.entity_id, payload: JSON.parse(row.payload_json), revision: row.revision, updatedAt: row.updated_at }));
  return json({ entities, limit: MAX_LIST_ROWS }, 200, origin, env);
}

async function putEntity(request, env, userId, origin, entity) {
  const parsed = await readJson(request);
  if (parsed.error) return json({ error: parsed.error.code, message: parsed.error.message }, parsed.error.status, origin, env);
  const revision = Number(parsed.body?.revision);
  const serialized = payloadText(parsed.body?.payload);
  if (!Number.isSafeInteger(revision) || revision < 0 || !serialized) return json({ error: "INVALID_ENTITY", message: "数据、版本号或大小无效" }, 400, origin, env);
  const now = new Date().toISOString();
  if (revision === 0) {
    try {
      await env.DB.prepare(`INSERT INTO user_entities (user_id, entity_type, entity_id, payload_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(userId, entity.entityType, entity.entityId, serialized, now, now).run();
      return json({ ...entity, payload: parsed.body.payload, revision: 1, updatedAt: now }, 201, origin, env);
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE constraint")) return json({ error: "REVISION_CONFLICT", message: "数据已存在，请先同步最新版本" }, 409, origin, env);
      throw error;
    }
  }
  const result = await env.DB.prepare(`UPDATE user_entities SET payload_json = ?, revision = revision + 1, updated_at = ?
    WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ?`)
    .bind(serialized, now, userId, entity.entityType, entity.entityId, revision).run();
  if (!result.meta?.changes) return json({ error: "REVISION_CONFLICT", message: "数据已变化，请先同步后重试" }, 409, origin, env);
  return json({ ...entity, payload: parsed.body.payload, revision: revision + 1, updatedAt: now }, 200, origin, env);
}

async function deleteEntity(request, env, userId, origin, entity) {
  const revision = Number(request.headers.get("if-match"));
  if (!Number.isSafeInteger(revision) || revision < 1) return json({ error: "REVISION_REQUIRED", message: "删除操作需要有效版本号" }, 428, origin, env);
  const result = await env.DB.prepare(`DELETE FROM user_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ?`)
    .bind(userId, entity.entityType, entity.entityId, revision).run();
  if (!result.meta?.changes) return json({ error: "REVISION_CONFLICT", message: "数据不存在或已变化" }, 409, origin, env);
  return new Response(null, { status: 204, headers: responseHeaders(origin, env) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "ORIGIN_DENIED", message: "不允许的网页来源" }, 403, "", env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin, env, {
      "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, If-Match", "Access-Control-Max-Age": "86400"
    }) });
    try {
      if (request.method === "GET" && url.pathname === "/auth/github/start") return await startGitHubLogin(request, env);
      if (request.method === "GET" && url.pathname === "/auth/github/callback") return await completeGitHubLogin(request, env);
      if (request.method === "POST" && url.pathname === "/auth/logout") return await logout(request, env, origin);
      const user = await authenticatedUser(ctx, request, env);
      if (!user) return json({ error: "ACCESS_REQUIRED", message: "需要登录后访问" }, 403, origin, env);
      if (!env.DB?.prepare) return json({ error: "DATABASE_UNAVAILABLE", message: "个人数据库未配置" }, 503, origin, env);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, authenticated: true, storage: "d1", schemaVersion: 2 }, 200, origin, env);
      if (request.method === "GET" && url.pathname === "/api/v1/me") return json({ userId: user.userId, provider: user.provider, storageScope: `user:${user.userId}` }, 200, origin, env);
      if (request.method === "GET" && url.pathname === "/api/v1/entities") return await listEntities(request, env, user.userId, origin);
      const entity = parseEntityPath(url.pathname);
      if (entity && request.method === "PUT") return await putEntity(request, env, user.userId, origin, entity);
      if (entity && request.method === "DELETE") return await deleteEntity(request, env, user.userId, origin, entity);
      return json({ error: "NOT_FOUND", message: "未找到接口" }, 404, origin, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "user_sync_error", path: url.pathname, method: request.method, error: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "INTERNAL_ERROR", message: "个人数据服务暂不可用" }, 500, origin, env);
    }
  }
};

export { authenticatedUser, cleanEntityId, cleanEntityType, completeGitHubLogin, parseEntityPath, payloadText, sessionCookie, sha256, startGitHubLogin };


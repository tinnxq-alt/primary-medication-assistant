const ENTITY_TYPES = new Set(["favorite", "note", "task", "setting"]);
const MAX_ENTITY_ID_LENGTH = 160;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_LIST_ROWS = 500;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(origin, env, extra)
  });
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

async function authenticatedUser(ctx) {
  if (!ctx?.access) return null;
  const identity = await ctx.access.getIdentity();
  const userId = cleanToken(identity?.user_uuid, 128);
  if (!userId) return null;
  return {
    userId,
    email: typeof identity?.email === "string" ? identity.email : ""
  };
}

async function readJson(request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { error: { status: 415, code: "JSON_REQUIRED", message: "请求格式必须为 JSON" } };
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_PAYLOAD_BYTES + 2048) {
    return { error: { status: 413, code: "REQUEST_TOO_LARGE", message: "请求内容过大" } };
  }
  try {
    return { body: await request.json() };
  } catch {
    return { error: { status: 400, code: "INVALID_JSON", message: "JSON 格式无效" } };
  }
}

function parseEntityPath(pathname) {
  const match = pathname.match(/^\/api\/v1\/entities\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  let entityId = "";
  try {
    entityId = cleanEntityId(decodeURIComponent(match[2]));
  } catch {
    return null;
  }
  const entityType = cleanEntityType(match[1]);
  return entityType && entityId ? { entityType, entityId } : null;
}

async function listEntities(request, env, userId, origin) {
  const url = new URL(request.url);
  const entityType = url.searchParams.has("type") ? cleanEntityType(url.searchParams.get("type")) : "";
  if (url.searchParams.has("type") && !entityType) {
    return json({ error: "INVALID_ENTITY_TYPE", message: "数据类型无效" }, 400, origin, env);
  }
  const statement = entityType
    ? env.DB.prepare(`SELECT entity_type, entity_id, payload_json, revision, updated_at
        FROM user_entities WHERE user_id = ? AND entity_type = ?
        ORDER BY updated_at DESC LIMIT ?`).bind(userId, entityType, MAX_LIST_ROWS)
    : env.DB.prepare(`SELECT entity_type, entity_id, payload_json, revision, updated_at
        FROM user_entities WHERE user_id = ?
        ORDER BY updated_at DESC LIMIT ?`).bind(userId, MAX_LIST_ROWS);
  const result = await statement.all();
  const entities = (result.results || []).map((row) => ({
    type: row.entity_type,
    id: row.entity_id,
    payload: JSON.parse(row.payload_json),
    revision: row.revision,
    updatedAt: row.updated_at
  }));
  return json({ entities, limit: MAX_LIST_ROWS }, 200, origin, env);
}

async function putEntity(request, env, userId, origin, entity) {
  const parsed = await readJson(request);
  if (parsed.error) return json({ error: parsed.error.code, message: parsed.error.message }, parsed.error.status, origin, env);
  const revision = Number(parsed.body?.revision);
  const serialized = payloadText(parsed.body?.payload);
  if (!Number.isSafeInteger(revision) || revision < 0 || !serialized) {
    return json({ error: "INVALID_ENTITY", message: "数据、版本号或大小无效" }, 400, origin, env);
  }
  const now = new Date().toISOString();
  if (revision === 0) {
    try {
      await env.DB.prepare(`INSERT INTO user_entities
        (user_id, entity_type, entity_id, payload_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .bind(userId, entity.entityType, entity.entityId, serialized, now, now)
        .run();
      return json({ ...entity, payload: parsed.body.payload, revision: 1, updatedAt: now }, 201, origin, env);
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE constraint")) {
        return json({ error: "REVISION_CONFLICT", message: "数据已存在，请先同步最新版本" }, 409, origin, env);
      }
      throw error;
    }
  }
  const result = await env.DB.prepare(`UPDATE user_entities
      SET payload_json = ?, revision = revision + 1, updated_at = ?
      WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ?`)
    .bind(serialized, now, userId, entity.entityType, entity.entityId, revision)
    .run();
  if (!result.meta?.changes) {
    return json({ error: "REVISION_CONFLICT", message: "数据已变化，请先同步后重试" }, 409, origin, env);
  }
  return json({ ...entity, payload: parsed.body.payload, revision: revision + 1, updatedAt: now }, 200, origin, env);
}

async function deleteEntity(request, env, userId, origin, entity) {
  const revision = Number(request.headers.get("if-match"));
  if (!Number.isSafeInteger(revision) || revision < 1) {
    return json({ error: "REVISION_REQUIRED", message: "删除操作需要有效版本号" }, 428, origin, env);
  }
  const result = await env.DB.prepare(`DELETE FROM user_entities
      WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ?`)
    .bind(userId, entity.entityType, entity.entityId, revision)
    .run();
  if (!result.meta?.changes) {
    return json({ error: "REVISION_CONFLICT", message: "数据不存在或已变化" }, 409, origin, env);
  }
  return new Response(null, { status: 204, headers: responseHeaders(origin, env) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "ORIGIN_DENIED", message: "不允许的网页来源" }, 403, "", env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: responseHeaders(origin, env, {
          "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, If-Match",
          "Access-Control-Max-Age": "86400"
        })
      });
    }

    const user = await authenticatedUser(ctx);
    if (!user) return json({ error: "ACCESS_REQUIRED", message: "需要登录后访问" }, 403, origin, env);
    if (!env.DB?.prepare) return json({ error: "DATABASE_UNAVAILABLE", message: "个人数据库未配置" }, 503, origin, env);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, authenticated: true, storage: "d1", schemaVersion: 1 }, 200, origin, env);
      }
      if (request.method === "GET" && url.pathname === "/api/v1/me") {
        return json({ userId: user.userId, email: user.email, storageScope: `user:${user.userId}` }, 200, origin, env);
      }
      if (request.method === "GET" && url.pathname === "/api/v1/entities") {
        return await listEntities(request, env, user.userId, origin);
      }
      const entity = parseEntityPath(url.pathname);
      if (entity && request.method === "PUT") return await putEntity(request, env, user.userId, origin, entity);
      if (entity && request.method === "DELETE") return await deleteEntity(request, env, user.userId, origin, entity);
      return json({ error: "NOT_FOUND", message: "未找到接口" }, 404, origin, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "user_sync_error",
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : "unknown"
      }));
      return json({ error: "INTERNAL_ERROR", message: "个人数据服务暂不可用" }, 500, origin, env);
    }
  }
};

export { authenticatedUser, cleanEntityId, cleanEntityType, parseEntityPath, payloadText };


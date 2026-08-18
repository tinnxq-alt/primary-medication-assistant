import {
  canonical39InstructionUrl,
  cleanQuery,
  parseTrustedSource,
  trustedSourceUrl
} from "./index-v8.js";
import { findIndexedSources } from "./free-source-index.js";

const CANDIDATE_LIMIT = 3;
const USER_PASTE_HOSTS = new Set(["ypk.39.net", "yaopinnet.com", "www.yaopinnet.com"]);

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).includes(origin);
}

function json(data, status, origin, env) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin"
  };
  if (origin && isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function normalizeUserSourceUrl(value) {
  const trusted = trustedSourceUrl(value);
  if (!trusted) return "";
  const host = trusted.hostname.toLowerCase();
  if (!USER_PASTE_HOSTS.has(host)) return "";
  return host === "ypk.39.net" ? canonical39InstructionUrl(trusted.href) : trusted.href;
}

function candidateKey(candidate) {
  return [candidate?.drugName, candidate?.specification, candidate?.manufacturer, candidate?.sourceUrl].join("|");
}

async function parseSources(query, sourceUrls, env) {
  const candidates = [];
  const seen = new Set();
  const diagnostics = [];
  let fetchedSourceCount = 0;

  for (const sourceUrl of sourceUrls) {
    if (candidates.length >= CANDIDATE_LIMIT) break;
    try {
      const candidate = await parseTrustedSource(sourceUrl, query, env.BROWSER);
      fetchedSourceCount += 1;
      diagnostics.push({ stage: "source-parse", sourceHost: new URL(sourceUrl).hostname, ok: Boolean(candidate) });
      if (!candidate) continue;
      const key = candidateKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    } catch (error) {
      fetchedSourceCount += 1;
      diagnostics.push({
        stage: "source-parse",
        sourceHost: (() => { try { return new URL(sourceUrl).hostname; } catch { return "invalid"; } })(),
        ok: false,
        error: String(error?.message || error).slice(0, 160)
      });
    }
  }
  return { candidates, fetchedSourceCount, diagnostics };
}

function responsePayload({ query, discovery, sourceUrls, parsed, startedAt, warning }) {
  const hosts = [...new Set(parsed.candidates.map(item => item.sourceHost).filter(Boolean))];
  return {
    query,
    mode: "free-verified",
    discovery,
    candidates: parsed.candidates,
    warnings: parsed.candidates.length ? [] : [warning],
    verificationLinks: parsed.candidates.map(item => ({ title: `原说明书：${item.drugName}`, url: item.sourceUrl })),
    elapsedMs: Date.now() - startedAt,
    searchResultCount: sourceUrls.length,
    fetchedSourceCount: parsed.fetchedSourceCount,
    discoveredSourceHosts: hosts,
    discoveryMethods: [discovery],
    diagnostics: parsed.diagnostics,
    sourcePriority: ["本地可信说明书索引", "用户粘贴的 39药品通/药源网说明书"],
    sourceGrounded: true,
    generatesClinicalKnowledge: false,
    requiresPaidApi: false,
    usesOpenAI: false,
    searchProviderConfigured: false
  };
}

async function readBody(request) {
  try { return await request.json(); }
  catch { return null; }
}

async function handleIndexedSearch(request, env, origin) {
  const startedAt = Date.now();
  const body = await readBody(request);
  if (!body) return json({ error: "请求格式错误" }, 400, origin, env);
  const query = cleanQuery(body.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);

  const indexed = findIndexedSources(query);
  const sourceUrls = indexed.map(item => item.url);
  const parsed = await parseSources(query, sourceUrls, env);
  return json(responsePayload({
    query,
    discovery: "local-source-index-v11",
    sourceUrls,
    parsed,
    startedAt,
    warning: indexed.length
      ? "已命中本地可信说明书索引，但当前来源页未能安全解析。可核对来源页或粘贴另一份可信说明书链接。"
      : "免费说明书索引暂未收录该药。可粘贴 39药品通或药源网的具体说明书链接自动解析；不会调用收费 API，也不会猜测临床资料。"
  }), 200, origin, env);
}

async function handleManualSource(request, env, origin) {
  const startedAt = Date.now();
  const body = await readBody(request);
  if (!body) return json({ error: "请求格式错误" }, 400, origin, env);
  const query = cleanQuery(body.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);
  const sourceUrl = normalizeUserSourceUrl(body.sourceUrl);
  if (!sourceUrl) {
    return json({ error: "仅支持 39药品通或药源网的 HTTPS 具体药品说明书链接" }, 400, origin, env);
  }

  const parsed = await parseSources(query, [sourceUrl], env);
  return json(responsePayload({
    query,
    discovery: "manual-trusted-source-v11",
    sourceUrls: [sourceUrl],
    parsed,
    startedAt,
    warning: "该链接属于可信域名，但未能从页面原文安全提取药名、适应症和用法用量。请确认链接是具体药品说明书页面。"
  }), 200, origin, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "不允许的网页来源" }, 403, "", env);

    if (request.method === "OPTIONS") {
      const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
      };
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        configured: Boolean(env.BROWSER?.quickAction),
        mode: "free-verified",
        discovery: "local-source-index-v11",
        indexEntriesAvailable: true,
        manualTrustedSourceSupported: true,
        requiresPaidApi: false,
        usesOpenAI: false,
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleIndexedSearch(request, env, origin);
    if (request.method === "POST" && url.pathname === "/v1/drugs/parse-source") return handleManualSource(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export {
  handleIndexedSearch,
  handleManualSource,
  normalizeUserSourceUrl,
  parseSources
};

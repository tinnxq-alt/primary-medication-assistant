import {
  canonical39InstructionUrl,
  cleanQuery,
  parseTrustedSource,
  trustedDiscovery,
  trustedSourceUrl
} from "./index-v8.js";
import { findIndexedSources } from "./free-source-index.js";

const CANDIDATE_LIMIT = 3;
const MAX_BODY_BYTES = 4096;
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

function uniqueUrls(values) {
  return [...new Set(values.filter(Boolean))];
}

async function readJsonObject(request, allowedKeys) {
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) return { error: "请求必须使用 application/json" };
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return { error: "请求正文过大" };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { error: "请求正文过大" };
  let value;
  try { value = JSON.parse(text); }
  catch { return { error: "请求格式错误" }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "请求格式错误" };
  const allowed = new Set(allowedKeys);
  for (const [key, field] of Object.entries(value)) {
    if (!allowed.has(key)) return { error: `不支持的请求字段：${key}` };
    if (typeof field !== "string") return { error: `字段 ${key} 必须是字符串` };
  }
  return { value };
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

function responsePayload({ query, discovery, discoveryMethods, sourceUrls, parsed, startedAt, warning }) {
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
    discoveryMethods,
    diagnostics: parsed.diagnostics,
    sourcePriority: ["本地可信说明书索引", "39药品通站内检索", "限定可信域名的联网检索", "用户粘贴的可信说明书"],
    sourceGrounded: true,
    generatesClinicalKnowledge: false,
    requiresPaidApi: false,
    usesOpenAI: false,
    searchProviderConfigured: Boolean(discoveryMethods.some(method => method !== "local-source-index"))
  };
}

async function handleSearch(request, env, origin) {
  const startedAt = Date.now();
  const body = await readJsonObject(request, ["query"]);
  if (body.error) return json({ error: body.error }, 400, origin, env);
  const query = cleanQuery(body.value.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);

  const indexed = findIndexedSources(query);
  let sourceUrls = indexed.map(item => item.url);
  let parsed = sourceUrls.length
    ? await parseSources(query, sourceUrls, env)
    : { candidates: [], fetchedSourceCount: 0, diagnostics: [] };
  let discovery = "local-source-index-v12";
  let discoveryMethods = indexed.length ? ["local-source-index"] : [];

  if (!parsed.candidates.length) {
    try {
      const online = await trustedDiscovery(query, env.BROWSER);
      const onlineUrls = uniqueUrls(online.links.filter(url => !sourceUrls.includes(url)));
      const onlineParsed = onlineUrls.length
        ? await parseSources(query, onlineUrls, env)
        : { candidates: [], fetchedSourceCount: 0, diagnostics: [] };
      sourceUrls = uniqueUrls([...sourceUrls, ...online.links]);
      parsed = {
        candidates: onlineParsed.candidates,
        fetchedSourceCount: parsed.fetchedSourceCount + onlineParsed.fetchedSourceCount,
        diagnostics: [...parsed.diagnostics, ...onlineParsed.diagnostics]
      };
      discovery = "trusted-online-discovery-v12";
      discoveryMethods = uniqueUrls([...discoveryMethods, ...online.methods]);
    } catch (error) {
      parsed.diagnostics.push({ stage: "trusted-online-discovery", ok: false, error: String(error?.message || error).slice(0, 160) });
      discovery = "trusted-online-discovery-v12";
    }
  }

  return json(responsePayload({
    query,
    discovery,
    discoveryMethods,
    sourceUrls,
    parsed,
    startedAt,
    warning: "暂未从可信说明书网页安全提取到完整候选。请补充完整药名后重试，或粘贴 39药品通/药源网的具体说明书链接；系统不会猜测临床字段。"
  }), 200, origin, env);
}

async function handleManualSource(request, env, origin) {
  const startedAt = Date.now();
  const body = await readJsonObject(request, ["query", "sourceUrl"]);
  if (body.error) return json({ error: body.error }, 400, origin, env);
  const query = cleanQuery(body.value.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);
  const sourceUrl = normalizeUserSourceUrl(body.value.sourceUrl);
  if (!sourceUrl) return json({ error: "仅支持 39药品通或药源网的 HTTPS 具体药品说明书链接" }, 400, origin, env);

  const parsed = await parseSources(query, [sourceUrl], env);
  return json(responsePayload({
    query,
    discovery: "manual-trusted-source-v12",
    discoveryMethods: ["manual-trusted-source"],
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
        discovery: "hybrid-source-discovery-v12",
        indexEntriesAvailable: true,
        trustedOnlineDiscoverySupported: true,
        manualTrustedSourceSupported: true,
        requiresPaidApi: false,
        usesOpenAI: false,
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    if (request.method === "POST" && url.pathname === "/v1/drugs/parse-source") return handleManualSource(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export { handleManualSource, handleSearch, normalizeUserSourceUrl, parseSources, readJsonObject };

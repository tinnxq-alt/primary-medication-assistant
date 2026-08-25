import {
  canonical39InstructionUrl,
  cleanQuery,
  parseTrustedSource,
  trustedDiscovery,
  trustedSourceUrl
} from "./index-v8.js";
import { fetchSourcePage, parseInstructionPage } from "./index-v3.js";
import { findIndexedSources } from "./free-source-index.js";

const CANDIDATE_LIMIT = 3;
const SOURCE_PARSE_ATTEMPT_LIMIT = 5;
const MAX_BODY_BYTES = 4096;
const SEARCH_CACHE_SECONDS = 6 * 60 * 60;
const SEARCH_CACHE_SCHEMA = "source-grounded-parallel-cache-v1";
const USER_PASTE_HOSTS = new Set(["ypk.39.net", "yaopinnet.com", "www.yaopinnet.com"]);
const DRUG_CATEGORIES = new Set(["西药", "中成药"]);

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
  return [candidate?.drugName, candidate?.specification, candidate?.manufacturer].join("|");
}

function uniqueUrls(values) {
  return [...new Set(values.filter(Boolean))];
}

function drugCategoryFromCandidate(candidate) {
  const legacyCategory = String(candidate?.category || "").trim();
  if (DRUG_CATEGORIES.has(legacyCategory)) return legacyCategory;
  const approvalNumber = String(candidate?.approvalNumber || "").trim().toUpperCase();
  const sourceUrl = String(candidate?.sourceUrl || "").trim().toLowerCase();
  const text = `${candidate?.drugName || ""} ${candidate?.clinical?.indication || ""}`;
  if (/国药准字\s*Z/i.test(approvalNumber) || /\/zhongyao\//.test(sourceUrl) || legacyCategory === "中成药") return "中成药";
  if (/国药准字\s*[A-Y]/i.test(approvalNumber) || /\/huayao\//.test(sourceUrl)) return "西药";
  if (/清热解毒|活血化瘀|益气|补肾|疏肝|健脾|通络|祛风|养血|滋阴|温阳|扶正|散寒/.test(text)) return "中成药";
  return "西药";
}

function therapeuticClassFromCandidate(candidate, category) {
  const legacyClass = String(candidate?.therapeuticClass || candidate?.category || "").trim();
  if (legacyClass && !DRUG_CATEGORIES.has(legacyClass) && !["其他", "未分类", "作用待分类"].includes(legacyClass)) return legacyClass;
  const text = `${candidate?.drugName || ""} ${candidate?.clinical?.indication || ""}`;
  if (category === "中成药") {
    if (/骨伤|跌打|扭伤|风湿|关节|筋骨/.test(text)) return "骨伤科用药";
    if (/眼|结膜|角膜/.test(text)) return "眼科用药（中）";
    if (/口腔|咽|喉|鼻/.test(text)) return "耳鼻喉/口腔用药";
    if (/皮肤|湿疹|瘙痒|疮|癣/.test(text)) return "外科用药（中）";
    return "内科用药（中）";
  }
  if (/氯米帕明|米氮平|舍曲林|帕罗西汀|氟西汀|西酞普兰|文拉法辛|度洛西汀|曲唑酮|阿戈美拉汀|抑郁症|强迫症/.test(text)) return "抗抑郁药";
  return "作用待分类";
}

function normalizeCandidateClassification(candidate) {
  const category = drugCategoryFromCandidate(candidate);
  return {
    ...candidate,
    category,
    therapeuticClass: therapeuticClassFromCandidate(candidate, category)
  };
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

  const attemptedUrls = sourceUrls.slice(0, SOURCE_PARSE_ATTEMPT_LIMIT);
  const directResults = await Promise.all(attemptedUrls.map(async sourceUrl => {
    try {
      const page = await fetchSourcePage(sourceUrl, trustedSourceUrl);
      const candidate = parseInstructionPage(page, query);
      return {
        sourceUrl,
        candidate,
        diagnostic: { stage: "trusted-direct-fetch", sourceHost: new URL(page.url).hostname, ok: Boolean(candidate) }
      };
    } catch (error) {
      return {
        sourceUrl,
        candidate: null,
        diagnostic: {
          stage: "trusted-direct-fetch",
          sourceHost: (() => { try { return new URL(sourceUrl).hostname; } catch { return "invalid"; } })(),
          ok: false,
          error: String(error?.message || error).slice(0, 160)
        }
      };
    }
  }));

  fetchedSourceCount = attemptedUrls.length;
  diagnostics.push(...directResults.map(result => result.diagnostic));

  for (const result of directResults) {
    if (candidates.length >= CANDIDATE_LIMIT) break;
    const { sourceUrl } = result;
    let candidate = result.candidate;
    if (!candidate) {
      try {
        candidate = await parseTrustedSource(sourceUrl, query, env.BROWSER);
        diagnostics.push({ stage: "browser-source-parse", sourceHost: new URL(sourceUrl).hostname, ok: Boolean(candidate) });
      } catch (error) {
        const message = String(error?.message || error).slice(0, 160);
        diagnostics.push({
          stage: "browser-source-parse",
          sourceHost: (() => { try { return new URL(sourceUrl).hostname; } catch { return "invalid"; } })(),
          ok: false,
          error: message
        });
        if (/BROWSER_CONTENT_429|rate limit/i.test(message)) break;
        continue;
      }
    }
    if (!candidate) continue;
    candidate = normalizeCandidateClassification(candidate);
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, fetchedSourceCount, diagnostics };
}

function searchCacheRequest(query) {
  const key = encodeURIComponent(cleanQuery(query));
  return new Request(`https://worker-cache.invalid/drug-search/${SEARCH_CACHE_SCHEMA}?query=${key}`);
}

async function readSearchCache(query) {
  const cache = globalThis.caches?.default;
  if (!cache) return null;
  const response = await cache.match(searchCacheRequest(query));
  if (!response) return null;
  try {
    const payload = await response.json();
    return payload && Array.isArray(payload.candidates) ? payload : null;
  } catch {
    return null;
  }
}

async function writeSearchCache(query, payload, ctx) {
  const cache = globalThis.caches?.default;
  if (!cache || !payload.candidates?.length) return;
  const write = cache.put(searchCacheRequest(query), new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${SEARCH_CACHE_SECONDS}`
    }
  })).catch(error => {
    console.error(JSON.stringify({ message: "drug search cache write failed", error: String(error?.message || error).slice(0, 160) }));
  });
  if (ctx?.waitUntil) {
    ctx.waitUntil(write);
    return;
  }
  await write;
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
    cacheStatus: "miss",
    searchOptimization: SEARCH_CACHE_SCHEMA,
    classificationSchema: "separate-category-therapeutic-class-v1",
    sourcePriority: ["本地可信说明书索引", "39药品通站内检索", "限定可信域名的联网检索", "用户粘贴的可信说明书"],
    sourceGrounded: true,
    generatesClinicalKnowledge: false,
    requiresPaidApi: false,
    usesOpenAI: false,
    searchProviderConfigured: Boolean(discoveryMethods.some(method => method !== "local-source-index"))
  };
}

async function handleSearch(request, env, origin, ctx) {
  const startedAt = Date.now();
  const body = await readJsonObject(request, ["query"]);
  if (body.error) return json({ error: body.error }, 400, origin, env);
  const query = cleanQuery(body.value.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);

  const cached = await readSearchCache(query);
  if (cached) {
    return json({ ...cached, elapsedMs: Date.now() - startedAt, cacheStatus: "hit" }, 200, origin, env);
  }

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

  const payload = responsePayload({
    query,
    discovery,
    discoveryMethods,
    sourceUrls,
    parsed,
    startedAt,
    warning: "暂未从可信说明书网页安全提取到完整候选。请补充完整药名后重试，或粘贴 39药品通/药源网的具体说明书链接；系统不会猜测临床字段。"
  });
  await writeSearchCache(query, payload, ctx);
  return json(payload, 200, origin, env);
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
  async fetch(request, env, ctx) {
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
        classificationSchema: "separate-category-therapeutic-class-v1",
        searchOptimization: SEARCH_CACHE_SCHEMA,
        requiresPaidApi: false,
        usesOpenAI: false,
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin, ctx);
    if (request.method === "POST" && url.pathname === "/v1/drugs/parse-source") return handleManualSource(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export {
  drugCategoryFromCandidate,
  handleManualSource,
  handleSearch,
  normalizeCandidateClassification,
  normalizeUserSourceUrl,
  parseSources,
  readJsonObject,
  readSearchCache,
  searchCacheRequest,
  therapeuticClassFromCandidate
};

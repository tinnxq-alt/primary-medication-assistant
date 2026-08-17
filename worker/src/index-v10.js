import { canonical39InstructionUrl, cleanQuery, parseTrustedSource, trustedSourceUrl } from "./index-v8.js";
import workerV9 from "./index-v9.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_ALLOWED_DOMAINS = ["ypk.39.net", "yaopinnet.com"];
const SOURCE_LIMIT = 6;
const CANDIDATE_LIMIT = 3;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean);
}
function isAllowedOrigin(origin, env) { return !origin || allowedOrigins(env).includes(origin); }
function json(data, status, origin, env) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  if (origin && isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}
function hostMatches(hostname, allowedDomain) {
  const host = String(hostname || "").toLowerCase();
  const allowed = String(allowedDomain || "").toLowerCase();
  return host === allowed || host.endsWith(`.${allowed}`);
}
function normalizeSearchSource(value) {
  const trusted = trustedSourceUrl(value);
  if (!trusted) return "";
  if (!OPENAI_ALLOWED_DOMAINS.some(domain => hostMatches(trusted.hostname, domain))) return "";
  if (/^\/(?:search|AllCategory)(?:\/|$)/i.test(trusted.pathname)) return "";
  if (/\/(?:buy|comment|tuji|news|ask|compare)\//i.test(trusted.pathname)) return "";
  if (trusted.hostname.toLowerCase() === "ypk.39.net") return canonical39InstructionUrl(trusted.href);
  return trusted.href;
}
function uniqueSources(values) {
  const seen = new Set(); const result = [];
  for (const value of values) {
    const normalized = normalizeSearchSource(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized); result.push(normalized);
    if (result.length >= SOURCE_LIMIT) break;
  }
  return result;
}
function collectOpenAIWebSources(payload) {
  const urls = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type === "web_search_call") {
      const action = item.action || {};
      if (typeof action.url === "string") urls.push(action.url);
      for (const source of Array.isArray(action.sources) ? action.sources : []) if (typeof source?.url === "string") urls.push(source.url);
    }
    if (item?.type === "message") {
      for (const part of Array.isArray(item.content) ? item.content : []) {
        for (const annotation of Array.isArray(part?.annotations) ? part.annotations : []) {
          if (typeof annotation?.url === "string") urls.push(annotation.url);
          if (typeof annotation?.url_citation?.url === "string") urls.push(annotation.url_citation.url);
        }
      }
    }
  }
  return uniqueSources(urls);
}
function openAIWebSearchRequest(query, env) {
  return {
    model: String(env.OPENAI_SEARCH_MODEL || "gpt-5-mini"),
    store: false,
    max_output_tokens: 220,
    tools: [{ type: "web_search", filters: { allowed_domains: OPENAI_ALLOWED_DOMAINS }, search_context_size: "low" }],
    input: [
      { role: "system", content: [{ type: "input_text", text: "你只负责检索真实药品说明书网页，不负责生成医学知识。必须使用 web_search。只寻找与用户药名片段直接相关的具体药品说明书或药品详情页面，优先详细说明书。不要根据药名编写适应症、用法用量、不良反应或注意事项；这些字段由后续程序从来源网页原文解析。" }] },
      { role: "user", content: [{ type: "input_text", text: `检索药名片段“${query}”对应的药品说明书候选。请搜索具体药品页面，尤其是39药品通和药源网。只需要完成网页检索并引用最相关的具体药品页面。` }] }
    ]
  };
}
async function discoverWithOpenAI(query, env) {
  if (!env.OPENAI_API_KEY) return { configured: false, sources: [], diagnostics: [{ stage: "openai-web-search", configured: false }] };
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(openAIWebSearchRequest(query, env)) });
    const text = await response.text();
    if (!response.ok) return { configured: true, sources: [], diagnostics: [{ stage: "openai-web-search", configured: true, ok: false, status: response.status, error: text.slice(0, 180) }] };
    let payload;
    try { payload = JSON.parse(text); } catch { return { configured: true, sources: [], diagnostics: [{ stage: "openai-web-search", configured: true, ok: false, error: "invalid-json" }] }; }
    const sources = collectOpenAIWebSources(payload);
    const webSearchCalls = (payload.output || []).filter(item => item?.type === "web_search_call").length;
    return { configured: true, sources, diagnostics: [{ stage: "openai-web-search", configured: true, ok: true, responseId: String(payload.id || "").slice(0, 64), webSearchCalls, sourceCount: sources.length }] };
  } catch (error) {
    return { configured: true, sources: [], diagnostics: [{ stage: "openai-web-search", configured: true, ok: false, error: String(error?.name === "AbortError" ? "timeout" : error?.message || error).slice(0, 180) }] };
  } finally { clearTimeout(timer); }
}
async function parseOpenAISources(query, sources, env, diagnostics) {
  const candidates = []; const seen = new Set(); let fetchedSourceCount = 0;
  for (const sourceUrl of sources) {
    if (candidates.length >= CANDIDATE_LIMIT) break;
    try {
      const candidate = await parseTrustedSource(sourceUrl, query, env.BROWSER); fetchedSourceCount += 1;
      diagnostics.push({ stage: "source-parse", sourceHost: new URL(sourceUrl).hostname, ok: Boolean(candidate) });
      if (!candidate) continue;
      const key = `${candidate.drugName}|${candidate.specification}|${candidate.manufacturer}|${candidate.sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key); candidates.push(candidate);
    } catch (error) {
      fetchedSourceCount += 1;
      diagnostics.push({ stage: "source-parse", sourceHost: new URL(sourceUrl).hostname, ok: false, error: String(error?.message || error).slice(0, 140) });
    }
  }
  return { candidates, fetchedSourceCount };
}
async function handleOpenAISearch(request, env, origin) {
  const startedAt = Date.now(); let body;
  try { body = await request.json(); } catch { return json({ error: "请求格式错误" }, 400, origin, env); }
  const query = cleanQuery(body?.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);
  const discovery = await discoverWithOpenAI(query, env);
  if (!discovery.configured) return null;
  const diagnostics = [...discovery.diagnostics];
  const parsed = await parseOpenAISources(query, discovery.sources, env, diagnostics);
  const hosts = [...new Set(parsed.candidates.map(item => item.sourceHost).filter(Boolean))];
  return json({ query, mode: "web-instruction-source-extraction-v3", discovery: "openai-web-search-source-v10", candidates: parsed.candidates, warnings: parsed.candidates.length ? [] : ["Web Search 未找到可从原说明书安全解析的候选。不会用模型知识猜测补写临床资料。"], verificationLinks: parsed.candidates.map(item => ({ title: `原说明书：${item.drugName}`, url: item.sourceUrl })), elapsedMs: Date.now() - startedAt, searchResultCount: discovery.sources.length, fetchedSourceCount: parsed.fetchedSourceCount, discoveredSourceHosts: hosts, discoveryMethods: ["openai-responses-web-search"], diagnostics, sourcePriority: ["39药品通", "药源网"], sourceGrounded: true, generatesClinicalKnowledge: false, searchProviderConfigured: true }, 200, origin, env);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url); const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "不允许的网页来源" }, 403, "", env);
    if (request.method === "OPTIONS") {
      const headers = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      return new Response(null, { status: 204, headers });
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, configured: Boolean(env.BROWSER?.quickAction), mode: "web-instruction-source-extraction-v3", discovery: env.OPENAI_API_KEY ? "openai-web-search-source-v10" : "browser-site-restricted-source-v9", searchProviderConfigured: Boolean(env.OPENAI_API_KEY), searchProvider: env.OPENAI_API_KEY ? "openai-web-search" : "browser-fallback", sourceGrounded: true, generatesClinicalKnowledge: false }, 200, origin, env);
    if (request.method === "POST" && url.pathname === "/v1/drugs/search" && env.OPENAI_API_KEY) {
      const response = await handleOpenAISearch(request, env, origin); if (response) return response;
    }
    return workerV9.fetch(request, env);
  }
};
export { collectOpenAIWebSources, discoverWithOpenAI, hostMatches, normalizeSearchSource, openAIWebSearchRequest, parseOpenAISources, uniqueSources };

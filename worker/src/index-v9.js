import { unwrapBingUrl } from "./index-v3.js";
import {
  canonical39InstructionUrl,
  cleanQuery,
  parseTrustedSource,
  trustedSourceUrl
} from "./index-v8.js";

const CANDIDATE_LIMIT = 3;
const SEARCH_LINK_LIMIT = 6;
const SEARCH_HOSTS = ["ypk.39.net", "yaopinnet.com"];

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

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hostMatches(hostname, wantedHost) {
  const host = String(hostname || "").toLowerCase();
  const wanted = String(wantedHost || "").toLowerCase();
  return host === wanted || host.endsWith(`.${wanted}`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSearchTarget(rawHref, searchUrl) {
  let resolved;
  try {
    resolved = new URL(decodeEntities(rawHref), searchUrl);
  } catch {
    return "";
  }
  let target = resolved.href;
  if (hostMatches(resolved.hostname, "bing.com")) {
    const unwrapped = unwrapBingUrl(target);
    if (unwrapped) target = unwrapped;
  }
  try {
    return new URL(target).href;
  } catch {
    return "";
  }
}

function normalizeTrustedSearchResult(value, wantedHost) {
  const trusted = trustedSourceUrl(value);
  if (!trusted || !hostMatches(trusted.hostname, wantedHost)) return "";
  const path = trusted.pathname;
  if (/^\/(search|AllCategory)(\/|$)/i.test(path)) return "";
  if (/\/(buy|comment|tuji|news|ask|compare)\//i.test(path)) return "";
  if (wantedHost === "ypk.39.net") return canonical39InstructionUrl(trusted.href);
  return trusted.href;
}

function extractTrustedLinksFromSearchHtml(html, searchUrl, wantedHost) {
  const links = [];
  const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html || "")))) {
    const rawHref = match[1] || match[2] || match[3] || "";
    const target = normalizeSearchTarget(rawHref, searchUrl);
    const kept = normalizeTrustedSearchResult(target, wantedHost);
    if (kept) links.push(kept);
    if (unique(links).length >= SEARCH_LINK_LIMIT) break;
  }

  const literalRe = /https:\/\/[^\s"'<>]+/gi;
  for (const literal of String(html || "").match(literalRe) || []) {
    const kept = normalizeTrustedSearchResult(decodeEntities(literal), wantedHost);
    if (kept) links.push(kept);
    if (unique(links).length >= SEARCH_LINK_LIMIT) break;
  }
  return unique(links).slice(0, SEARCH_LINK_LIMIT);
}

async function browserContent(browser, url, timeout = 15000) {
  if (!browser?.quickAction) throw new Error("BROWSER_BINDING_MISSING");
  const response = await browser.quickAction("content", {
    url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout }
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.text()).slice(0, 240); } catch {}
    throw new Error(`BROWSER_CONTENT_${response.status}${detail ? `:${detail}` : ""}`);
  }
  const payload = await response.json();
  if (!payload?.success || typeof payload.result !== "string") throw new Error("BROWSER_CONTENT_INVALID");
  return payload.result;
}

async function browserContentWithRetry(browser, url, diagnostics) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const html = await browserContent(browser, url, attempt === 1 ? 14000 : 17000);
      diagnostics.push({ stage: "browser-content", urlHost: new URL(url).hostname, attempt, ok: true });
      return html;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      diagnostics.push({ stage: "browser-content", urlHost: new URL(url).hostname, attempt, ok: false, error: message.slice(0, 120) });
      if (attempt >= 2 || !/429|timeout|navigation|BROWSER_CONTENT_5\d\d/i.test(message)) throw error;
      await delay(850);
    }
  }
  return "";
}

function siteSearchUrl(query, wantedHost) {
  const q = `site:${wantedHost} ${query} 药品 说明书`;
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", q);
  url.searchParams.set("setlang", "zh-Hans");
  url.searchParams.set("cc", "cn");
  return url.href;
}

async function browserSiteRestrictedSearch(query, wantedHost, browser, diagnostics) {
  const searchUrl = siteSearchUrl(query, wantedHost);
  try {
    const html = await browserContentWithRetry(browser, searchUrl, diagnostics);
    const links = extractTrustedLinksFromSearchHtml(html, searchUrl, wantedHost);
    diagnostics.push({ stage: "site-search", host: wantedHost, links: links.length });
    return { links, searchUrl };
  } catch (error) {
    diagnostics.push({ stage: "site-search", host: wantedHost, links: 0, error: String(error?.message || error).slice(0, 120) });
    return { links: [], searchUrl };
  }
}

async function parseSourceWithRetry(sourceUrl, query, browser, diagnostics) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const candidate = await parseTrustedSource(sourceUrl, query, browser);
      diagnostics.push({ stage: "source-parse", sourceHost: new URL(sourceUrl).hostname, attempt, ok: Boolean(candidate) });
      return candidate;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      diagnostics.push({ stage: "source-parse", sourceHost: new URL(sourceUrl).hostname, attempt, ok: false, error: message.slice(0, 120) });
      if (attempt >= 2 || !/429|timeout|navigation|BROWSER_CONTENT_5\d\d/i.test(message)) return null;
      await delay(900);
    }
  }
  return null;
}

async function discoverAndParse(query, env) {
  const diagnostics = [];
  const candidates = [];
  const seenCandidates = new Set();
  const seenSources = new Set();
  const methods = [];
  let searchResultCount = 0;
  let fetchedSourceCount = 0;

  for (const wantedHost of SEARCH_HOSTS) {
    if (candidates.length >= CANDIDATE_LIMIT) break;
    const found = await browserSiteRestrictedSearch(query, wantedHost, env.BROWSER, diagnostics);
    if (found.links.length) methods.push(`browser-site-search:${wantedHost}`);
    searchResultCount += found.links.length;

    for (const sourceUrl of found.links) {
      if (candidates.length >= CANDIDATE_LIMIT) break;
      if (seenSources.has(sourceUrl)) continue;
      seenSources.add(sourceUrl);
      await delay(220);
      const candidate = await parseSourceWithRetry(sourceUrl, query, env.BROWSER, diagnostics);
      fetchedSourceCount += 1;
      if (!candidate) continue;
      const key = `${candidate.drugName}|${candidate.specification}|${candidate.manufacturer}|${candidate.sourceUrl}`;
      if (seenCandidates.has(key)) continue;
      seenCandidates.add(key);
      candidates.push(candidate);
    }
  }

  return {
    candidates,
    searchResultCount,
    fetchedSourceCount,
    methods,
    diagnostics,
    discoveredSourceHosts: [...new Set(candidates.map(item => item.sourceHost).filter(Boolean))]
  };
}

async function handleSearch(request, env, origin) {
  const startedAt = Date.now();
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "请求格式错误" }, 400, origin, env); }
  const query = cleanQuery(body?.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);

  try {
    const result = await discoverAndParse(query, env);
    return json({
      query,
      mode: "web-instruction-source-extraction-v3",
      discovery: "browser-site-restricted-source-v9",
      candidates: result.candidates,
      warnings: result.candidates.length
        ? []
        : ["暂未从可信医药说明书来源找到可安全自动填充的候选。缺失资料不会由 AI 猜测补写。"],
      verificationLinks: result.candidates.map(item => ({ title: `原说明书：${item.drugName}`, url: item.sourceUrl })),
      elapsedMs: Date.now() - startedAt,
      searchResultCount: result.searchResultCount,
      fetchedSourceCount: result.fetchedSourceCount,
      discoveredSourceHosts: result.discoveredSourceHosts,
      discoveryMethods: result.methods,
      diagnostics: result.diagnostics,
      sourcePriority: ["39药品通", "药源网"],
      sourceGrounded: true,
      generatesClinicalKnowledge: false
    }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "browser site restricted search failed", error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "联网说明书检索暂不可用，请稍后重试" }, 503, origin, env);
  }
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
        mode: "web-instruction-source-extraction-v3",
        discovery: "browser-site-restricted-source-v9",
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export {
  browserSiteRestrictedSearch,
  discoverAndParse,
  extractTrustedLinksFromSearchHtml,
  hostMatches,
  normalizeSearchTarget,
  normalizeTrustedSearchResult,
  siteSearchUrl
};

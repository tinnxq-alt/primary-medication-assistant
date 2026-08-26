import { htmlToText, parseInstructionPage } from "./index-v3.js";
import { bingRssLinks } from "./index-v5.js";

const CANDIDATE_LIMIT = 5;
const SOURCE_LINK_LIMIT = 12;
const TRUSTED_HOSTS = ["ypk.39.net", "yaopinnet.com", "www.yaopinnet.com"];

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

function cleanQuery(value) {
  const query = String(value || "").normalize("NFKC").trim();
  const hanCount = (query.match(/[\u3400-\u9fff]/g) || []).length;
  if (!query || query.length > 60 || hanCount < 2 || /[\r\n\u0000-\u001f]/.test(query)) return "";
  return query;
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

function compact(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]〖〗·•:：,，/\-_]/g, "");
}

function resolveHttpsUrl(value, base = "https://ypk.39.net/") {
  try {
    const url = new URL(decodeEntities(value), base);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function trustedSourceUrl(value) {
  const url = resolveHttpsUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (TRUSTED_HOSTS.includes(host)) return url;
  if (host.endsWith(".nmpa.gov.cn") || host === "nmpa.gov.cn" || host.endsWith(".cde.org.cn") || host === "cde.org.cn") return url;
  return null;
}

function uniqueUrls(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const url = trustedSourceUrl(value);
    if (!url) continue;
    const key = url.href.replace(/#.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function canonical39InstructionUrl(value) {
  const url = resolveHttpsUrl(value, "https://ypk.39.net/");
  if (!url || url.hostname.toLowerCase() !== "ypk.39.net") return url?.href || "";
  if (/\/manual\/?$/i.test(url.pathname)) return url.href;
  const rootId = url.pathname.match(/^\/(\d{5,})\/?$/)?.[1];
  if (rootId) return `https://ypk.39.net/${rootId}/manual/`;
  return url.href;
}

function extract39SearchLinks(html, query) {
  const q = compact(query);
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const href = match[1] || match[2] || match[3] || "";
    const text = stripTags(match[4]);
    const url = resolveHttpsUrl(href, "https://ypk.39.net/");
    if (!url || url.hostname.toLowerCase() !== "ypk.39.net") continue;
    if (!q || !compact(text).includes(q)) continue;
    if (/^\/search\//i.test(url.pathname) || /\/AllCategory/i.test(url.pathname)) continue;
    if (/\/(buy|comment|tuji|news|ask|compare)\//i.test(url.pathname)) continue;
    const looksLikeDrug = /\/manual\/?$/i.test(url.pathname)
      || /^\/\d{5,}\/?$/i.test(url.pathname)
      || /\/(?:tcm|western|drug|medicine)\//i.test(url.pathname)
      || /\d{5,}/.test(url.pathname);
    if (!looksLikeDrug) continue;
    links.push(canonical39InstructionUrl(url.href));
    if (links.length >= SOURCE_LINK_LIMIT) break;
  }
  return uniqueUrls(links);
}

function extract39ManualLink(html, detailUrl) {
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const href = match[1] || match[2] || match[3] || "";
    const text = stripTags(match[4]);
    if (!/详细说明书/.test(text) && !/\/manual\/?(?:[?#].*)?$/i.test(href)) continue;
    const url = resolveHttpsUrl(href, detailUrl);
    if (url?.hostname.toLowerCase() === "ypk.39.net") return url.href;
  }
  return canonical39InstructionUrl(detailUrl);
}

async function renderedHtml(browser, url, timeout = 18000) {
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

async function search39Links(query, browser) {
  const encoded = encodeURIComponent(query);
  const urls = [
    `https://ypk.39.net/search/${encoded}-NULL-b0-ci0-c0-m0-bm0-otc0-fd0-p0`,
    `https://ypk.39.net/search/${encoded}`
  ];
  for (const url of urls) {
    try {
      const html = await renderedHtml(browser, url, 16000);
      const links = extract39SearchLinks(html, query);
      if (links.length) return { links, searchUrl: url, method: "39-site-search" };
    } catch (error) {
      console.error(JSON.stringify({ message: "39 search page unavailable", url, error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  return { links: [], searchUrl: urls[0], method: "39-site-search" };
}

async function siteRestrictedRss(query, host) {
  const q = `site:${host} ${query} 药品 说明书`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&setlang=zh-Hans`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0)",
        Accept: "application/rss+xml,application/xml,text/xml"
      }
    });
    if (!response.ok) return [];
    return uniqueUrls(bingRssLinks(await response.text()).filter(value => {
      try {
        const source = new URL(value);
        return source.hostname.toLowerCase() === host || source.hostname.toLowerCase().endsWith(`.${host}`);
      } catch {
        return false;
      }
    }).map(value => host === "ypk.39.net" ? canonical39InstructionUrl(value) : value));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function trustedDiscovery(query, browser) {
  const [direct, rss39, rssDrugNet] = await Promise.all([
    search39Links(query, browser),
    siteRestrictedRss(query, "ypk.39.net"),
    siteRestrictedRss(query, "yaopinnet.com")
  ]);
  let links = direct.links;
  const methods = direct.links.length ? [direct.method] : [];
  if (rss39.length) methods.push("bing-rss-site-39");
  if (rssDrugNet.length) methods.push("bing-rss-site-yaopinnet");
  links = uniqueUrls([...links, ...rss39, ...rssDrugNet]);

  return { links: links.slice(0, SOURCE_LINK_LIMIT), methods, searchUrl: direct.searchUrl };
}

async function parseTrustedSource(sourceUrl, query, browser) {
  const trusted = trustedSourceUrl(sourceUrl);
  if (!trusted) return null;

  let finalUrl = trusted.href;
  let html = await renderedHtml(browser, finalUrl, 18000);

  if (trusted.hostname.toLowerCase() === "ypk.39.net" && !/\/manual\/?$/i.test(trusted.pathname)) {
    const manualUrl = extract39ManualLink(html, trusted.href);
    if (manualUrl && manualUrl !== trusted.href) {
      finalUrl = manualUrl;
      html = await renderedHtml(browser, finalUrl, 18000);
    }
  }

  const text = htmlToText(html);
  return parseInstructionPage({ url: finalUrl, html, text }, query);
}

async function sourceGroundedCandidates(query, env) {
  const discovery = await trustedDiscovery(query, env.BROWSER);
  const candidates = [];
  const seen = new Set();
  const fetched = [];

  for (const sourceUrl of discovery.links) {
    if (candidates.length >= CANDIDATE_LIMIT) break;
    try {
      const candidate = await parseTrustedSource(sourceUrl, query, env.BROWSER);
      fetched.push(sourceUrl);
      if (!candidate) continue;
      const key = `${candidate.drugName}|${candidate.specification}|${candidate.manufacturer}|${candidate.sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    } catch (error) {
      console.error(JSON.stringify({ message: "trusted instruction page unavailable", sourceUrl, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  return { ...discovery, candidates, fetched };
}

async function handleSearch(request, env, origin) {
  const startedAt = Date.now();
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "请求格式错误" }, 400, origin, env); }
  const query = cleanQuery(body?.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药名片段" }, 400, origin, env);

  try {
    const result = await sourceGroundedCandidates(query, env);
    const hosts = [...new Set(result.candidates.map(item => item.sourceHost).filter(Boolean))];
    return json({
      query,
      mode: "web-instruction-source-extraction-v3",
      discovery: "trusted-source-discovery-v8",
      candidates: result.candidates,
      warnings: result.candidates.length
        ? []
        : ["暂未从可信医药说明书来源找到可安全自动填充的候选。缺失资料不会由 AI 猜测补写。"],
      verificationLinks: result.candidates.map(item => ({ title: `原说明书：${item.drugName}`, url: item.sourceUrl })),
      elapsedMs: Date.now() - startedAt,
      searchResultCount: result.links.length,
      fetchedSourceCount: result.fetched.length,
      discoveredSourceHosts: hosts,
      discoveryMethods: result.methods,
      sourcePriority: ["39药品通", "药源网", "NMPA/CDE"],
      sourceGrounded: true,
      generatesClinicalKnowledge: false
    }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "trusted source search failed", error: error instanceof Error ? error.message : "unknown" }));
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
        discovery: "trusted-source-discovery-v8",
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export {
  canonical39InstructionUrl,
  cleanQuery,
  extract39ManualLink,
  extract39SearchLinks,
  parseTrustedSource,
  siteRestrictedRss,
  sourceGroundedCandidates,
  trustedDiscovery,
  trustedSourceUrl
};

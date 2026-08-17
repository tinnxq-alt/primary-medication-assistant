import fallbackWorker from "./index-v5.js";
import { htmlToText, parseInstructionPage } from "./index-v3.js";
import { search39ManualLinks } from "./index-v6.js";

const DIRECT_MANUAL_LIMIT = 6;

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
    "Vary": "Origin"
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

async function renderedHtml(browser, url, timeout = 18000) {
  if (!browser?.quickAction) throw new Error("BROWSER_BINDING_MISSING");
  const response = await browser.quickAction("content", {
    url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout }
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.text()).slice(0, 300); } catch {}
    throw new Error(`BROWSER_CONTENT_${response.status}${detail ? `:${detail}` : ""}`);
  }
  const payload = await response.json();
  if (!payload?.success || typeof payload.result !== "string") throw new Error("BROWSER_CONTENT_INVALID");
  return payload.result;
}

async function rendered39Candidates(query, browser) {
  const searchUrl = `https://ypk.39.net/search/${encodeURIComponent(query)}`;
  const searchHtml = await renderedHtml(browser, searchUrl);
  const manualLinks = search39ManualLinks(searchHtml, query).slice(0, DIRECT_MANUAL_LIMIT);
  if (!manualLinks.length) return { candidates: [], manualLinks: [], searchUrl };

  const settled = await Promise.allSettled(manualLinks.map(async url => {
    const html = await renderedHtml(browser, url, 20000);
    const text = htmlToText(html);
    return parseInstructionPage({ url, html, text }, query);
  }));

  const candidates = [];
  const seen = new Set();
  for (const item of settled) {
    if (item.status !== "fulfilled" || !item.value) continue;
    const candidate = item.value;
    const key = `${candidate.drugName}|${candidate.specification}|${candidate.manufacturer}|${candidate.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= 3) break;
  }
  return { candidates, manualLinks, searchUrl };
}

async function handleDirectSearch(request, env, origin) {
  const startedAt = Date.now();
  let body;
  try { body = await request.json(); }
  catch { return null; }
  const query = cleanQuery(body?.query);
  if (!query) return null;

  try {
    const direct = await rendered39Candidates(query, env.BROWSER);
    if (!direct.candidates.length) return null;
    return json({
      query,
      mode: "web-instruction-source-extraction-v3",
      discovery: "direct-39-browser-content",
      candidates: direct.candidates,
      warnings: [],
      verificationLinks: [],
      elapsedMs: Date.now() - startedAt,
      searchResultCount: direct.manualLinks.length,
      fetchedSourceCount: direct.manualLinks.length,
      discoveredSourceHosts: ["ypk.39.net"]
    }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({
      message: "direct 39 browser retrieval unavailable",
      error: error instanceof Error ? error.message : "unknown"
    }));
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "不允许的网页来源" }, 403, "", env);

    if (request.method === "POST" && url.pathname === "/v1/drugs/search") {
      const direct = await handleDirectSearch(request.clone(), env, origin);
      if (direct) return direct;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        configured: Boolean(env.BROWSER?.quickAction),
        mode: "web-instruction-source-extraction-v3",
        discovery: "direct-medical-browser-first",
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }

    return fallbackWorker.fetch(request, env);
  }
};

export { cleanQuery, rendered39Candidates, renderedHtml };

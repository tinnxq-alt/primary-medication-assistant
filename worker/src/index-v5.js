import workerV3 from "./index-v3.js";

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function hrefFromAttributes(attributes) {
  if (!Array.isArray(attributes)) return "";
  return String(attributes.find(item => item?.name === "href")?.value || "").trim();
}

function normalizeHref(href, baseUrl) {
  if (!href) return "";
  try { return new URL(decodeHtml(href), baseUrl).href; }
  catch { return ""; }
}

function noiseHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return [
    "messenger.com", "facebook.com", "microsoft.com", "live.com", "msn.com",
    "bingparachute.com", "bing.net", "duckduckgo.com"
  ].some(domain => host === domain || host.endsWith(`.${domain}`));
}

function shouldKeepHref(href, text = "") {
  if (!href) return false;
  let url;
  try { url = new URL(href); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (noiseHost(host)) return false;
  if (host === "bing.com" || host.endsWith(".bing.com")) {
    return /\/ck\/a/i.test(url.pathname) || /[?&](u|url|r)=/i.test(`${url.pathname}${url.search}`);
  }
  return Boolean(String(text || "").trim()) || /yaopin|drug|medicine|manual|label|instruction|product/i.test(url.pathname);
}

function uniqueLinks(items) {
  const seen = new Set();
  const links = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    links.push(item);
  }
  return links;
}

function linksFromScrape(payload, baseUrl) {
  const blocks = Array.isArray(payload?.result) ? payload.result : [];
  const anchors = blocks.flatMap(block => Array.isArray(block?.results) ? block.results : []);
  return uniqueLinks(anchors.map(anchor => {
    const href = normalizeHref(hrefFromAttributes(anchor?.attributes), baseUrl);
    return shouldKeepHref(href, anchor?.text) ? href : "";
  }).filter(Boolean));
}

function linksFromHtml(html, baseUrl) {
  const links = [];
  const regex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || "")))) {
    const rawHref = match[1] || match[2] || match[3] || "";
    const text = decodeHtml(String(match[4] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const href = normalizeHref(rawHref, baseUrl);
    if (shouldKeepHref(href, text)) links.push(href);
  }
  return uniqueLinks(links);
}

function unwrapDuckDuckGo(value) {
  try {
    const url = new URL(String(value || ""), "https://html.duckduckgo.com/");
    const host = url.hostname.toLowerCase();
    if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) {
      const uddg = url.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return url.href;
  } catch {
    return "";
  }
}

function duckDuckGoLinks(html) {
  const results = [];
  const regex = /<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(String(html || "")))) {
    const href = unwrapDuckDuckGo(decodeHtml(match[1]));
    if (!href) continue;
    try {
      const url = new URL(href);
      if (url.protocol === "https:" && !noiseHost(url.hostname)) results.push(url.href);
    } catch {}
  }
  return uniqueLinks(results);
}

function bingRssLinks(xml) {
  const results = [];
  const regex = /<item\b[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/gi;
  let match;
  while ((match = regex.exec(String(xml || "")))) {
    const href = decodeHtml(match[1]).trim();
    try {
      const url = new URL(href);
      if (url.protocol === "https:" && !noiseHost(url.hostname)) results.push(url.href);
    } catch {}
  }
  return uniqueLinks(results);
}

function searchQueryFromBingUrl(value) {
  try { return new URL(String(value || "")).searchParams.get("q") || ""; }
  catch { return ""; }
}

function cleanBrowserOptions(input) {
  return {
    url: input?.url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 15000 }
  };
}

async function browserScrapeLinks(browser, input) {
  const response = await browser.quickAction("scrape", {
    ...cleanBrowserOptions(input),
    elements: [{ selector: "a[href]" }]
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return linksFromScrape(payload, input?.url || "https://www.bing.com/");
}

async function browserContentLinks(browser, input) {
  const response = await browser.quickAction("content", cleanBrowserOptions(input));
  if (!response.ok) return [];
  const html = await response.text();
  return linksFromHtml(html, input?.url || "https://www.bing.com/");
}

async function publicSearchFallbacks(input) {
  const query = searchQueryFromBingUrl(input?.url);
  if (!query) return [];
  const links = [];

  try {
    const ddg = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0)", Accept: "text/html" },
      redirect: "follow"
    });
    if (ddg.ok) links.push(...duckDuckGoLinks(await ddg.text()));
  } catch {}

  if (!links.length) {
    try {
      const rssUrl = new URL(input.url);
      rssUrl.searchParams.set("format", "rss");
      const rss = await fetch(rssUrl.href, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0)", Accept: "application/rss+xml,application/xml,text/xml" },
        redirect: "follow"
      });
      if (rss.ok) links.push(...bingRssLinks(await rss.text()));
    } catch {}
  }

  return uniqueLinks(links);
}

function wrappedBrowser(browser) {
  if (!browser?.quickAction) return browser;
  return {
    async quickAction(action, input) {
      if (action !== "links") return browser.quickAction(action, input);

      let links = [];
      try { links = await browserScrapeLinks(browser, input); } catch {}
      if (!links.length) {
        try { links = await browserContentLinks(browser, input); } catch {}
      }
      if (!links.length) links = await publicSearchFallbacks(input);

      return Response.json({ success: true, result: links });
    }
  };
}

export default {
  async fetch(request, env) {
    return workerV3.fetch(request, { ...env, BROWSER: wrappedBrowser(env.BROWSER) });
  }
};

export {
  bingRssLinks,
  duckDuckGoLinks,
  linksFromHtml,
  linksFromScrape,
  publicSearchFallbacks,
  searchQueryFromBingUrl,
  shouldKeepHref,
  unwrapDuckDuckGo
};

import workerV3 from "./index-v3.js";

function hrefFromAttributes(attributes) {
  if (!Array.isArray(attributes)) return "";
  return String(attributes.find(item => item?.name === "href")?.value || "").trim();
}

function normalizeAnchorHref(href, baseUrl) {
  if (!href) return "";
  try { return new URL(href, baseUrl).href; }
  catch { return ""; }
}

function shouldKeepAnchor(href, text = "") {
  if (!href) return false;
  let url;
  try { url = new URL(href); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const noiseHosts = [
    "messenger.com", "facebook.com", "microsoft.com", "live.com", "msn.com",
    "bingparachute.com", "bing.net"
  ];
  if (noiseHosts.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
  if (host === "bing.com" || host.endsWith(".bing.com")) {
    return /\/ck\/a/i.test(url.pathname) || /[?&](u|url|r)=/i.test(`${url.pathname}${url.search}`);
  }
  const label = String(text || "").trim();
  return Boolean(label) || /yaopin|drug|medicine|manual|label|instruction|product/i.test(url.pathname);
}

function linksPayloadFromScrape(payload, baseUrl) {
  const blocks = Array.isArray(payload?.result) ? payload.result : [];
  const anchors = blocks.flatMap(block => Array.isArray(block?.results) ? block.results : []);
  const seen = new Set();
  const links = [];
  for (const anchor of anchors) {
    const href = normalizeAnchorHref(hrefFromAttributes(anchor?.attributes), baseUrl);
    if (!shouldKeepAnchor(href, anchor?.text)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push(href);
  }
  return { success: Boolean(payload?.success), result: links };
}

function wrappedBrowser(browser) {
  if (!browser?.quickAction) return browser;
  return {
    ...browser,
    async quickAction(action, input) {
      if (action !== "links") return browser.quickAction(action, input);
      const response = await browser.quickAction("scrape", {
        ...input,
        visibleLinksOnly: undefined,
        elements: [{ selector: "a[href]" }]
      });
      if (!response.ok) return response;
      const payload = await response.json();
      const transformed = linksPayloadFromScrape(payload, input?.url || "https://www.bing.com/");
      return Response.json(transformed, { status: response.status });
    }
  };
}

export default {
  async fetch(request, env) {
    const nextEnv = { ...env, BROWSER: wrappedBrowser(env.BROWSER) };
    return workerV3.fetch(request, nextEnv);
  }
};

export { hrefFromAttributes, linksPayloadFromScrape, normalizeAnchorHref, shouldKeepAnchor };

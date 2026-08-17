import workerV3 from "./index-v3.js";

const DIRECT_RESULT_LIMIT = 12;

function rawDrugQueryFromSearchUrl(value) {
  try {
    const query = new URL(String(value || "")).searchParams.get("q") || "";
    return query.normalize("NFKC").trim().split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function search39ManualLinks(html, query) {
  const q = String(query || "").normalize("NFKC").replace(/\s+/g, "");
  const links = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html || "")))) {
    const href = decodeEntities(match[1] || match[2] || match[3] || "");
    const text = decodeEntities(String(match[4] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const id = href.match(/(?:https?:\/\/ypk\.39\.net)?\/(\d{5,})\/?(?:[?#].*)?$/i)?.[1];
    if (!id) continue;
    if (q && text && !text.normalize("NFKC").replace(/\s+/g, "").includes(q)) continue;
    const manual = `https://ypk.39.net/${id}/manual/`;
    if (seen.has(manual)) continue;
    seen.add(manual);
    links.push(manual);
    if (links.length >= DIRECT_RESULT_LIMIT) break;
  }
  return links;
}

async function direct39Search(query) {
  if (!query) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://ypk.39.net/search/${encodeURIComponent(query)}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0; +https://tinnxq-alt.github.io/primary-medication-assistant/)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });
    if (!response.ok) return [];
    return search39ManualLinks(await response.text(), query);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function sourceFirstBrowser(browser) {
  return {
    async quickAction(action, input) {
      if (action === "links") {
        const query = rawDrugQueryFromSearchUrl(input?.url);
        const direct = await direct39Search(query);
        if (direct.length) return Response.json({ success: true, result: direct });
      }
      if (browser?.quickAction) return browser.quickAction(action, input);
      return Response.json({ success: true, result: [] });
    }
  };
}

export default {
  async fetch(request, env) {
    return workerV3.fetch(request, { ...env, BROWSER: sourceFirstBrowser(env.BROWSER) });
  }
};

export { direct39Search, rawDrugQueryFromSearchUrl, search39ManualLinks };

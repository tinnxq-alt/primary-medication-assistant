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

function matchingAnchors(html, terms = ["司美", "格鲁肽", "诺和泰"]) {
  const rows = [];
  const re = /<a\b([^>]*?)href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const href = decodeEntities(match[2] || match[3] || match[4] || "");
    const text = stripTags(match[6]);
    const raw = match[0];
    if (!terms.some(term => `${text} ${href} ${raw}`.includes(term))) continue;
    rows.push({ href, text: text.slice(0, 320), html: raw.slice(0, 600) });
    if (rows.length >= 100) break;
  }
  return rows;
}

function querySnippets(html, term) {
  const source = String(html || "");
  const snippets = [];
  let from = 0;
  while (snippets.length < 25) {
    const index = source.indexOf(term, from);
    if (index < 0) break;
    snippets.push(source.slice(Math.max(0, index - 650), Math.min(source.length, index + term.length + 900)).replace(/\s+/g, " "));
    from = index + term.length;
  }
  return snippets;
}

async function fetchHtml(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });
    const html = await response.text();
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => decodeEntities(match[1]));
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      elapsedMs: Date.now() - started,
      htmlLength: html.length,
      title: stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
      containsSiMei: html.includes("司美"),
      containsSemaglutide: html.includes("司美格鲁肽"),
      containsIndication: html.includes("适应症"),
      containsDosage: html.includes("用法用量"),
      matchingAnchors: matchingAnchors(html),
      siMeiSnippets: querySnippets(html, "司美"),
      semaglutideSnippets: querySnippets(html, "司美格鲁肽"),
      candidateHrefs: [...new Set(hrefs.filter(href => /\/\d{4,}|manual|medicine|drug|ypk|tcm/i.test(href)))].slice(0, 150)
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), elapsedMs: Date.now() - started };
  }
}

export default {
  async fetch() {
    const searchUrl = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E";
    const manualUrl = "https://ypk.39.net/2310025/manual/";
    const search = await fetchHtml(searchUrl);
    const manual = await fetchHtml(manualUrl);

    return Response.json({
      generatedAt: new Date().toISOString(),
      searchUrl,
      manualUrl,
      search,
      manual
    }, { headers: { "Cache-Control": "no-store" } });
  }
};

export { matchingAnchors, querySnippets };

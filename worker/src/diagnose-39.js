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

function matchingAnchors(html) {
  const rows = [];
  const re = /<a\b([^>]*?)href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const href = decodeEntities(match[2] || match[3] || match[4] || "");
    const text = stripTags(match[6]);
    const raw = match[0];
    if (!/司美|格鲁肽|诺和泰/i.test(`${text} ${href} ${raw}`)) continue;
    rows.push({ href, text: text.slice(0, 260), html: raw.slice(0, 500) });
    if (rows.length >= 80) break;
  }
  return rows;
}

function querySnippets(html, term) {
  const source = String(html || "");
  const snippets = [];
  let from = 0;
  while (snippets.length < 30) {
    const index = source.indexOf(term, from);
    if (index < 0) break;
    const start = Math.max(0, index - 450);
    const end = Math.min(source.length, index + term.length + 650);
    snippets.push(source.slice(start, end).replace(/\s+/g, " "));
    from = index + term.length;
  }
  return snippets;
}

async function browserContent(browser, url) {
  const response = await browser.quickAction("content", {
    url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 18000 },
    waitForTimeout: 2200
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: text.slice(0, 1500) };
  try {
    const payload = JSON.parse(text);
    const html = typeof payload?.result === "string" ? payload.result : "";
    const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)]
      .map(match => match[0])
      .filter(form => /search|搜索|药品|keyword|key|query/i.test(form))
      .slice(0, 20)
      .map(form => form.slice(0, 1800).replace(/\s+/g, " "));
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => decodeEntities(match[1]));
    return {
      ok: true,
      success: payload?.success,
      htmlLength: html.length,
      title,
      containsQuery: html.includes("司美"),
      matchingAnchors: matchingAnchors(html),
      querySnippets: querySnippets(html, "司美"),
      semaglutideSnippets: querySnippets(html, "司美格鲁肽"),
      novoNordiskSnippets: querySnippets(html, "诺和泰"),
      forms,
      interestingHrefs: [...new Set(hrefs.filter(href => /司美|格鲁肽|manual|drug|med|ypk|tcm|western|medicine/i.test(href)))].slice(0, 120)
    };
  } catch {
    return { ok: false, status: response.status, body: text.slice(0, 1500) };
  }
}

export default {
  async fetch(request, env) {
    if (!env.BROWSER?.quickAction) {
      return Response.json({ error: "browser binding missing" }, { status: 500 });
    }

    const searchUrl = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E";
    const searchContent = await browserContent(env.BROWSER, searchUrl);

    return Response.json({
      generatedAt: new Date().toISOString(),
      searchUrl,
      searchContent
    }, { headers: { "Cache-Control": "no-store" } });
  }
};

export { matchingAnchors, querySnippets };

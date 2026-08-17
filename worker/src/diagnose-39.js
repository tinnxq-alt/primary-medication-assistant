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

function allAnchors(html) {
  const rows = [];
  const re = /<a\b([^>]*?)href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    rows.push({
      href: decodeEntities(match[2] || match[3] || match[4] || ""),
      text: stripTags(match[6]).slice(0, 300),
      html: match[0].slice(0, 700)
    });
    if (rows.length >= 500) break;
  }
  return rows;
}

function snippets(html, term) {
  const source = String(html || "");
  const rows = [];
  let from = 0;
  while (rows.length < 30) {
    const index = source.indexOf(term, from);
    if (index < 0) break;
    rows.push(source.slice(Math.max(0, index - 650), Math.min(source.length, index + term.length + 950)).replace(/\s+/g, " "));
    from = index + term.length;
  }
  return rows;
}

async function content(browser, url) {
  const response = await browser.quickAction("content", {
    url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 15000 },
    waitForTimeout: 1200
  });
  const raw = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: raw.slice(0, 1600) };

  try {
    const payload = JSON.parse(raw);
    const html = typeof payload?.result === "string" ? payload.result : "";
    const anchors = allAnchors(html);
    const queryRelated = anchors.filter(row => /司美|格鲁肽|诺和泰/i.test(`${row.text} ${row.href} ${row.html}`));
    const likelyDrugLinks = anchors.filter(row => {
      const href = String(row.href || "");
      const text = String(row.text || "");
      return /司美|格鲁肽|诺和泰/i.test(text)
        || /\/\d{5,}(?:\/|$|[?#])/.test(href)
        || /\/drug\//i.test(href)
        || /\/medicine\//i.test(href)
        || /\/xiyao\//i.test(href)
        || /\/tcm\//i.test(href);
    });
    return {
      ok: true,
      success: payload?.success,
      htmlLength: html.length,
      title: stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
      containsSiMei: html.includes("司美"),
      containsSemaglutide: html.includes("司美格鲁肽"),
      queryRelated: queryRelated.slice(0, 80),
      likelyDrugLinks: likelyDrugLinks.slice(0, 150),
      siMeiSnippets: snippets(html, "司美"),
      semaglutideSnippets: snippets(html, "司美格鲁肽"),
      novoNordiskSnippets: snippets(html, "诺和泰")
    };
  } catch (error) {
    return { ok: false, status: response.status, error: String(error?.message || error), body: raw.slice(0, 1600) };
  }
}

export default {
  async fetch(request, env) {
    if (!env.BROWSER?.quickAction) return Response.json({ error: "browser binding missing" }, { status: 500 });

    const searchUrl = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E-NULL-b0-ci0-c0-m0-bm0-otc0-fd0-p0";
    const result = await content(env.BROWSER, searchUrl);
    return Response.json({ generatedAt: new Date().toISOString(), searchUrl, result }, {
      headers: { "Cache-Control": "no-store" }
    });
  }
};

export { allAnchors, snippets };

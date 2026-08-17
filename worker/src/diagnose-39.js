function attrs(item) {
  return Object.fromEntries((item?.attributes || []).map(entry => [entry.name, entry.value]));
}

function summarizeScrape(payload) {
  return (payload?.result || []).map(group => ({
    selector: group.selector,
    count: (group.results || []).length,
    rows: (group.results || []).slice(0, 80).map(item => ({
      text: String(item.text || "").slice(0, 240),
      html: String(item.html || "").slice(0, 300),
      attributes: attrs(item)
    }))
  }));
}

async function scrape(browser, url, elements, waitForTimeout = 1800) {
  const response = await browser.quickAction("scrape", {
    url,
    elements: elements.map(selector => ({ selector })),
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 18000 },
    waitForTimeout
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: text.slice(0, 1000) };
  try { return { ok: true, payload: JSON.parse(text) }; }
  catch { return { ok: false, status: response.status, body: text.slice(0, 1000) }; }
}

async function content(browser, url) {
  const response = await browser.quickAction("content", {
    url,
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 18000 },
    waitForTimeout: 2200
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: text.slice(0, 1000) };
  try {
    const payload = JSON.parse(text);
    const html = typeof payload?.result === "string" ? payload.result : "";
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() || "";
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
    const numeric = [...new Set(hrefs.filter(href => /\/(?:\d{5,})(?:\/|$|[?#])/.test(href)))].slice(0, 80);
    return {
      ok: true,
      success: payload?.success,
      htmlLength: html.length,
      title,
      containsQuery: html.includes("司美"),
      numericHrefs: numeric,
      searchHrefs: [...new Set(hrefs.filter(href => href.includes("search")))].slice(0, 40)
    };
  } catch {
    return { ok: false, status: response.status, body: text.slice(0, 1000) };
  }
}

export default {
  async fetch(request, env) {
    if (!env.BROWSER?.quickAction) {
      return Response.json({ error: "browser binding missing" }, { status: 500 });
    }

    const homeUrl = "https://ypk.39.net/";
    const searchUrl = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E";
    const [home, search, searchContent] = await Promise.all([
      scrape(env.BROWSER, homeUrl, ["form", "input", "button", "a[href*='search']"], 1500),
      scrape(env.BROWSER, searchUrl, ["a[href]", "form", "input", "button"], 2500),
      content(env.BROWSER, searchUrl)
    ]);

    const homeSummary = home.ok ? summarizeScrape(home.payload) : home;
    let searchSummary = search;
    if (search.ok) {
      searchSummary = summarizeScrape(search.payload).map(group => ({
        ...group,
        rows: group.selector === "a[href]"
          ? group.rows.filter(row => {
              const href = String(row.attributes?.href || "");
              return row.text.includes("司美") || /\/(?:\d{5,})(?:\/|$|[?#])/.test(href) || href.includes("search");
            }).slice(0, 80)
          : group.rows
      }));
    }

    return Response.json({
      generatedAt: new Date().toISOString(),
      homeUrl,
      searchUrl,
      home: homeSummary,
      search: searchSummary,
      searchContent
    }, { headers: { "Cache-Control": "no-store" } });
  }
};

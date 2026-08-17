const DEFAULT_ORIGINS = "https://tinnxq-alt.github.io,http://localhost:8000,http://127.0.0.1:8000";
const SEARCH_RESULT_LIMIT = 8;
const CANDIDATE_LIMIT = 3;
const SOURCE_TEXT_LIMIT = 120000;

const SECTION_HEADINGS = [
  "药品名称", "通用名称", "商品名称", "英文名称", "汉语拼音", "成份", "性状", "适应症", "功能主治", "规格", "用法用量",
  "不良反应", "禁忌", "注意事项", "孕妇及哺乳期妇女用药", "儿童用药", "老年用药", "药物相互作用", "药物过量",
  "临床试验", "药理毒理", "药代动力学", "贮藏", "包装", "有效期", "执行标准", "批准文号", "上市许可持有人", "生产企业", "生产厂家"
];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(item => item.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).includes(origin);
}

function responseHeaders(origin, env, extra = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...extra
  };
  if (origin && isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, origin, env, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, env, extra) });
}

function cleanQuery(value) {
  const query = String(value || "").normalize("NFKC").trim();
  const hanCount = (query.match(/[\u3400-\u9fff]/g) || []).length;
  if (!query || query.length > 60 || hanCount < 2 || /[\r\n\u0000-\u001f]/.test(query)) return "";
  return query;
}

function normalizeLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]〖〗·•:：,，/\-_]/g, "");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16) || 32));
}

function htmlToText(html) {
  let value = String(html || "");
  value = value.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|section|article|h[1-6]|dl|dt|dd|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  value = decodeEntities(value)
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return value.slice(0, SOURCE_TEXT_LIMIT);
}

function detectCharset(bytes, contentType = "") {
  const header = String(contentType || "").match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || "";
  if (header) return header.toLowerCase();
  const prefix = Array.from(new Uint8Array(bytes).slice(0, 4096), byte => String.fromCharCode(byte)).join("");
  return (prefix.match(/charset\s*=\s*["']?([^;"'\s/>]+)/i)?.[1] || "utf-8").toLowerCase();
}

function decodeBytes(bytes, contentType = "") {
  const raw = detectCharset(bytes, contentType);
  const charset = /gb2312|gbk|gb18030/i.test(raw) ? "gb18030" : /big5/i.test(raw) ? "big5" : "utf-8";
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

function safePublicUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
    if (["metadata.google.internal", "instance-data.ec2.internal"].includes(host)) return null;
    return url;
  } catch {
    return null;
  }
}

function blockedSearchHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return [
    "bing.com", "microsoft.com", "baidu.com", "google.com", "sogou.com", "so.com",
    "zhihu.com", "weibo.com", "douyin.com", "xiaohongshu.com", "bilibili.com",
    "jd.com", "tmall.com", "taobao.com", "1688.com", "smzdm.com"
  ].some(domain => host === domain || host.endsWith(`.${domain}`));
}

function sourceKind(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host.endsWith(".gov.cn") || host === "nmpa.gov.cn" || host.endsWith(".nmpa.gov.cn") || host === "cde.org.cn" || host.endsWith(".cde.org.cn")) return "官方/监管来源";
  if (host === "yaopinnet.com" || host.endsWith(".yaopinnet.com")) return "药品说明书数据库";
  if (host.endsWith(".dxy.cn") || host === "dxy.cn") return "医药数据库";
  return "网页说明书来源";
}

function sourceScore(item) {
  const url = safePublicUrl(item?.url);
  if (!url) return -1000;
  const host = url.hostname.toLowerCase();
  let score = 0;
  if (sourceKind(host) === "官方/监管来源") score += 100;
  else if (sourceKind(host) === "药品说明书数据库") score += 80;
  else if (sourceKind(host) === "医药数据库") score += 65;
  if (/说明书|适应症|用法用量|禁忌|注意事项/.test(`${item.title || ""} ${item.snippet || ""}`)) score += 30;
  if (/药品|制剂|注射液|片|胶囊|颗粒|口服液|乳膏|软膏/.test(item.title || "")) score += 10;
  return score;
}

function attrValue(attributes, name) {
  return Array.isArray(attributes) ? attributes.find(item => item?.name === name)?.value || "" : "";
}

function extractBingResults(payload, query) {
  const blocks = Array.isArray(payload?.result) ? payload.result : [];
  const anchors = blocks.find(item => item?.selector === "li.b_algo h2 a")?.results || [];
  const snippets = blocks.find(item => item?.selector === "li.b_algo .b_caption p")?.results || [];
  const q = normalizeLookup(query);
  const results = anchors.map((anchor, index) => {
    const url = safePublicUrl(attrValue(anchor.attributes, "href"));
    if (!url || blockedSearchHost(url.hostname)) return null;
    const title = decodeEntities(anchor.text || "").trim();
    const snippet = decodeEntities(snippets[index]?.text || "").trim();
    const combined = normalizeLookup(`${title} ${snippet}`);
    const relevance = q && (combined.includes(q) || q.includes(normalizeLookup(title)));
    if (!relevance && q.length >= 3) return null;
    if (!/说明书|适应症|用法用量|药品|规格|批准文号|生产企业/.test(`${title} ${snippet}`)) return null;
    return { title, snippet, url: url.href, host: url.hostname, score: sourceScore({ title, snippet, url: url.href }) };
  }).filter(Boolean);
  results.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return results.filter(item => {
    const key = item.url.replace(/[?#].*$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, SEARCH_RESULT_LIMIT);
}

async function browserSearch(query, env) {
  if (!env.BROWSER?.quickAction) throw new Error("BROWSER_BINDING_MISSING");
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(`${query} 药品说明书 适应症 用法用量`)}&setlang=zh-Hans`;
  const response = await env.BROWSER.quickAction("scrape", {
    url: searchUrl,
    elements: [
      { selector: "li.b_algo h2 a" },
      { selector: "li.b_algo .b_caption p" }
    ],
    rejectResourceTypes: ["image", "media", "font"],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 15000 }
  });
  if (!response.ok) throw new Error(`WEB_SEARCH_${response.status}`);
  const payload = await response.json();
  if (!payload?.success) throw new Error("WEB_SEARCH_FAILED");
  return extractBingResults(payload, query);
}

async function fetchSourcePage(rawUrl) {
  let current = safePublicUrl(rawUrl);
  if (!current) throw new Error("SOURCE_URL_INVALID");
  for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0; +https://tinnxq-alt.github.io/primary-medication-assistant/)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Language": "zh-CN,zh;q=0.9"
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      const next = location ? safePublicUrl(new URL(location, current).href) : null;
      if (!next) throw new Error("SOURCE_REDIRECT_INVALID");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) throw new Error("SOURCE_NOT_TEXT");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 1_500_000) throw new Error("SOURCE_TOO_LARGE");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 1_500_000) throw new Error("SOURCE_TOO_LARGE");
    const html = decodeBytes(bytes, type);
    return { url: current.href, html, text: htmlToText(html) };
  }
  throw new Error("SOURCE_REDIRECT_LIMIT");
}

function lineField(text, labels, maxLength = 300) {
  const labelPattern = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regexes = [
    new RegExp(`(?:^|\\n)\\s*[〖【\\[]?(?:${labelPattern})[〗】\\]]?\\s*[:：]\\s*([^\\n]{1,${maxLength}})`, "i"),
    new RegExp(`[〖【\\[](?:${labelPattern})[〗】\\]]\\s*([^\\n]{1,${maxLength}})`, "i")
  ];
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return match[1].trim().replace(/^[：:、\s]+/, "").slice(0, maxLength);
  }
  return "";
}

function headingRegex(label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*[〖【\\[]?${escaped}[〗】\\]]?\\s*[:：]?\\s*`, "g");
}

function findHeading(text, label, from = 0) {
  const regex = headingRegex(label);
  regex.lastIndex = from;
  const match = regex.exec(text);
  if (match) return { index: match.index + (match[0].startsWith("\n") ? 1 : 0), end: regex.lastIndex };
  const bracketed = [`〖${label}〗`, `【${label}】`, `[${label}]`];
  let best = null;
  for (const token of bracketed) {
    const index = text.indexOf(token, from);
    if (index >= 0 && (!best || index < best.index)) best = { index, end: index + token.length };
  }
  return best;
}

function extractSection(text, startLabels, maxLength = 5000) {
  let start = null;
  for (const label of startLabels) {
    const found = findHeading(text, label, 0);
    if (found && (!start || found.index < start.index)) start = { ...found, label };
  }
  if (!start) return "";
  let end = text.length;
  for (const label of SECTION_HEADINGS) {
    if (startLabels.includes(label)) continue;
    const found = findHeading(text, label, start.end);
    if (found && found.index > start.end && found.index < end) end = found.index;
  }
  return text.slice(start.end, end)
    .replace(/^[：:、\s]+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(match?.[1]?.replace(/<[^>]+>/g, " ") || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function categoryFromDrugName(drugName, indication = "") {
  const text = `${drugName || ""} ${indication || ""}`;
  if (/阿司匹林|氯吡格雷|替格瑞洛|普拉格雷|华法林|利伐沙班|阿哌沙班|依度沙班|达比加群|肝素|依诺肝素/.test(text)) return "抗凝抗血小板";
  if (/胰岛素|二甲双胍|阿卡波糖|伏格列波糖|米格列醇|格列|列净|列汀|格鲁肽|艾塞那肽|利司那肽|替尔泊肽|吡格列酮|罗格列酮|瑞格列奈|那格列奈|2型糖尿病|降血糖/.test(text)) return "降糖药";
  if (/他汀|依折麦布|非诺贝特|苯扎贝特|依洛尤单抗|阿利西尤单抗|高胆固醇血症|血脂/.test(text)) return "调脂药";
  if (/沙坦|普利|地平|美托洛尔|比索洛尔|卡维地洛|拉贝洛尔|阿罗洛尔|氢氯噻嗪|吲达帕胺|多沙唑嗪|特拉唑嗪/.test(text)) return "降压药";
  if (/头孢|西林|霉素|沙星|硝唑|奥司他韦|玛巴洛沙韦|阿昔洛韦|伐昔洛韦|更昔洛韦|替诺福韦|恩替卡韦/.test(text)) return "抗感染药";
  if (/孟鲁司特|氨溴索|溴己新|乙酰半胱氨酸|羧甲司坦|沙丁胺醇|布地奈德|噻托溴铵|福莫特罗|沙美特罗|氨茶碱|茶碱|哮喘|过敏性鼻炎/.test(text)) return "呼吸系统";
  if (/拉唑|莫沙必利|多潘立酮|乳果糖|蒙脱石|洛哌丁胺|铝碳酸镁|熊去氧胆酸|小檗碱|胃食管反流|消化性溃疡/.test(text)) return "消化系统";
  if (/唑仑|唑吡坦|佐匹克隆|氯硝西泮|丙戊酸|普瑞巴林|加巴喷丁|左乙拉西坦|氟桂利嗪/.test(text)) return "神经精神";
  if (/布洛芬|双氯芬|洛索洛芬|吲哚美辛|萘普生|塞来昔布|依托考昔|对乙酰氨基酚|曲马多/.test(text)) return "镇痛抗炎";
  if (/坦索罗辛|非那雄胺|度他雄胺|非布司他|苯溴马隆|呋塞米|螺内酯/.test(text)) return "泌尿系统";
  if (/左甲状腺素|甲巯咪唑|丙硫氧嘧啶|地塞米松|泼尼松|甲泼尼龙|骨化醇/.test(text)) return "内分泌";
  if (/维生素|叶酸|碳酸钙|氯化钾|葡萄糖酸钙|硫酸亚铁/.test(text)) return "维生素矿物质";
  if (/硝酸甘油|单硝酸异山梨酯|硝酸异山梨酯|曲美他嗪|胺碘酮|地高辛/.test(text)) return "心血管";
  if (/乳膏|软膏|凝胶|贴膏|搽剂/.test(text)) return "皮肤外用";
  if (/丸|颗粒|口服液|胶囊/.test(drugName || "") && /中药|中成药|活血|清热|益气|补肾|疏肝/.test(text)) return "中成药";
  return "其他";
}

function queryMatchesCandidate(query, candidate, pageTitle = "") {
  const q = normalizeLookup(query);
  if (!q) return false;
  return [candidate.drugName, candidate.tradeName, pageTitle].some(value => {
    const name = normalizeLookup(value);
    return name && (name.includes(q) || (name.length >= 2 && q.includes(name)));
  });
}

function parseInstructionPage(page, searchResult, query) {
  const text = page.text;
  const pageTitle = titleFromHtml(page.html) || searchResult.title || "";
  const drugName = lineField(text, ["通用名称", "通用名"], 120)
    || lineField(text, ["药品名称"], 120)
    || pageTitle.replace(/[_\-|｜].*$/, "").replace(/说明书.*$/, "").trim();
  const candidate = {
    drugName,
    tradeName: lineField(text, ["商品名称", "商品名"], 120),
    specification: lineField(text, ["规格"], 180),
    manufacturer: lineField(text, ["生产企业", "生产厂家", "生产单位", "上市许可持有人"], 220),
    dosageForm: lineField(text, ["剂型"], 100),
    approvalNumber: lineField(text, ["批准文号"], 120),
    clinical: {
      indication: extractSection(text, ["适应症", "功能主治"]),
      dosage: extractSection(text, ["用法用量"]),
      adverseReactions: extractSection(text, ["不良反应"]),
      precautions: extractSection(text, ["注意事项"])
    }
  };
  if (!candidate.drugName || !candidate.clinical.indication || !candidate.clinical.dosage) return null;
  if (!queryMatchesCandidate(query, candidate, pageTitle)) return null;
  if (candidate.clinical.indication.length < 8 || candidate.clinical.dosage.length < 8) return null;
  const sourceUrl = safePublicUrl(page.url)?.href;
  if (!sourceUrl) return null;
  const host = new URL(sourceUrl).hostname;
  return {
    ...candidate,
    category: categoryFromDrugName(candidate.drugName, candidate.clinical.indication),
    sourceTitle: pageTitle || searchResult.title || `${host} 药品说明书`,
    sourceUrl,
    sourceHost: host,
    sourceQuality: sourceKind(host),
    sourceCheckedAt: new Date().toISOString().slice(0, 10),
    draft: false,
    verified: false,
    editable: true,
    extractionMode: "source-text-only"
  };
}

async function loadInstructionCandidate(result, query) {
  const page = await fetchSourcePage(result.url);
  return parseInstructionPage(page, result, query);
}

async function findInstructionCandidates(query, env) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://primary-medication-cache.invalid/instruction-search?q=${encodeURIComponent(query)}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.json();
  }

  const searchResults = await browserSearch(query, env);
  const settled = await Promise.allSettled(searchResults.map(result => loadInstructionCandidate(result, query)));
  const candidates = [];
  const seen = new Set();
  for (const item of settled) {
    if (item.status !== "fulfilled" || !item.value) continue;
    const candidate = item.value;
    const key = `${normalizeLookup(candidate.drugName)}|${normalizeLookup(candidate.specification)}|${normalizeLookup(candidate.manufacturer)}|${candidate.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= CANDIDATE_LIMIT) break;
  }

  const result = { candidates, searchResultCount: searchResults.length };
  if (cache && candidates.length) {
    await cache.put(cacheKey, new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" }
    }));
  }
  return result;
}

async function readJsonRequest(request, origin, env) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { error: json({ error: "请求格式必须为 JSON" }, 415, origin, env) };
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 4096) return { error: json({ error: "请求内容过大" }, 413, origin, env) };
  try { return { body: await request.json() }; }
  catch { return { error: json({ error: "JSON 格式无效" }, 400, origin, env) }; }
}

async function handleSearch(request, env, origin) {
  const startedAt = Date.now();
  const parsed = await readJsonRequest(request, origin, env);
  if (parsed.error) return parsed.error;
  const query = cleanQuery(parsed.body?.query);
  if (!query) return json({ error: "请输入至少 2 个汉字的药品名称片段" }, 400, origin, env);

  try {
    const result = await findInstructionCandidates(query, env);
    const warnings = [];
    if (!result.candidates.length) warnings.push("未找到同时含药名、适应症和用法用量的可解析说明书网页。请补充药名后重试。不会用 AI 猜测补全。 ");
    return json({
      query,
      mode: "web-instruction-source-extraction",
      candidates: result.candidates,
      warnings,
      verificationLinks: [],
      elapsedMs: Date.now() - startedAt,
      searchResultCount: result.searchResultCount
    }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "instruction web search unavailable", error: error instanceof Error ? error.message : "unknown" }));
    const message = error?.message === "BROWSER_BINDING_MISSING"
      ? "联网说明书检索尚未配置 Browser Run"
      : "联网说明书检索暂不可用，请稍后重试";
    return json({ error: message }, 503, origin, env);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return json({ error: "不允许的网页来源" }, 403, "", env);

    if (request.method === "OPTIONS") {
      const headers = responseHeaders(origin, env);
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type";
      headers["Access-Control-Max-Age"] = "86400";
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        configured: Boolean(env.BROWSER?.quickAction),
        mode: "web-instruction-source-extraction",
        sourceGrounded: true,
        generatesClinicalKnowledge: false
      }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export {
  categoryFromDrugName,
  extractBingResults,
  extractSection,
  htmlToText,
  parseInstructionPage,
  safePublicUrl
};

const DEFAULT_ORIGINS = "https://tinnxq-alt.github.io,http://localhost:8000,http://127.0.0.1:8000";
const DEFAULT_CATALOG_URL = "https://tinnxq-alt.github.io/primary-medication-assistant/chinese-drug-labels.json";
const NMPA_DATABASE_URL = "https://www.nmpa.gov.cn/datasearch/home-index.html#category=yp";
const HAN_RE = /[\u3400-\u9fff]/;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(item => item.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).includes(origin);
}

function responseHeaders(origin, env) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  };
  if (origin && isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, env) });
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    return url.href.replace(/\/+$/, "");
  } catch { return ""; }
}

function normalizeLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, "");
}

function chineseField(value) {
  const text = String(value || "").trim();
  return !text || HAN_RE.test(text) ? text : "";
}

function cleanCatalogCandidate(candidate) {
  if (!candidate || !HAN_RE.test(`${candidate.drugName || ""}${candidate.genericName || ""}`)) return null;
  const sourceUrl = canonicalUrl(candidate.source?.url || candidate.clinical?.source?.url);
  if (!sourceUrl) return null;
  const clinical = {};
  for (const key of ["indication", "dosage", "adverseReactions", "precautions"]) {
    clinical[key] = chineseField(candidate.clinical?.[key]);
  }
  const blocked = candidate.source?.status === "blocked";
  return {
    drugName: chineseField(candidate.drugName),
    genericName: chineseField(candidate.genericName),
    tradeName: chineseField(candidate.tradeName),
    specification: String(candidate.specification || "").trim(),
    dosageForm: chineseField(candidate.dosageForm),
    category: chineseField(candidate.category),
    manufacturer: String(candidate.manufacturer || "").trim(),
    approvalNumber: "",
    clinical,
    confidence: blocked ? "low" : "high",
    sourceQuality: "regulator",
    sourceTitle: chineseField(candidate.source?.label) || "国家药监局中文资料",
    sourceUrl,
    sourceCheckedAt: /^\d{4}-\d{2}-\d{2}$/.test(candidate.source?.checkedAt || "")
      ? candidate.source.checkedAt
      : new Date().toISOString().slice(0, 10)
  };
}

function verificationLinks(query) {
  const allWeb = encodeURIComponent(`${query} 药品说明书 适应症 用法用量 不良反应 注意事项`);
  const nmpaOnly = encodeURIComponent(`site:nmpa.gov.cn ${query} 说明书`);
  return [
    { label: "国家药监局药品查询", url: NMPA_DATABASE_URL, scope: "regulator" },
    { label: "搜索国家药监局中文资料", url: `https://cn.bing.com/search?q=${nmpaOnly}`, scope: "regulator-search" },
    { label: "全网中文搜索（人工核验）", url: `https://cn.bing.com/search?q=${allWeb}`, scope: "web-search" }
  ];
}

async function fetchCatalog(env) {
  const catalogUrl = canonicalUrl(env.CATALOG_URL || DEFAULT_CATALOG_URL);
  if (!catalogUrl) throw new Error("CATALOG_URL_INVALID");
  const response = await fetch(catalogUrl, {
    headers: { Accept: "application/json", "User-Agent": "primary-medication-smart-search/1.0" }
  });
  if (!response.ok) throw new Error(`CATALOG_${response.status}`);
  const payload = await response.json();
  if (payload?.schemaVersion !== 1 || payload.language !== "zh-CN" || !Array.isArray(payload.drugs)) {
    throw new Error("CATALOG_INVALID");
  }
  return payload.drugs;
}

async function handleSearch(request, env, origin) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return json({ error: "请求格式必须为 JSON" }, 415, origin, env);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 4096) return json({ error: "请求内容过大" }, 413, origin, env);
  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON 格式无效" }, 400, origin, env); }
  const query = String(body?.query || "").trim();
  if (!query || query.length > 60 || !HAN_RE.test(query) || /[\r\n\u0000-\u001f]/.test(query)) {
    return json({ error: "请输入 1–60 个字符的中文药品名称" }, 400, origin, env);
  }

  const warnings = ["免费模式不调用收费接口；仅自动填充项目中已核验的国家药监局中文资料，其他结果须打开链接人工核验。"];
  let candidates = [];
  try {
    const q = normalizeLookup(query);
    candidates = (await fetchCatalog(env))
      .filter(item => normalizeLookup(`${item.drugName || ""}${item.genericName || ""}${item.tradeName || ""}`).includes(q))
      .map(cleanCatalogCandidate)
      .filter(Boolean)
      .slice(0, 6);
  } catch (error) {
    console.error(JSON.stringify({ message: "verified catalog unavailable", error: error instanceof Error ? error.message : "unknown" }));
    warnings.push("项目中文核验库暂时无法读取，请使用下方国家药监局或全网搜索入口。");
  }

  return json({
    query,
    mode: "free-verified",
    candidates,
    warnings,
    verificationLinks: verificationLinks(query)
  }, 200, origin, env);
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
      return json({ ok: true, configured: true, mode: "free-verified", requiresPaidApi: false }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export { canonicalUrl, cleanCatalogCandidate, normalizeLookup, verificationLinks };

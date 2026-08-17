const DEFAULT_ORIGINS = "https://tinnxq-alt.github.io,http://localhost:8000,http://127.0.0.1:8000";
const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const HAN_RE = /[\u3400-\u9fff]/;

const CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          drugName: { type: "string" },
          tradeName: { type: "string" }
        },
        required: ["drugName", "tradeName"]
      }
    }
  },
  required: ["candidates"]
};

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

function chineseField(value, maxLength = 100) {
  const text = String(value || "").normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim().slice(0, maxLength);
  return !text || HAN_RE.test(text) ? text : "";
}

function normalizeLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•:：,，/\-_]/g, "");
}

function hanCount(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function cleanQuery(value) {
  const query = String(value || "").normalize("NFKC").trim();
  if (!query || query.length > 60 || hanCount(query) < 2 || /[\r\n\u0000-\u001f]/.test(query)) return "";
  return query;
}

function parseAiResponse(result) {
  const value = result?.response;
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function sourceTitle(model) {
  return `Cloudflare Workers AI · ${model}（仅药名候选，未核验）`;
}

function directlyMatchesFragment(query, drugName, tradeName) {
  const q = normalizeLookup(query);
  if (!q) return false;
  const names = [drugName, tradeName].map(normalizeLookup).filter(Boolean);
  return names.some(name => name.includes(q) || (name.length >= 2 && q.includes(name)));
}

function cleanCandidate(raw, query, model) {
  if (!raw || typeof raw !== "object") return null;
  const drugName = chineseField(raw.drugName);
  const tradeName = chineseField(raw.tradeName);
  if (!drugName || !directlyMatchesFragment(query, drugName, tradeName)) return null;
  return {
    drugName,
    tradeName,
    sourceQuality: "ai-name-candidate",
    sourceTitle: sourceTitle(model),
    sourceUrl: "",
    sourceCheckedAt: new Date().toISOString().slice(0, 10),
    draft: true,
    verified: false,
    editable: true,
    queryFragment: query
  };
}

async function generateCandidateNames(query, env) {
  if (!env.AI?.run) throw new Error("AI_BINDING_MISSING");
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const result = await env.AI.run(model, {
    messages: [
      {
        role: "system",
        content: "你是中文药品名称片段识别器。用户输入可能只是药品全称的一部分。只返回你有把握的 1–3 个候选，绝对不要为了凑够数量而生成无关药物。候选的通用名或商品名必须与输入片段存在直接字面包含关系。只做药名识别，不生成分类、规格、适应症、用法、不良反应或注意事项。只返回 JSON：顶层字段 candidates，每项仅含 drugName、tradeName；不确定商品名可留空。"
      },
      { role: "user", content: `识别这个药名片段：${JSON.stringify({ query })}` }
    ],
    temperature: 0,
    max_tokens: 220,
    response_format: { type: "json_schema", json_schema: CANDIDATE_SCHEMA }
  });

  const raw = parseAiResponse(result);
  if (!raw || !Array.isArray(raw.candidates)) throw new Error("AI_RESPONSE_INVALID");
  const seen = new Set();
  const candidates = [];
  for (const item of raw.candidates) {
    const candidate = cleanCandidate(item, query, model);
    if (!candidate) continue;
    const key = `${normalizeLookup(candidate.drugName)}|${normalizeLookup(candidate.tradeName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= 3) break;
  }
  return candidates;
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

  const warnings = ["AI 仅用于候选药名识别；分类和临床资料不由 AI 自动生成。"];
  let candidates = [];
  try {
    candidates = await generateCandidateNames(query, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "candidate name generation unavailable", error: error instanceof Error ? error.message : "unknown" }));
    warnings.push("候选生成暂不可用或免费额度已用完，请稍后重试。");
  }

  return json({
    query,
    mode: "safe-name-candidates",
    candidates,
    warnings,
    elapsedMs: Date.now() - startedAt
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
      return json({ ok: true, configured: Boolean(env.AI?.run), mode: "safe-name-candidates", optimized: true, requiresPaidApi: false }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export { directlyMatchesFragment, generateCandidateNames };

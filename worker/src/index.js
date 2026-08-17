const DEFAULT_ORIGINS = "https://tinnxq-alt.github.io,http://localhost:8000,http://127.0.0.1:8000";
const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const HAN_RE = /[\u3400-\u9fff]/;
const CATEGORY_IDS = [
  "心血管", "降压药", "降糖药", "调脂药", "抗凝抗血小板", "抗感染药",
  "呼吸系统", "消化系统", "神经精神", "镇痛抗炎", "泌尿系统", "内分泌",
  "皮肤外用", "维生素矿物质", "中成药", "其他"
];
const IDENTITY_FIELDS = ["drugName", "tradeName", "category", "specification"];
const DETAIL_FIELDS = ["indications", "dosage", "adverseReactions", "precautions"];
const IDENTITY_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    drugName: { type: "string" },
    tradeName: { type: "string" },
    category: { type: "string", enum: CATEGORY_IDS },
    specification: { type: "string" }
  },
  required: IDENTITY_FIELDS
};
const SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: IDENTITY_ITEM_SCHEMA
    }
  },
  required: ["candidates"]
};
const DETAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    indications: { type: "string" },
    dosage: { type: "string" },
    adverseReactions: { type: "string" },
    precautions: { type: "string" }
  },
  required: DETAIL_FIELDS
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

function chineseField(value, maxLength = 1000) {
  const text = String(value || "").normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim().slice(0, maxLength);
  return !text || HAN_RE.test(text) ? text : "";
}

function plainField(value, maxLength = 160) {
  return String(value || "").normalize("NFKC")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, "");
}

function hanCount(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function cleanQuery(value) {
  const query = String(value || "").normalize("NFKC").trim();
  if (!query || query.length > 60 || hanCount(query) < 2 || /[\r\n\u0000-\u001f]/.test(query)) return "";
  return query;
}

function categoryIdFor(category, drugName = "") {
  const value = String(category || "").trim();
  if (CATEGORY_IDS.includes(value)) return value;
  const text = `${drugName}${value}`;
  if (/中成|丸|口服液|合剂/.test(text) && !/注射液/.test(text)) return "中成药";
  if (/阿司匹林|氯吡格雷|利伐沙班|抗凝|抗血小板/.test(text)) return "抗凝抗血小板";
  if (/胰岛素|二甲双胍|阿卡波糖|格列|列净|列汀|降糖/.test(text)) return "降糖药";
  if (/他汀|依折麦布|降脂/.test(text)) return "调脂药";
  if (/沙坦|普利|地平|美托洛尔|比索洛尔|多沙唑嗪|降压/.test(text)) return "降压药";
  if (/乳膏|软膏|凝胶|贴膏|外用|滴眼液/.test(text)) return "皮肤外用";
  if (/头孢|霉素|沙星|奥司他韦|玛巴洛沙韦|抗感染|抗菌|抗病毒/.test(text)) return "抗感染药";
  if (/氨酚|伪麻|止咳|祛痰|羧甲司坦|溴己新|乙酰半胱氨酸|宣肺/.test(text)) return "呼吸系统";
  if (/奥美拉唑|兰索拉唑|凯普拉生|莫沙必利|乳果糖|铝碳酸镁|开塞露|麻仁|洛哌丁胺|小檗碱/.test(text)) return "消化系统";
  if (/布洛芬|双氯芬|洛索洛芬|吲哚美辛|萘普生|镇痛|止痛/.test(text)) return "镇痛抗炎";
  if (/唑仑|唑吡坦|佐匹克隆|氯硝西泮|丙戊酸|普瑞巴林|氟桂利嗪|神经|精神/.test(text)) return "神经精神";
  if (/坦索罗辛|非那雄胺|非布司他|苯溴马隆|呋塞米|螺内酯|泌尿/.test(text)) return "泌尿系统";
  if (/左甲状腺素|地塞米松|骨化醇|内分泌/.test(text)) return "内分泌";
  if (/维生素|叶酸|碳酸钙|氯化钾|矿物质/.test(text)) return "维生素矿物质";
  if (/硝酸|救心|心通|心速宁|曲美他嗪|心血管/.test(text)) return "心血管";
  return "其他";
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
  return `Cloudflare Workers AI · ${model}（AI 生成）`;
}

function cleanIdentity(raw, query, model) {
  if (!raw || typeof raw !== "object") return null;
  const drugName = chineseField(raw.drugName, 100);
  if (!drugName) return null;
  return {
    drugName,
    tradeName: chineseField(raw.tradeName, 100),
    category: categoryIdFor(raw.category, drugName),
    specification: plainField(raw.specification),
    sourceQuality: "ai-generated",
    sourceTitle: sourceTitle(model),
    sourceUrl: "",
    sourceCheckedAt: new Date().toISOString().slice(0, 10),
    draft: true,
    verified: false,
    editable: true,
    queryFragment: query
  };
}

async function generateCandidateIdentities(query, env) {
  if (!env.AI?.run) throw new Error("AI_BINDING_MISSING");
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const result = await env.AI.run(model, {
    messages: [
      {
        role: "system",
        content: `你是中文药品名称片段识别器。用户输入可能只是药品全称的一部分、常用简称或连续汉字片段，不要求完整药名。只做候选识别，不生成适应症等临床长文本。一次返回 3 个最可能候选，按匹配概率排序。候选药名或商品名应与输入片段有直接字面关联或属于高度常见、明确的规范补全；不要为了凑数生成无关药。只返回 JSON，顶层字段 candidates；每项只包含 drugName、tradeName、category、specification。category 只能从 ${CATEGORY_IDS.join("、")} 中选择。不确定的商品名或规格留空，不得伪造批准文号、厂家或官方来源。`
      },
      { role: "user", content: `根据这个药名片段返回 3 个候选：${JSON.stringify({ query })}` }
    ],
    temperature: 0.1,
    max_tokens: 420,
    response_format: { type: "json_schema", json_schema: SEARCH_SCHEMA }
  });
  const raw = parseAiResponse(result);
  if (!raw || !Array.isArray(raw.candidates)) throw new Error("AI_RESPONSE_INVALID");
  const seen = new Set();
  const candidates = [];
  for (const item of raw.candidates) {
    const candidate = cleanIdentity(item, query, model);
    if (!candidate) continue;
    const key = `${normalizeLookup(candidate.drugName)}|${normalizeLookup(candidate.tradeName)}|${normalizeLookup(candidate.specification)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= 3) break;
  }
  return candidates;
}

async function generateCandidateDetail(query, candidate, env) {
  if (!env.AI?.run) throw new Error("AI_BINDING_MISSING");
  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const identity = {
    drugName: chineseField(candidate?.drugName, 100),
    tradeName: chineseField(candidate?.tradeName, 100),
    category: categoryIdFor(candidate?.category, candidate?.drugName),
    specification: plainField(candidate?.specification)
  };
  if (!identity.drugName) throw new Error("CANDIDATE_INVALID");
  const result = await env.AI.run(model, {
    messages: [
      {
        role: "system",
        content: "你是中文药品录入资料生成器。用户已经从候选中选定了一个药物。保持给定药物身份，不要改成其他药。只返回 JSON，包含 indications、dosage、adverseReactions、precautions 四个字段。每项用简洁中文说明书风格摘要，尽量控制在 100 个汉字以内。允许不确定，不要求外部核验；不得伪造批准文号、厂家、官方来源或外部链接，不得针对具体患者给出处方建议。"
      },
      { role: "user", content: `为这个已选候选生成可编辑录入资料：${JSON.stringify({ query, candidate: identity })}` }
    ],
    temperature: 0,
    max_tokens: 650,
    response_format: { type: "json_schema", json_schema: DETAIL_SCHEMA }
  });
  const raw = parseAiResponse(result);
  if (!raw) throw new Error("AI_RESPONSE_INVALID");
  const detail = {
    indications: chineseField(raw.indications),
    dosage: chineseField(raw.dosage),
    adverseReactions: chineseField(raw.adverseReactions),
    precautions: chineseField(raw.precautions)
  };
  if (!detail.indications || !detail.dosage) throw new Error("AI_REQUIRED_FIELDS_EMPTY");
  return {
    ...identity,
    ...detail,
    sourceQuality: "ai-generated",
    sourceTitle: sourceTitle(model),
    sourceUrl: "",
    sourceCheckedAt: new Date().toISOString().slice(0, 10),
    draft: true,
    verified: false,
    editable: true
  };
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

  const warnings = ["候选由 Cloudflare Workers AI 根据药名片段生成，并标注 AI 来源。"];
  let candidates = [];
  try {
    candidates = await generateCandidateIdentities(query, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "candidate identity generation unavailable", error: error instanceof Error ? error.message : "unknown" }));
    warnings.push("候选生成暂不可用或免费额度已用完，请稍后重试。");
  }
  return json({
    query,
    mode: "partial-name-fast-candidates",
    candidates,
    warnings,
    elapsedMs: Date.now() - startedAt
  }, 200, origin, env);
}

async function handleDetail(request, env, origin) {
  const startedAt = Date.now();
  const parsed = await readJsonRequest(request, origin, env);
  if (parsed.error) return parsed.error;
  const query = cleanQuery(parsed.body?.query || parsed.body?.candidate?.drugName);
  if (!query) return json({ error: "药名片段无效" }, 400, origin, env);
  if (!parsed.body?.candidate?.drugName || !HAN_RE.test(String(parsed.body.candidate.drugName))) {
    return json({ error: "候选药物无效" }, 400, origin, env);
  }
  try {
    const candidate = await generateCandidateDetail(query, parsed.body.candidate, env);
    return json({
      query,
      mode: "selected-candidate-detail",
      candidate,
      elapsedMs: Date.now() - startedAt
    }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({ message: "candidate detail generation unavailable", error: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "所选药物资料生成暂不可用，请稍后重试" }, 503, origin, env);
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
      return json({ ok: true, configured: Boolean(env.AI?.run), mode: "partial-name-two-stage", optimized: true, requiresPaidApi: false }, 200, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/drugs/search") return handleSearch(request, env, origin);
    if (request.method === "POST" && url.pathname === "/v1/drugs/detail") return handleDetail(request, env, origin);
    return json({ error: "未找到接口" }, 404, origin, env);
  }
};

export { categoryIdFor, generateCandidateDetail, generateCandidateIdentities };

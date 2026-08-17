import assert from "node:assert/strict";
import worker, { categoryIdFor } from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
let aiCalls = 0;
let lastInput = null;
const AI = {
  async run(model, input) {
    aiCalls += 1;
    lastInput = input;
    assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
    assert.equal(input.response_format.type, "json_schema");
    assert.deepEqual(input.response_format.json_schema.required, ["candidates"]);
    assert.equal(input.response_format.json_schema.properties.candidates.minItems, 3);
    assert.equal(input.response_format.json_schema.properties.candidates.maxItems, 5);
    assert.deepEqual(
      [...input.response_format.json_schema.properties.candidates.items.required].sort(),
      ["drugName", "tradeName", "category", "indications", "specification", "dosage", "adverseReactions", "precautions"].sort()
    );
    assert.ok(input.max_tokens <= 1400, "多候选应限制单次输出长度以兼顾速度");
    assert.match(input.messages[0].content, /候选|未核验|来源/);
    return { response: {
      candidates: [
        {
          drugName: "测试新药胶囊",
          tradeName: "测试牌A",
          category: "神经精神",
          specification: "10mg*20粒",
          indications: "用于对应品种说明书所列适应症。",
          dosage: "具体用法用量按该品种资料使用。",
          adverseReactions: "可能发生胃肠道不适等不良反应。",
          precautions: "使用时注意禁忌及特殊人群相关事项。"
        },
        {
          drugName: "测试新药片",
          tradeName: "测试牌B",
          category: "神经精神",
          specification: "10mg*20片",
          indications: "用于对应适应症的药物治疗。",
          dosage: "按对应剂型和规格资料使用。",
          adverseReactions: "可出现头晕、胃肠道不适等反应。",
          precautions: "注意禁忌、相互作用和特殊人群使用。"
        },
        {
          drugName: "测试成分缓释片",
          tradeName: "",
          category: "神经精神",
          specification: "20mg*14片",
          indications: "用于相关适应症的缓释剂型治疗。",
          dosage: "按缓释剂型资料和规格使用。",
          adverseReactions: "可能出现常见药物不良反应。",
          precautions: "缓释制剂使用时注意完整吞服等事项。"
        }
      ]
    } };
  }
};
const env = { ALLOWED_ORIGINS: origin, AI };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "new-drug-ai-candidates", optimized: true, requiresPaidApi: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), env);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "aspirin", newDrugOnly: true, candidateCount: 3 })
}), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), env);
assert.equal(response.status, 403);

const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("多候选快速链路不应下载远程药品核验库");
};
try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "测试新药", newDrugOnly: true, candidateCount: 3 })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "new-drug-ai-candidates");
  assert.equal(payload.candidates.length, 3);
  assert.equal(payload.candidates[0].drugName, "测试新药胶囊");
  assert.equal(payload.candidates[1].drugName, "测试新药片");
  assert.equal(payload.candidates[2].drugName, "测试成分缓释片");
  for (const candidate of payload.candidates) {
    assert.equal(candidate.draft, true);
    assert.equal(candidate.verified, false);
    assert.equal(candidate.editable, true);
    assert.equal(candidate.sourceUrl, "");
    assert.equal(candidate.sourceQuality, "ai-generated");
    assert.match(candidate.sourceTitle, /Cloudflare Workers AI/);
    assert.match(candidate.sourceTitle, /未核验/);
  }
  assert.match(payload.warnings.join(""), /AI|来源|未核验/);
  assert.deepEqual(payload.verificationLinks, []);
  assert.ok(Number.isInteger(payload.elapsedMs) && payload.elapsedMs >= 0);
  assert.equal(aiCalls, 1, "多个候选必须由一次 AI 请求生成");
  assert.ok(lastInput);
} finally {
  globalThis.fetch = realFetch;
}

assert.equal(categoryIdFor("西药", "阿卡波糖片"), "降糖药");
assert.equal(categoryIdFor("西药", "莫匹罗星软膏"), "皮肤外用");

const noAiEnv = { ALLOWED_ORIGINS: origin };
response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "另一测试新药", newDrugOnly: true, candidateCount: 3 })
}), noAiEnv);
assert.equal(response.status, 200);
const noAiPayload = await response.json();
assert.equal(noAiPayload.candidates.length, 0);
assert.match(noAiPayload.warnings.join(""), /额度|暂不可用/);

console.log("Worker multi-candidate fast-path tests passed");
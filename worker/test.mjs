import assert from "node:assert/strict";
import worker, { categoryIdFor } from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
let aiCalls = 0;
let searchCalls = 0;
let detailCalls = 0;
const AI = {
  async run(model, input) {
    aiCalls += 1;
    assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
    assert.equal(input.response_format.type, "json_schema");
    const schema = input.response_format.json_schema;
    if (schema.required.includes("candidates")) {
      searchCalls += 1;
      assert.equal(schema.properties.candidates.minItems, 3);
      assert.equal(schema.properties.candidates.maxItems, 3);
      assert.deepEqual(
        [...schema.properties.candidates.items.required].sort(),
        ["drugName", "tradeName", "category", "specification"].sort()
      );
      assert.ok(input.max_tokens <= 420, "候选阶段只生成短字段以提高速度");
      assert.match(input.messages[0].content, /片段|不要求完整药名/);
      return { response: {
        candidates: [
          { drugName: "测试新药胶囊", tradeName: "测试牌A", category: "神经精神", specification: "10mg*20粒" },
          { drugName: "测试新药片", tradeName: "测试牌B", category: "神经精神", specification: "10mg*20片" },
          { drugName: "测试成分缓释片", tradeName: "", category: "神经精神", specification: "20mg*14片" }
        ]
      } };
    }

    detailCalls += 1;
    assert.deepEqual([...schema.required].sort(), ["indications", "dosage", "adverseReactions", "precautions"].sort());
    assert.ok(input.max_tokens <= 650, "详情阶段只为选中候选生成一次资料");
    assert.match(input.messages[0].content, /已经从候选中选定/);
    return { response: {
      indications: "用于对应品种的相关适应症。",
      dosage: "具体用法用量按该品种资料使用。",
      adverseReactions: "可能出现胃肠道不适等不良反应。",
      precautions: "注意禁忌、相互作用和特殊人群使用。"
    } };
  }
};
const env = { ALLOWED_ORIGINS: origin, AI };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "partial-name-two-stage", optimized: true, requiresPaidApi: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), env);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "阿", candidateCount: 3 })
}), env);
assert.equal(response.status, 400, "单个汉字过于宽泛，应要求至少两个汉字");

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "aspirin", candidateCount: 3 })
}), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), env);
assert.equal(response.status, 403);

const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("两阶段快速链路不应下载远程药品核验库");
};
try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "测试", candidateCount: 3 })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "partial-name-fast-candidates");
  assert.equal(payload.candidates.length, 3);
  assert.equal(payload.candidates[0].drugName, "测试新药胶囊");
  assert.equal(payload.candidates[0].indications, undefined, "候选阶段不得生成临床长文本");
  for (const candidate of payload.candidates) {
    assert.equal(candidate.sourceQuality, "ai-generated");
    assert.match(candidate.sourceTitle, /Cloudflare Workers AI/);
    assert.equal(candidate.sourceUrl, "");
  }
  assert.equal(searchCalls, 1);
  assert.equal(detailCalls, 0, "展示候选前不得生成详情");

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/detail", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "测试",
      candidate: payload.candidates[0]
    })
  }), env);
  assert.equal(response.status, 200);
  const detailPayload = await response.json();
  assert.equal(detailPayload.mode, "selected-candidate-detail");
  assert.equal(detailPayload.candidate.drugName, "测试新药胶囊");
  assert.match(detailPayload.candidate.indications, /适应症/);
  assert.match(detailPayload.candidate.dosage, /用法用量/);
  assert.match(detailPayload.candidate.sourceTitle, /Cloudflare Workers AI/);
  assert.equal(searchCalls, 1);
  assert.equal(detailCalls, 1, "只有选中候选后才应生成一次详情");
  assert.equal(aiCalls, 2);
} finally {
  globalThis.fetch = realFetch;
}

assert.equal(categoryIdFor("西药", "阿卡波糖片"), "降糖药");
assert.equal(categoryIdFor("西药", "莫匹罗星软膏"), "皮肤外用");

const noAiEnv = { ALLOWED_ORIGINS: origin };
response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "另一", candidateCount: 3 })
}), noAiEnv);
assert.equal(response.status, 200);
const noAiPayload = await response.json();
assert.equal(noAiPayload.candidates.length, 0);
assert.match(noAiPayload.warnings.join(""), /额度|暂不可用/);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/detail", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "另一", candidate: { drugName: "另一测试药", tradeName: "", category: "其他", specification: "" } })
}), noAiEnv);
assert.equal(response.status, 503);

console.log("Worker partial-name two-stage fast-path tests passed");

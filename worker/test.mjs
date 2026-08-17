import assert from "node:assert/strict";
import worker, { directlyMatchesFragment } from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
let aiCalls = 0;
const AI = {
  async run(model, input) {
    aiCalls += 1;
    assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
    assert.equal(input.response_format.type, "json_schema");
    const schema = input.response_format.json_schema;
    assert.equal(schema.properties.candidates.minItems, 1, "候选不得强制凑满 3 个");
    assert.equal(schema.properties.candidates.maxItems, 3);
    assert.deepEqual([...schema.properties.candidates.items.required].sort(), ["drugName", "tradeName"].sort());
    assert.ok(input.max_tokens <= 220, "药名候选应使用短输出");
    assert.match(input.messages[0].content, /不要为了凑够数量/);
    assert.match(input.messages[0].content, /不生成分类、规格、适应症/);
    return { response: {
      candidates: [
        { drugName: "司美格鲁肽注射液", tradeName: "" },
        { drugName: "硝苯地平缓释片", tradeName: "" },
        { drugName: "司美格鲁肽片", tradeName: "" }
      ]
    } };
  }
};
const env = { ALLOWED_ORIGINS: origin, AI };

assert.equal(directlyMatchesFragment("司美", "司美格鲁肽注射液", ""), true);
assert.equal(directlyMatchesFragment("司美", "硝苯地平缓释片", ""), false);

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "safe-name-candidates", optimized: true, requiresPaidApi: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), env);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司", candidateCount: 3 })
}), env);
assert.equal(response.status, 400, "单个汉字过于宽泛，应要求至少两个汉字");

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "semaglutide", candidateCount: 3 })
}), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), env);
assert.equal(response.status, 403);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司美", candidateCount: 3 })
}), env);
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.mode, "safe-name-candidates");
assert.equal(payload.candidates.length, 2, "无关候选必须被字面片段过滤掉，不得为了数量保留");
assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
assert.equal(payload.candidates[1].drugName, "司美格鲁肽片");
for (const candidate of payload.candidates) {
  assert.equal(candidate.sourceQuality, "ai-name-candidate");
  assert.equal(candidate.verified, false);
  assert.equal(candidate.specification, undefined, "Worker 不得生成规格");
  assert.equal(candidate.category, undefined, "Worker 不得生成分类");
  assert.equal(candidate.indications, undefined, "Worker 不得生成临床资料");
  assert.match(candidate.sourceTitle, /Cloudflare Workers AI/);
  assert.match(candidate.sourceTitle, /仅药名候选/);
}
assert.match(payload.warnings.join(""), /仅用于候选药名识别/);
assert.equal(aiCalls, 1, "一次搜索只应调用一次 AI");

response = await worker.fetch(new Request("https://worker.example/v1/drugs/detail", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司美" })
}), env);
assert.equal(response.status, 404, "危险的 AI 临床资料生成接口必须下线");

const noAiEnv = { ALLOWED_ORIGINS: origin };
response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "另一" })
}), noAiEnv);
assert.equal(response.status, 200);
const noAiPayload = await response.json();
assert.equal(noAiPayload.candidates.length, 0);
assert.match(noAiPayload.warnings.join(""), /额度|暂不可用/);

console.log("Worker safe name-candidate tests passed");

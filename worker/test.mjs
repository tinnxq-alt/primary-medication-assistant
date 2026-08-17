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
    assert.deepEqual(
      [...input.response_format.json_schema.required].sort(),
      ["drugName", "tradeName", "category", "indications", "specification", "dosage", "adverseReactions", "precautions"].sort()
    );
    assert.ok(input.max_tokens <= 900, "新药生成应限制输出长度以优化速度");
    assert.match(input.messages[0].content, /新药|未核验/);
    return { response: {
      drugName: "测试新药胶囊",
      tradeName: "测试牌",
      category: "神经精神",
      specification: "10mg*20粒",
      indications: "用于对应品种说明书所列适应症，具体范围需核对现行说明书。",
      dosage: "具体用法用量需核对对应品种现行说明书并按临床实际使用。",
      adverseReactions: "可能发生不良反应，具体发生率和表现需核对现行说明书。",
      precautions: "使用前需核对禁忌、注意事项及特殊人群相关说明。"
    } };
  }
};
const env = { ALLOWED_ORIGINS: origin, AI };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "new-drug-ai-draft", optimized: true, requiresPaidApi: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), env);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "aspirin", newDrugOnly: true })
}), env);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), env);
assert.equal(response.status, 403);

const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("新药快速链路不应下载远程药品核验库");
};
try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "测试新药胶囊", newDrugOnly: true })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "new-drug-ai-draft");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].drugName, "测试新药胶囊");
  assert.equal(payload.candidates[0].draft, true);
  assert.equal(payload.candidates[0].verified, false);
  assert.equal(payload.candidates[0].editable, true);
  assert.equal(payload.candidates[0].category, "神经精神");
  assert.equal(payload.candidates[0].sourceUrl, "");
  assert.match(payload.warnings.join(""), /本地药库|未核验/);
  assert.equal(payload.verificationLinks.length, 2);
  assert.ok(Number.isInteger(payload.elapsedMs) && payload.elapsedMs >= 0);
  assert.equal(aiCalls, 1);
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
  body: JSON.stringify({ query: "另一测试新药", newDrugOnly: true })
}), noAiEnv);
assert.equal(response.status, 200);
const noAiPayload = await response.json();
assert.equal(noAiPayload.candidates.length, 0);
assert.match(noAiPayload.warnings.join(""), /免费额度|暂不可用/);

console.log("Worker new-drug fast-path tests passed");

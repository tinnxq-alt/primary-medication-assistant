import assert from "node:assert/strict";
import worker from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
const catalogUrl = "https://example.test/chinese-drug-labels.json";
let aiCalls = 0;
const AI = {
  async run(model, input) {
    aiCalls += 1;
    assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
    assert.equal(input.response_format.type, "json_schema");
    assert.match(input.messages[0].content, /核验|草稿/);
    return { response: {
      drugName: "测试胶囊", genericName: "测试成分", tradeName: "", specification: "10mg",
      dosageForm: "胶囊剂", category: "西药", manufacturer: "测试制药企业",
      indication: "用于说明书所列适应症的资料录入草稿。",
      dosage: "具体用法用量应以对应品种现行说明书为准。",
      adverseReactions: "可能出现胃肠道不适等不良反应。",
      precautions: "使用前应阅读对应品种现行说明书并注意禁忌事项。"
    } };
  }
};
const baseEnv = { ALLOWED_ORIGINS: origin, CATALOG_URL: catalogUrl, AI };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), baseEnv);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "free-ai-draft", requiresPaidApi: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), baseEnv);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "aspirin" })
}), baseEnv);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), baseEnv);
assert.equal(response.status, 403);

const realFetch = globalThis.fetch;
let catalog = {
  schemaVersion: 1, language: "zh-CN",
  drugs: [{
    drugName: "阿司匹林肠溶片", genericName: "阿司匹林", tradeName: "", specification: "100mg",
    dosageForm: "肠溶片", category: "西药", manufacturer: "某制药企业",
    clinical: { indication: "用于抗血小板治疗。", dosage: "请按现行说明书及医嘱使用。", adverseReactions: "可见胃肠道不适。", precautions: "English only" },
    source: { status: "verified-template", label: "国家药监局中文说明书", url: "https://www.nmpa.gov.cn/example/aspirin.html", checkedAt: "2026-08-16" }
  }]
};
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), catalogUrl);
  assert.equal(init.headers.Accept, "application/json");
  return new Response(JSON.stringify(catalog), { status: 200, headers: { "Content-Type": "application/json" } });
};

try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "阿司匹林" })
  }), baseEnv);
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.mode, "free-verified");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].clinical.precautions, "");
  assert.equal(payload.candidates[0].sourceQuality, "regulator");
  assert.equal(payload.candidates[0].verified, true);
  assert.equal(payload.candidates[0].editable, true);
  assert.equal(aiCalls, 0, "有核验资料时不应调用 AI");

  catalog = { schemaVersion: 1, language: "zh-CN", drugs: [] };
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "测试胶囊", directoryHint: { drugName: "测试胶囊", specification: "20mg", manufacturer: "目录厂家", ignored: "不要传入" } })
  }), baseEnv);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.mode, "free-ai-draft");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].draft, true);
  assert.equal(payload.candidates[0].verified, false);
  assert.equal(payload.candidates[0].editable, true);
  assert.equal(payload.candidates[0].specification, "20mg", "目录字段应覆盖模型猜测");
  assert.equal(payload.candidates[0].manufacturer, "目录厂家");
  assert.match(payload.candidates[0].clinical.indication, /用于/);
  assert.equal(payload.candidates[0].sourceUrl, "");
  assert.equal(aiCalls, 1);
  assert.equal(payload.verificationLinks.length, 3);

  const noAiEnv = { ALLOWED_ORIGINS: origin, CATALOG_URL: catalogUrl };
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "测试胶囊" })
  }), noAiEnv);
  payload = await response.json();
  assert.equal(payload.candidates.length, 0);
  assert.match(payload.warnings.join(""), /免费额度|暂不可用/);
} finally { globalThis.fetch = realFetch; }

console.log("Worker tests passed");

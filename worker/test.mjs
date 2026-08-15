import assert from "node:assert/strict";
import worker from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
const baseEnv = { ALLOWED_ORIGINS: origin };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), baseEnv);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: false });
assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", { method: "OPTIONS", headers: { Origin: origin } }), baseEnv);
assert.equal(response.status, 204);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "aspirin" })
}), baseEnv);
assert.equal(response.status, 400);

response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "阿司匹林" })
}), baseEnv);
assert.equal(response.status, 503);

const realFetch = globalThis.fetch;
const sourceUrl = "https://www.nmpa.gov.cn/example/aspirin.html";
globalThis.fetch = async url => {
  assert.equal(String(url), "https://api.openai.com/v1/responses");
  return new Response(JSON.stringify({
    output: [
      { type: "web_search_call", action: { sources: [{ title: "中文说明书", url: sourceUrl }] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        query: "阿司匹林", warnings: [], candidates: [{
          drugName: "阿司匹林肠溶片", genericName: "阿司匹林", tradeName: "", specification: "100mg",
          dosageForm: "肠溶片", category: "西药", manufacturer: "某制药企业", approvalNumber: "国药准字示例",
          clinical: { indication: "用于抗血小板治疗。", dosage: "请按现行说明书及医嘱使用。", adverseReactions: "可见胃肠道不适。", precautions: "English only" },
          confidence: "high", sourceQuality: "regulator", sourceTitle: "中文说明书", sourceUrl, sourceCheckedAt: "2026-08-16"
        }]
      }) }] }
    ]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.10" }, body: JSON.stringify({ query: "阿司匹林" })
  }), { ...baseEnv, OPENAI_API_KEY: "test-only", SEARCH_RATE_LIMITER: { limit: async () => ({ success: true }) } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].clinical.precautions, "");
  assert.equal(payload.candidates[0].sourceUrl, sourceUrl);
} finally { globalThis.fetch = realFetch; }

console.log("Worker tests passed");

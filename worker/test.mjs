import assert from "node:assert/strict";
import worker from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
const catalogUrl = "https://example.test/chinese-drug-labels.json";
const baseEnv = { ALLOWED_ORIGINS: origin, CATALOG_URL: catalogUrl };

let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), baseEnv);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, configured: true, mode: "free-verified", requiresPaidApi: false });
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
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), catalogUrl);
  assert.equal(init.headers.Accept, "application/json");
  return new Response(JSON.stringify({
    schemaVersion: 1,
    language: "zh-CN",
    drugs: [{
      drugName: "阿司匹林肠溶片", genericName: "阿司匹林", tradeName: "", specification: "100mg",
      dosageForm: "肠溶片", category: "西药", manufacturer: "某制药企业",
      clinical: { indication: "用于抗血小板治疗。", dosage: "请按现行说明书及医嘱使用。", adverseReactions: "可见胃肠道不适。", precautions: "English only" },
      source: { status: "verified-template", label: "国家药监局中文说明书", url: "https://www.nmpa.gov.cn/example/aspirin.html", checkedAt: "2026-08-16" }
    }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

try {
  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ query: "阿司匹林" })
  }), baseEnv);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "free-verified");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].clinical.precautions, "");
  assert.equal(payload.candidates[0].sourceQuality, "regulator");
  assert.equal(payload.verificationLinks.length, 3);
  assert.match(payload.verificationLinks[2].url, /^https:\/\/cn\.bing\.com\/search\?q=/);
} finally { globalThis.fetch = realFetch; }

console.log("Worker tests passed");

import assert from "node:assert/strict";
import worker, { normalizeUserSourceUrl } from "./src/index-v11.js";
import { findIndexedSources } from "./src/free-source-index.js";

const origin = "https://tinnxq-alt.github.io";
const semaglutide39 = "https://ypk.39.net/2310025/manual/";
const semaglutideDrugNet = "https://www.yaopinnet.com/huayao/hy7378h.htm";

assert.ok(findIndexedSources("司美").some(item => item.url === semaglutide39), "司美应命中免费说明书索引");
assert.ok(findIndexedSources("顺尔宁").some(item => /2029378/.test(item.url)), "商品名应命中免费说明书索引");
assert.equal(findIndexedSources("完全未收录药物").length, 0, "未知药名不得猜测来源");
assert.equal(normalizeUserSourceUrl("https://ypk.39.net/2310025/"), semaglutide39, "39 产品页应规范化到 manual");
assert.equal(normalizeUserSourceUrl("https://example.com/drug"), "", "用户粘贴链接必须限制在可信域名");

const manual39Html = `<!doctype html><html><head><title>司美格鲁肽注射液(诺和泰)详细说明书-39药品通</title></head><body>
<p>〖药品名称〗</p><p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p>
<p>〖规格〗1.34毫克/毫升,1.5毫升(预填充注射笔)</p>
<p>〖适应症〗本品适用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗司美格鲁肽的起始剂量为0.25mg每周一次，按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠系统不良反应包括恶心、腹泻和呕吐。</p>
<p>〖注意事项〗本品不得用于1型糖尿病患者或用于治疗糖尿病酮症酸中毒。</p>
<p>〖批准文号〗国药准字SJ20210014</p><p>〖生产企业〗企业名称：丹麦诺和诺德公司</p>
</body></html>`;
const drugNetHtml = `<!doctype html><html><head><title>司美格鲁肽注射液说明书_药源网</title></head><body>
<p>〖药品名称〗通用名称：司美格鲁肽注射液</p>
<p>〖规格〗1.34mg/ml</p><p>〖适应症〗本品用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>〖注意事项〗使用期间应关注低血糖及胃肠道不良反应风险。</p>
<p>〖生产企业〗Novo Nordisk A/S</p>
</body></html>`;

const browserUrls = [];
const BROWSER = {
  async quickAction(action, input) {
    assert.equal(action, "content");
    browserUrls.push(input.url);
    if (input.url === semaglutide39) return Response.json({ success: true, result: manual39Html });
    if (input.url === semaglutideDrugNet) return Response.json({ success: true, result: drugNetHtml });
    throw new Error(`unexpected browser url ${input.url}`);
  }
};
const env = { ALLOWED_ORIGINS: origin, BROWSER };

const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(health.status, 200);
const healthPayload = await health.json();
assert.equal(healthPayload.mode, "free-verified");
assert.equal(healthPayload.discovery, "local-source-index-v11");
assert.equal(healthPayload.requiresPaidApi, false);
assert.equal(healthPayload.usesOpenAI, false);
assert.equal(healthPayload.sourceGrounded, true);
assert.equal(healthPayload.generatesClinicalKnowledge, false);

const search = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司美" })
}), env);
assert.equal(search.status, 200);
const searchPayload = await search.json();
assert.equal(searchPayload.discovery, "local-source-index-v11");
assert.equal(searchPayload.requiresPaidApi, false);
assert.equal(searchPayload.candidates[0].drugName, "司美格鲁肽注射液");
assert.equal(searchPayload.candidates[0].category, "降糖药");
assert.match(searchPayload.candidates[0].clinical.indication, /2型糖尿病/);
assert.match(searchPayload.candidates[0].clinical.dosage, /每周一次/);
assert.ok(searchPayload.verificationLinks.every(item => /ypk\.39\.net|yaopinnet\.com/.test(item.url)));

const unknown = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "完全未收录" })
}), env);
const unknownPayload = await unknown.json();
assert.equal(unknownPayload.candidates.length, 0);
assert.match(unknownPayload.warnings.join(""), /粘贴/);

const manual = await worker.fetch(new Request("https://worker.example/v1/drugs/parse-source", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司美", sourceUrl: "https://ypk.39.net/2310025/" })
}), env);
assert.equal(manual.status, 200);
const manualPayload = await manual.json();
assert.equal(manualPayload.discovery, "manual-trusted-source-v11");
assert.equal(manualPayload.candidates[0].sourceUrl, semaglutide39);

const rejected = await worker.fetch(new Request("https://worker.example/v1/drugs/parse-source", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "司美", sourceUrl: "https://example.com/drug" })
}), env);
assert.equal(rejected.status, 400);
assert.ok(browserUrls.includes(semaglutide39), "真实来源必须通过 Browser Run 读取");

console.log("Worker zero-cost source-index v11 tests passed");

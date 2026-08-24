import assert from "node:assert/strict";
import worker, { normalizeUserSourceUrl } from "./src/index-v12.js";

const origin = "https://tinnxq-alt.github.io";
const semaglutide39 = "https://ypk.39.net/2310025/manual/";
const onlineClomipramine = [
  "https://ypk.39.net/2099564/manual/",
  "https://ypk.39.net/2099565/manual/",
  "https://ypk.39.net/2099566/manual/"
];

assert.equal(normalizeUserSourceUrl("https://ypk.39.net/2310025/"), semaglutide39);
assert.equal(normalizeUserSourceUrl("https://example.com/drug"), "");

const manual = ({ name, indication, dosage }) => `<!doctype html><html><head><title>${name}详细说明书-39药品通</title></head><body>
<p>〖药品名称〗</p><p>通用名称：${name}</p><p>〖规格〗50mg</p>
<p>〖适应症〗${indication}</p><p>〖用法用量〗${dosage}</p>
<p>〖不良反应〗可见头晕等不良反应。</p><p>〖注意事项〗用药期间监测相关指标。</p>
<p>〖生产企业〗企业名称：测试药企</p></body></html>`;

const semaglutideHtml = manual({
  name: "司美格鲁肽注射液",
  indication: "用于成人2型糖尿病患者的血糖控制。",
  dosage: "每周皮下注射一次，按说明书逐步调整。"
});
const clomipramineHtml = manual({
  name: "盐酸氯米帕明片",
  indication: "用于治疗抑郁症及符合说明书条件的强迫症。",
  dosage: "口服，剂量根据病情和耐受性遵医嘱调整。"
});
const onlineSearchHtml = onlineClomipramine.map((url, index) =>
  `<a href="${url.replace(/manual\/$/, "")}">氯米帕明片说明书${index + 1}</a>`).join("");

const browserUrls = [];
const BROWSER = {
  async quickAction(action, input) {
    assert.equal(action, "content");
    browserUrls.push(input.url);
    if (input.url === semaglutide39) return Response.json({ success: true, result: semaglutideHtml });
    if (onlineClomipramine.includes(input.url)) return Response.json({ success: true, result: clomipramineHtml });
    if (input.url.includes("/search/") && decodeURIComponent(input.url).includes("氯米帕明")) {
      return Response.json({ success: true, result: onlineSearchHtml });
    }
    if (input.url.includes("/search/")) return Response.json({ success: true, result: "<html><body>无结果</body></html>" });
    throw new Error(`unexpected browser url ${input.url}`);
  }
};
const env = { ALLOWED_ORIGINS: origin, BROWSER };
const request = (path, body, headers = {}) => new Request(`https://worker.example${path}`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
assert.equal(health.status, 200);
const healthPayload = await health.json();
assert.equal(healthPayload.discovery, "hybrid-source-discovery-v12");
assert.equal(healthPayload.trustedOnlineDiscoverySupported, true);
assert.equal(healthPayload.sourceGrounded, true);

const indexed = await worker.fetch(request("/v1/drugs/search", { query: "司美" }), env);
assert.equal(indexed.status, 200);
const indexedPayload = await indexed.json();
assert.equal(indexedPayload.discovery, "local-source-index-v12");
assert.equal(indexedPayload.candidates[0].drugName, "司美格鲁肽注射液");
assert.match(indexedPayload.candidates[0].clinical.indication, /2型糖尿病/);

const online = await worker.fetch(request("/v1/drugs/search", { query: "氯米帕明" }), env);
assert.equal(online.status, 200);
const onlinePayload = await online.json();
assert.equal(onlinePayload.discovery, "trusted-online-discovery-v12");
assert.ok(onlinePayload.discoveryMethods.includes("39-site-search"));
assert.equal(onlinePayload.candidates[0].drugName, "盐酸氯米帕明片");
assert.match(onlinePayload.candidates[0].clinical.dosage, /遵医嘱/);

const parsed = await worker.fetch(request("/v1/drugs/parse-source", {
  query: "司美", sourceUrl: "https://ypk.39.net/2310025/"
}), env);
assert.equal(parsed.status, 200);
assert.equal((await parsed.json()).discovery, "manual-trusted-source-v12");

const wrongType = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
  method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: "{}"
}), env);
assert.equal(wrongType.status, 400);
assert.match((await wrongType.json()).error, /application\/json/);

const unexpectedField = await worker.fetch(request("/v1/drugs/search", { query: "司美", extra: "no" }), env);
assert.equal(unexpectedField.status, 400);
assert.match((await unexpectedField.json()).error, /不支持/);

const tooLarge = await worker.fetch(request("/v1/drugs/search", JSON.stringify({ query: `司美${"药".repeat(5000)}` })), env);
assert.equal(tooLarge.status, 400);
assert.match((await tooLarge.json()).error, /过大/);

assert.ok(browserUrls.includes(semaglutide39));
assert.ok(onlineClomipramine.some(url => browserUrls.includes(url)), "未命中索引时应联网读取可信说明书");
console.log("Worker hybrid trusted-source v12 tests passed");

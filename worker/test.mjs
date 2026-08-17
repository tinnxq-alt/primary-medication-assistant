import assert from "node:assert/strict";
import worker, { renderedHtml } from "./src/index-v7.js";
import { search39ManualLinks } from "./src/index-v6.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";
import { renderedHtmlFromContentResponse } from "./src/index-v5.js";

const origin = "https://tinnxq-alt.github.io";
const manual1 = "https://ypk.39.net/2310025/manual/";
const manual2 = "https://ypk.39.net/2310026/manual/";
const search39 = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E";
const browserUrls = [];

const searchHtml = `<!doctype html><html><body>
<a href="/2310025/">司美格鲁肽注射液(诺和泰)</a>
<a href="https://ypk.39.net/2310026/">司美格鲁肽注射液(诺和泰) 另一规格</a>
<a href="/886077/">盐酸非索非那定片</a>
<a href="/2310025/comment/">评论</a>
</body></html>`;
assert.deepEqual(search39ManualLinks(searchHtml, "司美"), [manual1, manual2]);

const manualHtml1 = `<!doctype html><html><head><title>司美格鲁肽注射液(诺和泰)详细说明书-39药品通</title></head><body>
<p>〖药品名称〗</p><p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p>
<p>〖规格〗1.34毫克/毫升,1.5毫升(预填充注射笔)</p>
<p>〖适应症〗本品适用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗司美格鲁肽的起始剂量为0.25mg每周一次，按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠系统不良反应包括恶心、腹泻和呕吐。</p>
<p>〖注意事项〗本品不得用于1型糖尿病患者或用于治疗糖尿病酮症酸中毒。</p>
<p>〖批准文号〗国药准字SJ20210014</p><p>〖生产企业〗企业名称：丹麦诺和诺德公司</p>
</body></html>`;
const manualHtml2 = `<!doctype html><html><head><title>司美格鲁肽注射液(诺和泰)详细说明书-39药品通</title></head><body>
<p>〖药品名称〗</p><p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p>
<p>〖规格〗1.34毫克/毫升,3毫升(预填充注射笔)</p>
<p>〖适应症〗本品适用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次。</p>
<p>〖不良反应〗可能出现胃肠道不良反应。</p>
<p>〖注意事项〗使用时按照本品说明书。</p>
<p>〖批准文号〗国药准字SJ20210015</p><p>〖生产企业〗企业名称：丹麦诺和诺德公司</p>
</body></html>`;

const text = htmlToText(manualHtml1);
assert.equal(extractSection(text, ["适应症"]), "本品适用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
assert.equal(parseInstructionPage({ url: manual1, html: manualHtml1, text }, "司美").category, "降糖药");

const BROWSER = {
  async quickAction(action, input) {
    assert.equal(action, "content", "39 搜索页和说明书页都必须由 Browser content 渲染");
    browserUrls.push(input.url);
    let html = "";
    if (input.url === search39) html = searchHtml;
    else if (input.url === manual1) html = manualHtml1;
    else if (input.url === manual2) html = manualHtml2;
    else throw new Error(`unexpected browser url ${input.url}`);
    return Response.json({ success: true, result: html });
  }
};

const contentResponse = Response.json({ success: true, result: searchHtml });
assert.equal(await renderedHtmlFromContentResponse(contentResponse), searchHtml, "Browser content 必须从 JSON result 中解包 HTML");
assert.equal(await renderedHtml(BROWSER, search39), searchHtml);
browserUrls.length = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  throw new Error(`Browser 直连成功时不应使用普通 fetch 读取 39 页面: ${String(request)}`);
};

try {
  const env = { ALLOWED_ORIGINS: origin, BROWSER };
  const response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "web-instruction-source-extraction-v3");
  assert.equal(payload.discovery, "direct-39-browser-content");
  assert.equal(payload.searchResultCount, 2);
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
  assert.equal(payload.candidates[0].category, "降糖药");
  assert.equal(payload.candidates[0].sourceHost, "ypk.39.net");
  assert.equal(payload.candidates[0].sourceQuality, "医药数据库");
  assert.match(payload.candidates[0].sourceUrl, /\/manual\/$/);
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周一次/);
  assert.match(payload.candidates[0].clinical.adverseReactions, /胃肠/);
  assert.match(payload.candidates[0].clinical.precautions, /1型糖尿病/);
  assert.deepEqual(browserUrls, [search39, manual1, manual2]);

  const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  const healthPayload = await health.json();
  assert.equal(healthPayload.discovery, "direct-medical-browser-first");
  assert.equal(healthPayload.generatesClinicalKnowledge, false);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker browser-rendered direct medical-source tests passed");

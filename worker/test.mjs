import assert from "node:assert/strict";
import worker, {
  extractTrustedLinksFromSearchHtml,
  siteSearchUrl
} from "./src/index-v9.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const manual39 = "https://ypk.39.net/2310025/manual/";
const product39 = "https://ypk.39.net/2310025/";
const drugNet = "https://www.yaopinnet.com/huayao/hy7378h.htm";
const search39 = siteSearchUrl("司美", "ypk.39.net");
const searchDrugNet = siteSearchUrl("司美", "yaopinnet.com");
const browserUrls = [];

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function bingRedirect(target) {
  return `https://www.bing.com/ck/a?u=a1${base64Url(target)}`;
}

const search39Html = `<!doctype html><html><body>
<li class="b_algo"><h2><a href="${bingRedirect(product39)}">司美格鲁肽注射液详细说明书 - 39药品通</a></h2></li>
<li class="b_algo"><h2><a href="https://www.calculator.net/">Semaglutide calculator noise</a></h2></li>
</body></html>`;
const searchDrugNetHtml = `<!doctype html><html><body>
<li class="b_algo"><h2><a href="${bingRedirect(drugNet)}">司美格鲁肽注射液说明书 - 药源网</a></h2></li>
<li class="b_algo"><h2><a href="https://example.com/medicine">普通网页噪声</a></h2></li>
</body></html>`;

assert.deepEqual(
  extractTrustedLinksFromSearchHtml(search39Html, search39, "ypk.39.net"),
  [manual39],
  "Bing 跳转链接应解码为 39 真实产品页并规范化到 manual"
);
assert.deepEqual(
  extractTrustedLinksFromSearchHtml(searchDrugNetHtml, searchDrugNet, "yaopinnet.com"),
  [drugNet],
  "站点限定搜索只能保留指定医药域名"
);

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
<p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p><p>规格：1.34mg/ml</p>
<p>适应症：本品用于成人2型糖尿病患者的血糖控制。</p>
<p>用法用量：本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>不良反应：常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>注意事项：使用期间应关注低血糖及胃肠道不良反应风险。</p>
<p>生产企业：Novo Nordisk A/S</p>
</body></html>`;

const text = htmlToText(manual39Html);
assert.equal(extractSection(text, ["适应症"]), "本品适用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
assert.equal(parseInstructionPage({ url: manual39, html: manual39Html, text }, "司美").category, "降糖药");

const BROWSER = {
  async quickAction(action, input) {
    assert.equal(action, "content", "搜索结果页与真实说明书页都必须通过 Browser content 读取");
    browserUrls.push(input.url);
    let html = "";
    if (input.url === search39) html = search39Html;
    else if (input.url === manual39) html = manual39Html;
    else if (input.url === searchDrugNet) html = searchDrugNetHtml;
    else if (input.url === drugNet) html = drugNetHtml;
    else throw new Error(`unexpected browser url ${input.url}`);
    return Response.json({ success: true, result: html });
  }
};

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  throw new Error(`v9 Browser 站点限定链路不应依赖普通 fetch: ${String(request)}`);
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
  assert.equal(payload.discovery, "browser-site-restricted-source-v9");
  assert.equal(payload.searchResultCount, 2);
  assert.equal(payload.fetchedSourceCount, 2);
  assert.equal(payload.candidates.length, 2);
  assert.deepEqual(payload.discoveryMethods, [
    "browser-site-search:ypk.39.net",
    "browser-site-search:yaopinnet.com"
  ]);
  assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
  assert.equal(payload.candidates[0].category, "降糖药");
  assert.equal(payload.candidates[0].sourceHost, "ypk.39.net");
  assert.equal(payload.candidates[0].sourceQuality, "医药数据库");
  assert.equal(payload.candidates[0].sourceUrl, manual39);
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周一次/);
  assert.equal(payload.candidates[1].sourceHost, "www.yaopinnet.com");
  assert.equal(payload.candidates[1].sourceQuality, "药品说明书数据库");
  assert.ok(payload.verificationLinks.every(item => /ypk\.39\.net|yaopinnet\.com/.test(item.url)), "calculator/example 等普通网页不得进入来源列表");
  assert.deepEqual(browserUrls, [search39, manual39, searchDrugNet, drugNet], "Browser 调用必须串行：站点搜索→真实说明书→下一站点搜索→真实说明书");
  assert.equal(payload.generatesClinicalKnowledge, false);
  assert.equal(payload.sourceGrounded, true);

  const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  const healthPayload = await health.json();
  assert.equal(healthPayload.discovery, "browser-site-restricted-source-v9");
  assert.equal(healthPayload.generatesClinicalKnowledge, false);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker browser site-restricted source discovery v9 tests passed");

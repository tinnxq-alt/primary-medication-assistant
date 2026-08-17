import assert from "node:assert/strict";
import worker, { linksPayloadFromScrape, shouldKeepAnchor } from "./src/index-v4.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage, unwrapBingUrl } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const sourceUrl = "https://www.yaopinnet.com/huayao/hy7378h.htm";
const secondUrl = "https://ypk.39.net/2310025/manual/";
const bingEncoded = Buffer.from(sourceUrl, "utf8").toString("base64url");
const bingTrackingUrl = `https://www.bing.com/ck/a?!&&p=test&u=a1${bingEncoded}&ntb=1`;
let browserCalls = 0;

const BROWSER = {
  async quickAction(action, input) {
    browserCalls += 1;
    assert.equal(action, "scrape", "v4 必须用 scrape 抓取真实 a[href]，不能再使用 links 快捷动作");
    assert.deepEqual(input.elements, [{ selector: "a[href]" }]);
    assert.match(input.url, /bing\.com\/search/);
    const decoded = decodeURIComponent(input.url);
    assert.match(decoded, /司美/);
    assert.match(decoded, /药源网/);
    return Response.json({
      success: true,
      result: [{
        selector: "a[href]",
        results: [
          { text: "Messenger", attributes: [{ name: "href", value: "https://www.messenger.com/" }] },
          { text: "司美格鲁肽注射液说明书 药源网", attributes: [{ name: "href", value: bingTrackingUrl }] },
          { text: "司美格鲁肽详细说明书 39药品通", attributes: [{ name: "href", value: secondUrl }] },
          { text: "Bing 首页", attributes: [{ name: "href", value: "/" }] }
        ]
      }]
    });
  }
};

const transformed = linksPayloadFromScrape({
  success: true,
  result: [{ selector: "a[href]", results: [
    { text: "Messenger", attributes: [{ name: "href", value: "https://www.messenger.com/" }] },
    { text: "药源网", attributes: [{ name: "href", value: bingTrackingUrl }] },
    { text: "39药品通", attributes: [{ name: "href", value: secondUrl }] }
  ] }]
}, "https://www.bing.com/search?q=test");
assert.deepEqual(transformed.result, [bingTrackingUrl, secondUrl], "通用锚点适配层必须过滤 Messenger 等导航噪声");
assert.equal(shouldKeepAnchor("https://www.messenger.com/", "Messenger"), false);
assert.equal(shouldKeepAnchor(bingTrackingUrl, "司美格鲁肽说明书"), true);
assert.equal(unwrapBingUrl(bingTrackingUrl), sourceUrl);

const semaglutideHtml = `<!doctype html><html><head><meta charset="utf-8"><title>司美格鲁肽注射液_说明书_药源网</title></head><body>
<p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p><p>〖规格〗1.34mg/ml，1.5ml</p>
<p>〖适应症〗本品用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>〖注意事项〗使用期间应注意低血糖及胃肠道不良反应风险。</p>
<p>生产企业：Novo Nordisk A/S</p></body></html>`;
const secondHtml = `<!doctype html><html><head><title>司美格鲁肽注射液(诺和泰)详细说明书-39药品通</title></head><body>
<p>〖通用名称〗: 司美格鲁肽注射液</p><p>〖规格〗: 1.34mg/ml，1.5ml</p>
<p>〖适应症〗: 本品适用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗: 皮下注射，每周一次。</p>
<p>〖不良反应〗: 常见胃肠道不良反应。</p><p>〖注意事项〗: 按本品说明书使用。</p></body></html>`;

const text = htmlToText(semaglutideHtml);
assert.equal(extractSection(text, ["适应症"]), "本品用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
const parsed = parseInstructionPage({ url: sourceUrl, html: semaglutideHtml, text }, "司美");
assert.equal(parsed.drugName, "司美格鲁肽注射液");
assert.equal(parsed.category, "降糖药");
assert.match(parsed.clinical.dosage, /每周皮下注射一次/);

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  if (url === sourceUrl) return new Response(semaglutideHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === secondUrl) return new Response(secondHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  throw new Error(`unexpected fetch ${url}`);
};

try {
  const env = { ALLOWED_ORIGINS: origin, BROWSER };
  let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sourceGrounded, true);

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "web-instruction-source-extraction-v3");
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.candidates[0].category, "降糖药");
  assert.match(payload.candidates[0].sourceUrl, /^https:\/\//);
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周/);
  assert.equal(browserCalls, 1);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker generic-anchor source-grounded retrieval tests passed");

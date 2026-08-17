import assert from "node:assert/strict";
import worker, { bingRssLinks, duckDuckGoLinks, linksFromHtml, shouldKeepHref } from "./src/index-v5.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const sourceUrl = "https://www.yaopinnet.com/huayao/hy7378h.htm";
const secondUrl = "https://ypk.39.net/2310025/manual/";
let browserCalls = [];

const searchHtml = `<html><body>
<a href="https://www.messenger.com/">Messenger</a>
<a href="${sourceUrl}">司美格鲁肽注射液说明书 药源网</a>
<a href="${secondUrl}">司美格鲁肽详细说明书 39药品通</a>
</body></html>`;

const BROWSER = {
  async quickAction(action, input) {
    browserCalls.push(action);
    assert.match(input.url, /bing\.com\/search/);
    if (action === "scrape") return new Response("scrape blocked", { status: 503 });
    if (action === "content") return new Response(searchHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    throw new Error(`unexpected browser action ${action}`);
  }
};

assert.equal(shouldKeepHref("https://www.messenger.com/", "Messenger"), false);
assert.deepEqual(linksFromHtml(searchHtml, "https://www.bing.com/search?q=test"), [sourceUrl, secondUrl]);
assert.deepEqual(duckDuckGoLinks(`<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(sourceUrl)}">药源网</a>`), [sourceUrl]);
assert.deepEqual(bingRssLinks(`<rss><channel><item><title>x</title><link>${sourceUrl}</link></item></channel></rss>`), [sourceUrl]);

const semaglutideHtml = `<!doctype html><html><head><title>司美格鲁肽注射液_说明书_药源网</title></head><body>
<p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p><p>〖规格〗1.34mg/ml，1.5ml</p>
<p>〖适应症〗本品用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>〖注意事项〗使用期间应注意低血糖及胃肠道不良反应风险。</p></body></html>`;
const secondHtml = `<!doctype html><html><head><title>司美格鲁肽注射液详细说明书-39药品通</title></head><body>
<p>〖通用名称〗: 司美格鲁肽注射液</p><p>〖适应症〗: 本品适用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗: 皮下注射，每周一次。</p><p>〖不良反应〗: 常见胃肠道不良反应。</p><p>〖注意事项〗: 按说明书使用。</p></body></html>`;

const text = htmlToText(semaglutideHtml);
assert.equal(extractSection(text, ["适应症"]), "本品用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
assert.equal(parseInstructionPage({ url: sourceUrl, html: semaglutideHtml, text }, "司美").category, "降糖药");

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  if (url === sourceUrl) return new Response(semaglutideHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === secondUrl) return new Response(secondHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  throw new Error(`unexpected fetch ${url}`);
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
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.candidates[0].category, "降糖药");
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周/);
  assert.deepEqual(browserCalls, ["scrape", "content"], "scrape 失败后必须自动降级到完整 HTML 内容抓取");
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker multi-channel source discovery tests passed");

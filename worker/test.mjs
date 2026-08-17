import assert from "node:assert/strict";
import worker, { categoryFromDrugName, extractSearchLinks, extractSection, htmlToText, parseInstructionPage, safePublicUrl, unwrapBingUrl } from "./src/index-v2.js";

const origin = "https://tinnxq-alt.github.io";
const sourceUrl = "https://www.yaopinnet.com/huayao/hy7378h.htm";
const secondUrl = "https://example-pharma.cn/semaglutide-label";
const bingEncoded = Buffer.from(sourceUrl, "utf8").toString("base64url");
const bingTrackingUrl = `https://www.bing.com/ck/a?!&&p=test&u=a1${bingEncoded}&ntb=1`;
let browserCalls = 0;

const BROWSER = {
  async quickAction(action, input) {
    browserCalls += 1;
    assert.equal(action, "links");
    assert.match(input.url, /bing\.com\/search/);
    assert.match(decodeURIComponent(input.url), /司美/);
    return Response.json({
      success: true,
      result: [
        "https://www.bing.com/",
        bingTrackingUrl,
        secondUrl,
        "https://www.bing.com/search?q=other",
        "https://example-pharma.cn/nifedipine"
      ]
    });
  }
};

const semaglutideHtml = `<!doctype html><html><head><meta charset="utf-8"><title>司美格鲁肽注射液_说明书_药源网</title></head><body>
<h1>司美格鲁肽注射液使用说明书</h1>
<p>〖药品名称〗</p><p>通用名称：司美格鲁肽注射液</p><p>商品名称：诺和泰</p>
<p>〖规格〗1.34mg/ml，1.5ml</p>
<p>〖适应症〗本品用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>〖注意事项〗使用期间应注意低血糖及胃肠道不良反应风险。</p>
<p>〖批准文号〗国药准字SJ20200016</p><p>生产企业：Novo Nordisk A/S</p>
</body></html>`;

const secondHtml = `<!doctype html><html><head><title>司美格鲁肽注射液说明书 - 示例厂家</title></head><body>
<p>通用名称：司美格鲁肽注射液</p><p>规格：2mg/3ml</p>
<p>适应症：用于成人2型糖尿病的治疗。</p>
<p>用法用量：皮下注射，每周一次。</p>
<p>不良反应：可能出现恶心。</p><p>注意事项：按本品说明书使用。</p>
<p>生产厂家：示例制药有限公司</p></body></html>`;

assert.equal(unwrapBingUrl(bingTrackingUrl), sourceUrl, "Bing 跟踪链接必须解码回真实来源 URL");
assert.equal(extractSearchLinks({ result: [bingTrackingUrl, secondUrl, "https://www.bing.com/"] }).length, 2);
assert.equal(safePublicUrl("https://example.com/a")?.hostname, "example.com");
assert.equal(safePublicUrl("http://example.com/a"), null);
assert.equal(safePublicUrl("https://127.0.0.1/a"), null);
assert.equal(safePublicUrl("https://localhost/a"), null);

const text = htmlToText(semaglutideHtml);
assert.equal(extractSection(text, ["适应症"]), "本品用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
assert.equal(categoryFromDrugName("苯磺酸氨氯地平片"), "降压药");

const parsed = parseInstructionPage({ url: sourceUrl, html: semaglutideHtml, text }, "司美");
assert.equal(parsed.drugName, "司美格鲁肽注射液");
assert.equal(parsed.tradeName, "诺和泰");
assert.equal(parsed.specification, "1.34mg/ml，1.5ml");
assert.equal(parsed.category, "降糖药");
assert.equal(parsed.clinical.indication, "本品用于成人2型糖尿病患者的血糖控制。");
assert.match(parsed.clinical.dosage, /每周皮下注射一次/);
assert.equal(parsed.sourceQuality, "药品说明书数据库");
assert.equal(parsed.extractionMode, "source-text-only");

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  if (url === sourceUrl) return new Response(semaglutideHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === secondUrl) return new Response(secondHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === "https://example-pharma.cn/nifedipine") return new Response("<html><body>硝苯地平</body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  throw new Error(`unexpected fetch ${url}`);
};

try {
  const env = { ALLOWED_ORIGINS: origin, BROWSER };
  let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    configured: true,
    mode: "web-instruction-source-extraction-v2",
    discovery: "browser-links",
    sourceGrounded: true,
    generatesClinicalKnowledge: false
  });

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "web-instruction-source-extraction-v2");
  assert.ok(payload.searchResultCount >= 2, "Links 模式必须发现外部来源链接");
  assert.equal(payload.candidates.length, 2, "只保留能从真实网页抽出药名、适应症、用法用量的候选");
  assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
  assert.equal(payload.candidates[0].category, "降糖药", "司美格鲁肽不得被误分类为降压药");
  assert.match(payload.candidates[0].sourceUrl, /^https:\/\//);
  assert.equal(payload.candidates[0].extractionMode, "source-text-only");
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周/);
  assert.equal(browserCalls, 1, "一次识别只执行一次 Browser Run 搜索动作");

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/detail", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 404, "不得恢复 AI 生成临床资料接口");

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司" })
  }), env);
  assert.equal(response.status, 400);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker Browser Links source-grounded retrieval tests passed");

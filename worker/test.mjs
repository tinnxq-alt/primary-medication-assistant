import assert from "node:assert/strict";
import worker, { categoryFromDrugName, extractBingResults, extractSection, htmlToText, parseInstructionPage, safePublicUrl } from "./src/index.js";

const origin = "https://tinnxq-alt.github.io";
let browserCalls = 0;
const BROWSER = {
  async quickAction(action, input) {
    browserCalls += 1;
    assert.equal(action, "scrape");
    assert.match(input.url, /bing\.com\/search/);
    assert.match(decodeURIComponent(input.url), /司美/);
    assert.deepEqual(input.elements.map(item => item.selector), ["li.b_algo h2 a", "li.b_algo .b_caption p"]);
    return Response.json({
      success: true,
      result: [
        {
          selector: "li.b_algo h2 a",
          results: [
            { text: "司美格鲁肽注射液_说明书_生产厂家_用法用量_药源网", attributes: [{ name: "href", value: "https://www.yaopinnet.com/huayao/hy7378h.htm" }] },
            { text: "司美格鲁肽注射液说明书 - 示例厂家", attributes: [{ name: "href", value: "https://example-pharma.cn/semaglutide-label" }] },
            { text: "硝苯地平缓释片说明书", attributes: [{ name: "href", value: "https://example-pharma.cn/nifedipine" }] }
          ]
        },
        {
          selector: "li.b_algo .b_caption p",
          results: [
            { text: "司美格鲁肽注射液说明书，包含适应症、规格、用法用量和注意事项。" },
            { text: "司美格鲁肽注射液药品说明书，适应症和用法用量。" },
            { text: "硝苯地平缓释片药品说明书。" }
          ]
        }
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

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  if (url === "https://www.yaopinnet.com/huayao/hy7378h.htm") return new Response(semaglutideHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === "https://example-pharma.cn/semaglutide-label") return new Response(secondHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === "https://example-pharma.cn/nifedipine") return new Response("<html><body>硝苯地平</body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  throw new Error(`unexpected fetch ${url}`);
};

try {
  assert.equal(safePublicUrl("https://example.com/a")?.hostname, "example.com");
  assert.equal(safePublicUrl("http://example.com/a"), null);
  assert.equal(safePublicUrl("https://127.0.0.1/a"), null);
  assert.equal(safePublicUrl("https://localhost/a"), null);

  const text = htmlToText(semaglutideHtml);
  assert.match(text, /适应症/);
  assert.equal(extractSection(text, ["适应症"]), "本品用于成人2型糖尿病患者的血糖控制。");
  assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
  assert.equal(categoryFromDrugName("苯磺酸氨氯地平片"), "降压药");

  const parsed = parseInstructionPage(
    { url: "https://www.yaopinnet.com/huayao/hy7378h.htm", html: semaglutideHtml, text },
    { title: "司美格鲁肽注射液说明书", url: "https://www.yaopinnet.com/huayao/hy7378h.htm" },
    "司美"
  );
  assert.equal(parsed.drugName, "司美格鲁肽注射液");
  assert.equal(parsed.tradeName, "诺和泰");
  assert.equal(parsed.specification, "1.34mg/ml，1.5ml");
  assert.equal(parsed.category, "降糖药");
  assert.equal(parsed.clinical.indication, "本品用于成人2型糖尿病患者的血糖控制。");
  assert.match(parsed.clinical.dosage, /每周皮下注射一次/);
  assert.equal(parsed.sourceQuality, "药品说明书数据库");
  assert.equal(parsed.extractionMode, "source-text-only");

  const searchPayload = {
    success: true,
    result: [
      { selector: "li.b_algo h2 a", results: [{ text: "司美格鲁肽说明书", attributes: [{ name: "href", value: "https://example.com/label" }] }] },
      { selector: "li.b_algo .b_caption p", results: [{ text: "药品说明书 适应症 用法用量" }] }
    ]
  };
  assert.equal(extractBingResults(searchPayload, "司美").length, 1);

  const env = { ALLOWED_ORIGINS: origin, BROWSER };
  let response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    configured: true,
    mode: "web-instruction-source-extraction",
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
  assert.equal(payload.mode, "web-instruction-source-extraction");
  assert.equal(payload.candidates.length, 2, "只保留能从真实网页抽出药名、适应症、用法用量的候选");
  assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
  assert.equal(payload.candidates[0].category, "降糖药", "司美格鲁肽不得被误分类为降压药");
  assert.match(payload.candidates[0].sourceUrl, /^https:\/\//);
  assert.equal(payload.candidates[0].draft, false);
  assert.equal(payload.candidates[0].verified, false);
  assert.equal(payload.candidates[0].extractionMode, "source-text-only");
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周/);
  assert.equal(browserCalls, 1, "一次智能识别只应执行一次全网搜索浏览器请求");

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/detail", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 404, "不得保留 AI 生成临床资料的详情接口");

  response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司" })
  }), env);
  assert.equal(response.status, 400);

  response = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: "https://evil.example" } }), env);
  assert.equal(response.status, 403);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker web-instruction source extraction tests passed");

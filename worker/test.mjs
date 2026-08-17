import assert from "node:assert/strict";
import worker, {
  canonical39InstructionUrl,
  extract39ManualLink,
  extract39SearchLinks,
  trustedSourceUrl
} from "./src/index-v8.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const normalizedSearch = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E-NULL-b0-ci0-c0-m0-bm0-otc0-fd0-p0";
const manual1 = "https://ypk.39.net/2310025/manual/";
const detail2 = "https://ypk.39.net/western/2310026/";
const manual2 = "https://ypk.39.net/2310026/manual/";
const browserUrls = [];
const fetchUrls = [];

const searchHtml = `<!doctype html><html><body>
<a href="/2310025/">司美格鲁肽注射液(诺和泰)</a>
<a href="/western/2310026/">司美格鲁肽注射液(诺和泰) 另一规格</a>
<a href="/886077/">盐酸非索非那定片</a>
<a href="/search/司美-NULL-b0-ci0-c0-m0-bm0-otc0-fd0-p0">司美筛选</a>
<a href="https://www.calculator.net/">司美计算器噪声</a>
</body></html>`;

assert.equal(canonical39InstructionUrl("https://ypk.39.net/2310025/"), manual1);
assert.deepEqual(extract39SearchLinks(searchHtml, "司美"), [manual1, detail2]);
assert.equal(trustedSourceUrl("https://www.calculator.net/"), null, "非医药来源必须被硬过滤");
assert.ok(trustedSourceUrl(manual1), "39 药品通应属于可信医药来源");

const detailHtml2 = `<!doctype html><html><body>
<h1>司美格鲁肽注射液</h1>
<a href="/2310026/manual/">详细说明书</a>
</body></html>`;
assert.equal(extract39ManualLink(detailHtml2, detail2), manual2);

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
    assert.equal(action, "content", "可信来源页面统一通过 Browser content 读取");
    browserUrls.push(input.url);
    let html = "";
    if (input.url === normalizedSearch) html = searchHtml;
    else if (input.url === manual1) html = manualHtml1;
    else if (input.url === detail2) html = detailHtml2;
    else if (input.url === manual2) html = manualHtml2;
    else throw new Error(`unexpected browser url ${input.url}`);
    return Response.json({ success: true, result: html });
  }
};

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  fetchUrls.push(url);
  if (!url.startsWith("https://www.bing.com/search?")) throw new Error(`unexpected fetch ${url}`);
  const decoded = decodeURIComponent(url);
  if (decoded.includes("site:ypk.39.net")) {
    return new Response(`<?xml version="1.0"?><rss><channel>
      <item><title>noise</title><link>https://www.calculator.net/</link></item>
      <item><title>司美格鲁肽说明书</title><link>${manual1}</link></item>
    </channel></rss>`, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  }
  return new Response(`<?xml version="1.0"?><rss><channel><item><title>noise</title><link>https://www.calculator.net/</link></item></channel></rss>`, {
    status: 200,
    headers: { "Content-Type": "application/rss+xml" }
  });
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
  assert.equal(payload.discovery, "trusted-source-discovery-v8");
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
  assert.ok(payload.verificationLinks.every(item => /ypk\.39\.net|yaopinnet\.com|nmpa\.gov\.cn|cde\.org\.cn/.test(item.url)), "来源列表不得出现 calculator 等噪声站点");
  assert.deepEqual(browserUrls, [normalizedSearch, manual1, detail2, manual2], "Browser 请求必须串行走搜索页→说明书，不并发抓多个页面");
  assert.equal(fetchUrls.length, 2, "不足 3 个直连结果时仅做站点限定 RSS 补充发现");

  const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  const healthPayload = await health.json();
  assert.equal(healthPayload.discovery, "trusted-source-discovery-v8");
  assert.equal(healthPayload.generatesClinicalKnowledge, false);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker trusted source discovery v8 tests passed");

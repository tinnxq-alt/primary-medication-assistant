import assert from "node:assert/strict";
import worker, { rawDrugQueryFromSearchUrl, search39ManualLinks } from "./src/index-v6.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const manual1 = "https://ypk.39.net/2310025/manual/";
const manual2 = "https://ypk.39.net/2310026/manual/";
const search39 = "https://ypk.39.net/search/%E5%8F%B8%E7%BE%8E";
let browserCalls = 0;

assert.equal(
  rawDrugQueryFromSearchUrl("https://www.bing.com/search?q=%E5%8F%B8%E7%BE%8E+%E8%8D%AF%E5%93%81%E8%AF%B4%E6%98%8E%E4%B9%A6+%E8%8D%AF%E6%BA%90%E7%BD%91"),
  "司美"
);

const searchHtml = `<!doctype html><html><body>
<a href="/2310025/">司美格鲁肽注射液(诺和泰)</a>
<a href="https://ypk.39.net/2310026/">司美格鲁肽注射液(诺和泰) 另一规格</a>
<a href="/886077/">盐酸非索非那定片</a>
<a href="/2310025/comment/">评论</a>
</body></html>`;
assert.deepEqual(search39ManualLinks(searchHtml, "司美"), [manual1, manual2], "39 搜索页只应保留药名片段匹配的药品详情并转成 manual URL");

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
const parsed = parseInstructionPage({ url: manual1, html: manualHtml1, text }, "司美");
assert.equal(parsed.drugName, "司美格鲁肽注射液");
assert.equal(parsed.category, "降糖药");
assert.match(parsed.clinical.dosage, /0.25mg每周一次/);

const BROWSER = {
  async quickAction() {
    browserCalls += 1;
    throw new Error("39 药品通直连有结果时不得调用通用搜索引擎通道");
  }
};

const realFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = String(request instanceof Request ? request.url : request);
  if (url === search39) return new Response(searchHtml, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === manual1) return new Response(manualHtml1, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url === manual2) return new Response(manualHtml2, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
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
  assert.equal(browserCalls, 0, "直连来源成功时不应依赖通用搜索引擎");
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker direct 39 Drug Search source-grounded tests passed");

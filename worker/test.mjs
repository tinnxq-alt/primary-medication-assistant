import assert from "node:assert/strict";
import worker, {
  collectOpenAIWebSources,
  normalizeSearchSource,
  openAIWebSearchRequest
} from "./src/index-v10.js";
import { categoryFromDrugName, extractSection, htmlToText, parseInstructionPage } from "./src/index-v3.js";

const origin = "https://tinnxq-alt.github.io";
const product39 = "https://ypk.39.net/2310025/";
const manual39 = "https://ypk.39.net/2310025/manual/";
const drugNet = "https://www.yaopinnet.com/huayao/hy7378h.htm";
const noise = "https://www.calculator.net/";
const browserUrls = [];
let openAIRequestBody = null;

assert.equal(normalizeSearchSource(product39), manual39, "39 产品根页面应规范化为详细说明书 URL");
assert.equal(normalizeSearchSource(noise), "", "非允许医药域名不得进入来源列表");
assert.equal(normalizeSearchSource("https://ypk.39.net/2310025/comment/"), "", "评论页不得冒充说明书来源");

const mockedOpenAI = {
  id: "resp_search_001",
  output: [
    {
      type: "web_search_call",
      action: {
        type: "search",
        sources: [
          { type: "url", url: product39 },
          { type: "url", url: noise },
          { type: "url", url: drugNet }
        ]
      }
    },
    {
      type: "message",
      content: [{
        type: "output_text",
        text: "已找到相关药品页面。",
        annotations: [
          { type: "url_citation", url: product39 },
          { type: "url_citation", url: drugNet }
        ]
      }]
    }
  ]
};
assert.deepEqual(collectOpenAIWebSources(mockedOpenAI), [manual39, drugNet], "Web Search 来源必须去重、过滤噪声并规范化 39 manual");

const requestShape = openAIWebSearchRequest("司美", { OPENAI_SEARCH_MODEL: "gpt-5-mini" });
assert.equal(requestShape.model, "gpt-5-mini");
assert.equal(requestShape.store, false, "检索请求默认不存储响应");
assert.equal(requestShape.tools[0].type, "web_search");
assert.deepEqual(requestShape.tools[0].filters.allowed_domains, ["ypk.39.net", "yaopinnet.com"]);
assert.equal(requestShape.tools[0].search_context_size, "low");
assert.match(JSON.stringify(requestShape.input), /不负责生成医学知识/);
assert.match(JSON.stringify(requestShape.input), /网页原文解析/);

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
<p>〖药品名称〗通用名称：司美格鲁肽注射液</p><p>〖规格〗1.34mg/ml</p>
<p>〖适应症〗本品用于成人2型糖尿病患者的血糖控制。</p>
<p>〖用法用量〗本品每周皮下注射一次，具体剂量按说明书方案调整。</p>
<p>〖不良反应〗常见胃肠道不良反应包括恶心、腹泻等。</p>
<p>〖注意事项〗使用期间应关注低血糖及胃肠道不良反应风险。</p>
<p>〖生产企业〗Novo Nordisk A/S</p>
</body></html>`;

const text = htmlToText(manual39Html);
assert.equal(extractSection(text, ["适应症"]), "本品适用于成人2型糖尿病患者的血糖控制。");
assert.equal(categoryFromDrugName("司美格鲁肽注射液"), "降糖药");
assert.equal(parseInstructionPage({ url: manual39, html: manual39Html, text }, "司美").category, "降糖药");

const BROWSER = {
  async quickAction(action, input) {
    assert.equal(action, "content", "来源 URL 找到后只用 Browser content 读取真实说明书");
    browserUrls.push(input.url);
    let html = "";
    if (input.url === manual39) html = manual39Html;
    else if (input.url === drugNet) html = drugNetHtml;
    else throw new Error(`unexpected browser url ${input.url}`);
    return Response.json({ success: true, result: html });
  }
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (request, init = {}) => {
  const url = String(request instanceof Request ? request.url : request);
  if (url !== "https://api.openai.com/v1/responses") throw new Error(`unexpected fetch ${url}`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer test-openai-key");
  openAIRequestBody = JSON.parse(init.body);
  return Response.json(mockedOpenAI);
};

try {
  const env = {
    ALLOWED_ORIGINS: origin,
    BROWSER,
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_SEARCH_MODEL: "gpt-5-mini"
  };
  const response = await worker.fetch(new Request("https://worker.example/v1/drugs/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "司美" })
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "web-instruction-source-extraction-v3");
  assert.equal(payload.discovery, "openai-web-search-source-v10");
  assert.equal(payload.searchProviderConfigured, true);
  assert.equal(payload.searchResultCount, 2);
  assert.equal(payload.fetchedSourceCount, 2);
  assert.equal(payload.candidates.length, 2);
  assert.deepEqual(payload.discoveryMethods, ["openai-responses-web-search"]);
  assert.equal(payload.candidates[0].drugName, "司美格鲁肽注射液");
  assert.equal(payload.candidates[0].category, "降糖药");
  assert.equal(payload.candidates[0].sourceHost, "ypk.39.net");
  assert.equal(payload.candidates[0].sourceUrl, manual39);
  assert.match(payload.candidates[0].clinical.indication, /2型糖尿病/);
  assert.match(payload.candidates[0].clinical.dosage, /每周一次/);
  assert.equal(payload.candidates[1].sourceHost, "www.yaopinnet.com");
  assert.ok(payload.verificationLinks.every(item => /ypk\.39\.net|yaopinnet\.com/.test(item.url)));
  assert.deepEqual(browserUrls, [manual39, drugNet], "搜索引擎只负责找 URL，Browser 只抓真实说明书页");
  assert.equal(payload.generatesClinicalKnowledge, false);
  assert.equal(payload.sourceGrounded, true);
  assert.equal(openAIRequestBody.tools[0].type, "web_search");

  const health = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), env);
  const healthPayload = await health.json();
  assert.equal(healthPayload.discovery, "openai-web-search-source-v10");
  assert.equal(healthPayload.searchProvider, "openai-web-search");
  assert.equal(healthPayload.searchProviderConfigured, true);

  const fallbackHealth = await worker.fetch(new Request("https://worker.example/health", { headers: { Origin: origin } }), {
    ALLOWED_ORIGINS: origin,
    BROWSER
  });
  const fallbackPayload = await fallbackHealth.json();
  assert.equal(fallbackPayload.discovery, "browser-site-restricted-source-v9");
  assert.equal(fallbackPayload.searchProviderConfigured, false);
} finally {
  globalThis.fetch = realFetch;
}

console.log("Worker OpenAI web-search source discovery v10 tests passed");

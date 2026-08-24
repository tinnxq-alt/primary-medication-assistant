import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const loaderSource = fs.readFileSync("catalog-data-loader.js", "utf8");
const appSource = fs.readFileSync("app.js", "utf8");
const fastSearchSource = fs.readFileSync("fast-search-ui.js", "utf8");
const smartAddSource = fs.readFileSync("smart-add-fix.js", "utf8");
const htmlSource = fs.readFileSync("index.html", "utf8");
const serviceWorkerSource = fs.readFileSync("service-worker.js", "utf8");

const payload = {
  schemaVersion: 1,
  language: "zh-CN",
  drugs: [{ drugName: "测试药" }],
  tradeNameAliases: [{ tradeName: "测试商品名", drugName: "测试药" }]
};

function createLoaderContext(fetchImpl) {
  const events = [];
  const context = {
    fetch: fetchImpl,
    CustomEvent: class CustomEvent {
      constructor(type) { this.type = type; }
    },
    dispatchEvent(event) { events.push(event.type); }
  };
  context.window = context;
  vm.runInNewContext(loaderSource, context, { filename: "catalog-data-loader.js" });
  return { context, events };
}

let fetchCount = 0;
const shared = createLoaderContext(async () => {
  fetchCount += 1;
  return { ok: true, status: 200, json: async () => payload };
});
const firstLoad = shared.context.loadChineseDrugLabels();
const concurrentLoad = shared.context.loadChineseDrugLabels();
assert.strictEqual(firstLoad, concurrentLoad, "并发目录请求必须共享同一个 Promise");
const [firstPayload, concurrentPayload] = await Promise.all([firstLoad, concurrentLoad]);
assert.equal(fetchCount, 1, "并发目录请求只能发起一次网络请求");
assert.strictEqual(firstPayload, concurrentPayload, "并发调用必须复用同一份解析结果");
assert.deepEqual(shared.events, ["chinese-drug-labels-ready"], "目录就绪事件只能触发一次");
assert.strictEqual(await shared.context.loadChineseDrugLabels(), firstPayload, "后续调用必须命中内存缓存");
assert.equal(fetchCount, 1, "命中内存缓存后不得再次请求网络");

let retryCount = 0;
const retry = createLoaderContext(async () => {
  retryCount += 1;
  if (retryCount === 1) return { ok: false, status: 503, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => payload };
});
await assert.rejects(retry.context.loadChineseDrugLabels(), /503/, "失败请求应报告状态码");
assert.deepEqual(await retry.context.loadChineseDrugLabels(), payload, "失败后必须允许重试");
assert.equal(retryCount, 2, "重试应只增加一次网络请求");

for (const [name, source] of [["app.js", appSource], ["fast-search-ui.js", fastSearchSource], ["smart-add-fix.js", smartAddSource]]) {
  assert.doesNotMatch(source, /chinese-drug-labels\.json/, `${name} 不得直接重复请求中文核验库`);
  assert.match(source, /loadChineseDrugLabels\(\)/, `${name} 必须复用目录单例加载器`);
}

const externalScripts = [...htmlSource.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g)].map(match => match[0]);
assert.ok(externalScripts.length >= 15, "页面应加载完整运行脚本");
assert.ok(externalScripts.every(tag => /\bdefer\b/.test(tag)), "所有外部脚本都应并行下载并按序延迟执行");
assert.ok(htmlSource.indexOf('src="catalog-data-loader.js"') < htmlSource.indexOf('src="app.js"'), "目录加载器必须先于主应用执行");
assert.doesNotMatch(htmlSource, /rel="preconnect"[^>]+primary-medication-smart-search/, "非添加药物页面不应提前连接远端检索服务");

assert.match(appSource, /const INITIAL_SEARCH_RENDER_LIMIT = 40;/, "搜索页首批最多渲染 40 个品规");
assert.match(appSource, /const INITIAL_ALL_RENDER_LIMIT = 60;/, "全部药物页首批最多渲染 60 个品规");
assert.match(appSource, /results\.slice\(0, visibleLimit\)/, "搜索页必须分批创建药品卡片");
assert.match(appSource, /currentResults\.slice\(0, visibleLimit\)/, "全部药物页必须分批创建药品卡片");
assert.match(appSource, /else \{\s*render\(\);\s*\}\s*hydrateVerifiedCatalog\(\)/, "病房药库首屏不得等待核验库下载");
assert.match(appSource, /requestIdleCallback\(registerServiceWorker/, "离线缓存安装应避开首屏主线程忙碌阶段");

const cacheVersion = Number(serviceWorkerSource.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 48, "性能缓存策略版本不得低于 v48");
assert.match(serviceWorkerSource, /event\.request\.mode === "navigate"/, "页面导航必须保留联网更新与离线回退");
assert.match(serviceWorkerSource, /caches\.match\(event\.request\)[\s\S]*cached \|\| fetchAndCache\(event\.request\)/, "同源静态资源必须优先读取缓存");
assert.ok(serviceWorkerSource.includes('"./catalog-data-loader.js"'), "PWA 必须缓存目录单例加载器");

console.log("响应性能检查通过：首屏非阻塞、目录单例请求、脚本 defer、长列表分批渲染、静态资源缓存优先");

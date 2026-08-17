import assert from "node:assert/strict";
import fs from "node:fs";

const fast = fs.readFileSync("fast-search-ui.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const lookup = fs.readFileSync("drug-lookup.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");

assert.match(app, /haystack\.includes\(q\)/, "主搜索必须继续支持药名片段包含匹配");
assert.match(fast, /setTimeout\(\(\) => \{[\s\S]*?60\)/, "搜索输入应合并为 60ms 一次重绘");
assert.match(fast, /stopImmediatePropagation\(\)/, "快速搜索应拦截旧的逐键重绘链路");
assert.match(fast, /rankDrugs\(query, visibleKnownDrugs\(false\), aliases, 5\)/, "首页应使用本地索引即时返回片段候选");
assert.match(fast, /输入药名片段即可/, "搜索框提示应明确无需完整药名");
assert.match(fast, /drug-add-query/, "首页未命中时应把片段带入添加药物页");
assert.match(fast, /data-fast-open-drug/, "片段候选必须可以直接打开药品详情");
assert.doesNotMatch(fast, /location\.reload|window\.scrollTo/, "快速搜索不得刷新页面或主动回顶");

assert.match(lookup, /name\.includes\(q\)/, "药名与商品名应支持片段包含匹配");
assert.match(lookup, /name\.startsWith\(q\)/, "检索排序应优先前缀匹配");
assert.match(lookup, /function|const rankDrugs/, "应提供可复用的本地排序索引");

assert.ok(html.includes('src="fast-search-ui.js"'), "页面必须加载快速片段搜索脚本");
assert.ok(html.indexOf('src="app.js"') < html.indexOf('src="fast-search-ui.js"'), "快速搜索增强应在主应用后加载");
assert.ok(worker.includes('"./fast-search-ui.js"'), "PWA 必须缓存快速搜索脚本");
assert.ok(worker.includes("primary-medication-v39"), "片段搜索上线应升级到 v39 缓存");

console.log("药名片段快速搜索、输入合并与首页即时候选检查通过");

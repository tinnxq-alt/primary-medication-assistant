import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const outpatientMetadata = fs.readFileSync("outpatient-metadata-ui.js", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");

assert.match(app, /let catalogSnapshotCache = null;/, "药品目录必须复用内存快照");
assert.match(app, /byId: new Map\(drugs\.map\(drug => \[drug\.id, drug\]\)\)/, "详情页必须建立药品 ID 索引");
assert.match(app, /catalogSnapshot\(\)\.byId\.get\(id\)/, "点击药品后必须通过 ID 索引直接读取详情");
assert.match(app, /visibleDrugCache\?\.source === snapshot\.drugs/, "可见药品不得在每次路由切换时整库重建");
assert.match(app, /pharmacyViews\(\)\.byPharmacy/, "药库筛选结果必须复用缓存视图");
assert.match(app, /primary-medication-rendered/, "主应用渲染完成后必须发送显式事件");
assert.match(app, /let categoryBrowseActive = false;/, "必须记录详情是否来自药品分类筛选");
assert.match(
  app,
  /function openCategoryDrugList[\s\S]*?navigate\("all"\);[\s\S]*?categoryBrowseActive = true;[\s\S]*?renderAll\(filterAction, filterForm, filterAttribute\)/,
  "药品分类的作用、属性、剂型与自定义分类筛选必须统一标记来源"
);
assert.match(
  app,
  /function openDrugDetail[\s\S]*?categoryBrowseActive && currentRoute\(\)\.route === "all"[\s\S]*?history\.replaceState\(history\.state, "", hash\);[\s\S]*?render\(\);/,
  "从药品分类进入详情时必须替换中间的全部药物历史项"
);
assert.match(app, /if \(drug\) return openDrugDetail\(drug\.dataset\.openDrug\);/, "所有药品卡片必须通过来源感知的详情入口打开");

assert.doesNotMatch(
  outpatientMetadata,
  /new MutationObserver/,
  "门诊详情增强不得全局监听并响应自身 DOM 修改，否则会形成重复渲染循环"
);
assert.match(
  outpatientMetadata,
  /addEventListener\("primary-medication-rendered", schedule\)/,
  "门诊详情增强应仅在主应用完成一次渲染后运行"
);

const cacheVersion = Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 52, "本轮门诊资料、编辑与相互作用更新必须升级离线缓存版本");

console.log("详情导航检查通过：点击性能缓存已启用，分类来源返回路径已保留");

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

assert.match(serviceWorker, /primary-medication-v50/, "详情点击性能修复必须升级离线缓存版本");

console.log("详情点击性能检查通过：整库索引/筛选缓存已启用，门诊详情 DOM 自触发循环已移除");

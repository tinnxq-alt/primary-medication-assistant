import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drugs.js", "utf8"), context);

const rawCatalog = context.window.DRUG_CATALOG;
assert.equal(rawCatalog.length, 167, "原始院内清单应保留 167 条，以维持历史 ID 稳定");
const danqi = rawCatalog.find(drug => drug.drugName === "丹七片");
assert.ok(danqi, "原始清单中应能定位丹七片历史条目");
const nextDrug = rawCatalog.find(drug => drug.drugName === "丹栀逍遥丸");
assert.ok(nextDrug, "应能定位丹七片后的药品用于 ID 稳定性检查");
const nextDrugId = nextDrug.id;

vm.runInContext(fs.readFileSync("catalog-retirements.js", "utf8"), context);
const activeCatalog = context.window.DRUG_CATALOG;

assert.equal(activeCatalog.length, 164, "运行时病房药库应为 164 条");
for (const retiredName of ["丹七片", "格列吡嗪片", "格列齐特片(II)"]) {
  assert.ok(!activeCatalog.some(drug => drug.drugName === retiredName), `${retiredName}不得出现在运行时药库`);
  assert.ok(context.window.RETIRED_DRUG_NAMES.includes(retiredName), `停用清单必须记录${retiredName}`);
}
assert.equal(activeCatalog.find(drug => drug.drugName === "丹栀逍遥丸")?.id, nextDrugId, "删除丹七片不得导致后续药品 ID 前移");

const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");
assert.ok(html.indexOf('src="catalog-retirements.js"') > html.indexOf('src="drugs.js"'), "停用清单必须在 drugs.js 之后加载");
assert.ok(html.indexOf('src="catalog-retirements.js"') < html.indexOf('src="app.js"'), "停用清单必须在 app.js 之前生效");
assert.match(html, /病房药库<\/span><strong data-pharmacy-count>164<\/strong>/, "首页初始病房药库数量应为 164");
const cacheVersion = Number(worker.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 31, "PWA 缓存版本不得低于 v31");
assert.match(worker, /catalog-retirements\.js/, "PWA 离线缓存必须包含停用清单");

console.log("药品停用检查通过｜3 个停用品种已移除｜病房药库 164 条｜历史 ID 保持稳定");

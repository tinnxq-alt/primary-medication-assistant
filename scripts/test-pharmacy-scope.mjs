import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
vm.createContext(context);
for (const file of ["pharmacy-scope.js", "drugs.js", "outpatient-drugs.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const {
  drugBelongsToPharmacy,
  filterDrugsByPharmacy,
  normalizePharmacyId,
  normalizePharmacyScopes,
  withPharmacyScopes
} = context.window.PHARMACY_SCOPE;
const wardCatalog = context.window.DRUG_CATALOG;
const outpatientCatalog = context.window.OUTPATIENT_DRUG_CATALOG;

assert.equal(normalizePharmacyId("OUTPATIENT"), "outpatient");
assert.equal(normalizePharmacyId("unknown"), "ward");
assert.deepEqual([...normalizePharmacyScopes({})], ["ward"], "旧版自定义药品应兼容迁移到病房药库");
assert.deepEqual([...normalizePharmacyScopes({ pharmacyScopes: ["outpatient", "outpatient", "invalid"] })], ["outpatient"]);

const shared = withPharmacyScopes({ id: "shared", pharmacyScopes: ["ward", "outpatient"] });
const outpatient = withPharmacyScopes({ id: "outpatient", pharmacyScopes: ["outpatient"] });
assert.equal(drugBelongsToPharmacy(shared, "ward"), true);
assert.equal(drugBelongsToPharmacy(shared, "outpatient"), true);
assert.deepEqual(filterDrugsByPharmacy([shared, outpatient], "ward").map(drug => drug.id), ["shared"]);
assert.deepEqual(filterDrugsByPharmacy([shared, outpatient], "outpatient").map(drug => drug.id), ["shared", "outpatient"]);

assert.equal(wardCatalog.length, 164);
assert.ok(!wardCatalog.some(drug => ["丹七片", "格列吡嗪片", "格列齐特片(II)"].includes(drug.drugName)), "3 个品种必须从病房药库永久删除");
assert.ok(wardCatalog.every(drug => drug.pharmacyScopes?.length === 1 && drug.pharmacyScopes[0] === "ward"), "现有 164 条必须全部属于病房药库");
assert.ok(Array.isArray(outpatientCatalog));
assert.equal(outpatientCatalog.length, 395, "首批门诊目录应为 395 条");
assert.ok(outpatientCatalog.every(drug => drug.pharmacyScopes?.includes("outpatient")), "门诊目录条目必须属于门诊药库");

const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
for (const pharmacyId of ["ward", "outpatient"]) {
  assert.match(htmlSource, new RegExp(`data-pharmacy-switch=["']${pharmacyId}["']`), `页面必须提供 ${pharmacyId} 药库切换入口`);
}
assert.match(appSource, /activePharmacy:\s*normalizePharmacyId/, "当前药库必须持久化并校验");
assert.match(appSource, /id="searchPharmacy"/, "搜索页必须允许选择当前或全部药库");
assert.match(appSource, /name="pharmacyScope"/, "添加药品表单必须选择所属药库");
assert.match(appSource, /pharmacyScopes:\s*\[pharmacyScope\]/, "新建药品必须保存药库归属");
assert.match(appSource, /ensureOutpatientCatalogLoaded\(\)/, "切换门诊药库前必须加载独立目录");
assert.ok(!htmlSource.includes('src="outpatient-drugs.js"'), "门诊目录不得阻塞首屏加载");
assert.ok(htmlSource.indexOf('src="outpatient-loader.js"') < htmlSource.indexOf('src="app.js"'), "门诊懒加载器必须在主应用前就绪");

console.log(`双药库测试通过｜病房药库 ${wardCatalog.length} 条｜门诊药库 ${outpatientCatalog.length} 条`);

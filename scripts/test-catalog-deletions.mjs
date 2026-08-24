import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const deletedNames = new Set(["丹七片", "格列吡嗪片", "格列齐特片(II)"]);
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drugs.js", "utf8"), context);

const catalog = context.window.DRUG_CATALOG;
const labels = JSON.parse(fs.readFileSync("chinese-drug-labels.json", "utf8"));
assert.equal(catalog.length, 164, "病房药库应彻底删除 3 种后保留 164 条");
assert.equal(labels.drugs.length, 164, "中文核验库应同步彻底删除 3 条资料");
for (const deletedName of deletedNames) {
  assert.ok(!catalog.some(drug => drug.drugName === deletedName), `${deletedName}不得保留在病房目录`);
  assert.ok(!labels.drugs.some(drug => drug.drugName === deletedName), `${deletedName}不得保留在中文核验库`);
}

assert.equal(catalog.find(drug => drug.drugName === "阿普唑仑片")?.id, "drug-003", "删除 drug-002 后后续历史 ID 不得前移");
assert.equal(catalog.find(drug => drug.drugName === "丹参酮IIA磺酸钠注射液")?.id, "drug-027", "删除 drug-026 后后续历史 ID 不得前移");
assert.equal(catalog.find(drug => drug.drugName === "丹栀逍遥丸")?.id, "drug-030", "删除 drug-029 后后续历史 ID 不得前移");
for (const reservedId of ["drug-002", "drug-026", "drug-029"]) {
  assert.ok(!catalog.some(drug => drug.id === reservedId), `${reservedId}必须保留为空位，不能分配给其他药品`);
}

const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");
assert.ok(!html.includes("catalog-retirements.js"), "页面不得继续加载停用过滤脚本");
assert.ok(!worker.includes("catalog-retirements.js"), "离线缓存不得继续保留停用过滤脚本");
assert.match(html, /病房药库<\/span><strong data-pharmacy-count>164<\/strong>/, "首页初始病房药库数量应为 164");
const cacheVersion = Number(worker.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 47, "永久删除药品后必须升级 PWA 缓存版本");

console.log("病房药库永久删除检查通过｜3 种药品及核验资料已删除｜其余 164 条历史 ID 保持稳定");

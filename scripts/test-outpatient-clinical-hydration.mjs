import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const listeners = new Map();
const context = vm.createContext({
  console,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
});
context.window = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  dispatchEvent() {}
};

const run = relativePath => vm.runInContext(
  fs.readFileSync(path.join(root, relativePath), "utf8"),
  context,
  { filename: relativePath }
);

run("outpatient-clinical-supplement.js");
run("outpatient-clinical-hydration.js");
run("outpatient-drugs.js");
run("outpatient-web-verification.js");

const labels = JSON.parse(fs.readFileSync(path.join(root, "chinese-drug-labels.json"), "utf8"));
const result = context.window.applyOutpatientClinicalReferences(context.window.OUTPATIENT_DRUG_CATALOG, labels);

assert.equal(result.catalog.length, 395, "门诊说明书匹配不得改变目录总数");
assert.equal(result.hydratedCount, 129, "应只复用 129 条同药品名称（含剂型）、同成分规格的已核验资料");

const hydrated = result.catalog.filter(drug => drug.outpatientClinicalReference);
assert.equal(hydrated.length, 129, "匹配标记数量应与复用计数一致");
for (const drug of hydrated) {
  assert.equal(drug.outpatientClinicalReference.status, "matched-existing-verified-source");
  assert.equal(drug.outpatientClinicalReference.hydratedAt, "2026-08-25");
  assert.ok(drug.inventorySource, `${drug.internalCode} 应保留门诊库存来源`);
  assert.match(drug.source?.url || "", /^https:\/\//, `${drug.internalCode} 应保留可追溯的 HTTPS 说明书来源`);
  for (const field of ["indication", "dosage", "adverseReactions", "precautions"]) {
    assert.ok(String(drug.clinical?.[field] || "").trim(), `${drug.internalCode} 缺少 clinical.${field}`);
  }
}

const byCode = code => result.catalog.find(drug => drug.internalCode === code);
const metforminGlipizide = byCode("FX5882");
assert.equal(metforminGlipizide.drugName, "二甲双胍格列吡嗪片");
assert.equal(metforminGlipizide.specification, "250mg:2.5mg*24片/盒");
assert.equal(metforminGlipizide.qualityIssue, "", "24片/盒已确认，不得继续显示待核验警告");
assert.equal(metforminGlipizide.metadataVerification?.status, "verified");
assert.equal(metforminGlipizide.metadataVerification?.checkedAt, "2026-08-24");
assert.match(metforminGlipizide.packagingNote, /已确认：24片\/盒/);
assert.equal(metforminGlipizide.approvalNumber, "国药准字H20140028");
assert.ok(metforminGlipizide.clinical, "二甲双胍格列吡嗪片应自动填充说明书四字段");

assert.equal(byCode("FX6011").clinical, null, "Ⅲ 型不得套用 Ⅱ 型说明书资料");
assert.equal(byCode("FX0753").clinical, null, "240mg 品规不得套用其他成分规格资料");
assert.ok(byCode("FX6121").clinical, "200mg 同名同成分规格品规应复用已核验资料");
assert.equal(result.catalog.filter(drug => drug.source?.status === "needs-review").length, 0, "门诊目录不应再有待核验状态");

const coverage = context.window.applyOutpatientClinicalCoverage(context.window.OUTPATIENT_DRUG_CATALOG, labels);
assert.equal(coverage.hydratedCount, 129);
assert.equal(coverage.supplementedCount, 266, "剩余 266 条门诊药应由逐条核验的公开说明书摘要补齐");
assert.equal(coverage.totalClinicalCount, 395, "门诊 395 条药品均应具备临床四字段");
assert.equal(coverage.catalog.filter(drug => !drug.clinical).length, 0);
for (const drug of coverage.catalog) {
  for (const field of ["indication", "dosage", "adverseReactions", "precautions"]) {
    assert.ok(String(drug.clinical?.[field] || "").trim(), `${drug.internalCode} 缺少 clinical.${field}`);
  }
  assert.match(drug.source?.url || "", /^https:\/\//, `${drug.internalCode} 应有 HTTPS 说明书来源`);
}

const blockedResult = context.window.applyOutpatientClinicalReferences([{
  internalCode: "TEST",
  drugName: "测试片",
  specification: "1mg*10片/盒",
  clinical: null
}], { drugs: [{
  drugName: "测试片",
  specification: "1mg*10片/盒",
  clinical: { indication: "测试", dosage: "测试", adverseReactions: "测试", precautions: "测试" },
  source: { status: "blocked", url: "https://example.com/blocked" }
}] });
assert.equal(blockedResult.hydratedCount, 0, "锁定或非核验状态的资料不得复用到门诊药库");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert.ok(
  !html.includes('src="outpatient-clinical-supplement.js"')
  && html.indexOf('src="outpatient-clinical-hydration.js"') > html.indexOf('src="catalog-data-loader.js"')
  && html.indexOf('src="outpatient-clinical-hydration.js"') < html.indexOf('src="app.js"'),
  "门诊补充资料应保持按需加载，匹配控制器应在共享加载器之后、app.js 之前加载"
);
assert.match(fs.readFileSync(path.join(root, "outpatient-loader.js"), "utf8"), /outpatient-clinical-supplement\.js/);
assert.match(
  app,
  /catalog = await window\.hydrateOutpatientClinicalCatalog\(catalog\)/,
  "切换或恢复门诊药库时必须等待 395 条临床资料全部装载后再渲染"
);

const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const cacheVersion = Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 49, "门诊说明书复用缓存版本不得低于 v49");
assert.match(serviceWorker, /\.\/outpatient-clinical-hydration\.js/);
assert.match(serviceWorker, /\.\/outpatient-clinical-supplement\.js/);

const metadataUi = fs.readFileSync(path.join(root, "outpatient-metadata-ui.js"), "utf8");
assert.match(metadataUi, /!drug\?\.metadataVerification && !drug\?\.outpatientClinicalReference/);
assert.match(metadataUi, /说明书资料匹配/);

console.log("门诊说明书覆盖测试通过：129 条安全复用 + 266 条逐条补充 = 395 条完整资料");

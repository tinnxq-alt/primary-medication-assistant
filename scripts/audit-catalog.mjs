import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_CATALOG_COUNT = 164;
const EXPECTED_OUTPATIENT_CATALOG_COUNT = 395;
const EXPECTED_OUTPATIENT_VERIFICATION_COUNT = 22;
const EXPECTED_THERAPEUTIC_CLASS_COUNT = 44;
const EXPECTED_TRADE_NAME_ALIAS_COUNT = 13;
const VERIFIED_STATUSES = new Set([
  "verified-template",
  "verified-label",
  "verified-monograph",
  "verified-regulator"
]);
const CLINICAL_FIELDS = ["indication", "dosage", "adverseReactions", "precautions"];
const DELETED_WARD_DRUG_NAMES = new Set(["丹七片", "格列吡嗪片", "格列齐特片(II)"]);
const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function countBy(items, keyFor) {
  return items.reduce((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

globalThis.window = {};
await import(pathToFileURL(path.join(ROOT, "drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-web-verification.js")).href);

const catalog = globalThis.window.DRUG_CATALOG;
const outpatientCatalog = globalThis.window.OUTPATIENT_DRUG_CATALOG;
const labels = JSON.parse(readText("chinese-drug-labels.json"));

if (!Array.isArray(catalog)) fail("drugs.js 未生成 window.DRUG_CATALOG 数组");
if (!Array.isArray(outpatientCatalog)) fail("outpatient-drugs.js 未生成 window.OUTPATIENT_DRUG_CATALOG 数组");
if (labels.schemaVersion !== 1 || labels.language !== "zh-CN" || !Array.isArray(labels.drugs)) {
  fail("chinese-drug-labels.json 的 schemaVersion、language 或 drugs 格式无效");
}
if (!Array.isArray(labels.tradeNameAliases)) fail("chinese-drug-labels.json 缺少 tradeNameAliases 数组");

if (Array.isArray(catalog) && catalog.length !== EXPECTED_CATALOG_COUNT) {
  fail(`目录应有 ${EXPECTED_CATALOG_COUNT} 条，实际为 ${catalog.length} 条`);
}
if (Array.isArray(outpatientCatalog) && outpatientCatalog.length !== EXPECTED_OUTPATIENT_CATALOG_COUNT) {
  fail(`门诊目录应有 ${EXPECTED_OUTPATIENT_CATALOG_COUNT} 条，实际为 ${outpatientCatalog.length} 条`);
}
if (globalThis.window.OUTPATIENT_WEB_VERIFICATION_COUNT !== EXPECTED_OUTPATIENT_VERIFICATION_COUNT) {
  fail(`门诊网络核验补丁应有 ${EXPECTED_OUTPATIENT_VERIFICATION_COUNT} 条，实际为 ${globalThis.window.OUTPATIENT_WEB_VERIFICATION_COUNT || 0} 条`);
}
if (Array.isArray(labels.drugs) && labels.drugs.length !== EXPECTED_CATALOG_COUNT) {
  fail(`核验库应有 ${EXPECTED_CATALOG_COUNT} 条，实际为 ${labels.drugs.length} 条`);
}
if (Array.isArray(labels.tradeNameAliases) && labels.tradeNameAliases.length !== EXPECTED_TRADE_NAME_ALIAS_COUNT) {
  fail(`商品名别名应有 ${EXPECTED_TRADE_NAME_ALIAS_COUNT} 条，实际为 ${labels.tradeNameAliases.length} 条`);
}
for (const deletedName of DELETED_WARD_DRUG_NAMES) {
  if ((catalog || []).some(drug => drug.drugName === deletedName)) fail(`${deletedName}仍存在于病房目录`);
  if ((labels.drugs || []).some(drug => drug.drugName === deletedName)) fail(`${deletedName}仍存在于中文核验库`);
}

const normalizedTradeNames = new Set();
const normalizeLookup = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, "");
for (const [index, alias] of (labels.tradeNameAliases || []).entries()) {
  const label = `商品名别名第 ${index + 1} 条（${alias.tradeName || "未命名"}）`;
  for (const field of ["tradeName", "drugName", "genericName"]) {
    if (!isNonEmpty(alias[field])) fail(`${label}缺少 ${field}`);
  }
  const normalized = normalizeLookup(alias.tradeName);
  if (normalized.length < 2) fail(`${label}过短，无法安全用于模糊识别`);
  if (normalizedTradeNames.has(normalized)) fail(`${label}重复`);
  normalizedTradeNames.add(normalized);
  if (!isNonEmpty(alias.source?.label)) fail(`${label}缺少来源标题`);
  if (!isHttpsUrl(alias.source?.url)) fail(`${label}的来源 URL 不是有效 HTTPS 地址`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alias.source?.checkedAt || "")) fail(`${label}的核验日期格式无效`);
  const targets = (labels.drugs || []).filter(drug => drug.drugName === alias.drugName && drug.genericName === alias.genericName);
  if (!targets.length) fail(`${label}未映射到核验库中的品种与通用名`);
  if (targets.length && !targets.some(drug => VERIFIED_STATUSES.has(drug.source?.status))) fail(`${label}只映射到不可用或锁定条目`);
}

const expectedAliasMappings = {
  "拜唐苹": "阿卡波糖",
  "络活喜": "苯磺酸氨氯地平",
  "倍他乐克": "酒石酸美托洛尔",
  "百多邦": "莫匹罗星"
};
for (const [tradeName, genericName] of Object.entries(expectedAliasMappings)) {
  const alias = (labels.tradeNameAliases || []).find(item => item.tradeName === tradeName);
  if (alias?.genericName !== genericName) fail(`关键商品名 ${tradeName} 未正确映射到 ${genericName}`);
}

const catalogIds = new Set();
const therapeuticClasses = new Set();
for (const [index, drug] of (catalog || []).entries()) {
  const label = `目录第 ${index + 1} 条（${drug.drugName || "未命名"}）`;
  for (const field of ["id", "drugName", "genericName", "specification", "category", "dosageForm", "therapeuticClass"]) {
    if (!isNonEmpty(drug[field])) fail(`${label}缺少 ${field}`);
  }
  if (catalogIds.has(drug.id)) fail(`${label}使用了重复 ID：${drug.id}`);
  catalogIds.add(drug.id);
  if (drug.pharmacyScopes?.length !== 1 || drug.pharmacyScopes[0] !== "ward") fail(`${label}必须且只能属于病房药库`);
  if (isNonEmpty(drug.therapeuticClass)) therapeuticClasses.add(drug.therapeuticClass);
  if (drug.therapeuticClass === "作用待分类") fail(`${label}尚未分配作用分类`);
}

for (const [index, drug] of (outpatientCatalog || []).entries()) {
  const label = `门诊目录第 ${index + 1} 条（${drug.drugName || "未命名"}）`;
  for (const field of ["id", "drugName", "genericName", "specification", "category", "dosageForm", "therapeuticClass"]) {
    if (!isNonEmpty(drug[field])) fail(`${label}缺少 ${field}`);
  }
  if (catalogIds.has(drug.id)) fail(`${label}与其他药库使用了重复 ID：${drug.id}`);
  catalogIds.add(drug.id);
  if (!Array.isArray(drug.pharmacyScopes) || !drug.pharmacyScopes.includes("outpatient")) fail(`${label}必须属于门诊药库`);
}

const verifiedOutpatient = (outpatientCatalog || []).filter(drug => drug.metadataVerification);
if (verifiedOutpatient.length !== EXPECTED_OUTPATIENT_VERIFICATION_COUNT) {
  fail(`门诊目录应用网络核验补丁后应有 ${EXPECTED_OUTPATIENT_VERIFICATION_COUNT} 条主数据记录，实际为 ${verifiedOutpatient.length} 条`);
}

if (therapeuticClasses.size !== EXPECTED_THERAPEUTIC_CLASS_COUNT) {
  fail(`作用分类应有 ${EXPECTED_THERAPEUTIC_CLASS_COUNT} 类，实际为 ${therapeuticClasses.size} 类`);
}

const unusedLabels = new Set((labels.drugs || []).map((_, index) => index));
const matched = [];

for (const drug of (catalog || [])) {
  const candidates = [...unusedLabels].filter(index => {
    const entry = labels.drugs[index];
    return entry.drugName === drug.drugName && entry.specification === drug.specification;
  });

  if (candidates.length !== 1) {
    fail(`${drug.drugName}｜${drug.specification} 在核验库中匹配到 ${candidates.length} 条记录`);
    continue;
  }

  const labelIndex = candidates[0];
  unusedLabels.delete(labelIndex);
  matched.push({ catalog: drug, verified: labels.drugs[labelIndex] });
}

for (const index of unusedLabels) {
  const entry = labels.drugs[index];
  fail(`核验库存在未匹配目录的记录：${entry.drugName}｜${entry.specification}`);
}

for (const { catalog: drug, verified } of matched) {
  const label = `${drug.drugName}｜${drug.specification}`;
  if (verified.genericName !== drug.genericName) fail(`${label} 的通用名在目录与核验库中不一致`);
  if (verified.dosageForm !== drug.dosageForm) fail(`${label} 的剂型在目录与核验库中不一致`);
  if (verified.category !== drug.category) fail(`${label} 的药品属性在目录与核验库中不一致`);

  for (const field of CLINICAL_FIELDS) {
    if (!isNonEmpty(verified.clinical?.[field])) fail(`${label} 缺少临床字段 clinical.${field}`);
  }

  const status = verified.source?.status;
  if (!VERIFIED_STATUSES.has(status) && status !== "blocked") {
    fail(`${label} 使用了不允许的核验状态：${status || "空"}`);
  }
  if (!isNonEmpty(verified.source?.label)) fail(`${label} 缺少来源标题`);
  if (!isHttpsUrl(verified.source?.url)) fail(`${label} 的来源 URL 不是有效 HTTPS 地址`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verified.source?.checkedAt || "")) fail(`${label} 的核验日期格式无效`);

  if (status === "blocked") {
    if (!isNonEmpty(drug.qualityIssue)) fail(`${label} 被锁定但未说明 qualityIssue`);
    if (!String(drug.specification).includes("待核验")) fail(`${label} 被锁定但规格未标记待核验`);
  }
}

const statusCounts = countBy(matched, pair => pair.verified.source?.status || "missing");
const verifiedCount = [...VERIFIED_STATUSES].reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
const blocked = matched.filter(pair => pair.verified.source?.status === "blocked");
if (verifiedCount !== 164) fail(`可用核验资料应为 164 条，实际为 ${verifiedCount} 条`);
if (blocked.length !== 0) fail(`永久删除后不应再有安全锁定项，实际为 ${blocked.length} 条`);

const appSource = readText("app.js");
const catalogLoaderSource = readText("catalog-data-loader.js");
const serviceWorkerSource = readText("service-worker.js");
const loaderCatalogVersions = [...catalogLoaderSource.matchAll(/chinese-drug-labels\.json\?v=(\d+)/g)].map(match => match[1]);
const appCatalogVersion = loaderCatalogVersions[0];
const cacheCatalogVersion = serviceWorkerSource.match(/chinese-drug-labels\.json\?v=(\d+)/)?.[1];
if (loaderCatalogVersions.length !== 1 || appCatalogVersion !== cacheCatalogVersion) {
  fail(`catalog-data-loader.js 与 service-worker.js 的核验库缓存版本不一致：${loaderCatalogVersions.join("、") || "缺失"} / ${cacheCatalogVersion || "缺失"}`);
}
if ((appSource.match(/loadChineseDrugLabels\(\)/g) || []).length < 2) fail("app.js 必须复用中文核验库单例加载器");
for (const [relativePath, source] of [["app.js", appSource], ["fast-search-ui.js", readText("fast-search-ui.js")], ["smart-add-fix.js", readText("smart-add-fix.js")]]) {
  if (/chinese-drug-labels\.json/.test(source)) fail(`${relativePath} 不得绕过中文核验库单例加载器`);
}

const runtimeFiles = ["app.js", "catalog-data-loader.js", "drug-lookup.js", "pharmacy-scope.js", "outpatient-loader.js", "outpatient-drugs.js", "outpatient-web-verification.js", "index.html", "style.css", "worker/src/index.js"];
const forbiddenRuntimePatterns = [
  { label: "OCR", pattern: /\bocr\b/i },
  { label: "相机调用", pattern: /getUserMedia\s*\(/i },
  { label: "动态拍照上传", pattern: /(?:\.capture\s*=|setAttribute\s*\(\s*["']capture["'])/i }
];
for (const relativePath of runtimeFiles) {
  const source = readText(relativePath);
  for (const forbidden of forbiddenRuntimePatterns) {
    if (forbidden.pattern.test(source)) fail(`${relativePath} 重新引入了${forbidden.label}相关代码`);
  }
}

const htmlSource = readText("index.html");
if (htmlSource.indexOf('src="drug-lookup.js"') < 0 || htmlSource.indexOf('src="drug-lookup.js"') > htmlSource.indexOf('src="app.js"')) {
  fail("index.html 必须在 app.js 之前加载 drug-lookup.js");
}
for (const script of ["outpatient-loader.js", "outpatient-web-verification.js", "pharmacy-scope.js"]) {
  if (htmlSource.indexOf(`src="${script}"`) < 0 || htmlSource.indexOf(`src="${script}"`) > htmlSource.indexOf('src="app.js"')) {
    fail(`index.html 必须在 app.js 之前加载 ${script}`);
  }
}
if (htmlSource.indexOf('src="catalog-data-loader.js"') < 0 || htmlSource.indexOf('src="catalog-data-loader.js"') > htmlSource.indexOf('src="app.js"')) {
  fail("index.html 必须在 app.js 之前加载 catalog-data-loader.js");
}
if (htmlSource.includes('src="outpatient-drugs.js"')) fail("index.html 不得同步加载体积较大的门诊目录");
if (htmlSource.indexOf('src="outpatient-loader.js"') > htmlSource.indexOf('src="outpatient-web-verification.js"')) {
  fail("index.html 必须先加载门诊懒加载器，再加载网络核验补丁");
}
if (!/ensureOutpatientCatalogLoaded\(\)/.test(appSource) || !/loadOutpatientDrugCatalog/.test(appSource)) {
  fail("app.js 切换门诊药库时必须触发门诊目录懒加载");
}
for (const shellFile of ["outpatient-loader.js", "outpatient-drugs.js", "outpatient-web-verification.js", "pharmacy-scope.js", "catalog-data-loader.js"]) {
  if (!serviceWorkerSource.includes(`"./${shellFile}"`)) fail(`service-worker.js 必须离线缓存 ${shellFile}`);
}
if (/accept\s*=\s*["'][^"']*image/i.test(htmlSource)) fail("index.html 重新引入了图片文件上传入口");
if (/<input\b[^>]*\bcapture(?:\s*=|\s|>)/i.test(htmlSource)) fail("index.html 重新引入了拍照上传入口");

if (errors.length) {
  console.error(`药品目录质控失败（${errors.length} 项）：`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  process.exit(1);
}

console.log([
  "药品目录质控通过",
  `病房药库 ${catalog.length} 条`,
  `门诊药库 ${outpatientCatalog.length} 条`,
  `门诊主数据核验 ${verifiedOutpatient.length} 条`,
  `可用核验资料 ${verifiedCount} 条`,
  `安全锁定 ${blocked.length} 条`,
  `作用分类 ${therapeuticClasses.size} 类`,
  `商品名别名 ${labels.tradeNameAliases.length} 条`,
  `核验库缓存版本 v${appCatalogVersion}`,
  "未发现 OCR / 相机 / 图片上传入口"
].join("｜"));

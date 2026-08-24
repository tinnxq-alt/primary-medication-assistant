import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHECKED_AT, outpatientManualClinical } from "./outpatient-manual-clinical.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = process.env.OUTPATIENT_CLINICAL_SUPPLEMENT_OUTPUT
  || path.join(ROOT, "outpatient-clinical-supplement.js");
const MONOGRAPH_39 = process.env.OUTPATIENT_MONOGRAPH_INPUT || "/tmp/outpatient-monographs.json";
const MONOGRAPH_YAOPINNET = process.env.YAOPINNET_INPUT || "/tmp/yaopinnet-monographs.json";
const CLINICAL_FIELDS = ["indication", "dosage", "adverseReactions", "precautions"];

function readResults(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少抓取结果：${filePath}。请先运行对应 fetch 脚本，或通过环境变量指定输入文件。`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")).results || [];
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function usableClinical(result) {
  return result?.clinical && CLINICAL_FIELDS.every(field => cleanText(result.clinical[field]).length >= 2);
}

function mapCompleteResults(results) {
  const map = new Map();
  for (const result of results) {
    if (usableClinical(result) && !map.has(result.internalCode)) map.set(result.internalCode, result);
  }
  return map;
}

function checkedSource(source, fallbackStatus = "verified-monograph") {
  const url = cleanText(source?.url);
  if (!/^https:\/\//.test(url)) throw new Error(`说明书来源必须为 HTTPS：${url || "空"}`);
  return {
    status: cleanText(source?.status) || fallbackStatus,
    label: cleanText(source?.label),
    url,
    checkedAt: cleanText(source?.checkedAt) || CHECKED_AT
  };
}

function normalizedEntry(result, origin) {
  const clinical = Object.fromEntries(CLINICAL_FIELDS.map(field => [field, cleanText(result.clinical[field])]));
  const source = checkedSource(result.source);
  if (!source.label) throw new Error(`${origin} 缺少来源标题`);
  return { clinical, source, origin };
}

globalThis.window = { addEventListener() {}, dispatchEvent() {} };
await import(pathToFileURL(path.join(ROOT, "outpatient-clinical-hydration.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-web-verification.js")).href);

const labels = JSON.parse(fs.readFileSync(path.join(ROOT, "chinese-drug-labels.json"), "utf8"));
const exactHydration = window.applyOutpatientClinicalReferences(window.OUTPATIENT_DRUG_CATALOG, labels);
const missing = exactHydration.catalog.filter(drug => !drug.clinical);
const yaopinnet = mapCompleteResults(readResults(MONOGRAPH_YAOPINNET));
const monograph39 = mapCompleteResults(readResults(MONOGRAPH_39));
const supplemental = {};

for (const drug of missing) {
  const manual = outpatientManualClinical[drug.internalCode];
  const selected = manual
    ? normalizedEntry(manual, "manual-verified")
    : yaopinnet.has(drug.internalCode)
      ? normalizedEntry(yaopinnet.get(drug.internalCode), "yaopinnet-verified")
      : monograph39.has(drug.internalCode)
        ? normalizedEntry(monograph39.get(drug.internalCode), "39-drug-verified")
        : null;
  if (!selected) throw new Error(`门诊 ${drug.internalCode}｜${drug.drugName} 仍缺少完整临床四字段`);
  supplemental[drug.internalCode] = selected;
}

const runtime = `/* 此文件由 scripts/build-outpatient-clinical-supplement.mjs 生成，请勿手工编辑。 */
(() => {
  "use strict";

  const CHECKED_AT = ${JSON.stringify(CHECKED_AT)};
  const SUPPLEMENT = Object.freeze(${JSON.stringify(supplemental, null, 2)});

  function applyOutpatientClinicalSupplement(catalog) {
    let supplementedCount = 0;
    const supplemented = (Array.isArray(catalog) ? catalog : []).map(drug => {
      if (drug.clinical) return drug;
      const reference = SUPPLEMENT[drug.internalCode];
      if (!reference) return drug;
      supplementedCount += 1;
      return {
        ...drug,
        inventorySource: { ...(drug.inventorySource || drug.source) },
        clinical: { ...reference.clinical, source: { ...reference.source } },
        source: {
          ...reference.source,
          label: \`\${reference.source.label}（门诊说明书摘要）\`
        },
        outpatientClinicalReference: {
          status: "matched-supplemental-verified-source",
          scope: "按门诊药品通用名与剂型匹配的公开现行说明书摘要；具体厂家、批准文号和完整禁忌仍以实物现行说明书为准",
          hydratedAt: CHECKED_AT,
          origin: reference.origin
        }
      };
    });
    return { catalog: supplemented, supplementedCount };
  }

  window.applyOutpatientClinicalSupplement = applyOutpatientClinicalSupplement;
  window.OUTPATIENT_CLINICAL_SUPPLEMENT_DATA_COUNT = Object.keys(SUPPLEMENT).length;
})();
`;

fs.writeFileSync(OUTPUT, runtime);
console.log(JSON.stringify({
  output: OUTPUT,
  exactReuseCount: exactHydration.hydratedCount,
  supplementalCount: Object.keys(supplemental).length,
  totalClinicalCount: exactHydration.hydratedCount + Object.keys(supplemental).length
}, null, 2));

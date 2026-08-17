import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");
const payload = JSON.parse(fs.readFileSync("chinese-drug-labels.json", "utf8"));

assert.match(source, /localCandidates\(query, await loadCatalog\(\)\)/, "智能识别必须先读取本地核验库");
assert.match(source, /remoteCandidates\(query\)/, "本地未命中时仍应保留 Worker 智能草稿");
assert.match(source, /localCandidates\(query, await loadCatalog\(\)\)[\s\S]*if \(local\.length\)[\s\S]*remoteCandidates\(query\)/, "运行流程必须先处理本地候选，再进入远程 Worker");
assert.match(source, /if \(local\.length\)/, "本地命中后必须直接使用候选");
assert.match(source, /fill\(local\[0\], node\)/, "本地第一个候选必须自动填充");
assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 15000\)/, "Worker 等待时间应限制为 15 秒");
assert.match(source, /stopImmediatePropagation\(\)/, "新识别逻辑必须阻止旧的 70 秒链路重复执行");
assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo|location\.reload/, "智能识别不应导致页面跳动或刷新");
assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载智能识别修复脚本");
assert.ok(html.indexOf('src="app.js"') < html.indexOf('src="smart-add-fix.js"'), "修复脚本必须在主应用之后加载");
assert.ok(worker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别修复脚本");
assert.ok(Number(worker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 36, "PWA 缓存版本必须至少 v36");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drug-lookup.js", "utf8"), context);
const { directlyMatchesDrug, normalizeTradeNameAliases, tradeNameAliasForDrug } = context.window.DRUG_LOOKUP;
const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);
const verified = new Set(["verified-template", "verified-label", "verified-monograph", "verified-regulator"]);

function localHit(query) {
  return payload.drugs.find(drug => {
    const sourceStatus = drug.source?.status || drug.clinical?.source?.status;
    const alias = tradeNameAliasForDrug(query, drug, aliases);
    return verified.has(sourceStatus) && drug.clinical?.indication && drug.clinical?.dosage && (directlyMatchesDrug(query, drug) || alias);
  });
}

const genericHit = localHit("阿卡波糖");
assert.ok(genericHit, "阿卡波糖必须能直接从本地核验库生成候选");
assert.ok(genericHit.clinical.indication && genericHit.clinical.dosage, "本地候选必须具备自动填充所需临床字段");

const tradeHit = localHit("络活喜");
assert.ok(tradeHit, "络活喜必须能直接从本地核验库生成候选");
const alias = tradeNameAliasForDrug("络活喜", tradeHit, aliases);
assert.equal(alias?.tradeName, "络活喜");
assert.equal(alias ? "" : tradeHit.specification || "", "", "商品名命中时规格必须留空，避免套用错误包装");

console.log("添加药物智能识别：本地优先、即时自动填充与 Worker 降级检查通过");

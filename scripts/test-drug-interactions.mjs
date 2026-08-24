import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
await import(pathToFileURL(path.join(root, "drugs.js")).href);
await import(pathToFileURL(path.join(root, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(root, "outpatient-web-verification.js")).href);
await import(pathToFileURL(path.join(root, "drug-interactions.js")).href);

const catalog = [...window.DRUG_CATALOG, ...window.OUTPATIENT_DRUG_CATALOG];
const byName = name => catalog.find(drug => drug.drugName === name);
const matchIds = (a, b) => window.DRUG_INTERACTIONS.findMatches(byName(a), byName(b)).map(rule => rule.id);

assert.ok(matchIds("盐酸贝那普利片", "沙库巴曲缬沙坦钠片").includes("acei-arni-36h"));
assert.ok(matchIds("辛伐他汀片", "先诺特韦片/利托那韦片组合包装").includes("ritonavir-simvastatin"));
assert.ok(matchIds("硫酸氢氯吡格雷片", "艾司奥美拉唑镁肠溶片").includes("clopidogrel-omeprazole"));
assert.ok(matchIds("利伐沙班片", "新癀片").includes("rivaroxaban-nsaid"), "含吲哚美辛的新癀片应触发抗凝出血警示");
assert.ok(!matchIds("利伐沙班片", "布洛芬乳膏").includes("rivaroxaban-nsaid"), "外用布洛芬不得按全身 NSAID 规则误报");
assert.ok(matchIds("左甲状腺素钠片", "碳酸钙D3片").includes("levothyroxine-calcium-iron"));

const acei = byName("盐酸贝那普利片");
const relevant = window.DRUG_INTERACTIONS.findRelevant(acei, catalog);
assert.ok(relevant.some(item => item.rule.id === "acei-arni-36h" && item.partners.length));
for (const rule of window.DRUG_INTERACTIONS.rules) {
  assert.ok(["禁忌", "严重", "需监测"].includes(rule.severity));
  assert.match(rule.source?.url || "", /^https:\/\//);
  assert.equal(rule.source?.checkedAt, "2026-08-25");
  for (const field of ["mechanism", "consequence", "recommendation"]) assert.ok(rule[field]);
}

console.log(`药物相互作用测试通过：${window.DRUG_INTERACTIONS.rules.length} 条来源可追溯的高风险规则`);

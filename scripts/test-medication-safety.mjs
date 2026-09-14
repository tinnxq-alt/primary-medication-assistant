import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
globalThis.window = {};
for (const file of ['drugs.js','outpatient-drugs.js','outpatient-web-verification.js','medication-safety.js','drug-interactions.js']) await import(new URL(file, root));
const engine = window.DRUG_INTERACTIONS;
const catalog = [...window.DRUG_CATALOG, ...window.OUTPATIENT_DRUG_CATALOG];
const drug = name => { const found = catalog.find(d => d.drugName === name); assert.ok(found, `药库内须存在 ${name}`); return found; };
const ids = (a,b) => engine.findMatches(a,b).map(r=>r.id);
const positive = [
  ['瑞格列奈二甲双胍片(Ⅰ)','硫酸氢氯吡格雷片','repaglinide-clopidogrel'],
  ['地高辛片','盐酸普罗帕酮片','digoxin-inhibitors'],
  ['地高辛片','先诺特韦片/利托那韦片组合包装','digoxin-inhibitors'],
  ['地高辛片','琥珀酸美托洛尔缓释片','digoxin-beta'],
  ['地高辛片','螺内酯片','digoxin-spironolactone-assay'],
  ['盐酸舍曲林片','利伐沙班片','sertraline-bleeding'],
  ['螺内酯片','布洛芬缓释胶囊','spironolactone-nsaid'],
  ['螺内酯片','铝镁匹林片(II)','spironolactone-aspirin'],
  ['阿仑膦酸钠片','碳酸钙D3片','alendronate-cations'],
  ['吡格列酮二甲双胍片','人胰岛素注射液','pioglitazone-insulin'],
  ['左氧氟沙星片','二甲双胍格列吡嗪片','levofloxacin-glucose'],
  ['艾司唑仑片','硫酸吗啡缓释片','opioid-cns-depressant'],
  ['盐酸贝那普利片','氯化钾缓释片','raas-potassium'],
  ['利伐沙班片','铝镁匹林片(II)','rivaroxaban-antiplatelet']
];
for (const [a,b,id] of positive) {
  assert.ok(ids(drug(a),drug(b)).includes(id), `${a} + ${b}: ${id}`);
  assert.deepEqual(ids(drug(a),drug(b)),ids(drug(b),drug(a)), '反向查询须一致');
}
assert.ok(ids({drugName:'地高辛片'}, {drugName:'盐酸普罗帕酮片'}).includes('digoxin-inhibitors'), '无 ID 的不同输入也应匹配');
assert.ok(ids({drugName:'枸橼酸钾缓释胶囊'},drug('盐酸贝那普利片')).includes('raas-potassium'));
assert.ok(!ids(drug('枸橼酸铋钾胶囊'),drug('盐酸贝那普利片')).includes('raas-potassium'), '枸橼酸铋钾不是补钾药');
assert.ok(ids({id:'x',drugName:'复方片',components:[{name:'瑞格列奈'}]},drug('硫酸氢氯吡格雷片')).includes('repaglinide-clopidogrel'));
assert.deepEqual(ids(drug('地高辛片'),drug('地高辛片')),[]);
assert.deepEqual(ids(null,drug('地高辛片')),[]);
for (const name of ['左甲状腺素钠片','左氧氟沙星片','阿仑膦酸钠片']) {
  const matches = ids(drug(name),{id:'iv-calcium',drugName:'葡萄糖酸钙注射液',genericName:'葡萄糖酸钙',dosageForm:'注射剂'});
  assert.ok(!matches.some(id=>/calcium-iron|multivalent-cation|alendronate-cations/.test(id)), '静脉补钙不能触发口服吸收规则');
}
for (const name of ['布洛芬乳膏','双氯芬酸钠滴眼液','洛索洛芬钠凝胶贴膏']) {
  assert.deepEqual(ids(drug(name),drug('盐酸舍曲林片')), [], '局部 NSAID 不套全身风险');
}
assert.ok(ids(drug('吲哚美辛栓'),drug('利伐沙班片')).includes('rivaroxaban-nsaid'), '直肠全身吸收不得按局部排除');
assert.deepEqual(ids({id:'old',drugName:'维生素C片',rawName:'布洛芬片',tradeName:'含布洛芬字样的备注'},drug('利伐沙班片')), [], '修正后的名称不能被旧名称或商品名污染');
const contraindications = engine.findContraindications(drug('吡格列酮二甲双胍片'));
assert.ok(contraindications.some(r=>r.id==='metformin-renal'));
assert.ok(contraindications.some(r=>r.id==='pioglitazone-hf'));
assert.ok(contraindications.some(r=>r.id==='metformin-initiation' && r.severity==='慎用'));
assert.deepEqual(engine.findContraindications(drug('莫匹罗星软膏')),[]);
const allRules = [...engine.rules,...window.MEDICATION_SAFETY.contraindications];
assert.equal(new Set(allRules.map(r=>r.id)).size,allRules.length,'规则 ID 不得重复');
for (const rule of allRules) { assert.ok(rule.source.url.startsWith('https://')); assert.ok(rule.recommendation); }
const coverage = catalog.map(d=>({id:d.id,name:d.drugName,pharmacy:d.pharmacyScopes,contraindications:engine.findContraindications(d).map(r=>r.id),interactionRules:engine.rules.filter(r=>engine.matchesGroup(d,r.a)||engine.matchesGroup(d,r.b)).map(r=>r.id)}));
for(const rule of window.MEDICATION_SAFETY.interactions) {
  const a = catalog.filter(d=>engine.matchesGroup(d,rule.a));
  const b = catalog.filter(d=>engine.matchesGroup(d,rule.b));
  assert.ok(a.some(x=>b.some(y=>x.id!==y.id)),`新增规则必须关联实际药库组合: ${rule.id}`);
}
if (process.argv.includes('--report')) {
  fs.mkdirSync(new URL('docs/', root),{recursive:true});
  fs.writeFileSync(new URL('docs/safety-coverage.json',root),JSON.stringify({checkedAt:'2026-09-14',note:'匹配重点规则不等于完整审核；空列表代表尚未覆盖，不能判断安全。',total:catalog.length,interactionRules:engine.rules.length,singleRules:window.MEDICATION_SAFETY.contraindications.length,drugs:coverage},null,2)+'\n');
}
console.log(`安全回归通过：${catalog.length} 品规，${engine.rules.length} 联用规则，${window.MEDICATION_SAFETY.contraindications.length} 单药规则，${coverage.filter(d=>d.contraindications.length).length} 品规有单药提示。`);

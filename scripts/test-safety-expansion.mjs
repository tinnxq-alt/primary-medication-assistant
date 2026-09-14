import assert from 'node:assert/strict';
await import('./test-medication-safety.mjs');
const E=window.DRUG_INTERACTIONS;
const catalog=[...window.DRUG_CATALOG,...window.OUTPATIENT_DRUG_CATALOG];
const drug=name=>{const d=catalog.find(d=>d.drugName===name);assert.ok(d,`未找到实际药品 ${name}`);return d;};
const ids=(a,b)=>E.findMatches(a,b).map(r=>r.id);
const pairs=[
  ['盐酸贝那普利片','布洛芬缓释胶囊','acei-nsaid-renal'],
  ['缬沙坦胶囊','布洛芬缓释胶囊','arb-nsaid-renal'],
  ['马来酸依那普利片','厄贝沙坦氢氯噻嗪片','acei-arb-dual'],
  ['呋塞米注射液','地高辛片','furosemide-digoxin'],
  ['厄贝沙坦氢氯噻嗪片','地高辛片','hctz-digoxin'],
  ['阿卡波糖片','地高辛片','acarbose-digoxin'],
  ['阿卡波糖片','二甲双胍格列吡嗪片','acarbose-hypoglycemia'],
  ['二甲双胍格列吡嗪片','酒石酸美托洛尔片','sulfonylurea-beta'],
  ['达格列净片','人胰岛素注射液','dapagliflozin-insulin'],
  ['达格列净片','呋塞米片','dapagliflozin-loop'],
  ['左氧氟沙星氯化钠注射液','地塞米松磷酸钠注射液','levofloxacin-systemic-steroid'],
  ['辛伐他汀片','氨氯地平贝那普利片(II)','simvastatin-amlodipine'],
  ['辛伐他汀片','非诺贝特胶囊','simvastatin-fenofibrate']
];
for(const [a,b,id] of pairs){assert.ok(ids(drug(a),drug(b)).includes(id),id);assert.deepEqual(ids(drug(a),drug(b)),ids(drug(b),drug(a)));}
for(const rule of window.MEDICATION_SAFETY.contraindications) assert.ok(catalog.some(d=>E.matchesGroup(d,rule.group)),`单药规则须匹配实际药库: ${rule.id}`);
for(const name of ['布洛芬乳膏','双氯芬酸钠滴眼液']){
  assert.ok(!ids(drug(name),drug('盐酸贝那普利片')).includes('acei-nsaid-renal'));
  assert.ok(!E.findContraindications(drug(name)).some(r=>r.id==='nsaid-pregnancy'));
}
assert.ok(!ids(drug('左氧氟沙星滴眼液'),drug('地塞米松磷酸钠注射液')).includes('levofloxacin-systemic-steroid'));
for(const name of ['丁酸氢化可的松乳膏','吸入用布地奈德混悬液']) assert.ok(!ids(drug('左氧氟沙星片'),drug(name)).includes('levofloxacin-systemic-steroid'));
assert.ok(!ids(drug('左氧氟沙星片'),{id:'inhaled',drugName:'曲安奈德吸入剂'}).includes('levofloxacin-systemic-steroid'));
assert.ok(!ids(drug('辛伐他汀片'),drug('苯磺酸左氨氯地平片')).includes('simvastatin-amlodipine'),'不同旋光体不直接照搬剂量限制');
assert.ok(!E.findContraindications({drugName:'头孢曲松口服片'}).some(r=>r.id.startsWith('ceftriaxone')),'必须验证注射途径');
assert.ok(!E.findContraindications(drug('阿司匹林肠溶片')).some(r=>r.id==='nsaid-pregnancy'),'不得泛化到低剂量阿司匹林');
assert.ok(!E.findContraindications(drug('脯氨酸恒格列净片')).some(r=>r.id==='dapagliflozin-surgery'),'国产格列净不得直接照搬达格列净时机');
const combo=E.findContraindications(drug('厄贝沙坦氢氯噻嗪片'));
assert.ok(combo.some(r=>r.id==='arb-pregnancy'));assert.ok(combo.some(r=>r.id==='hctz-anuria'));
assert.match(E.findContraindications(drug('琥珀酸美托洛尔缓释片')).find(r=>r.id==='metoprolol-succinate-contra').recommendation,/稳定慢性心衰可有适应症/);
console.log('扩展安全规则回归通过：13 个真实联用组合、全部单药规则命中及途径/成分/条件负例。');

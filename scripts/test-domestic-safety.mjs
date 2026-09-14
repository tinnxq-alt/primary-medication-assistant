import './test-medication-safety.mjs';
import assert from 'node:assert/strict';
const e=window.DRUG_INTERACTIONS;
const catalog=[...window.DRUG_CATALOG,...window.OUTPATIENT_DRUG_CATALOG];
const drug=name=>{const d=catalog.find(d=>d.drugName===name);assert.ok(d,name);return d;};
const ids=(a,b)=>e.findMatches(a,b).map(r=>r.id);
const z=drug('珍菊降压片(薄膜衣片)'),t=drug('酚麻美敏片(泰诺)');
for(const [a,b,id] of [
 [z,drug('地高辛片'),'hctz-digoxin'],
 [z,drug('氯沙坦钾氢氯噻嗪片'),'duplicate-hctz'],
 [z,drug('琥珀酸美托洛尔缓释片'),'zhenju-beta-withdrawal'],
 [t,drug('布洛芬缓释胶囊'),'tyc-nsaid'],
 [t,drug('阿普唑仑片'),'tyc-sedatives'],
 [t,drug('地高辛片'),'tyc-digitalis'],
 [t,{id:'apap',drugName:'复方片',components:[{name:'对乙酰氨基酚'}]},'duplicate-acetaminophen']
]){assert.ok(ids(a,b).includes(id),id);assert.deepEqual(ids(a,b),ids(b,a));}
assert.ok(e.findContraindications(z).some(r=>r.id==='zhenju-pregnancy'));
assert.ok(e.findContraindications(t).some(r=>r.id==='tyc-maoi'));
assert.ok(e.findContraindications(drug('苯溴马隆胶囊')).some(r=>r.id==='benzbromarone-liver'));
for(const d of [{drugName:'珍菊降压胶囊'},{drugName:'珍菊降压片外用贴膏'},{drugName:'维生素C片',rawName:'珍菊降压片',tradeName:'珍菊降压片'}])assert.ok(!ids(d,drug('地高辛片')).includes('hctz-digoxin'));
assert.ok(!ids(t,drug('布洛芬乳膏')).includes('tyc-nsaid'));
assert.ok(!ids({drugName:'复方氨酚伪麻胶囊'},t).includes('duplicate-acetaminophen'),'未核验别名不得猜测成分');
assert.ok(!e.findContraindications({drugName:'酚麻美敏口服液'}).some(r=>r.id==='tyc-maoi'),'产品特定规则不能套到另一剂型');
assert.deepEqual(ids(t,t),[]);
for(const a of window.MEDICATION_SAFETY.ingredientAliases)assert.ok(a.source.url.startsWith('https://'));
console.log('国内资料、隐藏成分及重复用药回归通过');

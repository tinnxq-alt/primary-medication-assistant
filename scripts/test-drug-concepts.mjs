
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('drug-concepts.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('clinical-data-contract.js', 'utf8'), context);

const concepts = context.window.DRUG_CONCEPTS;
const index = context.window.DRUG_CONCEPT_INDEX;
const contract = context.window.CLINICAL_DATA_CONTRACT;

assert.equal(concepts.length, 12, '首批注册表应完整覆盖 12 个急救药物身份');
assert.equal(new Set(concepts.map(item => item.id)).size, concepts.length, 'drug_id 必须唯一');
assert.ok(concepts.every(item => contract.validateDrugConcept(item).length === 0), '所有通用药物身份必须满足数据契约');
assert.ok(concepts.every(item => item.reviewStatus === 'identity-reviewed'), '身份审计状态必须明确');

assert.equal(index.byEmergencyName['肾上腺素'].id, 'drug-concept-epinephrine');
assert.equal(index.byEmergencyName['盐酸胺碘酮'].id, 'drug-concept-amiodarone');
assert.equal(index.byEmergencyName['头孢曲松（脑膜炎）'].id, 'drug-concept-ceftriaxone');
assert.deepEqual([...index.byId['drug-concept-aspirin'].productIds], ['drug-025', 'outpatient-dl0783', 'outpatient-gx0780']);
assert.deepEqual([...index.byId['drug-concept-glucose'].productIds], ['drug-096', 'outpatient-gx3674']);

for (const concept of concepts) {
  for (const productId of concept.productIds) {
    assert.equal(contract.validateDrugProduct({ productId, drugId: concept.id, pharmacyScopes: ['ward'] }).length, 0);
  }
}

console.log('通用药物身份注册表检查通过：12 个 drug_concepts，6 个院内品规关联，0 个重复 ID');


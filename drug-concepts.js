
(() => {
  'use strict';

  const concepts = [
    { id: 'drug-concept-epinephrine', drugName: '肾上腺素', aliases: ['盐酸肾上腺素'], productIds: [], inventoryEvidence: ['本院抢救车：盐酸肾上腺素 1 mg'] },
    { id: 'drug-concept-amiodarone', drugName: '胺碘酮', aliases: ['盐酸胺碘酮'], productIds: [], inventoryEvidence: ['本院抢救车：盐酸胺碘酮 0.15 g'] },
    { id: 'drug-concept-norepinephrine', drugName: '去甲肾上腺素', aliases: ['去甲肾上腺素'], productIds: [] },
    { id: 'drug-concept-salbutamol', drugName: '沙丁胺醇', aliases: ['硫酸沙丁胺醇'], productIds: [] },
    { id: 'drug-concept-ipratropium', drugName: '异丙托溴铵', aliases: ['异丙托溴铵'], productIds: [] },
    { id: 'drug-concept-aspirin', drugName: '阿司匹林', aliases: ['阿司匹林肠溶片'], productIds: ['drug-025', 'outpatient-dl0783', 'outpatient-gx0780'] },
    { id: 'drug-concept-glucose', drugName: '葡萄糖', aliases: ['葡萄糖注射液', '5%葡萄糖', '50%葡萄糖'], productIds: ['drug-096', 'outpatient-gx3674'], inventoryEvidence: ['本院抢救车：5%葡萄糖 250 mL', '本院抢救车：50%葡萄糖 10 g'] },
    { id: 'drug-concept-naloxone', drugName: '纳洛酮', aliases: ['盐酸纳洛酮'], productIds: [] },
    { id: 'drug-concept-levetiracetam', drugName: '左乙拉西坦', aliases: ['左乙拉西坦'], productIds: [] },
    { id: 'drug-concept-diazepam', drugName: '地西泮', aliases: ['地西泮'], productIds: [] },
    { id: 'drug-concept-ceftriaxone', drugName: '头孢曲松', aliases: ['头孢曲松钠', '注射用头孢曲松钠', '头孢曲松（脑膜炎）'], productIds: ['drug-164'] },
    { id: 'drug-concept-tranexamic-acid', drugName: '氨甲环酸', aliases: ['氨甲环酸'], productIds: [] }
  ].map(concept => Object.freeze({
    ...concept,
    aliases: Object.freeze(concept.aliases || []),
    productIds: Object.freeze(concept.productIds || []),
    inventoryEvidence: Object.freeze(concept.inventoryEvidence || []),
    reviewStatus: 'identity-reviewed',
    source: Object.freeze({
      status: 'identity-only',
      label: '基层临床助手 v0.20 急救药名与院内品规身份审计',
      checkedAt: '2026-08-26'
    })
  }));

  const byId = Object.freeze(Object.fromEntries(concepts.map(concept => [concept.id, concept])));
  const byEmergencyName = Object.freeze(Object.fromEntries(
    concepts.flatMap(concept => [concept.drugName, ...concept.aliases].map(name => [name, concept]))
  ));

  window.DRUG_CONCEPTS = Object.freeze(concepts);
  window.DRUG_CONCEPT_INDEX = Object.freeze({ byId, byEmergencyName });
})();


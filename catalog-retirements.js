(() => {
  "use strict";

  const retiredDrugNames = Object.freeze([
    "丹七片",
    "格列吡嗪片",
    "格列齐特片(II)"
  ]);
  const retiredSet = new Set(retiredDrugNames);
  const catalog = Array.isArray(window.DRUG_CATALOG) ? window.DRUG_CATALOG : [];

  // 先由 drugs.js 按原始顺序生成稳定 ID，再过滤停用品种。
  // 这样删除药品不会让后续药品 ID 前移，避免已有收藏/笔记串到其他药品。
  window.DRUG_CATALOG = catalog.filter(drug => !retiredSet.has(drug.drugName));
  window.RETIRED_DRUG_NAMES = retiredDrugNames;
})();

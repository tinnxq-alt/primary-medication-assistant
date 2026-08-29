(() => {
  "use strict";

  const VERSION = "1.0.0-draft";
  const ENTITY_TYPES = Object.freeze({
    DRUG_CONCEPT: "drug_concept",
    DRUG_PRODUCT: "drug_product",
    EMERGENCY_PROTOCOL: "emergency_protocol",
    FAVORITE: "favorite",
    NOTE: "note",
    TASK: "task"
  });
  const USER_ENTITY_TYPES = new Set([
    ENTITY_TYPES.FAVORITE,
    ENTITY_TYPES.NOTE,
    ENTITY_TYPES.TASK
  ]);

  const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
  const isDrugId = value => /^drug-concept-[a-z0-9][a-z0-9-]{1,63}$/i.test(String(value || ""));
  const isProtocolId = value => /^protocol-[a-z0-9][a-z0-9-]{1,63}$/i.test(String(value || ""));

  function validateDrugConcept(drug) {
    const errors = [];
    if (!isDrugId(drug?.id)) errors.push("drug.id 必须是稳定的 drug-concept-* 标识");
    if (!isNonEmptyString(drug?.drugName)) errors.push("drug.drugName 不能为空");
    if (!isNonEmptyString(drug?.source?.status)) errors.push("drug.source.status 不能为空");
    return errors;
  }

  function validateDrugProduct(product) {
    const errors = [];
    if (!isNonEmptyString(product?.productId)) errors.push("product.productId 不能为空");
    if (!isDrugId(product?.drugId)) errors.push("product.drugId 必须引用通用药物身份");
    if (!Array.isArray(product?.pharmacyScopes)) errors.push("product.pharmacyScopes 必须是数组");
    return errors;
  }

  function validateEmergencyProtocol(protocol, drugIds) {
    const errors = [];
    if (!isProtocolId(protocol?.id)) errors.push("protocol.id 必须是稳定的 protocol-* 标识");
    if (!isNonEmptyString(protocol?.title)) errors.push("protocol.title 不能为空");
    if (!isNonEmptyString(protocol?.version)) errors.push("protocol.version 不能为空");
    if (!isNonEmptyString(protocol?.reviewStatus)) errors.push("protocol.reviewStatus 不能为空");
    if (!Array.isArray(protocol?.drugRefs)) errors.push("protocol.drugRefs 必须是数组");
    for (const ref of protocol?.drugRefs || []) {
      if (!isDrugId(ref?.drugId)) errors.push("drugRefs 只能通过 drugId 引用统一药品库");
      else if (drugIds && !drugIds.has(ref.drugId)) errors.push(`未找到药品引用：${ref.drugId}`);
      if (Object.prototype.hasOwnProperty.call(ref || {}, "drugName")) {
        errors.push("drugRefs 不得复制 drugName；显示名称从统一药品库读取");
      }
    }
    return errors;
  }

  function validateUserEntity(entity) {
    const errors = [];
    if (!USER_ENTITY_TYPES.has(entity?.entityType)) errors.push("不是允许的个人数据类型");
    if (!isNonEmptyString(entity?.userId)) errors.push("个人数据必须包含 userId");
    if (!isNonEmptyString(entity?.id)) errors.push("个人数据必须包含 id");
    return errors;
  }

  window.CLINICAL_DATA_CONTRACT = Object.freeze({
    version: VERSION,
    entityTypes: ENTITY_TYPES,
    publicEntities: Object.freeze([ENTITY_TYPES.DRUG_CONCEPT, ENTITY_TYPES.DRUG_PRODUCT, ENTITY_TYPES.EMERGENCY_PROTOCOL]),
    userEntities: Object.freeze([...USER_ENTITY_TYPES]),
    validateDrugConcept,
    validateDrugProduct,
    validateEmergencyProtocol,
    validateUserEntity
  });
})();

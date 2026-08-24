/* 门诊药库：复用已核验的同通用名、同成分规格说明书资料 */
(() => {
  "use strict";

  const HYDRATED_AT = "2026-08-25";
  const OUTPATIENT_LABELS_URL = "./outpatient-clinical-labels.json?v=1";
  const VERIFIED_SOURCE_STATUSES = new Set([
    "verified-template",
    "verified-label",
    "verified-monograph",
    "verified-regulator"
  ]);
  let hydrationPromise = null;
  let outpatientLabelsPromise = null;

  const normalizeName = value => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•_\-]/g, "");

  const normalizeStrength = value => {
    const raw = String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replaceAll("μ", "ug")
      .replaceAll("µ", "ug")
      .replaceAll("×", "*")
      .replace(/\s+/g, "");
    const activePart = raw.split("*")[0]
      .replace(/[（(]?包装待核验[）)]?/g, "")
      .replace(/\/(盒|瓶|支|袋|粒|片|贴)$/, "");
    return activePart.replace(/(\d+(?:\.\d+)?)g(?![a-z])/g, (_, amount) => `${Number(amount) * 1000}mg`);
  };

  function labelIndex(payload) {
    const index = new Map();
    for (const entry of Array.isArray(payload?.drugs) ? payload.drugs : []) {
      if (!entry?.clinical || !VERIFIED_SOURCE_STATUSES.has(entry?.source?.status)) continue;
      const key = normalizeName(entry.drugName);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry);
    }
    return index;
  }

  function outpatientLabelIndex(payload) {
    const index = new Map();
    for (const entry of Array.isArray(payload?.drugs) ? payload.drugs : []) {
      if (!entry?.internalCode || !entry?.clinical || !VERIFIED_SOURCE_STATUSES.has(entry?.source?.status)) continue;
      if (!index.has(entry.internalCode)) index.set(entry.internalCode, []);
      index.get(entry.internalCode).push(entry);
    }
    return index;
  }

  function findReference(drug, index) {
    const candidates = index.get(normalizeName(drug.drugName)) || [];
    const strength = normalizeStrength(drug.specification);
    if (!strength) return null;
    return candidates.find(entry => normalizeStrength(entry.specification) === strength) || null;
  }

  function findOutpatientReference(drug, index) {
    const candidates = index.get(drug.internalCode) || [];
    const name = normalizeName(drug.drugName);
    const strength = normalizeStrength(drug.specification);
    if (!name || !strength) return null;
    return candidates.find(entry => (
      normalizeName(entry.drugName) === name
      && normalizeStrength(entry.specification) === strength
    )) || null;
  }

  function applyOutpatientClinicalReferences(catalog, payload, outpatientPayload = null) {
    const index = labelIndex(payload);
    const outpatientIndex = outpatientLabelIndex(outpatientPayload);
    let hydratedCount = 0;
    let curatedCount = 0;
    const hydrated = (Array.isArray(catalog) ? catalog : []).map(drug => {
      if (drug.clinical) return drug;
      const outpatientReference = findOutpatientReference(drug, outpatientIndex);
      const reference = outpatientReference || findReference(drug, index);
      if (!reference) return drug;
      hydratedCount += 1;
      if (outpatientReference) curatedCount += 1;
      return {
        ...drug,
        inventorySource: { ...drug.source },
        clinical: { ...reference.clinical, source: { ...reference.source } },
        source: {
          ...reference.source,
          label: `${reference.source.label}（门诊同通用名、同成分规格资料）`
        },
        outpatientClinicalReference: {
          status: outpatientReference
            ? "matched-outpatient-verified-source"
            : "matched-existing-verified-source",
          scope: outpatientReference
            ? "院内编码、药品名称（含剂型）及成分规格严格对应的门诊网络说明书摘要；包装和生产企业仍以门诊主数据为准"
            : "同药品名称（含剂型）及同成分规格的说明书/通用资料摘要；包装和生产企业仍以门诊主数据为准",
          hydratedAt: HYDRATED_AT,
          sourceDrugName: reference.drugName,
          sourceSpecification: reference.sourceSpecification || reference.specification,
          sourceInternalCode: outpatientReference ? reference.internalCode : undefined
        }
      };
    });
    return { catalog: hydrated, hydratedCount, curatedCount };
  }

  function validateOutpatientLabels(payload) {
    if (payload?.schemaVersion !== 1 || payload.language !== "zh-CN" || !Array.isArray(payload.drugs)) {
      throw new Error("门诊说明书资料库格式无效");
    }
    return payload;
  }

  function loadOutpatientClinicalLabels() {
    if (window.OUTPATIENT_CLINICAL_LABELS) return Promise.resolve(window.OUTPATIENT_CLINICAL_LABELS);
    if (outpatientLabelsPromise) return outpatientLabelsPromise;
    outpatientLabelsPromise = fetch(OUTPATIENT_LABELS_URL, {
      cache: "force-cache",
      headers: { Accept: "application/json" }
    })
      .then(response => {
        if (!response.ok) throw new Error(`门诊说明书资料库返回 ${response.status}`);
        return response.json();
      })
      .then(validateOutpatientLabels)
      .then(payload => {
        window.OUTPATIENT_CLINICAL_LABELS = payload;
        return payload;
      })
      .catch(error => {
        outpatientLabelsPromise = null;
        throw error;
      });
    return outpatientLabelsPromise;
  }

  async function hydrateOutpatientClinicalCatalog(catalog = window.OUTPATIENT_DRUG_CATALOG) {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = Promise.all([
      window.loadChineseDrugLabels(),
      loadOutpatientClinicalLabels()
    ])
      .then(([payload, outpatientPayload]) => {
        const result = applyOutpatientClinicalReferences(catalog, payload, outpatientPayload);
        window.OUTPATIENT_DRUG_CATALOG = result.catalog;
        window.OUTPATIENT_CLINICAL_REUSE_COUNT = result.hydratedCount;
        window.OUTPATIENT_CURATED_CLINICAL_COUNT = result.curatedCount;
        window.dispatchEvent(new CustomEvent("outpatient-clinical-hydrated", {
          detail: { count: result.hydratedCount, curatedCount: result.curatedCount }
        }));
        return result.catalog;
      })
      .catch(error => {
        hydrationPromise = null;
        throw error;
      });
    return hydrationPromise;
  }

  window.applyOutpatientClinicalReferences = applyOutpatientClinicalReferences;
  window.loadOutpatientClinicalLabels = loadOutpatientClinicalLabels;
  window.hydrateOutpatientClinicalCatalog = hydrateOutpatientClinicalCatalog;
  window.addEventListener("outpatient-catalog-loaded", () => {
    hydrateOutpatientClinicalCatalog().catch(error => console.error("门诊说明书资料加载失败", error));
  });
  if (typeof document !== "undefined" && Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
    hydrateOutpatientClinicalCatalog().catch(error => console.error("门诊说明书资料加载失败", error));
  }
})();

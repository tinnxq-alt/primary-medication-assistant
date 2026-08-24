/* 门诊药库：复用已核验的同通用名、同成分规格说明书资料 */
(() => {
  "use strict";

  const HYDRATED_AT = "2026-08-25";
  const VERIFIED_SOURCE_STATUSES = new Set([
    "verified-template",
    "verified-label",
    "verified-monograph",
    "verified-regulator"
  ]);
  let hydrationPromise = null;

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

  function findReference(drug, index) {
    const candidates = index.get(normalizeName(drug.drugName)) || [];
    const strength = normalizeStrength(drug.specification);
    if (!strength) return null;
    return candidates.find(entry => normalizeStrength(entry.specification) === strength) || null;
  }

  function applyOutpatientClinicalReferences(catalog, payload) {
    const index = labelIndex(payload);
    let hydratedCount = 0;
    const hydrated = (Array.isArray(catalog) ? catalog : []).map(drug => {
      if (drug.clinical) return drug;
      const reference = findReference(drug, index);
      if (!reference) return drug;
      hydratedCount += 1;
      return {
        ...drug,
        inventorySource: { ...drug.source },
        clinical: { ...reference.clinical, source: { ...reference.source } },
        source: {
          ...reference.source,
          label: `${reference.source.label}（门诊同通用名、同成分规格资料）`
        },
        outpatientClinicalReference: {
          status: "matched-existing-verified-source",
          scope: "同药品名称（含剂型）及同成分规格的说明书/通用资料摘要；包装和生产企业仍以门诊主数据为准",
          hydratedAt: HYDRATED_AT,
          sourceDrugName: reference.drugName,
          sourceSpecification: reference.specification
        }
      };
    });
    return { catalog: hydrated, hydratedCount };
  }

  function applyOutpatientClinicalCoverage(catalog, payload) {
    const exact = applyOutpatientClinicalReferences(catalog, payload);
    const supplemental = typeof window.applyOutpatientClinicalSupplement === "function"
      ? window.applyOutpatientClinicalSupplement(exact.catalog)
      : { catalog: exact.catalog, supplementedCount: 0 };
    return {
      catalog: supplemental.catalog,
      hydratedCount: exact.hydratedCount,
      supplementedCount: supplemental.supplementedCount,
      totalClinicalCount: supplemental.catalog.filter(drug => drug.clinical).length
    };
  }

  async function hydrateOutpatientClinicalCatalog(catalog = window.OUTPATIENT_DRUG_CATALOG) {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = window.loadChineseDrugLabels()
      .then(payload => {
        const result = applyOutpatientClinicalCoverage(catalog, payload);
        window.OUTPATIENT_DRUG_CATALOG = result.catalog;
        window.OUTPATIENT_CLINICAL_REUSE_COUNT = result.hydratedCount;
        window.OUTPATIENT_CLINICAL_SUPPLEMENT_APPLIED_COUNT = result.supplementedCount;
        window.OUTPATIENT_CLINICAL_TOTAL_COUNT = result.totalClinicalCount;
        window.dispatchEvent(new CustomEvent("outpatient-clinical-hydrated", {
          detail: {
            count: result.hydratedCount,
            supplementedCount: result.supplementedCount,
            totalClinicalCount: result.totalClinicalCount
          }
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
  window.applyOutpatientClinicalCoverage = applyOutpatientClinicalCoverage;
  window.hydrateOutpatientClinicalCatalog = hydrateOutpatientClinicalCatalog;
  window.addEventListener("outpatient-catalog-loaded", () => {
    hydrateOutpatientClinicalCatalog().catch(error => console.error("门诊说明书资料加载失败", error));
  });
  if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
    hydrateOutpatientClinicalCatalog().catch(error => console.error("门诊说明书资料加载失败", error));
  }
})();

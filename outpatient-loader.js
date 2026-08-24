(() => {
  "use strict";

  let loadingPromise = null;
  const EXPECTED_CATALOG_COUNT = 395;
  const REQUIRED_SCRIPTS = Object.freeze([
    { id: "outpatient-clinical-supplement-script", src: "outpatient-clinical-supplement.js", ready: () => typeof window.applyOutpatientClinicalSupplement === "function" },
    { id: "outpatient-drug-catalog-script", src: "outpatient-drugs.js", ready: () => Array.isArray(window.OUTPATIENT_DRUG_CATALOG) }
  ]);

  // The catalog is lazy-loaded, but its audited release count is known up front.
  // Expose it so the pharmacy switcher never mistakes "not loaded" for "empty".
  window.OUTPATIENT_CATALOG_EXPECTED_COUNT = EXPECTED_CATALOG_COUNT;

  function applyVerification(catalog) {
    const verified = typeof window.applyOutpatientWebVerification === "function"
      ? window.applyOutpatientWebVerification(catalog)
      : catalog;
    window.OUTPATIENT_DRUG_CATALOG = verified;
    return verified;
  }

  window.loadOutpatientDrugCatalog = function () {
    if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG) && typeof window.applyOutpatientClinicalSupplement === "function") {
      return Promise.resolve(applyVerification(window.OUTPATIENT_DRUG_CATALOG));
    }

    if (loadingPromise) return loadingPromise;

    const inserted = [];
    const loadScript = definition => {
      if (definition.ready()) return Promise.resolve();
      return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = definition.id;
      script.src = definition.src;
      script.async = true;
      inserted.push(script);
      script.onload = () => {
        if (!definition.ready()) {
          script.remove();
          reject(new Error(`${definition.src} 未生成有效数据`));
          return;
        }
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`${definition.src} 加载失败，请检查网络后重试`));
      };
      document.head.appendChild(script);
      });
    };

    loadingPromise = Promise.all(REQUIRED_SCRIPTS.map(loadScript)).then(() => {
      const catalog = applyVerification(window.OUTPATIENT_DRUG_CATALOG);
      if (catalog.length !== EXPECTED_CATALOG_COUNT) {
        throw new Error(`门诊药库数量异常：应为 ${EXPECTED_CATALOG_COUNT}，实际为 ${catalog.length}`);
      }
      window.dispatchEvent(new CustomEvent("outpatient-catalog-loaded", { detail: { count: catalog.length } }));
      return catalog;
    }).catch(error => {
      inserted.forEach(script => script.remove());
      loadingPromise = null;
      throw error;
    });

    return loadingPromise;
  };
})();

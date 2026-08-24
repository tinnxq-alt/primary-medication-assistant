(() => {
  "use strict";

  const CATALOG_URL = "./chinese-drug-labels.json?v=14";
  let loadingPromise = null;

  function validateCatalog(payload) {
    if (payload?.schemaVersion !== 1 || payload.language !== "zh-CN" || !Array.isArray(payload.drugs) || !Array.isArray(payload.tradeNameAliases)) {
      throw new Error("中文核验库格式无效");
    }
    return payload;
  }

  window.loadChineseDrugLabels = function loadChineseDrugLabels() {
    if (window.CHINESE_DRUG_LABELS) return Promise.resolve(window.CHINESE_DRUG_LABELS);
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch(CATALOG_URL, {
      cache: "force-cache",
      headers: { Accept: "application/json" }
    })
      .then(response => {
        if (!response.ok) throw new Error(`中文核验库返回 ${response.status}`);
        return response.json();
      })
      .then(validateCatalog)
      .then(payload => {
        window.CHINESE_DRUG_LABELS = payload;
        window.dispatchEvent(new CustomEvent("chinese-drug-labels-ready"));
        return payload;
      })
      .catch(error => {
        loadingPromise = null;
        throw error;
      });

    return loadingPromise;
  };
})();

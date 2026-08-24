(() => {
  "use strict";

  let loadingPromise = null;
  const SCRIPT_ID = "outpatient-drug-catalog-script";

  function applyVerification(catalog) {
    const verified = typeof window.applyOutpatientWebVerification === "function"
      ? window.applyOutpatientWebVerification(catalog)
      : catalog;
    window.OUTPATIENT_DRUG_CATALOG = verified;
    return verified;
  }

  window.loadOutpatientDrugCatalog = function () {
    if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
      return Promise.resolve(applyVerification(window.OUTPATIENT_DRUG_CATALOG));
    }

    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "outpatient-drugs.js";
      script.async = true;
      script.onload = () => {
        if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
          const catalog = applyVerification(window.OUTPATIENT_DRUG_CATALOG);
          window.dispatchEvent(new CustomEvent("outpatient-catalog-loaded", {
            detail: { count: catalog.length }
          }));
          resolve(catalog);
        } else {
          script.remove();
          reject(new Error("门诊药库脚本未生成有效目录"));
        }
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("门诊药库加载失败，请检查网络后重试"));
      };
      document.head.appendChild(script);
    }).catch(error => {
      loadingPromise = null;
      throw error;
    });

    return loadingPromise;
  };
})();

(() => {
  "use strict";

  let loadingPromise = null;

  window.loadOutpatientDrugCatalog = function () {
    if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
      return Promise.resolve(window.OUTPATIENT_DRUG_CATALOG);
    }

    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "outpatient-drugs.js";
      script.onload = () => {
        if (Array.isArray(window.OUTPATIENT_DRUG_CATALOG)) {
          resolve(window.OUTPATIENT_DRUG_CATALOG);
        } else {
          reject(new Error("门诊药库加载失败"));
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return loadingPromise;
  };
})();

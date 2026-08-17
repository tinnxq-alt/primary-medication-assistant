(() => {
  "use strict";

  const BRAND_PATTERN = /基层用药助手\s*pro/gi;
  const normalizeBrand = () => {
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle && BRAND_PATTERN.test(pageTitle.textContent)) {
      BRAND_PATTERN.lastIndex = 0;
      pageTitle.textContent = pageTitle.textContent.replace(BRAND_PATTERN, "基层用药助手");
    }
    BRAND_PATTERN.lastIndex = 0;
    if (BRAND_PATTERN.test(document.title)) {
      BRAND_PATTERN.lastIndex = 0;
      document.title = document.title.replace(BRAND_PATTERN, "基层用药助手");
    }
    BRAND_PATTERN.lastIndex = 0;
  };

  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) {
    new MutationObserver(normalizeBrand).observe(pageTitle, { childList: true, characterData: true, subtree: true });
  }
  window.addEventListener("hashchange", () => requestAnimationFrame(normalizeBrand));
  normalizeBrand();
})();

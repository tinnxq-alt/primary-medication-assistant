(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const lookup = window.DRUG_LOOKUP || {};
  const normalize = lookup.normalize || (value => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, ""));
  const rankDrugs = lookup.rankDrugs || ((query, drugs, _aliases, limit = 20) => {
    const q = normalize(query);
    return (Array.isArray(drugs) ? drugs : []).filter(drug => [drug.drugName, drug.genericName, drug.tradeName, drug.rawName]
      .some(value => normalize(value).includes(q))).slice(0, limit);
  });
  let aliasPromise = null;
  let homeTimer = null;
  let searchTimer = null;
  let replayingSearchInput = false;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(`${PREFIX}${key}`));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadAliases() {
    if (!aliasPromise) {
      aliasPromise = fetch("./chinese-drug-labels.json?v=12", { cache: "force-cache", headers: { Accept: "application/json" } })
        .then(response => response.ok ? response.json() : null)
        .then(payload => Array.isArray(payload?.tradeNameAliases) ? payload.tradeNameAliases : [])
        .catch(() => []);
    }
    return aliasPromise;
  }

  function visibleKnownDrugs(allPharmacies = false) {
    const scope = window.PHARMACY_SCOPE || {};
    const withScopes = scope.withPharmacyScopes || ((drug) => drug);
    const filterByPharmacy = scope.filterDrugsByPharmacy || ((drugs) => drugs);
    const activePharmacy = scope.normalizePharmacyId
      ? scope.normalizePharmacyId(read("activePharmacy", "ward"))
      : read("activePharmacy", "ward");
    const hidden = new Set(Array.isArray(read("hidden", [])) ? read("hidden", []) : []);
    const overrides = read("drugOverrides", {});
    const categoryOverrides = read("categoryOverrides", {});
    const custom = Array.isArray(read("customDrugs", [])) ? read("customDrugs", []) : [];
    const drugs = [
      ...(window.DRUG_CATALOG || []).map(drug => withScopes(drug, "ward")),
      ...(window.OUTPATIENT_DRUG_CATALOG || []).map(drug => withScopes(drug, "outpatient")),
      ...custom.map(drug => withScopes(drug, "ward"))
    ].filter(drug => !hidden.has(drug.id)).map(drug => ({
      ...drug,
      ...(overrides[drug.id] || {}),
      ...(categoryOverrides[drug.id] ? { category: categoryOverrides[drug.id] } : {})
    }));
    return allPharmacies ? drugs : filterByPharmacy(drugs, activePharmacy);
  }

  function openDrug(id) {
    if (!id) return;
    location.hash = `#/detail/${encodeURIComponent(id)}`;
  }

  function renderHomeMatches(input, aliases) {
    const query = String(input?.value || "").trim();
    const host = document.getElementById("fastHomeMatches");
    if (!host) return;
    if (!query) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    const matches = rankDrugs(query, visibleKnownDrugs(false), aliases, 5);
    host.hidden = false;
    host.innerHTML = matches.length
      ? matches.map(drug => `<button type="button" class="btn ghost" data-fast-open-drug="${esc(drug.id)}" style="width:100%;justify-content:flex-start;text-align:left"><span><strong>${esc(drug.drugName)}</strong><br><small>${esc(drug.genericName || drug.rawName || "")} · ${esc(drug.specification || "规格待核对")}</small></span></button>`).join("")
      : `<button type="button" class="btn secondary small" data-fast-add-drug>当前药库未找到“${esc(query)}”，去添加药物</button>`;
  }

  function prepareHome() {
    const input = document.getElementById("homeSearch");
    if (!input || document.getElementById("fastHomeMatches")) return;
    input.placeholder = "输入药名片段即可，如“阿奇”“二甲”";
    const host = document.createElement("div");
    host.id = "fastHomeMatches";
    host.className = "card-list";
    host.style.marginTop = "10px";
    host.hidden = true;
    input.closest(".search-box")?.insertAdjacentElement("afterend", host);
    loadAliases();
  }

  function prepareSearch() {
    const input = document.getElementById("searchInput");
    if (!input) return;
    input.placeholder = "输入药名片段即可，如“阿奇”“二甲”“氨氯”";
  }

  async function showSupplementalMatches(query) {
    if (!location.hash.startsWith("#/search")) return;
    const results = document.getElementById("searchResults");
    const input = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    if (!results || !input || statusFilter?.value) {
      document.getElementById("fastSearchSupplement")?.remove();
      return;
    }
    const q = String(query || input.value || "").trim();
    if (!q) {
      document.getElementById("fastSearchSupplement")?.remove();
      return;
    }
    const aliases = await loadAliases();
    const allPharmacies = document.getElementById("searchPharmacy")?.value === "all";
    const ranked = rankDrugs(q, visibleKnownDrugs(allPharmacies), aliases, 8);
    const existing = new Set([...results.querySelectorAll("[data-open-drug]")].map(node => node.dataset.openDrug));
    const extra = ranked.filter(drug => !existing.has(drug.id)).slice(0, 5);
    let box = document.getElementById("fastSearchSupplement");
    if (!extra.length) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "fastSearchSupplement";
      box.className = "card-list";
      results.insertAdjacentElement("beforebegin", box);
    }
    box.innerHTML = `<p class="muted">药名片段 / 商品名补充匹配</p>${extra.map(drug => `<button type="button" class="btn ghost" data-fast-open-drug="${esc(drug.id)}" style="width:100%;justify-content:flex-start;text-align:left"><span><strong>${esc(drug.drugName)}</strong><br><small>${esc(drug.genericName || drug.rawName || "")} · ${esc(drug.specification || "规格待核对")}</small></span></button>`).join("")}`;
  }

  function scheduleSearchDraw(input) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (!input?.isConnected) return;
      replayingSearchInput = true;
      input.dispatchEvent(new Event("input", { bubbles: false }));
      replayingSearchInput = false;
      showSupplementalMatches(input.value);
    }, 60);
  }

  document.addEventListener("input", event => {
    if (event.target?.id === "searchInput") {
      if (replayingSearchInput || event.isComposing) return;
      event.stopImmediatePropagation();
      scheduleSearchDraw(event.target);
      return;
    }
    if (event.target?.id === "homeSearch") {
      if (event.isComposing) return;
      clearTimeout(homeTimer);
      const input = event.target;
      homeTimer = setTimeout(async () => renderHomeMatches(input, await loadAliases()), 40);
    }
  }, true);

  document.addEventListener("compositionend", event => {
    if (event.target?.id === "searchInput") scheduleSearchDraw(event.target);
    if (event.target?.id === "homeSearch") {
      clearTimeout(homeTimer);
      const input = event.target;
      homeTimer = setTimeout(async () => renderHomeMatches(input, await loadAliases()), 40);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.target?.id !== "homeSearch" || event.key !== "Enter" || event.isComposing) return;
    const query = String(event.target.value || "").trim();
    if (!query) return;
    event.preventDefault();
    sessionStorage.setItem("drug-search-query", query);
    location.hash = "#/search";
  }, true);

  document.addEventListener("click", event => {
    const open = event.target.closest?.("[data-fast-open-drug]");
    if (open) {
      event.preventDefault();
      openDrug(open.dataset.fastOpenDrug);
      return;
    }
    if (event.target.closest?.("[data-fast-add-drug]")) {
      event.preventDefault();
      const query = String(document.getElementById("homeSearch")?.value || "").trim();
      sessionStorage.setItem("drug-add-query", query);
      location.hash = "#/add";
    }
  }, true);

  document.addEventListener("change", event => {
    if (!["searchPharmacy", "statusFilter"].includes(event.target?.id)) return;
    setTimeout(() => showSupplementalMatches(document.getElementById("searchInput")?.value || ""), 0);
  }, true);

  const observer = new MutationObserver(() => {
    if (location.hash.startsWith("#/home") || !location.hash || location.hash === "#/") prepareHome();
    if (location.hash.startsWith("#/search")) prepareSearch();
  });
  const app = document.getElementById("app");
  if (app) observer.observe(app, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => setTimeout(() => {
    prepareHome();
    prepareSearch();
    if (location.hash.startsWith("#/search")) showSupplementalMatches(document.getElementById("searchInput")?.value || "");
  }, 0));

  prepareHome();
  prepareSearch();
})();

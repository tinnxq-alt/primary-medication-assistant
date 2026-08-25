(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_SMART_SEARCH_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const VERIFIED_SOURCE_STATUSES = new Set(["verified-template", "verified-label", "verified-monograph", "verified-regulator"]);
  const INITIAL_SEARCH_RENDER_LIMIT = 40;
  const INITIAL_ALL_RENDER_LIMIT = 60;
  const app = document.getElementById("app");
  const pageTitle = document.getElementById("pageTitle");
  const backBtn = document.getElementById("backBtn");
  const homeBtn = document.getElementById("homeBtn");
  const toastEl = document.getElementById("toast");
  const offlineBanner = document.getElementById("offlineBanner");
  const modalRoot = document.getElementById("modalRoot");
  const pharmacySwitcher = document.getElementById("pharmacySwitcher");

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  const PHARMACIES = Object.freeze({
    ward: { label: "病房药库", shortLabel: "病房", emptyText: "病房药库暂无药品。" },
    outpatient: { label: "门诊药库", shortLabel: "门诊", emptyText: "门诊药库暂无药品。" }
  });
  const {
    drugBelongsToPharmacy,
    normalizePharmacyId,
    normalizePharmacyScopes,
    withPharmacyScopes
  } = window.PHARMACY_SCOPE;

  const state = {
    favorites: read("favorites", []),
    groups: read("groups", [{ id: "default", name: "默认收藏" }]),
    favoriteMap: read("favoriteMap", {}),
    notes: read("notes", []),
    customDrugs: read("customDrugs", []),
    customCategories: read("customCategories", []),
    contraindications: read("contraindications", []),
    marks: read("marks", []),
    remembered: read("remembered", []),
    cached: read("cached", []),
    hidden: read("hidden", []),
    categoryOverrides: read("categoryOverrides", {}),
    drugOverrides: read("drugOverrides", {}),
    smartSearchEndpoint: read("smartSearchEndpoint", DEFAULT_SMART_SEARCH_ENDPOINT),
    activePharmacy: normalizePharmacyId(read("activePharmacy", "ward")),
    history: []
  };
  const {
    categories: DRUG_CATEGORY_IDS,
    classifyCandidate: classifyDrugCandidate,
    normalizeCategory: normalizeDrugCategory,
    normalizeTherapeuticClass
  } = window.DRUG_CLASSIFICATION;
  const BACKUP_ARRAY_KEYS = ["favorites", "groups", "notes", "customDrugs", "customCategories", "contraindications", "marks", "remembered", "cached", "hidden"];
  const BACKUP_OBJECT_KEYS = ["favoriteMap", "categoryOverrides", "drugOverrides"];
  const BACKUP_KEYS = [...BACKUP_ARRAY_KEYS, ...BACKUP_OBJECT_KEYS];
  let deferredInstallPrompt = null;
  let tradeNameAliases = [];
  let categoryBrowseActive = false;
  const { directlyMatchesDrug, normalize, normalizeTradeNameAliases, tradeNameAliasForDrug: findTradeNameAliasForDrug } = window.DRUG_LOOKUP;
  const tradeNameAliasForDrug = (query, drug, aliases = tradeNameAliases) => findTradeNameAliasForDrug(query, drug, aliases);

  const routes = {
    home: "基层用药助手 Pro",
    categories: "药品分类",
    search: "搜索药品",
    favorites: "我的收藏",
    add: "添加药物",
    interactions: "药品相互作用",
    symptoms: "症状搜索",
    flashcards: "记忆卡片",
    cache: "缓存管理",
    all: "全部药物",
    contraindications: "用药禁忌",
    notebook: "笔记本",
    detail: "药品详情"
  };

  const shortcuts = [
    ["categories", "▦", "药品分类"],
    ["all", "☷", "全部药物"],
    ["interactions", "⇄", "相互作用"],
    ["symptoms", "⌕", "症状搜索"],
    ["flashcards", "◫", "记忆卡片"],
    ["cache", "⇩", "缓存管理"],
    ["contraindications", "!", "用药禁忌"],
    ["add", "+", "添加药物"]
  ];

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const safeExternalUrl = value => {
    try { const url = new URL(String(value || ""), location.href); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
    catch { return ""; }
  };
  const interactionEngine = window.DRUG_INTERACTIONS;
  const interactionSeverityClass = severity => severity === "禁忌" ? "blocked" : severity === "严重" ? "warn" : "info";
  const interactionRuleCard = (rule, partners = []) => {
    const sourceUrl = safeExternalUrl(rule.source?.url);
    const uniquePartners = [...new Map(partners.map(partner => [partner.id, partner])).values()];
    const shownPartners = uniquePartners.slice(0, 8).map(partner => partner.drugName).join("、");
    const partnerText = shownPartners
      ? `<p class="drug-sub"><strong>本药库相关药品：</strong>${esc(shownPartners)}${uniquePartners.length > 8 ? ` 等 ${uniquePartners.length} 种` : ""}</p>`
      : "";
    return `<article class="card interaction-rule-card"><div class="detail-head"><div><h3>${esc(rule.title)}</h3><span class="badge ${interactionSeverityClass(rule.severity)}">${esc(rule.severity)}</span></div></div>${partnerText}<p class="drug-sub"><strong>机制：</strong>${esc(rule.mechanism)}</p><p class="drug-sub"><strong>可能后果：</strong>${esc(rule.consequence)}</p><p class="drug-sub"><strong>处理建议：</strong>${esc(rule.recommendation)}</p><p class="drug-sub"><strong>依据：</strong>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(rule.source?.label)}</a>` : esc(rule.source?.label || "未记录")}${rule.source?.checkedAt ? ` · 核验 ${esc(rule.source.checkedAt)}` : ""}</p></article>`;
  };
  const normalizeServiceEndpoint = value => {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("服务地址必须使用 HTTPS");
    url.search = ""; url.hash = "";
    return url.href.replace(/\/+$/, "");
  };
  let catalogSnapshotCache = null;
  let visibleDrugCache = null;
  let pharmacyCountCache = null;
  const CATALOG_VIEW_STATE_KEYS = new Set(["customDrugs", "hidden", "categoryOverrides", "drugOverrides"]);

  function invalidateCatalogCaches() {
    catalogSnapshotCache = null;
    visibleDrugCache = null;
    pharmacyCountCache = null;
  }

  function catalogSnapshot() {
    const ward = Array.isArray(window.DRUG_CATALOG) ? window.DRUG_CATALOG : [];
    const outpatient = Array.isArray(window.OUTPATIENT_DRUG_CATALOG) ? window.OUTPATIENT_DRUG_CATALOG : [];
    const custom = state.customDrugs;
    if (catalogSnapshotCache
      && catalogSnapshotCache.ward === ward
      && catalogSnapshotCache.outpatient === outpatient
      && catalogSnapshotCache.custom === custom
      && catalogSnapshotCache.wardLength === ward.length
      && catalogSnapshotCache.outpatientLength === outpatient.length
      && catalogSnapshotCache.customLength === custom.length) {
      return catalogSnapshotCache;
    }

    const builtIn = [
      ...ward.map(drug => withPharmacyScopes(drug, "ward")),
      ...outpatient.map(drug => withPharmacyScopes(drug, "outpatient"))
    ];
    const drugs = [...builtIn, ...custom.map(drug => withPharmacyScopes(drug, "ward"))];
    catalogSnapshotCache = {
      ward,
      outpatient,
      custom,
      wardLength: ward.length,
      outpatientLength: outpatient.length,
      customLength: custom.length,
      builtIn,
      drugs,
      byId: new Map(drugs.map(drug => [drug.id, drug]))
    };
    visibleDrugCache = null;
    pharmacyCountCache = null;
    return catalogSnapshotCache;
  }

  const builtInCatalogDrugs = () => catalogSnapshot().builtIn;
  const catalogDrugs = () => catalogSnapshot().drugs;
  const applyLocalOverrides = drug => {
    const override = state.drugOverrides[drug.id];
    const category = state.categoryOverrides[drug.id];
    const merged = { ...drug, ...(override || {}), ...(category ? { category } : {}) };
    if (!merged.therapeuticClass) {
      merged.therapeuticClass = normalizeTherapeuticClass("", merged.drugName, merged.clinical?.indication, merged.category);
    }
    if (override && !drug.isCustom) {
      merged.qualityIssue = [merged.qualityIssue, "本机药品详情已编辑，须按药盒、批准文号和现行说明书复核。"].filter(Boolean).join(" ");
      merged.localEdited = true;
    }
    return withPharmacyScopes(merged, "ward");
  };
  const visibleDrugs = () => {
    const snapshot = catalogSnapshot();
    if (visibleDrugCache?.source === snapshot.drugs) return visibleDrugCache.drugs;
    const hidden = new Set(state.hidden);
    const drugs = snapshot.drugs
      .filter(drug => !hidden.has(drug.id))
      .map(applyLocalOverrides);
    visibleDrugCache = { source: snapshot.drugs, drugs };
    pharmacyCountCache = null;
    return drugs;
  };
  function pharmacyViews() {
    const drugs = visibleDrugs();
    if (pharmacyCountCache?.source === drugs) return pharmacyCountCache;
    const byPharmacy = { ward: [], outpatient: [] };
    drugs.forEach(drug => normalizePharmacyScopes(drug).forEach(pharmacyId => { byPharmacy[pharmacyId].push(drug); }));
    pharmacyCountCache = {
      source: drugs,
      byPharmacy,
      counts: { ward: byPharmacy.ward.length, outpatient: byPharmacy.outpatient.length }
    };
    return pharmacyCountCache;
  }
  const allDrugs = (pharmacyId = state.activePharmacy) => pharmacyViews().byPharmacy[normalizePharmacyId(pharmacyId)];
  const pharmacyLabel = pharmacyId => PHARMACIES[normalizePharmacyId(pharmacyId)].label;
  const pharmacyBadges = drug => normalizePharmacyScopes(drug).map(pharmacyId =>
    `<span class="badge pharmacy ${esc(pharmacyId)}">${esc(PHARMACIES[pharmacyId].shortLabel)}药库</span>`
  ).join(" ");

  async function hydrateVerifiedCatalog() {
    const payload = await window.loadChineseDrugLabels();
    tradeNameAliases = normalizeTradeNameAliases(payload.tradeNameAliases);
    const byNameAndSpec = new Map();
    const byName = new Map();
    for (const drug of window.DRUG_CATALOG) {
      byNameAndSpec.set(`${drug.drugName}\u0000${drug.specification || ""}`, drug);
      if (!byName.has(drug.drugName)) byName.set(drug.drugName, drug);
    }
    for (const entry of payload.drugs) {
      if (!entry?.drugName || !entry.clinical || !entry.source?.status) continue;
      const target = (entry.specification && byNameAndSpec.get(`${entry.drugName}\u0000${entry.specification}`))
        || byName.get(entry.drugName);
      if (!target) continue;
      target.clinical = { ...entry.clinical, source: { ...entry.source } };
      target.source = { ...entry.source };
      if (entry.qualityIssue) target.qualityIssue = entry.qualityIssue;
    }
    invalidateCatalogCaches();
  }
  const drugById = id => {
    const drug = catalogSnapshot().byId.get(id);
    return drug ? applyLocalOverrides(drug) : drug;
  };
  const recordPharmacyId = record => {
    if (record?.pharmacyId && PHARMACIES[record.pharmacyId]) return record.pharmacyId;
    const scopes = normalizePharmacyScopes(drugById(record?.drugId));
    return scopes.includes(state.activePharmacy) ? state.activePharmacy : scopes[0];
  };
  const recordBelongsToPharmacy = (record, pharmacyId = state.activePharmacy) =>
    recordPharmacyId(record) === normalizePharmacyId(pharmacyId);
  const isFavorite = id => state.favorites.includes(id);
  const isCached = id => state.cached.includes(id);
  const isRemembered = id => state.remembered.includes(id);
  const saveState = key => {
    write(key, state[key]);
    if (CATALOG_VIEW_STATE_KEYS.has(key)) invalidateCatalogCaches();
  };

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function statusBadge(drug) {
    const status = drug.source?.status;
    if (status === "verified-label") return '<span class="badge ok">✓ 说明书已核验</span>';
    if (status === "verified-monograph") return '<span class="badge ok">✓ 通用资料已核验</span>';
    if (status === "verified-template") return '<span class="badge ok">✓ 范本已核验</span>';
    if (status === "verified-regulator") return '<span class="badge ok">✓ 官方资料已核验</span>';
    if (status === "blocked") return '<span class="badge blocked">⛔ 数据锁定</span>';
    if (status === "unverified-draft") return '<span class="badge warn">△ 未核验草稿</span>';
    if (status === "needs-review") return '<span class="badge warn">△ 待复核</span>';
    if (drug.isCustom) return '<span class="badge info">自定义</span>';
    return '<span class="badge info">仅目录</span>';
  }

  function isVerifiedSource(status) { return VERIFIED_SOURCE_STATUSES.has(status); }

  function drugCard(drug, options = {}) {
    const selectable = Boolean(options.selectable);
    const selected = Boolean(options.selected);
    return `
      <div class="swipe-row" data-swipe-row>
      <article class="card drug-row swipe-content ${selectable ? "batch-card" : ""}" ${selectable ? "" : `data-open-drug="${esc(drug.id)}" tabindex="0"`}>
        <div>
          ${selectable ? `<label class="batch-check"><input type="checkbox" data-select-drug="${esc(drug.id)}" ${selected ? "checked" : ""}> 选择</label>` : ""}
          <h3>${esc(drug.drugName)}</h3>
          <div class="drug-meta">
            <span>${esc(drug.specification || "规格待核验")}</span>
            <span>${esc(drug.dosageForm || "剂型待核验")}</span>
            <span>${esc(drug.therapeuticClass || "作用待分类")}</span>
          </div>
          <p class="drug-sub">通用名：${esc(drug.genericName || "待核验")}</p>
          ${drug.qualityIssue ? `<p class="drug-sub"><span class="badge blocked">质控问题</span> ${esc(drug.qualityIssue)}</p>` : ""}
          ${pharmacyBadges(drug)} ${statusBadge(drug)} ${drug.safetyNotice ? '<span class="badge blocked">官方安全警示</span>' : ""}
        </div>
        ${selectable ? "" : `<button class="star-btn ${isFavorite(drug.id) ? "active" : ""}" type="button" data-favorite="${esc(drug.id)}" aria-label="${isFavorite(drug.id) ? "取消收藏" : "收藏"}">★</button>`}
      </article>
      ${selectable ? "" : `<div class="swipe-actions"><button type="button" data-favorite="${esc(drug.id)}">${isFavorite(drug.id) ? "取消收藏" : "收藏"}</button>${drug.isCustom ? `<button class="danger" type="button" data-delete-custom="${esc(drug.id)}">删除</button>` : `<button type="button" data-cache="${esc(drug.id)}">${isCached(drug.id) ? "移出缓存" : "缓存"}</button>`}</div>`}
      </div>`;
  }

  function renderMarkedText(drugId, field, value) {
    let html = esc(value);
    const marks = state.marks
      .filter(mark => mark.drugId === drugId && mark.field === field && mark.text)
      .sort((a, b) => b.text.length - a.text.length);
    marks.forEach(mark => {
      const target = esc(mark.text);
      if (!target || !html.includes(target)) return;
      html = html.replace(target, `<mark class="text-mark ${esc(mark.type)}" title="${esc(mark.type)}">${target}</mark>`);
    });
    return html;
  }

  function empty(message, action = "") {
    return `<div class="empty"><p>${esc(message)}</p>${action}</div>`;
  }

  function navigate(route, param = "", replace = false) {
    categoryBrowseActive = false;
    const hash = `#/${route}${param ? `/${encodeURIComponent(param)}` : ""}`;
    if (replace) history.replaceState(null, "", hash);
    else location.hash = hash;
  }

  function currentRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return { route: parts[0] || "home", param: decodeURIComponent(parts.slice(1).join("/")) };
  }

  function openCategoryDrugList(filterAction = "", filterForm = "", filterAttribute = "") {
    navigate("all");
    categoryBrowseActive = true;
    setTimeout(() => renderAll(filterAction, filterForm, filterAttribute));
  }

  function openDrugDetail(id) {
    if (!(categoryBrowseActive && currentRoute().route === "all")) {
      navigate("detail", id);
      return;
    }

    categoryBrowseActive = false;
    const hash = `#/detail/${encodeURIComponent(id)}`;
    history.replaceState(history.state, "", hash);
    render();
  }

  function updateChrome(route) {
    pageTitle.textContent = routes[route] || routes.home;
    backBtn.hidden = route === "home";
    document.querySelectorAll(".bottom-nav button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.route === route);
    });
  }

  function updatePharmacyChrome() {
    if (!pharmacySwitcher) return;
    const views = pharmacyViews();
    pharmacySwitcher.querySelectorAll("[data-pharmacy-switch]").forEach(button => {
      const pharmacyId = normalizePharmacyId(button.dataset.pharmacySwitch);
      const active = pharmacyId === state.activePharmacy;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      const count = button.querySelector("[data-pharmacy-count]");
      if (count) {
        const outpatientNotLoaded = pharmacyId === "outpatient" && !Array.isArray(window.OUTPATIENT_DRUG_CATALOG);
        const expectedOutpatientCount = Number(window.OUTPATIENT_CATALOG_EXPECTED_COUNT) || 392;
        count.textContent = String(outpatientNotLoaded ? expectedOutpatientCount : views.counts[pharmacyId]);
      }
    });
  }

  async function ensureOutpatientCatalogLoaded() {
    if (typeof window.loadOutpatientDrugCatalog !== "function") {
      throw new Error("门诊药库加载模块不可用");
    }
    let catalog = await window.loadOutpatientDrugCatalog();
    if (!Array.isArray(catalog)) throw new Error("门诊药库数据格式无效");
    if (typeof window.hydrateOutpatientClinicalCatalog === "function") {
      catalog = await window.hydrateOutpatientClinicalCatalog(catalog);
    }
    if (!Array.isArray(catalog) || catalog.length !== 392) {
      throw new Error(`门诊药库临床资料加载异常：应为 392，实际为 ${Array.isArray(catalog) ? catalog.length : 0}`);
    }
    return catalog;
  }

  function setPharmacySwitchLoading(button, loading) {
    if (!pharmacySwitcher || !button) return;
    pharmacySwitcher.setAttribute("aria-busy", String(loading));
    button.disabled = loading;
    const count = button.querySelector("[data-pharmacy-count]");
    if (loading && count) count.textContent = "…";
    if (!loading) updatePharmacyChrome();
  }

  function renderHome() {
    const drugs = allDrugs();
    const pharmacy = PHARMACIES[state.activePharmacy];
    const verified = drugs.filter(d => isVerifiedSource(d.source?.status)).length;
    const needsReview = drugs.filter(d => ["needs-review", "blocked"].includes(d.source?.status)).length;
    const recent = drugs.slice(0, 5);
    app.innerHTML = `
      <section class="hero section">
        <h2>${esc(pharmacy.label)}：快速查药</h2>
        <p>${state.activePharmacy === "ward" ? `现有 ${drugs.length} 个病房品规，目录与说明书内容分层保存。` : "门诊药库独立维护；导入或添加的门诊品规只在此药库显示。"}</p>
        <label class="search-box">
          <span>⌕</span>
          <input id="homeSearch" placeholder="药品名、通用名、规格" autocomplete="off">
        </label>
        <div class="stat-grid">
          <div class="stat"><strong>${drugs.length}</strong><span>当前药库</span></div>
          <div class="stat"><strong>${verified}</strong><span>资料已核验</span></div>
          <div class="stat"><strong>${needsReview}</strong><span>需优先复核</span></div>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>快捷入口</h2><small>13 个页面</small></div>
        <div class="shortcut-grid">
          ${shortcuts.map(([route, icon, label]) => `<button class="shortcut" data-route-link="${route}"><span>${icon}</span><small>${label}</small></button>`).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>${esc(pharmacy.label)}预览</h2><button class="btn ghost small" data-route-link="all">查看全部</button></div>
        <div class="card-list">${recent.length ? recent.map(drugCard).join("") : empty(pharmacy.emptyText, `<button class="btn primary" data-route-link="add">添加${esc(pharmacy.shortLabel)}药品</button>`)}</div>
      </section>`;
    document.getElementById("homeSearch").addEventListener("change", event => {
      sessionStorage.setItem("drug-search-query", event.target.value.trim());
      navigate("search");
    });
  }

  function renderCategories() {
    const drugs = allDrugs();
    if (!drugs.length) {
      app.innerHTML = empty(PHARMACIES[state.activePharmacy].emptyText, '<button class="btn primary" data-route-link="add">添加药品</button>');
      return;
    }
    const counts = drugs.reduce((map, drug) => {
      const key = drug.therapeuticClass || "作用待分类";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const attributes = drugs.reduce((map, drug) => {
      const key = drug.category || "属性待核验";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const forms = drugs.reduce((map, drug) => {
      const key = drug.dosageForm || "剂型待核验";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const customCards = state.customCategories.map(name => {
      const count = drugs.filter(drug => drug.category === name).length;
      return `<button class="category-card custom-category-card" data-custom-category="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规 · 长按编辑</span></button>`;
    });
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>按药物作用分类</h2><small>${Object.keys(counts).length} 类</small></div>
        <div class="category-grid">${Object.entries(counts).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([name, count]) => `<button class="category-card" data-action-class="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
      </section>
      <section class="section">
        <div class="section-title"><h2>按药品属性</h2><small>${Object.keys(attributes).length} 类</small></div>
        <div class="category-grid">${Object.entries(attributes).map(([name, count]) => `<button class="category-card" data-attribute="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
      </section>
      <section class="section">
        <div class="section-title"><h2>按剂型浏览</h2><small>${Object.keys(forms).length} 种</small></div>
        <div class="category-grid">${Object.entries(forms).sort((a,b) => b[1]-a[1]).map(([name, count]) => `<button class="category-card" data-form="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
      </section>
      <section class="section">
        <div class="section-title"><h2>自定义分类</h2><button class="btn secondary small" id="newCategoryBtn">新增分类</button></div>
        <div class="category-grid">${customCards.length ? customCards.join("") : empty("暂无自定义分类。")}</div>
      </section>`;
    document.getElementById("newCategoryBtn").addEventListener("click", () => openCustomCategoryModal());
    app.querySelectorAll("[data-custom-category]").forEach(card => {
      let timer = null;
      let longPressed = false;
      card.addEventListener("pointerdown", () => {
        longPressed = false;
        timer = setTimeout(() => { longPressed = true; openCustomCategoryModal(card.dataset.customCategory); }, 650);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(type => card.addEventListener(type, () => clearTimeout(timer)));
      card.addEventListener("click", event => {
        if (longPressed) { event.preventDefault(); return; }
        openCategoryDrugList("", "", card.dataset.customCategory);
      });
    });
  }

  function renderSearch(initial = "") {
    const initialQuery = initial || sessionStorage.getItem("drug-search-query") || "";
    sessionStorage.removeItem("drug-search-query");
    const currentPharmacyLabel = pharmacyLabel(state.activePharmacy);
    app.innerHTML = `
      <section class="section">
        <div class="toolbar"><input id="searchInput" value="${esc(initialQuery)}" placeholder="输入药品名、作用分类、规格或厂家"><select id="searchPharmacy"><option value="current">当前：${esc(currentPharmacyLabel)}</option><option value="all">全部药库</option></select><select id="statusFilter"><option value="">全部数据状态</option><option value="verified">全部已核验</option><option value="verified-regulator">官方资料已核验</option><option value="verified-label">说明书已核验</option><option value="verified-monograph">通用资料已核验</option><option value="verified-template">范本已核验</option><option value="needs-review">待复核</option><option value="blocked">数据锁定</option><option value="inventory-only">仅目录</option></select></div>
        <p id="resultCount" class="muted"></p>
        <div id="searchResults" class="card-list"></div>
        <button class="btn secondary load-more" id="searchLoadMore" type="button" hidden>显示更多</button>
      </section>`;
    const input = document.getElementById("searchInput");
    const filter = document.getElementById("statusFilter");
    const pharmacyFilter = document.getElementById("searchPharmacy");
    let visibleLimit = INITIAL_SEARCH_RENDER_LIMIT;
    const draw = (resetLimit = false) => {
      if (resetLimit) visibleLimit = INITIAL_SEARCH_RENDER_LIMIT;
      const q = normalize(input.value);
      const status = filter.value;
      const searchAllPharmacies = pharmacyFilter.value === "all";
      const results = (searchAllPharmacies ? visibleDrugs() : allDrugs()).filter(drug => {
        const haystack = normalize([drug.drugName, drug.rawName, drug.genericName, drug.tradeName, drug.specification, drug.manufacturer, drug.therapeuticClass].join(" "));
        const statusMatch = !status || (status === "verified" ? isVerifiedSource(drug.source?.status) : drug.source?.status === status);
        return (!q || haystack.includes(q)) && statusMatch;
      });
      const shownResults = results.slice(0, visibleLimit);
      document.getElementById("resultCount").textContent = `找到 ${results.length} 个品规${results.length > shownResults.length ? ` · 已显示 ${shownResults.length} 个` : ""} · ${searchAllPharmacies ? "全部药库" : currentPharmacyLabel}`;
      document.getElementById("searchResults").innerHTML = results.length ? shownResults.map(drugCard).join("") : empty("没有匹配结果，请检查名称或添加自定义药品。", '<button class="btn primary" data-route-link="add">添加药品</button>');
      document.getElementById("searchLoadMore").hidden = shownResults.length >= results.length;
    };
    input.addEventListener("input", () => draw(true));
    filter.addEventListener("change", () => draw(true));
    pharmacyFilter.addEventListener("change", () => draw(true));
    document.getElementById("searchLoadMore").addEventListener("click", () => {
      visibleLimit += INITIAL_SEARCH_RENDER_LIMIT;
      draw();
    });
    draw();
  }

  function renderDetail(id) {
    const drug = drugById(id);
    if (!drug) {
      app.innerHTML = empty("未找到该药品，可能已被删除。", '<button class="btn primary" data-route-link="all">返回全部药物</button>');
      return;
    }
    const clinical = drug.clinical;
    const safetyUrl = safeExternalUrl(drug.safetyNotice?.url);
    const sourceUrl = safeExternalUrl(drug.source?.url);
    const detailPharmacy = normalizePharmacyScopes(drug).includes(state.activePharmacy)
      ? state.activePharmacy
      : normalizePharmacyScopes(drug)[0];
    const notes = state.notes.filter(note => note.drugId === id && recordBelongsToPharmacy(note, detailPharmacy));
    const interactionFindings = interactionEngine?.findRelevant?.(drug, visibleDrugs()) || [];
    const clinicalFields = {
      indication: clinical?.indication || "待逐条核验具体厂家现行说明书",
      dosage: clinical?.dosage || "待逐条核验具体厂家现行说明书",
      adverseReactions: clinical?.adverseReactions || "待逐条核验具体厂家现行说明书",
      precautions: clinical?.precautions || "待逐条核验具体厂家现行说明书"
    };
    const markedField = (field, label) => `<div class="detail-item"><dt>${label}</dt><dd class="${clinical ? "markable" : ""}" ${clinical ? `data-mark-field="${field}"` : ""}>${renderMarkedText(id, field, clinicalFields[field])}</dd></div>`;
    app.innerHTML = `
      <section class="panel section">
        <div class="detail-head">
          <div><h2>${esc(drug.drugName)}</h2><p class="muted">${esc(drug.rawName)}</p>${pharmacyBadges(drug)} ${statusBadge(drug)}</div>
          <button class="star-btn ${isFavorite(id) ? "active" : ""}" data-favorite="${esc(id)}">★</button>
        </div>
        ${drug.qualityIssue ? `<div class="notice danger" style="margin-top:14px"><strong>质控锁定：</strong>${esc(drug.qualityIssue)}</div>` : ""}
        ${drug.safetyNotice ? `<div class="notice danger" style="margin-top:14px"><strong>官方安全警示：</strong>${esc(drug.safetyNotice.summary)}${safetyUrl ? `<br><a href="${esc(safetyUrl)}" target="_blank" rel="noopener">查看国家药监局公告</a>` : ""} · 发布：${esc(drug.safetyNotice.publishedAt)}</div>` : ""}
        <dl class="detail-grid">
          <div class="detail-item"><dt>通用名</dt><dd>${esc(drug.genericName || "待核验")}</dd></div>
          <div class="detail-item"><dt>商品名</dt><dd>${esc(drug.tradeName || "未录入")}</dd></div>
          <div class="detail-item"><dt>所属药库</dt><dd>${normalizePharmacyScopes(drug).map(pharmacyLabel).map(esc).join("、")}</dd></div>
          <div class="detail-item"><dt>规格</dt><dd>${esc(drug.specification || "待核验")}</dd></div>
          <div class="detail-item"><dt>剂型</dt><dd>${esc(drug.dosageForm || "待核验")}</dd></div>
          <div class="detail-item"><dt>药物作用分类</dt><dd>${esc(drug.therapeuticClass || "作用待分类")}</dd></div>
          <div class="detail-item"><dt>药品属性 / 医保标记</dt><dd>${esc(drug.category || "未分类")} · ${esc(drug.insuranceClass || "未标注")}</dd></div>
          <div class="detail-item"><dt>生产企业</dt><dd>${esc(drug.manufacturer || "待核验")}</dd></div>
          <div class="detail-item"><dt>上市许可持有人</dt><dd>${esc(drug.marketingAuthorizationHolder || "待核验")}</dd></div>
          <div class="detail-item"><dt>批准文号</dt><dd>${esc(drug.approvalNumber || "待核验")}</dd></div>
          <div class="detail-item"><dt>主要成分</dt><dd>${esc(Array.isArray(drug.components) && drug.components.length ? drug.components.join("、") : "未单独录入")}</dd></div>
          ${drug.packagingNote ? `<div class="detail-item"><dt>包装说明</dt><dd>${esc(drug.packagingNote)}</dd></div>` : ""}
          ${markedField("indication", "适应症")}
          ${markedField("dosage", "用法用量")}
          ${markedField("adverseReactions", "不良反应")}
          ${markedField("precautions", "注意事项")}
        </dl>
        <div class="clinical-editor" style="margin-top:16px">
          <h3>相互作用与禁忌</h3>
          ${drug.contraindications ? `<div class="notice danger" style="margin-top:10px"><strong>本药禁忌补充：</strong>${esc(drug.contraindications)}</div>` : ""}
          ${drug.interactionNotes ? `<div class="notice" style="margin-top:10px"><strong>本药相互作用补充：</strong>${esc(drug.interactionNotes)}</div>` : ""}
          <div class="card-list" style="margin-top:10px">${interactionFindings.length
            ? interactionFindings.map(item => interactionRuleCard(item.rule, item.partners)).join("")
            : empty("当前目录未命中内置高风险组合；未命中不代表可以联用，仍须核对完整说明书和患者具体情况。")}</div>
        </div>
        ${clinical ? `<p class="muted" style="margin-bottom:8px">长按或拖选说明书摘要文字，然后选择标记样式。</p><div id="markToolbar" class="mark-toolbar" hidden><small id="selectedTextPreview"></small><button class="btn secondary small" data-mark-type="underline">划线</button><button class="btn secondary small" data-mark-type="bold">加粗</button><button class="btn secondary small" data-mark-type="highlight">荧光笔</button></div>` : ""}
        <div class="source-box">
          <strong>来源：</strong>${esc(drug.source?.label || "未记录")}<br>
          ${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">打开来源页面</a><br>` : ""}
          核验日期：${esc(drug.source?.checkedAt || "未核验")}。通用资料不能替代具体厂家、批准文号对应的现行说明书。
        </div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn ${isCached(id) ? "ghost" : "secondary"}" data-cache="${esc(id)}">${isCached(id) ? "移出缓存" : "缓存此药"}</button>
          <button class="btn secondary" id="editDrugBtn">编辑药品</button>
          <button class="btn primary" id="addNoteBtn">添加笔记</button>
        </div>
      </section>
      <section class="section">
        <div class="section-title"><h2>关联笔记</h2><small>${notes.length} 条</small></div>
        <div class="card-list">${notes.length ? notes.map(note => noteCard(note)).join("") : empty("暂无笔记")}</div>
      </section>`;
    document.getElementById("addNoteBtn").addEventListener("click", () => openNoteModal(id));
    document.getElementById("editDrugBtn").addEventListener("click", () => openEditDrugModal(id));
    if (clinical) setupTextMarking(id);
  }

  function setupTextMarking(drugId) {
    const toolbar = document.getElementById("markToolbar");
    let selectionData = null;
    const capture = () => setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const startNode = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
      const endNode = selection.focusNode?.nodeType === Node.TEXT_NODE ? selection.focusNode.parentElement : selection.focusNode;
      const field = startNode?.closest?.(".markable");
      if (!field || !field.contains(endNode)) return;
      const text = selection.toString().trim().slice(0, 240);
      if (!text) return;
      selectionData = { field: field.dataset.markField, text };
      document.getElementById("selectedTextPreview").textContent = `已选：“${text.slice(0, 28)}${text.length > 28 ? "…" : ""}”`;
      toolbar.hidden = false;
    }, 20);
    app.querySelectorAll(".markable").forEach(node => {
      node.addEventListener("mouseup", capture);
      node.addEventListener("touchend", capture, { passive: true });
    });
    toolbar.querySelectorAll("[data-mark-type]").forEach(button => button.addEventListener("click", () => {
      if (!selectionData) return;
      const duplicate = state.marks.some(mark => mark.drugId === drugId && mark.field === selectionData.field && mark.text === selectionData.text && mark.type === button.dataset.markType);
      if (!duplicate) {
        state.marks.push({ id: `mark-${Date.now()}`, drugId, pharmacyId: recordPharmacyId({ drugId }), ...selectionData, type: button.dataset.markType, createdAt: new Date().toISOString() });
        saveState("marks");
        toast("文本标记已保存");
      }
      window.getSelection()?.removeAllRanges();
      renderDetail(drugId);
    }));
  }

  function noteCard(note) {
    const drug = drugById(note.drugId);
    return `<article class="card"><div class="detail-head"><div><h3>${esc(drug?.drugName || "已删除药品")}</h3><small class="muted">${new Date(note.updatedAt).toLocaleString("zh-CN")}</small></div><div class="card-actions"><button class="btn ghost small" data-edit-note="${esc(note.id)}" data-note-drug="${esc(note.drugId)}">编辑</button><button class="btn ghost small" data-delete-note="${esc(note.id)}">删除</button></div></div><p class="drug-sub">${esc(note.content)}</p></article>`;
  }

  function renderFavorites() {
    const drugs = state.favorites.map(drugById).filter(drug => drug && !state.hidden.includes(drug.id));
    const groupName = id => state.groups.find(group => group.id === id)?.name || state.groups[0]?.name || "默认收藏";
    const favoriteCard = drug => `<div class="favorite-entry">${drugCard(drug)}<div class="favorite-tools"><span>分组：${esc(groupName(state.favoriteMap[drug.id]))}</span><button class="btn ghost small" data-move-favorite="${esc(drug.id)}">移动分组</button></div></div>`;
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>收藏药品</h2><button class="btn secondary small" id="newGroupBtn">新建分组</button></div>
        <div class="group-admin-grid">${state.groups.map(group => { const count = drugs.filter(drug => (state.favoriteMap[drug.id] || state.groups[0]?.id) === group.id).length; return `<div class="group-admin-card"><button data-filter-favorite-group="${esc(group.id)}"><strong>${esc(group.name)}</strong><small>${count} 个药品</small></button><div><button class="btn ghost small" data-rename-group="${esc(group.id)}">重命名</button>${group.id === "default" ? "" : `<button class="btn ghost small" data-delete-group="${esc(group.id)}">删除</button>`}</div></div>`; }).join("")}</div>
        <div class="toolbar" style="margin-top:12px"><select id="favoriteGroup"><option value="">全部分组</option>${state.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></div>
        <div id="favoriteList" class="card-list">${drugs.length ? drugs.map(favoriteCard).join("") : empty("还没有收藏药品。")}</div>
      </section>`;
    const draw = group => {
      const filtered = group ? drugs.filter(drug => (state.favoriteMap[drug.id] || state.groups[0]?.id) === group) : drugs;
      document.getElementById("favoriteList").innerHTML = filtered.length ? filtered.map(favoriteCard).join("") : empty("该分组暂无药品。");
    };
    document.getElementById("favoriteGroup").addEventListener("change", event => draw(event.target.value));
    app.querySelectorAll("[data-filter-favorite-group]").forEach(button => button.addEventListener("click", () => {
      document.getElementById("favoriteGroup").value = button.dataset.filterFavoriteGroup;
      draw(button.dataset.filterFavoriteGroup);
    }));
    app.querySelectorAll("[data-rename-group]").forEach(button => button.addEventListener("click", () => openRenameGroupModal(button.dataset.renameGroup)));
    app.querySelectorAll("[data-delete-group]").forEach(button => button.addEventListener("click", () => deleteFavoriteGroup(button.dataset.deleteGroup)));
    document.getElementById("favoriteList").addEventListener("click", event => {
      const button = event.target.closest("[data-move-favorite]");
      if (button) { event.stopPropagation(); openMoveFavoriteModal(button.dataset.moveFavorite); }
    });
    document.getElementById("newGroupBtn").addEventListener("click", openGroupModal);
  }

  function renderAdd() {
    const lookupCandidates = new Map();
    const categoryOptions = DRUG_CATEGORY_IDS.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
    const pharmacyOptions = Object.entries(PHARMACIES).map(([id, pharmacy]) =>
      `<option value="${esc(id)}" ${id === state.activePharmacy ? "selected" : ""}>${esc(pharmacy.label)}</option>`
    ).join("");
    app.innerHTML = `
      <section class="panel section">
        <h2>添加药物</h2>
        <h3 style="margin-top:14px">1. 联网自动检索说明书</h3>
        <p class="notice">当前目标为${esc(pharmacyLabel(state.activePharmacy))}。输入至少 2 个汉字的中文药名片段，停顿后会自动检索可信说明书；也可按回车或立即检索。存在多个厂家/规格时请先选择对应候选。</p>
        <form id="drugForm" style="margin-top:16px">
          <div class="field"><label>药品名称 *</label><div class="toolbar"><input id="drugNameInput" name="drugName" required maxlength="60" autocomplete="off" placeholder="输入商品名或通用名"><button class="btn secondary" id="lookupDrugBtn" type="button">智能识别</button></div></div>
          <div id="lookupStatus" class="muted" role="status" aria-live="polite"></div>
          <div id="lookupResults" class="card-list lookup-results"></div>
          <div id="lookupLinks" class="toolbar"></div>
          <h3 style="margin-top:22px">2. 手动填写表单</h3>
          <div class="form-grid" style="margin-top:12px">
            <div class="field"><label>所属药库 *</label><select name="pharmacyScope" required>${pharmacyOptions}</select></div>
            <div class="field"><label>药品分类 *</label><select name="category" required><option value="">请选择分类</option>${categoryOptions}</select></div>
            <div class="field"><label>通用名</label><input name="genericName"></div>
            <div class="field"><label>商品名</label><input name="tradeName"></div>
            <div class="field"><label>药品规格</label><input name="specification" placeholder='例如：5mg*28片'></div>
            <div class="field"><label>剂型</label><input name="dosageForm"></div>
            <div class="field"><label>药物作用分类</label><input name="therapeuticClass"></div>
            <div class="field"><label>医保标记</label><input name="insuranceClass" value="未标注"></div>
            <div class="field"><label>生产企业</label><input name="manufacturer"></div>
            <div class="field"><label>上市许可持有人</label><input name="marketingAuthorizationHolder"></div>
            <div class="field"><label>批准文号</label><input name="approvalNumber"></div>
          </div>
          <div class="field"><label>适应症 *</label><textarea name="indication" rows="4" required></textarea></div>
          <div class="field"><label>用法用量 *</label><textarea name="dosage" rows="4" required></textarea></div>
          <div class="field"><label>不良反应</label><textarea name="adverseReactions" rows="4"></textarea></div>
          <div class="field"><label>注意事项</label><textarea name="precautions" rows="4"></textarea></div>
          <div class="field"><label>备注</label><textarea name="notes" rows="3" placeholder="个人备注，可不填"></textarea></div>
          <input type="hidden" name="sourceLabel"><input type="hidden" name="sourceUrl"><input type="hidden" name="sourceCheckedAt"><input type="hidden" name="sourceStatus">
          <p id="selectedSource" class="muted">当前来源：用户手动录入</p>
          <button class="btn primary" type="submit">保存自定义药品</button>
        </form>
      </section>`;
    const form = document.getElementById("drugForm");
    const setField = (name, value) => { const field = form.elements.namedItem(name); if (field && value !== undefined && value !== null) field.value = value; };
    const useCandidate = candidate => {
      const classification = classifyDrugCandidate(candidate);
      ["drugName", "genericName", "tradeName", "specification", "dosageForm", "insuranceClass", "manufacturer", "marketingAuthorizationHolder", "approvalNumber"].forEach(name => setField(name, candidate[name]));
      if (!candidate.genericName) setField("genericName", candidate.drugName);
      setField("category", classification.category);
      setField("therapeuticClass", classification.therapeuticClass);
      ["indication", "dosage", "adverseReactions", "precautions"].forEach(name => setField(name, candidate.clinical?.[name]));
      setField("sourceLabel", candidate.source?.label || "中文联网候选"); setField("sourceUrl", candidate.source?.url || ""); setField("sourceCheckedAt", candidate.source?.checkedAt || "");
      setField("sourceStatus", candidate.source?.status || "needs-review");
      const isDraft = candidate.source?.status === "unverified-draft" || candidate.smartMeta?.draft;
      const isVerified = isVerifiedSource(candidate.source?.status);
      document.getElementById("selectedSource").textContent = isDraft
        ? `当前来源：${candidate.source?.label || "中文未核验草稿"}（未核验草稿；全部字段可编辑，可直接保存）`
        : isVerified
          ? `当前来源：${candidate.source?.label || "中文核验资料"}（来源已核验；填入内容仍可编辑）`
          : `当前来源：${candidate.source?.label || "中文联网候选"}（网页原文已提取，须按厂家、批准文号和现行说明书复核）`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      toast(isDraft ? "未核验草稿已自动填入，可修改后直接保存" : "核验资料已填入，所有字段均可修改");
    };
    const renderLookupResults = candidates => {
      const results = document.getElementById("lookupResults");
      lookupCandidates.clear();
      candidates.forEach((candidate, index) => { candidate.lookupId ||= `lookup-${Date.now()}-${index}`; lookupCandidates.set(candidate.lookupId, candidate); });
      results.innerHTML = candidates.length ? candidates.map(candidate => {
        const classification = classifyDrugCandidate(candidate);
        const sourceUrl = safeExternalUrl(candidate.source?.url);
        const tradeNameSourceUrl = safeExternalUrl(candidate.lookupMeta?.tradeNameSource?.url);
        const isDraft = candidate.source?.status === "unverified-draft" || candidate.smartMeta?.draft;
        const isVerified = isVerifiedSource(candidate.source?.status);
        const confidence = { high: "高", medium: "中", low: "低" }[candidate.smartMeta?.confidence] || "";
        const meta = [confidence && `可信度：${confidence}`, candidate.smartMeta?.approvalNumber && `批准文号：${candidate.smartMeta.approvalNumber}`].filter(Boolean).join(" · ");
        const sourceBadge = isDraft ? "未核验草稿" : isVerified ? "核验资料" : "联网原文待复核";
        return `<article class="card lookup-card"><div><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(candidate.tradeName || "无商品名")} · ${esc(candidate.specification || "规格待补充")} · ${esc(classification.category)} · ${esc(classification.therapeuticClass)}</p><p class="drug-sub"><span class="badge ${isVerified ? "ok" : "warn"}">${sourceBadge}</span> ${esc(candidate.source?.label || "中文候选")}${candidate.clinical ? " · 含中文临床字段" : ""}${candidate.lookupMeta?.matchedByTradeName ? " · 商品名已识别" : ""}</p>${meta ? `<p class="drug-sub">${esc(meta)}</p>` : ""}<div class="toolbar">${tradeNameSourceUrl ? `<a class="btn ghost small link-btn" href="${esc(tradeNameSourceUrl)}" target="_blank" rel="noopener">查看商品名来源</a>` : ""}${sourceUrl ? `<a class="btn ghost small link-btn" href="${esc(sourceUrl)}" target="_blank" rel="noopener">查看中文来源</a>` : ""}<button class="btn secondary small" type="button" data-use-lookup="${esc(candidate.lookupId)}">${isDraft ? "填入并编辑" : "自动填充此项"}</button></div></div></article>`;
      }).join("") : empty("暂未生成可自动填充的中文资料。可稍后重试，或使用下方中文搜索入口手动补充。", '<a class="btn ghost link-btn" href="https://www.nmpa.gov.cn/datasearch/home-index.html#category=yp" target="_blank" rel="noopener">打开国家药监局</a>');
    };
    const renderVerificationLinks = links => {
      document.getElementById("lookupLinks").innerHTML = (links || []).map(link => {
        const url = safeExternalUrl(link.url);
        return url ? `<a class="btn ghost small link-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(link.label || "打开中文资料")}</a>` : "";
      }).join("");
    };
    const revealLookupFeedback = () => requestAnimationFrame(() => document.getElementById("lookupStatus").scrollIntoView({ behavior: "smooth", block: "center" }));
    document.getElementById("lookupResults").addEventListener("click", event => {
      const button = event.target.closest("[data-use-lookup]");
      if (button) useCandidate(lookupCandidates.get(button.dataset.useLookup));
    });
    document.getElementById("lookupDrugBtn").addEventListener("click", async () => {
      const query = form.elements.namedItem("drugName").value.trim();
      if (!query) return toast("请先输入药品名");
      if (!hasChineseText(query)) return toast("请输入中文药品名称");
      const button = document.getElementById("lookupDrugBtn"); const status = document.getElementById("lookupStatus");
      button.disabled = true; button.textContent = "识别中…"; status.textContent = state.smartSearchEndpoint ? "正在智能识别药品信息…" : "智能识别服务未配置，正在读取项目中文核验库…";
      revealLookupFeedback();
      try {
        const result = await searchDrugCandidates(query); const candidates = result.candidates;
        renderLookupResults(candidates);
        renderVerificationLinks(result.verificationLinks);
        const autoCandidate = candidates[0];
        const autoDraft = autoCandidate && (autoCandidate.source?.status === "unverified-draft" || autoCandidate.smartMeta?.draft);
        if (autoCandidate) useCandidate(autoCandidate);
        if (result.smartError) status.textContent = `智能识别服务暂不可用，已回退到项目中文核验库${candidates.length ? `，显示 ${candidates.length} 个候选` : ""}：${result.smartError.message}`;
        else if (!result.smartConfigured) status.textContent = `智能识别服务未配置，当前只显示项目中文核验库${candidates.length ? `的 ${candidates.length} 个候选` : ""}。请到缓存管理页配置。`;
        else if (autoDraft) status.textContent = "未找到核验资料，已生成并自动填入未核验草稿；所有字段都可编辑，可直接保存。";
        else status.textContent = autoCandidate ? `智能识别完成，已自动填入表单；共有 ${candidates.length} 个候选可切换。` : "暂未生成候选，请稍后重试或使用下方中文搜索入口。";
        if (result.warnings?.length) status.textContent += ` 提示：${result.warnings.join("；")}`;
        if (!autoDraft && candidates.length) toast("智能识别完成，已自动填入表单");
        revealLookupFeedback();
      } catch (error) {
        renderLookupResults([]); status.textContent = `智能识别失败：${error.message || "网络不可用"}`;
        toast("智能识别失败，请检查网络"); revealLookupFeedback();
      } finally { button.disabled = false; button.textContent = "智能识别"; }
    });
    document.getElementById("drugNameInput").addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      document.getElementById("lookupDrugBtn").click();
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const now = new Date().toISOString();
      const drugName = data.drugName.trim();
      const category = data.category.trim();
      const pharmacyScope = normalizePharmacyId(data.pharmacyScope, state.activePharmacy);
      const clinicalFields = {
        indication: data.indication.trim(), dosage: data.dosage.trim(),
        adverseReactions: data.adverseReactions.trim(), precautions: data.precautions.trim()
      };
      if (!drugName || !category || !clinicalFields.indication || !clinicalFields.dosage) {
        return toast("请填写药品名称、药品分类、适应症和用法用量");
      }
      const sourceStatus = String(data.sourceStatus || "").trim();
      const unverifiedDraft = sourceStatus === "unverified-draft";
      const networkImported = Boolean(data.sourceUrl.trim()) || unverifiedDraft;
      const drugId = `custom-${Date.now()}`;
      const drug = {
        id: drugId,
        pharmacyScopes: [pharmacyScope],
        rawName: drugName,
        drugName,
        genericName: data.genericName.trim() || drugName,
        tradeName: data.tradeName.trim(),
        specification: data.specification.trim(),
        dosageForm: data.dosageForm.trim(),
        category,
        therapeuticClass: data.therapeuticClass.trim() || normalizeTherapeuticClass("", drugName, clinicalFields.indication, category),
        manufacturer: data.manufacturer.trim(),
        marketingAuthorizationHolder: data.marketingAuthorizationHolder.trim(),
        approvalNumber: data.approvalNumber.trim(),
        insuranceClass: data.insuranceClass.trim() || "未标注",
        clinical: clinicalFields,
        qualityIssue: unverifiedDraft ? "此条目属于未核验草稿；全部字段可编辑，且不能替代对应厂家现行说明书。" : networkImported ? "联网候选字段尚未按批准文号和具体厂家现行说明书复核。" : "自定义药品尚未核验说明书与批准文号。",
        source: { status: unverifiedDraft ? "unverified-draft" : "needs-review", label: data.sourceLabel.trim() || "用户手动录入", url: data.sourceUrl.trim(), checkedAt: data.sourceCheckedAt.trim() || now.slice(0, 10) },
        importedFromNetwork: networkImported,
        isCustom: true
      };
      state.customDrugs.push(drug);
      saveState("customDrugs");
      if (!builtInCatalogDrugs().some(item => item.category === category) && !state.customCategories.includes(category)) {
        state.customCategories.push(category); saveState("customCategories");
      }
      const notes = data.notes.trim();
      if (notes) {
        state.notes.push({ id: `note-${Date.now()}`, drugId, pharmacyId: pharmacyScope, content: notes, updatedAt: now });
        saveState("notes");
      }
      state.activePharmacy = pharmacyScope;
      write("activePharmacy", state.activePharmacy);
      toast(`药品已保存到${pharmacyLabel(pharmacyScope)}`);
      navigate("detail", drug.id);
    });
  }

  const hasChineseText = value => /[\u3400-\u9fff]/.test(String(value || ""));

  function isChineseCandidate(candidate) {
    if (!hasChineseText(candidate.drugName)) return false;
    if (!candidate.clinical) return true;
    return ["indication", "dosage", "adverseReactions", "precautions"].every(name => !candidate.clinical[name] || hasChineseText(candidate.clinical[name]));
  }

  function localLookupCandidates(query) {
    return builtInCatalogDrugs().filter(drug => {
      const alias = tradeNameAliasForDrug(query, drug);
      return isVerifiedSource(drug.source?.status) && drug.clinical && drug.source?.url && (directlyMatchesDrug(query, drug) || alias);
    }).slice(0, 8).map(drug => {
      const alias = tradeNameAliasForDrug(query, drug);
      return ({
      drugName: drug.genericName || drug.drugName, genericName: drug.genericName || drug.drugName, tradeName: alias?.tradeName || drug.tradeName || "", specification: alias ? "" : drug.specification,
      category: normalizeDrugCategory(drug.category, drug.drugName),
      dosageForm: drug.dosageForm || "", therapeuticClass: drug.therapeuticClass || "", insuranceClass: drug.insuranceClass || "",
      manufacturer: drug.manufacturer || "", marketingAuthorizationHolder: drug.marketingAuthorizationHolder || "", approvalNumber: drug.approvalNumber || "",
      clinical: { ...drug.clinical }, source: { ...drug.source, label: `${drug.source.label}（本项目核验资料）` },
      lookupMeta: { matchedByTradeName: Boolean(alias), tradeNameSource: alias?.source || null }
    }); }).filter(isChineseCandidate);
  }

  async function fetchChineseCatalogCandidates(query) {
    const payload = await window.loadChineseDrugLabels();
    const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);
    return payload.drugs
      .filter(candidate => isVerifiedSource(candidate.source?.status))
      .filter(candidate => directlyMatchesDrug(query, candidate) || tradeNameAliasForDrug(query, candidate, aliases))
      .map(candidate => {
        const alias = tradeNameAliasForDrug(query, candidate, aliases);
        return ({
        drugName: candidate.genericName || candidate.drugName, genericName: candidate.genericName || candidate.drugName,
        tradeName: alias?.tradeName || candidate.tradeName || "", specification: alias ? "" : candidate.specification || "",
        category: normalizeDrugCategory(candidate.category, candidate.drugName),
        dosageForm: candidate.dosageForm || "", therapeuticClass: candidate.therapeuticClass || "", insuranceClass: candidate.insuranceClass || "",
        manufacturer: candidate.manufacturer || "", marketingAuthorizationHolder: candidate.marketingAuthorizationHolder || "", approvalNumber: candidate.approvalNumber || "",
        clinical: candidate.clinical ? { ...candidate.clinical } : null,
        source: { ...candidate.source, label: `${candidate.source.label}（联网中文库）` },
        lookupMeta: { matchedByTradeName: Boolean(alias), tradeNameSource: alias?.source || null }
      }); })
      .filter(isChineseCandidate).slice(0, 8);
  }

  function directoryHintFor(query) {
    const q = normalize(query);
    const matches = builtInCatalogDrugs().filter(drug => directlyMatchesDrug(query, drug) || tradeNameAliasForDrug(query, drug));
    const drug = matches.find(item => [item.drugName, item.genericName, item.tradeName].some(value => normalize(value) === q)) || matches[0];
    if (!drug) return {};
    const alias = tradeNameAliasForDrug(query, drug);
    return {
      drugName: drug.genericName || drug.drugName || "", tradeName: alias?.tradeName || drug.tradeName || "",
      specification: alias ? "" : drug.specification || "",
      category: normalizeDrugCategory(drug.category, drug.drugName, drug.approvalNumber, drug.source?.url, drug.clinical?.indication),
      therapeuticClass: normalizeTherapeuticClass(drug.therapeuticClass, drug.drugName, drug.clinical?.indication, drug.category)
    };
  }

  async function fetchSmartSearchCandidates(query) {
    const endpoint = normalizeServiceEndpoint(state.smartSearchEndpoint);
    if (!endpoint) return { candidates: [], warnings: [] };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch(`${endpoint}/v1/drugs/search`, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `免费检索服务返回 ${response.status}`);
      if (!Array.isArray(payload.candidates)) throw new Error("免费检索结果格式无效");
      const qualityLabels = { regulator: "药监部门", manufacturer: "生产企业", hospital: "医疗机构", "medical-database": "医药数据库", other: "其他中文来源" };
      const candidates = payload.candidates.map(candidate => {
        const draft = candidate.draft === true || candidate.verified === false;
        const clinical = {
          indication: candidate.indications || candidate.clinical?.indication || "",
          dosage: candidate.dosage || candidate.clinical?.dosage || "",
          adverseReactions: candidate.adverseReactions || candidate.clinical?.adverseReactions || "",
          precautions: candidate.precautions || candidate.clinical?.precautions || ""
        };
        const source = {
          status: draft ? "unverified-draft" : "needs-review",
          label: draft ? `未核验草稿：${candidate.sourceTitle || "中文资料草稿"}` : `免费联网：${candidate.sourceTitle || "中文资料"} · ${qualityLabels[candidate.sourceQuality] || "其他中文来源"}`,
          url: candidate.sourceUrl || "", checkedAt: candidate.sourceCheckedAt || new Date().toISOString().slice(0, 10)
        };
        const normalizedCandidate = {
          drugName: candidate.drugName || "", genericName: candidate.drugName || "", tradeName: candidate.tradeName || "",
          specification: candidate.specification || "", dosageForm: candidate.dosageForm || "",
          manufacturer: candidate.manufacturer || "", marketingAuthorizationHolder: candidate.manufacturer || "", approvalNumber: candidate.approvalNumber || "",
          category: candidate.category || "", therapeuticClass: candidate.therapeuticClass || "", clinical, source
        };
        const classification = classifyDrugCandidate(normalizedCandidate);
        return ({
        ...normalizedCandidate,
        ...classification,
        smartMeta: { confidence: candidate.confidence || "low", sourceQuality: candidate.sourceQuality || "other", approvalNumber: candidate.approvalNumber || "", draft, verified: candidate.verified === true, editable: candidate.editable !== false },
        lookupMeta: {
          matchedByTradeName: candidate.matchType === "trade-name",
          tradeNameSource: candidate.tradeNameSourceUrl ? { label: candidate.tradeNameSourceTitle || "商品名核验来源", url: candidate.tradeNameSourceUrl } : null
        }
      }); }).filter(isChineseCandidate).slice(0, 6);
      const verificationLinks = Array.isArray(payload.verificationLinks)
        ? payload.verificationLinks.map(link => ({ label: String(link.label || link.title || ""), url: safeExternalUrl(link.url) })).filter(link => link.label && link.url).slice(0, 6)
        : [];
      return { candidates, warnings: Array.isArray(payload.warnings) ? payload.warnings.filter(hasChineseText).slice(0, 8) : [], verificationLinks, mode: payload.mode || "" };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("检索超时，请稍后重试");
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function searchDrugCandidates(query) {
    if (!hasChineseText(query)) throw new Error("仅支持中文药品名称");
    const smartConfigured = Boolean(state.smartSearchEndpoint);
    let smart = []; let warnings = []; let verificationLinks = []; let smartError = null; let remote = []; let networkError = null;
    if (smartConfigured) {
      try { ({ candidates: smart, warnings, verificationLinks } = await fetchSmartSearchCandidates(query)); } catch (error) { smartError = error; }
    }
    try { remote = await fetchChineseCatalogCandidates(query); } catch (error) { networkError = error; }
    const local = localLookupCandidates(query);
    const seen = new Set();
    const candidates = [...smart, ...remote, ...local].filter(candidate => {
      const key = normalize(`${candidate.drugName}|${candidate.tradeName}|${candidate.specification}`);
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, 8);
    if (candidates.some(candidate => candidate.lookupMeta?.matchedByTradeName)) {
      warnings = [...new Set([...warnings, "已按商品名识别通用名；不同厂家和包装的规格可能不同，请按药盒或现行说明书核对规格。"])];
    }
    return { candidates, networkError, smartError, warnings, verificationLinks, smartConfigured };
  }

  function renderInteractions() {
    const options = visibleDrugs().map(drug => `<option value="${esc(drug.id)}">${esc(drug.drugName)}｜${esc(drug.specification)}｜${esc(normalizePharmacyScopes(drug).map(id => PHARMACIES[id].shortLabel).join("/"))}</option>`).join("");
    app.innerHTML = `
      <section class="panel section">
        <h2>两药联用查询</h2>
        <p class="notice danger"><strong>安全边界：</strong>当前匹配公开现行说明书整理的高风险规则及本机自定义记录，重点覆盖禁忌和严重组合；不是完整处方审核，未匹配不代表可以联用。</p>
        <div class="field" style="margin-top:16px"><label>药品 A</label><select id="drugA"><option value="">请选择</option>${options}</select></div>
        <div class="field"><label>药品 B</label><select id="drugB"><option value="">请选择</option>${options}</select></div>
        <button class="btn primary" id="checkInteraction">查询相互作用</button>
        <div id="interactionResult" style="margin-top:14px"></div>
      </section>`;
    document.getElementById("checkInteraction").addEventListener("click", () => {
      const a = document.getElementById("drugA").value;
      const b = document.getElementById("drugB").value;
      const result = document.getElementById("interactionResult");
      if (!a || !b || a === b) {
        result.innerHTML = '<div class="notice danger">请选择两种不同药品。</div>';
        return;
      }
      const drugA = drugById(a);
      const drugB = drugById(b);
      const verifiedMatches = interactionEngine?.findMatches?.(drugA, drugB) || [];
      const customMatches = state.contraindications.filter(item =>
        (item.drugA === a && item.drugB === b) || (item.drugA === b && item.drugB === a));
      const verifiedHtml = verifiedMatches.map(rule => interactionRuleCard(rule)).join("");
      const customHtml = customMatches.map(match => `<article class="card"><div class="detail-head"><h3>本机自定义记录</h3><span class="badge ${interactionSeverityClass(match.severity)}">${esc(match.severity)}</span></div>${match.mechanism ? `<p class="drug-sub"><strong>机制：</strong>${esc(match.mechanism)}</p>` : ""}<p class="drug-sub"><strong>可能后果：</strong>${esc(match.consequence || "存在自定义禁忌记录")}</p><p class="drug-sub"><strong>处理建议：</strong>${esc(match.recommendation || "请咨询药师")}</p></article>`).join("");
      result.innerHTML = verifiedHtml || customHtml
        ? `<div class="card-list">${verifiedHtml}${customHtml}</div>`
        : '<div class="notice">未命中当前高风险规则或本机自定义记录。不能据此判断可联用，请继续核对两药完整说明书、剂量、适应症、肝肾功能及患者其他用药。</div>';
    });
  }

  function renderSymptoms() {
    app.innerHTML = `
      <section class="panel section">
        <h2>症状搜索</h2>
        <p class="notice danger">仅凭症状自动推荐药物可能延误诊断。此功能必须接入经过审核的知识库、红旗症状分诊和人工复核流程后才能启用。</p>
        <div class="field" style="margin-top:16px"><label>症状描述</label><textarea rows="5" placeholder="例如：发热3天、伴呼吸困难……"></textarea></div>
        <button class="btn ghost" disabled>安全检索服务尚未配置</button>
      </section>`;
  }

  function renderFlashcards() {
    const candidates = allDrugs().filter(d => d.clinical && isVerifiedSource(d.source?.status));
    if (!candidates.length) {
      app.innerHTML = empty("暂无已核验临床字段可用于闪卡。完成说明书核验后会自动加入。", '<button class="btn primary" data-route-link="all">查看目录</button>');
      return;
    }
    const categories = [...new Set(candidates.map(drug => drug.therapeuticClass || "作用待分类"))];
    let deck = []; let index = 0; let flipped = false;
    app.innerHTML = `
      <section class="panel section">
        <div class="section-title"><h2>说明书闪卡</h2><span class="badge info" id="rememberedCount"></span></div>
        <div class="toolbar"><select id="flashCategory"><option value="">全部分类</option>${categories.map(category => `<option>${esc(category)}</option>`).join("")}</select><select id="flashMode"><option value="ordered">顺序模式</option><option value="random">随机模式</option></select><label class="switch-label"><input type="checkbox" id="unrememberedOnly"> 仅看未记住</label></div>
        <div class="section-title"><small id="flashProgressText"></small><button class="btn ghost small" id="shuffleCards">重新洗牌</button></div><div class="progress"><span id="flashProgressBar"></span></div>
      </section>
      <section id="flashcardArea"></section>`;
    const shuffled = list => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
      return copy;
    };
    const draw = () => {
      const area = document.getElementById("flashcardArea");
      document.getElementById("rememberedCount").textContent = `已记住 ${candidates.filter(drug => isRemembered(drug.id)).length} / ${candidates.length}`;
      if (!deck.length) {
        document.getElementById("flashProgressText").textContent = "0 张"; document.getElementById("flashProgressBar").style.width = "0";
        area.innerHTML = empty("当前筛选下没有闪卡。", '<button class="btn ghost" id="showAllCards">显示全部</button>');
        document.getElementById("showAllCards")?.addEventListener("click", () => { document.getElementById("flashCategory").value = ""; document.getElementById("unrememberedOnly").checked = false; buildDeck(); });
        return;
      }
      index = Math.min(index, deck.length - 1); const drug = deck[index];
      document.getElementById("flashProgressText").textContent = `${index + 1} / ${deck.length}`;
      document.getElementById("flashProgressBar").style.width = `${((index + 1) / deck.length) * 100}%`;
      area.innerHTML = `<button class="panel section" id="flashcard" style="width:100%;min-height:300px;text-align:left">
        ${flipped ? `<span class="badge ok">背面</span><h2>${esc(drug.drugName)}</h2><div class="detail-item"><dt>适应症</dt><dd>${esc(drug.clinical.indication)}</dd></div><div class="detail-item" style="margin-top:10px"><dt>用法用量</dt><dd>${esc(drug.clinical.dosage)}</dd></div>` : `<span class="badge info">正面</span><h2>${esc(drug.drugName)}</h2><p class="muted">${esc(drug.genericName)} · ${esc(drug.specification)}</p><p style="margin-top:80px;text-align:center">点击翻转查看说明书摘要</p>`}
        </button><div class="toolbar"><button class="btn ghost" id="prevCard">上一张</button><button class="btn ${isRemembered(drug.id) ? "secondary" : "primary"}" id="rememberCard">${isRemembered(drug.id) ? "取消已记住" : "标记已记住"}</button><button class="btn ghost" id="nextCard">下一张</button></div>`;
      document.getElementById("flashcard").onclick = () => { flipped = !flipped; draw(); };
      document.getElementById("prevCard").onclick = () => { index = (index - 1 + deck.length) % deck.length; flipped = false; draw(); };
      document.getElementById("nextCard").onclick = () => { index = (index + 1) % deck.length; flipped = false; draw(); };
      document.getElementById("rememberCard").onclick = () => { toggleSet("remembered", drug.id); document.getElementById("unrememberedOnly").checked ? buildDeck() : draw(); };
    };
    const buildDeck = () => {
      const category = document.getElementById("flashCategory").value;
      const onlyNew = document.getElementById("unrememberedOnly").checked;
      deck = candidates.filter(drug => (!category || drug.therapeuticClass === category) && (!onlyNew || !isRemembered(drug.id)));
      if (document.getElementById("flashMode").value === "random") deck = shuffled(deck);
      index = 0; flipped = false; draw();
    };
    document.getElementById("flashCategory").onchange = buildDeck;
    document.getElementById("flashMode").onchange = buildDeck;
    document.getElementById("unrememberedOnly").onchange = buildDeck;
    document.getElementById("shuffleCards").onclick = () => { document.getElementById("flashMode").value = "random"; buildDeck(); toast("闪卡已重新洗牌"); };
    buildDeck();
  }

  function renderCache() {
    let batchMode = false;
    const selected = new Set();
    const categories = [...new Set(allDrugs().map(drug => drug.category || "未分类"))];
    const getCached = () => state.cached.map(drugById).filter(drug => drug && drugBelongsToPharmacy(drug, state.activePharmacy));
    const cacheCard = drug => `<div class="cache-entry">${drugCard(drug, { selectable: batchMode, selected: selected.has(drug.id) })}${batchMode ? "" : `<div class="favorite-tools"><span>${drug.localEdited ? "本机已编辑 · 待复核" : "缓存目录字段"}</span><button class="btn ghost small" data-edit-cache="${esc(drug.id)}">编辑缓存字段</button></div>`}</div>`;
    app.innerHTML = `
      <section class="panel section">
        <div class="section-title"><h2>${esc(pharmacyLabel(state.activePharmacy))}离线缓存</h2><span class="badge info" id="cacheCount">${getCached().length} 个品规</span></div>
        <p class="muted">当前只展示${esc(pharmacyLabel(state.activePharmacy))}的常用药缓存；切换药库可分别管理，应用代码仍会随页面离线保存。</p>
        <div class="toolbar"><button class="btn secondary" id="cacheVerified">预加载已核验条目</button><button class="btn secondary" id="cacheBatchMode">批量操作</button><button class="btn ghost" id="detectDuplicates">检测重复</button><button class="btn ghost" id="exportCache">导出 JSON</button><button class="btn danger" id="clearCache">清空缓存</button></div>
      </section>
      <section class="panel section">
        <div class="section-title"><h2>智能识别服务</h2><span class="badge ${state.smartSearchEndpoint ? "ok" : "warn"}" id="smartSearchBadge">${state.smartSearchEndpoint ? "已配置" : "未配置"}</span></div>
        <p class="muted">填写已部署的 Cloudflare Worker 地址。服务先查 259 条可信说明书来源索引，未命中时自动限定可信域名联网检索；只提取网页原文，不使用 OpenAI 或 Workers AI 补写临床内容。</p>
        <div class="field"><label>Worker 地址</label><input id="smartSearchEndpoint" inputmode="url" placeholder="https://primary-medication-smart-search.你的账号.workers.dev" value="${esc(state.smartSearchEndpoint)}"></div>
        <div class="toolbar"><button class="btn primary" id="saveSmartSearchEndpoint">保存地址</button><button class="btn secondary" id="testSmartSearchEndpoint">测试连接</button><button class="btn ghost" id="clearSmartSearchEndpoint">清除</button></div>
        <p class="muted" id="smartSearchStatus" role="status" aria-live="polite"></p>
      </section>
      <section class="panel section">
        <div class="section-title"><h2>应用与数据</h2><span class="badge info" id="installStatus">浏览器模式</span></div>
        <p class="muted" id="installHelp">可安装到手机桌面；完整备份包含收藏、分组、自定义药品、笔记、标记、禁忌和本机编辑字段。</p>
        <div class="toolbar"><button class="btn primary" id="installApp" hidden>安装到桌面</button><button class="btn ghost" id="checkAppUpdate">检查应用更新</button><button class="btn secondary" id="exportAllData">导出完整备份</button><label class="btn ghost link-btn">恢复完整备份<input id="importAllData" type="file" accept="application/json,.json" hidden></label></div>
      </section>
      <section class="panel section" id="cacheBatchBar" hidden>
        <div class="section-title"><strong id="cacheSelectedCount">已选 0 项</strong><button class="btn ghost small" id="cacheSelectAll">全选</button></div>
        <div class="toolbar"><input id="cacheBatchCategory" list="cacheCategoryOptions" placeholder="输入新分类"><datalist id="cacheCategoryOptions">${categories.map(category => `<option value="${esc(category)}">`).join("")}</datalist><button class="btn secondary" id="applyCacheCategory">批量修改分类</button><button class="btn danger" id="removeSelectedCache">批量移出缓存</button></div>
      </section>
      <section id="duplicateResults" class="section" hidden></section>
      <section class="section"><div id="cacheList" class="card-list"></div></section>`;
    const endpointInput = document.getElementById("smartSearchEndpoint");
    const endpointStatus = document.getElementById("smartSearchStatus");
    const saveEndpoint = () => {
      try {
        state.smartSearchEndpoint = normalizeServiceEndpoint(endpointInput.value);
        write("smartSearchEndpoint", state.smartSearchEndpoint); endpointInput.value = state.smartSearchEndpoint;
        document.getElementById("smartSearchBadge").textContent = state.smartSearchEndpoint ? "已配置" : "未配置";
        document.getElementById("smartSearchBadge").className = `badge ${state.smartSearchEndpoint ? "ok" : "warn"}`;
        endpointStatus.textContent = state.smartSearchEndpoint ? "地址已保存，可到添加药物页使用免费中文检索。" : "免费检索地址已清除。";
        toast(state.smartSearchEndpoint ? "免费检索地址已保存" : "免费检索地址已清除"); return true;
      } catch (error) { endpointStatus.textContent = error.message; toast(error.message); return false; }
    };
    document.getElementById("saveSmartSearchEndpoint").onclick = saveEndpoint;
    document.getElementById("clearSmartSearchEndpoint").onclick = () => { endpointInput.value = ""; saveEndpoint(); };
    document.getElementById("testSmartSearchEndpoint").onclick = async event => {
      if (!saveEndpoint() || !state.smartSearchEndpoint) return;
      const button = event.currentTarget; button.disabled = true; button.textContent = "测试中…"; endpointStatus.textContent = "正在连接免费中文检索服务…";
      try {
        const response = await fetch(`${state.smartSearchEndpoint}/health`, { cache: "no-store", headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || `服务返回 ${response.status}`);
        if (!["free-verified", "free-ai-draft"].includes(payload.mode) || payload.requiresPaidApi !== false || payload.configured === false) throw new Error("免费智能检索服务尚未正确部署");
        endpointStatus.textContent = payload.trustedOnlineDiscoverySupported
          ? "连接成功：可信索引优先，未命中时自动联网检索真实说明书；不使用收费 API 或生成临床知识。"
          : "连接成功：可查询可信说明书来源索引；不使用收费 API。";
        toast("免费中文检索服务连接成功");
      } catch (error) { endpointStatus.textContent = `连接失败：${error.message || "请检查地址和 Worker 设置"}`; toast("免费中文检索服务连接失败"); }
      finally { button.disabled = false; button.textContent = "测试连接"; }
    };
    const draw = () => {
      const cached = getCached();
      document.getElementById("cacheCount").textContent = `${cached.length} 个品规`;
      document.getElementById("cacheSelectedCount").textContent = `已选 ${selected.size} 项`;
      document.getElementById("cacheList").innerHTML = cached.length ? cached.map(cacheCard).join("") : empty("尚未缓存药品。");
    };
    document.getElementById("cacheVerified").onclick = () => {
      state.cached = [...new Set([...state.cached, ...allDrugs().filter(d => isVerifiedSource(d.source?.status)).map(d => d.id)])];
      saveState("cached"); toast("已缓存核验条目"); renderCache();
    };
    document.getElementById("cacheBatchMode").onclick = () => {
      batchMode = !batchMode; selected.clear();
      document.getElementById("cacheBatchBar").hidden = !batchMode;
      document.getElementById("cacheBatchMode").textContent = batchMode ? "退出批量" : "批量操作";
      draw();
    };
    document.getElementById("cacheList").addEventListener("change", event => {
      const checkbox = event.target.closest("[data-select-drug]");
      if (!checkbox) return;
      checkbox.checked ? selected.add(checkbox.dataset.selectDrug) : selected.delete(checkbox.dataset.selectDrug);
      document.getElementById("cacheSelectedCount").textContent = `已选 ${selected.size} 项`;
    });
    document.getElementById("cacheList").addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-cache]");
      if (edit) { event.stopPropagation(); openEditDrugModal(edit.dataset.editCache); }
    });
    document.getElementById("cacheSelectAll").onclick = () => {
      const cached = getCached(); const allSelected = cached.length && cached.every(drug => selected.has(drug.id));
      cached.forEach(drug => allSelected ? selected.delete(drug.id) : selected.add(drug.id)); draw();
    };
    document.getElementById("applyCacheCategory").onclick = () => {
      const category = document.getElementById("cacheBatchCategory").value.trim();
      if (!selected.size) return toast("请先选择缓存药品");
      if (!category) return toast("请输入新分类");
      selected.forEach(id => { state.categoryOverrides[id] = category; });
      if (!state.customCategories.includes(category)) state.customCategories.push(category);
      saveState("categoryOverrides"); saveState("customCategories"); selected.clear(); toast("缓存药品分类已修改"); draw();
    };
    document.getElementById("removeSelectedCache").onclick = () => {
      if (!selected.size) return toast("请先选择缓存药品");
      confirmModal(`确认将 ${selected.size} 项移出缓存？`, () => {
        state.cached = state.cached.filter(id => !selected.has(id)); saveState("cached"); selected.clear(); renderCache(); toast("已批量移出缓存");
      });
    };
    document.getElementById("detectDuplicates").onclick = () => {
      const groups = Object.values(getCached().reduce((map, drug) => {
        const key = `${normalize(drug.genericName)}|${normalize(drug.specification)}`;
        if (!normalize(drug.genericName) || !normalize(drug.specification)) return map;
        (map[key] ||= []).push(drug); return map;
      }, {})).filter(group => group.length > 1);
      const panel = document.getElementById("duplicateResults"); panel.hidden = false;
      panel.innerHTML = groups.length
        ? `<div class="section-title"><h2>疑似重复品规</h2><span class="badge warn">${groups.length} 组</span></div><div class="card-list">${groups.map(group => `<div class="card"><strong>${esc(group[0].genericName)} · ${esc(group[0].specification)}</strong><p class="drug-sub">${group.map(drug => esc(drug.drugName)).join("、")}</p></div>`).join("")}</div>`
        : '<div class="notice">当前缓存中未发现“通用名 + 规格”完全相同的疑似重复项。</div>';
    };
    document.getElementById("exportCache").onclick = () => downloadJson(`${state.activePharmacy}-drug-cache.json`, { exportedAt: new Date().toISOString(), pharmacy: state.activePharmacy, drugs: getCached() });
    document.getElementById("clearCache").onclick = () => confirmModal(`确认清空${pharmacyLabel(state.activePharmacy)}缓存清单？`, () => {
      const currentIds = new Set(getCached().map(drug => drug.id));
      state.cached = state.cached.filter(id => !currentIds.has(id));
      saveState("cached"); renderCache(); toast(`${pharmacyLabel(state.activePharmacy)}缓存已清空`);
    });
    document.getElementById("installApp").onclick = async () => {
      if (!deferredInstallPrompt) return toast("请使用浏览器菜单中的“添加到主屏幕”");
      deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; updateInstallControls();
      toast(choice.outcome === "accepted" ? "已接受安装" : "已取消安装");
    };
    document.getElementById("checkAppUpdate").onclick = async () => {
      if (!("serviceWorker" in navigator)) return toast("当前浏览器不支持离线应用");
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return toast("离线服务尚未注册，请刷新页面");
      try { await registration.update(); toast("检查完成；如有新版本，请刷新页面"); } catch { toast("更新检查失败，请检查网络"); }
    };
    document.getElementById("exportAllData").onclick = () => downloadJson(`medication-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`, createFullBackup());
    document.getElementById("importAllData").onchange = async event => {
      const input = event.target; const file = input.files?.[0]; if (!file) return;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("备份文件不能超过 10MB");
        const backup = validateFullBackup(JSON.parse(await file.text()));
        confirmModal("恢复备份会覆盖当前浏览器中的全部用户数据，是否继续？", () => {
          BACKUP_KEYS.forEach(key => { state[key] = backup[key]; saveState(key); }); render(); toast("完整备份已恢复");
        });
      } catch (error) { toast(`备份无效：${error.message}`); }
      finally { input.value = ""; }
    };
    updateInstallControls();
    draw();
  }

  function renderAll(filterAction = "", filterForm = "", filterAttribute = "") {
    const initialDrugs = allDrugs();
    const actionClasses = [...new Set(initialDrugs.map(d => d.therapeuticClass || "作用待分类"))].sort((a,b) => a.localeCompare(b, "zh-CN"));
    const attributes = [...new Set(initialDrugs.map(d => d.category || "属性待核验"))];
    const forms = [...new Set(initialDrugs.map(d => d.dosageForm || "剂型待核验"))];
    let batchMode = false;
    let currentResults = [];
    let visibleLimit = INITIAL_ALL_RENDER_LIMIT;
    const selected = new Set();
    const hiddenInCurrentPharmacy = () => state.hidden.filter(id => {
      const drug = catalogDrugs().find(item => item.id === id);
      return drug && drugBelongsToPharmacy(drug, state.activePharmacy);
    });
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>${esc(pharmacyLabel(state.activePharmacy))}全部药物</h2><span class="badge info">独立目录</span></div>
        <div class="toolbar"><input id="allQuery" placeholder="筛选药品或作用分类"><select id="allAction"><option value="">全部作用分类</option>${actionClasses.map(c => `<option ${c === filterAction ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><select id="allAttribute"><option value="">全部药品属性</option>${attributes.map(c => `<option ${c === filterAttribute ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><select id="allForm"><option value="">全部剂型</option>${forms.map(f => `<option ${f === filterForm ? "selected" : ""}>${esc(f)}</option>`).join("")}</select><button class="btn secondary" id="batchModeBtn">批量操作</button></div>
        <div id="batchBar" class="panel section" hidden>
          <div class="section-title"><strong id="selectedCount">已选 0 项</strong><button class="btn ghost small" id="selectAllBtn">全选当前结果</button></div>
          <div class="toolbar"><input id="batchCategory" list="batchCategoryOptions" placeholder="输入新分类"><datalist id="batchCategoryOptions">${attributes.map(c => `<option value="${esc(c)}">`).join("")}</datalist><button class="btn secondary" id="applyBatchCategory">批量修改分类</button><button class="btn danger" id="deleteBatch">批量删除/隐藏</button>${hiddenInCurrentPharmacy().length ? `<button class="btn ghost" id="restoreHidden">恢复已隐藏（${hiddenInCurrentPharmacy().length}）</button>` : ""}</div>
          <p class="muted">内置药品执行“删除”时仅在本机隐藏，可恢复；自定义药品会删除并需要二次确认。</p>
        </div>
        <p id="allCount" class="muted"></p><div id="allList" class="card-list"></div>
        <button class="btn secondary load-more" id="allLoadMore" type="button" hidden>显示更多</button>
      </section>`;
    const draw = (resetLimit = false) => {
      if (resetLimit && !batchMode) visibleLimit = INITIAL_ALL_RENDER_LIMIT;
      const q = normalize(document.getElementById("allQuery").value);
      const action = document.getElementById("allAction").value;
      const attribute = document.getElementById("allAttribute").value;
      const form = document.getElementById("allForm").value;
      const availableDrugs = allDrugs();
      currentResults = availableDrugs.filter(d => (!q || normalize(`${d.drugName}${d.genericName}${d.tradeName}${d.specification}${d.manufacturer}${d.therapeuticClass}`).includes(q)) && (!action || d.therapeuticClass === action) && (!attribute || d.category === attribute) && (!form || d.dosageForm === form));
      const shownResults = batchMode ? currentResults : currentResults.slice(0, visibleLimit);
      document.getElementById("allCount").textContent = `${currentResults.length} 个品规${!batchMode && shownResults.length < currentResults.length ? ` · 已显示 ${shownResults.length} 个` : ""}${batchMode ? " · 批量模式" : ""}`;
      const emptyMessage = availableDrugs.length ? "没有匹配的药品。" : PHARMACIES[state.activePharmacy].emptyText;
      document.getElementById("allList").innerHTML = currentResults.length ? shownResults.map(drug => drugCard(drug, { selectable: batchMode, selected: selected.has(drug.id) })).join("") : empty(emptyMessage, '<button class="btn primary" data-route-link="add">添加药品</button>');
      document.getElementById("allLoadMore").hidden = batchMode || shownResults.length >= currentResults.length;
      document.getElementById("selectedCount").textContent = `已选 ${selected.size} 项`;
    };
    ["allQuery", "allAction", "allAttribute", "allForm"].forEach(id => document.getElementById(id).addEventListener(id === "allQuery" ? "input" : "change", () => draw(true)));
    document.getElementById("allLoadMore").addEventListener("click", () => {
      visibleLimit += INITIAL_ALL_RENDER_LIMIT;
      draw();
    });
    document.getElementById("batchModeBtn").addEventListener("click", () => {
      batchMode = !batchMode;
      if (!batchMode) selected.clear();
      document.getElementById("batchBar").hidden = !batchMode;
      document.getElementById("batchModeBtn").textContent = batchMode ? "退出批量" : "批量操作";
      draw();
    });
    document.getElementById("allList").addEventListener("change", event => {
      const checkbox = event.target.closest("[data-select-drug]");
      if (!checkbox) return;
      if (checkbox.checked) selected.add(checkbox.dataset.selectDrug);
      else selected.delete(checkbox.dataset.selectDrug);
      document.getElementById("selectedCount").textContent = `已选 ${selected.size} 项`;
    });
    document.getElementById("selectAllBtn").addEventListener("click", () => {
      const allSelected = currentResults.length && currentResults.every(drug => selected.has(drug.id));
      currentResults.forEach(drug => allSelected ? selected.delete(drug.id) : selected.add(drug.id));
      draw();
    });
    document.getElementById("applyBatchCategory").addEventListener("click", () => {
      const category = document.getElementById("batchCategory").value.trim();
      if (!selected.size) return toast("请先选择药品");
      if (!category) return toast("请输入新分类");
      selected.forEach(id => { state.categoryOverrides[id] = category; });
      if (!state.customCategories.includes(category)) state.customCategories.push(category);
      saveState("categoryOverrides"); saveState("customCategories");
      toast(`已修改 ${selected.size} 项分类`); selected.clear(); draw();
    });
    document.getElementById("deleteBatch").addEventListener("click", () => {
      if (!selected.size) return toast("请先选择药品");
      const ids = [...selected];
      confirmModal(`确认处理选中的 ${ids.length} 项？内置药品将隐藏，自定义药品将删除。`, () => {
        const customIds = new Set(ids.filter(id => id.startsWith("custom-")));
        const builtInIds = ids.filter(id => !customIds.has(id));
        state.customDrugs = state.customDrugs.filter(drug => !customIds.has(drug.id));
        state.hidden = [...new Set([...state.hidden, ...builtInIds])];
        state.notes = state.notes.filter(note => !customIds.has(note.drugId));
        state.marks = state.marks.filter(mark => !customIds.has(mark.drugId));
        state.favorites = state.favorites.filter(id => !customIds.has(id));
        state.cached = state.cached.filter(id => !customIds.has(id));
        ["customDrugs", "hidden", "notes", "marks", "favorites", "cached"].forEach(saveState);
        selected.clear(); toast("批量操作已完成"); renderAll();
      });
    });
    document.getElementById("restoreHidden")?.addEventListener("click", () => confirmModal(`确认恢复 ${hiddenInCurrentPharmacy().length} 个已隐藏的${pharmacyLabel(state.activePharmacy)}品规？`, () => {
      const activeHidden = new Set(hiddenInCurrentPharmacy());
      state.hidden = state.hidden.filter(id => !activeHidden.has(id)); saveState("hidden"); toast("已恢复当前药库隐藏品规"); renderAll();
    }));
    draw();
  }

  function renderContraindications() {
    let editingId = "";
    const verifiedRules = interactionEngine?.rules || [];
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>已核验高风险规则</h2><small>${verifiedRules.length} 条</small></div>
        <p class="notice danger">优先展示“禁忌”和“严重”组合，规则均附公开说明书来源。规则是重点筛查集，并非完整相互作用数据库。</p>
        <div class="card-list" style="margin-top:12px">${verifiedRules.length ? verifiedRules.map(rule => interactionRuleCard(rule)).join("") : empty("高风险规则尚未加载。")}</div>
      </section>
      <section class="panel section">
        <h2>自定义禁忌组合</h2>
        <p class="notice danger">自定义记录仅用于院内整理，不代表系统已完成临床验证。</p>
        <div class="toolbar" style="margin-top:14px"><input id="contraQuery" placeholder="搜索药品、机制、后果或建议"><select id="contraSeverity"><option value="">全部严重程度</option><option>禁忌</option><option>严重</option><option>需监测</option></select></div>
        <form id="contraForm" style="margin-top:16px">
          <div class="form-grid">
            <div class="field"><label>药品 A *</label><select name="drugA" required><option value="">请选择</option>${drugOptions()}</select></div>
            <div class="field"><label>药品 B *</label><select name="drugB" required><option value="">请选择</option>${drugOptions()}</select></div>
            <div class="field"><label>严重程度</label><select name="severity"><option>禁忌</option><option>严重</option><option>需监测</option></select></div>
            <div class="field"><label>作用机制</label><input name="mechanism" placeholder="例如：药效叠加或代谢抑制"></div>
          </div>
          <div class="field"><label>可能后果 *</label><textarea name="consequence" rows="3" required></textarea></div>
          <div class="field"><label>处理建议 *</label><textarea name="recommendation" rows="3" required></textarea></div>
          <div class="toolbar"><button class="btn primary" id="saveContra">新增记录</button><button class="btn ghost" type="button" id="cancelContraEdit" hidden>取消编辑</button></div>
        </form>
      </section>
      <section class="section"><p id="contraCount" class="muted"></p><div id="contraList" class="card-list"></div></section>`;
    const form = document.getElementById("contraForm");
    const resetForm = () => {
      editingId = ""; form.reset(); document.getElementById("saveContra").textContent = "新增记录"; document.getElementById("cancelContraEdit").hidden = true;
    };
    const draw = () => {
      const q = normalize(document.getElementById("contraQuery").value); const severity = document.getElementById("contraSeverity").value;
      const filtered = state.contraindications.filter(item => {
        const text = `${drugById(item.drugA)?.drugName || ""}${drugById(item.drugB)?.drugName || ""}${item.mechanism || ""}${item.consequence || ""}${item.recommendation || ""}`;
        return (!q || normalize(text).includes(q)) && (!severity || item.severity === severity);
      });
      document.getElementById("contraCount").textContent = `${filtered.length} 条记录`;
      document.getElementById("contraList").innerHTML = filtered.length ? filtered.map(item => `<article class="card"><div class="detail-head"><div><h3>${esc(drugById(item.drugA)?.drugName || "已删除药品")} + ${esc(drugById(item.drugB)?.drugName || "已删除药品")}</h3><span class="badge blocked">${esc(item.severity)}</span></div><div class="card-actions"><button class="btn ghost small" data-edit-contra="${esc(item.id)}">编辑</button><button class="btn ghost small" data-delete-contra="${esc(item.id)}">删除</button></div></div>${item.mechanism ? `<p class="drug-sub"><strong>机制：</strong>${esc(item.mechanism)}</p>` : ""}${item.consequence ? `<p class="drug-sub"><strong>后果：</strong>${esc(item.consequence)}</p>` : ""}<p class="drug-sub"><strong>建议：</strong>${esc(item.recommendation)}</p></article>`).join("") : empty("没有匹配的禁忌记录。");
    };
    form.addEventListener("submit", event => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
      if (data.drugA === data.drugB) return toast("请选择两种不同药品");
      if (editingId) state.contraindications = state.contraindications.map(item => item.id === editingId ? { ...item, ...data, updatedAt: new Date().toISOString() } : item);
      else state.contraindications.push({ id: `contra-${Date.now()}`, ...data, updatedAt: new Date().toISOString() });
      saveState("contraindications"); toast(editingId ? "禁忌记录已更新" : "禁忌记录已添加"); resetForm(); draw();
    });
    document.getElementById("contraList").addEventListener("click", event => {
      const button = event.target.closest("[data-edit-contra]"); if (!button) return;
      const item = state.contraindications.find(record => record.id === button.dataset.editContra); if (!item) return;
      editingId = item.id; ["drugA", "drugB", "severity", "mechanism", "consequence", "recommendation"].forEach(name => { form.elements.namedItem(name).value = item[name] || ""; });
      document.getElementById("saveContra").textContent = "保存修改"; document.getElementById("cancelContraEdit").hidden = false; form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("cancelContraEdit").onclick = resetForm;
    document.getElementById("contraQuery").oninput = draw; document.getElementById("contraSeverity").onchange = draw; draw();
  }

  function renderNotebook() {
    const fieldLabels = { indication: "适应症", dosage: "用法用量", adverseReactions: "不良反应", precautions: "注意事项" };
    const pharmacyId = state.activePharmacy;
    const notes = state.notes.filter(note => recordBelongsToPharmacy(note, pharmacyId));
    const marks = state.marks.filter(mark => recordBelongsToPharmacy(mark, pharmacyId));
    app.dataset.notebookPharmacy = pharmacyId;
    const markCards = marks.map(mark => {
      const drug = drugById(mark.drugId);
      const typeLabels = { underline: "划线", bold: "加粗", highlight: "荧光笔" };
      return `<article class="card"><div class="detail-head"><div><h3>${esc(drug?.drugName || "已删除药品")}</h3><span class="badge info">${esc(fieldLabels[mark.field] || mark.field)} · ${esc(typeLabels[mark.type] || mark.type)}</span></div><button class="btn ghost small" data-delete-mark="${esc(mark.id)}">删除</button></div><p class="mark-quote">${esc(mark.text)}</p></article>`;
    });
    app.innerHTML = `
      <section class="section" data-notebook-section="notes"><div class="section-title"><h2>${esc(pharmacyLabel(pharmacyId))}笔记</h2><button class="btn ghost small" id="exportNotes">导出当前药库</button></div><div class="card-list">${notes.length ? [...notes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(noteCard).join("") : empty(`还没有${pharmacyLabel(pharmacyId)}笔记。请从药品详情页添加。`)}</div></section>
      <section class="section" data-notebook-section="marks"><div class="section-title"><h2>${esc(pharmacyLabel(pharmacyId))}文本标记</h2><small>${marks.length} 条</small></div><div class="marks-list" data-local-marks-signature="${esc(marks.map(mark => `${mark.id}:${mark.type}`).join("|"))}">${markCards.length ? markCards.join("") : empty("还没有划线、加粗或荧光笔标记。")}</div></section>`;
    document.getElementById("exportNotes").onclick = () => downloadJson(`${pharmacyId}-drug-notebook.json`, {
      exportedAt: new Date().toISOString(), pharmacyId, pharmacyLabel: pharmacyLabel(pharmacyId), notes, marks
    });
  }

  function drugOptions() {
    return visibleDrugs().map(d => `<option value="${esc(d.id)}">${esc(d.drugName)}｜${esc(d.specification)}｜${esc(normalizePharmacyScopes(d).map(id => PHARMACIES[id].shortLabel).join("/"))}</option>`).join("");
  }

  function toggleSet(key, id) {
    const exists = state[key].includes(id);
    state[key] = exists ? state[key].filter(x => x !== id) : [...state[key], id];
    saveState(key);
  }

  function toggleFavorite(id) {
    if (isFavorite(id)) {
      state.favorites = state.favorites.filter(x => x !== id);
      delete state.favoriteMap[id];
      toast("已取消收藏");
    } else {
      state.favorites.push(id);
      state.favoriteMap[id] = state.groups[0]?.id || "default";
      toast("已收藏");
    }
    saveState("favorites"); saveState("favoriteMap"); render();
  }

  function openNoteModal(drugId, noteId = "") {
    const drug = drugById(drugId);
    const existing = state.notes.find(note => note.id === noteId);
    const pharmacyId = existing ? recordPharmacyId(existing) : recordPharmacyId({ drugId });
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="noteForm"><h2>${existing ? "编辑笔记" : "添加笔记"}</h2><p class="muted">${esc(drug?.drugName)} · ${esc(pharmacyLabel(pharmacyId))}</p><div class="field"><label>笔记内容</label><textarea name="content" rows="6" required>${esc(existing?.content)}</textarea></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">保存</button></div></form></div>`;
    document.getElementById("noteForm").onsubmit = event => {
      event.preventDefault(); const content = new FormData(event.target).get("content").trim();
      if (existing) state.notes = state.notes.map(note => note.id === noteId ? { ...note, pharmacyId, content, updatedAt: new Date().toISOString() } : note);
      else state.notes.push({ id: `note-${Date.now()}`, drugId, pharmacyId, content, updatedAt: new Date().toISOString() });
      saveState("notes"); closeModal(); toast(existing ? "笔记已更新" : "笔记已保存"); render();
    };
  }

  function openEditDrugModal(drugId) {
    const drug = drugById(drugId);
    if (!drug) return toast("未找到该药品");
    const hasLocalOverride = Boolean(state.drugOverrides[drugId] || state.categoryOverrides[drugId]);
    const storedOverride = state.drugOverrides[drugId] || {};
    const editSource = storedOverride.source || drug.source || {};
    const editQualityIssue = Object.hasOwn(storedOverride, "qualityIssue") ? storedOverride.qualityIssue : drug.qualityIssue;
    const categories = [...new Set([...DRUG_CATEGORY_IDS, ...visibleDrugs().map(item => item.category || "未分类"), ...state.customCategories])];
    const currentDrugPharmacy = normalizePharmacyScopes(drug)[0];
    const pharmacyOptions = Object.entries(PHARMACIES).map(([id, pharmacy]) =>
      `<option value="${esc(id)}" ${id === currentDrugPharmacy ? "selected" : ""}>${esc(pharmacy.label)}</option>`
    ).join("");
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="editDrugForm">
      <h2>编辑药品详情</h2>
      <p class="notice danger">修改只保存在当前浏览器。保存后统一标记为“待复核”，不会覆盖项目内置核验资料；临床使用前仍须核对具体厂家现行说明书。</p>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label>药品名称 *</label><input name="drugName" value="${esc(drug.drugName)}" required></div>
        <div class="field"><label>原始名称</label><input name="rawName" value="${esc(drug.rawName || drug.drugName)}"></div>
        <div class="field"><label>通用名</label><input name="genericName" value="${esc(drug.genericName)}"></div>
        <div class="field"><label>商品名</label><input name="tradeName" value="${esc(drug.tradeName)}"></div>
        <div class="field"><label>所属药库 *</label><select name="pharmacyScope" required>${pharmacyOptions}</select></div>
        <div class="field"><label>规格</label><input name="specification" value="${esc(drug.specification)}"></div>
        <div class="field"><label>剂型</label><input name="dosageForm" value="${esc(drug.dosageForm)}"></div>
        <div class="field"><label>药品属性 *</label><input name="category" list="editCategoryOptions" value="${esc(drug.category || "未分类")}" required><datalist id="editCategoryOptions">${categories.map(category => `<option value="${esc(category)}">`).join("")}</datalist></div>
        <div class="field"><label>药物作用分类</label><input name="therapeuticClass" value="${esc(drug.therapeuticClass)}"></div>
        <div class="field"><label>医保标记</label><input name="insuranceClass" value="${esc(drug.insuranceClass || "未标注")}"></div>
        <div class="field"><label>生产企业</label><input name="manufacturer" value="${esc(drug.manufacturer)}"></div>
        <div class="field"><label>上市许可持有人</label><input name="marketingAuthorizationHolder" value="${esc(drug.marketingAuthorizationHolder)}"></div>
        <div class="field"><label>批准文号</label><input name="approvalNumber" value="${esc(drug.approvalNumber)}"></div>
        <div class="field"><label>主要成分（顿号分隔）</label><input name="components" value="${esc(Array.isArray(drug.components) ? drug.components.join("、") : drug.components || "")}"></div>
      </div>
      <details class="clinical-editor" open>
        <summary>临床说明书摘要</summary>
        <div class="field"><label>适应症 *</label><textarea name="indication" rows="4" required>${esc(drug.clinical?.indication)}</textarea></div>
        <div class="field"><label>用法用量 *</label><textarea name="dosage" rows="4" required>${esc(drug.clinical?.dosage)}</textarea></div>
        <div class="field"><label>不良反应 *</label><textarea name="adverseReactions" rows="4" required>${esc(drug.clinical?.adverseReactions)}</textarea></div>
        <div class="field"><label>注意事项 / 禁忌 *</label><textarea name="precautions" rows="4" required>${esc(drug.clinical?.precautions)}</textarea></div>
      </details>
      <details class="clinical-editor" open>
        <summary>相互作用与禁忌补充</summary>
        <div class="field"><label>该药相互作用补充</label><textarea name="interactionNotes" rows="4" placeholder="例如：与某药合用会增加出血风险">${esc(drug.interactionNotes)}</textarea></div>
        <div class="field"><label>该药禁忌补充</label><textarea name="contraindications" rows="4" placeholder="例如：妊娠期或严重肝功能不全禁用">${esc(drug.contraindications)}</textarea></div>
      </details>
      <details class="clinical-editor">
        <summary>来源与质控信息</summary>
        <div class="field"><label>来源标题</label><input name="sourceLabel" value="${esc(String(editSource.label || "").replace(/（本机编辑，待复核）$/u, ""))}"></div>
        <div class="field"><label>来源网址（HTTPS）</label><input name="sourceUrl" type="url" value="${esc(editSource.url)}"></div>
        <div class="field"><label>核验日期</label><input name="sourceCheckedAt" type="date" value="${esc(editSource.checkedAt)}"></div>
        <div class="field"><label>包装说明</label><textarea name="packagingNote" rows="3">${esc(drug.packagingNote)}</textarea></div>
        <div class="field"><label>质控提示</label><textarea name="qualityIssue" rows="3">${esc(editQualityIssue)}</textarea></div>
      </details>
      <div class="modal-actions">
        ${drug.isCustom ? '<button type="button" class="btn danger" id="deleteEditedDrug">删除药品</button>' : hasLocalOverride ? '<button type="button" class="btn danger" id="restoreDrugFields">恢复原始字段</button>' : ""}
        <button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">保存</button>
      </div>
    </form></div>`;
    document.getElementById("editDrugForm").onsubmit = event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const pharmacyScope = normalizePharmacyId(data.pharmacyScope, currentDrugPharmacy);
      const category = data.category.trim() || "未分类";
      const sourceUrl = data.sourceUrl.trim();
      if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) return toast("来源网址必须使用 HTTPS，或留空");
      const source = {
        status: "needs-review",
        label: `${data.sourceLabel.trim() || "用户本机编辑"}（本机编辑，待复核）`,
        url: sourceUrl,
        checkedAt: data.sourceCheckedAt.trim() || new Date().toISOString().slice(0, 10)
      };
      const clinical = {
        indication: data.indication.trim(),
        dosage: data.dosage.trim(),
        adverseReactions: data.adverseReactions.trim(),
        precautions: data.precautions.trim(),
        source: { ...source }
      };
      if (!clinical.indication || !clinical.dosage || !clinical.adverseReactions || !clinical.precautions) {
        return toast("请完整填写四项临床说明书摘要");
      }
      const fields = {
        drugName: data.drugName.trim(),
        rawName: data.rawName.trim() || data.drugName.trim(),
        genericName: data.genericName.trim(),
        tradeName: data.tradeName.trim(),
        pharmacyScopes: [pharmacyScope],
        specification: data.specification.trim(),
        dosageForm: data.dosageForm.trim(),
        category,
        therapeuticClass: data.therapeuticClass.trim() || normalizeTherapeuticClass("", data.drugName, clinical.indication, category),
        insuranceClass: data.insuranceClass.trim() || "未标注",
        manufacturer: data.manufacturer.trim(),
        marketingAuthorizationHolder: data.marketingAuthorizationHolder.trim(),
        approvalNumber: data.approvalNumber.trim(),
        components: data.components.split(/[、,，;；]/).map(item => item.trim()).filter(Boolean),
        clinical,
        source,
        packagingNote: data.packagingNote.trim(),
        qualityIssue: data.qualityIssue.trim(),
        interactionNotes: data.interactionNotes.trim(),
        contraindications: data.contraindications.trim(),
        localEditedAt: new Date().toISOString()
      };
      if (drug.isCustom) {
        state.customDrugs = state.customDrugs.map(item => item.id === drugId
          ? { ...item, ...fields, isCustom: true, updatedAt: new Date().toISOString() }
          : item);
        saveState("customDrugs");
        state.activePharmacy = pharmacyScope;
        write("activePharmacy", state.activePharmacy);
      } else {
        state.drugOverrides[drugId] = fields;
        state.categoryOverrides[drugId] = category;
        saveState("drugOverrides"); saveState("categoryOverrides");
      }
      const builtInCategories = new Set(builtInCatalogDrugs().map(item => item.category));
      if (!builtInCategories.has(category) && !state.customCategories.includes(category)) {
        state.customCategories.push(category); saveState("customCategories");
      }
      closeModal(); render(); toast("药品详情已在本机更新，待复核");
    };
    document.getElementById("restoreDrugFields")?.addEventListener("click", () => {
      closeModal();
      confirmModal("恢复该药品的全部原始详情和分类？", () => {
        delete state.drugOverrides[drugId]; delete state.categoryOverrides[drugId];
        saveState("drugOverrides"); saveState("categoryOverrides"); render(); toast("已恢复原始药品详情");
      });
    });
    document.getElementById("deleteEditedDrug")?.addEventListener("click", () => {
      closeModal();
      confirmModal("确认删除这个自定义药品及其关联笔记、标记？", () => {
        removeCustomDrug(drugId); navigate("all"); toast("自定义药品已删除");
      });
    });
  }

  function removeCustomDrug(id) {
    state.customDrugs = state.customDrugs.filter(drug => drug.id !== id);
    state.notes = state.notes.filter(note => note.drugId !== id);
    state.marks = state.marks.filter(mark => mark.drugId !== id);
    state.favorites = state.favorites.filter(item => item !== id);
    state.cached = state.cached.filter(item => item !== id);
    delete state.favoriteMap[id]; delete state.categoryOverrides[id]; delete state.drugOverrides[id];
    ["customDrugs", "notes", "marks", "favorites", "cached", "favoriteMap", "categoryOverrides", "drugOverrides"].forEach(saveState);
  }

  function openGroupModal() {
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="groupForm"><h2>新建收藏分组</h2><div class="field"><label>分组名称</label><input name="name" required maxlength="30"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">创建</button></div></form></div>`;
    document.getElementById("groupForm").onsubmit = event => {
      event.preventDefault(); const name = new FormData(event.target).get("name").trim();
      if (state.groups.some(group => group.name === name)) return toast("分组名称已存在");
      state.groups.push({ id: `group-${Date.now()}`, name }); saveState("groups"); closeModal(); renderFavorites(); toast("分组已创建");
    };
  }

  function openRenameGroupModal(groupId) {
    const group = state.groups.find(item => item.id === groupId);
    if (!group) return;
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="renameGroupForm"><h2>重命名收藏分组</h2><div class="field"><label>分组名称</label><input name="name" value="${esc(group.name)}" required maxlength="30"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">保存</button></div></form></div>`;
    document.getElementById("renameGroupForm").onsubmit = event => {
      event.preventDefault(); const name = new FormData(event.target).get("name").trim();
      if (state.groups.some(item => item.id !== groupId && item.name === name)) return toast("分组名称已存在");
      group.name = name; saveState("groups"); closeModal(); renderFavorites(); toast("分组已重命名");
    };
  }

  function deleteFavoriteGroup(groupId) {
    if (groupId === "default") return toast("默认分组不能删除");
    const group = state.groups.find(item => item.id === groupId);
    if (!group) return;
    confirmModal(`删除“${group.name}”？其中药品将移入默认分组。`, () => {
      const fallback = state.groups.find(item => item.id === "default")?.id || state.groups.find(item => item.id !== groupId)?.id || "default";
      Object.keys(state.favoriteMap).forEach(drugId => { if (state.favoriteMap[drugId] === groupId) state.favoriteMap[drugId] = fallback; });
      state.groups = state.groups.filter(item => item.id !== groupId);
      saveState("groups"); saveState("favoriteMap"); renderFavorites(); toast("分组已删除，药品已移入默认分组");
    });
  }

  function openMoveFavoriteModal(drugId) {
    const drug = drugById(drugId);
    if (!drug) return;
    const current = state.favoriteMap[drugId] || state.groups[0]?.id;
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="moveFavoriteForm"><h2>移动收藏药品</h2><p class="muted">${esc(drug.drugName)}</p><div class="field"><label>目标分组</label><select name="groupId">${state.groups.map(group => `<option value="${esc(group.id)}" ${group.id === current ? "selected" : ""}>${esc(group.name)}</option>`).join("")}</select></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">移动</button></div></form></div>`;
    document.getElementById("moveFavoriteForm").onsubmit = event => {
      event.preventDefault(); state.favoriteMap[drugId] = new FormData(event.target).get("groupId");
      saveState("favoriteMap"); closeModal(); renderFavorites(); toast("药品已移动分组");
    };
  }

  function openCustomCategoryModal(existingName = "") {
    const editing = Boolean(existingName);
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="categoryForm"><h2>${editing ? "编辑自定义分类" : "新增自定义分类"}</h2><div class="field"><label>分类名称</label><input name="name" value="${esc(existingName)}" required maxlength="30"></div><div class="modal-actions">${editing ? '<button type="button" class="btn danger" id="deleteCategoryBtn">删除分类</button>' : ""}<button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">${editing ? "保存重命名" : "创建"}</button></div></form></div>`;
    document.getElementById("categoryForm").onsubmit = event => {
      event.preventDefault(); const name = new FormData(event.target).get("name").trim();
      if (!name) return;
      if (state.customCategories.some(item => item !== existingName && item === name)) return toast("分类名称已存在");
      if (editing) {
        state.customCategories = state.customCategories.map(item => item === existingName ? name : item);
        Object.keys(state.categoryOverrides).forEach(id => { if (state.categoryOverrides[id] === existingName) state.categoryOverrides[id] = name; });
        state.customDrugs = state.customDrugs.map(drug => drug.category === existingName ? { ...drug, category: name } : drug);
        toast("分类已重命名");
      } else {
        state.customCategories.push(name); toast("自定义分类已创建");
      }
      saveState("customCategories"); saveState("categoryOverrides"); saveState("customDrugs"); closeModal(); renderCategories();
    };
    document.getElementById("deleteCategoryBtn")?.addEventListener("click", () => {
      closeModal();
      confirmModal(`删除“${existingName}”？该分类下药品将移到“自定义”。`, () => {
        state.customCategories = state.customCategories.filter(item => item !== existingName);
        Object.keys(state.categoryOverrides).forEach(id => { if (state.categoryOverrides[id] === existingName) delete state.categoryOverrides[id]; });
        state.customDrugs = state.customDrugs.map(drug => drug.category === existingName ? { ...drug, category: "自定义" } : drug);
        saveState("customCategories"); saveState("categoryOverrides"); saveState("customDrugs"); renderCategories(); toast("自定义分类已删除");
      });
    });
  }

  function confirmModal(message, onConfirm) {
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><h2>请确认</h2><p>${esc(message)}</p><div class="modal-actions"><button class="btn ghost" data-close-modal>取消</button><button class="btn danger" id="confirmAction">确认</button></div></div></div>`;
    document.getElementById("confirmAction").onclick = () => { closeModal(); onConfirm(); };
  }

  function closeModal() { modalRoot.innerHTML = ""; }

  function createFullBackup() {
    return {
      appId: "primary-medication-assistant", schemaVersion: 1, exportedAt: new Date().toISOString(),
      data: Object.fromEntries(BACKUP_KEYS.map(key => [key, state[key]]))
    };
  }

  function validateFullBackup(payload) {
    if (!payload || payload.appId !== "primary-medication-assistant" || payload.schemaVersion !== 1 || !payload.data) throw new Error("不是本应用的完整备份文件");
    const restored = {};
    BACKUP_ARRAY_KEYS.forEach(key => {
      if (!Array.isArray(payload.data[key])) throw new Error(`字段 ${key} 格式错误`);
      restored[key] = payload.data[key];
    });
    BACKUP_OBJECT_KEYS.forEach(key => {
      const value = payload.data[key];
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`字段 ${key} 格式错误`);
      restored[key] = value;
    });
    return restored;
  }

  function updateInstallControls() {
    const button = document.getElementById("installApp"); const status = document.getElementById("installStatus"); const help = document.getElementById("installHelp");
    if (!button || !status || !help) return;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (standalone) { status.textContent = "已安装"; status.className = "badge ok"; button.hidden = true; help.textContent = "应用已在独立窗口运行；可检查更新或备份全部本机数据。"; }
    else if (deferredInstallPrompt) { status.textContent = "可安装"; status.className = "badge ok"; button.hidden = false; help.textContent = "点击“安装到桌面”即可作为应用使用；用户数据仍保存在当前浏览器。"; }
    else { status.textContent = "浏览器模式"; status.className = "badge info"; button.hidden = true; help.textContent = "如未显示安装按钮，请使用浏览器菜单中的“添加到主屏幕”；也可在此备份全部本机数据。"; }
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    toast("已生成导出文件");
  }

  function render() {
    const { route, param } = currentRoute();
    updateChrome(route);
    updatePharmacyChrome();
    if (route !== "notebook") delete app.dataset.notebookPharmacy;
    const handlers = {
      home: renderHome,
      categories: renderCategories,
      search: renderSearch,
      detail: () => renderDetail(param),
      favorites: renderFavorites,
      add: renderAdd,
      interactions: renderInteractions,
      symptoms: renderSymptoms,
      flashcards: renderFlashcards,
      cache: renderCache,
      all: renderAll,
      contraindications: renderContraindications,
      notebook: renderNotebook
    };
    (handlers[route] || renderHome)();
    window.scrollTo({ top: 0, behavior: "instant" });
    window.dispatchEvent(new CustomEvent("primary-medication-rendered", { detail: { route, param } }));
  }

  document.addEventListener("click", event => {
    const routeLink = event.target.closest("[data-route-link], .bottom-nav [data-route]");
    if (routeLink) return navigate(routeLink.dataset.routeLink || routeLink.dataset.route);
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) { event.stopPropagation(); return toggleFavorite(favorite.dataset.favorite); }
    const cache = event.target.closest("[data-cache]");
    if (cache) { toggleSet("cached", cache.dataset.cache); toast(isCached(cache.dataset.cache) ? "已加入缓存" : "已移出缓存"); return render(); }
    const swipedContent = event.target.closest(".swipe-row.swiped .swipe-content");
    if (swipedContent) { event.preventDefault(); swipedContent.closest(".swipe-row").classList.remove("swiped"); return; }
    const drug = event.target.closest("[data-open-drug]");
    if (drug) return openDrugDetail(drug.dataset.openDrug);
    const actionClass = event.target.closest("[data-action-class]");
    if (actionClass) return openCategoryDrugList(actionClass.dataset.actionClass, "", "");
    const attribute = event.target.closest("[data-attribute]");
    if (attribute) return openCategoryDrugList("", "", attribute.dataset.attribute);
    const form = event.target.closest("[data-form]");
    if (form) return openCategoryDrugList("", form.dataset.form, "");
    const note = event.target.closest("[data-delete-note]");
    if (note) confirmModal("确认删除这条笔记？", () => { state.notes = state.notes.filter(n => n.id !== note.dataset.deleteNote); saveState("notes"); render(); toast("笔记已删除"); });
    const editNote = event.target.closest("[data-edit-note]");
    if (editNote) { event.stopPropagation(); openNoteModal(editNote.dataset.noteDrug, editNote.dataset.editNote); }
    const contra = event.target.closest("[data-delete-contra]");
    if (contra) confirmModal("确认删除这条自定义禁忌记录？", () => { state.contraindications = state.contraindications.filter(c => c.id !== contra.dataset.deleteContra); saveState("contraindications"); render(); toast("记录已删除"); });
    const mark = event.target.closest("[data-delete-mark]");
    if (mark) confirmModal("确认删除这条文本标记？", () => { state.marks = state.marks.filter(m => m.id !== mark.dataset.deleteMark); saveState("marks"); render(); toast("标记已删除"); });
    const custom = event.target.closest("[data-delete-custom]");
    if (custom) confirmModal("确认删除这个自定义药品及其关联笔记、标记？", () => {
      const id = custom.dataset.deleteCustom;
      removeCustomDrug(id);
      render(); toast("自定义药品已删除");
    });
    if (event.target.closest("[data-close-modal]")) closeModal();
  });

  let pharmacySwitchPromise = null;
  pharmacySwitcher?.addEventListener("click", async event => {
    const button = event.target.closest("[data-pharmacy-switch]");
    if (!button) return;
    const pharmacyId = normalizePharmacyId(button.dataset.pharmacySwitch);
    if (pharmacyId === state.activePharmacy) return;

    let outpatientCount = 0;
    if (pharmacyId === "outpatient") {
      if (pharmacySwitchPromise) return;
      setPharmacySwitchLoading(button, true);
      toast("正在加载门诊药库…");
      pharmacySwitchPromise = ensureOutpatientCatalogLoaded();
      try {
        outpatientCount = (await pharmacySwitchPromise).length;
      } catch (error) {
        console.error("门诊药库加载失败", error);
        toast("门诊药库加载失败，请稍后重试");
        return;
      } finally {
        pharmacySwitchPromise = null;
        setPharmacySwitchLoading(button, false);
      }
    }

    state.activePharmacy = pharmacyId;
    write("activePharmacy", state.activePharmacy);
    closeModal();
    toast(pharmacyId === "outpatient"
      ? `已切换到门诊药库（${outpatientCount} 个品规）`
      : `已切换到${pharmacyLabel(pharmacyId)}`);
    if (currentRoute().route === "home") render();
    else navigate("home");
  });

  let swipeStart = null;
  document.addEventListener("pointerdown", event => {
    const row = event.target.closest("[data-swipe-row]");
    if (!row || event.target.closest("button, input, select, textarea, label")) return;
    swipeStart = { row, x: event.clientX, y: event.clientY };
  });
  document.addEventListener("pointerup", event => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) {
      document.querySelectorAll(".swipe-row.swiped").forEach(row => { if (row !== swipeStart.row) row.classList.remove("swiped"); });
      swipeStart.row.classList.toggle("swiped", dx < 0);
    }
    swipeStart = null;
  });

  backBtn.addEventListener("click", () => history.back());
  homeBtn.addEventListener("click", () => navigate("home"));
  window.addEventListener("hashchange", render);
  const updateNetwork = () => { offlineBanner.hidden = navigator.onLine; };
  window.addEventListener("online", updateNetwork);
  window.addEventListener("offline", updateNetwork);
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; updateInstallControls(); });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; updateInstallControls(); toast("应用已安装到桌面"); });
  window.addEventListener("outpatient-clinical-hydrated", () => {
    invalidateCatalogCaches();
    if (state.activePharmacy !== "outpatient") return;
    const route = currentRoute().route;
    if (["home", "detail"].includes(route) && !document.activeElement?.matches("input, textarea, select")) render();
  });
  updateNetwork();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const registerServiceWorker = () => navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      if ("requestIdleCallback" in window) window.requestIdleCallback(registerServiceWorker, { timeout: 3000 });
      else window.setTimeout(registerServiceWorker, 1000);
    });
  }
  if (!location.hash) navigate("home", "", true);
  if (state.activePharmacy === "outpatient") {
    updateChrome(currentRoute().route);
    updatePharmacyChrome();
    app.innerHTML = '<section class="panel section"><p class="muted">正在加载门诊药库…</p></section>';
    ensureOutpatientCatalogLoaded()
      .then(() => render())
      .catch(error => {
        console.error("启动时门诊药库加载失败", error);
        state.activePharmacy = "ward";
        write("activePharmacy", state.activePharmacy);
        toast("门诊药库暂时无法加载，已显示病房药库");
        render();
      });
  } else {
    render();
  }
  hydrateVerifiedCatalog()
    .then(() => {
      const route = currentRoute().route;
      const outpatientStillLoading = state.activePharmacy === "outpatient" && !Array.isArray(window.OUTPATIENT_DRUG_CATALOG);
      if (!outpatientStillLoading && ["home", "detail"].includes(route) && !document.activeElement?.matches("input, textarea, select")) render();
    })
    .catch(error => console.error("中文核验库加载失败", error));
})();

(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const app = document.getElementById("app");
  const pageTitle = document.getElementById("pageTitle");
  const backBtn = document.getElementById("backBtn");
  const homeBtn = document.getElementById("homeBtn");
  const toastEl = document.getElementById("toast");
  const offlineBanner = document.getElementById("offlineBanner");
  const modalRoot = document.getElementById("modalRoot");

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));

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
    history: []
  };

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

  const normalize = value => String(value ?? "").toLowerCase().replace(/[\s()（）·:：,，/\-]/g, "");
  const catalogDrugs = () => [...window.DRUG_CATALOG, ...state.customDrugs];
  const applyLocalOverrides = drug => {
    const override = state.drugOverrides[drug.id];
    const category = state.categoryOverrides[drug.id];
    if (!override && !category) return drug;
    const merged = { ...drug, ...(override || {}), ...(category ? { category } : {}) };
    if (override && !drug.isCustom) {
      merged.qualityIssue = [drug.qualityIssue, "本机目录字段已编辑，须按药盒、批准文号和现行说明书复核。"].filter(Boolean).join(" ");
      merged.localEdited = true;
    }
    return merged;
  };
  const allDrugs = () => catalogDrugs()
    .filter(drug => !state.hidden.includes(drug.id))
    .map(applyLocalOverrides);
  const drugById = id => {
    const drug = catalogDrugs().find(item => item.id === id);
    return drug ? applyLocalOverrides(drug) : drug;
  };
  const isFavorite = id => state.favorites.includes(id);
  const isCached = id => state.cached.includes(id);
  const isRemembered = id => state.remembered.includes(id);
  const saveState = key => write(key, state[key]);

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function statusBadge(drug) {
    const status = drug.source?.status;
    if (status === "verified-template") return '<span class="badge ok">✓ 范本已核验</span>';
    if (status === "blocked") return '<span class="badge blocked">⛔ 数据锁定</span>';
    if (status === "needs-review") return '<span class="badge warn">△ 待复核</span>';
    if (drug.isCustom) return '<span class="badge info">自定义</span>';
    return '<span class="badge info">仅目录</span>';
  }

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
            <span>${esc(drug.category || "未分类")}</span>
          </div>
          <p class="drug-sub">通用名：${esc(drug.genericName || "待核验")}</p>
          ${drug.qualityIssue ? `<p class="drug-sub"><span class="badge blocked">质控问题</span> ${esc(drug.qualityIssue)}</p>` : ""}
          ${statusBadge(drug)} ${drug.safetyNotice ? '<span class="badge blocked">官方安全警示</span>' : ""}
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
    const hash = `#/${route}${param ? `/${encodeURIComponent(param)}` : ""}`;
    if (replace) history.replaceState(null, "", hash);
    else location.hash = hash;
  }

  function currentRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return { route: parts[0] || "home", param: decodeURIComponent(parts.slice(1).join("/")) };
  }

  function updateChrome(route) {
    pageTitle.textContent = routes[route] || routes.home;
    backBtn.hidden = route === "home";
    document.querySelectorAll(".bottom-nav button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.route === route);
    });
  }

  function renderHome() {
    const drugs = allDrugs();
    const verified = drugs.filter(d => d.source?.status === "verified-template").length;
    const needsReview = drugs.filter(d => ["needs-review", "blocked"].includes(d.source?.status)).length;
    const recent = drugs.slice(0, 5);
    app.innerHTML = `
      <section class="hero section">
        <h2>快速查药，先看数据状态</h2>
        <p>院内目录与说明书内容分层保存。没有来源的临床字段不会自动展示。</p>
        <label class="search-box">
          <span>⌕</span>
          <input id="homeSearch" placeholder="药品名、通用名、规格" autocomplete="off">
        </label>
        <div class="stat-grid">
          <div class="stat"><strong>${drugs.length}</strong><span>内置/自定义</span></div>
          <div class="stat"><strong>${verified}</strong><span>范本已核验</span></div>
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
        <div class="section-title"><h2>目录预览</h2><button class="btn ghost small" data-route-link="all">查看全部</button></div>
        <div class="card-list">${recent.map(drugCard).join("")}</div>
      </section>`;
    document.getElementById("homeSearch").addEventListener("change", event => {
      sessionStorage.setItem("drug-search-query", event.target.value.trim());
      navigate("search");
    });
  }

  function renderCategories() {
    const counts = allDrugs().reduce((map, drug) => {
      const key = drug.category || "未分类";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const forms = allDrugs().reduce((map, drug) => {
      const key = drug.dosageForm || "剂型待核验";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const customCards = state.customCategories.map(name => {
      const count = allDrugs().filter(drug => drug.category === name).length;
      return `<button class="category-card custom-category-card" data-custom-category="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规 · 长按编辑</span></button>`;
    });
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>按药品类别</h2><small>${Object.keys(counts).length} 类</small></div>
        <div class="category-grid">${Object.entries(counts).map(([name, count]) => `<button class="category-card" data-category="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
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
        navigate("all"); setTimeout(() => renderAll(card.dataset.customCategory, ""));
      });
    });
  }

  function renderSearch(initial = "") {
    const initialQuery = initial || sessionStorage.getItem("drug-search-query") || "";
    sessionStorage.removeItem("drug-search-query");
    app.innerHTML = `
      <section class="section">
        <div class="toolbar"><input id="searchInput" value="${esc(initialQuery)}" placeholder="输入药品名、通用名、规格或厂家"><select id="statusFilter"><option value="">全部数据状态</option><option value="verified-template">范本已核验</option><option value="needs-review">待复核</option><option value="blocked">数据锁定</option><option value="inventory-only">仅目录</option></select></div>
        <p id="resultCount" class="muted"></p>
        <div id="searchResults" class="card-list"></div>
      </section>`;
    const input = document.getElementById("searchInput");
    const filter = document.getElementById("statusFilter");
    const draw = () => {
      const q = normalize(input.value);
      const status = filter.value;
      const results = allDrugs().filter(drug => {
        const haystack = normalize([drug.drugName, drug.rawName, drug.genericName, drug.tradeName, drug.specification, drug.manufacturer].join(" "));
        return (!q || haystack.includes(q)) && (!status || drug.source?.status === status);
      });
      document.getElementById("resultCount").textContent = `找到 ${results.length} 个品规`;
      document.getElementById("searchResults").innerHTML = results.length ? results.map(drugCard).join("") : empty("没有匹配结果，请检查名称或添加自定义药品。", '<button class="btn primary" data-route-link="add">添加药品</button>');
    };
    input.addEventListener("input", draw);
    filter.addEventListener("change", draw);
    draw();
  }

  function renderDetail(id) {
    const drug = drugById(id);
    if (!drug) {
      app.innerHTML = empty("未找到该药品，可能已被删除。", '<button class="btn primary" data-route-link="all">返回全部药物</button>');
      return;
    }
    const clinical = drug.clinical;
    const notes = state.notes.filter(note => note.drugId === id);
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
          <div><h2>${esc(drug.drugName)}</h2><p class="muted">${esc(drug.rawName)}</p>${statusBadge(drug)}</div>
          <button class="star-btn ${isFavorite(id) ? "active" : ""}" data-favorite="${esc(id)}">★</button>
        </div>
        ${drug.qualityIssue ? `<div class="notice danger" style="margin-top:14px"><strong>质控锁定：</strong>${esc(drug.qualityIssue)}</div>` : ""}
        ${drug.safetyNotice ? `<div class="notice danger" style="margin-top:14px"><strong>官方安全警示：</strong>${esc(drug.safetyNotice.summary)}<br><a href="${esc(drug.safetyNotice.url)}" target="_blank" rel="noopener">查看国家药监局公告</a> · 发布：${esc(drug.safetyNotice.publishedAt)}</div>` : ""}
        <dl class="detail-grid">
          <div class="detail-item"><dt>通用名</dt><dd>${esc(drug.genericName || "待核验")}</dd></div>
          <div class="detail-item"><dt>商品名</dt><dd>${esc(drug.tradeName || "未录入")}</dd></div>
          <div class="detail-item"><dt>规格</dt><dd>${esc(drug.specification || "待核验")}</dd></div>
          <div class="detail-item"><dt>剂型</dt><dd>${esc(drug.dosageForm || "待核验")}</dd></div>
          <div class="detail-item"><dt>类别 / 医保标记</dt><dd>${esc(drug.category || "未分类")} · ${esc(drug.insuranceClass || "未标注")}</dd></div>
          <div class="detail-item"><dt>生产企业</dt><dd>${esc(drug.manufacturer || "待核验")}</dd></div>
          ${markedField("indication", "适应症")}
          ${markedField("dosage", "用法用量")}
          ${markedField("adverseReactions", "不良反应")}
          ${markedField("precautions", "注意事项")}
        </dl>
        ${clinical ? `<p class="muted" style="margin-bottom:8px">长按或拖选说明书摘要文字，然后选择标记样式。</p><div id="markToolbar" class="mark-toolbar" hidden><small id="selectedTextPreview"></small><button class="btn secondary small" data-mark-type="underline">划线</button><button class="btn secondary small" data-mark-type="bold">加粗</button><button class="btn secondary small" data-mark-type="highlight">荧光笔</button></div>` : ""}
        <div class="source-box">
          <strong>来源：</strong>${esc(drug.source?.label || "未记录")}<br>
          ${drug.source?.url ? `<a href="${esc(drug.source.url)}" target="_blank" rel="noopener">打开国家药监局来源</a><br>` : ""}
          核验日期：${esc(drug.source?.checkedAt || "未核验")}。品种说明书范本不能替代具体厂家、批准文号对应的现行说明书。
        </div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn ${isCached(id) ? "ghost" : "secondary"}" data-cache="${esc(id)}">${isCached(id) ? "移出缓存" : "缓存此药"}</button>
          ${drug.isCustom ? '<button class="btn secondary" id="editCustomDrugBtn">编辑药品</button>' : ""}
          <button class="btn primary" id="addNoteBtn">添加笔记</button>
        </div>
      </section>
      <section class="section">
        <div class="section-title"><h2>关联笔记</h2><small>${notes.length} 条</small></div>
        <div class="card-list">${notes.length ? notes.map(note => noteCard(note)).join("") : empty("暂无笔记")}</div>
      </section>`;
    document.getElementById("addNoteBtn").addEventListener("click", () => openNoteModal(id));
    document.getElementById("editCustomDrugBtn")?.addEventListener("click", () => openEditDrugModal(id));
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
        state.marks.push({ id: `mark-${Date.now()}`, drugId, ...selectionData, type: button.dataset.markType, createdAt: new Date().toISOString() });
        saveState("marks");
        toast("文本标记已保存");
      }
      window.getSelection()?.removeAllRanges();
      renderDetail(drugId);
    }));
  }

  function noteCard(note) {
    const drug = drugById(note.drugId);
    return `<article class="card"><div class="detail-head"><div><h3>${esc(drug?.drugName || "已删除药品")}</h3><small class="muted">${new Date(note.updatedAt).toLocaleString("zh-CN")}</small></div><button class="btn ghost small" data-delete-note="${esc(note.id)}">删除</button></div><p class="drug-sub">${esc(note.content)}</p></article>`;
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
    app.innerHTML = `
      <section class="panel section">
        <h2>手动添加自定义药品</h2>
        <p class="notice">自定义条目默认标记为“未核验”，不会自动生成适应症、剂量或相互作用结论。</p>
        <form id="drugForm" style="margin-top:16px">
          <div class="form-grid">
            <div class="field"><label>药品名称 *</label><input name="drugName" required></div>
            <div class="field"><label>通用名</label><input name="genericName"></div>
            <div class="field"><label>规格</label><input name="specification"></div>
            <div class="field"><label>剂型</label><input name="dosageForm"></div>
            <div class="field"><label>类别</label><input name="category" list="categoryOptions"><datalist id="categoryOptions"><option value="西药"><option value="中成药">${state.customCategories.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
            <div class="field"><label>生产企业</label><input name="manufacturer"></div>
          </div>
          <button class="btn primary" type="submit">保存自定义药品</button>
        </form>
      </section>
      <section class="panel section">
        <h3>智能识别填充</h3>
        <p class="muted">需要接入 OCR 与说明书来源核验服务。当前版本不从图片猜测临床字段。</p>
        <button class="btn ghost" type="button" disabled>OCR 尚未配置</button>
      </section>`;
    document.getElementById("drugForm").addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const now = new Date().toISOString();
      const drug = {
        id: `custom-${Date.now()}`,
        rawName: data.drugName.trim(),
        drugName: data.drugName.trim(),
        genericName: data.genericName.trim(),
        tradeName: "",
        specification: data.specification.trim(),
        dosageForm: data.dosageForm.trim(),
        category: data.category.trim() || "自定义",
        manufacturer: data.manufacturer.trim(),
        insuranceClass: "未标注",
        clinical: null,
        qualityIssue: "自定义药品尚未核验说明书与批准文号。",
        source: { status: "needs-review", label: "用户手动录入", url: "", checkedAt: now.slice(0, 10) },
        isCustom: true
      };
      state.customDrugs.push(drug);
      saveState("customDrugs");
      toast("自定义药品已保存");
      navigate("detail", drug.id);
    });
  }

  function renderInteractions() {
    const options = allDrugs().map(drug => `<option value="${esc(drug.id)}">${esc(drug.drugName)}｜${esc(drug.specification)}</option>`).join("");
    app.innerHTML = `
      <section class="panel section">
        <h2>两药联用查询</h2>
        <p class="notice danger"><strong>安全限制：</strong>权威相互作用 API 尚未配置。当前只能匹配你手动维护的禁忌组合，未匹配不代表可以联用。</p>
        <div class="field" style="margin-top:16px"><label>药品 A</label><select id="drugA"><option value="">请选择</option>${options}</select></div>
        <div class="field"><label>药品 B</label><select id="drugB"><option value="">请选择</option>${options}</select></div>
        <button class="btn primary" id="checkInteraction">查询已录入禁忌</button>
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
      const match = state.contraindications.find(item => [item.drugA, item.drugB].includes(a) && [item.drugA, item.drugB].includes(b));
      result.innerHTML = match
        ? `<div class="notice danger"><strong>${esc(match.severity)}：</strong>${esc(match.consequence || match.recommendation || "存在自定义禁忌记录")}</div>`
        : '<div class="notice">本地自定义禁忌中未匹配到记录。由于权威 API 未配置，不能据此判断可联用，请查具体说明书/指南或咨询药师。</div>';
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
    const candidates = allDrugs().filter(d => d.clinical && d.source?.status !== "blocked");
    if (!candidates.length) {
      app.innerHTML = empty("暂无已核验临床字段可用于闪卡。完成说明书核验后会自动加入。", '<button class="btn primary" data-route-link="all">查看目录</button>');
      return;
    }
    let index = 0;
    let flipped = false;
    const draw = () => {
      const drug = candidates[index];
      app.innerHTML = `
        <section class="section"><div class="section-title"><h2>说明书闪卡</h2><small>${index + 1} / ${candidates.length}</small></div><div class="progress"><span style="width:${((index + 1) / candidates.length) * 100}%"></span></div></section>
        <button class="panel section" id="flashcard" style="width:100%;min-height:300px;text-align:left">
          ${flipped ? `<span class="badge ok">背面</span><h2>${esc(drug.drugName)}</h2><div class="detail-item"><dt>适应症</dt><dd>${esc(drug.clinical.indication)}</dd></div><div class="detail-item" style="margin-top:10px"><dt>用法用量</dt><dd>${esc(drug.clinical.dosage)}</dd></div>` : `<span class="badge info">正面</span><h2>${esc(drug.drugName)}</h2><p class="muted">${esc(drug.genericName)} · ${esc(drug.specification)}</p><p style="margin-top:80px;text-align:center">点击翻转查看说明书摘要</p>`}
        </button>
        <div class="toolbar"><button class="btn ghost" id="prevCard">上一张</button><button class="btn ${isRemembered(drug.id) ? "secondary" : "primary"}" id="rememberCard">${isRemembered(drug.id) ? "取消已记住" : "标记已记住"}</button><button class="btn ghost" id="nextCard">下一张</button></div>`;
      document.getElementById("flashcard").onclick = () => { flipped = !flipped; draw(); };
      document.getElementById("prevCard").onclick = () => { index = (index - 1 + candidates.length) % candidates.length; flipped = false; draw(); };
      document.getElementById("nextCard").onclick = () => { index = (index + 1) % candidates.length; flipped = false; draw(); };
      document.getElementById("rememberCard").onclick = () => { toggleSet("remembered", drug.id); draw(); };
    };
    draw();
  }

  function renderCache() {
    let batchMode = false;
    const selected = new Set();
    const categories = [...new Set(allDrugs().map(drug => drug.category || "未分类"))];
    const getCached = () => state.cached.map(drugById).filter(Boolean);
    const cacheCard = drug => `<div class="cache-entry">${drugCard(drug, { selectable: batchMode, selected: selected.has(drug.id) })}${batchMode ? "" : `<div class="favorite-tools"><span>${drug.localEdited ? "本机已编辑 · 待复核" : "缓存目录字段"}</span><button class="btn ghost small" data-edit-cache="${esc(drug.id)}">编辑缓存字段</button></div>`}</div>`;
    app.innerHTML = `
      <section class="panel section">
        <div class="section-title"><h2>离线缓存</h2><span class="badge info" id="cacheCount">${getCached().length} 个品规</span></div>
        <p class="muted">本静态站点的目录代码会随页面加载；这里记录的是你主动选择的常用药清单，便于离线优先展示。</p>
        <div class="toolbar"><button class="btn secondary" id="cacheVerified">预加载已核验条目</button><button class="btn secondary" id="cacheBatchMode">批量操作</button><button class="btn ghost" id="detectDuplicates">检测重复</button><button class="btn ghost" id="exportCache">导出 JSON</button><button class="btn danger" id="clearCache">清空缓存</button></div>
      </section>
      <section class="panel section" id="cacheBatchBar" hidden>
        <div class="section-title"><strong id="cacheSelectedCount">已选 0 项</strong><button class="btn ghost small" id="cacheSelectAll">全选</button></div>
        <div class="toolbar"><input id="cacheBatchCategory" list="cacheCategoryOptions" placeholder="输入新分类"><datalist id="cacheCategoryOptions">${categories.map(category => `<option value="${esc(category)}">`).join("")}</datalist><button class="btn secondary" id="applyCacheCategory">批量修改分类</button><button class="btn danger" id="removeSelectedCache">批量移出缓存</button></div>
      </section>
      <section id="duplicateResults" class="section" hidden></section>
      <section class="section"><div id="cacheList" class="card-list"></div></section>`;
    const draw = () => {
      const cached = getCached();
      document.getElementById("cacheCount").textContent = `${cached.length} 个品规`;
      document.getElementById("cacheSelectedCount").textContent = `已选 ${selected.size} 项`;
      document.getElementById("cacheList").innerHTML = cached.length ? cached.map(cacheCard).join("") : empty("尚未缓存药品。");
    };
    document.getElementById("cacheVerified").onclick = () => {
      state.cached = [...new Set([...state.cached, ...allDrugs().filter(d => d.source?.status === "verified-template").map(d => d.id)])];
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
    document.getElementById("exportCache").onclick = () => downloadJson("drug-cache.json", { exportedAt: new Date().toISOString(), drugs: getCached() });
    document.getElementById("clearCache").onclick = () => confirmModal("确认清空缓存清单？", () => { state.cached = []; saveState("cached"); renderCache(); toast("缓存已清空"); });
    draw();
  }

  function renderAll(filterCategory = "", filterForm = "") {
    const categories = [...new Set(allDrugs().map(d => d.category || "未分类"))];
    const forms = [...new Set(allDrugs().map(d => d.dosageForm || "剂型待核验"))];
    let batchMode = false;
    let currentResults = [];
    const selected = new Set();
    app.innerHTML = `
      <section class="section">
        <div class="toolbar"><input id="allQuery" placeholder="筛选药品"><select id="allCategory"><option value="">全部类别</option>${categories.map(c => `<option ${c === filterCategory ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><select id="allForm"><option value="">全部剂型</option>${forms.map(f => `<option ${f === filterForm ? "selected" : ""}>${esc(f)}</option>`).join("")}</select><button class="btn secondary" id="batchModeBtn">批量操作</button></div>
        <div id="batchBar" class="panel section" hidden>
          <div class="section-title"><strong id="selectedCount">已选 0 项</strong><button class="btn ghost small" id="selectAllBtn">全选当前结果</button></div>
          <div class="toolbar"><input id="batchCategory" list="batchCategoryOptions" placeholder="输入新分类"><datalist id="batchCategoryOptions">${categories.map(c => `<option value="${esc(c)}">`).join("")}</datalist><button class="btn secondary" id="applyBatchCategory">批量修改分类</button><button class="btn danger" id="deleteBatch">批量删除/隐藏</button>${state.hidden.length ? `<button class="btn ghost" id="restoreHidden">恢复已隐藏（${state.hidden.length}）</button>` : ""}</div>
          <p class="muted">内置药品执行“删除”时仅在本机隐藏，可恢复；自定义药品会删除并需要二次确认。</p>
        </div>
        <p id="allCount" class="muted"></p><div id="allList" class="card-list"></div>
      </section>`;
    const draw = () => {
      const q = normalize(document.getElementById("allQuery").value);
      const category = document.getElementById("allCategory").value;
      const form = document.getElementById("allForm").value;
      currentResults = allDrugs().filter(d => (!q || normalize(`${d.drugName}${d.genericName}${d.specification}`).includes(q)) && (!category || d.category === category) && (!form || d.dosageForm === form));
      document.getElementById("allCount").textContent = `${currentResults.length} 个品规${batchMode ? " · 批量模式" : ""}`;
      document.getElementById("allList").innerHTML = currentResults.length ? currentResults.map(drug => drugCard(drug, { selectable: batchMode, selected: selected.has(drug.id) })).join("") : empty("没有匹配的药品。");
      document.getElementById("selectedCount").textContent = `已选 ${selected.size} 项`;
    };
    ["allQuery", "allCategory", "allForm"].forEach(id => document.getElementById(id).addEventListener(id === "allQuery" ? "input" : "change", draw));
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
    document.getElementById("restoreHidden")?.addEventListener("click", () => confirmModal(`确认恢复 ${state.hidden.length} 个已隐藏的内置品规？`, () => {
      state.hidden = []; saveState("hidden"); toast("已恢复隐藏品规"); renderAll();
    }));
    draw();
  }

  function renderContraindications() {
    app.innerHTML = `
      <section class="panel section">
        <h2>自定义禁忌组合</h2>
        <p class="notice danger">自定义记录仅用于院内整理，不代表系统已完成临床验证。</p>
        <form id="contraForm" style="margin-top:16px">
          <div class="form-grid">
            <div class="field"><label>药品 A *</label><select name="drugA" required><option value="">请选择</option>${drugOptions()}</select></div>
            <div class="field"><label>药品 B *</label><select name="drugB" required><option value="">请选择</option>${drugOptions()}</select></div>
            <div class="field"><label>严重程度</label><select name="severity"><option>禁忌</option><option>严重</option><option>需监测</option></select></div>
            <div class="field"><label>建议/后果 *</label><input name="recommendation" required></div>
          </div>
          <button class="btn primary">新增记录</button>
        </form>
      </section>
      <section class="section"><div class="card-list">${state.contraindications.length ? state.contraindications.map(item => `<article class="card"><div class="detail-head"><div><h3>${esc(drugById(item.drugA)?.drugName)} + ${esc(drugById(item.drugB)?.drugName)}</h3><span class="badge blocked">${esc(item.severity)}</span></div><button class="btn ghost small" data-delete-contra="${esc(item.id)}">删除</button></div><p class="drug-sub">${esc(item.recommendation)}</p></article>`).join("") : empty("暂无自定义禁忌记录。")}</div></section>`;
    document.getElementById("contraForm").addEventListener("submit", event => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
      if (data.drugA === data.drugB) return toast("请选择两种不同药品");
      state.contraindications.push({ id: `contra-${Date.now()}`, ...data });
      saveState("contraindications"); toast("禁忌记录已添加"); renderContraindications();
    });
  }

  function renderNotebook() {
    const fieldLabels = { indication: "适应症", dosage: "用法用量", adverseReactions: "不良反应", precautions: "注意事项" };
    const markCards = state.marks.map(mark => {
      const drug = drugById(mark.drugId);
      const typeLabels = { underline: "划线", bold: "加粗", highlight: "荧光笔" };
      return `<article class="card"><div class="detail-head"><div><h3>${esc(drug?.drugName || "已删除药品")}</h3><span class="badge info">${esc(fieldLabels[mark.field] || mark.field)} · ${esc(typeLabels[mark.type] || mark.type)}</span></div><button class="btn ghost small" data-delete-mark="${esc(mark.id)}">删除</button></div><p class="mark-quote">${esc(mark.text)}</p></article>`;
    });
    app.innerHTML = `
      <section class="section"><div class="section-title"><h2>全部药品笔记</h2><button class="btn ghost small" id="exportNotes">导出笔记本</button></div><div class="card-list">${state.notes.length ? [...state.notes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(noteCard).join("") : empty("还没有笔记。请从药品详情页添加。")}</div></section>
      <section class="section"><div class="section-title"><h2>文本标记</h2><small>${state.marks.length} 条</small></div><div class="marks-list">${markCards.length ? markCards.join("") : empty("还没有划线、加粗或荧光笔标记。")}</div></section>`;
    document.getElementById("exportNotes").onclick = () => downloadJson("drug-notebook.json", { exportedAt: new Date().toISOString(), notes: state.notes, marks: state.marks });
  }

  function drugOptions() {
    return allDrugs().map(d => `<option value="${esc(d.id)}">${esc(d.drugName)}｜${esc(d.specification)}</option>`).join("");
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

  function openNoteModal(drugId) {
    const drug = drugById(drugId);
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="noteForm"><h2>添加笔记</h2><p class="muted">${esc(drug?.drugName)}</p><div class="field"><label>笔记内容</label><textarea name="content" rows="6" required></textarea></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">保存</button></div></form></div>`;
    document.getElementById("noteForm").onsubmit = event => {
      event.preventDefault(); const content = new FormData(event.target).get("content").trim();
      state.notes.push({ id: `note-${Date.now()}`, drugId, content, updatedAt: new Date().toISOString() });
      saveState("notes"); closeModal(); toast("笔记已保存"); renderDetail(drugId);
    };
  }

  function openEditDrugModal(drugId) {
    const drug = drugById(drugId);
    if (!drug) return toast("未找到该药品");
    const hasLocalOverride = Boolean(state.drugOverrides[drugId] || state.categoryOverrides[drugId]);
    const categories = [...new Set([...allDrugs().map(item => item.category || "未分类"), ...state.customCategories])];
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="editDrugForm">
      <h2>${drug.isCustom ? "编辑自定义药品" : "编辑本机缓存字段"}</h2>
      <p class="notice ${drug.isCustom ? "" : "danger"}">${drug.isCustom ? "保存后仍保持“未核验”状态。" : "这里只修改当前浏览器中的目录字段，不会改写内置数据或说明书临床字段；保存后会显示待复核提示。"}</p>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label>药品名称 *</label><input name="drugName" value="${esc(drug.drugName)}" required></div>
        <div class="field"><label>通用名</label><input name="genericName" value="${esc(drug.genericName)}"></div>
        <div class="field"><label>规格</label><input name="specification" value="${esc(drug.specification)}"></div>
        <div class="field"><label>剂型</label><input name="dosageForm" value="${esc(drug.dosageForm)}"></div>
        <div class="field"><label>类别</label><input name="category" list="editCategoryOptions" value="${esc(drug.category || "未分类")}"><datalist id="editCategoryOptions">${categories.map(category => `<option value="${esc(category)}">`).join("")}</datalist></div>
        <div class="field"><label>生产企业</label><input name="manufacturer" value="${esc(drug.manufacturer)}"></div>
      </div>
      <div class="modal-actions">
        ${drug.isCustom ? '<button type="button" class="btn danger" id="deleteEditedDrug">删除药品</button>' : hasLocalOverride ? '<button type="button" class="btn danger" id="restoreDrugFields">恢复原始字段</button>' : ""}
        <button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">保存</button>
      </div>
    </form></div>`;
    document.getElementById("editDrugForm").onsubmit = event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const fields = {
        drugName: data.drugName.trim(),
        genericName: data.genericName.trim(),
        specification: data.specification.trim(),
        dosageForm: data.dosageForm.trim(),
        manufacturer: data.manufacturer.trim()
      };
      const category = data.category.trim() || "未分类";
      if (drug.isCustom) {
        state.customDrugs = state.customDrugs.map(item => item.id === drugId
          ? { ...item, ...fields, rawName: fields.drugName, category, source: { ...item.source, checkedAt: new Date().toISOString().slice(0, 10) } }
          : item);
        saveState("customDrugs");
      } else {
        state.drugOverrides[drugId] = { ...fields, localEditedAt: new Date().toISOString() };
        state.categoryOverrides[drugId] = category;
        saveState("drugOverrides"); saveState("categoryOverrides");
      }
      const builtInCategories = new Set(window.DRUG_CATALOG.map(item => item.category));
      if (!builtInCategories.has(category) && !state.customCategories.includes(category)) {
        state.customCategories.push(category); saveState("customCategories");
      }
      closeModal(); render(); toast(drug.isCustom ? "自定义药品已更新" : "本机缓存字段已更新，待复核");
    };
    document.getElementById("restoreDrugFields")?.addEventListener("click", () => {
      closeModal();
      confirmModal("恢复该药品的原始目录字段和分类？", () => {
        delete state.drugOverrides[drugId]; delete state.categoryOverrides[drugId];
        saveState("drugOverrides"); saveState("categoryOverrides"); render(); toast("已恢复原始目录字段");
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

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    toast("已生成导出文件");
  }

  function render() {
    const { route, param } = currentRoute();
    updateChrome(route);
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
    if (drug) return navigate("detail", drug.dataset.openDrug);
    const category = event.target.closest("[data-category]");
    if (category) { navigate("all"); setTimeout(() => renderAll(category.dataset.category, "")); }
    const form = event.target.closest("[data-form]");
    if (form) { navigate("all"); setTimeout(() => renderAll("", form.dataset.form)); }
    const note = event.target.closest("[data-delete-note]");
    if (note) confirmModal("确认删除这条笔记？", () => { state.notes = state.notes.filter(n => n.id !== note.dataset.deleteNote); saveState("notes"); render(); toast("笔记已删除"); });
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
  updateNetwork();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
  if (!location.hash) navigate("home", "", true);
  render();
})();

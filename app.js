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
    remembered: read("remembered", []),
    cached: read("cached", []),
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
  const allDrugs = () => [...window.DRUG_CATALOG, ...state.customDrugs];
  const drugById = id => allDrugs().find(drug => drug.id === id);
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

  function drugCard(drug) {
    return `
      <article class="card drug-row" data-open-drug="${esc(drug.id)}" tabindex="0">
        <div>
          <h3>${esc(drug.drugName)}</h3>
          <div class="drug-meta">
            <span>${esc(drug.specification || "规格待核验")}</span>
            <span>${esc(drug.dosageForm || "剂型待核验")}</span>
            <span>${esc(drug.category || "未分类")}</span>
          </div>
          <p class="drug-sub">通用名：${esc(drug.genericName || "待核验")}</p>
          ${drug.qualityIssue ? `<p class="drug-sub"><span class="badge blocked">质控问题</span> ${esc(drug.qualityIssue)}</p>` : ""}
          ${statusBadge(drug)}
        </div>
        <button class="star-btn ${isFavorite(drug.id) ? "active" : ""}" type="button" data-favorite="${esc(drug.id)}" aria-label="${isFavorite(drug.id) ? "取消收藏" : "收藏"}">★</button>
      </article>`;
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
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>按药品类别</h2><small>${Object.keys(counts).length} 类</small></div>
        <div class="category-grid">${Object.entries(counts).map(([name, count]) => `<button class="category-card" data-category="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
      </section>
      <section class="section">
        <div class="section-title"><h2>按剂型浏览</h2><small>${Object.keys(forms).length} 种</small></div>
        <div class="category-grid">${Object.entries(forms).sort((a,b) => b[1]-a[1]).map(([name, count]) => `<button class="category-card" data-form="${esc(name)}"><strong>${esc(name)}</strong><span>${count} 个品规</span></button>`).join("")}</div>
      </section>`;
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
    app.innerHTML = `
      <section class="panel section">
        <div class="detail-head">
          <div><h2>${esc(drug.drugName)}</h2><p class="muted">${esc(drug.rawName)}</p>${statusBadge(drug)}</div>
          <button class="star-btn ${isFavorite(id) ? "active" : ""}" data-favorite="${esc(id)}">★</button>
        </div>
        ${drug.qualityIssue ? `<div class="notice danger" style="margin-top:14px"><strong>质控锁定：</strong>${esc(drug.qualityIssue)}</div>` : ""}
        <dl class="detail-grid">
          <div class="detail-item"><dt>通用名</dt><dd>${esc(drug.genericName || "待核验")}</dd></div>
          <div class="detail-item"><dt>商品名</dt><dd>${esc(drug.tradeName || "未录入")}</dd></div>
          <div class="detail-item"><dt>规格</dt><dd>${esc(drug.specification || "待核验")}</dd></div>
          <div class="detail-item"><dt>剂型</dt><dd>${esc(drug.dosageForm || "待核验")}</dd></div>
          <div class="detail-item"><dt>类别 / 医保标记</dt><dd>${esc(drug.category || "未分类")} · ${esc(drug.insuranceClass || "未标注")}</dd></div>
          <div class="detail-item"><dt>生产企业</dt><dd>${esc(drug.manufacturer || "待核验")}</dd></div>
          <div class="detail-item"><dt>适应症</dt><dd>${esc(clinical?.indication || "待逐条核验具体厂家现行说明书")}</dd></div>
          <div class="detail-item"><dt>用法用量</dt><dd>${esc(clinical?.dosage || "待逐条核验具体厂家现行说明书")}</dd></div>
          <div class="detail-item"><dt>不良反应</dt><dd>${esc(clinical?.adverseReactions || "待逐条核验具体厂家现行说明书")}</dd></div>
          <div class="detail-item"><dt>注意事项</dt><dd>${esc(clinical?.precautions || "待逐条核验具体厂家现行说明书")}</dd></div>
        </dl>
        <div class="source-box">
          <strong>来源：</strong>${esc(drug.source?.label || "未记录")}<br>
          ${drug.source?.url ? `<a href="${esc(drug.source.url)}" target="_blank" rel="noopener">打开国家药监局来源</a><br>` : ""}
          核验日期：${esc(drug.source?.checkedAt || "未核验")}。品种说明书范本不能替代具体厂家、批准文号对应的现行说明书。
        </div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn ${isCached(id) ? "ghost" : "secondary"}" data-cache="${esc(id)}">${isCached(id) ? "移出缓存" : "缓存此药"}</button>
          <button class="btn primary" id="addNoteBtn">添加笔记</button>
        </div>
      </section>
      <section class="section">
        <div class="section-title"><h2>关联笔记</h2><small>${notes.length} 条</small></div>
        <div class="card-list">${notes.length ? notes.map(note => noteCard(note)).join("") : empty("暂无笔记")}</div>
      </section>`;
    document.getElementById("addNoteBtn").addEventListener("click", () => openNoteModal(id));
  }

  function noteCard(note) {
    const drug = drugById(note.drugId);
    return `<article class="card"><div class="detail-head"><div><h3>${esc(drug?.drugName || "已删除药品")}</h3><small class="muted">${new Date(note.updatedAt).toLocaleString("zh-CN")}</small></div><button class="btn ghost small" data-delete-note="${esc(note.id)}">删除</button></div><p class="drug-sub">${esc(note.content)}</p></article>`;
  }

  function renderFavorites() {
    const drugs = state.favorites.map(drugById).filter(Boolean);
    app.innerHTML = `
      <section class="section">
        <div class="section-title"><h2>收藏药品</h2><button class="btn secondary small" id="newGroupBtn">新建分组</button></div>
        <div class="toolbar"><select id="favoriteGroup"><option value="">全部分组</option>${state.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></div>
        <div id="favoriteList" class="card-list">${drugs.length ? drugs.map(drugCard).join("") : empty("还没有收藏药品。")}</div>
      </section>`;
    document.getElementById("favoriteGroup").addEventListener("change", event => {
      const group = event.target.value;
      const filtered = group ? drugs.filter(drug => state.favoriteMap[drug.id] === group) : drugs;
      document.getElementById("favoriteList").innerHTML = filtered.length ? filtered.map(drugCard).join("") : empty("该分组暂无药品。");
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
    const cached = state.cached.map(drugById).filter(Boolean);
    app.innerHTML = `
      <section class="panel section">
        <div class="section-title"><h2>离线缓存</h2><span class="badge info">${cached.length} 个品规</span></div>
        <p class="muted">本静态站点的目录代码会随页面加载；这里记录的是你主动选择的常用药清单，便于离线优先展示。</p>
        <div class="toolbar"><button class="btn secondary" id="cacheVerified">缓存已核验条目</button><button class="btn ghost" id="exportCache">导出 JSON</button><button class="btn danger" id="clearCache">清空缓存</button></div>
      </section>
      <section class="section"><div class="card-list">${cached.length ? cached.map(drugCard).join("") : empty("尚未缓存药品。")}</div></section>`;
    document.getElementById("cacheVerified").onclick = () => {
      state.cached = [...new Set([...state.cached, ...allDrugs().filter(d => d.source?.status === "verified-template").map(d => d.id)])];
      saveState("cached"); toast("已缓存核验条目"); renderCache();
    };
    document.getElementById("exportCache").onclick = () => downloadJson("drug-cache.json", cached);
    document.getElementById("clearCache").onclick = () => confirmModal("确认清空缓存清单？", () => { state.cached = []; saveState("cached"); renderCache(); toast("缓存已清空"); });
  }

  function renderAll(filterCategory = "", filterForm = "") {
    const categories = [...new Set(allDrugs().map(d => d.category || "未分类"))];
    const forms = [...new Set(allDrugs().map(d => d.dosageForm || "剂型待核验"))];
    app.innerHTML = `
      <section class="section">
        <div class="toolbar"><input id="allQuery" placeholder="筛选药品"><select id="allCategory"><option value="">全部类别</option>${categories.map(c => `<option ${c === filterCategory ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><select id="allForm"><option value="">全部剂型</option>${forms.map(f => `<option ${f === filterForm ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
        <p id="allCount" class="muted"></p><div id="allList" class="card-list"></div>
      </section>`;
    const draw = () => {
      const q = normalize(document.getElementById("allQuery").value);
      const category = document.getElementById("allCategory").value;
      const form = document.getElementById("allForm").value;
      const results = allDrugs().filter(d => (!q || normalize(`${d.drugName}${d.genericName}${d.specification}`).includes(q)) && (!category || d.category === category) && (!form || d.dosageForm === form));
      document.getElementById("allCount").textContent = `${results.length} 个品规`;
      document.getElementById("allList").innerHTML = results.length ? results.map(drugCard).join("") : empty("没有匹配的药品。");
    };
    ["allQuery", "allCategory", "allForm"].forEach(id => document.getElementById(id).addEventListener(id === "allQuery" ? "input" : "change", draw));
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
    app.innerHTML = `
      <section class="section"><div class="section-title"><h2>全部药品笔记</h2><button class="btn ghost small" id="exportNotes">导出</button></div><div class="card-list">${state.notes.length ? state.notes.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(noteCard).join("") : empty("还没有笔记。请从药品详情页添加。")}</div></section>`;
    document.getElementById("exportNotes").onclick = () => downloadJson("drug-notes.json", state.notes);
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

  function openGroupModal() {
    modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="groupForm"><h2>新建收藏分组</h2><div class="field"><label>分组名称</label><input name="name" required maxlength="30"></div><div class="modal-actions"><button type="button" class="btn ghost" data-close-modal>取消</button><button class="btn primary">创建</button></div></form></div>`;
    document.getElementById("groupForm").onsubmit = event => {
      event.preventDefault(); const name = new FormData(event.target).get("name").trim();
      state.groups.push({ id: `group-${Date.now()}`, name }); saveState("groups"); closeModal(); renderFavorites(); toast("分组已创建");
    };
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
    if (event.target.closest("[data-close-modal]")) closeModal();
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

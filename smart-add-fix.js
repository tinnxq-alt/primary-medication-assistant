(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const lookup = window.DRUG_LOOKUP || {};
  const normalize = lookup.normalize || (value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, ""));
  const directMatch = lookup.directlyMatchesDrug || (() => false);
  let aliasPromise = null;
  let candidateMap = new Map();
  let requestId = 0;
  let lastWarmAt = 0;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const hasChinese = value => /[\u3400-\u9fff]/.test(String(value || ""));
  const chineseCount = value => (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(`${PREFIX}${key}`));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  function safeCategory(drugName = "") {
    const text = String(drugName || "").normalize("NFKC");
    if (!text) return "其他";
    if (/阿司匹林|氯吡格雷|替格瑞洛|普拉格雷|华法林|利伐沙班|阿哌沙班|依度沙班|达比加群|肝素|依诺肝素/.test(text)) return "抗凝抗血小板";
    if (/胰岛素|二甲双胍|阿卡波糖|伏格列波糖|米格列醇|格列|列净|列汀|格鲁肽|艾塞那肽|利司那肽|替尔泊肽|吡格列酮|罗格列酮|瑞格列奈|那格列奈/.test(text)) return "降糖药";
    if (/他汀|依折麦布|非诺贝特|苯扎贝特|依洛尤单抗|阿利西尤单抗/.test(text)) return "调脂药";
    if (/沙坦|普利|地平|美托洛尔|比索洛尔|卡维地洛|拉贝洛尔|阿罗洛尔|氢氯噻嗪|吲达帕胺|多沙唑嗪|特拉唑嗪/.test(text)) return "降压药";
    if (/头孢|西林|霉素|沙星|硝唑|奥司他韦|玛巴洛沙韦|阿昔洛韦|伐昔洛韦|更昔洛韦|替诺福韦|恩替卡韦/.test(text)) return "抗感染药";
    if (/孟鲁司特|氨溴索|溴己新|乙酰半胱氨酸|羧甲司坦|沙丁胺醇|布地奈德|噻托溴铵|福莫特罗|沙美特罗|氨茶碱|茶碱|氨酚|伪麻/.test(text)) return "呼吸系统";
    if (/拉唑|莫沙必利|多潘立酮|乳果糖|蒙脱石|洛哌丁胺|铝碳酸镁|熊去氧胆酸|小檗碱/.test(text)) return "消化系统";
    if (/唑仑|唑吡坦|佐匹克隆|氯硝西泮|丙戊酸|普瑞巴林|加巴喷丁|左乙拉西坦|氟桂利嗪/.test(text)) return "神经精神";
    if (/布洛芬|双氯芬|洛索洛芬|吲哚美辛|萘普生|塞来昔布|依托考昔|对乙酰氨基酚|曲马多/.test(text)) return "镇痛抗炎";
    if (/坦索罗辛|非那雄胺|度他雄胺|非布司他|苯溴马隆|呋塞米|螺内酯/.test(text)) return "泌尿系统";
    if (/左甲状腺素|甲巯咪唑|丙硫氧嘧啶|地塞米松|泼尼松|甲泼尼龙|骨化醇/.test(text)) return "内分泌";
    if (/维生素|叶酸|碳酸钙|氯化钾|葡萄糖酸钙|硫酸亚铁/.test(text)) return "维生素矿物质";
    if (/硝酸甘油|单硝酸异山梨酯|硝酸异山梨酯|曲美他嗪|胺碘酮|地高辛/.test(text)) return "心血管";
    if (/乳膏|软膏|凝胶|贴膏|搽剂/.test(text)) return "皮肤外用";
    if (/复方丹参|速效救心|麝香保心|稳心颗粒|血塞通|银杏叶|通心络/.test(text)) return "中成药";
    return "其他";
  }

  function endpoint() {
    try {
      return String(read("smartSearchEndpoint", DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
    } catch {
      return DEFAULT_ENDPOINT;
    }
  }

  function allKnownDrugs() {
    return [
      ...(window.DRUG_CATALOG || []),
      ...(window.OUTPATIENT_DRUG_CATALOG || []),
      ...(Array.isArray(read("customDrugs", [])) ? read("customDrugs", []) : [])
    ];
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

  function exactDuplicate(query, aliases = []) {
    const q = normalize(query);
    if (!q) return null;
    const drugs = allKnownDrugs();
    const direct = drugs.find(drug => [drug.drugName, drug.genericName, drug.tradeName, drug.rawName]
      .some(value => value && normalize(value) === q));
    if (direct) return { drug: direct, matchedBy: "同名" };
    const alias = aliases.find(item => item?.tradeName && normalize(item.tradeName) === q);
    if (!alias) return null;
    const target = drugs.find(drug => {
      const names = [drug.drugName, drug.genericName].filter(Boolean).map(normalize);
      return names.includes(normalize(alias.drugName)) || names.includes(normalize(alias.genericName));
    });
    return target ? { drug: target, matchedBy: `商品名“${alias.tradeName}”` } : null;
  }

  function similarKnownDrug(query) {
    return allKnownDrugs().find(drug => directMatch(query, drug)) || null;
  }

  function pharmacyText(drug) {
    const scopes = Array.isArray(drug?.pharmacyScopes) ? drug.pharmacyScopes : [];
    if (scopes.includes("ward") && scopes.includes("outpatient")) return "病房/门诊药库";
    if (scopes.includes("outpatient")) return "门诊药库";
    return "病房药库";
  }

  async function warmWorker() {
    const now = Date.now();
    if (now - lastWarmAt < 60_000) return;
    lastWarmAt = now;
    const base = endpoint();
    if (!base) return;
    try {
      await fetch(`${base}/health`, { method: "GET", cache: "no-store", mode: "cors" });
    } catch {
      // 预热失败不影响正式识别。
    }
  }

  async function remoteCandidates(query) {
    const base = endpoint();
    if (!base) throw new Error("智能识别服务未配置");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${base}/v1/drugs/search`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, newDrugOnly: true, candidateCount: 3 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `智能识别服务返回 ${response.status}`);
      const candidates = (Array.isArray(payload.candidates) ? payload.candidates : []).map(item => ({
        drugName: String(item.drugName || "").trim(),
        tradeName: String(item.tradeName || "").trim(),
        category: safeCategory(item.drugName),
        source: {
          status: "unverified-draft",
          label: item.sourceTitle || "Cloudflare Workers AI · 药名候选（未核验）",
          checkedAt: item.sourceCheckedAt || new Date().toISOString().slice(0, 10)
        }
      })).filter(item => hasChinese(item.drugName)).slice(0, 3);
      return { candidates, warnings: Array.isArray(payload.warnings) ? payload.warnings : [], elapsedMs: Number(payload.elapsedMs) || 0 };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("候选识别超过 12 秒，请重试");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function currentForm() {
    const node = document.getElementById("drugForm");
    return node && document.getElementById("lookupDrugBtn") ? node : null;
  }

  function setField(node, name, value) {
    const field = node.elements.namedItem(name);
    if (field) field.value = value ?? "";
  }

  function fillSafe(candidate, node = currentForm()) {
    if (!candidate || !node) return;
    setField(node, "drugName", candidate.drugName);
    setField(node, "tradeName", "");
    setField(node, "specification", "");
    setField(node, "category", safeCategory(candidate.drugName));
    ["indication", "dosage", "adverseReactions", "precautions"].forEach(name => setField(node, name, ""));
    setField(node, "sourceLabel", candidate.source?.label || "Cloudflare Workers AI · 药名候选（未核验）");
    setField(node, "sourceUrl", "");
    setField(node, "sourceCheckedAt", candidate.source?.checkedAt || "");
    setField(node, "sourceStatus", "unverified-draft");
    const source = document.getElementById("selectedSource");
    if (source) source.textContent = `来源：${candidate.source?.label || "Cloudflare Workers AI · 药名候选（未核验）"}；仅用于候选药名识别。`;
    toast(`已选择：${candidate.drugName}`);
  }

  function renderCandidates(candidates) {
    const results = document.getElementById("lookupResults");
    if (!results) return;
    candidateMap = new Map();
    const stamp = Date.now();
    candidates.forEach((candidate, index) => {
      candidate.lookupId = `safe-drug-${stamp}-${index}`;
      candidateMap.set(candidate.lookupId, candidate);
    });
    results.innerHTML = candidates.length ? candidates.map((candidate, index) => {
      const category = safeCategory(candidate.drugName);
      const categoryText = category === "其他" ? "分类待人工选择" : `本地规则：${category}`;
      return `<article class="card lookup-card" data-candidate-card="${esc(candidate.lookupId)}"><div><p class="drug-sub">候选 ${index + 1}</p><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(candidate.tradeName || "商品名未确定")} · ${esc(categoryText)}</p><p class="drug-sub"><span class="badge warn">AI 仅识别药名</span> 来源：${esc(candidate.source?.label || "Cloudflare Workers AI")}</p><div class="toolbar"><button class="btn primary small" type="button" data-new-drug-use="${esc(candidate.lookupId)}">选择这个药名</button></div></div></article>`;
    }).join("") : '<div class="empty"><p>没有足够可靠的候选。请补充几个字后重试，或直接手动录入。</p></div>';
  }

  function clearResults() {
    const results = document.getElementById("lookupResults");
    const links = document.getElementById("lookupLinks");
    if (results) results.innerHTML = "";
    if (links) links.innerHTML = "";
    candidateMap.clear();
  }

  function enhanceAddCopy() {
    if (!location.hash.startsWith("#/add")) return;
    const panel = document.querySelector("#drugForm")?.closest(".panel");
    if (!panel) return;
    const heading = [...panel.querySelectorAll("h3")].find(node => node.textContent.includes("智能识别"));
    if (heading) heading.textContent = "1. 新药智能识别（安全候选）";
    const notice = heading?.nextElementSibling;
    if (notice?.classList.contains("notice")) {
      notice.textContent = "输入 2 个及以上汉字片段生成 1–3 个候选。AI 只用于识别候选药名，不再自动生成规格、适应症、用法、不良反应或注意事项；明确分类由本地规则判定，避免错误资料自动进入药库。";
    }
    const input = document.getElementById("drugNameInput");
    if (input) input.placeholder = "输入药名片段，如“司美”“孟鲁”“阿奇”";
  }

  async function run() {
    const node = currentForm();
    if (!node) return;
    const query = String(node.elements.namedItem("drugName")?.value || "").trim();
    if (!query) return toast("请先输入药名片段");
    if (!hasChinese(query)) return toast("请输入中文药品名称");
    if (chineseCount(query) < 2) return toast("再输入 1 个汉字，2 个字即可识别");

    const id = ++requestId;
    const button = document.getElementById("lookupDrugBtn");
    const status = document.getElementById("lookupStatus");
    if (button) { button.disabled = true; button.textContent = "识别候选中…"; }
    clearResults();
    if (status) status.textContent = "正在本机检查重复…";

    try {
      const aliases = await loadAliases();
      if (id !== requestId) return;
      const duplicate = exactDuplicate(query, aliases);
      if (duplicate) {
        if (status) status.textContent = `${duplicate.matchedBy}已匹配到${pharmacyText(duplicate.drug)}中的“${duplicate.drug.drugName}”，无需重复添加。`;
        toast("该药已收录，不再重复添加");
        return;
      }

      const similar = similarKnownDrug(query);
      if (status) status.textContent = similar
        ? `发现相似条目“${similar.drugName}”，继续识别可能的新药候选…`
        : "正在生成可靠药名候选…";

      const result = await remoteCandidates(query);
      if (id !== requestId) return;
      renderCandidates(result.candidates);
      if (result.candidates.length) {
        const timing = result.elapsedMs ? `（${(result.elapsedMs / 1000).toFixed(1)} 秒）` : "";
        if (status) status.textContent = `找到 ${result.candidates.length} 个药名候选${timing}。请选择正确药名；不会再自动生成临床资料。`;
      } else if (status) {
        status.textContent = "没有足够可靠的候选，请补充药名片段后重试。";
      }
    } catch (error) {
      if (id !== requestId) return;
      renderCandidates([]);
      if (status) status.textContent = `智能识别暂不可用：${error.message || "网络异常"}。可以直接手动填写。`;
      toast("智能识别暂不可用，可手动录入");
    } finally {
      if (id === requestId && button) { button.disabled = false; button.textContent = "智能识别"; }
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("#lookupDrugBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      run();
      return;
    }
    const use = event.target.closest?.("[data-new-drug-use]");
    if (use) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const candidate = candidateMap.get(use.dataset.newDrugUse);
      if (!candidate) return;
      fillSafe(candidate);
      document.querySelectorAll("[data-candidate-card]").forEach(card => card.removeAttribute("data-selected"));
      use.closest("[data-candidate-card]")?.setAttribute("data-selected", "true");
      const status = document.getElementById("lookupStatus");
      const category = safeCategory(candidate.drugName);
      if (status) status.textContent = category === "其他"
        ? `已选择“${candidate.drugName}”。药名已填入；分类及其他资料请人工填写。`
        : `已选择“${candidate.drugName}”。药名和本地规则分类“${category}”已填入；其他资料请人工填写。`;
      use.textContent = "已选择";
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.target?.id !== "drugNameInput" || event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run();
  }, true);

  function prepareAddPage() {
    if (!location.hash.startsWith("#/add")) return;
    loadAliases();
    warmWorker();
    requestAnimationFrame(() => {
      enhanceAddCopy();
      const savedQuery = sessionStorage.getItem("drug-add-query");
      const input = document.getElementById("drugNameInput");
      if (savedQuery && input && !input.value) {
        input.value = savedQuery;
        sessionStorage.removeItem("drug-add-query");
      }
    });
    setTimeout(enhanceAddCopy, 50);
  }

  window.addEventListener("hashchange", prepareAddPage);
  prepareAddPage();
})();

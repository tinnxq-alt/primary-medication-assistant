(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const CATEGORY_IDS = ["心血管","降压药","降糖药","调脂药","抗凝抗血小板","抗感染药","呼吸系统","消化系统","神经精神","镇痛抗炎","泌尿系统","内分泌","皮肤外用","维生素矿物质","中成药","其他"];
  const lookup = window.DRUG_LOOKUP || {};
  const normalize = lookup.normalize || (value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, ""));
  const directMatch = lookup.directlyMatchesDrug || (() => false);
  let aliasPromise = null;
  let candidateMap = new Map();
  let requestId = 0;
  let detailRequestId = 0;
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

  function normalizeCategory(category, drugName = "") {
    const value = String(category || "").trim();
    if (CATEGORY_IDS.includes(value)) return value;
    const text = `${drugName}${value}`;
    if (/中成|丸|口服液|合剂/.test(text) && !/注射液/.test(text)) return "中成药";
    if (/阿司匹林|氯吡格雷|利伐沙班|抗凝|抗血小板/.test(text)) return "抗凝抗血小板";
    if (/胰岛素|二甲双胍|阿卡波糖|格列|列净|列汀|降糖/.test(text)) return "降糖药";
    if (/他汀|依折麦布|降脂/.test(text)) return "调脂药";
    if (/沙坦|普利|地平|美托洛尔|比索洛尔|多沙唑嗪|降压/.test(text)) return "降压药";
    if (/乳膏|软膏|凝胶|贴膏|外用|滴眼液/.test(text)) return "皮肤外用";
    if (/头孢|霉素|沙星|奥司他韦|玛巴洛沙韦|抗感染|抗菌|抗病毒/.test(text)) return "抗感染药";
    if (/氨酚|伪麻|止咳|祛痰|羧甲司坦|溴己新|乙酰半胱氨酸|宣肺/.test(text)) return "呼吸系统";
    if (/奥美拉唑|兰索拉唑|凯普拉生|莫沙必利|乳果糖|铝碳酸镁|开塞露|麻仁|洛哌丁胺|小檗碱/.test(text)) return "消化系统";
    if (/布洛芬|双氯芬|洛索洛芬|吲哚美辛|萘普生|镇痛|止痛/.test(text)) return "镇痛抗炎";
    if (/唑仑|唑吡坦|佐匹克隆|氯硝西泮|丙戊酸|普瑞巴林|氟桂利嗪|神经|精神/.test(text)) return "神经精神";
    if (/坦索罗辛|非那雄胺|非布司他|苯溴马隆|呋塞米|螺内酯|泌尿/.test(text)) return "泌尿系统";
    if (/左甲状腺素|地塞米松|骨化醇|内分泌/.test(text)) return "内分泌";
    if (/维生素|叶酸|碳酸钙|氯化钾|矿物质/.test(text)) return "维生素矿物质";
    if (/硝酸|救心|心通|心速宁|曲美他嗪|心血管/.test(text)) return "心血管";
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

  async function postJson(path, body, timeoutMs, timeoutMessage) {
    const base = endpoint();
    if (!base) throw new Error("智能识别服务未配置");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `智能识别服务返回 ${response.status}`);
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new Error(timeoutMessage);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function remoteNewDrugCandidates(query) {
    const payload = await postJson("/v1/drugs/search", { query, newDrugOnly: true, candidateCount: 3 }, 15_000, "候选识别超过 15 秒，请重试");
    const candidates = (Array.isArray(payload.candidates) ? payload.candidates : []).map(item => ({
      drugName: item.drugName || "",
      tradeName: item.tradeName || "",
      specification: item.specification || "",
      category: normalizeCategory(item.category, item.drugName),
      clinical: null,
      originalQuery: query,
      source: {
        status: "unverified-draft",
        label: item.sourceTitle || "Cloudflare Workers AI（AI 生成）",
        url: "",
        checkedAt: item.sourceCheckedAt || new Date().toISOString().slice(0, 10)
      },
      smartMeta: { draft: true, verified: false }
    })).filter(item => hasChinese(item.drugName)).slice(0, 5);
    return {
      candidates,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      mode: payload.mode || "",
      elapsedMs: Number(payload.elapsedMs) || 0
    };
  }

  async function remoteCandidateDetail(candidate) {
    const payload = await postJson("/v1/drugs/detail", {
      query: candidate.originalQuery || candidate.drugName,
      candidate: {
        drugName: candidate.drugName,
        tradeName: candidate.tradeName,
        category: candidate.category,
        specification: candidate.specification
      }
    }, 18_000, "资料生成超过 18 秒，请重试");
    const detail = payload.candidate || {};
    return {
      ...candidate,
      drugName: detail.drugName || candidate.drugName,
      tradeName: detail.tradeName ?? candidate.tradeName,
      specification: detail.specification ?? candidate.specification,
      category: normalizeCategory(detail.category || candidate.category, detail.drugName || candidate.drugName),
      clinical: {
        indication: detail.indications || "",
        dosage: detail.dosage || "",
        adverseReactions: detail.adverseReactions || "",
        precautions: detail.precautions || ""
      },
      source: {
        status: "unverified-draft",
        label: detail.sourceTitle || candidate.source?.label || "Cloudflare Workers AI（AI 生成）",
        url: "",
        checkedAt: detail.sourceCheckedAt || candidate.source?.checkedAt || new Date().toISOString().slice(0, 10)
      }
    };
  }

  function currentForm() {
    const node = document.getElementById("drugForm");
    return node && document.getElementById("lookupDrugBtn") ? node : null;
  }

  function setField(node, name, value) {
    const field = node.elements.namedItem(name);
    if (field && value !== undefined && value !== null) field.value = value;
  }

  function fill(candidate, node = currentForm()) {
    if (!candidate || !node) return;
    ["drugName", "tradeName", "specification"].forEach(name => setField(node, name, candidate[name] || ""));
    setField(node, "category", normalizeCategory(candidate.category, candidate.drugName));
    ["indication", "dosage", "adverseReactions", "precautions"].forEach(name => setField(node, name, candidate.clinical?.[name] || ""));
    setField(node, "sourceLabel", candidate.source?.label || "Cloudflare Workers AI（AI 生成）");
    setField(node, "sourceUrl", "");
    setField(node, "sourceCheckedAt", candidate.source?.checkedAt || "");
    setField(node, "sourceStatus", "unverified-draft");
    const source = document.getElementById("selectedSource");
    if (source) source.textContent = `来源：${candidate.source?.label || "Cloudflare Workers AI（AI 生成）"}`;
    toast(`已选择：${candidate.drugName}`);
  }

  function renderCandidates(candidates) {
    const results = document.getElementById("lookupResults");
    if (!results) return;
    candidateMap = new Map();
    const stamp = Date.now();
    candidates.forEach((candidate, index) => {
      candidate.lookupId = `new-drug-${stamp}-${index}`;
      candidateMap.set(candidate.lookupId, candidate);
    });
    results.innerHTML = candidates.length ? candidates.map((candidate, index) =>
      `<article class="card lookup-card" data-candidate-card="${esc(candidate.lookupId)}"><div><p class="drug-sub">候选 ${index + 1}</p><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(candidate.tradeName || "无商品名")} · ${esc(candidate.specification || "规格待补充")} · ${esc(normalizeCategory(candidate.category, candidate.drugName))}</p><p class="drug-sub"><span class="badge info">AI 生成</span> 来源：${esc(candidate.source?.label || "Cloudflare Workers AI（AI 生成）")}</p><div class="toolbar"><button class="btn primary small" type="button" data-new-drug-use="${esc(candidate.lookupId)}">选择并自动填充</button></div></div></article>`
    ).join("") : '<div class="empty"><p>暂未生成候选，可重试或直接手动填写。</p></div>';
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
    if (heading) heading.textContent = "1. 新药智能识别（片段检索）";
    const notice = heading?.nextElementSibling;
    if (notice?.classList.contains("notice")) {
      notice.textContent = "无需输入药物全称：输入 2 个及以上汉字片段即可先快速生成多个候选；选择对应药物后再自动生成完整资料并填入表单。候选和填充资料均标注 AI 来源。";
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
    if (button) { button.disabled = true; button.textContent = "快速找候选…"; }
    clearResults();
    if (status) status.textContent = "正在本机快速检查重复…";

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
        ? `片段匹配到相似条目“${similar.drugName}”，同时继续识别其他可能候选…`
        : "正在按药名片段快速生成候选…";

      const result = await remoteNewDrugCandidates(query);
      if (id !== requestId) return;
      renderCandidates(result.candidates);
      if (result.candidates.length) {
        const timing = result.elapsedMs ? `（${(result.elapsedMs / 1000).toFixed(1)} 秒）` : "";
        if (status) status.textContent = `已生成 ${result.candidates.length} 个候选${timing}。请选择对应药物，选中后再生成这一项的完整资料并自动填充。`;
      } else if (status) {
        status.textContent = `暂未生成候选。${result.warnings.length ? result.warnings.join("；") : "可直接使用下方表单手动录入。"}`;
      }
    } catch (error) {
      if (id !== requestId) return;
      renderCandidates([]);
      if (status) status.textContent = `新药智能识别暂不可用：${error.message || "网络异常"}。可以直接手动填写。`;
      toast("智能识别暂不可用，可手动录入");
    } finally {
      if (id === requestId && button) { button.disabled = false; button.textContent = "智能识别"; }
    }
  }

  async function chooseCandidate(use) {
    const candidate = candidateMap.get(use.dataset.newDrugUse);
    if (!candidate) return;
    const id = ++detailRequestId;
    const status = document.getElementById("lookupStatus");
    const originalText = use.textContent;
    use.disabled = true;
    use.textContent = "生成资料中…";
    if (status) status.textContent = `已选择“${candidate.drugName}”，正在生成这一项的完整资料…`;
    try {
      const completed = await remoteCandidateDetail(candidate);
      if (id !== detailRequestId) return;
      candidateMap.set(candidate.lookupId, completed);
      fill(completed);
      document.querySelectorAll("[data-candidate-card]").forEach(card => card.removeAttribute("data-selected"));
      use.closest("[data-candidate-card]")?.setAttribute("data-selected", "true");
      if (status) status.textContent = `已选择“${completed.drugName}”，完整资料已自动填入下方表单。来源：${completed.source?.label || "Cloudflare Workers AI"}。`;
      use.textContent = "已选择并填充";
    } catch (error) {
      if (id !== detailRequestId) return;
      fill(candidate);
      if (status) status.textContent = `“${candidate.drugName}”基础信息已填入；完整资料生成失败：${error.message || "网络异常"}。`;
      toast("完整资料生成失败，已填入基础信息");
      use.disabled = false;
      use.textContent = originalText;
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
      chooseCandidate(use);
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

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
  let lastWarmAt = 0;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const hasChinese = value => /[\u3400-\u9fff]/.test(String(value || ""));

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

  async function remoteNewDrugCandidates(query) {
    const base = endpoint();
    if (!base) throw new Error("智能识别服务未配置");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
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
        drugName: item.drugName || "",
        tradeName: item.tradeName || "",
        specification: item.specification || "",
        category: normalizeCategory(item.category, item.drugName),
        clinical: {
          indication: item.indications || item.clinical?.indication || "",
          dosage: item.dosage || item.clinical?.dosage || "",
          adverseReactions: item.adverseReactions || item.clinical?.adverseReactions || "",
          precautions: item.precautions || item.clinical?.precautions || ""
        },
        source: {
          status: "unverified-draft",
          label: item.sourceTitle || "Cloudflare Workers AI（模型生成，未核验）",
          url: item.sourceUrl || "",
          checkedAt: item.sourceCheckedAt || new Date().toISOString().slice(0, 10)
        },
        smartMeta: {
          confidence: item.confidence || "low",
          approvalNumber: item.approvalNumber || "",
          draft: true,
          verified: false
        }
      })).filter(item => hasChinese(item.drugName) && hasChinese(item.clinical.indication) && hasChinese(item.clinical.dosage)).slice(0, 5);
      return {
        candidates,
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        mode: payload.mode || "",
        elapsedMs: Number(payload.elapsedMs) || 0
      };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("智能识别超过 25 秒，请重试或手动录入");
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
    if (field && value !== undefined && value !== null) field.value = value;
  }

  function fill(candidate, node = currentForm()) {
    if (!candidate || !node) return;
    ["drugName", "tradeName", "specification"].forEach(name => setField(node, name, candidate[name] || ""));
    setField(node, "category", normalizeCategory(candidate.category, candidate.drugName));
    ["indication", "dosage", "adverseReactions", "precautions"].forEach(name => setField(node, name, candidate.clinical?.[name] || ""));
    setField(node, "sourceLabel", candidate.source?.label || "Cloudflare Workers AI（模型生成，未核验）");
    setField(node, "sourceUrl", candidate.source?.url || "");
    setField(node, "sourceCheckedAt", candidate.source?.checkedAt || "");
    setField(node, "sourceStatus", "unverified-draft");
    const source = document.getElementById("selectedSource");
    if (source) source.textContent = `来源：${candidate.source?.label || "Cloudflare Workers AI（模型生成，未核验）"}`;
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
      `<article class="card lookup-card" data-candidate-card="${esc(candidate.lookupId)}"><div><p class="drug-sub">候选 ${index + 1}</p><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(candidate.tradeName || "无商品名")} · ${esc(candidate.specification || "规格待补充")} · ${esc(normalizeCategory(candidate.category, candidate.drugName))}</p><p class="drug-sub"><span class="badge warn">AI 生成</span> 来源：${esc(candidate.source?.label || "Cloudflare Workers AI（模型生成，未核验）")}</p><div class="toolbar"><button class="btn primary small" type="button" data-new-drug-use="${esc(candidate.lookupId)}">选择并填充</button></div></div></article>`
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
    if (heading) heading.textContent = "1. 新药智能识别（多候选）";
    const notice = heading?.nextElementSibling;
    if (notice?.classList.contains("notice")) {
      notice.textContent = "用于添加当前药库尚未收录的新药。输入药名后一次生成多个 AI 候选，选择对应药物即可自动填充；每个候选都会标注生成来源。";
    }
  }

  async function run() {
    const node = currentForm();
    if (!node) return;
    const query = String(node.elements.namedItem("drugName")?.value || "").trim();
    if (!query) return toast("请先输入新药名称");
    if (!hasChinese(query)) return toast("请输入中文药品名称");

    const id = ++requestId;
    const button = document.getElementById("lookupDrugBtn");
    const status = document.getElementById("lookupStatus");
    if (button) { button.disabled = true; button.textContent = "生成候选中…"; }
    clearResults();
    if (status) status.textContent = "正在检查药库是否已经收录…";

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
        ? `发现相似条目“${similar.drugName}”，正在继续生成新药候选…`
        : "确认药库未收录，正在生成多个候选…";

      const result = await remoteNewDrugCandidates(query);
      if (id !== requestId) return;
      renderCandidates(result.candidates);
      if (result.candidates.length) {
        const timing = result.elapsedMs ? `（${(result.elapsedMs / 1000).toFixed(1)} 秒）` : "";
        if (status) status.textContent = `已生成 ${result.candidates.length} 个候选${timing}，请选择对应药物后自动填充。${similar ? ` 请注意与相似条目“${similar.drugName}”区分。` : ""}`;
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
      fill(candidate);
      document.querySelectorAll("[data-candidate-card]").forEach(card => card.removeAttribute("data-selected"));
      use.closest("[data-candidate-card]")?.setAttribute("data-selected", "true");
      const status = document.getElementById("lookupStatus");
      if (status) status.textContent = `已选择“${candidate.drugName}”，资料已自动填入下方表单。`;
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
    requestAnimationFrame(enhanceAddCopy);
    setTimeout(enhanceAddCopy, 50);
  }

  window.addEventListener("hashchange", prepareAddPage);
  prepareAddPage();
})();
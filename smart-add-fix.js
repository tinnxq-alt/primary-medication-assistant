(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const VERIFIED = new Set(["verified-template", "verified-label", "verified-monograph", "verified-regulator"]);
  const CATEGORY_IDS = ["心血管","降压药","降糖药","调脂药","抗凝抗血小板","抗感染药","呼吸系统","消化系统","神经精神","镇痛抗炎","泌尿系统","内分泌","皮肤外用","维生素矿物质","中成药","其他"];
  const lookup = window.DRUG_LOOKUP || {};
  const normalize = lookup.normalize || (value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, ""));
  const directMatch = lookup.directlyMatchesDrug || (() => false);
  const normalizeAliases = lookup.normalizeTradeNameAliases || (value => Array.isArray(value) ? value : []);
  const aliasForDrug = lookup.tradeNameAliasForDrug || (() => undefined);
  let catalogPromise = null;
  let candidateMap = new Map();
  let requestId = 0;

  const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const hasChinese = value => /[\u3400-\u9fff]/.test(String(value || ""));

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

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("./chinese-drug-labels.json?v=12", { cache: "force-cache", headers: { Accept: "application/json" } })
        .then(response => {
          if (!response.ok) throw new Error(`中文核验库返回 ${response.status}`);
          return response.json();
        })
        .then(payload => {
          if (payload?.schemaVersion !== 1 || payload.language !== "zh-CN" || !Array.isArray(payload.drugs)) throw new Error("中文核验库格式无效");
          return { drugs: payload.drugs, aliases: normalizeAliases(payload.tradeNameAliases) };
        })
        .catch(error => { catalogPromise = null; throw error; });
    }
    return catalogPromise;
  }

  function localCandidates(query, payload) {
    const q = normalize(query);
    return payload.drugs.map((drug, index) => {
      const alias = aliasForDrug(query, drug, payload.aliases);
      if (!alias && !directMatch(query, drug)) return null;
      const source = drug.source || drug.clinical?.source || {};
      if (!VERIFIED.has(source.status) || !drug.clinical || !hasChinese(drug.clinical.indication) || !hasChinese(drug.clinical.dosage)) return null;
      const exact = [drug.drugName, drug.genericName, drug.tradeName].some(value => normalize(value) === q);
      const exactAlias = alias && normalize(alias.tradeName) === q;
      return {
        score: exactAlias ? 0 : exact ? 1 : alias ? 2 : 3,
        index,
        candidate: {
          drugName: drug.genericName || drug.drugName,
          tradeName: alias?.tradeName || drug.tradeName || "",
          specification: alias ? "" : drug.specification || "",
          category: normalizeCategory(drug.category, drug.drugName),
          clinical: { ...drug.clinical },
          source: { ...source, label: `${source.label || "项目中文核验资料"}（本地核验库）` },
          smartMeta: { confidence: "high", draft: false, verified: true },
          lookupMeta: { matchedByTradeName: Boolean(alias) }
        }
      };
    }).filter(Boolean).sort((a, b) => a.score - b.score || a.index - b.index).map(item => item.candidate).slice(0, 8);
  }

  function endpoint() {
    try {
      return String(JSON.parse(localStorage.getItem(`${PREFIX}smartSearchEndpoint`)) || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
    } catch { return DEFAULT_ENDPOINT; }
  }

  function directoryHint(query) {
    const q = normalize(query);
    const drugs = [...(window.DRUG_CATALOG || []), ...(window.OUTPATIENT_DRUG_CATALOG || [])];
    const drug = drugs.find(item => [item.drugName, item.genericName, item.tradeName].some(value => normalize(value) === q)) || drugs.find(item => directMatch(query, item));
    return drug ? { drugName: drug.genericName || drug.drugName || "", tradeName: drug.tradeName || "", specification: drug.specification || "", category: normalizeCategory(drug.category, drug.drugName) } : {};
  }

  async function remoteCandidates(query) {
    const base = endpoint();
    if (!base) return { candidates: [], warnings: ["智能识别服务未配置。"] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}/v1/drugs/search`, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, directoryHint: directoryHint(query) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `智能识别服务返回 ${response.status}`);
      const candidates = (Array.isArray(payload.candidates) ? payload.candidates : []).map(item => {
        const draft = item.draft === true || item.verified === false;
        return {
          drugName: item.drugName || "", tradeName: item.tradeName || "", specification: item.specification || "",
          category: normalizeCategory(item.category, item.drugName),
          clinical: {
            indication: item.indications || item.clinical?.indication || "",
            dosage: item.dosage || item.clinical?.dosage || "",
            adverseReactions: item.adverseReactions || item.clinical?.adverseReactions || "",
            precautions: item.precautions || item.clinical?.precautions || ""
          },
          source: { status: draft ? "unverified-draft" : "needs-review", label: item.sourceTitle || (draft ? "Cloudflare Workers AI 未核验草稿" : "智能识别候选"), url: item.sourceUrl || "", checkedAt: item.sourceCheckedAt || new Date().toISOString().slice(0, 10) },
          smartMeta: { confidence: item.confidence || "low", approvalNumber: item.approvalNumber || "", draft, verified: item.verified === true },
          lookupMeta: { matchedByTradeName: item.matchType === "trade-name" }
        };
      }).filter(item => hasChinese(item.drugName) && hasChinese(item.clinical.indication) && hasChinese(item.clinical.dosage)).slice(0, 6);
      return { candidates, warnings: Array.isArray(payload.warnings) ? payload.warnings : [] };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("智能识别服务响应超时");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function form() {
    const node = document.getElementById("drugForm");
    return node && document.getElementById("lookupDrugBtn") ? node : null;
  }

  function setField(node, name, value) {
    const field = node.elements.namedItem(name);
    if (field && value !== undefined && value !== null) field.value = value;
  }

  function fill(candidate, node = form()) {
    if (!candidate || !node) return;
    ["drugName", "tradeName", "specification"].forEach(name => setField(node, name, candidate[name] || ""));
    setField(node, "category", normalizeCategory(candidate.category, candidate.drugName));
    ["indication", "dosage", "adverseReactions", "precautions"].forEach(name => setField(node, name, candidate.clinical?.[name] || ""));
    setField(node, "sourceLabel", candidate.source?.label || "智能识别候选");
    setField(node, "sourceUrl", candidate.source?.url || "");
    setField(node, "sourceCheckedAt", candidate.source?.checkedAt || "");
    setField(node, "sourceStatus", candidate.source?.status || "needs-review");
    const source = document.getElementById("selectedSource");
    const draft = candidate.source?.status === "unverified-draft" || candidate.smartMeta?.draft;
    if (source) source.textContent = draft ? `当前来源：${candidate.source?.label || "未核验 AI 草稿"}（未核验；全部字段可编辑）` : `当前来源：${candidate.source?.label || "项目中文核验资料"}（已自动填入；全部字段可编辑）`;
    toast(draft ? "AI 草稿已自动填入，可核对后保存" : "核验资料已自动填入");
  }

  function render(candidates) {
    const results = document.getElementById("lookupResults");
    if (!results) return;
    candidateMap = new Map();
    candidates.forEach((candidate, index) => {
      candidate.lookupId = `quick-${Date.now()}-${index}`;
      candidateMap.set(candidate.lookupId, candidate);
    });
    results.innerHTML = candidates.length ? candidates.map(candidate => {
      const draft = candidate.source?.status === "unverified-draft" || candidate.smartMeta?.draft;
      return `<article class="card lookup-card"><div><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(candidate.tradeName || "无商品名")} · ${esc(candidate.specification || "规格待核对")} · ${esc(normalizeCategory(candidate.category, candidate.drugName))}</p><p class="drug-sub"><span class="badge ${draft ? "warn" : "ok"}">${draft ? "未核验草稿" : "核验资料"}</span> ${esc(candidate.source?.label || "智能识别候选")}</p><div class="toolbar"><button class="btn secondary small" type="button" data-quick-use-lookup="${esc(candidate.lookupId)}">填入此项</button></div></div></article>`;
    }).join("") : '<div class="empty"><p>暂未找到可自动填充的候选资料。</p></div>';
  }

  async function run() {
    const node = form();
    if (!node) return;
    const query = String(node.elements.namedItem("drugName")?.value || "").trim();
    if (!query) return toast("请先输入药品名");
    if (!hasChinese(query)) return toast("请输入中文药品名称");
    const id = ++requestId;
    const button = document.getElementById("lookupDrugBtn");
    const status = document.getElementById("lookupStatus");
    const links = document.getElementById("lookupLinks");
    if (button) { button.disabled = true; button.textContent = "识别中…"; }
    if (links) links.innerHTML = "";
    if (status) status.textContent = "正在优先读取本地中文核验库…";
    try {
      let local = [];
      try { local = localCandidates(query, await loadCatalog()); }
      catch (error) { if (status) status.textContent = `本地核验库读取失败，正在尝试智能识别：${error.message}`; }
      if (id !== requestId) return;
      if (local.length) {
        render(local);
        fill(local[0], node);
        if (status) status.textContent = `本地识别完成：找到 ${local.length} 个候选，已自动填入第 1 项。`;
        return;
      }
      if (status) status.textContent = "本地未找到匹配资料，正在生成智能候选…";
      try {
        const remote = await remoteCandidates(query);
        if (id !== requestId) return;
        render(remote.candidates);
        if (remote.candidates[0]) {
          fill(remote.candidates[0], node);
          if (status) status.textContent = `智能识别完成：找到 ${remote.candidates.length} 个候选，已自动填入第 1 项。${remote.warnings.length ? ` ${remote.warnings.join("；")}` : ""}`;
        } else if (status) status.textContent = `暂未生成候选。${remote.warnings.length ? remote.warnings.join("；") : "可直接使用下方表单手动录入。"}`;
      } catch (error) {
        if (id !== requestId) return;
        render([]);
        if (status) status.textContent = `智能识别暂不可用：${error.message || "网络异常"}。已保留手动录入表单。`;
        toast("智能识别暂不可用，可手动录入");
      }
    } finally {
      if (id === requestId && button) { button.disabled = false; button.textContent = "智能识别"; }
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("#lookupDrugBtn")) {
      event.preventDefault(); event.stopImmediatePropagation(); run(); return;
    }
    const use = event.target.closest?.("[data-quick-use-lookup]");
    if (use) { event.preventDefault(); event.stopImmediatePropagation(); fill(candidateMap.get(use.dataset.quickUseLookup)); }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.target?.id !== "drugNameInput" || event.key !== "Enter" || event.isComposing) return;
    event.preventDefault(); event.stopImmediatePropagation(); run();
  }, true);

  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#/add")) loadCatalog().catch(() => {}); });
  if (location.hash.startsWith("#/add")) loadCatalog().catch(() => {});
})();

(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const lookup = window.DRUG_LOOKUP || {};
  const classifyCandidate = window.DRUG_CLASSIFICATION.classifyCandidate;
  const normalize = lookup.normalize || (value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, ""));
  let aliasPromise = null;
  let candidateMap = new Map();
  let requestId = 0;
  let lastWarmAt = 0;
  let autoLookupTimer = null;
  let lastAutoQuery = "";

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

  function endpoint() {
    return String(read("smartSearchEndpoint", DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
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
      aliasPromise = window.loadChineseDrugLabels()
        .then(payload => Array.isArray(payload?.tradeNameAliases) ? payload.tradeNameAliases : [])
        .catch(() => {
          aliasPromise = null;
          return [];
        });
    }
    return aliasPromise;
  }

  function exactDuplicate(query, aliases = []) {
    const q = normalize(query);
    if (!q) return null;
    const drugs = allKnownDrugs();
    const direct = drugs.find(drug => [drug.drugName, drug.genericName, drug.tradeName, drug.rawName]
      .some(value => value && normalize(value) === q));
    if (direct) return direct;
    const alias = aliases.find(item => item?.tradeName && normalize(item.tradeName) === q);
    if (!alias) return null;
    return drugs.find(drug => [drug.drugName, drug.genericName].some(value => value && [alias.drugName, alias.genericName].some(target => normalize(value) === normalize(target)))) || null;
  }

  async function warmWorker() {
    const now = Date.now();
    if (now - lastWarmAt < 60_000) return;
    lastWarmAt = now;
    const base = endpoint();
    if (!base) return;
    try { await fetch(`${base}/health`, { cache: "no-store", mode: "cors" }); } catch {}
  }

  async function remoteInstructionCandidates(query) {
    const base = endpoint();
    if (!base) throw new Error("联网说明书检索服务未配置");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${base}/v1/drugs/search`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `联网检索返回 ${response.status}`);
      return {
        candidates: (Array.isArray(payload.candidates) ? payload.candidates : []).map(item => ({
          drugName: String(item.drugName || "").trim(),
          genericName: String(item.drugName || "").trim(),
          tradeName: String(item.tradeName || "").trim(),
          specification: String(item.specification || "").trim(),
          manufacturer: String(item.manufacturer || "").trim(),
          dosageForm: String(item.dosageForm || "").trim(),
          approvalNumber: String(item.approvalNumber || "").trim(),
          category: String(item.category || "").trim(),
          therapeuticClass: String(item.therapeuticClass || item.category || "").trim(),
          clinical: {
            indication: String(item.clinical?.indication || "").trim(),
            dosage: String(item.clinical?.dosage || "").trim(),
            adverseReactions: String(item.clinical?.adverseReactions || "").trim(),
            precautions: String(item.clinical?.precautions || "").trim()
          },
          source: {
            status: "needs-review",
            label: String(item.sourceTitle || item.sourceHost || "联网药品说明书"),
            url: String(item.sourceUrl || ""),
            host: String(item.sourceHost || ""),
            quality: String(item.sourceQuality || "网页说明书来源"),
            checkedAt: String(item.sourceCheckedAt || new Date().toISOString().slice(0, 10))
          }
        })).filter(item => hasChinese(item.drugName)
          && ["indication", "dosage", "adverseReactions", "precautions"].every(field => item.clinical[field])).slice(0, 3),
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        elapsedMs: Number(payload.elapsedMs) || 0,
        searchResultCount: Number(payload.searchResultCount) || 0
      };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("联网说明书检索超过 30 秒，请重试");
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

  function fill(candidate, node = currentForm(), { silent = false } = {}) {
    if (!candidate || !node) return;
    const classification = classifyCandidate(candidate);
    setField(node, "drugName", candidate.drugName || "");
    setField(node, "genericName", candidate.genericName || candidate.drugName || "");
    setField(node, "tradeName", candidate.tradeName || "");
    setField(node, "specification", candidate.specification || "");
    setField(node, "dosageForm", candidate.dosageForm || "");
    setField(node, "therapeuticClass", classification.therapeuticClass);
    setField(node, "manufacturer", candidate.manufacturer || "");
    setField(node, "marketingAuthorizationHolder", candidate.manufacturer || "");
    setField(node, "approvalNumber", candidate.approvalNumber || "");
    setField(node, "category", classification.category);
    setField(node, "indication", candidate.clinical?.indication || "");
    setField(node, "dosage", candidate.clinical?.dosage || "");
    setField(node, "adverseReactions", candidate.clinical?.adverseReactions || "");
    setField(node, "precautions", candidate.clinical?.precautions || "");
    setField(node, "sourceLabel", `${candidate.source?.label || "联网药品说明书"}｜${candidate.source?.quality || "网页来源"}`);
    setField(node, "sourceUrl", candidate.source?.url || "");
    setField(node, "sourceCheckedAt", candidate.source?.checkedAt || "");
    setField(node, "sourceStatus", "needs-review");
    const source = document.getElementById("selectedSource");
    if (source) {
      const extra = [candidate.manufacturer && `生产企业：${candidate.manufacturer}`, candidate.approvalNumber && `批准文号：${candidate.approvalNumber}`].filter(Boolean).join("；");
      source.textContent = `当前来源：${candidate.source?.label || "联网药品说明书"}（${candidate.source?.quality || "网页来源"}）${extra ? `；${extra}` : ""}`;
    }
    if (!silent) toast(`已从说明书原文填入：${candidate.drugName}`);
  }

  function renderCandidates(candidates) {
    const results = document.getElementById("lookupResults");
    if (!results) return;
    candidateMap = new Map();
    const stamp = Date.now();
    candidates.forEach((candidate, index) => {
      candidate.lookupId = `web-label-${stamp}-${index}`;
      candidateMap.set(candidate.lookupId, candidate);
    });
    results.innerHTML = candidates.length ? candidates.map((candidate, index) => {
      const classification = classifyCandidate(candidate);
      const meta = [candidate.tradeName, candidate.specification, candidate.manufacturer].filter(Boolean).join(" · ");
      const sourceLink = candidate.source?.url ? `<a class="btn ghost small link-btn" href="${esc(candidate.source.url)}" target="_blank" rel="noopener">查看原说明书</a>` : "";
      return `<article class="card lookup-card" data-candidate-card="${esc(candidate.lookupId)}"><div><p class="drug-sub">说明书候选 ${index + 1}</p><h3>${esc(candidate.drugName)}</h3><p class="drug-sub">${esc(meta || "规格/厂家以来源页为准")} · ${esc(classification.category)} · ${esc(classification.therapeuticClass)}</p><p class="drug-sub"><span class="badge ok">网页原文摘录</span> ${esc(candidate.source?.quality || "网页来源")}：${esc(candidate.source?.host || candidate.source?.label || "")}</p><div class="toolbar">${sourceLink}<button class="btn primary small" type="button" data-new-drug-use="${esc(candidate.lookupId)}">选择并自动填充</button></div></div></article>`;
    }).join("") : '<div class="empty"><p>未找到同时含药名、适应症和用法用量的可解析说明书网页。请补充药名后重试。</p></div>';
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
    if (heading) heading.textContent = "1. 联网自动检索说明书";
    const notice = heading?.nextElementSibling;
    if (notice?.classList.contains("notice")) {
      notice.textContent = "输入至少 2 个汉字的中文药名片段，停顿后自动先查 259 条可信说明书索引；未命中时仅在可信域名联网发现真实说明书。四项临床摘要完整且候选唯一时自动填充，存在多个厂家或规格时请手动选择，缺失内容不会猜测补写。";
    }
    const input = document.getElementById("drugNameInput");
    if (input) input.placeholder = "输入药名片段，如“司美”“孟鲁”“阿奇”";
    const button = document.getElementById("lookupDrugBtn");
    if (button && !button.disabled) button.textContent = "立即联网检索";
  }

  async function run({ automatic = false } = {}) {
    const node = currentForm();
    if (!node) return;
    const query = String(node.elements.namedItem("drugName")?.value || "").trim();
    if (!query) return automatic ? undefined : toast("请先输入药名片段");
    if (!hasChinese(query)) return automatic ? undefined : toast("请输入中文药品名称");
    if (chineseCount(query) < 2) return automatic ? undefined : toast("至少输入 2 个汉字");
    lastAutoQuery = query;

    const id = ++requestId;
    const button = document.getElementById("lookupDrugBtn");
    const status = document.getElementById("lookupStatus");
    if (button) { button.disabled = true; button.textContent = "正在检索全网…"; }
    clearResults();
    if (status) status.textContent = "正在联网搜索药品说明书并读取网页原文…";

    try {
      const aliases = await loadAliases();
      if (id !== requestId) return;
      const duplicate = exactDuplicate(query, aliases);
      if (duplicate) {
        if (status) status.textContent = `当前药库已收录“${duplicate.drugName || duplicate.genericName || query}”。如需添加不同规格/厂家，可继续补全名称后再检索。`;
        toast("药库已有同名药物");
        return;
      }

      const result = await remoteInstructionCandidates(query);
      if (id !== requestId) return;
      renderCandidates(result.candidates);
      const exactCandidates = result.candidates.filter(candidate => normalize(candidate.drugName) === normalize(query));
      const autoCandidate = result.candidates.length === 1
        ? result.candidates[0]
        : exactCandidates.length === 1 ? exactCandidates[0] : null;
      if (autoCandidate) {
        fill(autoCandidate, node, { silent: automatic });
        document.querySelector(`[data-candidate-card="${autoCandidate.lookupId}"]`)?.setAttribute("data-selected", "true");
      }
      const timing = result.elapsedMs ? `，耗时 ${(result.elapsedMs / 1000).toFixed(1)} 秒` : "";
      if (status) status.textContent = result.candidates.length
        ? autoCandidate
          ? `已从可信说明书原文自动填充“${autoCandidate.drugName}”${timing}。请核对药盒规格、厂家和批准文号。`
          : `从 ${result.searchResultCount || "多个"} 个来源中筛出 ${result.candidates.length} 份完整说明书${timing}。存在多个厂家或规格，请选择对应候选后自动填充。`
        : `没有找到可安全自动填充的说明书${timing}。${result.warnings.join("；")}`;
    } catch (error) {
      if (id !== requestId) return;
      renderCandidates([]);
      if (status) status.textContent = `联网说明书检索失败：${error.message || "网络异常"}`;
      toast("联网说明书检索暂不可用");
    } finally {
      if (id === requestId && button) { button.disabled = false; button.textContent = "立即联网检索"; }
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
      if (status) status.textContent = `已选择“${candidate.drugName}”，适应症、用法用量等内容均来自该候选说明书网页原文。请结合规格/厂家确认是否为目标品种。`;
      use.textContent = "已选择并填充";
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
      if (input && input.dataset.onlineAutofillBound !== "true") {
        input.dataset.onlineAutofillBound = "true";
        input.addEventListener("input", () => {
          clearTimeout(autoLookupTimer);
          const query = input.value.trim();
          if (!hasChinese(query) || chineseCount(query) < 2) {
            lastAutoQuery = "";
            return;
          }
          autoLookupTimer = setTimeout(() => {
            if (currentForm() !== input.form || input.value.trim() !== query || query === lastAutoQuery) return;
            run({ automatic: true });
          }, 900);
        });
      }
    });
    setTimeout(enhanceAddCopy, 50);
  }

  window.addEventListener("hashchange", prepareAddPage);
  prepareAddPage();
})();

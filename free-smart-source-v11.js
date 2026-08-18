(() => {
  "use strict";

  const PREFIX = "primary-medication-pro:v1:";
  const DEFAULT_ENDPOINT = "https://primary-medication-smart-search.tinnxq.workers.dev";
  const TRUSTED_HOSTS = new Set(["ypk.39.net", "yaopinnet.com", "www.yaopinnet.com"]);
  let parsing = false;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(`${PREFIX}${key}`));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function endpoint() {
    return String(read("smartSearchEndpoint", DEFAULT_ENDPOINT) || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
  }

  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hasEnoughChinese(value) {
    return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length >= 2;
  }

  function trustedHttpsUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:" || !TRUSTED_HOSTS.has(url.hostname.toLowerCase())) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function setField(form, name, value) {
    const field = form.elements.namedItem(name);
    if (field && value !== undefined && value !== null) field.value = String(value);
  }

  function fillCandidate(candidate, form) {
    setField(form, "drugName", candidate.drugName || "");
    setField(form, "tradeName", candidate.tradeName || "");
    setField(form, "specification", candidate.specification || "");
    setField(form, "category", candidate.category || "其他");
    setField(form, "indication", candidate.clinical?.indication || "");
    setField(form, "dosage", candidate.clinical?.dosage || "");
    setField(form, "adverseReactions", candidate.clinical?.adverseReactions || "");
    setField(form, "precautions", candidate.clinical?.precautions || "");
    setField(form, "sourceLabel", candidate.sourceTitle || candidate.sourceHost || "可信说明书网页");
    setField(form, "sourceUrl", candidate.sourceUrl || "");
    setField(form, "sourceCheckedAt", candidate.sourceCheckedAt || new Date().toISOString().slice(0, 10));
    setField(form, "sourceStatus", "unverified-draft");

    const selected = document.getElementById("selectedSource");
    if (selected) {
      const extra = [candidate.manufacturer && `生产企业：${candidate.manufacturer}`, candidate.approvalNumber && `批准文号：${candidate.approvalNumber}`].filter(Boolean).join("；");
      selected.textContent = `当前来源：${candidate.sourceTitle || candidate.sourceHost || "可信说明书网页"}${extra ? `；${extra}` : ""}`;
    }
  }

  function renderManualResult(candidate) {
    const results = document.getElementById("lookupResults");
    if (!results || !candidate) return;
    const link = trustedHttpsUrl(candidate.sourceUrl);
    results.innerHTML = `<article class="card lookup-card"><div><p class="drug-sub">粘贴链接解析结果</p><h3>${esc(candidate.drugName || "已识别药品")}</h3><p class="drug-sub"><span class="badge ok">说明书网页原文</span> ${esc(candidate.sourceHost || "可信来源")}</p>${link ? `<div class="toolbar"><a class="btn ghost small link-btn" href="${esc(link)}" target="_blank" rel="noopener">查看原说明书</a></div>` : ""}</div></article>`;
  }

  async function parseManualSource() {
    if (parsing) return;
    const form = document.getElementById("drugForm");
    const input = document.getElementById("trustedSourceUrlInput");
    const button = document.getElementById("parseTrustedSourceBtn");
    const status = document.getElementById("lookupStatus");
    if (!form || !input || !button) return;

    const query = String(form.elements.namedItem("drugName")?.value || "").trim();
    if (!hasEnoughChinese(query)) return toast("请先输入至少 2 个汉字的药名");
    const sourceUrl = trustedHttpsUrl(input.value);
    if (!sourceUrl) return toast("仅支持 39药品通或药源网 HTTPS 链接");

    parsing = true;
    button.disabled = true;
    button.textContent = "正在读取…";
    if (status) status.textContent = "正在直接读取你粘贴的真实说明书页面，不调用 OpenAI。";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(`${endpoint()}/v1/drugs/parse-source`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, sourceUrl })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `说明书解析返回 ${response.status}`);
      const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : null;
      if (!candidate) throw new Error((payload.warnings || ["该说明书页面暂未能安全解析"]).join("；"));
      if (!candidate.clinical?.indication || !candidate.clinical?.dosage) throw new Error("说明书缺少可安全提取的适应症或用法用量");
      fillCandidate(candidate, form);
      renderManualResult(candidate);
      if (status) status.textContent = `已从“${candidate.drugName}”说明书网页原文自动填充。请继续核对规格、厂家和批准文号。`;
      toast("已从真实说明书自动填充");
    } catch (error) {
      const message = error?.name === "AbortError" ? "说明书读取超时，请重试" : (error?.message || "说明书读取失败");
      if (status) status.textContent = `说明书链接解析失败：${message}`;
      toast("说明书链接解析失败");
    } finally {
      clearTimeout(timer);
      parsing = false;
      button.disabled = false;
      button.textContent = "解析并自动填充";
    }
  }

  function enhance() {
    if (!location.hash.startsWith("#/add")) return;
    const form = document.getElementById("drugForm");
    if (!form) return;

    const panel = form.closest(".panel");
    const heading = [...(panel?.querySelectorAll("h3") || [])].find(node => /智能识别|联网检索|免费说明书识别/.test(node.textContent));
    if (heading && heading.textContent !== "1. 免费说明书识别") heading.textContent = "1. 免费说明书识别";
    const notice = heading?.nextElementSibling;
    const copy = "先用本地可信说明书索引匹配药名，不调用 OpenAI、不会产生 API 费用。索引未收录时，可在下方粘贴 39药品通或药源网的具体说明书链接；临床字段只从页面原文提取，缺失内容不会猜测补写。";
    if (notice?.classList.contains("notice") && notice.textContent !== copy) notice.textContent = copy;

    const lookupButton = document.getElementById("lookupDrugBtn");
    if (lookupButton && !lookupButton.disabled && lookupButton.textContent !== "免费索引识别") lookupButton.textContent = "免费索引识别";

    if (!document.getElementById("freeSourceUrlBox")) {
      const status = document.getElementById("lookupStatus");
      if (!status) return;
      const box = document.createElement("div");
      box.id = "freeSourceUrlBox";
      box.className = "field";
      box.style.marginTop = "12px";
      box.innerHTML = `<label for="trustedSourceUrlInput">说明书链接（索引未命中时）</label><div class="toolbar"><input id="trustedSourceUrlInput" inputmode="url" autocomplete="off" placeholder="粘贴 39药品通 / 药源网具体说明书链接"><button class="btn secondary" id="parseTrustedSourceBtn" type="button">解析并自动填充</button></div><p class="muted">仅接受可信域名 HTTPS 链接；不会把其他网站当作医学来源。</p>`;
      status.insertAdjacentElement("afterend", box);
      document.getElementById("parseTrustedSourceBtn")?.addEventListener("click", parseManualSource);
    }
  }

  const observer = new MutationObserver(() => enhance());
  const app = document.getElementById("app");
  if (app) observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  window.addEventListener("hashchange", () => requestAnimationFrame(enhance));
  requestAnimationFrame(enhance);
  setTimeout(enhance, 80);
})();

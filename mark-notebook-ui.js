(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const RESTORE_KEY = "primary-medication:view-restore";
  const TYPE_LABELS = { underline: "划线", bold: "加粗", highlight: "荧光笔" };
  const FIELD_LABELS = { indication: "适应症", dosage: "用法用量", adverseReactions: "不良反应", precautions: "注意事项" };
  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modalRoot");
  let activeSelection = null;
  let enhanceQueued = false;
  let selectionTimer = null;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const readList = key => {
    try {
      const value = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${key}`));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeList = (key, value) => localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  const routeParts = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const currentRoute = () => routeParts()[0] || "home";
  const currentDrugId = () => currentRoute() === "detail" ? decodeURIComponent(routeParts().slice(1).join("/")) : "";

  function toast(message) {
    const node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    setTimeout(() => node.classList.remove("show"), 1800);
  }

  function drugNameById(drugId) {
    const custom = readList("customDrugs");
    const all = [
      ...(window.DRUG_CATALOG || []),
      ...(window.OUTPATIENT_DRUG_CATALOG || []),
      ...custom
    ];
    return all.find(drug => drug?.id === drugId)?.drugName || "已删除药品";
  }

  function resolveMarkRange(mark, text) {
    const validOffsets = Number.isInteger(mark.start) && Number.isInteger(mark.end)
      && mark.start >= 0 && mark.end > mark.start && mark.end <= text.length
      && text.slice(mark.start, mark.end) === mark.text;
    if (validOffsets) return { ...mark, start: mark.start, end: mark.end };
    const legacyStart = mark.text ? text.indexOf(mark.text) : -1;
    if (legacyStart < 0) return null;
    return { ...mark, start: legacyStart, end: legacyStart + mark.text.length };
  }

  function exactMarkedHtml(drugId, fieldName, text) {
    const ranges = readList("marks")
      .filter(mark => mark?.id && mark.drugId === drugId && mark.field === fieldName && mark.text)
      .map(mark => resolveMarkRange(mark, text))
      .filter(Boolean);
    if (!ranges.length) return esc(text);

    const boundaries = [...new Set([0, text.length, ...ranges.flatMap(mark => [mark.start, mark.end])])]
      .filter(value => value >= 0 && value <= text.length)
      .sort((a, b) => a - b);
    let html = "";
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (end <= start) continue;
      const segment = text.slice(start, end);
      const active = ranges.filter(mark => mark.start <= start && mark.end >= end);
      if (!active.length) {
        html += esc(segment);
        continue;
      }
      const ids = active.map(mark => mark.id).join(",");
      const classes = [...new Set(active.map(mark => mark.type).filter(Boolean))].map(esc).join(" ");
      const labels = [...new Set(active.map(mark => TYPE_LABELS[mark.type] || mark.type).filter(Boolean))].join("、");
      html += `<mark class="text-mark ${classes}" data-text-mark-id="${esc(ids)}" title="${esc(labels)} · 点击可删除">${esc(segment)}</mark>`;
    }
    return html;
  }

  function renderDetailMarks() {
    const drugId = currentDrugId();
    if (!drugId) return;
    document.querySelectorAll(".markable[data-mark-field]").forEach(field => {
      const text = field.textContent || "";
      const html = exactMarkedHtml(drugId, field.dataset.markField, text);
      if (field.innerHTML !== html) field.innerHTML = html;
    });
    const hint = [...document.querySelectorAll("p.muted")]
      .find(node => node.textContent.includes("长按或拖选说明书摘要文字"));
    if (hint) hint.textContent = "直接长按或拖选说明书文字，松手后即可选择划线、加粗或荧光笔；点击已有标记可删除。";
  }

  function selectedRangeInfo() {
    if (currentRoute() !== "detail") return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endElement = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
    const field = startElement?.closest?.(".markable[data-mark-field]");
    if (!field || !field.contains(endElement)) return null;

    const raw = range.toString();
    const text = raw.trim();
    if (!text || text.length > 240) return null;

    const startPrefix = document.createRange();
    startPrefix.selectNodeContents(field);
    startPrefix.setEnd(range.startContainer, range.startOffset);
    const endPrefix = document.createRange();
    endPrefix.selectNodeContents(field);
    endPrefix.setEnd(range.endContainer, range.endOffset);

    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    let start = startPrefix.toString().length + leadingWhitespace;
    let end = endPrefix.toString().length - trailingWhitespace;
    const fieldText = field.textContent || "";

    if (fieldText.slice(start, end) !== text) {
      const nearby = fieldText.indexOf(text, Math.max(0, start - 3));
      if (nearby >= 0 && nearby <= start + 3) {
        start = nearby;
        end = nearby + text.length;
      }
    }
    if (start < 0 || end <= start || fieldText.slice(start, end) !== text) return null;

    return {
      drugId: currentDrugId(),
      field: field.dataset.markField,
      text,
      start,
      end,
      fieldElement: field
    };
  }

  function removeFloatingMenus() {
    document.querySelector(".mark-selection-menu")?.remove();
    document.querySelector(".mark-delete-menu")?.remove();
  }

  function showSelectionMenu(info) {
    document.querySelector(".mark-delete-menu")?.remove();
    let menu = document.querySelector(".mark-selection-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "mark-selection-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "添加文本标记");
      document.body.appendChild(menu);
    }
    menu.innerHTML = `<small>已选：${esc(info.text.slice(0, 26))}${info.text.length > 26 ? "…" : ""}</small><div><button type="button" class="btn secondary small" data-direct-mark-type="underline">划线</button><button type="button" class="btn secondary small" data-direct-mark-type="bold">加粗</button><button type="button" class="btn secondary small" data-direct-mark-type="highlight">荧光笔</button><button type="button" class="btn ghost small" data-close-direct-mark>取消</button></div>`;
  }

  function rememberSelection() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const info = selectedRangeInfo();
      if (!info) return;
      activeSelection = info;
      showSelectionMenu(info);
    }, 40);
  }

  function makeRestorePayload(fieldName = "") {
    const field = fieldName ? document.querySelector(`.markable[data-mark-field="${CSS.escape(fieldName)}"]`) : null;
    return {
      hash: location.hash,
      scrollY: Math.max(0, window.scrollY || window.pageYOffset || 0),
      field: fieldName || "",
      fieldViewportTop: field ? field.getBoundingClientRect().top : null,
      createdAt: Date.now()
    };
  }

  function reloadWithoutVisibleJump(fieldName = "") {
    try { sessionStorage.setItem(RESTORE_KEY, JSON.stringify(makeRestorePayload(fieldName))); } catch {}
    document.documentElement.classList.add("restoring-view");
    location.reload();
  }

  function addDirectMark(type) {
    const info = activeSelection;
    if (!info || info.drugId !== currentDrugId() || !TYPE_LABELS[type]) return;
    const marks = readList("marks");
    const duplicate = marks.some(mark => mark.drugId === info.drugId
      && mark.field === info.field
      && mark.start === info.start
      && mark.end === info.end
      && mark.type === type);
    if (!duplicate) {
      marks.push({
        id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        drugId: info.drugId,
        field: info.field,
        text: info.text,
        start: info.start,
        end: info.end,
        type,
        createdAt: new Date().toISOString()
      });
      writeList("marks", marks);
    }
    window.getSelection()?.removeAllRanges();
    reloadWithoutVisibleJump(info.field);
  }

  function openDeleteMenu(markElement) {
    document.querySelector(".mark-selection-menu")?.remove();
    document.querySelector(".mark-delete-menu")?.remove();
    const ids = [...new Set((markElement.dataset.textMarkId || "").split(",").filter(Boolean))];
    const marks = readList("marks").filter(mark => ids.includes(mark.id));
    if (!marks.length) return;

    const menu = document.createElement("div");
    menu.className = "mark-delete-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "文本标记操作");
    menu.innerHTML = `<strong>文本标记</strong><div>${marks.map(mark => `<button type="button" class="btn danger small" data-direct-delete-mark="${esc(mark.id)}" data-direct-delete-field="${esc(mark.field)}">删除${esc(TYPE_LABELS[mark.type] || "标记")}</button>`).join("")}<button type="button" class="btn ghost small" data-close-direct-mark>取消</button></div>`;
    document.body.appendChild(menu);

    const rect = markElement.getBoundingClientRect();
    const width = Math.min(300, Math.max(220, menu.offsetWidth));
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
    const preferredTop = rect.bottom + 8;
    const top = preferredTop + menu.offsetHeight < window.innerHeight
      ? preferredTop
      : Math.max(12, rect.top - menu.offsetHeight - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function deleteDirectMark(id, fieldName) {
    const marks = readList("marks");
    const next = marks.filter(mark => mark.id !== id);
    if (next.length === marks.length) return removeFloatingMenus();
    writeList("marks", next);
    reloadWithoutVisibleJump(fieldName);
  }

  function groupNotebookSection(title, kind) {
    if (currentRoute() !== "notebook") return;
    const section = [...document.querySelectorAll("#app > .section, #app .section")]
      .find(node => node.querySelector(":scope > .section-title h2")?.textContent.trim() === title);
    const list = kind === "notes" ? section?.querySelector(":scope > .card-list") : section?.querySelector(":scope > .marks-list");
    if (!list || list.dataset.groupedByDrug === "true") return;
    const cards = [...list.children].filter(node => node.matches("article.card"));
    if (!cards.length) return;

    const markById = new Map(readList("marks").map(mark => [mark.id, mark]));
    const groups = new Map();
    for (const card of cards) {
      let drugId = "unknown";
      if (kind === "notes") {
        drugId = card.querySelector("[data-edit-note][data-note-drug]")?.dataset.noteDrug || "unknown";
      } else {
        const markId = card.querySelector("[data-delete-mark]")?.dataset.deleteMark || "";
        drugId = markById.get(markId)?.drugId || "unknown";
      }
      const drugName = card.querySelector("h3")?.textContent.trim() || drugNameById(drugId);
      if (!groups.has(drugId)) {
        const wrapper = document.createElement("section");
        wrapper.className = `card ${kind === "notes" ? "note-group-card" : "mark-group-card"}`;
        wrapper.dataset.notebookDrugGroup = drugId;
        wrapper.innerHTML = `<div class="detail-head"><div><h3>${esc(drugName)}</h3><small class="muted" data-group-count></small></div></div><div class="${kind === "notes" ? "note-group-list" : "mark-group-list"}"></div>`;
        groups.set(drugId, { wrapper, list: wrapper.lastElementChild, count: 0 });
      }
      const group = groups.get(drugId);
      group.count += 1;
      card.classList.add(kind === "notes" ? "note-group-entry" : "mark-group-entry");
      card.querySelector("h3")?.remove();
      group.list.appendChild(card);
    }

    list.replaceChildren(...[...groups.values()].map(group => {
      group.wrapper.querySelector("[data-group-count]").textContent = `${group.count} 条${kind === "notes" ? "笔记" : "文本标记"}`;
      return group.wrapper;
    }));
    list.dataset.groupedByDrug = "true";
  }

  function groupNotebook() {
    groupNotebookSection("全部药品笔记", "notes");
    groupNotebookSection("文本标记", "marks");
  }

  function restoreViewIfNeeded() {
    let payload = null;
    try { payload = JSON.parse(sessionStorage.getItem(RESTORE_KEY) || "null"); } catch {}
    if (!payload || payload.hash !== location.hash || Date.now() - Number(payload.createdAt || 0) > 10000) {
      sessionStorage.removeItem(RESTORE_KEY);
      document.documentElement.classList.remove("restoring-view");
      return;
    }
    sessionStorage.removeItem(RESTORE_KEY);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let top = Number(payload.scrollY || 0);
      if (payload.field && Number.isFinite(payload.fieldViewportTop)) {
        const field = document.querySelector(`.markable[data-mark-field="${CSS.escape(payload.field)}"]`);
        if (field) top = Math.max(0, window.scrollY + field.getBoundingClientRect().top - payload.fieldViewportTop);
      }
      window.scrollTo({ top, left: 0, behavior: "auto" });
      requestAnimationFrame(() => document.documentElement.classList.remove("restoring-view"));
    }));
  }

  function enhance() {
    enhanceQueued = false;
    if (currentRoute() === "detail") renderDetailMarks();
    if (currentRoute() === "notebook") groupNotebook();
  }

  function queueEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener("selectionchange", rememberSelection);
  document.addEventListener("mouseup", rememberSelection, true);
  document.addEventListener("touchend", rememberSelection, { capture: true, passive: true });

  document.addEventListener("pointerdown", event => {
    if (event.target.closest?.(".mark-selection-menu button")) event.preventDefault();
  }, true);

  document.addEventListener("click", event => {
    const directMark = event.target.closest?.("[data-direct-mark-type]");
    if (directMark) {
      event.preventDefault();
      event.stopImmediatePropagation();
      addDirectMark(directMark.dataset.directMarkType);
      return;
    }

    const directDelete = event.target.closest?.("[data-direct-delete-mark]");
    if (directDelete) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteDirectMark(directDelete.dataset.directDeleteMark, directDelete.dataset.directDeleteField || "");
      return;
    }

    if (event.target.closest?.("[data-close-direct-mark]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activeSelection = null;
      removeFloatingMenus();
      window.getSelection()?.removeAllRanges();
      return;
    }

    const marked = event.target.closest?.(".text-mark[data-text-mark-id]");
    if (marked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDeleteMenu(marked);
      return;
    }

    if (!event.target.closest?.(".mark-selection-menu, .mark-delete-menu")) {
      document.querySelector(".mark-delete-menu")?.remove();
    }
  }, true);

  if (app) new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => {
    activeSelection = null;
    removeFloatingMenus();
    queueEnhance();
  });
  window.addEventListener("resize", () => document.querySelector(".mark-delete-menu")?.remove());

  queueEnhance();
  restoreViewIfNeeded();
})();

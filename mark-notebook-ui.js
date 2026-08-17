(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const LEGACY_RESTORE_KEY = "primary-medication:view-restore";
  const TYPE_LABELS = { underline: "划线", bold: "加粗", highlight: "荧光笔" };
  const FIELD_LABELS = { indication: "适应症", dosage: "用法用量", adverseReactions: "不良反应", precautions: "注意事项" };
  const app = document.getElementById("app");
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
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1500);
  }

  function drugNameById(drugId) {
    const all = [
      ...(window.DRUG_CATALOG || []),
      ...(window.OUTPATIENT_DRUG_CATALOG || []),
      ...readList("customDrugs")
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
    if (hint) hint.textContent = "长按或拖选文字后，标记条会直接出现在选中文字旁边；点击已有标记可删除。";
  }

  function rangeAnchorRect(range) {
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0);
    const rect = rects.at(-1) || range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
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
      anchorRect: rangeAnchorRect(range)
    };
  }

  function removeFloatingMenus() {
    document.querySelector(".mark-selection-menu")?.remove();
    document.querySelector(".mark-delete-menu")?.remove();
  }

  function positionMenu(menu, anchorRect) {
    if (!anchorRect) return;
    menu.style.visibility = "hidden";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.bottom = "auto";
    menu.style.transform = "none";

    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const gap = 8;
    const edge = 8;
    const width = Math.min(menu.offsetWidth, viewportWidth - edge * 2);
    const height = menu.offsetHeight;
    const centerX = anchorRect.left + anchorRect.width / 2;
    const minLeft = viewportLeft + edge;
    const maxLeft = viewportLeft + viewportWidth - width - edge;
    const left = Math.min(maxLeft, Math.max(minLeft, centerX - width / 2));

    let top = anchorRect.top - height - gap;
    if (top < viewportTop + edge) top = anchorRect.bottom + gap;
    const maxTop = viewportTop + viewportHeight - height - edge;
    top = Math.min(maxTop, Math.max(viewportTop + edge, top));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
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
    menu.innerHTML = `<div class="mark-inline-actions"><button type="button" class="btn secondary small" data-direct-mark-type="underline">划线</button><button type="button" class="btn secondary small" data-direct-mark-type="bold">加粗</button><button type="button" class="btn secondary small" data-direct-mark-type="highlight">荧光笔</button><button type="button" class="btn ghost small" data-close-direct-mark>×</button></div>`;
    requestAnimationFrame(() => positionMenu(menu, info.anchorRect));
  }

  function rememberSelection(delay = 0) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const info = selectedRangeInfo();
      if (!info) return;
      activeSelection = info;
      showSelectionMenu(info);
    }, delay);
  }

  function syncMarks(marks) {
    window.dispatchEvent(new CustomEvent("primary-medication:marks-local-change", { detail: { marks } }));
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
      syncMarks(marks);
    }

    window.getSelection()?.removeAllRanges();
    activeSelection = null;
    removeFloatingMenus();
    renderDetailMarks();
    toast(duplicate ? "该标记已存在" : `${TYPE_LABELS[type]}已保存`);
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
    menu.innerHTML = `<div class="mark-inline-actions">${marks.map(mark => `<button type="button" class="btn danger small" data-direct-delete-mark="${esc(mark.id)}">删除${esc(TYPE_LABELS[mark.type] || "标记")}</button>`).join("")}<button type="button" class="btn ghost small" data-close-direct-mark>×</button></div>`;
    document.body.appendChild(menu);
    positionMenu(menu, markElement.getBoundingClientRect());
  }

  function deleteDirectMark(id) {
    const marks = readList("marks");
    const next = marks.filter(mark => mark.id !== id);
    if (next.length === marks.length) return removeFloatingMenus();
    writeList("marks", next);
    syncMarks(next);
    removeFloatingMenus();
    renderDetailMarks();
    toast("标记已删除");
  }

  function notebookMarkCard(mark) {
    return `<article class="card"><div class="detail-head"><div><h3>${esc(drugNameById(mark.drugId))}</h3><span class="badge info">${esc(FIELD_LABELS[mark.field] || mark.field)} · ${esc(TYPE_LABELS[mark.type] || mark.type)}</span></div><button class="btn ghost small" data-delete-mark="${esc(mark.id)}">删除</button></div><p class="mark-quote">${esc(mark.text)}</p></article>`;
  }

  function refreshNotebookMarks() {
    if (currentRoute() !== "notebook") return;
    const section = [...document.querySelectorAll("#app > .section, #app .section")]
      .find(node => node.querySelector(":scope > .section-title h2")?.textContent.trim() === "文本标记");
    const list = section?.querySelector(":scope > .marks-list");
    if (!section || !list) return;
    const marks = readList("marks");
    const count = section.querySelector(":scope > .section-title small");
    if (count) count.textContent = `${marks.length} 条`;
    list.innerHTML = marks.length
      ? marks.map(notebookMarkCard).join("")
      : '<div class="empty"><p>还没有划线、加粗或荧光笔标记。</p></div>';
    list.dataset.localMarksFresh = "true";
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
    refreshNotebookMarks();
    groupNotebookSection("全部药品笔记", "notes");
    groupNotebookSection("文本标记", "marks");
  }

  function deleteNotebookMark(id) {
    const marks = readList("marks");
    const next = marks.filter(mark => mark.id !== id);
    if (next.length === marks.length) return;
    writeList("marks", next);
    syncMarks(next);
    refreshNotebookMarks();
    groupNotebookSection("文本标记", "marks");
    toast("标记已删除");
  }

  function exportNotebookFromStorage() {
    const payload = {
      exportedAt: new Date().toISOString(),
      notes: readList("notes"),
      marks: readList("marks")
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "drug-notebook.json";
    link.click();
    URL.revokeObjectURL(url);
    toast("已生成导出文件");
  }

  function restoreLegacyViewOnce() {
    let payload = null;
    try { payload = JSON.parse(sessionStorage.getItem(LEGACY_RESTORE_KEY) || "null"); } catch {}
    sessionStorage.removeItem(LEGACY_RESTORE_KEY);
    if (!payload || payload.hash !== location.hash) {
      document.documentElement.classList.remove("restoring-view");
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, Number(payload.scrollY || 0)), left: 0, behavior: "auto" });
      document.documentElement.classList.remove("restoring-view");
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

  document.addEventListener("selectionchange", () => rememberSelection(18));
  document.addEventListener("mouseup", () => rememberSelection(0), true);
  document.addEventListener("touchend", () => rememberSelection(18), { capture: true, passive: true });

  document.addEventListener("pointerdown", event => {
    if (event.target.closest?.(".mark-selection-menu button, .mark-delete-menu button")) event.preventDefault();
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
      deleteDirectMark(directDelete.dataset.directDeleteMark);
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

    const notebookDelete = event.target.closest?.("[data-delete-mark]");
    if (notebookDelete && currentRoute() === "notebook") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.confirm("确认删除这条文本标记？")) deleteNotebookMark(notebookDelete.dataset.deleteMark);
      return;
    }

    if (event.target.closest?.("#exportNotes") && currentRoute() === "notebook") {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportNotebookFromStorage();
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
  window.addEventListener("resize", removeFloatingMenus);
  window.visualViewport?.addEventListener("resize", removeFloatingMenus);

  restoreLegacyViewOnce();
  queueEnhance();
})();

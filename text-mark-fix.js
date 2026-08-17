(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const MARKS_KEY = `${STORAGE_PREFIX}marks`;
  const TYPE_LABELS = { underline: "划线", bold: "加粗", highlight: "荧光笔" };
  let lastSelection = null;
  let enhanceQueued = false;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const readMarks = () => {
    try {
      const value = JSON.parse(localStorage.getItem(MARKS_KEY));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeMarks = marks => localStorage.setItem(MARKS_KEY, JSON.stringify(marks));

  const currentRoute = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const currentDrugId = () => {
    const parts = currentRoute();
    return parts[0] === "detail" ? decodeURIComponent(parts.slice(1).join("/")) : "";
  };

  function selectedRangeInfo() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endElement = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
    const field = startElement?.closest?.(".markable[data-mark-field]");
    if (!field || !field.contains(endElement)) return null;

    const raw = range.toString();
    const text = raw.trim();
    if (!text) return null;

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
      end
    };
  }

  const rememberSelection = () => {
    const info = selectedRangeInfo();
    if (info?.drugId && info.field) lastSelection = info;
  };

  function resolveMarkRange(mark, text) {
    const hasOffsets = Number.isInteger(mark.start) && Number.isInteger(mark.end)
      && mark.start >= 0 && mark.end > mark.start && mark.end <= text.length;
    if (hasOffsets && text.slice(mark.start, mark.end) === mark.text) {
      return { ...mark, start: mark.start, end: mark.end };
    }
    const legacyStart = mark.text ? text.indexOf(mark.text) : -1;
    if (legacyStart < 0) return null;
    return { ...mark, start: legacyStart, end: legacyStart + mark.text.length };
  }

  function exactMarkedHtml(drugId, fieldName, text) {
    const ranges = readMarks()
      .filter(mark => mark.drugId === drugId && mark.field === fieldName && mark.id && mark.text)
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

  function renderExactMarks() {
    const drugId = currentDrugId();
    if (!drugId) return;
    document.querySelectorAll(".markable[data-mark-field]").forEach(field => {
      const text = field.textContent || "";
      const html = exactMarkedHtml(drugId, field.dataset.markField, text);
      if (field.innerHTML !== html) field.innerHTML = html;
    });
    const hint = [...document.querySelectorAll("p.muted")]
      .find(node => node.textContent.includes("长按或拖选说明书摘要文字"));
    if (hint) hint.textContent = "长按或拖选说明书摘要文字后选择标记样式；点击已有标记可删除。";
  }

  function groupNotebookNotes() {
    if (currentRoute()[0] !== "notebook") return;
    const section = [...document.querySelectorAll("#app > .section, #app .section")]
      .find(node => node.querySelector(":scope > .section-title h2")?.textContent.trim() === "全部药品笔记");
    const list = section?.querySelector(":scope > .card-list");
    if (!list || list.dataset.notesGrouped === "true") return;
    const cards = [...list.children].filter(node => node.matches("article.card"));
    if (!cards.length) return;

    const groups = new Map();
    for (const card of cards) {
      const editButton = card.querySelector("[data-edit-note][data-note-drug]");
      const drugId = editButton?.dataset.noteDrug || "unknown";
      const drugName = card.querySelector("h3")?.textContent.trim() || "已删除药品";
      if (!groups.has(drugId)) {
        const wrapper = document.createElement("section");
        wrapper.className = "card note-group-card";
        wrapper.innerHTML = `<div class="detail-head"><div><h3>${esc(drugName)}</h3><small class="muted" data-note-group-count></small></div></div><div class="note-group-list"></div>`;
        groups.set(drugId, { wrapper, list: wrapper.querySelector(".note-group-list"), count: 0 });
      }
      const group = groups.get(drugId);
      group.count += 1;
      card.classList.add("note-group-entry");
      card.querySelector("h3")?.remove();
      group.list.appendChild(card);
    }

    list.replaceChildren(...[...groups.values()].map(group => {
      group.wrapper.querySelector("[data-note-group-count]").textContent = `${group.count} 条笔记`;
      return group.wrapper;
    }));
    list.dataset.notesGrouped = "true";
  }

  function removeMarkMenu() {
    document.querySelector(".mark-delete-menu")?.remove();
  }

  function openMarkMenu(markElement) {
    removeMarkMenu();
    const ids = [...new Set((markElement.dataset.textMarkId || "").split(",").filter(Boolean))];
    const marks = readMarks().filter(mark => ids.includes(mark.id));
    if (!marks.length) return;

    const menu = document.createElement("div");
    menu.className = "mark-delete-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "文本标记操作");
    menu.innerHTML = `<strong>文本标记</strong><div>${marks.map(mark => `<button type="button" class="btn danger small" data-delete-text-mark="${esc(mark.id)}">删除${esc(TYPE_LABELS[mark.type] || "标记")}</button>`).join("")}<button type="button" class="btn ghost small" data-close-mark-menu>取消</button></div>`;
    document.body.appendChild(menu);

    const rect = markElement.getBoundingClientRect();
    const width = Math.min(280, Math.max(200, menu.offsetWidth));
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
    const preferredTop = rect.bottom + 8;
    const top = preferredTop + menu.offsetHeight < window.innerHeight
      ? preferredTop
      : Math.max(12, rect.top - menu.offsetHeight - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function reloadWithScroll() {
    sessionStorage.setItem("text-mark-fix-scroll", String(window.scrollY));
    location.reload();
  }

  function restoreScroll() {
    const saved = Number(sessionStorage.getItem("text-mark-fix-scroll"));
    if (!Number.isFinite(saved)) return;
    sessionStorage.removeItem("text-mark-fix-scroll");
    setTimeout(() => window.scrollTo({ top: saved, behavior: "instant" }), 60);
  }

  function enhance() {
    enhanceQueued = false;
    renderExactMarks();
    groupNotebookNotes();
  }

  function queueEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener("selectionchange", () => setTimeout(rememberSelection, 0));
  document.addEventListener("mouseup", rememberSelection, true);
  document.addEventListener("touchend", () => setTimeout(rememberSelection, 30), true);

  document.addEventListener("click", event => {
    const styleButton = event.target.closest("#markToolbar [data-mark-type]");
    if (styleButton && lastSelection?.drugId === currentDrugId()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const type = styleButton.dataset.markType;
      const marks = readMarks();
      const duplicate = marks.some(mark => mark.drugId === lastSelection.drugId
        && mark.field === lastSelection.field
        && mark.start === lastSelection.start
        && mark.end === lastSelection.end
        && mark.type === type);
      if (!duplicate) {
        marks.push({
          id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...lastSelection,
          type,
          createdAt: new Date().toISOString()
        });
        writeMarks(marks);
      }
      window.getSelection()?.removeAllRanges();
      reloadWithScroll();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-text-mark]");
    if (deleteButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      writeMarks(readMarks().filter(mark => mark.id !== deleteButton.dataset.deleteTextMark));
      reloadWithScroll();
      return;
    }

    if (event.target.closest("[data-close-mark-menu]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      removeMarkMenu();
      return;
    }

    const markElement = event.target.closest(".text-mark[data-text-mark-id]");
    if (markElement) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openMarkMenu(markElement);
      return;
    }

    if (!event.target.closest(".mark-delete-menu")) removeMarkMenu();
  }, true);

  const app = document.getElementById("app");
  if (app) new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => {
    lastSelection = null;
    removeMarkMenu();
    queueEnhance();
  });
  window.addEventListener("resize", removeMarkMenu);
  queueEnhance();
  restoreScroll();
})();

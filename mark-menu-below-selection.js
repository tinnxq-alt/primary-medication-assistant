(() => {
  "use strict";

  let frame = 0;

  function currentSelectionRect() {
    if (!location.hash.startsWith("#/detail/")) return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startEl = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endEl = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
    const field = startEl?.closest?.(".markable[data-mark-field]");
    if (!field || !field.contains(endEl)) return null;
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0);
    const rect = rects.at(-1) || range.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function placeBelowSelection() {
    frame = 0;
    const menu = document.querySelector(".mark-selection-menu");
    const rect = currentSelectionRect();
    if (!menu || !rect) return;

    const viewport = window.visualViewport;
    const vx = viewport?.offsetLeft || 0;
    const vy = viewport?.offsetTop || 0;
    const vw = viewport?.width || window.innerWidth;
    const vh = viewport?.height || window.innerHeight;
    const edge = 8;
    const gap = 6;
    const width = Math.min(menu.offsetWidth, vw - edge * 2);
    const height = menu.offsetHeight;
    const center = rect.left + rect.width / 2;
    const left = Math.min(vx + vw - width - edge, Math.max(vx + edge, center - width / 2));
    const preferredTop = rect.bottom + gap;
    const maxTop = vy + vh - height - edge;
    const top = Math.max(vy + edge, Math.min(preferredTop, maxTop));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.bottom = "auto";
    menu.style.transform = "none";
  }

  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(placeBelowSelection);
    });
  }

  const observer = new MutationObserver(mutations => {
    if (!document.querySelector(".mark-selection-menu")) return;
    if (mutations.some(mutation => mutation.type === "childList" || mutation.type === "attributes")) schedule();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("selectionchange", schedule);
  document.addEventListener("mouseup", schedule, true);
  document.addEventListener("touchend", schedule, { capture: true, passive: true });
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);

  const hintObserver = new MutationObserver(() => {
    const hint = [...document.querySelectorAll("p.muted")]
      .find(node => node.textContent.includes("标记条会直接出现在选中文字旁边"));
    if (hint) hint.textContent = "长按或拖选文字后，标记条会贴在选中文字下方，避开系统复制/全选菜单；点击已有标记可删除。";
  });
  const app = document.getElementById("app");
  if (app) hintObserver.observe(app, { childList: true, subtree: true });
})();

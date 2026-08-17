(() => {
  "use strict";

  const RELOAD_SCROLL_KEY = "primary-medication:notebook-scroll-y";
  const nativeScrollTo = window.scrollTo.bind(window);
  const app = document.getElementById("app");
  let lastHash = location.hash;
  let desiredScrollY = null;
  let restoreTimer = null;

  const currentRoute = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "home";
  const isNotebook = () => currentRoute() === "notebook";
  const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  function rememberScroll({ persist = false } = {}) {
    if (!isNotebook()) return;
    desiredScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    if (persist) sessionStorage.setItem(RELOAD_SCROLL_KEY, String(desiredScrollY));
  }

  function restoreScrollSoon(delay = 0) {
    if (!isNotebook() || !Number.isFinite(desiredScrollY)) return;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!isNotebook() || !Number.isFinite(desiredScrollY)) return;
        nativeScrollTo({ top: Math.min(desiredScrollY, maxScrollY()), left: 0, behavior: "auto" });
      }));
    }, delay);
  }

  const persisted = Number(sessionStorage.getItem(RELOAD_SCROLL_KEY));
  if (Number.isFinite(persisted)) {
    desiredScrollY = Math.max(0, persisted);
    sessionStorage.removeItem(RELOAD_SCROLL_KEY);
    restoreScrollSoon(80);
  }

  window.scrollTo = (...args) => {
    const first = args[0];
    const requestedTop = typeof first === "object" && first !== null
      ? Number(first.top ?? window.scrollY)
      : Number(args[1] ?? 0);
    const hashChanged = location.hash !== lastHash;

    if (hashChanged) {
      lastHash = location.hash;
      desiredScrollY = null;
      sessionStorage.removeItem(RELOAD_SCROLL_KEY);
      return nativeScrollTo(...args);
    }

    if (isNotebook() && requestedTop === 0) {
      if (!Number.isFinite(desiredScrollY)) desiredScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      restoreScrollSoon();
      return;
    }

    return nativeScrollTo(...args);
  };

  document.addEventListener("pointerdown", event => {
    if (!isNotebook()) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target?.closest?.("#app, #modalRoot")) return;
    if (target.closest("[data-route-link], .bottom-nav, #backBtn, #homeBtn, #pharmacySwitcher")) return;
    rememberScroll();
  }, true);

  document.addEventListener("click", event => {
    if (!isNotebook()) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest?.("[data-notebook-delete-confirm]")) {
      rememberScroll({ persist: true });
    }
  }, true);

  if (app) {
    new MutationObserver(() => {
      if (!isNotebook() || !Number.isFinite(desiredScrollY)) return;
      restoreScrollSoon(20);
    }).observe(app, { childList: true, subtree: true });
  }

  window.addEventListener("hashchange", () => {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    desiredScrollY = null;
    sessionStorage.removeItem(RELOAD_SCROLL_KEY);
  });
})();

(() => {
  "use strict";

  const STORAGE_PREFIX = "primary-medication-pro:v1:";
  const MESSAGE_KEY = "primary-medication:notebook-delete-message";

  const currentRoute = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "home";

  const readList = key => {
    try {
      const value = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${key}`));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeList = (key, value) => localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));

  function closeDeleteModal() {
    const modalRoot = document.getElementById("modalRoot");
    if (modalRoot) modalRoot.innerHTML = "";
  }

  function showDeleteFeedback() {
    const message = sessionStorage.getItem(MESSAGE_KEY);
    if (!message) return;
    sessionStorage.removeItem(MESSAGE_KEY);
    const toast = document.getElementById("toast");
    if (!toast) return;
    setTimeout(() => {
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }, 120);
  }

  function deleteNotebookItem(storageKey, id, successMessage) {
    const items = readList(storageKey);
    const next = items.filter(item => item?.id !== id);
    if (next.length === items.length) {
      closeDeleteModal();
      return;
    }
    writeList(storageKey, next);
    sessionStorage.setItem(MESSAGE_KEY, successMessage);
    location.reload();
  }

  function openDeleteModal({ storageKey, id, label, successMessage }) {
    const modalRoot = document.getElementById("modalRoot");
    if (!modalRoot || !id) return;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-notebook-delete-backdrop>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="notebookDeleteTitle">
          <h2 id="notebookDeleteTitle">删除${label}</h2>
          <p>确认删除这条${label}？删除后无法撤销。</p>
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-notebook-delete-cancel>取消</button>
            <button type="button" class="btn danger" data-notebook-delete-confirm>删除</button>
          </div>
        </div>
      </div>`;

    modalRoot.querySelector("[data-notebook-delete-cancel]")?.addEventListener("click", closeDeleteModal);
    modalRoot.querySelector("[data-notebook-delete-backdrop]")?.addEventListener("click", event => {
      if (event.target.matches("[data-notebook-delete-backdrop]")) closeDeleteModal();
    });
    modalRoot.querySelector("[data-notebook-delete-confirm]")?.addEventListener("click", () => {
      deleteNotebookItem(storageKey, id, successMessage);
    });
  }

  document.addEventListener("click", event => {
    if (currentRoute() !== "notebook") return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const noteButton = target?.closest?.("[data-delete-note]");
    const markButton = target?.closest?.("[data-delete-mark]");
    if (!noteButton && !markButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (noteButton) {
      openDeleteModal({
        storageKey: "notes",
        id: noteButton.dataset.deleteNote,
        label: "笔记",
        successMessage: "笔记已删除"
      });
      return;
    }

    openDeleteModal({
      storageKey: "marks",
      id: markButton.dataset.deleteMark,
      label: "文本标记",
      successMessage: "文本标记已删除"
    });
  }, true);

  showDeleteFeedback();
})();

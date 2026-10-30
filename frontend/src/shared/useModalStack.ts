import { onMounted, onBeforeUnmount, ref } from "vue";

interface ModalStackEntry {
  id: string;
  onDismiss: () => void;
}

const modalStack = ref<ModalStackEntry[]>([]);
let searchFocusCallback: (() => void) | null = null;
let listenerCount = 0;

function isInputFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    active.isContentEditable
  );
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    // 1st Step: If typing in an input, blur it first
    if (isInputFocused()) {
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement as HTMLElement)?.blur();
      return;
    }

    // 2nd Step: If a modal or overlay is open, dismiss the topmost one
    if (modalStack.value.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const top = modalStack.value[modalStack.value.length - 1];
      // We trigger the dismiss handler
      top.onDismiss();
    }
    return;
  }

  if (e.key === "/") {
    if (!isInputFocused() && searchFocusCallback) {
      e.preventDefault();
      searchFocusCallback();
    }
  }
}

function ensureListener() {
  if (listenerCount === 0 && typeof window !== "undefined") {
    window.addEventListener("keydown", handleGlobalKeydown, { capture: true });
  }
  listenerCount++;
}

function releaseListener() {
  listenerCount--;
  if (listenerCount <= 0 && typeof window !== "undefined") {
    window.removeEventListener("keydown", handleGlobalKeydown, { capture: true });
    listenerCount = 0;
  }
}

export function registerModal(id: string, onDismiss: () => void): () => void {
  ensureListener();
  // Remove any existing entry with same id
  modalStack.value = modalStack.value.filter((m) => m.id !== id);
  modalStack.value.push({ id, onDismiss });

  return () => {
    modalStack.value = modalStack.value.filter((m) => m.id !== id);
    releaseListener();
  };
}

export function registerSearchFocus(callback: () => void): () => void {
  ensureListener();
  searchFocusCallback = callback;
  return () => {
    if (searchFocusCallback === callback) {
      searchFocusCallback = null;
    }
    releaseListener();
  };
}

export function useModalDismiss(
  id: string,
  isActive: () => boolean,
  onDismiss: () => void
) {
  let unregister: (() => void) | null = null;

  function update(active: boolean) {
    if (active) {
      if (!unregister) {
        unregister = registerModal(id, onDismiss);
      }
    } else {
      if (unregister) {
        unregister();
        unregister = null;
      }
    }
  }

  onMounted(() => {
    update(isActive());
  });

  onBeforeUnmount(() => {
    if (unregister) {
      unregister();
      unregister = null;
    }
  });

  return {
    sync: update,
  };
}

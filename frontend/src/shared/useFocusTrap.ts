import { watch, onBeforeUnmount, type Ref, nextTick } from "vue";

export interface FocusTrapOptions {
  initialFocusSelector?: string;
  returnFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap(
  containerRef: Ref<HTMLElement | null | undefined>,
  isActive: Ref<boolean> | (() => boolean),
  options: FocusTrapOptions = {}
) {
  const returnFocus = options.returnFocus ?? true;
  let previousActiveElement: HTMLElement | null = null;

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef.value) return [];
    const elements = Array.from(
      containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    // Filter visible elements
    return elements.filter((el) => {
      return (
        el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        el.getClientRects().length > 0
      );
    });
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Tab" || !containerRef.value) return;

    const focusables = getFocusableElements();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;

    if (e.shiftKey) {
      if (current === first || !containerRef.value.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (current === last || !containerRef.value.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function activate() {
    previousActiveElement = document.activeElement as HTMLElement | null;
    nextTick(() => {
      if (!containerRef.value) return;
      containerRef.value.addEventListener("keydown", handleKeyDown);

      // Set initial focus
      if (options.initialFocusSelector) {
        const target = containerRef.value.querySelector<HTMLElement>(
          options.initialFocusSelector
        );
        if (target && typeof target.focus === "function") {
          target.focus();
          return;
        }
      }

      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    });
  }

  function deactivate() {
    if (containerRef.value) {
      containerRef.value.removeEventListener("keydown", handleKeyDown);
    }
    if (returnFocus && previousActiveElement && typeof previousActiveElement.focus === "function") {
      try {
        previousActiveElement.focus();
      } catch {
        // element may no longer be in the DOM
      }
      previousActiveElement = null;
    }
  }

  watch(
    typeof isActive === "function" ? isActive : () => isActive.value,
    (active) => {
      if (active) {
        activate();
      } else {
        deactivate();
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    deactivate();
  });
}

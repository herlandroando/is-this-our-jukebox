<script setup lang="ts">
import type { ToastItem } from "../shared/types.ts";

defineProps<{
  toasts: ToastItem[];
}>();
</script>

<template>
  <div class="toast-stack">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast-item glass-panel"
        :class="`toast-${t.type}`"
      >
        <span class="toast-icon">
          <template v-if="t.type === 'success'">✓</template>
          <template v-else-if="t.type === 'warning'">⚠️</template>
          <template v-else-if="t.type === 'error'">✕</template>
          <template v-else>💡</template>
        </span>
        <span class="toast-message">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
  max-width: 380px;
}

@media (max-width: 640px) {
  .toast-stack {
    left: 1rem;
    right: 1rem;
    bottom: 5.5rem;
    max-width: none;
  }
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  background: rgba(18, 20, 29, 0.92);
}

.toast-icon {
  font-size: 0.9rem;
}

.toast-message {
  line-height: 1.3;
}

.toast-info {
  border-color: rgba(99, 102, 241, 0.4);
}

.toast-success {
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.toast-warning {
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.toast-error {
  border-color: rgba(244, 63, 94, 0.4);
  color: #fb7185;
}

/* Toast transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.92);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>

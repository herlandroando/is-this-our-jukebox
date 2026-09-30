<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { MemberRole } from "../shared/types.ts";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  isOpen: boolean;
  currentRole: MemberRole;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "claimRole", passcode: string): void;
}>();

const passcode = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      passcode.value = "";
      setTimeout(() => inputRef.value?.focus(), 150);
    }
  }
);

function submitPasscode() {
  if (passcode.value.trim()) {
    emit("claimRole", passcode.value.trim());
    passcode.value = "";
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.isOpen) {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="passcode-card glass-panel">
      <header class="modal-header">
        <div class="header-icon-wrap" :class="{ 'is-dj': currentRole === 'dj' }">
          <UiIcon v-if="currentRole === 'dj'" name="mic" :size="22" />
          <UiIcon v-else name="crown" :size="22" />
        </div>
        <button class="btn-icon close-btn" @click="emit('close')">
          <UiIcon name="x" :size="16" />
        </button>
      </header>

      <div class="card-content">
        <div v-if="currentRole === 'dj'" class="unlocked-state">
          <h3>DJ Status Active!</h3>
          <p>You have full remote playback controls and <strong>3x vote power</strong> enabled on this device.</p>
          <div class="perks-list">
            <div class="perk-item">
              <UiIcon name="check" :size="13" />
              <span>Remote Play, Pause & Skip</span>
            </div>
            <div class="perk-item">
              <UiIcon name="check" :size="13" />
              <span>Audio seek scrubbing</span>
            </div>
            <div class="perk-item">
              <UiIcon name="check" :size="13" />
              <span>+3 votes per upvote</span>
            </div>
            <div class="perk-item">
              <UiIcon name="check" :size="13" />
              <span>Remove tracks from queue</span>
            </div>
          </div>
          <button class="btn-primary done-btn" @click="emit('close')">Got It</button>
        </div>

        <div v-else class="claim-state">
          <h3>Unlock Office DJ Access</h3>
          <p>Enter the room DJ passcode to unlock playback controls and boosted voting power.</p>

          <div class="input-group">
            <input
              ref="inputRef"
              v-model="passcode"
              type="text"
              placeholder="Enter DJ Passcode..."
              class="passcode-input glass-pill"
              @keyup.enter="submitPasscode"
            />
            <button
              class="btn-primary unlock-btn"
              :disabled="!passcode.trim()"
              @click="submitPasscode"
            >
              <span>Unlock</span>
              <UiIcon name="mic" :size="14" />
            </button>
          </div>

          <div class="role-info-card glass-panel">
            <div class="role-stat">
              <span class="role-badge role-dj">
                <UiIcon name="mic" :size="11" />
                <span>DJ</span>
              </span>
              <span>Remote controls + 3x vote weight</span>
            </div>
            <div class="role-stat">
              <span class="role-badge role-vip">
                <UiIcon name="star-filled" :size="11" />
                <span>VIP</span>
              </span>
              <span>2x democratic vote weight</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.passcode-card {
  width: 100%;
  max-width: 420px;
  border-radius: var(--radius-lg);
  background: #0d1017;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.25rem 1.25rem 0.5rem;
}

.header-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.header-icon-wrap.is-dj {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 0 20px -2px rgba(139, 92, 246, 0.4);
  color: #c084fc;
}

.card-content {
  padding: 1rem 1.4rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-content h3 {
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 0.35rem;
}

.card-content p {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.input-group {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.passcode-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  outline: none;
  color: #fff;
  padding: 0.65rem 1rem;
  font-size: 0.92rem;
  font-family: inherit;
}

.passcode-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px -2px var(--accent-glow);
}

.unlock-btn {
  padding: 0.65rem 1.2rem;
  white-space: nowrap;
}

.role-info-card {
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  background: rgba(255, 255, 255, 0.02);
  margin-top: 0.35rem;
}

.role-stat {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.unlocked-state {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.perks-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  color: #d8b4fe;
  font-weight: 500;
}

.perk-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.done-btn {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.75rem;
}
</style>

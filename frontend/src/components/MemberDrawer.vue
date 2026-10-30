<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { MemberInfo, MemberRole } from "../shared/types.ts";
import UiIcon, { type IconName } from "./UiIcon.vue";
import { useFocusTrap } from "../shared/useFocusTrap.ts";

const props = defineProps<{
  isOpen: boolean;
  members: MemberInfo[];
  currentClientId: string;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "setRole", clientId: string, role: MemberRole): void;
  (e: "setDjPasscode", passcode: string): void;
}>();

const drawerRef = ref<HTMLElement | null>(null);
useFocusTrap(drawerRef, () => props.isOpen);

const newPasscode = ref("");
const isEditingPasscode = ref(false);

const availableRoles: { role: MemberRole; label: string; icon: IconName; weight: number }[] = [
  { role: "dj", label: "DJ", icon: "mic", weight: 3 },
  { role: "vip", label: "VIP", icon: "star-filled", weight: 2 },
  { role: "member", label: "Member", icon: "user", weight: 1 },
  { role: "listener", label: "Listener", icon: "volume-x", weight: 0 },
];

function onRoleChange(clientId: string, role: MemberRole) {
  emit("setRole", clientId, role);
}

function savePasscode() {
  if (newPasscode.value.trim()) {
    emit("setDjPasscode", newPasscode.value.trim());
    isEditingPasscode.value = false;
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
  <div v-if="isOpen" class="drawer-backdrop" @click.self="emit('close')">
    <aside
      ref="drawerRef"
      role="dialog"
      aria-modal="true"
      aria-label="Room Members & Roles"
      class="drawer-panel glass-panel"
    >
      <!-- Drawer Header -->
      <header class="drawer-header">
        <div class="header-title">
          <div class="header-icon-box">
            <UiIcon name="users" :size="18" />
          </div>
          <div>
            <h3>Room Members & Roles</h3>
            <span class="member-count tabular-nums">{{ members.length }} {{ members.length === 1 ? 'device' : 'devices' }} connected</span>
          </div>
        </div>
        <button
          class="btn-icon close-btn flex items-center gap-1.5"
          aria-label="Tutup drawer member (Esc)"
          @click="emit('close')"
        >
          <span class="kbd-badge text-[9px]">Esc</span>
          <UiIcon name="x" :size="16" />
        </button>
      </header>

      <!-- Roles Legend -->
      <section class="roles-legend glass-panel">
        <div class="legend-header">
          <span class="legend-title">Role Privileges & Vote Power</span>
        </div>
        <div class="legend-grid">
          <div class="legend-item">
            <span class="role-badge role-dj">
              <UiIcon name="mic" :size="11" />
              <span>DJ</span>
            </span>
            <span class="legend-desc">Player remote + <strong>3x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-vip">
              <UiIcon name="star-filled" :size="11" />
              <span>VIP</span>
            </span>
            <span class="legend-desc">Curator + <strong>2x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-member">
              <UiIcon name="user" :size="11" />
              <span>Member</span>
            </span>
            <span class="legend-desc">Standard + <strong>1x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-listener">
              <UiIcon name="volume-x" :size="11" />
              <span>Listener</span>
            </span>
            <span class="legend-desc">Audio only + <strong>0x vote</strong></span>
          </div>
        </div>
      </section>

      <!-- Member List -->
      <section class="members-section">
        <div class="section-heading">
          <h4>Active Coworkers</h4>
          <span class="hint">1-click to assign role</span>
        </div>

        <div v-if="members.length === 0" class="empty-members">
          <p>No active coworkers connected yet.</p>
        </div>

        <div v-else class="member-list">
          <div
            v-for="member in members"
            :key="member.clientId"
            class="member-card"
            :class="{ 'is-self': member.clientId === currentClientId, 'is-host-card': member.isHost }"
          >
            <div class="member-main">
              <div class="avatar-box" :class="`avatar-${member.role}`">
                <UiIcon v-if="member.isHost" name="crown" :size="14" />
                <UiIcon v-else-if="member.role === 'dj'" name="mic" :size="14" />
                <UiIcon v-else-if="member.role === 'vip'" name="star-filled" :size="14" />
                <UiIcon v-else name="user" :size="14" />
              </div>

              <div class="member-details">
                <div class="name-row">
                  <span class="member-name">{{ member.nickname }}</span>
                  <span v-if="member.clientId === currentClientId" class="you-tag">You</span>
                  <span
                    v-if="member.isListening"
                    class="glass-pill px-1.5 py-0.2 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border-emerald-400/40 flex items-center gap-1"
                    title="Tuned in with headphones"
                  >
                    <UiIcon name="headphones" :size="10" />
                    <span>Headphones</span>
                  </span>
                </div>
                <div class="ip-row">
                  <span class="ip-text tabular-nums">{{ member.ip }}</span>
                  <span class="role-badge" :class="`role-${member.role}`">
                    {{ member.role.toUpperCase() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Role Selector (only editable if sender isAdmin and target is not host) -->
            <div v-if="isAdmin && !member.isHost" class="role-switcher glass-pill">
              <button
                v-for="r in availableRoles"
                :key="r.role"
                class="role-switch-btn"
                :class="{ active: member.role === r.role, [`btn-${r.role}`]: true }"
                :title="`${r.label}: ${r.weight}x vote weight`"
                @click="onRoleChange(member.clientId, r.role)"
              >
                <UiIcon :name="r.icon" :size="11" />
                <span>{{ r.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- DJ Passcode Settings (Host Only) -->
      <section v-if="isAdmin" class="passcode-section glass-panel">
        <div class="passcode-info">
          <h4>Room DJ Passcode</h4>
          <p>Coworkers can enter this passcode on their phone to unlock DJ controls.</p>
        </div>

        <div v-if="!isEditingPasscode" class="passcode-display-row">
          <code class="passcode-pill glass-pill tabular-nums">office-dj</code>
          <button class="btn-secondary change-btn" @click="isEditingPasscode = true">Change Code</button>
        </div>

        <div v-else class="passcode-edit-row">
          <input
            v-model="newPasscode"
            type="text"
            placeholder="New passcode (e.g. friday-groove)"
            class="passcode-input glass-pill"
            @keyup.enter="savePasscode"
          />
          <button class="btn-primary" @click="savePasscode">Save</button>
          <button class="btn-secondary" @click="isEditingPasscode = false">Cancel</button>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1050;
  display: flex;
  justify-content: flex-end;
}

.drawer-panel {
  width: 100%;
  max-width: 480px;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
  background: #0d1017;
  border-left: 1px solid var(--border-subtle);
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.7);
  overflow-y: auto;
  border-radius: 0;
  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon-box {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a5b4fc;
}

.header-title h3 {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.member-count {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.roles-legend {
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.legend-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.legend-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.legend-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.legend-desc {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.65rem;
}

.section-heading h4 {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
}

.section-heading .hint {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.member-card {
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.member-card.is-self {
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.06);
}

.member-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar-box {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.avatar-dj {
  background: rgba(139, 92, 246, 0.2);
  color: #c084fc;
}

.avatar-vip {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.member-details {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.member-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
}

.you-tag {
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.25);
  color: #c7d2fe;
}

.ip-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.15rem;
}

.ip-text {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.role-switcher {
  display: flex;
  gap: 0.2rem;
  padding: 0.2rem;
  background: rgba(0, 0, 0, 0.35);
}

.role-switch-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.25rem 0.4rem;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.role-switch-btn:hover {
  color: #fff;
}

.role-switch-btn.active.btn-dj {
  background: rgba(139, 92, 246, 0.3);
  color: #c084fc;
}

.role-switch-btn.active.btn-vip {
  background: rgba(16, 185, 129, 0.3);
  color: #34d399;
}

.role-switch-btn.active.btn-member {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.role-switch-btn.active.btn-listener {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.passcode-section {
  padding: 1.1rem;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  background: rgba(255, 255, 255, 0.03);
}

.passcode-info h4 {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
}

.passcode-info p {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.passcode-display-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.passcode-pill {
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
  font-family: var(--font-mono);
  color: #a5b4fc;
}

.change-btn {
  font-size: 0.74rem;
  padding: 0.35rem 0.75rem;
}

.passcode-edit-row {
  display: flex;
  gap: 0.5rem;
}

.passcode-input {
  flex: 1;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  color: #fff;
  outline: none;
}
</style>

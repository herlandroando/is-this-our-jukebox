<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { MemberInfo, MemberRole } from "../shared/types.ts";

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

const newPasscode = ref("");
const isEditingPasscode = ref(false);

const availableRoles: { role: MemberRole; label: string; icon: string; weight: number }[] = [
  { role: "dj", label: "DJ", icon: "🎧", weight: 3 },
  { role: "vip", label: "VIP", icon: "⭐", weight: 2 },
  { role: "member", label: "Member", icon: "👤", weight: 1 },
  { role: "listener", label: "Listener", icon: "🔇", weight: 0 },
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
    <aside class="drawer-panel glass-panel">
      <!-- Drawer Header -->
      <header class="drawer-header">
        <div class="header-title">
          <span class="icon">👥</span>
          <div>
            <h3>Room Members & Roles</h3>
            <span class="member-count">{{ members.length }} {{ members.length === 1 ? 'device' : 'devices' }} connected</span>
          </div>
        </div>
        <button class="btn-icon close-btn" @click="emit('close')">✕</button>
      </header>

      <!-- Roles Legend -->
      <section class="roles-legend glass-panel">
        <div class="legend-header">
          <span class="legend-title">Role Privileges & Vote Power</span>
        </div>
        <div class="legend-grid">
          <div class="legend-item">
            <span class="role-badge role-dj">🎧 DJ</span>
            <span class="legend-desc">Player remote + <strong>3x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-vip">⭐ VIP</span>
            <span class="legend-desc">Curator + <strong>2x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-member">👤 Member</span>
            <span class="legend-desc">Standard + <strong>1x vote</strong></span>
          </div>
          <div class="legend-item">
            <span class="role-badge role-listener">🔇 Listener</span>
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
                <span v-if="member.isHost">👑</span>
                <span v-else-if="member.role === 'dj'">🎧</span>
                <span v-else-if="member.role === 'vip'">⭐</span>
                <span v-else>👤</span>
              </div>

              <div class="member-details">
                <div class="name-row">
                  <span class="member-name">{{ member.nickname }}</span>
                  <span v-if="member.clientId === currentClientId" class="you-tag">You</span>
                </div>
                <div class="ip-row">
                  <span class="ip-text">{{ member.ip }}</span>
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
                <span>{{ r.icon }}</span>
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
          <code class="passcode-pill glass-pill">office-dj</code>
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
  background: rgba(14, 16, 26, 0.95);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.6);
  overflow-y: auto;
  border-radius: 0;
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

.header-title .icon {
  font-size: 1.6rem;
}

.header-title h3 {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.member-count {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.roles-legend {
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: rgba(255, 255, 255, 0.03);
}

.legend-header {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.legend-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.legend-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.legend-desc {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.members-section {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  flex: 1;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.section-heading h4 {
  font-size: 0.95rem;
  font-weight: 700;
}

.section-heading .hint {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.member-card {
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: all var(--transition-fast);
}

.member-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.member-card.is-host-card {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.05);
}

.member-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar-box {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.avatar-host {
  background: rgba(245, 158, 11, 0.2);
}

.avatar-dj {
  background: rgba(139, 92, 246, 0.2);
}

.avatar-vip {
  background: rgba(16, 185, 129, 0.2);
}

.member-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.member-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.you-tag {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--accent-primary);
  background: rgba(99, 102, 241, 0.15);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.ip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.ip-text {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text-muted);
}

.role-switcher {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: rgba(0, 0, 0, 0.3);
}

.role-switch-btn {
  flex: 1;
  padding: 0.3rem 0.4rem;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  gap: 0.25rem;
  transition: all var(--transition-fast);
}

.role-switch-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.role-switch-btn.active.btn-dj {
  background: rgba(139, 92, 246, 0.3);
  color: #c084fc;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.4);
}

.role-switch-btn.active.btn-vip {
  background: rgba(16, 185, 129, 0.25);
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
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
}

.passcode-info h4 {
  font-size: 0.88rem;
  font-weight: 700;
}

.passcode-info p {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.passcode-display-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.passcode-pill {
  font-family: monospace;
  font-size: 0.85rem;
  padding: 0.35rem 0.85rem;
  color: var(--accent-primary);
  font-weight: 700;
}

.change-btn {
  font-size: 0.78rem;
  padding: 0.35rem 0.75rem;
}

.passcode-edit-row {
  display: flex;
  gap: 0.5rem;
}

.passcode-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  outline: none;
  color: #fff;
  padding: 0.4rem 0.75rem;
  font-family: inherit;
  font-size: 0.85rem;
}
</style>

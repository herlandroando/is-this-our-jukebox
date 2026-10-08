<script setup lang="ts">
import { ref } from "vue";
import type { MemberRole } from "../../../shared/types.ts";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  status: string;
  myRole: MemberRole;
  nickname: string;
  activeListeners: number;
  headphoneCount: number;
  queueCount: number;
}>();

const emit = defineEmits<{
  (e: "openPasscodeModal"): void;
  (e: "updateNickname", nickname: string): void;
}>();

const isNicknameModalOpen = ref(false);
const nicknameInput = ref("");

function openEditNickname() {
  nicknameInput.value = props.nickname;
  isNicknameModalOpen.value = true;
}

function saveNickname() {
  const trimmed = nicknameInput.value.trim();
  emit("updateNickname", trimmed || "Anonymous");
  isNicknameModalOpen.value = false;
}
</script>

<template>
  <header class="glass-panel shrink-0 px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-2 shadow-lg border-white/10 backdrop-blur-xl">
    <!-- Left: Brand Icon + Title + Live Dot -->
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="w-8 h-8 rounded-xl overflow-hidden border border-indigo-500/35 flex items-center justify-center bg-slate-900/60 shrink-0 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
        <img src="/logo.png" alt="Logo" class="w-full h-full object-cover" />
      </div>

      <div class="flex flex-col min-w-0 justify-center">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-xs sm:text-sm font-black tracking-tight text-white whitespace-nowrap">
            IsThisOurJukebox
          </span>
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="status === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse' : 'bg-amber-400'"
          ></span>
        </div>

        <div class="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <span class="text-emerald-400 font-bold">{{ status === 'connected' ? 'Live' : 'Connecting' }}</span>
          <span>•</span>
          <span class="tabular-nums font-mono">{{ activeListeners }} in room</span>
          <span v-if="headphoneCount > 0" class="text-emerald-400 ml-0.5">🎧 {{ headphoneCount }}</span>
        </div>
      </div>
    </div>

    <!-- Right: Role Pill + 1-Tap Nickname Avatar Pill -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- Role Badge Button -->
      <button
        class="role-badge h-7 px-2 active:scale-95 transition-transform cursor-pointer shadow-sm text-[10px]"
        :class="`role-${myRole}`"
        :title="`Role: ${myRole.toUpperCase()} (Tap to unlock DJ/Host)`"
        @click="emit('openPasscodeModal')"
      >
        <UiIcon v-if="myRole === 'host'" name="crown" :size="11" />
        <UiIcon v-else-if="myRole === 'dj'" name="mic" :size="11" />
        <UiIcon v-else-if="myRole === 'vip'" name="star-filled" :size="11" />
        <UiIcon v-else name="user" :size="11" />
        <span class="font-black uppercase tracking-wider">{{ myRole }}</span>
      </button>

      <!-- Nickname Pill Button -->
      <button
        class="glass-pill h-7 px-2.5 flex items-center gap-1 text-[11px] font-semibold text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer shadow-sm"
        title="Tap to change your nickname"
        @click="openEditNickname"
      >
        <UiIcon name="user" :size="10" class="text-slate-400" />
        <span class="max-w-[75px] truncate font-medium">{{ nickname }}</span>
      </button>
    </div>

    <!-- Clean Mobile Nickname Prompt Dialog -->
    <div
      v-if="isNicknameModalOpen"
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      @click.self="isNicknameModalOpen = false"
    >
      <div class="glass-panel w-full max-w-xs p-4 rounded-3xl border-white/15 flex flex-col gap-3 shadow-2xl bg-obsidian-900/95">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
            <UiIcon name="user" :size="14" class="text-indigo-400" />
            <span>Set Your Nickname</span>
          </h3>
          <button
            class="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center active:scale-90"
            @click="isNicknameModalOpen = false"
          >
            <UiIcon name="x" :size="12" />
          </button>
        </div>

        <p class="text-xs text-slate-400">
          This name appears when you request songs and vote in the queue.
        </p>

        <div class="flex items-center bg-white/5 border border-white/10 focus-within:border-indigo-400/60 rounded-xl px-3 py-2 transition-all">
          <input
            v-model="nicknameInput"
            type="text"
            placeholder="Enter nickname..."
            maxlength="20"
            autofocus
            class="w-full bg-transparent border-none outline-none text-sm text-white font-medium placeholder-slate-500"
            @keyup.enter="saveNickname"
          />
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            class="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 active:scale-95"
            @click="isNicknameModalOpen = false"
          >
            Cancel
          </button>
          <button
            class="btn-primary px-4 py-1.5 rounded-xl text-xs font-bold active:scale-95 shadow-md"
            @click="saveNickname"
          >
            Save Name
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

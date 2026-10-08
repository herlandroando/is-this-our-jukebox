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
  activeTab: "queue" | "catalog" | "lyrics";
  queueCount: number;
  karaokeEnabled: boolean;
}>();

const emit = defineEmits<{
  (e: "openPasscodeModal"): void;
  (e: "updateNickname", nickname: string): void;
  (e: "selectTab", tab: "queue" | "catalog" | "lyrics"): void;
}>();

const isEditingNickname = ref(false);
const nicknameInput = ref("");

function startEditNickname() {
  nicknameInput.value = props.nickname;
  isEditingNickname.value = true;
}

function saveNickname() {
  const trimmed = nicknameInput.value.trim();
  emit("updateNickname", trimmed || "Anonymous");
  isEditingNickname.value = false;
}
</script>

<template>
  <header class="glass-panel shrink-0 px-5 py-3.5 rounded-2xl flex items-center justify-between gap-4 shadow-lg border-white/10 backdrop-blur-xl">
    <!-- Left: Brand Logo & Live Status Beacon -->
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-10 h-10 rounded-xl overflow-hidden border border-indigo-500/35 flex items-center justify-center bg-slate-900/60 shrink-0 shadow-[0_0_16px_rgba(99,102,241,0.2)]">
        <img src="/logo.png" alt="IsThisOurJukebox Logo" class="w-full h-full object-cover" />
      </div>
      <div class="flex flex-col min-w-0">
        <h1 class="text-base font-black tracking-tight text-white leading-tight whitespace-nowrap">
          IsThisOurJukebox
        </h1>
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <span
            class="w-2 h-2 rounded-full transition-all duration-300 shrink-0"
            :class="status === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-400'"
          ></span>
          <span>{{ status === 'connected' ? 'Live on Air' : 'Reconnecting...' }}</span>
          <span class="text-slate-600">•</span>
          <span class="text-slate-400 font-mono text-[10px] tabular-nums">
            {{ activeListeners }} in room <span v-if="headphoneCount > 0" class="text-emerald-400">• 🎧 {{ headphoneCount }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Center: Desktop Workspace Tabs -->
    <nav class="flex items-center gap-1.5 bg-obsidian-900/80 p-1.5 rounded-full border border-white/10 shadow-inner">
      <button
        class="px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer active:scale-95"
        :class="activeTab === 'queue' ? 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(99,102,241,0.45)]' : 'text-slate-400 hover:text-white'"
        @click="emit('selectTab', 'queue')"
      >
        <UiIcon name="list-music" :size="14" />
        <span>Queue</span>
        <span
          v-if="queueCount > 0"
          class="text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums"
          :class="activeTab === 'queue' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'"
        >
          {{ queueCount }}
        </span>
      </button>

      <button
        class="px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer active:scale-95"
        :class="activeTab === 'catalog' ? 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(99,102,241,0.45)]' : 'text-slate-400 hover:text-white'"
        @click="emit('selectTab', 'catalog')"
      >
        <UiIcon name="sparkles" :size="14" />
        <span>Catalog</span>
      </button>

      <button
        class="px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer active:scale-95"
        :class="activeTab === 'lyrics' ? 'bg-pink-600 text-white shadow-[0_0_16px_rgba(236,72,153,0.45)]' : 'text-slate-400 hover:text-white'"
        @click="emit('selectTab', 'lyrics')"
      >
        <UiIcon name="mic" :size="14" />
        <span>Lyrics</span>
        <span v-if="karaokeEnabled" class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
      </button>
    </nav>

    <!-- Right: Identity Capsule (Role Badge + Inline Nickname Editor) -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        class="role-badge h-9 px-3 active:scale-95 transition-transform cursor-pointer shadow-sm text-[11px]"
        :class="`role-${myRole}`"
        :title="`Current role: ${myRole.toUpperCase()} (Click to claim DJ/Host passcode)`"
        @click="emit('openPasscodeModal')"
      >
        <UiIcon v-if="myRole === 'host'" name="crown" :size="13" />
        <UiIcon v-else-if="myRole === 'dj'" name="mic" :size="13" />
        <UiIcon v-else-if="myRole === 'vip'" name="star-filled" :size="13" />
        <UiIcon v-else name="user" :size="13" />
        <span class="font-extrabold uppercase tracking-wider">{{ myRole }}</span>
      </button>

      <div class="nickname-wrapper">
        <button
          v-if="!isEditingNickname"
          class="glass-pill h-9 px-3 flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer shadow-sm"
          title="Click to change your nickname"
          @click="startEditNickname"
        >
          <span class="max-w-[130px] truncate">{{ nickname }}</span>
        </button>

        <div v-else class="glass-pill h-9 px-2 flex items-center gap-1 bg-white/10 border-indigo-400/50 shadow-inner">
          <input
            v-model="nicknameInput"
            type="text"
            placeholder="Your name"
            maxlength="20"
            autofocus
            class="bg-transparent border-none outline-none text-xs text-white px-1.5 w-[110px] font-medium"
            @keyup.enter="saveNickname"
            @keyup.escape="isEditingNickname = false"
          />
          <button
            class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
            title="Save Nickname"
            @click="saveNickname"
          >
            <UiIcon name="check" :size="12" :strokeWidth="2.5" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

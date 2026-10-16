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
  <header
    class="shrink-0 px-3.5 py-2.5 bg-[#0b0b14] border-2 border-white flex items-center justify-between gap-2 shadow-[4px_4px_0px_#000000] relative z-30 select-none"
    style="transform: skewX(-2deg);"
  >
    <!-- Left: Brand Icon + Title + Live Dot -->
    <div class="flex items-center gap-2 min-w-0" style="transform: skewX(2deg);">
      <div
        class="w-7 h-7 border-2 border-white flex items-center justify-center bg-[#e60012] shrink-0 shadow-[2px_2px_0px_#000]"
        style="transform: skewX(-10deg);"
      >
        <img src="/logo.png" alt="Logo" class="w-full h-full object-cover p-0.5" />
      </div>

      <div class="flex flex-col min-w-0 justify-center">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-xs font-black italic tracking-tight text-white uppercase whitespace-nowrap">
            JUKEBOX <span class="text-[#e60012]">P5</span>
          </span>
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="status === 'connected' ? 'bg-[#10b981] shadow-[0_0_6px_#10b981] animate-pulse' : 'bg-amber-400'"
          ></span>
        </div>

        <div class="flex items-center gap-1 text-[9px] font-mono font-bold text-slate-300">
          <span class="text-emerald-400">{{ status === 'connected' ? 'LIVE' : 'SYNC' }}</span>
          <span>•</span>
          <span class="tabular-nums">{{ activeListeners }}P</span>
          <span v-if="headphoneCount > 0" class="text-emerald-400 ml-0.5">🎧 {{ headphoneCount }}</span>
        </div>
      </div>
    </div>

    <!-- Right: Role Badge + Nickname Pill -->
    <div class="flex items-center gap-1.5 shrink-0" style="transform: skewX(2deg);">
      <!-- Role Badge Button -->
      <button
        type="button"
        class="h-7 px-2 border-2 border-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer active:scale-95 shadow-[2px_2px_0px_#000]"
        :class="[
          myRole === 'host' ? 'bg-amber-400 text-black' : myRole === 'dj' ? 'bg-[#00e5ff] text-black' : 'bg-black text-white',
        ]"
        style="transform: skewX(-10deg);"
        :title="`Role: ${myRole.toUpperCase()} (Tap untuk kode DJ/Host)`"
        @click="emit('openPasscodeModal')"
      >
        <UiIcon v-if="myRole === 'host'" name="crown" :size="10" />
        <UiIcon v-else-if="myRole === 'dj'" name="mic" :size="10" />
        <UiIcon v-else name="user" :size="10" />
        <span>{{ myRole }}</span>
      </button>

      <!-- Nickname Pill Button -->
      <button
        type="button"
        class="h-7 px-2.5 bg-black border-2 border-white/60 text-white font-bold text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-[2px_2px_0px_#000]"
        style="transform: skewX(-10deg);"
        title="Ubah nama panggilan"
        @click="openEditNickname"
      >
        <span class="max-w-[90px] truncate font-medium">{{ nickname }}</span>
      </button>
    </div>

    <!-- Mobile Nickname Prompt Dialog (Persona 5 style) -->
    <div
      v-if="isNicknameModalOpen"
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      @click.self="isNicknameModalOpen = false"
    >
      <div
        class="w-full max-w-xs p-5 bg-[#0b0b14] border-4 border-white flex flex-col gap-3 shadow-[8px_8px_0px_#000]"
        style="transform: skewX(-2deg);"
      >
        <div class="flex items-center justify-between border-b-2 border-white/20 pb-2">
          <h3 class="text-xs font-black italic uppercase text-white tracking-wide flex items-center gap-1.5">
            <span class="text-[#e60012]">★</span>
            <span>SET NICKNAME</span>
          </h3>
          <button
            type="button"
            class="w-6 h-6 bg-[#e60012] text-white border border-white font-black text-xs flex items-center justify-center active:scale-90"
            @click="isNicknameModalOpen = false"
          >
            ✕
          </button>
        </div>

        <p class="text-[11px] text-slate-300 font-medium">
          Nama ini tampil saat kamu request lagu dan voting di antrean.
        </p>

        <div class="bg-black border-2 border-white p-2">
          <input
            v-model="nicknameInput"
            type="text"
            placeholder="Ketik nama kamu..."
            maxlength="20"
            autofocus
            class="w-full bg-transparent border-none outline-none text-xs text-white font-bold"
            @keyup.enter="saveNickname"
          />
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            class="px-3 py-1 bg-black border border-white/40 text-xs font-bold text-slate-300"
            @click="isNicknameModalOpen = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="px-4 py-1 bg-[#e60012] border-2 border-white text-xs font-black text-white uppercase active:scale-95 shadow-[2px_2px_0px_#000]"
            @click="saveNickname"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

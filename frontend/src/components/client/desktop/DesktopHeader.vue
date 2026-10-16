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
  (e: "openGameHub"): void;
  (e: "openRhythmModal"): void;
  (e: "openLeaderboardModal"): void;
  (e: "openTriviaModal"): void;
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
  <header
    class="shrink-0 px-4 sm:px-6 py-2.5 sm:py-3 bg-[#0b0b14] border-2 border-white flex items-center justify-between gap-4 shadow-[6px_6px_0px_#000000] relative z-30 select-none"
    style="transform: skewX(-2deg);"
  >
    <!-- Left: Brand Logo & Persona 5 Status Beacon -->
    <div class="flex items-center gap-3 min-w-0" style="transform: skewX(2deg);">
      <div
        class="w-9 h-9 border-2 border-white flex items-center justify-center bg-[#e60012] shrink-0 shadow-[2px_2px_0px_#000]"
        style="transform: skewX(-12deg);"
      >
        <img src="/logo.png" alt="Logo" class="w-full h-full object-cover p-0.5" />
      </div>

      <div class="flex flex-col min-w-0">
        <h1 class="text-sm sm:text-base font-black italic tracking-wide text-white leading-tight uppercase flex items-center gap-1.5">
          <span>ISTHISOURJUKEBOX</span>
          <span class="text-[#e60012] font-black text-xs">P5</span>
        </h1>
        <div class="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold text-slate-300">
          <span
            class="w-2 h-2 rounded-full transition-all duration-300 shrink-0"
            :class="status === 'connected' ? 'bg-[#10b981] shadow-[0_0_8px_#10b981] animate-pulse' : 'bg-amber-400'"
          ></span>
          <span>{{ status === 'connected' ? 'ON AIR' : 'RECONNECTING' }}</span>
          <span class="text-slate-600">•</span>
          <span class="text-slate-300 tabular-nums">
            {{ activeListeners }} USERS <span v-if="headphoneCount > 0" class="text-emerald-400">| 🎧 {{ headphoneCount }}</span>
          </span>
        </div>
      </div>
    </div>


    <!-- Right: Identity Capsule (Role Badge + Inline Nickname Editor) -->
    <div class="flex items-center gap-2 shrink-0" style="transform: skewX(2deg);">
      <!-- Role Badge -->
      <button
        type="button"
        class="h-8 px-3 border-2 border-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
        :class="[
          myRole === 'host' ? 'bg-amber-400 text-black' : myRole === 'dj' ? 'bg-[#00e5ff] text-black' : 'bg-black text-white',
        ]"
        style="transform: skewX(-12deg);"
        :title="`Current role: ${myRole.toUpperCase()} (Klik untuk klaim Passcode DJ/Host)`"
        @click="emit('openPasscodeModal')"
      >
        <UiIcon v-if="myRole === 'host'" name="crown" :size="12" />
        <UiIcon v-else-if="myRole === 'dj'" name="mic" :size="12" />
        <UiIcon v-else name="user" :size="12" />
        <span>{{ myRole }}</span>
      </button>

      <!-- Nickname Box -->
      <div class="nickname-wrapper">
        <button
          v-if="!isEditingNickname"
          type="button"
          class="h-8 px-3 bg-black border-2 border-white/60 hover:border-white text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-12deg);"
          title="Klik untuk ubah nama panggilan"
          @click="startEditNickname"
        >
          <span class="max-w-[120px] truncate">{{ nickname }}</span>
        </button>

        <div
          v-else
          class="h-8 px-2 bg-white/10 border-2 border-[#00e5ff] flex items-center gap-1 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-12deg);"
        >
          <input
            v-model="nicknameInput"
            type="text"
            placeholder="Your name"
            maxlength="20"
            autofocus
            class="bg-transparent border-none outline-none text-xs text-white px-1 w-[100px] font-bold"
            @keyup.enter="saveNickname"
            @keyup.escape="isEditingNickname = false"
          />
          <button
            type="button"
            class="w-5 h-5 bg-[#10b981] text-black flex items-center justify-center font-black text-xs cursor-pointer active:scale-90"
            title="Simpan"
            @click="saveNickname"
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

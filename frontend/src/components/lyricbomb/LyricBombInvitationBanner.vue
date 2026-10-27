<script setup lang="ts">
import { computed, watch } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
import UiIcon from "../UiIcon.vue";

const lbState = computed(() => jukeboxClient.lyricBombState.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);

const isInLobby = computed(() => {
  if (!lbState.value || !currentClientId.value) return false;
  return Boolean(lbState.value.players[currentClientId.value]);
});

const shouldShowBanner = computed(() => {
  return (
    jukeboxClient.isLyricBombInvitationOpen.value &&
    lbState.value?.status === "lobby" &&
    !isInLobby.value
  );
});

watch(
  shouldShowBanner,
  (visible) => {
    if (visible) {
      personaAudio.playReady();
    }
  },
  { immediate: true }
);

const emit = defineEmits<{
  (e: "join"): void;
}>();

function join() {
  personaAudio.playSelect();
  jukeboxClient.joinLyricBomb();
  jukeboxClient.isLyricBombInvitationOpen.value = false;
  emit("join");
}

function dismiss() {
  jukeboxClient.isLyricBombInvitationOpen.value = false;
}
</script>

<template>
  <div
    v-if="shouldShowBanner"
    class="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 bg-[#141424] border-2 border-[#e60012] p-4 rounded-2xl shadow-[6px_6px_0px_#000] text-slate-100 flex flex-col gap-2.5 animate-bounce-subtle"
    style="transform: skewX(-2deg);"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-[#e60012] animate-ping"></span>
        <span class="text-xs font-black italic tracking-wide text-white uppercase">
          💣 INVITATION // LYRIC BOMB
        </span>
      </div>
      <button @click="dismiss" class="text-slate-400 hover:text-white">
        <UiIcon name="x" class="w-4 h-4" />
      </button>
    </div>

    <p class="text-xs text-slate-300">
      Game <span class="text-white font-black">Lyric Bomb</span> baru dibuka di speaker kantor! Susun kata lirik sebelum bom meledak di tanganmu.
    </p>

    <div class="flex items-center gap-2 pt-1">
      <button
        @click="join"
        class="flex-1 py-1.5 px-3 bg-[#e60012] hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider border border-white rounded-lg shadow-sm"
      >
        IKUT BERMAIN SEKARANG! 🔥
      </button>
      <button
        @click="dismiss"
        class="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs uppercase rounded-lg"
      >
        Nanti
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes bounceSubtle {
  0%, 100% { transform: skewX(-2deg) translateY(0); }
  50% { transform: skewX(-2deg) translateY(-4px); }
}
.animate-bounce-subtle {
  animation: bounceSubtle 3s ease-in-out infinite;
}
</style>

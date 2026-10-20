<script setup lang="ts">
import { computed } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import UiIcon from "../UiIcon.vue";

const triviaState = computed(() => jukeboxClient.triviaState.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);

// Cek apakah pemain saat ini sudah bergabung ke lobby
const isInLobby = computed(() => {
  if (!triviaState.value || !currentClientId.value) return false;
  return Boolean(triviaState.value.players[currentClientId.value]);
});

// Tampilkan banner hanya jika status adalah "lobby", user belum gabung, dan banner belum ditutup manual
const shouldShowBanner = computed(() => {
  return (
    jukeboxClient.isTriviaLobbyInvitationOpen.value &&
    triviaState.value?.status === "lobby" &&
    !isInLobby.value
  );
});

const hostNickname = computed(() => {
  return triviaState.value?.hostNickname || jukeboxClient.triviaInvitationData.value?.hostNickname || "Host";
});

const categoryName = computed(() => {
  const catId = triviaState.value?.settings.categoryId || jukeboxClient.triviaInvitationData.value?.categoryId;
  switch (catId) {
    case "pop-indo": return "Pop Indo 2000-an";
    case "indie-indo": return "Hits Indo Terkini";
    case "rock-indo": return "Rock Indonesia";
    case "western-hits": return "Western Hits";
    case "anime-jp": return "Anime OST & J-Pop";
    case "kpop": return "K-Pop Hits";
    case "office-history": return "Riwayat Kantor";
    default: return "Lagu Hits";
  }
});

const emit = defineEmits<{
  (e: "join"): void;
}>();

function join() {
  jukeboxClient.joinTriviaLobby();
  emit("join");
}

function dismiss() {
  jukeboxClient.isTriviaLobbyInvitationOpen.value = false;
}
</script>

<template>
  <Transition
    enter-active-class="transform ease-out duration-300 transition"
    enter-from-class="-translate-y-6 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="opacity-100"
    leave-to-class="-translate-y-4 opacity-0"
  >
    <div
      v-if="shouldShowBanner"
      class="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-obsidian-900/95 via-indigo-950/90 to-fuchsia-950/95 border border-indigo-400/40 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-slate-100"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(99,102,241,0.4)] animate-bounce">
          <span class="text-xl">🎮</span>
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-black uppercase tracking-wider text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/20">Lobby Dibuka</span>
            <span class="text-xs font-bold text-white truncate">{{ hostNickname }}</span>
          </div>
          <p class="text-[11px] text-slate-300 truncate">
            Game Tebak Lagu: <strong>{{ categoryName }}</strong>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 hover:from-indigo-600 hover:to-fuchsia-700 text-white font-black text-xs shadow-md shadow-indigo-500/30 active:scale-95 transition cursor-pointer"
          @click="join"
        >
          Ikutan! 🚀
        </button>

        <button
          type="button"
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
          title="Tutup banner"
          @click="dismiss"
        >
          <UiIcon name="x" :size="14" />
        </button>
      </div>
    </div>
  </Transition>
</template>

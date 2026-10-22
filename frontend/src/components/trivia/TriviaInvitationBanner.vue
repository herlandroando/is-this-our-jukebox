<script setup lang="ts">
import { computed, watch } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
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

// Suara saat Calling Card muncul di layar
watch(
  shouldShowBanner,
  (visible) => {
    if (visible) {
      personaAudio.playReady();
    }
  },
  { immediate: true }
);

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
  personaAudio.playSelect();
  jukeboxClient.joinTriviaLobby();
  emit("join");
}

function dismiss() {
  personaAudio.playCursor();
  jukeboxClient.isTriviaLobbyInvitationOpen.value = false;
}
</script>

<template>
  <Transition
    enter-active-class="transform ease-out duration-300 transition"
    enter-from-class="-translate-y-12 scale-95 opacity-0"
    enter-to-class="translate-y-0 scale-100 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="-translate-y-8 scale-95 opacity-0"
  >
    <div
      v-if="shouldShowBanner"
      class="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-lg select-none"
    >
      <!-- Persona 5 Calling Card Envelope / Card Shape -->
      <div
        class="relative bg-[#e60012] border-3 border-white p-3 sm:p-4 shadow-[6px_6px_0px_#000000] p5-speedlines flex items-center justify-between gap-2.5 sm:gap-3 overflow-hidden"
        style="transform: skewX(-10deg) rotate(-0.5deg);"
      >
        <!-- Halftone overlay pattern -->
        <div class="absolute inset-0 opacity-15 p5-halftone-dots pointer-events-none"></div>

        <!-- Top-Left Calling Card Stamp -->
        <div
          class="absolute -top-2.5 -left-2 bg-black text-white px-2.5 py-0.5 border border-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0px_#000]"
          style="transform: skewX(-12deg) rotate(-2deg);"
        >
          ★ TAKE YOUR HEART ★
        </div>

        <!-- Left Visual: Mask / Fire Icon + Mission Briefing -->
        <div
          class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 relative z-10"
          style="transform: skewX(10deg);"
        >
          <div
            class="w-10 h-10 sm:w-11 sm:h-11 bg-black border-2 border-white flex items-center justify-center shrink-0 shadow-[3px_3px_0px_#000] text-xl"
            style="transform: rotate(-3deg);"
          >
            🎭
          </div>

          <div class="flex flex-col min-w-0 leading-tight">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="p5-cutout-black text-[10px] sm:text-[11px] font-black uppercase tracking-wider">
                CALLING CARD
              </span>
              <span class="text-white text-[11px] sm:text-xs font-black truncate drop-shadow-md">
                from {{ hostNickname }}
              </span>
            </div>
            <div class="mt-1 flex items-baseline gap-1 text-white text-xs sm:text-sm font-black truncate">
              <span class="text-black bg-white px-1 font-mono text-[10px] uppercase">TARGET</span>
              <span class="truncate uppercase tracking-wide">{{ categoryName }}</span>
            </div>
          </div>
        </div>

        <!-- Right Visual: Infiltrate CTA & Dismiss -->
        <div
          class="flex items-center gap-2 shrink-0 relative z-10"
          style="transform: skewX(10deg);"
        >
          <button
            type="button"
            class="px-3 sm:px-4 py-2 bg-black hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-150 cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95 animate-pulse"
            style="transform: skewX(-6deg);"
            @click="join"
          >
            INFILTRATE! ⚔️
          </button>

          <button
            type="button"
            class="w-7 h-7 sm:w-8 sm:h-8 bg-black/80 hover:bg-black text-white border border-white flex items-center justify-center transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:scale-90"
            title="Abaikan misi"
            @click="dismiss"
          >
            <UiIcon name="x" :size="14" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

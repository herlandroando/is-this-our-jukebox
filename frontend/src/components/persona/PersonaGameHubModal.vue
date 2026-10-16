<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from "vue";
import type { TriviaGameState } from "../../shared/types.ts";
import UiIcon from "../UiIcon.vue";
import PersonaGameCatalogView from "./PersonaGameCatalogView.vue";

const props = defineProps<{
  isOpen: boolean;
  isDjOrHost: boolean;
  triviaState?: TriviaGameState | null;
  showOsuMode?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "openTrivia"): void;
  (e: "openRhythm"): void;
  (e: "openLeaderboard"): void;
}>();

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

const isTriviaActive = computed(() => {
  return props.triviaState && props.triviaState.status !== "idle";
});

const triviaPlayerCount = computed(() => {
  if (!props.triviaState?.players) return 0;
  return Object.keys(props.triviaState.players).length;
});
</script>

<template>
  <Teleport to="body">
    <transition name="p5-modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 select-none overflow-y-auto"
      >
        <!-- Hard Comic Backdrop with Speedlines -->
        <div
          class="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
          @click="emit('close')"
        >
          <!-- Comic speedline gradient -->
          <div class="absolute inset-0 opacity-20 p5-halftone-dots"></div>
        </div>

        <!-- Main Persona 5 Modal Shell -->
        <div
          class="relative z-10 w-full max-w-3xl bg-[#0b0b14] border-4 border-white p-3.5 sm:p-6 flex flex-col gap-3.5 sm:gap-5 shadow-[6px_6px_0px_#000000] sm:shadow-[12px_12px_0px_#000000] my-auto"
          style="transform: skewX(-1.5deg);"
        >
          <!-- Red Slanted Corner Cutout / Accent Ribbon -->
          <div
            class="absolute -top-3.5 -left-2 sm:-top-4 sm:-left-4 bg-[#e60012] border-2 border-white px-3 sm:px-4 py-1 sm:py-1.5 font-black text-[11px] sm:text-sm text-white uppercase italic tracking-wider shadow-[3px_3px_0px_#000] sm:shadow-[4px_4px_0px_#000] z-20"
            style="transform: skewX(-14deg) rotate(-2deg);"
          >
            ★ ARCADE.SYS // KATALOG GAME
          </div>

          <!-- Top Navigation & Title Bar -->
          <div class="flex items-start sm:items-center justify-between gap-2.5 sm:gap-4 pt-2 sm:pt-3 border-b-2 border-white/20 pb-2.5 sm:pb-3">
            <div class="flex flex-col min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                <h2 class="text-base sm:text-2xl font-black italic uppercase text-white tracking-wider leading-tight">
                  GAME CENTER
                </h2>
                <span class="text-[#00e5ff] text-[11px] sm:text-sm font-mono tracking-widest font-normal">
                  [KATALOG_MINIGAME]
                </span>
              </div>
              <p class="text-[11px] sm:text-xs text-slate-400 font-medium line-clamp-2 mt-0.5 leading-snug">
                Pilih game seru untuk dimainkan bersama rekan kantor secara langsung!
              </p>
            </div>

            <!-- Controller Back Button Prompt (Always fully visible, shrink-0, compact on mobile) -->
            <button
              type="button"
              class="shrink-0 h-8 sm:h-9 px-2.5 sm:px-3.5 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-[11px] sm:text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000] sm:shadow-[4px_4px_0px_#000]"
              style="transform: skewX(-12deg);"
              title="Tutup & Kembali (Esc)"
              @click="emit('close')"
            >
              <span class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-current flex items-center justify-center text-[9px] sm:text-[10px] font-black">O</span>
              <span>BACK</span>
            </button>
          </div>

          <!-- Minigames Grid / Catalog Showcase -->
          <PersonaGameCatalogView
            class="overflow-y-auto max-h-[70vh] pr-1"
            :isDjOrHost="isDjOrHost"
            :triviaState="triviaState"
            :showOsuMode="showOsuMode"
            @openTrivia="emit('openTrivia'); emit('close')"
            @openRhythm="emit('openRhythm'); emit('close')"
            @openLeaderboard="emit('openLeaderboard'); emit('close')"
          />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.p5-modal-enter-active,
.p5-modal-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.p5-modal-enter-from,
.p5-modal-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(12px);
}
</style>

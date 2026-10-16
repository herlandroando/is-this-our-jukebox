<script setup lang="ts">
import { computed, useSlots, watch } from "vue";
import type { QueueTrack } from "../../shared/types.ts";
import JukeChan from "./JukeChan.vue";
import { useJukeChanMood } from "../../shared/useJukeChanMood.ts";
import { setPlaybackSync } from "../../shared/jukechan/beatDriver.ts";

const props = withDefaults(
  defineProps<{
    track?: QueueTrack | null;
    isPlaying?: boolean;
    compact?: boolean;
    fullScreen?: boolean;
    interactive?: boolean;
    showVisualizerFloor?: boolean;
    sideLayout?: boolean;
  }>(),
  {
    track: null,
    isPlaying: false,
    compact: false,
    fullScreen: false,
    interactive: true,
    showVisualizerFloor: true,
    sideLayout: false,
  }
);

const emit = defineEmits<{
  (e: "tap"): void;
}>();

const slots = useSlots();
const hasCommandsSlot = computed(() => !!slots.commands);

const {
  currentMood,
  dialogueText,
  dialogueLyric,
  isSpeaking,
  onSpeechBubbleTap,
} = useJukeChanMood();

watch(
  () => props.isPlaying,
  (playing) => {
    setPlaybackSync(!!playing);
  },
  { immediate: true }
);

function handleBubbleTap() {
  if (!props.interactive) return;
  onSpeechBubbleTap();
  emit("tap");
}
</script>

<template>
  <div
    class="jukechan-stage-root relative overflow-hidden select-none flex flex-col justify-between transition-all duration-300"
    :class="[
      fullScreen
        ? 'w-full h-full min-h-[500px] p-4 sm:p-6 rounded-none bg-gradient-to-b from-[#0b0b14] via-[#0e0f1a] to-[#07080d]'
        : compact
        ? 'p-3.5 sm:p-4 min-h-[220px] rounded-3xl border-2 border-white/20 bg-[#0c0d16]'
        : 'p-5 sm:p-6 min-h-[460px] lg:min-h-[520px] rounded-3xl border-2 border-white/30 bg-[#0c0d16]',
    ]"
    :style="{
      boxShadow: fullScreen ? 'none' : '8px 8px 0px #000000, 0 0 35px rgba(230,0,18,0.15)',
    }"
  >
    <!-- Persona 5 Halftone Comic Dot Pattern & Speedlines Backdrop -->
    <div class="pointer-events-none absolute inset-0 opacity-15 p5-halftone-dots"></div>

    <!-- Slanted Red Comic Speed Strips in Background (Persona 5 motif) -->
    <div
      class="pointer-events-none absolute -top-20 -right-20 w-96 h-[600px] bg-gradient-to-b from-[#e60012]/15 to-transparent -rotate-12 transform origin-top opacity-70"
    ></div>

    <!-- Persona 5 Top Bar: Identity & Mood Beacon -->
    <div class="pointer-events-none relative z-20 flex items-center justify-between gap-2 w-full shrink-0 mb-2">
      <!-- Left: Persona 5 Badge [IDOL // JUKE-CHAN] -->
      <div
        class="bg-[#e60012] border-2 border-white px-3 py-1 flex items-center gap-1.5 shadow-[3px_3px_0px_#000]"
        style="transform: skewX(-14deg) rotate(-1.5deg);"
      >
        <span class="w-2 h-2 bg-white rotate-45"></span>
        <span class="text-[10px] sm:text-xs font-black italic tracking-widest text-white uppercase" style="transform: skewX(14deg) rotate(1.5deg);">
          ★ PERSONA // JUKE-CHAN
        </span>
      </div>

      <!-- Right: Live Vibe Mood Badge -->
      <div class="flex items-center gap-2">
        <div
          class="bg-[#00e5ff] border-2 border-black px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-14deg) rotate(-1.5deg);"
        >
          <span style="transform: skewX(14deg) rotate(1.5deg);">{{ currentMood.badge }}</span>
        </div>

        <span
          v-if="track?.genre"
          class="hidden sm:inline-block bg-white/10 text-white border border-white/20 px-2 py-0.5 text-[10px] font-mono uppercase"
        >
          {{ track.genre }}
        </span>
      </div>
    </div>

    <!-- 1. DESKTOP FULL-STAGE MODE (2 Columns: Left = Command Ribbons, Right = Mascot & Dialogue) -->
    <div
      v-if="hasCommandsSlot && !sideLayout"
      class="relative z-20 flex-1 flex flex-row items-center gap-4 sm:gap-6 w-full min-h-0"
    >
      <!-- Left: Command Ribbons Column -->
      <div class="shrink-0 flex flex-col gap-2.5 w-[250px] sm:w-[280px] z-30">
        <slot name="commands" />
      </div>

      <!-- Right: Juke-chan Arena with Speech Bubble -->
      <div class="flex-1 flex flex-col items-center justify-between h-full min-w-0 relative z-20">
        <!-- Top Speech Bubble -->
        <div class="w-full flex flex-col items-center justify-center min-h-[76px] relative z-30 px-2">
          <transition name="p5-bubble-pop">
            <div
              v-if="isSpeaking"
              class="relative w-full max-w-[460px] cursor-pointer active:scale-[0.98] transition-transform duration-150"
              @click.stop="handleBubbleTap"
            >
              <!-- Slanted Red Banner Pointer -->
              <div
                class="absolute -top-3.5 -left-3 sm:-left-4 bg-[#e60012] border-2 border-white px-3 py-0.5 text-[10px] sm:text-xs font-black italic tracking-wider text-white uppercase shadow-[4px_4px_0px_#000] z-20 flex items-center gap-2"
                style="transform: skewX(-14deg) rotate(-2deg);"
              >
                <span class="text-white font-black">🎭</span>
                <span>DJ JUKE-CHAN</span>
              </div>

              <!-- Main Jagged Black Comic Speech Bubble -->
              <div
                class="relative bg-[#0b0b14] border-3 border-white p-3.5 sm:p-4 pt-5 shadow-[6px_6px_0px_#e60012]"
                style="transform: skewX(-2deg);"
              >
                <p class="text-xs sm:text-sm font-black text-white tracking-wide leading-snug">
                  {{ dialogueText }}
                </p>
                <p
                  v-if="dialogueLyric"
                  class="text-[11px] sm:text-xs text-[#00e5ff] italic font-bold mt-1.5 opacity-90 truncate font-mono"
                >
                  ♫ {{ dialogueLyric }}
                </p>

                <!-- Tail pointing down at Juke-chan -->
                <div
                  class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[14px] border-l-transparent border-t-[14px] border-t-white border-r-[14px] border-r-transparent"
                ></div>
                <div
                  class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-l-transparent border-t-[12px] border-t-[#0b0b14] border-r-[12px] border-r-transparent z-10"
                ></div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Center Mascot -->
        <div
          class="flex-1 flex items-center justify-center transition-transform duration-300 my-1"
          :title="`Juke-chan (${currentMood.badge}) - Klik bagian kepala, pipi, headphone, atau ahoge!`"
        >
          <JukeChan
            size="xl"
            :showSpeech="false"
            :interactive="interactive"
            @tap="emit('tap')"
          />
        </div>

        <!-- Platform & Hint -->
        <div class="w-full flex flex-col items-center gap-2 pb-1 shrink-0">
          <div
            class="persona-stage-platform w-3/4 max-w-[340px] sm:max-w-[420px] h-4 border-2 border-white transition-all duration-300 relative flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_#000]"
            style="transform: perspective(300px) rotateX(45deg) skewX(-14deg); background-color: #0b0b14;"
          >
            <div class="absolute inset-0 bg-gradient-to-r from-[#e60012] via-[#00e5ff] to-[#e60012] opacity-75 animate-pulse"></div>
          </div>
          <div
            class="bg-black/90 border border-white/30 px-3 py-0.5 text-[9px] sm:text-[10px] font-mono text-slate-300 flex items-center gap-2"
            style="transform: skewX(-8deg);"
          >
            <span class="text-[#e60012] font-black">● LIVE STAGE</span>
            <span>TAP JUKE-CHAN FOR VOICE // ALL INTERACTIONS ON STAGE</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. DESKTOP OVERLAY MODE (Vertical Stack: Top = Ribbons, Bottom = Mascot & Chat) -->
    <div
      v-else-if="hasCommandsSlot && sideLayout"
      class="relative z-20 flex-1 flex flex-col justify-start w-full min-h-0 gap-2 sm:gap-3 overflow-hidden"
    >
      <!-- Top: Command Ribbons in Stack -->
      <div class="w-full flex flex-col gap-2 z-30 shrink-0">
        <slot name="commands" />
      </div>

      <!-- Bottom: Juke-chan Arena with Speech Bubble cleanly below menu -->
      <div class="flex-1 flex flex-col items-center justify-center min-h-0 relative z-20 gap-1.5 py-1">
        <!-- Top Speech Bubble -->
        <div class="w-full flex flex-col items-center justify-center min-h-[50px] relative z-30 px-2 shrink-0">
          <transition name="p5-bubble-pop">
            <div
              v-if="isSpeaking"
              class="relative w-full max-w-[360px] cursor-pointer active:scale-[0.98] transition-transform duration-150"
              @click.stop="handleBubbleTap"
            >
              <!-- Slanted Red Banner Pointer -->
              <div
                class="absolute -top-3 -left-2 bg-[#e60012] border-2 border-white px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black italic tracking-wider text-white uppercase shadow-[3px_3px_0px_#000] z-20 flex items-center gap-1.5"
                style="transform: skewX(-14deg) rotate(-2deg);"
              >
                <span class="text-white font-black text-xs">🎭</span>
                <span>DJ JUKE-CHAN</span>
              </div>

              <!-- Main Jagged Black Comic Speech Bubble -->
              <div
                class="relative bg-[#0b0b14] border-2 border-white p-2 sm:p-2.5 pt-3 shadow-[4px_4px_0px_#e60012]"
                style="transform: skewX(-2deg);"
              >
                <p class="text-xs font-black text-white tracking-wide leading-tight">
                  {{ dialogueText }}
                </p>
                <p
                  v-if="dialogueLyric"
                  class="text-[10px] text-[#00e5ff] italic font-bold mt-1 opacity-90 truncate font-mono"
                >
                  ♫ {{ dialogueLyric }}
                </p>

                <!-- Tail pointing down at Juke-chan -->
                <div
                  class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-t-[10px] border-t-white border-r-[10px] border-r-transparent"
                ></div>
                <div
                  class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-t-[8px] border-t-[#0b0b14] border-r-[8px] border-r-transparent z-10"
                ></div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Center Mascot (MD size so it fits below ribbons without colliding) -->
        <div
          class="flex items-center justify-center transition-transform duration-300 my-1 min-h-0"
          :title="`Juke-chan (${currentMood.badge}) - Klik bagian kepala, pipi, headphone, atau ahoge!`"
        >
          <JukeChan
            size="md"
            :showSpeech="false"
            :interactive="interactive"
            @tap="emit('tap')"
          />
        </div>

        <!-- Platform & Hint -->
        <div class="w-full flex flex-col items-center gap-1 pb-1 shrink-0">
          <div
            class="persona-stage-platform w-3/4 max-w-[280px] h-3 border-2 border-white transition-all duration-300 relative flex items-center justify-center overflow-hidden shadow-[3px_3px_0px_#000]"
            style="transform: perspective(300px) rotateX(45deg) skewX(-14deg); background-color: #0b0b14;"
          >
            <div class="absolute inset-0 bg-gradient-to-r from-[#e60012] via-[#00e5ff] to-[#e60012] opacity-75 animate-pulse"></div>
          </div>
          <div
            class="bg-black/90 border border-white/30 px-2 py-0.5 text-[8px] sm:text-[9px] font-mono text-slate-300 flex items-center gap-1.5"
            style="transform: skewX(-8deg);"
          >
            <span class="text-[#e60012] font-black">● LIVE STAGE</span>
            <span>TAP JUKE-CHAN FOR VOICE</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. DEFAULT CENTERED MASCOT STAGE (For Mobile & Host views where no command slot is passed) -->
    <div v-else class="relative z-20 flex-1 flex flex-col justify-between w-full min-h-0">
      <!-- Top Comic Dialogue Box (Authentic Persona 5 Speech Bubble) -->
      <div class="relative z-30 w-full flex flex-col items-center pt-3 sm:pt-4 px-2">
        <transition name="p5-bubble-pop">
          <div
            v-if="isSpeaking"
            class="relative w-full max-w-[480px] cursor-pointer active:scale-[0.98] transition-transform duration-150"
            @click.stop="handleBubbleTap"
          >
            <!-- Slanted Red Banner Pointer (Like the red Sinful Shell banner in the Persona reference image!) -->
            <div
              class="absolute -top-3.5 -left-3 sm:-left-5 bg-[#e60012] border-2 border-white px-3 sm:px-4 py-1 text-[10px] sm:text-xs font-black italic tracking-wider text-white uppercase shadow-[4px_4px_0px_#000] z-20 flex items-center gap-2"
              style="transform: skewX(-14deg) rotate(-2deg);"
            >
              <!-- Persona 5 Mask Icon symbol -->
              <span class="text-white font-black">🎭</span>
              <span>DJ JUKE-CHAN</span>
            </div>

            <!-- Main Jagged Black Comic Speech Bubble -->
            <div
              class="relative bg-[#0b0b14] border-3 border-white p-4 sm:p-5 pt-6 shadow-[8px_8px_0px_#e60012]"
              style="transform: skewX(-2deg);"
            >
              <!-- White Action Callout Text (Manga / Persona 5 Serif styling) -->
              <p class="text-xs sm:text-sm font-black text-white tracking-wide leading-snug">
                {{ dialogueText }}
              </p>
              <p
                v-if="dialogueLyric"
                class="text-[11px] sm:text-xs text-[#00e5ff] italic font-bold mt-1.5 opacity-90 truncate font-mono"
              >
                ♫ {{ dialogueLyric }}
              </p>

              <!-- Bottom Left Jagged Speech Bubble Tail pointing at Juke-chan -->
              <div
                class="absolute -bottom-3 left-10 w-0 h-0 border-l-[14px] border-l-transparent border-t-[14px] border-t-white border-r-[14px] border-r-transparent"
              ></div>
              <div
                class="absolute -bottom-2.5 left-[42px] w-0 h-0 border-l-[12px] border-l-transparent border-t-[12px] border-t-[#0b0b14] border-r-[12px] border-r-transparent z-10"
              ></div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Center Stage Mascot (Juke-chan) -->
      <div
        class="relative z-20 flex-1 flex items-center justify-center transition-transform duration-300"
        :class="compact ? 'my-2' : fullScreen ? 'my-2' : 'my-3'"
        :title="`Juke-chan (${currentMood.badge}) - Klik bagian kepala, pipi, headphone, atau ahoge!`"
      >
        <JukeChan
          :size="fullScreen ? 'xl' : compact ? 'md' : 'lg'"
          :showSpeech="false"
          :interactive="interactive"
          @tap="emit('tap')"
        />
      </div>

      <!-- Bottom Stage Platform / Hologram Floor -->
      <div class="relative z-20 w-full flex flex-col items-center gap-2 pb-2">
        <!-- Persona 5 Angled Laser Platform -->
        <div
          class="persona-stage-platform w-3/4 max-w-[320px] sm:max-w-[420px] h-4 border-2 border-white transition-all duration-300 relative flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_#000]"
          style="transform: perspective(300px) rotateX(45deg) skewX(-14deg); background-color: #0b0b14;"
        >
          <div class="absolute inset-0 bg-gradient-to-r from-[#e60012] via-[#00e5ff] to-[#e60012] opacity-75 animate-pulse"></div>
        </div>

        <!-- Stage Micro Hint Banner -->
        <div
          class="bg-black/90 border border-white/30 px-3 py-0.5 text-[9px] sm:text-[10px] font-mono text-slate-300 flex items-center gap-2"
          style="transform: skewX(-8deg);"
        >
          <span class="text-[#e60012] font-black">● LIVE STAGE</span>
          <span>TAP JUKE-CHAN FOR VOICE // ALL INTERACTIONS ON STAGE</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.p5-bubble-pop-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.p5-bubble-pop-leave-active {
  transition: all 0.18s ease-in;
}
.p5-bubble-pop-enter-from,
.p5-bubble-pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.94);
}
</style>

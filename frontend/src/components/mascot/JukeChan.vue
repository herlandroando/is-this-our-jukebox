<script setup lang="ts">
import { computed } from "vue";
import { useJukeChanMood } from "../../shared/useJukeChanMood.ts";
import JukeChanRig from "./JukeChanRig.vue";
import JukeChanMini from "./JukeChanMini.vue";

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md" | "lg" | "xl" | "full";
    showSpeech?: boolean;
    interactive?: boolean;
  }>(),
  {
    size: "lg",
    showSpeech: true,
    interactive: true,
  }
);

const emit = defineEmits<{
  (e: "tap"): void;
}>();

const {
  currentMood,
  dialogueText,
  dialogueLyric,
  isSpeaking,
  onSpeechBubbleTap,
} = useJukeChanMood();

const sizeClasses = computed(() => {
  switch (props.size) {
    case "sm":
      return "w-9 h-9 sm:w-10 sm:h-10";
    case "md":
      return "w-56 h-72 sm:w-64 sm:h-80";
    case "xl":
      return "w-[320px] h-[390px] sm:w-[420px] sm:h-[500px] xl:w-[480px] xl:h-[570px]";
    case "full":
      return "w-full h-full max-w-[540px] max-h-[620px]";
    case "lg":
    default:
      return "w-[280px] h-[340px] sm:w-[340px] sm:h-[410px] xl:w-[380px] xl:h-[450px]";
  }
});
</script>

<template>
  <div
    class="jukechan-root relative select-none flex flex-col items-center justify-center transition-all duration-300 overflow-visible"
  >
    <!-- Speech Bubble Slot (when standalone showSpeech is enabled) -->
    <div
      v-if="showSpeech && size !== 'sm'"
      class="speech-bubble-slot w-full flex justify-center items-end mb-2 min-h-[52px] relative z-30 px-2"
    >
      <transition name="speech-pop">
        <div
          v-if="isSpeaking"
          class="speech-bubble px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl border backdrop-blur-xl text-center cursor-pointer shadow-xl transition-all duration-300 max-w-[320px] sm:max-w-[420px]"
          :style="{
            borderColor: currentMood.primary,
            boxShadow: `0 0 20px ${currentMood.primary}35`,
          }"
          @click.stop="onSpeechBubbleTap"
        >
          <span class="block text-xs sm:text-[13px] font-bold text-white tracking-wide leading-snug">
            {{ dialogueText }}
          </span>
          <span
            v-if="dialogueLyric"
            class="block text-[10px] sm:text-[11px] text-slate-300 italic font-medium mt-0.5 opacity-90 truncate"
          >
            {{ dialogueLyric }}
          </span>
        </div>
      </transition>
    </div>

    <!-- Mini Avatar Container (Size 'sm' in ReactionDock) -->
    <JukeChanMini
      v-if="size === 'sm'"
      :size-classes="sizeClasses"
      @tap="emit('tap')"
    />

    <!-- Full Live2D-style Rig Stage (Sizes 'md', 'lg', 'xl', 'full') -->
    <div
      v-else
      class="character-stage relative flex items-center justify-center"
      :class="sizeClasses"
      :style="{ '--beat-speed': currentMood.beatSpeed }"
    >
      <JukeChanRig
        :interactive="interactive"
        @zone-tap="emit('tap')"
      />
    </div>
  </div>
</template>

<style scoped>
.speech-pop-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.speech-pop-leave-active {
  transition: all 0.25s ease-in;
}
.speech-pop-enter-from,
.speech-pop-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.85);
}

.speech-bubble {
  background: rgba(18, 10, 34, 0.92);
}
</style>

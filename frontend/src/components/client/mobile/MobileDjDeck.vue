<script setup lang="ts">
import { ref } from "vue";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  isPlaying: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
  volume: number;
}>();

const emit = defineEmits<{
  (e: "togglePlay"): void;
  (e: "skip"): void;
  (e: "toggleKaraoke"): void;
  (e: "setKaraokeLevel", level: number): void;
  (e: "updateVolume", val: number): void;
}>();

const isExpanded = ref(false);
</script>

<template>
  <div class="mobile-dj-deck glass-panel bg-purple-950/30 border-purple-500/35 rounded-2xl p-2 sm:p-2.5 flex flex-col gap-2 shadow-md transition-all duration-300">
    <!-- Primary 1-Tap Transport Row (Always Visible) -->
    <div class="flex items-center justify-between gap-2">
      <!-- Left: Play/Pause + Skip -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          class="w-8 h-8 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-[0_2px_10px_rgba(255,255,255,0.3)] active:scale-90 transition-transform cursor-pointer"
          :title="isPlaying ? 'Pause' : 'Play'"
          @click="emit('togglePlay')"
        >
          <UiIcon v-if="isPlaying" name="pause" :size="13" />
          <UiIcon v-else name="play" :size="13" style="margin-left: 1px" />
        </button>

        <button
          class="btn-secondary h-8 px-2.5 text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-90 shadow-sm"
          title="Skip to next track"
          @click="emit('skip')"
        >
          <span>Next</span>
          <UiIcon name="skip-forward" :size="11" />
        </button>
      </div>

      <!-- Center: Vocal Cut Switch -->
      <div class="flex items-center gap-1.5 glass-pill px-2 py-1 shadow-sm">
        <span class="text-[10px] font-bold text-pink-300 flex items-center gap-1">
          <UiIcon name="mic" :size="10" />
          <span>Vocal Cut</span>
        </span>
        <div
          class="spring-switch scale-90 cursor-pointer"
          :class="{ active: karaokeEnabled }"
          @click="emit('toggleKaraoke')"
        >
          <div class="spring-switch-thumb"></div>
        </div>
      </div>

      <!-- Right: Expand / Collapse Drawer Toggle Button -->
      <button
        class="h-8 px-2.5 rounded-xl glass-pill flex items-center gap-1 text-[11px] font-semibold text-purple-300 hover:text-white border-purple-500/30 active:scale-95 transition-all cursor-pointer shrink-0"
        :title="isExpanded ? 'Collapse DJ controls' : 'Adjust volume & sliders'"
        @click="isExpanded = !isExpanded"
      >
        <UiIcon name="sliders" :size="11" />
        <span>{{ isExpanded ? 'Hide' : 'Sliders' }}</span>
        <UiIcon :name="isExpanded ? 'chevron-up' : 'chevron-down'" :size="10" />
      </button>
    </div>

    <!-- Expandable Sliders Drawer (Room Volume & Vocal Cut Level) -->
    <transition name="drawer">
      <div v-if="isExpanded" class="pt-2 border-t border-purple-500/20 flex flex-col gap-2.5">
        <!-- Room Volume Slider -->
        <div class="flex items-center gap-2.5 glass-pill px-3 py-1.5 shadow-inner">
          <UiIcon name="volume-2" :size="12" class="text-slate-400 shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            :value="volume"
            class="flex-1 accent-indigo-500 cursor-pointer h-1.5"
            @input="(e) => emit('updateVolume', Number((e.target as HTMLInputElement).value))"
          />
          <span class="text-[11px] font-mono tabular-nums text-slate-300 w-8 text-right font-bold">{{ volume }}%</span>
        </div>

        <!-- Vocal Cut Level Slider (When Karaoke Active) -->
        <div v-if="karaokeEnabled" class="flex items-center gap-2.5 glass-pill px-3 py-1.5 shadow-inner">
          <span class="text-[10px] text-pink-300 font-bold shrink-0">Cut</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            :value="karaokeLevel"
            class="flex-1 accent-pink-500 cursor-pointer h-1.5"
            @input="(e) => emit('setKaraokeLevel', Number((e.target as HTMLInputElement).value))"
          />
          <span class="text-[11px] font-mono tabular-nums text-pink-300 w-8 text-right font-bold">{{ karaokeLevel }}%</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.22s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>

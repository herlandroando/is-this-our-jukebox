<script setup lang="ts">
import { computed } from "vue";
import type { HeadphoneSyncStatus } from "../shared/useHeadphoneAudio.ts";
import UiIcon from "./UiIcon.vue";

const props = withDefaults(
  defineProps<{
    isTunedIn: boolean;
    isMuted: boolean;
    personalVolume: number;
    syncStatus: HeadphoneSyncStatus;
    driftMs: number;
    hasTrack: boolean;
    isPlaying: boolean;
    compact?: boolean;
    allowRemoteAudio?: boolean;
  }>(),
  {
    compact: false,
    allowRemoteAudio: true,
  }
);

const emit = defineEmits<{
  (e: "tuneIn"): void;
  (e: "tuneOut"): void;
  (e: "toggleMute"): void;
  (e: "setVolume", volume: number): void;
}>();

const statusColor = computed(() => {
  switch (props.syncStatus) {
    case "synced":
      return "text-emerald-400 bg-emerald-500/15 border-emerald-500/40";
    case "adjusting":
      return "text-amber-300 bg-amber-500/15 border-amber-500/40";
    case "connecting":
      return "text-indigo-300 bg-indigo-500/15 border-indigo-500/40";
    case "paused":
      return "text-slate-400 bg-white/10 border-white/15";
    case "error":
      return "text-rose-400 bg-rose-500/15 border-rose-500/40";
    default:
      return "text-slate-400 bg-white/10 border-white/15";
  }
});

const statusLabel = computed(() => {
  switch (props.syncStatus) {
    case "synced":
      return `Synced (${Math.abs(props.driftMs)}ms)`;
    case "adjusting":
      return "Re-aligning...";
    case "connecting":
      return "Buffering...";
    case "paused":
      return "Room Paused";
    case "error":
      return "Reconnecting...";
    default:
      return "Ready";
  }
});
</script>

<template>
  <!-- 1. COMPACT / MINI MODE (For floating persistent player or headers) -->
  <div
    v-if="compact"
    class="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl glass-panel bg-slate-900/90 border-emerald-500/35 shadow-lg backdrop-blur-md"
  >
    <div class="relative flex items-center justify-center text-emerald-400">
      <UiIcon :name="isMuted ? 'volume-x' : 'headphones'" :size="15" />
      <span
        v-if="isTunedIn && isPlaying && !isMuted"
        class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping"
      ></span>
    </div>

    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-bold text-emerald-300">Headphones</span>
        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full border" :class="statusColor">
          {{ statusLabel }}
        </span>
      </div>
    </div>

    <!-- Personal Mute Button -->
    <button
      class="glass-pill w-7 h-7 flex items-center justify-center active:scale-90 transition-transform cursor-pointer ml-auto"
      :class="isMuted ? 'text-amber-400 bg-amber-400/20 border-amber-400/40' : 'text-emerald-300 hover:text-emerald-200'"
      :title="isMuted ? 'Unmute Headphones' : 'Mute Headphones'"
      @click="emit('toggleMute')"
    >
      <UiIcon :name="isMuted ? 'volume-x' : 'volume-2'" :size="13" />
    </button>

    <!-- Mini Volume Slider -->
    <input
      type="range"
      min="0"
      max="100"
      :value="isMuted ? 0 : personalVolume"
      class="w-16 accent-emerald-400 cursor-pointer"
      :title="`Personal Volume: ${personalVolume}%`"
      @input="(e) => emit('setVolume', Number((e.target as HTMLInputElement).value))"
    />

    <!-- Disconnect / Leave -->
    <button
      class="w-6 h-6 rounded-full bg-white/10 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-all cursor-pointer"
      title="Stop listening on headphones"
      @click="emit('tuneOut')"
    >
      <UiIcon name="x" :size="12" />
    </button>
  </div>

  <!-- 2. FULL CARD MODE (For Now Playing section) -->
  <div v-else class="w-full">
    <!-- State A: Not Tuned In -> Invitation Banner -->
    <div
      v-if="!isTunedIn"
      class="group relative overflow-hidden p-3.5 sm:p-4 rounded-2xl glass-panel bg-gradient-to-r from-emerald-950/30 via-slate-900/40 to-teal-950/30 border border-emerald-500/25 hover:border-emerald-500/45 transition-all duration-300 flex items-center justify-between gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.3)] cursor-pointer active:scale-[0.99]"
      @click="emit('tuneIn')"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(16,185,129,0.25)] group-hover:scale-105 transition-transform"
        >
          <UiIcon name="headphones" :size="20" :strokeWidth="2" />
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5">
            <h4 class="text-xs sm:text-sm font-extrabold text-white tracking-tight">
              Listen on Headphones
            </h4>
            <span class="glass-pill px-2 py-0.2 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border-emerald-400/40">
              Silent Disco
            </span>
          </div>
          <p class="text-[11px] text-slate-400 truncate">
            Stream in real-time sync on your phone or laptop with personal volume.
          </p>
        </div>
      </div>

      <div
        v-if="allowRemoteAudio === false"
        class="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 shrink-0"
        title="Host has paused remote headphone streaming to preserve internet bandwidth"
      >
        <UiIcon name="headphones" :size="12" />
        <span>Paused by Host</span>
      </div>
      <button
        v-else
        class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-[0_0_16px_rgba(16,185,129,0.35)] shrink-0 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
        @click.stop="emit('tuneIn')"
      >
        <span>Tune In</span>
        <UiIcon name="radio" :size="12" />
      </button>
    </div>

    <!-- State B: Tuned In -> Active Personal Audio Dock -->
    <div
      v-else
      class="relative overflow-hidden p-4 rounded-2xl glass-panel bg-gradient-to-b from-emerald-950/30 to-slate-950/50 border border-emerald-500/35 shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex flex-col gap-3 transition-all"
    >
      <!-- Top Row: Stream Status & Actions -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2.5">
          <div class="relative w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
            <UiIcon :name="isMuted ? 'volume-x' : 'headphones'" :size="16" />
            <span
              v-if="isPlaying && !isMuted"
              class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping"
            ></span>
          </div>

          <div class="flex flex-col">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-extrabold text-white">Personal Stream Active</span>
              <span
                class="glass-pill px-2 py-0.2 text-[10px] font-mono font-bold border transition-colors"
                :class="statusColor"
              >
                {{ statusLabel }}
              </span>
            </div>
            <span class="text-[11px] text-slate-400">Independent audio for your headphones</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <!-- Personal Mute/Unmute -->
          <button
            class="glass-pill px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            :class="isMuted ? 'text-amber-400 bg-amber-400/20 border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]' : 'text-slate-300 hover:text-white'"
            :title="isMuted ? 'Unmute personal headphones' : 'Mute personal headphones'"
            @click="emit('toggleMute')"
          >
            <UiIcon :name="isMuted ? 'volume-x' : 'volume-2'" :size="13" />
            <span>{{ isMuted ? 'Muted' : 'Mute' }}</span>
          </button>

          <!-- Disconnect Button -->
          <button
            class="glass-pill px-2.5 py-1 text-xs font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/20 hover:border-rose-400/40 transition-all cursor-pointer flex items-center gap-1"
            title="Disconnect from headphone stream"
            @click="emit('tuneOut')"
          >
            <UiIcon name="x" :size="12" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      <!-- Bottom Row: Personal Volume Control Slider & Quick Presets -->
      <div class="flex items-center justify-between gap-3 pt-2.5 border-t border-white/5 flex-wrap">
        <div class="flex items-center gap-2 flex-1 min-w-[200px]">
          <button
            class="text-slate-400 hover:text-white transition-colors cursor-pointer"
            :title="isMuted ? 'Unmute' : 'Mute'"
            @click="emit('toggleMute')"
          >
            <UiIcon :name="isMuted || personalVolume === 0 ? 'volume-x' : personalVolume > 50 ? 'volume-2' : 'volume-1'" :size="14" />
          </button>

          <input
            type="range"
            min="0"
            max="100"
            :value="isMuted ? 0 : personalVolume"
            class="flex-1 accent-emerald-400 cursor-pointer h-1.5 bg-white/10 rounded-lg"
            @input="(e) => emit('setVolume', Number((e.target as HTMLInputElement).value))"
          />

          <span class="text-xs font-mono font-bold tabular-nums text-emerald-300 w-10 text-right">
            {{ isMuted ? '0%' : `${personalVolume}%` }}
          </span>
        </div>

        <!-- Quick Volume Presets -->
        <div class="flex items-center gap-1">
          <button
            v-for="preset in [30, 60, 85, 100]"
            :key="preset"
            class="glass-pill px-2 py-0.5 text-[10px] font-mono font-medium transition-all cursor-pointer"
            :class="!isMuted && personalVolume === preset ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/50' : 'text-slate-400 hover:text-slate-200'"
            @click="() => { if (isMuted) emit('toggleMute'); emit('setVolume', preset); }"
          >
            {{ preset }}%
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QueueTrack } from "../../../shared/types.ts";
import SeekBar from "../../SeekBar.vue";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  track: QueueTrack | null;
  isPlaying: boolean;
  isDjOrHost: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
  currentTime: number;
  duration: number;
  isFavorite: boolean;
  isTunedIn: boolean;
  isMuted: boolean;
}>();

const emit = defineEmits<{
  (e: "toggleFavorite"): void;
  (e: "openLyrics"): void;
  (e: "seek", time: number): void;
  (e: "lockedSeekClick"): void;
  (e: "tuneIn"): void;
  (e: "tuneOut"): void;
}>();

const displayArtist = computed(() => {
  const a = props.track?.artist;
  if (!a || /^\d+:\d{2}(:\d{2})?$/.test(a.trim())) {
    const t = props.track?.title || "";
    if (t.includes(" - ")) {
      const parts = t.split(" - ");
      return parts[0].trim();
    }
    return "YouTube Music";
  }
  return a;
});
</script>

<template>
  <section class="mobile-now-playing-card glass-panel relative overflow-hidden p-3 rounded-2xl flex flex-col gap-2 shadow-lg border-white/10">
    <!-- Ambient Dynamic Backlight Projection -->
    <div
      class="ambient-glow"
      :style="{
        backgroundImage: track?.thumbnail ? `url(${track.thumbnail})` : 'none',
        opacity: isPlaying ? '0.4' : '0.15'
      }"
    ></div>

    <!-- Main Card Body -->
    <div class="relative z-10 flex flex-col gap-2">
      <!-- Unified Compact Track Row -->
      <div class="flex items-center gap-2.5">
        <!-- Vinyl Artwork Container -->
        <div class="vinyl-wrapper relative shrink-0" :class="{ 'is-playing': isPlaying }">
          <div class="vinyl-art w-12 h-12 rounded-xl overflow-hidden bg-black/60 shadow-md border border-white/10 relative">
            <img
              v-if="track?.thumbnail"
              :src="track.thumbnail"
              :alt="track.title"
              class="w-full h-full object-cover select-none"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-500 bg-obsidian-850">
              <UiIcon name="disc" :size="20" strokeWidth="1.2" class="empty-disc-icon" />
            </div>
          </div>
        </div>

        <!-- Track Info + Meta -->
        <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <!-- Micro Meta Line: Requester + Live Beacon + Karaoke -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <span v-if="track?.requestedBy" class="text-[10px] font-semibold text-indigo-300 truncate max-w-[130px] flex items-center gap-1">
              <UiIcon name="user" :size="9" />
              <span>{{ track.requestedBy }}</span>
            </span>
            <span v-else class="text-[10px] font-semibold text-emerald-300 flex items-center gap-1">
              <UiIcon name="sparkles" :size="9" />
              <span>Auto-Radio</span>
            </span>

            <span
              v-if="karaokeEnabled"
              class="px-1.5 py-0.2 rounded-full text-[9px] font-bold text-pink-300 bg-pink-500/15 border border-pink-500/35 flex items-center gap-1"
            >
              <span class="w-1 h-1 rounded-full bg-pink-400 animate-pulse"></span>
              <span>Karaoke {{ karaokeLevel }}%</span>
            </span>

            <span
              v-if="isPlaying"
              class="px-1.5 py-0.2 rounded-full text-[8px] font-black text-emerald-400 border border-emerald-500/40 uppercase ml-auto tracking-wider"
            >
              LIVE
            </span>
          </div>

          <!-- Title & Artist -->
          <h2 class="text-xs sm:text-sm font-extrabold tracking-tight text-white truncate leading-snug" :title="track?.title || 'No track playing'">
            {{ track?.title || "No track playing" }}
          </h2>
          <p class="text-[11px] text-slate-400 truncate font-medium">
            {{ track ? displayArtist : "Office speakers are resting" }}
          </p>
        </div>

        <!-- Compact Right Quick Actions on Mobile -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- Tune-In Button -->
          <button
            v-if="track"
            class="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 border shadow-sm"
            :class="isTunedIn ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.35)]' : 'glass-pill text-emerald-400 hover:text-emerald-300'"
            :title="isTunedIn ? (isMuted ? 'Headphones Muted' : 'Tuned In') : 'Listen in Headphones'"
            @click="isTunedIn ? emit('tuneOut') : emit('tuneIn')"
          >
            <UiIcon :name="isTunedIn ? (isMuted ? 'volume-x' : 'headphones') : 'headphones'" :size="13" />
          </button>

          <!-- Lyrics Button -->
          <button
            v-if="track"
            class="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 border glass-pill text-purple-300 hover:text-purple-200 shadow-sm"
            :class="{ 'bg-pink-500/25 border-pink-400/60 text-pink-200 shadow-[0_0_10px_rgba(236,72,153,0.35)]': karaokeEnabled }"
            title="View Synced Lyrics"
            @click="emit('openLyrics')"
          >
            <UiIcon name="mic" :size="13" />
          </button>

          <!-- Favorite Star Button -->
          <button
            v-if="track"
            class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-90 shadow-sm"
            :class="isFavorite ? 'text-amber-400 bg-amber-400/15 border border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 'glass-pill text-slate-400 hover:text-amber-300'"
            :title="isFavorite ? 'Remove Favorite' : 'Save to Favorites'"
            @click="emit('toggleFavorite')"
          >
            <UiIcon v-if="isFavorite" name="star-filled" :size="14" />
            <UiIcon v-else name="star" :size="14" />
          </button>
        </div>
      </div>

      <!-- Scrubber Seek Bar (Compact bottom row) -->
      <div v-if="track" class="pt-1 border-t border-white/5">
        <SeekBar
          :currentTime="currentTime"
          :duration="duration || track?.duration || 0"
          :isPlaying="isPlaying"
          :canSeek="isDjOrHost"
          :compact="true"
          @seek="emit('seek', $event)"
          @lockedClick="emit('lockedSeekClick')"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ambient-glow {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(45px) saturate(1.4);
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.8s ease;
}

.vinyl-wrapper {
  perspective: 500px;
}

.vinyl-wrapper.is-playing .vinyl-art {
  box-shadow: 0 8px 20px -2px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-color: rgba(99, 102, 241, 0.35);
  animation: vinylFloat 4s ease-in-out infinite;
}

@keyframes vinylFloat {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-2px) rotate(1deg);
  }
}

.empty-disc-icon {
  animation: rotateDisc 22s linear infinite;
}

@keyframes rotateDisc {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

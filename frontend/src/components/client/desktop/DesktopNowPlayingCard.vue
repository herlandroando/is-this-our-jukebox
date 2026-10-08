<script setup lang="ts">
import { computed } from "vue";
import type { QueueTrack } from "../../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import SeekBar from "../../SeekBar.vue";
import HeadphoneTuneIn from "../../HeadphoneTuneIn.vue";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  track: QueueTrack | null;
  isPlaying: boolean;
  isDjOrHost: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
  volume: number;
  currentTime: number;
  duration: number;
  isFavorite: boolean;
  isTunedIn: boolean;
  isMuted: boolean;
  personalVolume: number;
  syncStatus: HeadphoneSyncStatus;
  driftMs: number;
  allowRemoteAudio: boolean;
}>();

const emit = defineEmits<{
  (e: "toggleFavorite"): void;
  (e: "openLyrics"): void;
  (e: "seek", time: number): void;
  (e: "lockedSeekClick"): void;
  (e: "togglePlay"): void;
  (e: "skip"): void;
  (e: "toggleKaraoke"): void;
  (e: "setKaraokeLevel", level: number): void;
  (e: "updateVolume", val: number): void;
  (e: "tuneIn"): void;
  (e: "tuneOut"): void;
  (e: "toggleMute"): void;
  (e: "setPersonalVolume", vol: number): void;
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
  <section class="desktop-now-playing-card glass-panel relative overflow-hidden p-6 rounded-3xl flex flex-col gap-4 shadow-xl border-white/10">
    <!-- Ambient Dynamic Backlight Projection -->
    <div
      class="ambient-glow"
      :style="{
        backgroundImage: track?.thumbnail ? `url(${track.thumbnail})` : 'none',
        opacity: isPlaying ? '0.45' : '0.2'
      }"
    ></div>

    <!-- Main Card Body -->
    <div class="relative z-10 flex flex-col gap-4">
      <!-- Top Meta Row -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <span v-if="track?.requestedBy" class="glass-pill px-3 py-1 text-xs font-semibold text-indigo-300 flex items-center gap-1.5 shadow-sm">
            <UiIcon name="user" :size="12" />
            <span class="truncate max-w-[200px]">{{ track.requestedBy }}</span>
          </span>
          <span v-else class="glass-pill px-3 py-1 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 shadow-sm">
            <UiIcon name="sparkles" :size="12" />
            <span>Auto-Radio Ready</span>
          </span>

          <span
            v-if="karaokeEnabled"
            class="glass-pill px-2.5 py-1 text-[11px] font-bold text-pink-300 bg-pink-500/15 border-pink-500/35 flex items-center gap-1 shadow-[0_0_10px_rgba(236,72,153,0.25)]"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_6px_#f472b6] animate-pulse"></span>
            <span>Vocal Cut {{ karaokeLevel }}%</span>
          </span>
        </div>

        <span
          v-if="isPlaying"
          class="glass-pill px-2.5 py-1 text-[10px] font-black text-emerald-400 tracking-wider uppercase border-emerald-500/40 flex items-center gap-1.5 shadow-sm"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>LIVE</span>
        </span>
      </div>

      <!-- Center Track Hero Details -->
      <div class="flex items-center gap-4">
        <!-- Vinyl Artwork Container -->
        <div class="vinyl-wrapper relative shrink-0" :class="{ 'is-playing': isPlaying }">
          <div class="vinyl-art w-24 h-24 rounded-2xl overflow-hidden bg-black/60 shadow-[0_8px_24px_rgba(0,0,0,0.6)] border border-white/10 relative">
            <img
              v-if="track?.thumbnail"
              :src="track.thumbnail"
              :alt="track.title"
              class="w-full h-full object-cover select-none"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-500 bg-obsidian-850">
              <UiIcon name="disc" :size="36" strokeWidth="1.2" class="empty-disc-icon" />
            </div>
          </div>
        </div>

        <div class="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div class="min-w-0 flex flex-col gap-0.5">
            <h2 class="text-lg font-extrabold tracking-tight text-white truncate leading-snug" :title="track?.title || 'No track playing'">
              {{ track?.title || "No track playing" }}
            </h2>
            <p class="text-sm text-slate-400 truncate font-medium">
              {{ track ? displayArtist : "Office speakers are resting. Add a track!" }}
            </p>
          </div>

          <!-- Favorite Star Button -->
          <button
            v-if="track"
            class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-90 shadow-sm"
            :class="isFavorite ? 'text-amber-400 bg-amber-400/15 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]' : 'glass-pill text-slate-400 hover:text-amber-300'"
            :title="isFavorite ? 'Remove Favorite' : 'Save to Favorites'"
            @click="emit('toggleFavorite')"
          >
            <UiIcon v-if="isFavorite" name="star-filled" :size="17" />
            <UiIcon v-else name="star" :size="17" />
          </button>
        </div>
      </div>

      <!-- Desktop Action Buttons -->
      <div v-if="track" class="grid grid-cols-2 gap-3 pt-0.5">
        <button
          class="h-11 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-95 border shadow-sm"
          :class="isTunedIn ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'glass-pill text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/40'"
          @click="isTunedIn ? emit('tuneOut') : emit('tuneIn')"
        >
          <UiIcon :name="isTunedIn ? (isMuted ? 'volume-x' : 'headphones') : 'headphones'" :size="14" />
          <span class="truncate">{{ isTunedIn ? (isMuted ? 'Muted' : 'Tuned In') : 'Listen in Headphones' }}</span>
        </button>

        <button
          class="h-11 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-95 border glass-pill text-purple-300 hover:text-purple-200 hover:border-purple-400/40 shadow-sm"
          :class="{ 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_12px_rgba(236,72,153,0.3)]': karaokeEnabled }"
          @click="emit('openLyrics')"
        >
          <UiIcon name="mic" :size="14" />
          <span>View Lyrics</span>
        </button>
      </div>

      <!-- Scrubber Seek Bar -->
      <div v-if="track" class="pt-2 border-t border-white/5">
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

      <!-- Headphone Stream Controller (When Tuned In) -->
      <div v-if="track && isTunedIn">
        <HeadphoneTuneIn
          :isTunedIn="isTunedIn"
          :isMuted="isMuted"
          :personalVolume="personalVolume"
          :syncStatus="syncStatus"
          :driftMs="driftMs"
          :hasTrack="!!track"
          :isPlaying="isPlaying"
          :allowRemoteAudio="allowRemoteAudio"
          @tuneIn="emit('tuneIn')"
          @tuneOut="emit('tuneOut')"
          @toggleMute="emit('toggleMute')"
          @setVolume="emit('setPersonalVolume', $event)"
        />
      </div>

      <!-- DJ & Host Studio Control Dock (Spacious Desktop) -->
      <div v-if="isDjOrHost && track" class="p-4 rounded-2xl bg-purple-950/25 border border-purple-500/30 flex flex-col gap-3 shadow-inner">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-purple-300 text-xs font-bold uppercase tracking-wider">
            <UiIcon name="mic" :size="12" />
            <span>DJ REMOTE ACTIVE</span>
          </div>
          <span class="text-[11px] text-purple-400/80 font-medium">Room audio controls</span>
        </div>

        <!-- Tier 1: Primary Transport Controls -->
        <div class="flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2">
            <button
              class="w-11 h-11 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-[0_4px_16px_rgba(255,255,255,0.3)] active:scale-95 transition-transform cursor-pointer"
              :title="isPlaying ? 'Pause' : 'Play'"
              @click="emit('togglePlay')"
            >
              <UiIcon v-if="isPlaying" name="pause" :size="16" />
              <UiIcon v-else name="play" :size="16" style="margin-left: 2px" />
            </button>

            <button
              class="btn-secondary h-10 px-4 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
              @click="emit('skip')"
            >
              <span>Next</span>
              <UiIcon name="skip-forward" :size="12" />
            </button>
          </div>

          <!-- Karaoke Toggle Switch -->
          <div class="flex items-center gap-2 glass-pill px-3 py-1.5 shadow-sm">
            <span class="text-xs font-semibold text-slate-300 flex items-center gap-1">
              <UiIcon name="mic" :size="11" />
              <span>Vocal Cut</span>
            </span>
            <div
              class="spring-switch cursor-pointer"
              :class="{ active: karaokeEnabled }"
              @click="emit('toggleKaraoke')"
            >
              <div class="spring-switch-thumb"></div>
            </div>
          </div>
        </div>

        <!-- Tier 2: Room Volume Slider -->
        <div class="flex items-center gap-3 glass-pill px-3 py-2 shadow-inner">
          <UiIcon name="volume-2" :size="13" class="text-slate-400 shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            :value="volume"
            class="flex-1 accent-indigo-500 cursor-pointer h-2"
            @input="(e) => emit('updateVolume', Number((e.target as HTMLInputElement).value))"
          />
          <span class="text-xs font-mono tabular-nums text-slate-300 w-9 text-right font-bold">{{ volume }}%</span>
        </div>

        <!-- Vocal Cut Level Slider (When Karaoke Active) -->
        <div v-if="karaokeEnabled" class="pt-2 border-t border-purple-500/20 flex items-center justify-between gap-3 text-xs">
          <span class="text-purple-300 font-medium">Cut: <strong class="text-pink-300 font-bold tabular-nums">{{ karaokeLevel }}%</strong></span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            :value="karaokeLevel"
            class="flex-1 accent-pink-500 cursor-pointer h-2"
            @input="(e) => emit('setKaraokeLevel', Number((e.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ambient-glow {
  position: absolute;
  inset: -25px;
  background-size: cover;
  background-position: center;
  filter: blur(55px) saturate(1.4);
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.8s ease;
}

.vinyl-wrapper {
  perspective: 600px;
}

.vinyl-wrapper.is-playing .vinyl-art {
  box-shadow: 0 12px 28px -4px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
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

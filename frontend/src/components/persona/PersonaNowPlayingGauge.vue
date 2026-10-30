<script setup lang="ts">
import { computed } from "vue";
import type { QueueTrack } from "../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../shared/useHeadphoneAudio.ts";
import UiIcon from "../UiIcon.vue";

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
  syncStatus?: HeadphoneSyncStatus;
  driftMs?: number;
  allowRemoteAudio?: boolean;
  hideHeadphoneToggle?: boolean;
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
    return "Office Jukebox";
  }
  return a;
});

const progressPercent = computed(() => {
  if (!props.duration || props.duration <= 0) return 0;
  return Math.min(100, Math.max(0, (props.currentTime / props.duration) * 100));
});

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function handleProgressClick(e: MouseEvent) {
  if (!props.isDjOrHost) {
    emit("lockedSeekClick");
    return;
  }
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  emit("seek", ratio * (props.duration || 1));
}

function handleVolumeClick(e: MouseEvent) {
  if (!props.isDjOrHost) return;
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  emit("updateVolume", Math.round(ratio * 100));
}
</script>

<template>
  <div class="persona-now-playing relative z-20 flex flex-col gap-2.5 select-none">
    <!-- Top Angled Combat Ribbon (Track Name & Artist) -->
    <div class="relative flex flex-col items-start gap-1">
      <!-- Slanted Red Track Banner (Like Sinful Shell in Persona 5) -->
      <div
        class="relative max-w-full overflow-hidden bg-[#e60012] border-2 border-white px-4 py-1.5 flex items-center gap-3 transition-transform duration-200"
        style="transform: skewX(-14deg) rotate(-1.5deg); box-shadow: 5px 5px 0px #000000;"
      >
        <!-- Icon -->
        <span class="w-2.5 h-2.5 bg-white shrink-0 animate-pulse" style="transform: rotate(45deg);"></span>
        
        <div class="flex items-center gap-2 min-w-0" style="transform: skewX(14deg) rotate(1.5deg);">
          <span class="text-xs sm:text-sm font-black italic tracking-wide text-white uppercase truncate max-w-[280px] sm:max-w-[360px]">
            {{ track ? track.title : 'RADIO SILENCE // STANDBY' }}
          </span>
          <span
            v-if="isPlaying"
            class="px-1.5 py-0.2 rounded text-[9px] font-mono font-black bg-white text-[#e60012] uppercase tracking-wider shrink-0"
          >
            ACTIVE
          </span>
        </div>
      </div>

      <!-- Secondary Cyan Artist Banner (Like Satanael nameplate) -->
      <div
        class="relative bg-[#00e5ff] border-2 border-black px-3 py-0.5 flex items-center gap-2 ml-4 -mt-1"
        style="transform: skewX(-14deg) rotate(-1.5deg); box-shadow: 4px 4px 0px #000000;"
      >
        <span class="text-[10px] sm:text-xs font-black tracking-wider text-black uppercase truncate max-w-[240px]" style="transform: skewX(14deg) rotate(1.5deg);">
          ARTIST: {{ displayArtist }}
        </span>
        <span
          v-if="track?.requestedBy"
          class="text-[9px] font-bold text-black/80 font-mono"
          style="transform: skewX(14deg) rotate(1.5deg);"
        >
          [REQ: {{ track.requestedBy }}]
        </span>
      </div>
    </div>

    <!-- Main Persona 5 Party Status Battle Box (Black Slate with Hard Red/White Borders) -->
    <div
      class="relative bg-[#0b0b14] border-2 border-white p-3.5 sm:p-4 flex flex-col gap-3"
      style="transform: skewX(-4deg); box-shadow: 6px 6px 0px #000000, 0 0 20px rgba(230,0,18,0.2);"
    >
      <!-- Gauge 1: HP (Track Playback Time) -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[11px] font-black font-mono">
          <div class="flex items-center gap-1.5 text-white">
            <span class="px-1 bg-[#10b981] text-black text-[9px] font-black rounded-xs">HP</span>
            <span class="tracking-widest">AUDIO_PROGRESS</span>
          </div>
          <span class="text-emerald-400 font-bold tabular-nums">
            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
          </span>
        </div>

        <!-- Segmented Angled Gauge Bar (Interactive Seeker) -->
        <div
          class="h-3.5 bg-black/80 border border-white/40 overflow-hidden relative"
          :class="isDjOrHost ? 'cursor-pointer hover:border-emerald-400' : 'cursor-not-allowed'"
          style="transform: skewX(-14deg);"
          @click="handleProgressClick"
        >
          <div
            class="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-150 relative"
            :style="{ width: `${progressPercent}%` }"
          >
            <!-- Highlight Gloss Wedge -->
            <div class="absolute inset-y-0 right-0 w-2 bg-white opacity-80 animate-pulse"></div>
          </div>
        </div>
      </div>

      <!-- Gauge 2: SP (Audio Master Volume & Vocal Level) -->
      <div class="flex items-center justify-between gap-4">
        <!-- SP Master Volume -->
        <div class="flex-1 flex flex-col gap-1">
          <div class="flex items-center justify-between text-[10px] font-black font-mono">
            <div class="flex items-center gap-1.5 text-white">
              <span class="px-1 bg-[#d946ef] text-white text-[9px] font-black rounded-xs">SP</span>
              <span class="tracking-wider">MASTER_VOL</span>
            </div>
            <span class="text-fuchsia-400 font-bold tabular-nums">{{ volume }}%</span>
          </div>
          <div
            class="h-2.5 bg-black/80 border border-white/30 overflow-hidden"
            :class="isDjOrHost ? 'cursor-pointer hover:border-fuchsia-400' : ''"
            style="transform: skewX(-14deg);"
            :title="isDjOrHost ? 'Klik untuk atur Master Volume' : ''"
            @click="handleVolumeClick"
          >
            <div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-150" :style="{ width: `${volume}%` }"></div>
          </div>
        </div>

        <!-- Silent Disco Headphone Pill Toggle (Client) -->
        <div v-if="!hideHeadphoneToggle" class="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            class="h-7 px-2.5 border-2 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            :class="[
              isTunedIn
                ? 'bg-[#10b981] text-black border-white shadow-[2px_2px_0px_#000]'
                : 'bg-white/10 text-white border-white/40 hover:bg-white/20',
            ]"
            style="transform: skewX(-10deg);"
            @click="isTunedIn ? emit('tuneOut') : emit('tuneIn')"
          >
            <UiIcon name="headphones" :size="11" />
            <span>{{ isTunedIn ? 'TUNED IN' : 'HEADPHONE' }}</span>
          </button>
        </div>
      </div>

      <!-- Optional Host Audio Spectrum Visualizer Slot -->
      <slot name="visualizer" />

      <!-- Bottom Combat Controls Row -->
      <div class="flex items-center justify-between gap-2 pt-1 border-t border-white/15">
        <!-- Play / Pause / Skip Combat Buttons -->
        <div class="flex items-center gap-2">
          <!-- Play / Pause -->
          <button
            type="button"
            class="h-8 px-3 border-2 border-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-transform cursor-pointer active:scale-90"
            :class="[
              isPlaying
                ? 'bg-[#e60012] text-white shadow-[3px_3px_0px_#000]'
                : 'bg-[#10b981] text-black shadow-[3px_3px_0px_#000]',
            ]"
            style="transform: skewX(-12deg);"
            :title="isDjOrHost ? (isPlaying ? 'Pause' : 'Play') : 'Hanya DJ/Host yang dapat memutar musik'"
            :aria-label="isPlaying ? 'Pause playback' : 'Start playback'"
            @click="emit('togglePlay')"
          >
            <UiIcon :name="isPlaying ? 'pause' : 'play'" :size="13" />
            <span>{{ isPlaying ? 'PAUSE' : 'PLAY' }}</span>
          </button>

          <!-- Skip -->
          <button
            v-if="isDjOrHost"
            type="button"
            class="h-8 px-2.5 bg-black border-2 border-white text-white font-black text-xs uppercase tracking-wider flex items-center gap-1 transition-transform cursor-pointer hover:bg-white/10 active:scale-90 shadow-[3px_3px_0px_#000]"
            style="transform: skewX(-12deg);"
            title="Lewati lagu (DJ/Host)"
            aria-label="Skip to next track"
            @click="emit('skip')"
          >
            <UiIcon name="skip-forward" :size="12" />
            <span>SKIP</span>
          </button>

          <!-- Karaoke Cut -->
          <button
            type="button"
            class="h-8 px-2.5 border-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-transform cursor-pointer active:scale-90"
            :class="[
              karaokeEnabled
                ? 'bg-pink-600 text-white border-white shadow-[3px_3px_0px_#000]'
                : 'bg-black text-slate-300 border-white/40 hover:text-white hover:border-white shadow-[3px_3px_0px_#000]',
            ]"
            style="transform: skewX(-12deg);"
            title="Mode Karaoke (Vocal Reducer)"
            aria-label="Toggle karaoke vocal cut"
            @click="emit('toggleKaraoke')"
          >
            <UiIcon name="mic" :size="12" />
            <span class="hidden sm:inline">VOCAL</span>
          </button>
        </div>

        <!-- Lyrics & Favorite -->
        <div class="flex items-center gap-2">
          <!-- Lyrics View shortcut -->
          <button
            type="button"
            class="h-8 px-2.5 bg-black border-2 border-white/50 hover:border-white text-white font-black text-xs uppercase flex items-center gap-1 cursor-pointer active:scale-90 shadow-[3px_3px_0px_#000]"
            style="transform: skewX(-12deg);"
            title="Buka Lirik Lagu"
            aria-label="Buka lirik lagu"
            @click="emit('openLyrics')"
          >
            <UiIcon name="music" :size="12" />
            <span class="hidden sm:inline">LYRICS</span>
          </button>

          <!-- Favorite -->
          <button
            type="button"
            class="h-8 w-8 border-2 flex items-center justify-center transition-transform cursor-pointer active:scale-90"
            :class="[
              isFavorite
                ? 'bg-amber-400 text-black border-white shadow-[3px_3px_0px_#000]'
                : 'bg-black text-white border-white/50 hover:border-white shadow-[3px_3px_0px_#000]',
            ]"
            style="transform: skewX(-12deg);"
            :title="isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'"
            :aria-label="isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'"
            @click="emit('toggleFavorite')"
          >
            <UiIcon :name="isFavorite ? 'star-filled' : 'star'" :size="13" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

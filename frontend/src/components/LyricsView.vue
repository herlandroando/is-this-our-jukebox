<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { LyricsData, QueueTrack } from "../shared/types.ts";
import { fetchLyrics } from "../shared/api.ts";
import { jukeboxClient } from "../shared/ws.ts";
import SeekBar from "./SeekBar.vue";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  track: QueueTrack | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  canSeek?: boolean;
  karaokeEnabled?: boolean;
  karaokeLevel?: number;
}>();

const emit = defineEmits<{
  (e: "seek", time: number): void;
  (e: "back"): void;
}>();

const lyricsData = ref<LyricsData | null>(null);
const isLoading = ref(false);
const viewMode = ref<"synced" | "plain">("synced");
const isCopied = ref(false);

const scrollContainerRef = ref<HTMLElement | null>(null);
const lineRefs = ref<HTMLElement[]>([]);

let abortController: AbortController | null = null;
let userIsScrolling = false;
let userScrollTimeout: ReturnType<typeof setTimeout> | null = null;

async function loadLyrics() {
  lineRefs.value = [];
  if (!props.track) {
    lyricsData.value = null;
    return;
  }

  if (abortController) abortController.abort();
  abortController = new AbortController();

  isLoading.value = true;
  try {
    const videoId =
      props.track.provider === "yt" && !props.track.id.startsWith("sc:") ? props.track.id : undefined;
    const data = await fetchLyrics(
      props.track.title,
      props.track.artist,
      {
        duration: props.track.duration,
        videoId,
      },
      abortController.signal
    );
    lyricsData.value = data;
    if (!data.synced && data.plain) {
      viewMode.value = "plain";
    } else if (data.synced) {
      viewMode.value = "synced";
      nextTick(() => {
        if (activeLineIndex.value >= 0) {
          scrollToActiveLine(activeLineIndex.value, "instant");
        }
      });
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      lyricsData.value = null;
    }
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.track?.id,
  () => {
    void loadLyrics();
  },
  { immediate: true }
);

const activeLineIndex = computed(() => {
  if (!lyricsData.value || !lyricsData.value.lines.length) return -1;
  const lines = lyricsData.value.lines;
  const time = props.currentTime;

  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) {
      active = i;
    } else {
      break;
    }
  }
  return active;
});

watch(activeLineIndex, (newIdx) => {
  if (viewMode.value !== "synced" || userIsScrolling || newIdx < 0) return;
  scrollToActiveLine(newIdx);
});

function scrollToActiveLine(idx: number, behavior: ScrollBehavior = "smooth") {
  nextTick(() => {
    const container = scrollContainerRef.value;
    const el = lineRefs.value[idx];
    if (!container || !el) return;

    const containerHeight = container.clientHeight;
    const elTop = el.offsetTop;
    const elHeight = el.clientHeight;

    const targetScroll = elTop - containerHeight / 2 + elHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior,
    });
  });
}

function handleUserScroll() {
  userIsScrolling = true;
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => {
    userIsScrolling = false;
  }, 2500);
}

function onLineClick(time: number, idx?: number) {
  if (props.canSeek) {
    emit("seek", time);
    if (idx !== undefined && idx >= 0) {
      userIsScrolling = false;
      scrollToActiveLine(idx, "smooth");
    }
  }
}

async function copyLyrics() {
  if (!lyricsData.value) return;
  const text =
    lyricsData.value.plain ||
    lyricsData.value.lines
      .map((l) => [l.text, l.romaji, l.translation].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (e) {
    console.warn("Could not copy lyrics", e);
  }
}

function toggleKaraoke() {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: !props.karaokeEnabled,
    level: props.karaokeLevel ?? 90,
  });
}

function setKaraokeLevel(level: number) {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: props.karaokeEnabled,
    level,
  });
}

onBeforeUnmount(() => {
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div class="lyrics-page relative h-full min-h-0 flex flex-col rounded-3xl glass-panel overflow-hidden border border-white/10 shadow-2xl text-slate-100">
    <!-- Ambient Backlight -->
    <div
      class="ambient-glow"
      :style="{
        backgroundImage: track?.thumbnail ? `url(${track.thumbnail})` : 'none',
        opacity: isPlaying ? '0.38' : '0.18'
      }"
    ></div>

    <!-- Lyrics Top Navigation Header -->
    <header class="relative z-10 shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-white/10 flex items-center justify-between gap-3 backdrop-blur-md bg-black/25">
      <div class="flex items-center gap-3 min-w-0">
        <!-- Back to Queue Shortcut -->
        <button
          class="glass-pill w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white shrink-0 active:scale-90 transition-transform cursor-pointer"
          title="Back to Queue"
          aria-label="Back to Queue"
          @click="emit('back')"
        >
          <UiIcon name="list-music" :size="15" />
        </button>

        <!-- Track Summary -->
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/15">
            <img v-if="track?.thumbnail" :src="track.thumbnail" class="w-full h-full object-cover" alt="" />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
              <UiIcon name="disc" :size="16" />
            </div>
          </div>
          <div class="flex flex-col min-w-0">
            <h3 class="text-xs sm:text-sm font-extrabold text-white truncate" :title="track?.title">
              {{ track?.title || "No Track Playing" }}
            </h3>
            <p class="text-[11px] text-slate-400 truncate">{{ track?.artist || "Office Speakers" }}</p>
          </div>
        </div>
      </div>

      <!-- Controls & Actions -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Karaoke / Full Text Switch -->
        <div v-if="lyricsData?.synced && lyricsData?.plain" class="glass-pill p-0.5 flex items-center text-xs">
          <button
            class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer"
            :class="viewMode === 'synced' ? 'bg-pink-500/30 text-pink-200 border border-pink-500/40 shadow-[0_0_10px_rgba(236,72,153,0.3)]' : 'text-slate-400 hover:text-white'"
            @click="viewMode = 'synced'"
          >
            Synced
          </button>
          <button
            class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer"
            :class="viewMode === 'plain' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'"
            @click="viewMode = 'plain'"
          >
            Full Text
          </button>
        </div>

        <button
          v-if="lyricsData?.lines.length || lyricsData?.plain"
          class="glass-pill px-2.5 py-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white active:scale-90 transition-all cursor-pointer"
          :title="isCopied ? 'Copied' : 'Copy lyrics'"
          @click="copyLyrics"
        >
          <UiIcon v-if="isCopied" name="check" :size="12" class="text-emerald-400" />
          <UiIcon v-else name="copy" :size="12" />
          <span class="hidden sm:inline">{{ isCopied ? "Copied" : "Copy" }}</span>
        </button>
      </div>
    </header>

    <!-- Synced Lyrics Main Canvas -->
    <main
      ref="scrollContainerRef"
      class="lyrics-canvas relative z-10 flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-[30vh] scroll-smooth text-center select-none"
      @scroll="handleUserScroll"
    >
      <!-- Loading State -->
      <div v-if="isLoading" class="min-h-[240px] my-auto flex flex-col items-center justify-center gap-3">
        <div class="w-12 h-12 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 animate-spin">
          <UiIcon name="disc" :size="24" />
        </div>
        <p class="text-xs font-semibold text-pink-300 tracking-wide uppercase">Finding Synchronized Lyrics...</p>
      </div>

      <!-- Instrumental State -->
      <div v-else-if="lyricsData?.instrumental" class="min-h-[240px] my-auto flex flex-col items-center justify-center gap-3 text-center">
        <div class="w-14 h-14 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <UiIcon name="music" :size="28" />
        </div>
        <h4 class="text-base font-bold text-white">Instrumental Track</h4>
        <p class="text-xs text-slate-400 max-w-xs">Enjoy the melody! No vocals recorded for this song.</p>
      </div>

      <!-- No Lyrics Found -->
      <div v-else-if="!lyricsData || (!lyricsData.lines.length && !lyricsData.plain)" class="min-h-[240px] my-auto flex flex-col items-center justify-center gap-3 text-center">
        <div class="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
          <UiIcon name="mic" :size="28" />
        </div>
        <h4 class="text-base font-bold text-white">No Lyrics Available</h4>
        <p class="text-xs text-slate-400 max-w-xs">
          Couldn't find synchronized lyrics for "<span class="text-slate-200">{{ track?.title }}</span>".
        </p>
      </div>

      <!-- Synced Karaoke Lines Canvas -->
      <div v-else-if="viewMode === 'synced' && lyricsData.lines.length" class="flex flex-col gap-6 sm:gap-7 max-w-md mx-auto">
        <div
          v-for="(line, idx) in lyricsData.lines"
          :key="idx"
          :ref="(el) => { if (el) lineRefs[idx] = el as HTMLElement; }"
          class="lyric-line-wrapper transition-all duration-300 cursor-pointer"
          :class="{
            'lyric-line-active text-white scale-[1.05]': idx === activeLineIndex,
            'text-slate-500 opacity-40 hover:opacity-75': idx < activeLineIndex,
            'text-slate-400 opacity-60 hover:opacity-90': idx > activeLineIndex,
            'cursor-pointer': canSeek,
          }"
          @click="onLineClick(line.time, idx)"
        >
          <div class="flex flex-col items-center gap-1">
            <span class="text-lg sm:text-2xl font-black tracking-tight leading-snug transition-transform">
              {{ line.text || "♪" }}
            </span>
            <span v-if="line.romaji" class="text-xs sm:text-sm font-semibold text-pink-300/80 tracking-wide font-mono">
              {{ line.romaji }}
            </span>
            <span v-if="line.translation" class="text-xs sm:text-sm text-slate-400 italic">
              {{ line.translation }}
            </span>
          </div>
        </div>
      </div>

      <!-- Plain Text Mode -->
      <div v-else class="max-w-md mx-auto text-left glass-panel p-5 sm:p-6 rounded-2xl bg-black/40">
        <pre class="font-sans text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{{ lyricsData.plain || lyricsData.lines.map((l) => [l.text, l.romaji, l.translation].filter(Boolean).join('\n')).join('\n\n') }}</pre>
      </div>
    </main>

    <!-- Embedded Bottom Controls & Scrubber -->
    <footer class="relative z-10 shrink-0 p-4 sm:p-5 border-t border-white/10 backdrop-blur-xl bg-black/40 flex flex-col gap-3">
      <!-- Live Scrubber -->
      <SeekBar
        :currentTime="currentTime"
        :duration="duration || track?.duration || 0"
        :isPlaying="isPlaying"
        :canSeek="canSeek"
        :compact="false"
        @seek="(t) => emit('seek', t)"
      />

      <!-- Karaoke Vocal Reducer Dock -->
      <div class="flex items-center justify-between gap-3 pt-1">
        <div class="flex items-center gap-2">
          <button
            class="glass-pill px-3 py-1 flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer"
            :class="karaokeEnabled ? 'bg-pink-500/25 border-pink-400/50 text-pink-200 shadow-[0_0_12px_rgba(236,72,153,0.35)]' : 'text-slate-400 hover:text-white'"
            @click="toggleKaraoke"
          >
            <UiIcon name="mic" :size="13" />
            <span>Karaoke Vocal Cut</span>
            <span
              v-if="karaokeEnabled"
              class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse ml-0.5"
            ></span>
          </button>
        </div>

        <div v-if="karaokeEnabled" class="flex items-center gap-2 text-xs">
          <span class="text-pink-300 font-mono text-[11px]">{{ karaokeLevel ?? 90 }}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            :value="karaokeLevel ?? 90"
            class="w-20 sm:w-28 accent-pink-500 cursor-pointer"
            @input="(e) => setKaraokeLevel(Number((e.target as HTMLInputElement).value))"
          />
        </div>

        <div class="text-[10px] text-slate-500 font-medium ml-auto">
          {{ lyricsData?.source ? `Synced via ${lyricsData.source}` : 'Synced Karaoke Engine' }}
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.ambient-glow {
  position: absolute;
  inset: -35px;
  background-size: cover;
  background-position: center;
  filter: blur(65px) saturate(1.5);
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.8s ease;
}

.lyrics-canvas::-webkit-scrollbar {
  width: 4px;
}
.lyrics-canvas::-webkit-scrollbar-track {
  background: transparent;
}
.lyrics-canvas::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
}
.lyrics-canvas::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.35);
}

.lyric-line-wrapper {
  will-change: transform, opacity;
  padding: 0.25rem 0.5rem;
  border-radius: 0.75rem;
}

.lyric-line-wrapper:hover {
  background: rgba(255, 255, 255, 0.03);
}

.lyric-line-active span:first-child {
  text-shadow: 0 0 18px rgba(244, 114, 182, 0.7), 0 0 35px rgba(236, 72, 153, 0.45);
}
</style>

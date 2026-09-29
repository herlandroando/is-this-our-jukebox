<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { LyricsData, QueueTrack } from "../shared/types.ts";
import { fetchLyrics } from "../shared/api.ts";

const props = defineProps<{
  isOpen: boolean;
  track: QueueTrack | null;
  currentTime: number;
  canSeek?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "seek", time: number): void;
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
    // Default to plain view if no synced lines
    if (!data.synced && data.plain) {
      viewMode.value = "plain";
    } else if (data.synced) {
      viewMode.value = "synced";
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
    if (props.isOpen) {
      void loadLyrics();
    }
  }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      void loadLyrics();
    }
  }
);

// Find active line index based on playback currentTime
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

// Auto-scroll to active line smoothly
watch(activeLineIndex, (newIdx) => {
  if (viewMode.value !== "synced" || userIsScrolling || newIdx < 0) return;
  void nextTick(() => {
    const el = lineRefs.value[newIdx];
    if (el && scrollContainerRef.value) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  });
});

function handleUserScroll() {
  userIsScrolling = true;
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => {
    userIsScrolling = false;
  }, 2500);
}

function onLineClick(time: number) {
  if (props.canSeek) {
    emit("seek", time);
  }
}

async function copyLyrics() {
  if (!lyricsData.value) return;
  const text =
    lyricsData.value.plain ||
    lyricsData.value.lines
      .map((l) => (l.translation ? `${l.text}\n${l.translation}` : l.text))
      .filter(Boolean)
      .join("\n");
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
  if (userScrollTimeout) clearTimeout(userScrollTimeout);
});
</script>

<template>
  <div v-if="isOpen" class="lyrics-backdrop" @click.self="emit('close')">
    <div class="lyrics-modal glass-panel">
      <!-- Ambient Glow Backdrop -->
      <div
        class="ambient-glow"
        :style="{ backgroundImage: track?.thumbnail ? `url(${track.thumbnail})` : 'none' }"
      ></div>

      <!-- Header -->
      <header class="lyrics-header">
        <div class="track-summary">
          <img v-if="track?.thumbnail" :src="track.thumbnail" class="track-mini-thumb" alt="" />
          <div class="track-meta">
            <h3 class="track-title" :title="track?.title">{{ track?.title || "No Track" }}</h3>
            <p class="track-artist">{{ track?.artist }}</p>
          </div>
        </div>

        <div class="header-actions">
          <!-- Mode switcher -->
          <div v-if="lyricsData?.synced && lyricsData?.plain" class="view-switch glass-pill">
            <button
              class="switch-btn"
              :class="{ active: viewMode === 'synced' }"
              @click="viewMode = 'synced'"
            >
              Karaoke 🎤
            </button>
            <button
              class="switch-btn"
              :class="{ active: viewMode === 'plain' }"
              @click="viewMode = 'plain'"
            >
              Full Text
            </button>
          </div>

          <button
            v-if="lyricsData?.lines.length"
            class="action-pill-btn glass-pill"
            :title="isCopied ? 'Copied to clipboard' : 'Copy lyrics'"
            @click="copyLyrics"
          >
            <span>{{ isCopied ? "✓ Copied" : "📋 Copy" }}</span>
          </button>

          <button class="btn-icon close-btn" title="Close lyrics" @click="emit('close')">✕</button>
        </div>
      </header>

      <!-- Lyrics Body -->
      <main
        ref="scrollContainerRef"
        class="lyrics-body"
        @scroll="handleUserScroll"
      >
        <!-- Loading State -->
        <div v-if="isLoading" class="status-box">
          <div class="spinner"></div>
          <p>Finding synchronized lyrics...</p>
        </div>

        <!-- Instrumental State -->
        <div v-else-if="lyricsData?.instrumental" class="status-box">
          <span class="status-icon">🎷</span>
          <h4>Instrumental Track</h4>
          <p>Enjoy the melody! No vocals recorded for this song.</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="!lyricsData || (!lyricsData.lines.length && !lyricsData.plain)" class="status-box">
          <span class="status-icon">🎵</span>
          <h4>No Lyrics Found</h4>
          <p>We couldn't locate synchronized lyrics for "{{ track?.title }}".</p>
        </div>

        <!-- Synced Karaoke Lines -->
        <div v-else-if="viewMode === 'synced' && lyricsData.lines.length" class="synced-list">
          <div
            v-for="(line, idx) in lyricsData.lines"
            :key="idx"
            :ref="(el) => { if (el) lineRefs[idx] = el as HTMLElement; }"
            class="synced-line"
            :class="{
              active: idx === activeLineIndex,
              passed: idx < activeLineIndex,
              future: idx > activeLineIndex,
              seekable: canSeek,
            }"
            @click="onLineClick(line.time)"
          >
            <div class="line-content">
              <span class="line-text">{{ line.text || "♪" }}</span>
              <span v-if="line.translation" class="line-translation">{{ line.translation }}</span>
            </div>
            <span v-if="canSeek" class="seek-hint">▶ Jump</span>
          </div>
        </div>

        <!-- Plain Lyrics Mode -->
        <div v-else class="plain-lyrics-box">
          <pre class="plain-text">{{ lyricsData.plain || lyricsData.lines.map((l) => (l.translation ? `${l.text}\n${l.translation}` : l.text)).join('\n') }}</pre>
        </div>
      </main>

      <!-- Footer Info -->
      <footer class="lyrics-footer">
        <span class="source-credit">Lyrics synced via {{ lyricsData?.source || "Unison / LRCLIB" }}</span>
        <span v-if="canSeek" class="dj-tip">💡 DJ Tip: Click any lyric line to jump audio</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.lyrics-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lyrics-modal {
  position: relative;
  width: 100%;
  max-width: 640px;
  height: 82vh;
  max-height: 720px;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: rgba(14, 16, 25, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.85);
}

.ambient-glow {
  position: absolute;
  inset: -30px;
  background-size: cover;
  background-position: center;
  filter: blur(60px) brightness(0.2);
  opacity: 0.7;
  z-index: 0;
  pointer-events: none;
}

.lyrics-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(14, 16, 25, 0.6);
  backdrop-filter: blur(10px);
}

.track-summary {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
  flex: 1;
}

.track-mini-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.track-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.track-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-artist {
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.view-switch {
  display: flex;
  padding: 0.2rem;
  gap: 0.2rem;
}

.switch-btn {
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  border-radius: var(--radius-full);
}

.switch-btn.active {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.action-pill-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.action-pill-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.close-btn {
  width: 34px;
  height: 34px;
}

.lyrics-body {
  position: relative;
  z-index: 1;
  flex: 1;
  overflow-y: auto;
  padding: 3rem 1.75rem;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
}

.status-box {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.6rem;
  color: var(--text-secondary);
  padding: 2rem;
}

.status-icon {
  font-size: 2.4rem;
}

.status-box h4 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.status-box p {
  font-size: 0.85rem;
  color: var(--text-muted);
  max-width: 300px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.synced-list {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding: 1rem 0 5rem;
}

.synced-line {
  position: relative;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: rgba(255, 255, 255, 0.35);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.line-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
}

.line-translation {
  font-size: 0.55em;
  font-weight: 500;
  opacity: 0.65;
  color: var(--text-secondary, #94a3b8);
  letter-spacing: normal;
}

.synced-line.passed {
  color: rgba(255, 255, 255, 0.28);
  filter: blur(0.2px);
}

.synced-line.active {
  color: #fff;
  font-size: 1.6rem;
  transform: scale(1.02);
  transform-origin: left center;
  text-shadow: 0 0 24px rgba(255, 255, 255, 0.4), 0 0 40px var(--accent-glow);
  background: rgba(255, 255, 255, 0.05);
}

.synced-line.future {
  color: rgba(255, 255, 255, 0.38);
}

.synced-line.seekable {
  cursor: pointer;
}

.synced-line.seekable:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.seek-hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent-primary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  padding: 0.15rem 0.5rem;
  background: rgba(99, 102, 241, 0.15);
  border-radius: var(--radius-full);
}

.synced-line.seekable:hover .seek-hint {
  opacity: 1;
}

.plain-lyrics-box {
  padding: 1rem 0.5rem;
}

.plain-text {
  font-family: inherit;
  font-size: 1.05rem;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.lyrics-footer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.4rem;
  background: rgba(14, 16, 25, 0.75);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.dj-tip {
  color: #c084fc;
  font-weight: 600;
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import type { AudioProvider, SearchResult } from "../shared/types.ts";
import { searchTracks } from "../shared/api.ts";
import { jukeboxClient } from "../shared/ws.ts";

const props = defineProps<{
  isOpen: boolean;
  nickname: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const query = ref("");
const activeProvider = ref<AudioProvider | "all">("all");
const results = ref<SearchResult[]>([]);
const isSearching = ref(false);
const requestedIds = ref<Set<string>>(new Set());
const searchInputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

function performSearch() {
  if (abortController) {
    abortController.abort();
  }
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    isSearching.value = false;
    return;
  }

  isSearching.value = true;
  abortController = new AbortController();

  const provider = activeProvider.value === "all" ? undefined : activeProvider.value;

  void (async () => {
    try {
      const list = await searchTracks(q, provider, abortController?.signal);
      results.value = list;
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.warn("[search] error:", e);
      }
    } finally {
      isSearching.value = false;
    }
  })();
}

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(performSearch, 300);
});

watch(activeProvider, () => {
  performSearch();
});

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      setTimeout(() => searchInputRef.value?.focus(), 150);
    } else {
      query.value = "";
      results.value = [];
      requestedIds.value.clear();
    }
  }
);

function requestTrack(track: SearchResult) {
  requestedIds.value.add(track.id);
  jukeboxClient.send({
    type: "requestTrack",
    track,
    nickname: props.nickname,
  });
}

function formatDuration(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-content glass-panel">
      <header class="modal-header">
        <div class="search-input-wrapper glass-pill">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref="searchInputRef"
            v-model="query"
            type="text"
            placeholder="Search songs, artists, or paste title..."
            class="search-input"
          />
          <button v-if="query" class="clear-btn" @click="query = ''">✕</button>
        </div>

        <button class="btn-icon close-btn" @click="emit('close')">✕</button>
      </header>

      <!-- Provider Tabs -->
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeProvider === 'all' }"
          @click="activeProvider = 'all'"
        >
          All Sources
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeProvider === 'yt' }"
          @click="activeProvider = 'yt'"
        >
          YouTube Music
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeProvider === 'sc' }"
          @click="activeProvider = 'sc'"
        >
          SoundCloud
        </button>
      </div>

      <!-- Results Body -->
      <div class="results-container">
        <div v-if="isSearching" class="loading-state">
          <div class="spinner"></div>
          <span>Searching tunes...</span>
        </div>

        <div v-else-if="results.length === 0 && query.trim()" class="empty-state">
          <p>No tracks found for "{{ query }}".</p>
          <span class="hint">Try searching with artist name or another provider.</span>
        </div>

        <div v-else-if="results.length === 0" class="hint-state">
          <p>Type any song name to search across YouTube Music and SoundCloud.</p>
        </div>

        <div v-else class="results-list">
          <div v-for="item in results" :key="item.id" class="result-item">
            <div class="thumb-wrapper">
              <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.title" class="thumb" loading="lazy" />
              <div v-else class="thumb-placeholder">🎵</div>
              <span class="provider-tag" :class="`badge-${item.provider}`">{{ item.provider.toUpperCase() }}</span>
            </div>

            <div class="info">
              <h4 class="title" :title="item.title">{{ item.title }}</h4>
              <p class="artist">{{ item.artist }}</p>
              <span v-if="item.duration" class="duration">{{ formatDuration(item.duration) }}</span>
            </div>

            <button
              class="add-btn"
              :class="{ added: requestedIds.has(item.id) }"
              :disabled="requestedIds.has(item.id)"
              @click="requestTrack(item)"
            >
              <span v-if="requestedIds.has(item.id)">Added ✓</span>
              <span v-else>+ Add</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-content {
  width: 100%;
  max-width: 620px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #0f111a;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.25rem 0.75rem;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: rgba(255, 255, 255, 0.05);
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.95rem;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.clear-btn {
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 0.2rem;
}

.clear-btn:hover {
  color: var(--text-primary);
}

.close-btn {
  flex-shrink: 0;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.tab-btn {
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 600;
}

.results-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  min-height: 280px;
}

.loading-state,
.empty-state,
.hint-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: var(--text-secondary);
  text-align: center;
  gap: 0.5rem;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.6rem 0.8rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.result-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-subtle);
}

.thumb-wrapper {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.provider-tag {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.5rem;
  font-weight: 800;
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist {
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.duration {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.add-btn {
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.add-btn:hover:not(:disabled) {
  background: var(--accent-gradient);
  border-color: transparent;
  box-shadow: 0 0 16px -2px var(--accent-glow);
}

.add-btn.added {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.35);
  color: var(--color-success);
}
</style>

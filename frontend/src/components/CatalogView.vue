<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { AudioProvider, QueueTrack, SearchFilterProvider, SearchResult, TopTrackResult } from "../shared/types.ts";
import { searchTracks, getRelatedTracks, getTopTracks, getRecentTracks } from "../shared/api.ts";
import { jukeboxClient } from "../shared/ws.ts";
import { useFavorites } from "../shared/useFavorites.ts";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  nickname: string;
  nowPlaying: QueueTrack | null;
  initialQuery?: string;
}>();

const emit = defineEmits<{
  (e: "requestTrack", track: SearchResult): void;
}>();

const { favorites, isFavorite, toggleFavorite, recordUserRecent } = useFavorites();

const query = ref(props.initialQuery || "");
const activeProvider = ref<SearchFilterProvider>("yt_music");
const isSearching = ref(false);
const searchResults = ref<SearchResult[]>([]);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Recommendations & Library Shelves
const relatedTracks = ref<SearchResult[]>([]);
const isLoadingRelated = ref(false);
const topTracks = ref<TopTrackResult[]>([]);
const isLoadingTop = ref(false);
const officeRecents = ref<SearchResult[]>([]);
const isLoadingRecents = ref(false);

const historyTab = ref<"recents" | "favorites">("recents");
const requestedIds = ref<Set<string>>(new Set());

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchAbortController: AbortController | null = null;
let relatedAbortController: AbortController | null = null;

const quickVibes = [
  { label: "Sheila On 7", query: "Sheila On 7 Dan" },
  { label: "Dewa 19", query: "Dewa 19 Kangen" },
  { label: "Queen", query: "Queen Bohemian Rhapsody" },
  { label: "Coldplay", query: "Coldplay Fix You" },
  { label: "Bruno Mars", query: "Bruno Mars Just The Way You Are" },
  { label: "Indie Indo", query: "Hindia Rumah Ke Rumah" },
  { label: "City Pop", query: "Miki Matsubara Stay With Me" },
  { label: "Anime Hits", query: "Yoasobi Idol" },
  { label: "Lofi Chill", query: "Lofi Hip Hop beats" },
];

function performSearch() {
  if (searchAbortController) {
    searchAbortController.abort();
  }
  const q = query.value.trim();
  if (!q) {
    searchResults.value = [];
    isSearching.value = false;
    return;
  }

  isSearching.value = true;
  searchAbortController = new AbortController();

  const provider = activeProvider.value;

  void (async () => {
    try {
      const list = await searchTracks(q, provider, searchAbortController?.signal);
      searchResults.value = list;
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.warn("[catalog search] error:", e);
      }
    } finally {
      isSearching.value = false;
    }
  })();
}

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(performSearch, 280);
});

watch(activeProvider, () => {
  if (query.value.trim()) {
    performSearch();
  }
});

watch(
  () => props.initialQuery,
  (val) => {
    if (val !== undefined && val !== query.value) {
      query.value = val;
      if (val.trim()) performSearch();
    }
  }
);

// Fetch shelves data
async function loadRelated() {
  if (relatedAbortController) relatedAbortController.abort();
  relatedAbortController = new AbortController();

  isLoadingRelated.value = true;
  try {
    const videoId =
      props.nowPlaying?.provider === "yt" && !props.nowPlaying?.id.startsWith("sc:")
        ? props.nowPlaying.id
        : undefined;
    const artist = props.nowPlaying?.artist;
    const list = await getRelatedTracks(videoId, artist, relatedAbortController.signal);
    relatedTracks.value = list;
  } catch (e: any) {
    if (e.name !== "AbortError") {
      console.warn("[catalog] related tracks error:", e);
    }
  } finally {
    isLoadingRelated.value = false;
  }
}

async function loadTop() {
  isLoadingTop.value = true;
  try {
    const list = await getTopTracks(20);
    topTracks.value = list;
  } catch (e) {
    console.warn("[catalog] top tracks error:", e);
  } finally {
    isLoadingTop.value = false;
  }
}

async function loadRecents() {
  isLoadingRecents.value = true;
  try {
    const list = await getRecentTracks(undefined, 20);
    officeRecents.value = list;
  } catch (e) {
    console.warn("[catalog] recents error:", e);
  } finally {
    isLoadingRecents.value = false;
  }
}

watch(
  () => props.nowPlaying?.id,
  () => {
    void loadRelated();
  }
);

onMounted(() => {
  void loadRelated();
  void loadTop();
  void loadRecents();
});

function handleRequest(track: SearchResult) {
  requestedIds.value.add(track.id);
  jukeboxClient.send({
    type: "requestTrack",
    track,
    nickname: props.nickname,
  });
  recordUserRecent(track);
  jukeboxClient.addToast(`Queued "${track.title}"`, "success");
  emit("requestTrack", track);
}

function handleToggleFavorite(track: SearchResult) {
  const added = toggleFavorite(track);
  if (added) {
    jukeboxClient.addToast("Saved to Favorites", "success");
  } else {
    jukeboxClient.addToast("Removed from Favorites", "info");
  }
}

function handleVibeClick(vibeQuery: string) {
  query.value = vibeQuery;
  performSearch();
  searchInputRef.value?.focus();
}

function clearSearch() {
  query.value = "";
  searchResults.value = [];
  searchInputRef.value?.focus();
}

function onSearchInputKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (query.value) {
      e.preventDefault();
      clearSearch();
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    const firstResultBtn = document.querySelector<HTMLElement>(
      ".search-results-section button, .shelf-card button"
    );
    firstResultBtn?.focus();
  }
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function handleImageError(e: Event, track: SearchResult) {
  const target = e.target as HTMLImageElement;
  if (!target) return;
  const cleanId = track.id.replace(/^sc:/, "");
  const fallbackUrl = `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;
  if (target.src !== fallbackUrl) {
    target.src = fallbackUrl;
  }
}
</script>

<template>
  <div class="catalog-page flex flex-col gap-5 text-slate-100">
    <!-- Sticky Search Panel with Tactile Controls (Anime Sci-Fi HUD) -->
    <div class="sticky top-2 z-20 glass-panel p-3.5 sm:p-4 rounded-3xl flex flex-col gap-3 shadow-xl backdrop-blur-2xl border-white/10">
      <!-- Sci-Fi HUD Header Tag -->
      <div class="flex items-center justify-between px-1 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400">
        <span class="flex items-center gap-1.5 text-indigo-400">
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
          <span>[CATALOG.DB // ARCHIVE_DISCOVERY]</span>
        </span>
        <span class="text-slate-500 hidden sm:inline">1-TAP FAST QUEUE</span>
      </div>

      <!-- Search Input Capsule -->
      <div class="relative flex items-center bg-obsidian-900/80 border border-white/10 rounded-2xl px-3.5 py-2.5 shadow-inner transition-all focus-within:border-indigo-400/60 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.25)]">
        <div class="text-slate-400 shrink-0 mr-2.5">
          <UiIcon name="search" :size="17" />
        </div>
        <input
          ref="searchInputRef"
          v-model="query"
          type="text"
          placeholder="Cari lagu, musisi, atau paste link YouTube/SoundCloud..."
          aria-label="Cari lagu, musisi, atau tautan audio"
          class="w-full bg-transparent border-none outline-none text-sm text-white placeholder-slate-400 font-medium search-input"
          @keydown="onSearchInputKeydown"
        />
        <span v-if="!query" class="kbd-badge ml-2 shrink-0 hidden sm:inline-flex" title="Tekan '/' untuk fokus pencarian">/</span>
        <button
          v-if="query"
          class="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center shrink-0 ml-1 active:scale-90 transition-transform cursor-pointer"
          title="Clear search (Esc)"
          aria-label="Hapus pencarian"
          @click="clearSearch"
        >
          <UiIcon name="x" :size="12" />
        </button>
      </div>

      <!-- Provider Filter Chips -->
      <div class="flex items-center justify-between gap-2 pt-0.5">
        <div class="flex items-center gap-1.5">
          <button
            class="glass-pill px-3 py-1 text-xs font-semibold transition-all active:scale-95"
            :class="activeProvider === 'yt_music' ? 'bg-red-500/25 border-red-400/50 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'text-slate-400 hover:text-white'"
            @click="activeProvider = 'yt_music'"
          >
            YT Music
          </button>
          <button
            class="glass-pill px-3 py-1 text-xs font-semibold transition-all active:scale-95"
            :class="activeProvider === 'yt_normal' ? 'bg-rose-500/20 border-rose-400/50 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.25)]' : 'text-slate-400 hover:text-white'"
            @click="activeProvider = 'yt_normal'"
          >
            YT Normal
          </button>
          <button
            class="glass-pill px-3 py-1 text-xs font-semibold transition-all active:scale-95"
            :class="activeProvider === 'sc' ? 'bg-orange-500/20 border-orange-400/50 text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.25)]' : 'text-slate-400 hover:text-white'"
            @click="activeProvider = 'sc'"
          >
            Soundcloud
          </button>
        </div>

        <div v-if="isSearching" class="flex items-center gap-1.5 text-xs text-indigo-300 animate-pulse font-medium">
          <UiIcon name="radio" :size="12" />
          <span>Searching...</span>
        </div>
      </div>
    </div>

    <!-- VIEW STATE A: Active Search Results -->
    <div v-if="query.trim().length > 0" class="search-results-section flex flex-col gap-3">
      <div class="flex items-center justify-between px-1">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <UiIcon name="search" :size="13" />
          <span>Search Results ({{ searchResults.length }})</span>
        </div>
        <button class="text-xs text-indigo-300 hover:text-indigo-200 font-semibold" @click="clearSearch">
          Back to Library
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isSearching && searchResults.length === 0" class="glass-panel p-8 rounded-3xl flex flex-col items-center justify-center gap-3 text-center">
        <div class="w-10 h-10 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-spin">
          <UiIcon name="disc" :size="22" />
        </div>
        <p class="text-xs font-medium text-slate-400">Tuning antenna and streaming results...</p>
      </div>

      <!-- No Results State -->
      <div v-else-if="!isSearching && searchResults.length === 0" class="glass-panel p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-2 border-dashed border-white/10">
        <UiIcon name="search" :size="28" class="text-slate-500 mb-1" />
        <h4 class="text-sm font-bold text-white">No tracks found</h4>
        <p class="text-xs text-slate-400 max-w-xs">
          Couldn't find anything matching "<span class="text-slate-200 font-semibold">{{ query }}</span>". Try searching for artist name or track title.
        </p>
      </div>

      <!-- Populated Results List -->
      <transition-group v-else name="list" tag="div" class="flex flex-col gap-2.5">
        <div
          v-for="track in searchResults"
          :key="track.id"
          class="glass-panel p-2.5 sm:p-3 rounded-2xl flex items-center gap-3 hover:bg-white/[0.04] transition-all"
        >
          <!-- Thumbnail with Provider Badge -->
          <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-black/50 shrink-0 border border-white/10">
            <img
              v-if="track.thumbnail"
              :src="track.thumbnail"
              :alt="track.title"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="(e) => handleImageError(e, track)"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
              <UiIcon name="disc" :size="18" />
            </div>
            <span
              class="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[8px] font-black uppercase text-white tracking-wider"
              :class="track.provider === 'yt' ? 'bg-red-600/90' : 'bg-orange-600/90'"
            >
              {{ track.provider }}
            </span>
          </div>

          <!-- Metadata -->
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <div class="text-xs sm:text-sm font-bold text-white truncate leading-snug" :title="track.title">
              {{ track.title }}
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400 truncate">
              <span class="truncate">{{ track.artist }}</span>
              <span v-if="track.duration" class="tabular-nums text-slate-500 shrink-0 font-mono">
                • {{ formatDuration(track.duration) }}
              </span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="glass-pill w-8 h-8 flex items-center justify-center active:scale-90 transition-all"
              :class="isFavorite(track.id) ? 'text-amber-400 bg-amber-400/15 border-amber-400/40' : 'text-slate-400 hover:text-amber-300'"
              :title="isFavorite(track.id) ? 'Remove Favorite' : 'Save to Favorites'"
              :aria-label="isFavorite(track.id) ? 'Remove from favorites' : 'Save to favorites'"
              @click="handleToggleFavorite(track)"
            >
              <UiIcon v-if="isFavorite(track.id)" name="star-filled" :size="13" />
              <UiIcon v-else name="star" :size="13" />
            </button>

            <button
              class="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 active:scale-95 transition-all"
              :class="requestedIds.has(track.id) ? 'bg-emerald-600/80 border-emerald-400/50 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]' : ''"
              :aria-label="requestedIds.has(track.id) ? 'Track already queued' : 'Request track ' + track.title"
              @click="handleRequest(track)"
            >
              <UiIcon v-if="requestedIds.has(track.id)" name="check" :size="12" :strokeWidth="2.5" />
              <UiIcon v-else name="plus" :size="12" :strokeWidth="2.5" />
              <span>{{ requestedIds.has(track.id) ? 'Queued' : 'Request' }}</span>
            </button>
          </div>
        </div>
      </transition-group>
    </div>

    <!-- VIEW STATE B: Multi-Shelf Music Library & Discovery (Query is Empty) -->
    <div v-else class="discovery-hub flex flex-col gap-6">
      <!-- Shelf 1: Up Next & Related to Current Song -->
      <section v-if="nowPlaying || relatedTracks.length > 0" class="flex flex-col gap-2.5">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <UiIcon name="sparkles" :size="13" />
            </div>
            <div>
              <h3 class="text-xs sm:text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                <span>Related to Now Playing</span>
                <span v-if="nowPlaying" class="text-[11px] font-normal text-slate-400 truncate max-w-[150px] sm:max-w-[220px]">
                  ({{ nowPlaying.title }})
                </span>
              </h3>
            </div>
          </div>
        </div>

        <!-- Horizontal Shelf Scroll -->
        <div class="shelf-scroll">
          <div
            v-for="track in relatedTracks"
            :key="track.id"
            class="shelf-card glass-panel w-40 sm:w-44 p-3 rounded-2xl flex flex-col gap-2 bg-gradient-to-b from-white/[0.04] to-transparent shrink-0"
          >
            <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-black/60 border border-white/10 group">
              <img
                v-if="track.thumbnail"
                :src="track.thumbnail"
                :alt="track.title"
                class="w-full h-full object-cover select-none"
                loading="lazy"
                @error="(e) => handleImageError(e, track)"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                <UiIcon name="disc" :size="28" />
              </div>
              <button
                class="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all border border-indigo-400/40"
                :title="`Request ${track.title}`"
                @click="handleRequest(track)"
              >
                <UiIcon v-if="requestedIds.has(track.id)" name="check" :size="13" :strokeWidth="2.5" />
                <UiIcon v-else name="plus" :size="13" :strokeWidth="2.5" />
              </button>
            </div>

            <div class="flex flex-col min-w-0">
              <h4 class="text-xs font-bold text-white truncate leading-tight" :title="track.title">
                {{ track.title }}
              </h4>
              <p class="text-[11px] text-slate-400 truncate mt-0.5">
                {{ track.artist }}
              </p>
              <div class="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span class="font-mono tabular-nums">{{ formatDuration(track.duration) }}</span>
                <button
                  class="hover:text-amber-400 transition-colors"
                  :class="isFavorite(track.id) ? 'text-amber-400' : 'text-slate-500'"
                  @click.stop="handleToggleFavorite(track)"
                >
                  <UiIcon v-if="isFavorite(track.id)" name="star-filled" :size="11" />
                  <UiIcon v-else name="star" :size="11" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Shelf 2: Office Top Hits (Ranked Charts) -->
      <section v-if="topTracks.length > 0" class="flex flex-col gap-2.5">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <UiIcon name="crown" :size="13" />
            </div>
            <h3 class="text-xs sm:text-sm font-extrabold tracking-tight text-white">Office Charts & Top Hits</h3>
          </div>
          <span class="text-[11px] text-slate-400 font-mono tabular-nums">{{ topTracks.length }} hits</span>
        </div>

        <div class="shelf-scroll">
          <div
            v-for="(track, index) in topTracks"
            :key="track.id"
            class="shelf-card glass-panel w-40 sm:w-44 p-3 rounded-2xl flex flex-col gap-2 shrink-0 bg-gradient-to-b from-amber-500/[0.04] to-transparent border-amber-500/15"
          >
            <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-black/60 border border-white/10">
              <img
                v-if="track.thumbnail"
                :src="track.thumbnail"
                :alt="track.title"
                class="w-full h-full object-cover select-none"
                loading="lazy"
                @error="(e) => handleImageError(e, track)"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                <UiIcon name="disc" :size="28" />
              </div>

              <!-- Rank Badge -->
              <span
                class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase flex items-center gap-1 shadow-md"
                :class="index === 0 ? 'bg-amber-400 text-black shadow-amber-400/40' : index === 1 ? 'bg-slate-300 text-black' : index === 2 ? 'bg-amber-700 text-white' : 'bg-black/70 text-slate-200 border border-white/10'"
              >
                #{{ index + 1 }}
              </span>

              <button
                class="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg active:scale-90 transition-all font-bold"
                :title="`Request ${track.title}`"
                @click="handleRequest(track)"
              >
                <UiIcon v-if="requestedIds.has(track.id)" name="check" :size="13" :strokeWidth="2.8" />
                <UiIcon v-else name="plus" :size="13" :strokeWidth="2.8" />
              </button>
            </div>

            <div class="flex flex-col min-w-0">
              <h4 class="text-xs font-bold text-white truncate leading-tight" :title="track.title">
                {{ track.title }}
              </h4>
              <p class="text-[11px] text-slate-400 truncate mt-0.5">
                {{ track.artist }}
              </p>
              <div class="flex items-center justify-between text-[10px] text-amber-300/80 mt-1 font-medium">
                <span class="tabular-nums">{{ track.playCount }} plays</span>
                <span class="font-mono text-slate-500">{{ formatDuration(track.duration) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Shelf 3: Quick Mood & Vibe Chips -->
      <section class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2 px-1">
          <div class="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <UiIcon name="music" :size="13" />
          </div>
          <h3 class="text-xs sm:text-sm font-extrabold tracking-tight text-white">Quick Mood Vibes</h3>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="vibe in quickVibes"
            :key="vibe.label"
            class="glass-pill px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-400/40 active:scale-95 transition-all flex items-center gap-1.5"
            @click="handleVibeClick(vibe.query)"
          >
            <UiIcon name="sparkles" :size="11" class="text-indigo-400" />
            <span>{{ vibe.label }}</span>
          </button>
        </div>
      </section>

      <!-- Shelf 4: History & Saved Bookmarks -->
      <section class="flex flex-col gap-3 pt-2">
        <div class="flex items-center justify-between px-1">
          <div class="glass-pill p-0.5 flex items-center gap-1 bg-white/5 border-white/10">
            <button
              class="px-3 py-1 rounded-full text-xs font-bold transition-all"
              :class="historyTab === 'recents' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'"
              @click="historyTab = 'recents'"
            >
              Office Recents ({{ officeRecents.length }})
            </button>
            <button
              class="px-3 py-1 rounded-full text-xs font-bold transition-all"
              :class="historyTab === 'favorites' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'"
              @click="historyTab = 'favorites'"
            >
              Saved Favorites ({{ favorites.length }})
            </button>
          </div>
        </div>

        <!-- Recents List -->
        <div v-if="historyTab === 'recents'" class="flex flex-col gap-2.5">
          <div v-if="officeRecents.length === 0" class="col-span-full glass-panel p-6 rounded-2xl text-center text-xs text-slate-400">
            No recently played tracks yet. Add some to get the session started!
          </div>
          <div
            v-for="track in officeRecents"
            :key="track.id"
            class="glass-panel p-2.5 rounded-2xl flex items-center gap-3 hover:bg-white/[0.03] transition-all"
          >
            <div class="w-10 h-10 rounded-xl overflow-hidden bg-black/50 shrink-0 border border-white/10">
              <img
                v-if="track.thumbnail"
                :src="track.thumbnail"
                :alt="track.title"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="(e) => handleImageError(e, track)"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                <UiIcon name="disc" :size="16" />
              </div>
            </div>

            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <div class="text-xs font-bold text-white truncate" :title="track.title">{{ track.title }}</div>
              <div class="text-[11px] text-slate-400 truncate">{{ track.artist }}</div>
            </div>

            <button
              class="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 active:scale-95"
              @click="handleRequest(track)"
            >
              <UiIcon v-if="requestedIds.has(track.id)" name="check" :size="11" />
              <UiIcon v-else name="plus" :size="11" />
              <span>{{ requestedIds.has(track.id) ? 'Queued' : 'Add' }}</span>
            </button>
          </div>
        </div>

        <!-- Favorites List -->
        <div v-else class="flex flex-col gap-2.5">
          <div v-if="favorites.length === 0" class="col-span-full glass-panel p-6 rounded-2xl text-center text-xs text-slate-400">
            You haven't favorited any tracks yet. Tap the star icon on any song to save it!
          </div>
          <div
            v-for="track in favorites"
            :key="track.id"
            class="glass-panel p-2.5 rounded-2xl flex items-center gap-3 hover:bg-white/[0.03] transition-all"
          >
            <div class="w-10 h-10 rounded-xl overflow-hidden bg-black/50 shrink-0 border border-white/10">
              <img
                v-if="track.thumbnail"
                :src="track.thumbnail"
                :alt="track.title"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="(e) => handleImageError(e, track)"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                <UiIcon name="disc" :size="16" />
              </div>
            </div>

            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <div class="text-xs font-bold text-white truncate" :title="track.title">{{ track.title }}</div>
              <div class="text-[11px] text-slate-400 truncate">{{ track.artist }}</div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button
                class="glass-pill w-7 h-7 flex items-center justify-center text-amber-400 active:scale-90"
                title="Remove from favorites"
                @click="handleToggleFavorite(track)"
              >
                <UiIcon name="trash-2" :size="12" />
              </button>
              <button
                class="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1 active:scale-95"
                @click="handleRequest(track)"
              >
                <UiIcon v-if="requestedIds.has(track.id)" name="check" :size="11" />
                <UiIcon v-else name="plus" :size="11" />
                <span>{{ requestedIds.has(track.id) ? 'Queued' : 'Add' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

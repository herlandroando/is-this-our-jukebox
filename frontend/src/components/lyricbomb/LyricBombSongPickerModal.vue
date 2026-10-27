<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
import UiIcon from "../UiIcon.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "selectSong", song: { videoId: string; title: string; artist: string; duration: number; albumArt?: string }): void;
  (e: "randomSong"): void;
}>();

const lbState = computed(() => jukeboxClient.lyricBombState.value);
const pickerTimeLeft = computed(() => lbState.value?.pickerTimeLeft ?? null);

const activeTab = ref<"office" | "search">("office");
const selectedCategory = ref<string>("Semua");
const officeFilterQuery = ref("");

const officeTracks = ref<any[]>([]);
const isLoadingOfficeTracks = ref(false);

const searchQuery = ref("");
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const searchError = ref<string | null>(null);

// Validation state when user clicks a track
const validatingTrackId = ref<string | null>(null);
const validationErrors = ref<Record<string, string>>({});

function isTestSongItem(item: any): boolean {
  if (!item) return true;
  const id = String(item.videoId || item.trackId || item.id || "").toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const artist = String(item.artist || "").toLowerCase();
  const thumb = String(item.thumbnail || "").toLowerCase();
  if (id.startsWith("test")) return true;
  if (
    title === "office chill anthem" ||
    title === "synthwave beats to focus" ||
    title.includes("lagu test") ||
    title.includes("test track") ||
    title.includes("testing")
  ) {
    return true;
  }
  if (artist === "the developers" || artist === "synthmaster" || artist === "artis test") {
    return true;
  }
  if (thumb.includes("example.com")) return true;
  return false;
}

const categories = computed(() => {
  const cats = new Set<string>(["Semua"]);
  for (const t of officeTracks.value) {
    if (t.category) cats.add(t.category);
  }
  return Array.from(cats);
});

const filteredOfficeTracks = computed(() => {
  let list = officeTracks.value;
  if (selectedCategory.value !== "Semua") {
    list = list.filter((t) => t.category === selectedCategory.value);
  }
  const q = officeFilterQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (t) =>
        String(t.title || "").toLowerCase().includes(q) ||
        String(t.artist || "").toLowerCase().includes(q)
    );
  }
  return list;
});

async function loadOfficeTracks() {
  isLoadingOfficeTracks.value = true;
  try {
    const res = await fetch("/api/lyricbomb/office-playlist");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        officeTracks.value = data
          .filter((item) => !isTestSongItem(item))
          .map((item) => ({
            id: item.videoId || item.id,
            videoId: item.videoId || item.id,
            title: item.title,
            artist: item.artist,
            duration: item.duration || 210,
            thumbnail: item.thumbnail || "",
            badge:
              item.badge ||
              (item.playCount > 1 ? `🔥 ${item.playCount}x Diputar` : "🎵 Office Playlist"),
            category:
              item.category ||
              (item.playCount >= 2 ? "Sering Diputar" : "Baru Diputar"),
          }));
        return;
      }
    }

    // Fallback to /api/tracks/top + /api/tracks/recent
    const [topRes, recentRes] = await Promise.all([
      fetch("/api/tracks/top?limit=40"),
      fetch("/api/tracks/recent?limit=30"),
    ]);
    const combined: any[] = [];
    const seenIds = new Set<string>();

    if (topRes.ok) {
      const topData = await topRes.json();
      if (Array.isArray(topData)) {
        for (const item of topData) {
          const vid = item.trackId || item.id;
          if (vid && !vid.startsWith("sc:") && !seenIds.has(vid) && !isTestSongItem(item)) {
            seenIds.add(vid);
            combined.push({
              id: vid,
              videoId: vid,
              title: item.title,
              artist: item.artist,
              duration: item.duration || 210,
              thumbnail: item.thumbnail,
              badge: item.playCount ? `🔥 ${item.playCount}x Diputar` : "Top Kantor",
              category: (item.playCount || 1) >= 2 ? "Sering Diputar" : "Baru Diputar",
            });
          }
        }
      }
    }

    if (recentRes.ok) {
      const recentData = await recentRes.json();
      if (Array.isArray(recentData)) {
        for (const item of recentData) {
          const vid = item.trackId || item.id;
          if (vid && !vid.startsWith("sc:") && !seenIds.has(vid) && !isTestSongItem(item)) {
            seenIds.add(vid);
            combined.push({
              id: vid,
              videoId: vid,
              title: item.title,
              artist: item.artist,
              duration: item.duration || 210,
              thumbnail: item.thumbnail,
              badge: "⏱️ Baru Diputar",
              category: "Baru Diputar",
            });
          }
        }
      }
    }

    officeTracks.value = combined;
  } catch (err) {
    console.warn("Failed to load office playlist for Lyric Bomb:", err);
  } finally {
    isLoadingOfficeTracks.value = false;
  }
}

let searchDebounce: any = null;
function handleSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce);
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = [];
    return;
  }
  searchDebounce = setTimeout(async () => {
    isSearching.value = true;
    searchError.value = null;
    try {
      const res = await fetch(`/api/lyricbomb/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const raw = await res.json();
        searchResults.value = Array.isArray(raw) ? raw.filter((item) => !isTestSongItem(item)) : [];
      } else {
        searchError.value = "Gagal mencari lagu. Coba lagi.";
      }
    } catch (err: any) {
      searchError.value = err?.message || "Koneksi terputus";
    } finally {
      isSearching.value = false;
    }
  }, 300);
}

function handleSurpriseMe() {
  personaAudio.playSelect();
  emit("randomSong");
}

async function chooseValidatedTrack(track: any) {
  const trackId = track.videoId || track.id;
  personaAudio.playCursor();
  validatingTrackId.value = trackId;
  delete validationErrors.value[trackId];

  try {
    const res = await fetch("/api/lyricbomb/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: trackId,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        albumArt: track.thumbnail,
      }),
    });

    const data = await res.json();
    if (data.valid && data.songInfo) {
      emit("selectSong", {
        videoId: trackId,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        albumArt: track.thumbnail,
      });
    } else {
      personaAudio.playMiss();
      validationErrors.value[trackId] =
        data.reason || "Lagu ini belum memiliki lirik tersinkronisasi waktu. Silakan pilih lagu lain.";
    }
  } catch (err: any) {
    personaAudio.playMiss();
    validationErrors.value[trackId] = "Gagal memverifikasi lirik: " + (err?.message || "Koneksi terputus");
  } finally {
    validatingTrackId.value = null;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadOfficeTracks();
    }
  }
);

onMounted(() => {
  loadOfficeTracks();
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
  >
    <div
      class="bg-[#121220] border-2 border-white w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-[8px_8px_0px_#000] overflow-hidden"
      style="transform: skewX(-1deg);"
    >
      <!-- Header -->
      <div class="p-3.5 sm:p-5 bg-[#1a1a2e] border-b-2 border-white/20 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-[#e60012] text-white flex items-center justify-center font-black border border-white text-lg shadow-sm shrink-0">
            💣
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-sm sm:text-lg font-black italic uppercase tracking-wider text-white truncate">
                Pilih Lagu Bom Lirik
              </h2>
              <span
                v-if="pickerTimeLeft !== null"
                class="px-2 py-0.5 rounded text-[10px] font-mono font-black border uppercase"
                :class="pickerTimeLeft <= 10 ? 'bg-rose-600 text-white border-white animate-pulse' : 'bg-amber-400/20 text-amber-300 border-amber-400/50'"
              >
                ⏳ {{ pickerTimeLeft }}s
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded text-[10px] font-mono font-black border uppercase bg-cyan-400/20 text-cyan-300 border-cyan-400/50"
              >
                🎧 Santai Memilih
              </span>
            </div>
            <p class="text-[11px] text-cyan-400 font-mono truncate">
              Pilih dari Office Playlist yang sudah diputar di player ini, atau cari di YouTube Music!
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            @click="handleSurpriseMe"
            class="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] uppercase tracking-wider border border-white rounded-xl shadow-[2px_2px_0px_#000] active:scale-95 transition-all cursor-pointer flex items-center gap-1"
            title="Pilihkan lagu acak dari Office Playlist secara instan"
          >
            <span>🎲</span>
            <span class="hidden sm:inline">Surprise Me</span>
          </button>

          <button
            type="button"
            @click="$emit('close')"
            class="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <UiIcon name="x" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Tab Buttons -->
      <div class="grid grid-cols-2 border-b border-white/10 bg-black/40 p-2 gap-1.5 sm:gap-2">
        <button
          type="button"
          @click="activeTab = 'office'; personaAudio.playCursor()"
          class="py-2 px-2 sm:px-3 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          :class="activeTab === 'office' ? 'bg-amber-400 text-black border border-white shadow-[2px_2px_0px_#000]' : 'text-slate-400 hover:text-white bg-white/5'"
        >
          <span>🎵 Office Playlist ({{ officeTracks.length }})</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'search'; personaAudio.playCursor()"
          class="py-2 px-2 sm:px-3 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          :class="activeTab === 'search' ? 'bg-cyan-400 text-black border border-white shadow-[2px_2px_0px_#000]' : 'text-slate-400 hover:text-white bg-white/5'"
        >
          <span>🔍 Cari Lagu Baru</span>
        </button>
      </div>

      <!-- Body / Scroll Area -->
      <div class="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
        <!-- TAB 1: OFFICE PLAYLIST -->
        <div v-if="activeTab === 'office'" class="space-y-3">
          <div class="bg-amber-950/30 border border-amber-400/30 p-2.5 rounded-xl text-[11px] text-amber-200 flex items-center justify-between gap-2">
            <span>🎵 Daftar lagu yang sudah diputar rekan kantor di player ini. Sistem akan memverifikasi liriknya otomatis!</span>
          </div>

          <!-- Filter Bar & Category Pills -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                v-for="cat in categories"
                :key="cat"
                type="button"
                @click="selectedCategory = cat; personaAudio.playCursor()"
                class="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase whitespace-nowrap border transition-all cursor-pointer"
                :class="selectedCategory === cat ? 'bg-amber-400 text-black border-white shadow-sm' : 'bg-[#181828] text-slate-300 border-white/15 hover:border-white/40'"
              >
                {{ cat }}
              </button>
            </div>

            <input
              v-model="officeFilterQuery"
              type="text"
              placeholder="Filter lagu kantor..."
              class="w-full sm:w-56 bg-[#0d0d18] border border-white/25 focus:border-amber-400 px-3 py-1.5 rounded-xl text-xs text-white placeholder-slate-500 outline-none"
            />
          </div>

          <div v-if="isLoadingOfficeTracks" class="py-12 text-center text-slate-400 font-mono text-xs">
            Memuat Office Playlist...
          </div>

          <div v-else-if="filteredOfficeTracks.length > 0" class="space-y-2">
            <div
              v-for="track in filteredOfficeTracks"
              :key="track.id"
              class="bg-[#181828] border border-white/20 hover:border-amber-400/60 p-3 rounded-xl flex flex-col gap-2 transition-all"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 overflow-hidden">
                  <img
                    v-if="track.thumbnail"
                    :src="track.thumbnail"
                    class="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0"
                    alt="art"
                  />
                  <div class="overflow-hidden">
                    <span class="text-[9px] font-mono text-amber-300 uppercase">{{ track.badge }}</span>
                    <h4 class="text-sm font-black text-white truncate">{{ track.title }}</h4>
                    <p class="text-xs text-slate-400 truncate">{{ track.artist }}</p>
                  </div>
                </div>

                <button
                  type="button"
                  :disabled="validatingTrackId === track.id"
                  @click="chooseValidatedTrack(track)"
                  class="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider shrink-0 transition-all border border-white bg-amber-400 hover:bg-amber-300 text-black cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  <span v-if="validatingTrackId === track.id" class="animate-pulse">Cek Lirik...</span>
                  <span v-else>Pilih Lagu</span>
                </button>
              </div>

              <div
                v-if="validationErrors[track.id]"
                class="bg-rose-950/50 border border-rose-500/40 p-2 rounded-lg text-[11px] text-rose-300 font-mono flex items-center gap-2"
              >
                <span>⚠️</span>
                <span>{{ validationErrors[track.id] }}</span>
              </div>
            </div>
          </div>

          <div v-else class="py-8 text-center text-slate-400 text-xs font-mono">
            Tidak ada lagu yang cocok di Office Playlist. Gunakan tab Cari Lagu Baru!
          </div>
        </div>

        <!-- TAB 2: SEARCH YOUTUBE MUSIC -->
        <div v-else class="space-y-4">
          <!-- Input -->
          <div class="relative">
            <input
              v-model="searchQuery"
              @input="handleSearchInput"
              type="text"
              placeholder="Ketik judul lagu atau artis (misal: Sheila on 7, Hindia, YOASOBI, Queen)..."
              class="w-full bg-[#0d0d18] border-2 border-white/30 focus:border-cyan-400 px-4 py-2.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
            />
            <div v-if="isSearching" class="absolute right-3 top-3 text-cyan-400 text-xs font-mono animate-pulse">
              Mencari lagu...
            </div>
          </div>

          <div class="bg-cyan-950/40 border border-cyan-500/30 p-2.5 rounded-xl text-[11px] text-cyan-300 flex items-start gap-2">
            <span class="text-sm">💡</span>
            <span>Mendukung lagu Indonesia, Barat, maupun Jepang/Anime (otomatis Romaji!). Sistem akan memvalidasi lirik saat kamu klik "Pilih Lagu".</span>
          </div>

          <!-- Results -->
          <div v-if="searchResults.length > 0" class="space-y-2.5">
            <div
              v-for="track in searchResults"
              :key="track.id"
              class="bg-[#181828] border border-white/20 hover:border-cyan-400/50 p-3 rounded-xl flex flex-col gap-2 transition-all"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 overflow-hidden">
                  <img
                    v-if="track.thumbnail"
                    :src="track.thumbnail"
                    class="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0"
                    alt="art"
                  />
                  <div class="overflow-hidden">
                    <h4 class="text-sm font-black text-white truncate">{{ track.title }}</h4>
                    <p class="text-xs text-slate-400 truncate">{{ track.artist }}</p>
                  </div>
                </div>

                <button
                  type="button"
                  :disabled="validatingTrackId === track.id"
                  @click="chooseValidatedTrack(track)"
                  class="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider shrink-0 transition-all border border-white bg-cyan-400 hover:bg-cyan-300 text-black cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  <span v-if="validatingTrackId === track.id" class="flex items-center gap-1.5 animate-pulse">
                    <span>Memeriksa lirik...</span>
                  </span>
                  <span v-else>Pilih Lagu</span>
                </button>
              </div>

              <!-- Error Reason Banner if validation fails on this song -->
              <div
                v-if="validationErrors[track.id]"
                class="bg-rose-950/50 border border-rose-500/40 p-2 rounded-lg text-[11px] text-rose-300 font-mono flex items-center gap-2"
              >
                <span>⚠️</span>
                <span>{{ validationErrors[track.id] }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="searchError" class="py-8 text-center text-rose-400 text-xs font-mono">
            {{ searchError }}
          </div>
          <div v-else-if="searchQuery.trim() && !isSearching" class="py-8 text-center text-slate-400 text-xs font-mono">
            Tidak ada lagu ditemukan. Coba kata kunci lain atau pilih dari Office Playlist.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fadeIn {
  animation: fadeIn 0.15s ease-out;
}
</style>

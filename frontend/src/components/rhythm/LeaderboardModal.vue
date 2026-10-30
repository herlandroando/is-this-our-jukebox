<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import type { GlobalUserRanking, QueueTrack, RankedSongSummary, RhythmScoreEntry } from "../../shared/types.ts";
import { fetchAllRankedSongs, fetchGlobalRankings, fetchTrackLeaderboard } from "../../shared/api.ts";
import UiIcon from "../UiIcon.vue";
import { useFocusTrap } from "../../shared/useFocusTrap.ts";

const props = defineProps<{
  currentTrack: QueueTrack | null;
  isOpen: boolean;
  onClose: () => void;
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, () => props.isOpen);

type LeaderboardTab = "current" | "songs" | "global";
const activeTab = ref<LeaderboardTab>("current");

// State
const isLoading = ref(false);
const currentSongScores = ref<RhythmScoreEntry[]>([]);
const allSongs = ref<RankedSongSummary[]>([]);
const globalRankings = ref<GlobalUserRanking[]>([]);
const songSearchQuery = ref("");

// Detail for a selected song from the All Songs tab
const selectedSongDetail = ref<RankedSongSummary | null>(null);
const selectedSongScores = ref<RhythmScoreEntry[]>([]);
const isLoadingDetail = ref(false);

const filteredSongs = computed(() => {
  const q = songSearchQuery.value.trim().toLowerCase();
  if (!q) return allSongs.value;
  return allSongs.value.filter(
    (s) => s.trackTitle.toLowerCase().includes(q) || s.trackArtist.toLowerCase().includes(q)
  );
});

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadData();
    }
  }
);

watch(activeTab, () => {
  selectedSongDetail.value = null;
  loadData();
});

onMounted(() => {
  if (props.isOpen) {
    loadData();
  }
});

async function loadData() {
  isLoading.value = true;
  try {
    if (activeTab.value === "current") {
      if (props.currentTrack?.id) {
        currentSongScores.value = await fetchTrackLeaderboard(props.currentTrack.id, 20);
      } else {
        currentSongScores.value = [];
      }
    } else if (activeTab.value === "songs") {
      allSongs.value = await fetchAllRankedSongs();
    } else if (activeTab.value === "global") {
      globalRankings.value = await fetchGlobalRankings(25);
    }
  } catch (err) {
    console.error("Failed to load leaderboard data:", err);
  } finally {
    isLoading.value = false;
  }
}

async function viewSongScores(song: RankedSongSummary) {
  selectedSongDetail.value = song;
  isLoadingDetail.value = true;
  try {
    selectedSongScores.value = await fetchTrackLeaderboard(song.trackId, 15);
  } catch (err) {
    console.error("Failed to fetch song scores:", err);
  } finally {
    isLoadingDetail.value = false;
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    @click.self="onClose"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboard Kantor"
      class="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-white"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🏆</span>
          <div>
            <h2 class="font-black text-lg sm:text-xl tracking-tight">Leaderboard Kantor</h2>
            <p class="text-xs text-neutral-400">Papan peringkat dan Hall of Fame osu!mania 4K</p>
          </div>
        </div>
        <button
          @click="onClose"
          class="h-8 px-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs"
          aria-label="Tutup modal leaderboard (Esc)"
        >
          <span class="kbd-badge text-[9px]">Esc</span>
          <span>✕</span>
        </button>
      </div>

      <!-- Tab Navigation -->
      <div role="tablist" class="flex border-b border-neutral-800 bg-neutral-950/40 px-5 pt-2">
        <button
          role="tab"
          :aria-selected="activeTab === 'current'"
          @click="activeTab = 'current'"
          class="pb-2.5 px-3 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer"
          :class="
            activeTab === 'current'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          "
        >
          🎵 Lagu Saat Ini
        </button>
        <button
          role="tab"
          :aria-selected="activeTab === 'songs'"
          @click="activeTab = 'songs'"
          class="pb-2.5 px-3 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer"
          :class="
            activeTab === 'songs'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          "
        >
          📚 Semua Lagu
        </button>
        <button
          role="tab"
          :aria-selected="activeTab === 'global'"
          @click="activeTab = 'global'"
          class="pb-2.5 px-3 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer"
          :class="
            activeTab === 'global'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          "
        >
          👑 Juara Kantor
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5">
        <!-- TAB 1: LAGU SAAT INI -->
        <div v-if="activeTab === 'current'">
          <div v-if="currentTrack" class="flex items-center gap-3 p-3 bg-neutral-800/60 rounded-2xl border border-neutral-700/50 mb-4">
            <img
              v-if="currentTrack.thumbnail"
              :src="currentTrack.thumbnail"
              class="w-12 h-12 rounded-xl object-cover"
            />
            <div class="truncate flex-1">
              <div class="font-bold text-sm truncate text-white">{{ currentTrack.title }}</div>
              <div class="text-xs text-neutral-400 truncate">{{ currentTrack.artist }}</div>
            </div>
          </div>

          <div v-if="isLoading" class="text-center py-10 text-neutral-500 text-sm">
            Memuat skor...
          </div>
          <div
            v-else-if="currentSongScores.length === 0"
            class="text-center py-12 px-4 rounded-2xl bg-neutral-950/30 border border-dashed border-neutral-800 text-neutral-400 text-sm"
          >
            <div class="text-3xl mb-2">🎮</div>
            <div class="font-bold text-neutral-300">Belum Ada Rekor untuk Lagu Ini</div>
            <p class="text-xs text-neutral-500 mt-1">
              Jadilah orang pertama di kantor yang memainkan lagu ini di mode Mania 4K!
            </p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(score, idx) in currentSongScores"
              :key="score.id"
              class="flex items-center justify-between p-3 rounded-2xl bg-neutral-800/40 border border-neutral-800 hover:border-neutral-700 transition-all text-xs sm:text-sm"
            >
              <div class="flex items-center gap-3 truncate">
                <span
                  class="w-6 text-center font-black"
                  :class="idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-amber-600' : 'text-neutral-600'"
                >
                  {{ idx + 1 }}.
                </span>
                <span
                  class="w-8 h-8 rounded-lg font-black flex items-center justify-center text-xs text-black shrink-0"
                  :class="
                    score.grade === 'SS' || score.grade === 'S'
                      ? 'bg-amber-400 font-extrabold'
                      : score.grade === 'A'
                      ? 'bg-emerald-400 font-bold'
                      : score.grade === 'B'
                      ? 'bg-cyan-400 font-bold'
                      : 'bg-neutral-600 text-white'
                  "
                >
                  {{ score.grade }}
                </span>
                <div class="truncate">
                  <div class="font-bold truncate text-neutral-100 flex items-center gap-1.5">
                    <span>{{ score.nickname }}</span>
                    <span v-if="idx === 0" class="text-xs">👑</span>
                  </div>
                  <div class="text-[11px] text-neutral-400">
                    Acc: <span class="text-emerald-400 font-semibold">{{ score.accuracy }}%</span> • Combo: {{ score.maxCombo }}x
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="font-mono font-black text-sm sm:text-base text-neutral-100">
                  {{ score.score.toLocaleString() }}
                </div>
                <div class="text-[10px] text-neutral-500 uppercase font-semibold">
                  {{ score.difficulty }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: SEMUA LAGU (BROWSER) -->
        <div v-else-if="activeTab === 'songs'">
          <!-- Search input -->
          <div class="relative mb-4">
            <input
              v-model="songSearchQuery"
              type="text"
              placeholder="Cari lagu atau artis..."
              class="w-full bg-neutral-800/70 border border-neutral-700 rounded-2xl py-2.5 px-4 pl-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <span class="absolute left-3.5 top-3 text-neutral-500 text-sm">🔍</span>
          </div>

          <!-- Song Detail Modal Layer -->
          <div v-if="selectedSongDetail" class="mb-5 p-4 bg-neutral-950 border border-indigo-900/60 rounded-3xl">
            <div class="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
              <div class="truncate">
                <div class="text-xs text-indigo-400 font-bold uppercase tracking-wider">Top 10 Rekor Lagu</div>
                <h3 class="font-bold text-sm sm:text-base truncate">{{ selectedSongDetail.trackTitle }}</h3>
              </div>
              <button
                @click="selectedSongDetail = null"
                class="text-xs px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 cursor-pointer"
              >
                ✕ Kembali
              </button>
            </div>

            <div v-if="isLoadingDetail" class="text-center py-6 text-neutral-500 text-xs">
              Memuat detail...
            </div>
            <div v-else-if="selectedSongScores.length === 0" class="text-center py-6 text-neutral-500 text-xs">
              Belum ada skor.
            </div>
            <div v-else class="space-y-1.5 max-h-64 overflow-y-auto">
              <div
                v-for="(s, idx) in selectedSongScores"
                :key="s.id"
                class="flex items-center justify-between p-2 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs"
              >
                <div class="flex items-center gap-2 truncate">
                  <span class="font-bold text-neutral-500 w-4">{{ idx + 1 }}.</span>
                  <span class="font-bold truncate">{{ s.nickname }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-neutral-400">{{ s.accuracy }}%</span>
                  <span class="font-mono font-bold text-neutral-200">{{ s.score.toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Songs List -->
          <div v-if="isLoading" class="text-center py-10 text-neutral-500 text-sm">
            Memuat daftar lagu...
          </div>
          <div
            v-else-if="filteredSongs.length === 0"
            class="text-center py-12 text-neutral-500 text-sm"
          >
            Tidak ada lagu yang cocok dengan pencarian.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="song in filteredSongs"
              :key="song.trackId"
              @click="viewSongScores(song)"
              class="flex items-center justify-between p-3 rounded-2xl bg-neutral-800/40 border border-neutral-800 hover:border-indigo-500/50 hover:bg-neutral-800/80 transition-all cursor-pointer group"
            >
              <div class="flex items-center gap-3 truncate">
                <img
                  v-if="song.trackThumbnail"
                  :src="song.trackThumbnail"
                  class="w-11 h-11 rounded-xl object-cover bg-neutral-700 shrink-0"
                />
                <div class="truncate">
                  <div class="font-bold text-sm text-neutral-100 group-hover:text-indigo-300 transition-colors truncate">
                    {{ song.trackTitle }}
                  </div>
                  <div class="text-xs text-neutral-400 truncate">
                    {{ song.trackArtist }} • <span class="text-neutral-500">{{ song.totalPlays }}x main</span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0 pl-3">
                <div class="flex items-center gap-1 justify-end">
                  <span class="text-xs text-amber-400">👑</span>
                  <span class="text-xs font-bold text-amber-300 truncate max-w-[100px]">{{ song.topPlayer }}</span>
                </div>
                <div class="font-mono font-bold text-xs text-neutral-300">
                  {{ song.topScore.toLocaleString() }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: JUARA KANTOR (HALL OF FAME) -->
        <div v-else-if="activeTab === 'global'">
          <div v-if="isLoading" class="text-center py-10 text-neutral-500 text-sm">
            Memuat klasemen...
          </div>
          <div
            v-else-if="globalRankings.length === 0"
            class="text-center py-12 text-neutral-500 text-sm"
          >
            Belum ada data pemain kantor.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(user, idx) in globalRankings"
              :key="user.nickname"
              class="flex items-center justify-between p-3.5 rounded-2xl border transition-all"
              :class="
                idx === 0
                  ? 'bg-gradient-to-r from-amber-950/40 via-neutral-900 to-neutral-900 border-amber-500/40 shadow-lg shadow-amber-500/5'
                  : idx === 1
                  ? 'bg-neutral-800/50 border-neutral-700'
                  : idx === 2
                  ? 'bg-neutral-800/30 border-amber-900/30'
                  : 'bg-neutral-800/20 border-neutral-800'
              "
            >
              <div class="flex items-center gap-3 truncate">
                <div
                  class="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                  :class="
                    idx === 0
                      ? 'bg-amber-400 text-amber-950 shadow-md shadow-amber-400/40'
                      : idx === 1
                      ? 'bg-neutral-300 text-neutral-900'
                      : idx === 2
                      ? 'bg-amber-600 text-white'
                      : 'bg-neutral-800 text-neutral-400'
                  "
                >
                  {{ idx + 1 }}
                </div>

                <div class="truncate">
                  <div class="font-black text-sm text-white flex items-center gap-1.5 truncate">
                    <span>{{ user.nickname }}</span>
                    <span v-if="idx === 0" class="text-xs">👑 Grandmaster</span>
                  </div>
                  <div class="text-[11px] text-neutral-400 flex items-center gap-2">
                    <span v-if="user.crownsCount > 0" class="text-amber-400 font-bold">
                      👑 {{ user.crownsCount }} Lagu
                    </span>
                    <span>Acc: {{ user.avgAccuracy }}%</span>
                    <span>• {{ user.totalPlays }} Game</span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="text-[10px] text-neutral-500 uppercase font-semibold">Total Poin</div>
                <div class="font-mono font-black text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-fuchsia-300">
                  {{ user.totalScore.toLocaleString() }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

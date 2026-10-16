<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { TriviaCategory, TriviaGameSettings, TriviaPresetItem } from "../../shared/types.ts";
import UiIcon, { type IconName } from "../UiIcon.vue";
import TriviaPresetManagerModal from "./TriviaPresetManagerModal.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "createGame", settings: TriviaGameSettings): void;
}>();

interface CategoryItem extends Omit<TriviaCategory, "icon"> {
  icon: IconName;
  type?: string;
  songCount?: number;
}

const activeTab = ref<"preset" | "custom">("preset");
const isPresetManagerOpen = ref(false);

const categories = ref<CategoryItem[]>([
  {
    id: "room-vibe",
    name: "Antrean & Vibe Ruangan 🎧",
    description: "Ditebak dari lagu antrean sekarang & rekomendasi Auto DJ terkait!",
    icon: "radio",
    popularArtists: ["Lagu Antrean & Terkait"],
  },
  {
    id: "pop-indo",
    name: "Pop Indo 2000-an (Nostalgia) 🎸",
    description: "Lagu legendaris Indonesia era 2000-an (Sheila On 7, Dewa 19, Padi, dll).",
    icon: "cassette" as any,
    popularArtists: ["Sheila On 7", "Dewa 19", "Padi"],
  },
  {
    id: "indie-indo",
    name: "Hits Indo Terkini & Indie ✨",
    description: "Lagu-lagu hits Indonesia masa kini yang sering viral (Hindia, Tulus, Bernadya).",
    icon: "sparkles",
    popularArtists: ["Hindia", "Tulus", "Bernadya"],
  },
  {
    id: "rock-indo",
    name: "Rock & Band Indonesia ⚡",
    description: "Distorsi gitar dan hentakan drum band rock legendaris (Slank, Jamrud, Kotak).",
    icon: "flame",
    popularArtists: ["Slank", "Jamrud", "Kotak"],
  },
  {
    id: "western-classics",
    name: "Rock & Western Classics 🌍",
    description: "Lagu hits internasional legendaris (Queen, Nirvana, Coldplay, Bruno Mars).",
    icon: "globe" as any,
    popularArtists: ["Queen", "Coldplay", "Bruno Mars"],
  },
  {
    id: "hits-00s",
    name: "Hits 2000-an Mancanegara (00s) 💿",
    description: "Throwback hits pop & rock era 2000-an (Maroon 5, Kelly Clarkson).",
    icon: "disc",
    popularArtists: ["Maroon 5", "Kelly Clarkson"],
  },
  {
    id: "kpop",
    name: "K-Pop Super Hits 💖",
    description: "Dance pop Korea terpopuler dari berbagai generasi (BTS, BLACKPINK, NewJeans).",
    icon: "heart",
    popularArtists: ["BTS", "BLACKPINK", "NewJeans"],
  },
  {
    id: "anime-jp",
    name: "Anime OST & J-Pop Trending 🌸",
    description: "Opening anime ikonik & J-Pop trending (YOASOBI, Yorushika, Creepy Nuts, Akasaki).",
    icon: "tv" as any,
    popularArtists: ["YOASOBI", "Yorushika", "Akasaki"],
  },
  {
    id: "office-history",
    name: "Riwayat Jukebox Kantor 🏢",
    description: "Tebak lagu-lagu yang paling sering diputar teman-teman di kantor ini!",
    icon: "crown",
    popularArtists: ["Office DJ Favorites"],
  },
]);

const selectedCategoryId = ref("room-vibe");
const selectedRoundCount = ref(5);
const selectedDurationSec = ref(20);

// Custom Playlist State
const customPlaylistUrl = ref("");
const isCheckingCustomUrl = ref(false);
const customPlaylistPreview = ref<{
  valid: boolean;
  count: number;
  sampleTracks: Array<{ title: string; artist: string }>;
} | null>(null);
const customErrorMessage = ref("");

async function loadCategoriesFromApi() {
  try {
    const res = await fetch("/api/trivia/presets");
    if (res.ok) {
      const presets: TriviaPresetItem[] = await res.json();
      if (Array.isArray(presets) && presets.length > 0) {
        categories.value = presets
          .filter((p) => p.isEnabled)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            icon: (p.icon as IconName) || "music",
            type: p.type,
            songCount: p.songCount,
            popularArtists: [p.type === "dynamic" ? "Ruangan" : "Playlist"],
          }));
      }
    }
  } catch (err) {
    console.warn("Failed to load categories from API:", err);
  }
}

async function checkCustomPlaylist() {
  if (!customPlaylistUrl.value.trim()) {
    customErrorMessage.value = "Masukkan link YouTube Playlist terlebih dahulu.";
    return;
  }

  isCheckingCustomUrl.value = true;
  customErrorMessage.value = "";
  customPlaylistPreview.value = null;

  try {
    const res = await fetch("/api/trivia/preview-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: customPlaylistUrl.value.trim() }),
    });
    const data = await res.json();
    if (data.valid && data.count > 0) {
      customPlaylistPreview.value = data;
    } else {
      customErrorMessage.value = "Playlist tidak ditemukan atau tidak memiliki lagu yang dapat diputar.";
    }
  } catch (err: any) {
    customErrorMessage.value = err?.message || "Gagal memeriksa playlist.";
  } finally {
    isCheckingCustomUrl.value = false;
  }
}

function submitCreate() {
  if (activeTab.value === "custom") {
    if (!customPlaylistUrl.value.trim()) {
      customErrorMessage.value = "Masukkan link playlist terlebih dahulu!";
      return;
    }
    emit("createGame", {
      categoryId: "custom",
      customPlaylistUrl: customPlaylistUrl.value.trim(),
      roundCount: selectedRoundCount.value,
      roundDurationSec: selectedDurationSec.value,
    });
  } else {
    emit("createGame", {
      categoryId: selectedCategoryId.value,
      roundCount: selectedRoundCount.value,
      roundDurationSec: selectedDurationSec.value,
    });
  }
  emit("close");
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.isOpen || isPresetManagerOpen.value) return;
  if (e.key === "Escape") {
    emit("close");
  } else if (e.key === "Enter" && !isCheckingCustomUrl.value) {
    submitCreate();
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadCategoriesFromApi();
    }
  }
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  if (props.isOpen) loadCategoriesFromApi();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md"
    @click.self="emit('close')"
  >
    <div
      class="glass-panel w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden bg-obsidian-900/95 text-slate-100 animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <header class="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25"
          >
            <span class="text-xl">🎮</span>
          </div>
          <div>
            <h2 class="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              Buka Game Tebak Lagu
            </h2>
            <p class="text-xs text-slate-400">Atur kategori & aturan kuis musik untuk seluruh room</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            title="Kelola Preset & Link Playlist"
            class="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            @click="isPresetManagerOpen = true"
          >
            <UiIcon name="sliders" :size="14" />
            <span class="hidden sm:inline font-semibold">Kelola Preset</span>
          </button>
          <button
            class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition cursor-pointer text-slate-400 hover:text-white"
            @click="emit('close')"
          >
            <UiIcon name="x" :size="18" />
          </button>
        </div>
      </header>

      <!-- Scrollable Form Body -->
      <div class="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
        <!-- Info Alert Jukebox Pause -->
        <div
          class="p-3 sm:p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2.5 text-xs text-indigo-200 leading-relaxed"
        >
          <span class="text-indigo-400 text-sm shrink-0 mt-0.5">⏸️</span>
          <span>
            Saat game dibuka, lagu yang sedang diputar di jukebox akan <strong>dijeda dan tersimpan otomatis</strong>, lalu berlanjut setelah game berakhir.
          </span>
        </div>

        <!-- Mode Tabs: Preset Kategori vs Custom Playlist Link -->
        <div class="flex rounded-xl bg-white/5 p-1 border border-white/5">
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            :class="activeTab === 'preset' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'"
            @click="activeTab = 'preset'"
          >
            <span>🎵 Kategori Pilihan (Multi-Genre)</span>
          </button>
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            :class="activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'"
            @click="activeTab = 'custom'"
          >
            <span>🔗 Custom Link Playlist</span>
          </button>
        </div>

        <!-- TAB 1: Kategori Pilihan (Multi-Genre) -->
        <div v-if="activeTab === 'preset'" class="space-y-2.5">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Pilih Kategori Lagu</span>
            <span class="text-[11px] font-normal text-indigo-400 hover:underline cursor-pointer" @click="isPresetManagerOpen = true">
              ⚙️ Ubah Preset
            </span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 max-h-64 overflow-y-auto pr-1">
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="p-3 rounded-xl border text-left transition-all duration-150 flex flex-col gap-1 cursor-pointer active:scale-[0.98]"
              :class="
                selectedCategoryId === cat.id
                  ? 'bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 border-indigo-400/80 shadow-[0_0_16px_rgba(99,102,241,0.25)] text-white'
                  : 'bg-white/[0.03] border-white/5 hover:border-white/15 text-slate-300 hover:bg-white/[0.05]'
              "
              @click="selectedCategoryId = cat.id"
            >
              <div class="flex items-center justify-between w-full">
                <span class="font-bold text-xs sm:text-sm text-slate-100 flex items-center gap-1.5">
                  <UiIcon :name="cat.icon || 'music'" :size="14" class="text-indigo-400" />
                  {{ cat.name }}
                </span>
                <span v-if="selectedCategoryId === cat.id" class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
              <p class="text-[11px] text-slate-400 line-clamp-1 leading-normal">{{ cat.description }}</p>
              <span v-if="cat.songCount" class="text-[10px] text-indigo-300/80">✨ {{ cat.songCount }} lagu siap tebak</span>
            </button>
          </div>
        </div>

        <!-- TAB 2: Custom Playlist Link -->
        <div v-else class="space-y-3 p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20">
          <label class="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
            <span>🔗 Tempel Link Playlist YouTube / YouTube Music</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="customPlaylistUrl"
              type="text"
              placeholder="https://music.youtube.com/playlist?list=PL... atau PL..."
              class="flex-1 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-mono"
              @keydown.enter="checkCustomPlaylist"
            />
            <button
              type="button"
              class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
              :disabled="isCheckingCustomUrl"
              @click="checkCustomPlaylist"
            >
              {{ isCheckingCustomUrl ? "Cek..." : "Cek Lagu" }}
            </button>
          </div>

          <p class="text-[11px] text-slate-400 leading-relaxed">
            Kuis akan mengambil lagu-lagu langsung dari link playlist publik ini. Kompilasi berdurasi panjang otomatis disaring.
          </p>

          <!-- Preview Result -->
          <div v-if="customPlaylistPreview" class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1.5">
            <div class="font-bold flex items-center gap-1">
              <span>✅ Ditemukan {{ customPlaylistPreview.count }} lagu siap tebak!</span>
            </div>
            <div class="text-[11px] text-slate-300 space-y-0.5">
              <div v-for="(trk, idx) in customPlaylistPreview.sampleTracks.slice(0, 3)" :key="idx" class="truncate">
                • {{ trk.title }} - {{ trk.artist }}
              </div>
            </div>
          </div>

          <div v-if="customErrorMessage" class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            ⚠️ {{ customErrorMessage }}
          </div>
        </div>

        <!-- 2. Jumlah Ronde / Lagu -->
        <div class="space-y-2">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>🎯 Jumlah Ronde Lagu</span>
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="count in [5, 10, 15]"
              :key="count"
              type="button"
              class="py-2.5 sm:py-3 rounded-xl border font-bold text-xs sm:text-sm transition-all duration-150 cursor-pointer active:scale-95"
              :class="
                selectedRoundCount === count
                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-white/[0.04] border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.08]'
              "
              @click="selectedRoundCount = count"
            >
              {{ count }} Lagu
            </button>
          </div>
        </div>

        <!-- 3. Durasi Menjawab Per Ronde -->
        <div class="space-y-2">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>⏱️ Durasi Menjawab Per Ronde</span>
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="dur in [
                { sec: 10, label: '10s (Cepat)' },
                { sec: 20, label: '20s (Standar)' },
                { sec: 30, label: '30s (Santai)' },
              ]"
              :key="dur.sec"
              type="button"
              class="py-2.5 sm:py-3 rounded-xl border font-bold text-xs sm:text-sm transition-all duration-150 cursor-pointer active:scale-95 flex flex-col items-center"
              :class="
                selectedDurationSec === dur.sec
                  ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-600/30'
                  : 'bg-white/[0.04] border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.08]'
              "
              @click="selectedDurationSec = dur.sec"
            >
              <span>{{ dur.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Footer CTA -->
      <footer class="p-4 sm:p-5 border-t border-white/10 flex items-center justify-between gap-3 bg-white/[0.02]">
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 active:scale-95 transition cursor-pointer"
          @click="emit('close')"
        >
          Batal
        </button>

        <button
          type="button"
          class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-indigo-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          @click="submitCreate"
        >
          <span>Buka Lobby Tebak Lagu 🚀</span>
        </button>
      </footer>
    </div>

    <!-- Nested Preset Manager Modal -->
    <TriviaPresetManagerModal
      :is-open="isPresetManagerOpen"
      @close="isPresetManagerOpen = false"
      @presets-changed="loadCategoriesFromApi"
    />
  </div>
</template>

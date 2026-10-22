<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { TriviaCategory, TriviaGameSettings, TriviaPresetItem } from "../../shared/types.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
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
  personaAudio.playCursor();
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
      personaAudio.playSelect();
      customPlaylistPreview.value = data;
    } else {
      personaAudio.playMiss();
      customErrorMessage.value = "Playlist tidak ditemukan atau tidak memiliki lagu yang dapat diputar.";
    }
  } catch (err: any) {
    personaAudio.playMiss();
    customErrorMessage.value = err?.message || "Gagal memeriksa playlist.";
  } finally {
    isCheckingCustomUrl.value = false;
  }
}

function selectCategory(id: string) {
  personaAudio.playCursor();
  selectedCategoryId.value = id;
}

function selectRoundCount(count: number) {
  personaAudio.playCursor();
  selectedRoundCount.value = count;
}

function selectDuration(dur: number) {
  personaAudio.playCursor();
  selectedDurationSec.value = dur;
}

function submitCreate() {
  personaAudio.playReady();
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
    personaAudio.playCursor();
    emit("close");
  } else if (e.key === "Enter" && !isCheckingCustomUrl.value) {
    submitCreate();
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      personaAudio.playSelect();
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
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md select-none overflow-y-auto"
    @click.self="emit('close')"
  >
    <!-- Background Halftone Overlay -->
    <div class="fixed inset-0 opacity-15 p5-halftone-dots pointer-events-none"></div>

    <!-- Main Persona 5 Heist Setup Shell (Unclipped Ribbon) -->
    <div
      class="relative z-10 w-full max-w-2xl sm:max-w-3xl my-auto flex flex-col bg-[#0b0b14] border-4 border-white shadow-[8px_8px_0px_#000000] sm:shadow-[14px_14px_0px_#000000] text-slate-100 animate-in fade-in zoom-in-95 duration-200"
      style="transform: skewX(-1.5deg);"
    >
      <!-- Top Red Corner Heist Banner Ribbon -->
      <div
        class="absolute -top-4 -left-2 sm:-top-5 sm:-left-3 bg-[#e60012] border-2 border-white px-3 sm:px-4 py-1 sm:py-1.5 font-black text-[11px] sm:text-xs text-white uppercase italic tracking-widest shadow-[3px_3px_0px_#000] z-20 pointer-events-none"
        style="transform: skewX(-14deg) rotate(-2deg);"
      >
        ★ HEIST MISSION // TARGET SELECTION
      </div>

      <!-- Header Bar -->
      <header
        class="px-4 sm:px-6 pt-5 pb-3 border-b-3 border-white flex items-center justify-between shrink-0 bg-[#0f0e1c] relative z-10"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 sm:w-11 sm:h-11 bg-[#e60012] border-2 border-white flex items-center justify-center text-xl shadow-[3px_3px_0px_#000]"
            style="transform: rotate(-3deg);"
          >
            🎯
          </div>
          <div class="leading-tight">
            <h2 class="text-base sm:text-xl font-black uppercase italic tracking-wider text-white">
              OPERATION GUESS // BRIEFING
            </h2>
            <p class="text-[11px] sm:text-xs text-[#00e5ff] font-mono tracking-wider">
              [TARGET_ZONE & INFILTRATION_RULES]
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            title="Kelola Preset Kategori"
            class="h-8 sm:h-9 px-2.5 sm:px-3 bg-black hover:bg-white text-white hover:text-black border-2 border-white font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95"
            style="transform: skewX(-8deg);"
            @click="isPresetManagerOpen = true; personaAudio.playCursor()"
          >
            <UiIcon name="sliders" :size="13" />
            <span class="hidden sm:inline">PRESET</span>
          </button>

          <button
            type="button"
            class="h-8 sm:h-9 px-3 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs uppercase flex items-center gap-1 transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95"
            style="transform: skewX(-8deg);"
            title="Batal (Esc)"
            @click="emit('close'); personaAudio.playCursor()"
          >
            <span>CANCEL</span>
          </button>
        </div>
      </header>

      <!-- Scrollable Form Content -->
      <div class="p-4 sm:p-6 max-h-[72vh] overflow-y-auto space-y-4 sm:space-y-5">
        <!-- Target Infiltration Covert Notice -->
        <div
          class="relative p-3 bg-black/70 border-2 border-white/60 flex items-center gap-2.5 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-2deg);"
        >
          <div class="w-2 h-full bg-[#00e5ff] absolute left-0 top-0 bottom-0"></div>
          <span class="text-xl pl-2 shrink-0">⏸️</span>
          <p class="text-[11px] sm:text-xs text-slate-200 leading-snug">
            <strong class="text-[#00e5ff] uppercase font-mono">COVERT HEIST NOTICE:</strong>
            Musik ruangan otomatis dijeda dan tersimpan aman. Setelah pesta tebak lagu selesai, musik langsung berlanjut!
          </p>
        </div>

        <!-- Mode Tabs: Preset Palace Targets vs Custom Frequency Link -->
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 px-3 border-2 font-black text-xs sm:text-sm uppercase italic tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_#000]"
            :class="
              activeTab === 'preset'
                ? 'bg-[#e60012] border-white text-white'
                : 'bg-black border-white/40 text-slate-400 hover:text-white hover:border-white'
            "
            style="transform: skewX(-8deg);"
            @click="activeTab = 'preset'; personaAudio.playCursor()"
          >
            ★ PALACE TARGETS (PRESET)
          </button>

          <button
            type="button"
            class="flex-1 py-2.5 px-3 border-2 font-black text-xs sm:text-sm uppercase italic tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_#000]"
            :class="
              activeTab === 'custom'
                ? 'bg-[#00e5ff] border-white text-black'
                : 'bg-black border-white/40 text-slate-400 hover:text-white hover:border-white'
            "
            style="transform: skewX(-8deg);"
            @click="activeTab = 'custom'; personaAudio.playCursor()"
          >
            🔗 CUSTOM PLAYLIST LINK
          </button>
        </div>

        <!-- TAB 1: Palace Targets Grid -->
        <div v-if="activeTab === 'preset'" class="space-y-2">
          <div class="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
            <span>Pilih Zona Target (Kategori)</span>
            <span
              class="text-[#00e5ff] hover:underline cursor-pointer font-mono"
              @click="isPresetManagerOpen = true; personaAudio.playCursor()"
            >
              [+ KELOLA PRESET]
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 max-h-56 sm:max-h-60 overflow-y-auto pr-1">
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="relative p-2.5 sm:p-3 border-2 text-left transition-all duration-150 flex flex-col gap-0.5 cursor-pointer shadow-[3px_3px_0px_#000] active:scale-[0.98] overflow-hidden"
              :class="
                selectedCategoryId === cat.id
                  ? 'bg-[#e60012] border-white text-white font-black'
                  : 'bg-black/70 border-white/30 text-slate-300 hover:border-white hover:bg-[#1a1828]'
              "
              style="transform: skewX(-6deg);"
              @click="selectCategory(cat.id)"
            >
              <!-- Selected Notch -->
              <div
                v-if="selectedCategoryId === cat.id"
                class="absolute right-2 top-2 bg-white text-black px-1.5 py-0.2 text-[9px] font-black uppercase font-mono"
              >
                TARGETED
              </div>

              <div class="flex items-center gap-1.5 w-full pr-14">
                <UiIcon :name="cat.icon || 'music'" :size="14" :class="selectedCategoryId === cat.id ? 'text-white' : 'text-[#00e5ff]'" />
                <span class="text-xs sm:text-sm font-black truncate uppercase">
                  {{ cat.name }}
                </span>
              </div>
              <p
                class="text-[10px] sm:text-[11px] line-clamp-1 leading-normal"
                :class="selectedCategoryId === cat.id ? 'text-white/90' : 'text-slate-400'"
              >
                {{ cat.description }}
              </p>
              <span
                v-if="cat.songCount"
                class="text-[9px] font-mono tracking-wider mt-0.5"
                :class="selectedCategoryId === cat.id ? 'text-white/80' : 'text-[#00e5ff]/80'"
              >
                ★ {{ cat.songCount }} LAGU TERSEDIA
              </span>
            </button>
          </div>
        </div>

        <!-- TAB 2: Custom Frequency Link -->
        <div v-else class="space-y-2.5 p-3.5 bg-black/80 border-2 border-white/60 shadow-[4px_4px_0px_#000]">
          <label class="text-xs font-black uppercase tracking-wider text-[#00e5ff] flex items-center gap-1.5">
            <span>🔗 TARGET INFILTRATION LINK (YOUTUBE PLAYLIST)</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="customPlaylistUrl"
              type="text"
              placeholder="https://music.youtube.com/playlist?list=... atau ID playlist"
              class="flex-1 px-3 py-2 bg-black border-2 border-white text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00e5ff] font-mono"
              @keydown.enter="checkCustomPlaylist"
            />
            <button
              type="button"
              class="px-3.5 py-2 bg-[#00e5ff] hover:bg-white text-black font-black text-xs uppercase tracking-wider border-2 border-white transition cursor-pointer disabled:opacity-50 shrink-0 shadow-[2px_2px_0px_#000] active:scale-95"
              :disabled="isCheckingCustomUrl"
              @click="checkCustomPlaylist"
            >
              {{ isCheckingCustomUrl ? "SCAN..." : "SCAN 🔍" }}
            </button>
          </div>

          <p class="text-[10px] text-slate-400 leading-tight">
            Kuis akan mengambil lagu-lagu langsung dari link playlist publik ini. Kompilasi berdurasi panjang otomatis disaring.
          </p>

          <!-- Preview Result -->
          <div
            v-if="customPlaylistPreview"
            class="p-2.5 bg-[#e60012]/20 border-2 border-[#e60012] text-xs text-white space-y-1"
          >
            <div class="font-black text-[#00e5ff] flex items-center gap-1 uppercase">
              <span>★ TARGET DIKONFIRMASI: {{ customPlaylistPreview.count }} LAGU SIAP DIINFILTRASI!</span>
            </div>
            <div class="text-[10px] text-slate-300 space-y-0.5 font-mono">
              <div v-for="(trk, idx) in customPlaylistPreview.sampleTracks.slice(0, 3)" :key="idx" class="truncate">
                • {{ trk.title }} - {{ trk.artist }}
              </div>
            </div>
          </div>

          <div
            v-if="customErrorMessage"
            class="p-2 bg-[#e60012] border-2 border-white text-xs text-white font-bold"
          >
            ⚠️ {{ customErrorMessage }}
          </div>
        </div>

        <!-- 2. Rounds Count & 3. Duration Parameters -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
          <!-- Rounds Count -->
          <div class="space-y-1.5">
            <label class="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>🎯 JUMLAH RONDE LAGU</span>
            </label>
            <div class="grid grid-cols-3 gap-1.5 sm:gap-2">
              <button
                v-for="count in [5, 10, 15]"
                :key="count"
                type="button"
                class="py-2 border-2 font-black text-xs sm:text-sm uppercase transition-all duration-150 cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95"
                :class="
                  selectedRoundCount === count
                    ? 'bg-[#e60012] border-white text-white'
                    : 'bg-black border-white/30 text-slate-400 hover:text-white hover:border-white'
                "
                style="transform: skewX(-8deg);"
                @click="selectRoundCount(count)"
              >
                {{ count }} LAGU
              </button>
            </div>
          </div>

          <!-- Duration -->
          <div class="space-y-1.5">
            <label class="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>⏱️ DURASI CUPLIKAN</span>
            </label>
            <div class="grid grid-cols-3 gap-1.5 sm:gap-2">
              <button
                v-for="dur in [
                  { sec: 10, label: '10s' },
                  { sec: 20, label: '20s' },
                  { sec: 30, label: '30s' },
                ]"
                :key="dur.sec"
                type="button"
                class="py-2 border-2 font-black text-xs sm:text-sm uppercase transition-all duration-150 cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95"
                :class="
                  selectedDurationSec === dur.sec
                    ? 'bg-[#00e5ff] border-white text-black'
                    : 'bg-black border-white/30 text-slate-400 hover:text-white hover:border-white'
                "
                style="transform: skewX(-8deg);"
                @click="selectDuration(dur.sec)"
              >
                {{ dur.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer CTA (Calling Card Button) -->
      <footer
        class="p-3.5 sm:p-5 border-t-3 border-white flex items-center justify-between gap-3 bg-[#0f0e1c] shrink-0"
      >
        <button
          type="button"
          class="px-4 py-2 bg-black hover:bg-white text-white hover:text-black border-2 border-white text-xs font-black uppercase tracking-wider active:scale-95 transition cursor-pointer shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-8deg);"
          @click="emit('close'); personaAudio.playCursor()"
        >
          BATAL
        </button>

        <button
          type="button"
          class="flex-1 sm:flex-initial px-5 sm:px-7 py-2.5 sm:py-3 bg-[#e60012] hover:bg-white text-white hover:text-black border-3 border-white font-black text-xs sm:text-sm uppercase italic tracking-wider shadow-[4px_4px_0px_#000] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer animate-p5-glow"
          style="transform: skewX(-10deg);"
          @click="submitCreate"
        >
          <span>SEND CALLING CARD // INITIATE HEIST ⚔️</span>
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

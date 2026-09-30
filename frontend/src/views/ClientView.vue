<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import QueueCard from "../components/QueueCard.vue";
import CatalogView from "../components/CatalogView.vue";
import LyricsView from "../components/LyricsView.vue";
import DjPasscodeModal from "../components/DjPasscodeModal.vue";
import SeekBar from "../components/SeekBar.vue";
import UiIcon from "../components/UiIcon.vue";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";
import { useFavorites } from "../shared/useFavorites.ts";
import type { SearchResult } from "../shared/types.ts";

type ClientTab = "queue" | "catalog" | "lyrics";
const activeTab = ref<ClientTab>("queue");

const isPasscodeModalOpen = ref(false);
const isEditingNickname = ref(false);
const nicknameInput = ref("");
const prefillSearchQuery = ref("");

const { isFavorite, toggleFavorite } = useFavorites();

const nickname = ref(localStorage.getItem("jukebox_nickname") || "Anonymous");

const state = computed(() => jukeboxClient.state.value);
const nowPlaying = computed(() => state.value?.nowPlaying ?? null);
const isPlaying = computed(() => state.value?.isPlaying ?? false);
const queue = computed(() => state.value?.queue ?? []);
const activeListeners = computed(() => state.value?.activeListeners ?? 1);
const karaokeEnabled = computed(() => state.value?.karaokeEnabled ?? false);
const karaokeLevel = computed(() => state.value?.karaokeLevel ?? 90);
const status = computed(() => jukeboxClient.status.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);
const myRole = computed(() => jukeboxClient.myRole.value);
const isDjOrHost = computed(
  () => myRole.value === "dj" || myRole.value === "host" || jukeboxClient.isAdmin.value
);

const displayArtist = computed(() => {
  const a = nowPlaying.value?.artist;
  if (!a || /^\d+:\d{2}(:\d{2})?$/.test(a.trim())) {
    const t = nowPlaying.value?.title || "";
    if (t.includes(" - ")) {
      const parts = t.split(" - ");
      return parts[0].trim();
    }
    return "YouTube Music";
  }
  return a;
});

const quickPickVibes = [
  { label: "Sheila On 7", query: "Sheila On 7 Dan" },
  { label: "Dewa 19", query: "Dewa 19 Kangen" },
  { label: "Queen", query: "Queen Bohemian Rhapsody" },
  { label: "Coldplay", query: "Coldplay Fix You" },
  { label: "Bruno Mars", query: "Bruno Mars Just The Way You Are" },
];

const {
  currentTime,
  duration,
  seekTo,
} = usePlaybackProgress({
  track: nowPlaying,
  isPlaying,
  onSeek: (time) => {
    jukeboxClient.send({ type: "seek", time });
  },
});

const volume = computed(() => state.value?.volume ?? 80);

onMounted(() => {
  jukeboxClient.connect();
});

function startEditNickname() {
  nicknameInput.value = nickname.value;
  isEditingNickname.value = true;
}

function saveNickname() {
  const trimmed = nicknameInput.value.trim();
  nickname.value = trimmed || "Anonymous";
  jukeboxClient.setNickname(nickname.value);
  isEditingNickname.value = false;
  jukeboxClient.addToast(`Nickname set to "${nickname.value}"`, "success");
}

function triggerQuickPick(query: string) {
  prefillSearchQuery.value = query;
  activeTab.value = "catalog";
}

function openCatalog(searchQuery: string = "") {
  prefillSearchQuery.value = searchQuery;
  activeTab.value = "catalog";
}

function onUpvote(queueId: string) {
  jukeboxClient.send({ type: "upvoteTrack", queueId });
}

function onRemoveVote(queueId: string) {
  jukeboxClient.send({ type: "removeVote", queueId });
}

function onRemoveTrack(queueId: string) {
  jukeboxClient.send({ type: "removeTrack", queueId });
}

// DJ Playback Controls
function togglePlay() {
  if (isPlaying.value) {
    jukeboxClient.send({ type: "pause" });
  } else {
    jukeboxClient.send({ type: "play" });
  }
}

function skip() {
  jukeboxClient.send({ type: "skip" });
}

function toggleKaraoke() {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: !karaokeEnabled.value,
    level: karaokeLevel.value,
  });
}

function setKaraokeLevel(level: number) {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: karaokeEnabled.value,
    level,
  });
}

function onSeek(time: number) {
  seekTo(time);
}

function onLockedSeekBarClick() {
  jukeboxClient.addToast("🎧 Unlock DJ role with passcode to scrub audio!", "info");
  isPasscodeModalOpen.value = true;
}

function updateVolume(val: number) {
  jukeboxClient.send({ type: "volume", value: val });
}

function onClaimRole(passcode: string) {
  jukeboxClient.claimRole(passcode);
  isPasscodeModalOpen.value = false;
}
</script>

<template>
  <div
    class="client-container max-w-[560px] mx-auto px-4 sm:px-6 pt-3 sm:pt-4 text-slate-100 flex flex-col"
    :class="activeTab === 'lyrics' ? 'h-[100dvh] pb-24 overflow-hidden gap-3' : 'min-h-screen pb-32 gap-4 sm:gap-5'"
  >
    <!-- Studio Top Header & Identity Capsule -->
    <header class="glass-panel shrink-0 px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-xl overflow-hidden border border-indigo-500/30 flex items-center justify-center bg-slate-900/60 shrink-0 shadow-inner">
          <img src="/logo.png" alt="IsThisOurJukebox Logo" class="w-full h-full object-cover" />
        </div>
        <div class="flex flex-col min-w-0">
          <h1 class="text-sm sm:text-base font-extrabold tracking-tight truncate leading-tight">IsThisOurJukebox</h1>
          <div class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span
              class="w-2 h-2 rounded-full transition-all duration-300"
              :class="status === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-400'"
            ></span>
            <span>{{ status === 'connected' ? 'Live on Air' : 'Reconnecting...' }}</span>
          </div>
        </div>
      </div>

      <!-- Tactile Identity Capsule: Role Badge + Nickname Editor -->
      <div class="flex items-center gap-2 shrink-0">
        <button
          class="role-badge px-2.5 py-1 active:scale-95 transition-transform cursor-pointer"
          :class="`role-${myRole}`"
          :title="`Current role: ${myRole.toUpperCase()} (Click to unlock DJ/Host remote)`"
          @click="isPasscodeModalOpen = true"
        >
          <UiIcon v-if="myRole === 'host'" name="crown" :size="12" />
          <UiIcon v-else-if="myRole === 'dj'" name="mic" :size="12" />
          <UiIcon v-else-if="myRole === 'vip'" name="star-filled" :size="12" />
          <UiIcon v-else name="user" :size="12" />
          <span class="font-bold uppercase tracking-wider text-[10px] sm:text-[11px]">{{ myRole }}</span>
        </button>

        <div class="nickname-wrapper">
          <button
            v-if="!isEditingNickname"
            class="glass-pill px-3 py-1 flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white transition-all active:scale-95"
            title="Click to edit your nickname"
            @click="startEditNickname"
          >
            <span class="max-w-[85px] sm:max-w-[120px] truncate">{{ nickname }}</span>
          </button>

          <div v-else class="glass-pill px-2 py-0.5 flex items-center gap-1 bg-white/10 border-indigo-400/50">
            <input
              v-model="nicknameInput"
              type="text"
              placeholder="Your name"
              maxlength="20"
              autofocus
              class="bg-transparent border-none outline-none text-xs text-white px-1.5 w-[85px] sm:w-[110px] font-medium"
              @keyup.enter="saveNickname"
              @keyup.escape="isEditingNickname = false"
            />
            <button
              class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center justify-center active:scale-90"
              title="Save Nickname"
              @click="saveNickname"
            >
              <UiIcon name="check" :size="11" :strokeWidth="2.5" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- SECTION: Pinned Now Playing Card (Shown on Queue and Catalog views) -->
    <section
      v-if="activeTab !== 'lyrics'"
      class="now-playing-card glass-panel relative overflow-hidden p-5 sm:p-6 rounded-3xl flex flex-col gap-4 shadow-xl"
    >
      <!-- Ambient Dynamic Backlight Projection -->
      <div
        class="ambient-glow"
        :style="{
          backgroundImage: nowPlaying?.thumbnail ? `url(${nowPlaying.thumbnail})` : 'none',
          opacity: isPlaying ? '0.45' : '0.2'
        }"
      ></div>

      <!-- Hero Body -->
      <div class="relative z-10 flex gap-4 items-center">
        <!-- Vinyl Cover Container -->
        <div class="vinyl-wrapper relative shrink-0" :class="{ 'is-playing': isPlaying }">
          <div class="vinyl-art w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-black/60 shadow-[0_8px_24px_rgba(0,0,0,0.6)] border border-white/10 relative">
            <img
              v-if="nowPlaying?.thumbnail"
              :src="nowPlaying.thumbnail"
              :alt="nowPlaying.title"
              class="w-full h-full object-cover select-none"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-slate-500 bg-obsidian-850">
              <UiIcon name="disc" :size="36" strokeWidth="1.2" class="empty-disc-icon" />
            </div>

            <!-- Sleek Live Status Beacon Pill on Top Corner -->
            <span
              v-if="isPlaying"
              class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/40 text-[9px] font-black tracking-wider text-emerald-400 flex items-center gap-1 uppercase"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE</span>
            </span>
          </div>
        </div>

        <!-- Track Metadata & Action Badges -->
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-0.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span v-if="nowPlaying?.requestedBy" class="glass-pill px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                <UiIcon name="user" :size="10" />
                <span class="truncate max-w-[120px]">{{ nowPlaying.requestedBy }}</span>
              </span>

              <span
                v-if="karaokeEnabled"
                class="glass-pill px-2.5 py-0.5 text-[11px] font-bold text-pink-300 bg-pink-500/15 border-pink-500/35 flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_6px_#f472b6] animate-pulse"></span>
                <span>Karaoke {{ karaokeLevel }}%</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                v-if="nowPlaying"
                class="glass-pill w-7 h-7 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                :class="isFavorite(nowPlaying.id) ? 'text-amber-400 bg-amber-400/15 border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]' : 'text-slate-400 hover:text-amber-300'"
                :title="isFavorite(nowPlaying.id) ? 'Remove Favorite' : 'Save to Favorites'"
                @click="toggleFavorite(nowPlaying)"
              >
                <UiIcon v-if="isFavorite(nowPlaying.id)" name="star-filled" :size="13" />
                <UiIcon v-else name="star" :size="13" />
              </button>

              <button
                v-if="nowPlaying"
                class="glass-pill px-2.5 py-1 flex items-center gap-1 text-[11px] font-semibold text-purple-300 hover:text-purple-200 active:scale-95 transition-all cursor-pointer"
                :class="{ 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_12px_rgba(236,72,153,0.3)]': karaokeEnabled }"
                title="View Synced Lyrics"
                @click="activeTab = 'lyrics'"
              >
                <UiIcon name="music" :size="11" />
                <span>Lyrics</span>
              </button>
            </div>
          </div>

          <h2 class="text-base sm:text-lg font-extrabold tracking-tight text-white truncate leading-snug">
            {{ nowPlaying?.title || "No track playing" }}
          </h2>
          <p class="text-xs sm:text-sm text-slate-400 truncate font-medium">
            {{ nowPlaying ? displayArtist : "Office speakers are resting. Add a track!" }}
          </p>

          <!-- Integrated Scrubber with breathing room -->
          <div v-if="nowPlaying" class="mt-3 pt-2.5 border-t border-white/5">
            <SeekBar
              :currentTime="currentTime"
              :duration="duration || nowPlaying?.duration || 0"
              :isPlaying="isPlaying"
              :canSeek="isDjOrHost"
              :compact="true"
              @seek="seekTo"
              @lockedClick="onLockedSeekBarClick"
            />
          </div>
        </div>
      </div>

      <!-- Mobile Karaoke Sing-Along Quick Card -->
      <transition name="list">
        <div
          v-if="karaokeEnabled && nowPlaying"
          class="relative z-10 glass-panel p-3 sm:p-3.5 rounded-2xl flex items-center justify-between gap-3 bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-indigo-500/15 border-pink-500/35 cursor-pointer active:scale-[0.98] transition-all hover:border-pink-400/60"
          @click="activeTab = 'lyrics'"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/40 text-pink-300 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(236,72,153,0.3)]">
              <UiIcon name="mic" :size="16" />
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold text-pink-200">Karaoke Mode Active</span>
                <span class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping"></span>
              </div>
              <span class="text-[11px] text-slate-300 truncate">Tap to sing along with live synchronized lyrics!</span>
            </div>
          </div>
          <button class="btn-primary text-xs px-3.5 py-1.5 shrink-0 bg-gradient-to-r from-pink-500 to-purple-600 shadow-[0_0_14px_rgba(236,72,153,0.4)]">
            <span>Sing</span>
            <UiIcon name="external-link" :size="11" />
          </button>
        </div>
      </transition>

      <!-- DJ & Host Studio Control Dock (Unlocked with Role) -->
      <div v-if="isDjOrHost && nowPlaying" class="relative z-10 mt-1 p-3.5 sm:p-4 rounded-2xl bg-purple-950/25 border border-purple-500/30 flex flex-col gap-3 shadow-inner">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-purple-300 text-xs font-bold uppercase tracking-wider">
            <UiIcon name="mic" :size="12" />
            <span>DJ REMOTE ACTIVE</span>
          </div>
          <span class="text-[11px] text-purple-400/80 font-medium">Controls room audio</span>
        </div>

        <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
          <!-- Play / Pause Button -->
          <button
            class="w-10 h-10 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-[0_4px_16px_rgba(255,255,255,0.3)] active:scale-95 transition-transform"
            :title="isPlaying ? 'Pause' : 'Play'"
            @click="togglePlay"
          >
            <UiIcon v-if="isPlaying" name="pause" :size="16" />
            <UiIcon v-else name="play" :size="16" />
          </button>

          <!-- Next Track Button -->
          <button class="btn-secondary px-3 py-2 text-xs font-semibold flex items-center gap-1.5" @click="skip">
            <span>Next</span>
            <UiIcon name="skip-forward" :size="12" />
          </button>

          <!-- Karaoke Toggle Switch -->
          <div class="flex items-center gap-2 glass-pill px-2.5 py-1.5 ml-auto">
            <span class="text-xs font-semibold text-slate-300 flex items-center gap-1">
              <UiIcon name="mic" :size="12" />
              <span>Vocal Cut</span>
            </span>
            <div
              class="spring-switch cursor-pointer"
              :class="{ active: karaokeEnabled }"
              @click="toggleKaraoke"
            >
              <div class="spring-switch-thumb"></div>
            </div>
          </div>

          <!-- Master Volume Slider -->
          <div class="flex items-center gap-2 glass-pill px-2.5 py-1.5">
            <UiIcon name="volume-2" :size="13" class="text-slate-400" />
            <input
              type="range"
              min="0"
              max="100"
              :value="volume"
              class="w-16 accent-indigo-500 cursor-pointer"
              @input="(e) => updateVolume(Number((e.target as HTMLInputElement).value))"
            />
            <span class="text-[11px] font-mono tabular-nums text-slate-300 w-8 text-right">{{ volume }}%</span>
          </div>
        </div>

        <!-- Vocal Cut Level Slider (When Karaoke Active) -->
        <div v-if="karaokeEnabled" class="pt-2 border-t border-purple-500/20 flex items-center justify-between gap-3 text-xs">
          <span class="text-purple-300 font-medium">Reduction: <strong class="text-pink-300 font-bold tabular-nums">{{ karaokeLevel }}%</strong></span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            :value="karaokeLevel"
            class="flex-1 max-w-[200px] accent-pink-500 cursor-pointer"
            @input="(e) => setKaraokeLevel(Number((e.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </section>

    <!-- MAIN DYNAMIC CONTENT (Page Transitions between Queue, Catalog, and Lyrics) -->
    <transition name="page-fade" mode="out-in">
      <!-- 1. QUEUE PAGE VIEW -->
      <div v-if="activeTab === 'queue'" key="queue" class="flex flex-col gap-4 sm:gap-5">
        <!-- Quick Action Hero Bar: Request or Explore Catalog -->
        <section class="grid grid-cols-2 gap-3">
          <button
            class="btn-primary w-full py-3.5 px-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(99,102,241,0.35)] active:scale-[0.98] transition-transform cursor-pointer"
            @click="openCatalog('')"
          >
            <UiIcon name="search" :size="15" :strokeWidth="2.4" />
            <span>Search & Request</span>
          </button>

          <button
            class="btn-secondary glass-pill w-full py-3.5 px-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 text-indigo-200 bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
            @click="openCatalog('')"
          >
            <UiIcon name="sparkles" :size="14" />
            <span>Browse Library</span>
          </button>
        </section>

        <!-- Live Democratic Queue & Vibe Station -->
        <section id="queue-section" class="flex flex-col gap-3">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-2">
              <div class="text-indigo-400">
                <UiIcon name="list-music" :size="17" />
              </div>
              <h3 class="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>Office Queue</span>
                <span class="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full bg-white/10 text-indigo-200">
                  {{ queue.length }}
                </span>
              </h3>
            </div>

            <div class="glass-pill px-3 py-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <UiIcon name="users" :size="12" />
              <span class="tabular-nums">{{ activeListeners }} listening</span>
            </div>
          </div>

          <!-- Empty State: The Obsidian Vibe Station -->
          <div v-if="queue.length === 0" class="empty-queue-station glass-panel p-6 sm:p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-4 border-dashed border-white/15">
            <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
              <UiIcon name="disc" :size="34" strokeWidth="1.2" class="empty-disc-icon" />
            </div>

            <div class="flex flex-col gap-1 max-w-sm">
              <h4 class="text-base sm:text-lg font-bold text-white tracking-tight">The Queue is Clear</h4>
              <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
                The room is waiting for your selection. Tap a trending hit below to request it in one tap:
              </p>
            </div>

            <!-- Quick-Pick Vibe Chips -->
            <div class="flex flex-wrap items-center justify-center gap-2 max-w-md my-1">
              <button
                v-for="vibe in quickPickVibes"
                :key="vibe.label"
                class="glass-pill px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-400/40 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                @click="triggerQuickPick(vibe.query)"
              >
                <UiIcon name="plus" :size="11" />
                <span>{{ vibe.label }}</span>
              </button>
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button class="btn-primary text-xs px-4 py-2 cursor-pointer" @click="openCatalog('')">
                <UiIcon name="search" :size="13" :strokeWidth="2.2" />
                <span>Search Music</span>
              </button>
              <button class="btn-secondary text-xs px-4 py-2 cursor-pointer" @click="openCatalog('')">
                <UiIcon name="sparkles" :size="13" />
                <span>Explore Catalog</span>
              </button>
            </div>
          </div>

          <!-- Populated Queue with Vue Transition Group -->
          <transition-group v-else name="list" tag="div" class="flex flex-col gap-2.5">
            <QueueCard
              v-for="item in queue"
              :key="item.queueId"
              :track="item"
              :isAdmin="myRole === 'host'"
              :userRole="myRole"
              :currentClientId="currentClientId"
              @upvote="onUpvote"
              @removeVote="onRemoveVote"
              @removeTrack="onRemoveTrack"
            />
          </transition-group>
        </section>
      </div>

      <!-- 2. CATALOG & MUSIC LIBRARY PAGE VIEW -->
      <div v-else-if="activeTab === 'catalog'" key="catalog">
        <CatalogView
          :nickname="nickname"
          :nowPlaying="nowPlaying"
          :initialQuery="prefillSearchQuery"
          @requestTrack="(track) => { /* Queued successfully, toast already shown */ }"
        />
      </div>

      <!-- 3. IMMERSIVE FULL-HEIGHT LYRICS PAGE VIEW -->
      <div v-else-if="activeTab === 'lyrics'" key="lyrics" class="flex-1 min-h-0 flex flex-col">
        <LyricsView
          class="flex-1 min-h-0"
          :track="nowPlaying"
          :currentTime="currentTime"
          :duration="duration"
          :isPlaying="isPlaying"
          :canSeek="isDjOrHost"
          :karaokeEnabled="karaokeEnabled"
          :karaokeLevel="karaokeLevel"
          @seek="onSeek"
          @back="activeTab = 'queue'"
        />
      </div>
    </transition>

    <!-- Emil Kowalski Tactile Floating Bottom Navigation Dock -->
    <nav class="fixed bottom-4 inset-x-0 mx-auto max-w-[420px] z-40 px-4 pointer-events-none">
      <div class="pointer-events-auto tactile-dock justify-between gap-1">
        <!-- Queue Tab -->
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="activeTab === 'queue' ? 'bg-white/15 text-white font-bold shadow-[0_0_14px_rgba(255,255,255,0.15)]' : 'text-slate-400 hover:text-slate-200 font-medium'"
          @click="activeTab = 'queue'"
        >
          <UiIcon name="list-music" :size="15" />
          <span>Queue</span>
          <span
            v-if="queue.length > 0"
            class="tabular-nums text-[10px] px-1.5 py-0.2 rounded-full font-mono ml-0.5"
            :class="activeTab === 'queue' ? 'bg-indigo-500/40 text-indigo-200' : 'bg-white/10 text-slate-300'"
          >
            {{ queue.length }}
          </span>
        </button>

        <!-- Catalog Tab -->
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="activeTab === 'catalog' ? 'bg-indigo-600/80 text-white font-bold shadow-[0_0_16px_rgba(99,102,241,0.4)]' : 'text-slate-400 hover:text-slate-200 font-medium'"
          @click="activeTab = 'catalog'"
        >
          <UiIcon name="sparkles" :size="14" />
          <span>Catalog</span>
        </button>

        <!-- Lyrics Tab -->
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="[
            activeTab === 'lyrics'
              ? 'bg-pink-600/80 text-white font-bold shadow-[0_0_16px_rgba(236,72,153,0.4)]'
              : 'text-slate-400 hover:text-slate-200 font-medium',
            karaokeEnabled && activeTab !== 'lyrics' ? 'text-pink-300' : ''
          ]"
          @click="activeTab = 'lyrics'"
        >
          <UiIcon name="mic" :size="14" />
          <span>Lyrics</span>
          <span
            v-if="karaokeEnabled"
            class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse ml-0.5"
          ></span>
        </button>
      </div>
    </nav>

    <!-- Passcode Modal (Keep for role authentication) -->
    <DjPasscodeModal
      :isOpen="isPasscodeModalOpen"
      :currentRole="myRole"
      @close="isPasscodeModalOpen = false"
      @claimRole="onClaimRole"
    />
  </div>
</template>

<style scoped>
/* Ambient Backlight Projection */
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

/* Vinyl Disc Tilt / Spin Interaction */
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

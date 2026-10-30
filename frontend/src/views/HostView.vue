<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRoute } from "vue-router";
import { jukeboxClient } from "../shared/ws.ts";
import { whoami, getYouTubeAuthStatus } from "../shared/api.ts";
import { registerModal, registerSearchFocus } from "../shared/useModalStack.ts";
import YouTubeAuthModal from "../components/auth/YouTubeAuthModal.vue";
import AudioEngine from "../components/AudioEngine.vue";
import Visualizer from "../components/Visualizer.vue";
import QueueCard from "../components/QueueCard.vue";
import CatalogView from "../components/CatalogView.vue";
import LyricsView from "../components/LyricsView.vue";
import QrPanel from "../components/QrPanel.vue";
import MemberDrawer from "../components/MemberDrawer.vue";
import UiIcon from "../components/UiIcon.vue";
import ReactionOverlay from "../components/ReactionOverlay.vue";
import ReactionDock from "../components/ReactionDock.vue";
import LeaderboardModal from "../components/rhythm/LeaderboardModal.vue";
import RhythmManiaModal from "../components/rhythm/RhythmManiaModal.vue";
import JukeChanStage from "../components/mascot/JukeChanStage.vue";
import PersonaCommandRibbon from "../components/persona/PersonaCommandRibbon.vue";
import PersonaNowPlayingGauge from "../components/persona/PersonaNowPlayingGauge.vue";
import PersonaOverlayPanel from "../components/persona/PersonaOverlayPanel.vue";
import PersonaGameCatalogView from "../components/persona/PersonaGameCatalogView.vue";
import { useJukeChanMood } from "../shared/useJukeChanMood.ts";
import { setSharedAnalyser, setPlaybackSync } from "../shared/jukechan/beatDriver.ts";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";
import { useFavorites } from "../shared/useFavorites.ts";
import { SHOW_OSU_MODE } from "../shared/config.ts";
import TriviaHostSetupModal from "../components/trivia/TriviaHostSetupModal.vue";
import TriviaModal from "../components/trivia/TriviaModal.vue";
import LyricBombModal from "../components/lyricbomb/LyricBombModal.vue";
import PersonaGameHubModal from "../components/persona/PersonaGameHubModal.vue";
import type { MemberRole, TriviaGameSettings } from "../shared/types.ts";

const route = useRoute();

const token = computed(() => {
  const q = route.query.token;
  let candidate = "";
  if (typeof q === "string" && q.trim()) {
    candidate = q.trim();
  } else if (Array.isArray(q) && typeof q[0] === "string" && q[0].trim()) {
    candidate = q[0].trim();
  }
  if (candidate) {
    try {
      localStorage.setItem("jukebox_admin_token", candidate);
    } catch {
      // ignore
    }
    return candidate;
  }
  try {
    return localStorage.getItem("jukebox_admin_token") || "";
  } catch {
    return "";
  }
});

watch(
  token,
  (tok) => {
    if (tok) {
      jukeboxClient.setToken(tok);
    }
  },
  { immediate: true }
);

type HostOverlay = "none" | "queue" | "catalog" | "lyrics" | "games" | "studio";
const activeOverlay = ref<HostOverlay>("none");

const isMemberDrawerOpen = ref(false);
const isLeaderboardModalOpen = ref(false);
const isRhythmModalOpen = ref(false);
const isTriviaHostSetupOpen = ref(false);
const isTriviaModalOpen = ref(false);
const isTriviaCreating = ref(false);
const isLyricBombModalOpen = ref(false);
const isGameHubOpen = ref(false);
const isYouTubeAuthModalOpen = ref(false);

const youtubeAuthStatus = computed(() => jukeboxClient.youtubeAuthStatus.value);
const triviaState = computed(() => jukeboxClient.triviaState.value);
const lbState = computed(() => jukeboxClient.lyricBombState.value);

watch(
  () => jukeboxClient.lyricBombState.value,
  (lbs) => {
    if (lbs && lbs.status !== "idle") {
      isLyricBombModalOpen.value = true;
    } else if (!lbs || lbs.status === "idle") {
      isLyricBombModalOpen.value = false;
    }
  }
);

function onOpenLyricBombHost() {
  if (lbState.value && lbState.value.status !== "idle") {
    isLyricBombModalOpen.value = true;
  } else {
    jukeboxClient.createLyricBomb();
    isLyricBombModalOpen.value = true;
  }
}

watch(triviaState, (ts) => {
  if (ts && ts.status !== "idle") {
    isTriviaCreating.value = false;
    isTriviaModalOpen.value = true;
  } else if (!ts || ts.status === "idle") {
    isTriviaCreating.value = false;
    isTriviaModalOpen.value = false;
  }
});

// Tutup loading jika ada error toast dari backend
watch(
  () => jukeboxClient.toasts.value.length,
  () => {
    const lastToast = jukeboxClient.toasts.value[jukeboxClient.toasts.value.length - 1];
    if (isTriviaCreating.value && lastToast && (lastToast.type === "error" || lastToast.type === "warning")) {
      isTriviaCreating.value = false;
    }
  }
);

function onOpenTriviaHost() {
  if (triviaState.value && triviaState.value.status !== "idle") {
    isTriviaModalOpen.value = true;
  } else {
    isTriviaHostSetupOpen.value = true;
  }
}

function onCreateTriviaGame(settings: TriviaGameSettings) {
  isTriviaHostSetupOpen.value = false;
  isTriviaCreating.value = true;
  jukeboxClient.createTriviaLobby(settings);

  setTimeout(() => {
    if (isTriviaCreating.value && (!triviaState.value || triviaState.value.status === "idle")) {
      isTriviaCreating.value = false;
    }
  }, 15000);
}

const prefillCatalogQuery = ref("");
const analyserNode = ref<AnalyserNode | null>(null);
const clientUrl = ref("");
const lanUrl = ref("");
const publicUrl = ref<string | null>(null);
const tunnelMode = ref("off");
const hostNickname = ref("Host DJ 🎧");

const { isFavorite, toggleFavorite } = useFavorites();

const crossfadeEnabled = ref(localStorage.getItem("jukebox_crossfade_enabled") !== "false");
const crossfadeDuration = ref(Number(localStorage.getItem("jukebox_crossfade_duration")) || 4);

const effectiveCrossfadeDuration = computed(() => {
  return crossfadeEnabled.value ? crossfadeDuration.value : 0;
});

function toggleCrossfade() {
  crossfadeEnabled.value = !crossfadeEnabled.value;
  localStorage.setItem("jukebox_crossfade_enabled", String(crossfadeEnabled.value));
}

function setCrossfadeDuration(val: number) {
  crossfadeDuration.value = val;
  localStorage.setItem("jukebox_crossfade_duration", String(val));
}

const state = computed(() => jukeboxClient.state.value);
const nowPlaying = computed(() => state.value?.nowPlaying ?? null);
const isPlaying = computed(() => state.value?.isPlaying ?? false);
const queue = computed(() => state.value?.queue ?? []);
const history = computed(() => state.value?.history ?? []);
const volume = computed(() => state.value?.volume ?? 80);
const autoDjEnabled = computed(() => state.value?.autoDjEnabled ?? true);
const karaokeEnabled = computed(() => state.value?.karaokeEnabled ?? false);
const karaokeLevel = computed(() => state.value?.karaokeLevel ?? 90);
const outputMode = computed(() => state.value?.outputMode ?? "browser");
const activeListeners = computed(() => state.value?.activeListeners ?? 1);
const members = computed(() => state.value?.members ?? []);
const headphoneCount = computed(() => members.value.filter((m) => m.isListening).length);
const status = computed(() => jukeboxClient.status.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);

const quickPickVibes = [
  { label: "Sheila On 7", query: "Sheila On 7 Dan" },
  { label: "Dewa 19", query: "Dewa 19 Kangen" },
  { label: "Queen", query: "Queen Bohemian Rhapsody" },
  { label: "Coldplay", query: "Coldplay Fix You" },
  { label: "Bruno Mars", query: "Bruno Mars Just The Way You Are" },
  { label: "City Pop", query: "Miki Matsubara Stay With Me" },
  { label: "Anime Hits", query: "Yoasobi Idol" },
];

const {
  currentTime,
  duration,
  seekTo,
  setDirectTime,
} = usePlaybackProgress({
  track: nowPlaying,
  isPlaying,
  onSeek: (time) => {
    jukeboxClient.send({ type: "seek", time, token: token.value });
  },
});

function onAudioTimeUpdate(cur: number, dur: number) {
  setDirectTime(cur, dur);
  setPlaybackSync(isPlaying.value, cur);
}

const allowRemoteAudio = computed(() => state.value?.allowRemoteAudio ?? true);

const {
  detectMood,
  onComboSurge,
  onMemberJoined,
  onTrackSkipped,
  onTabSwitch,
  onTrackRequested,
  onTrackUpvoted,
  onKaraokeToggled,
  startIdleLoop,
  stopIdleLoop,
} = useJukeChanMood();

let prevMemberIds = new Set<string>();
watch(
  members,
  (list) => {
    const currentIds = new Set(list.map((m) => m.clientId));
    if (prevMemberIds.size > 0 && list.length > prevMemberIds.size) {
      const newest = list.find((m) => !prevMemberIds.has(m.clientId));
      onMemberJoined(newest?.nickname);
    }
    prevMemberIds = currentIds;
  },
  { deep: true }
);

function toggleOverlay(tab: Exclude<HostOverlay, "none">) {
  if (activeOverlay.value === tab) {
    activeOverlay.value = "none";
  } else {
    activeOverlay.value = tab;
    if (tab === "queue" || tab === "catalog" || tab === "lyrics") {
      onTabSwitch(tab);
    }
  }
}

function closeOverlay() {
  activeOverlay.value = "none";
}

function bindModalToStack(isOpenRef: { value: boolean }, id: string) {
  let unreg: (() => void) | null = null;
  watch(
    () => isOpenRef.value,
    (open) => {
      if (unreg) {
        unreg();
        unreg = null;
      }
      if (open) {
        unreg = registerModal(id, () => {
          isOpenRef.value = false;
        });
      }
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    if (unreg) {
      unreg();
      unreg = null;
    }
  });
}

bindModalToStack(isYouTubeAuthModalOpen, "host-yt-auth");
bindModalToStack(isMemberDrawerOpen, "host-members");
bindModalToStack(isGameHubOpen, "host-gamehub");
bindModalToStack(isLeaderboardModalOpen, "host-leaderboard");
bindModalToStack(isRhythmModalOpen, "host-rhythm");
bindModalToStack(isTriviaHostSetupOpen, "host-trivia-setup");
bindModalToStack(isTriviaModalOpen, "host-trivia");
bindModalToStack(isLyricBombModalOpen, "host-lyricbomb");

let unregisterOverlay: (() => void) | null = null;
watch(activeOverlay, (val) => {
  if (unregisterOverlay) {
    unregisterOverlay();
    unregisterOverlay = null;
  }
  if (val !== "none") {
    unregisterOverlay = registerModal("host-overlay", () => {
      closeOverlay();
    });
  }
});
onBeforeUnmount(() => {
  if (unregisterOverlay) {
    unregisterOverlay();
    unregisterOverlay = null;
  }
});

let unregisterSearch: (() => void) | null = null;
onMounted(() => {
  unregisterSearch = registerSearchFocus(() => {
    if (activeOverlay.value !== "catalog") {
      activeOverlay.value = "catalog";
      onTabSwitch("catalog");
    }
    nextTick(() => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '.search-input, input[type="text"][placeholder*="Search"], input[type="text"][placeholder*="Cari"]'
      );
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });
  });
});
onBeforeUnmount(() => {
  if (unregisterSearch) {
    unregisterSearch();
    unregisterSearch = null;
  }
});

function handleGlobalKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.key === "1") toggleOverlay("queue");
  else if (e.key === "2") toggleOverlay("catalog");
  else if (e.key === "3") toggleOverlay("lyrics");
  else if (e.key === "4") toggleOverlay("games");
  else if (e.key === "5") toggleOverlay("studio");
}

function handleTrackRequested(track: { title: string }) {
  onTrackRequested(track.title);
}

function handleHostUpvote(queueId: string) {
  const item = queue.value.find((q) => q.queueId === queueId);
  onTrackUpvoted(item?.title);
  onUpvote(queueId);
}

watch(
  [nowPlaying, () => nowPlaying.value?.mood, () => nowPlaying.value?.genre],
  () => {
    detectMood(nowPlaying.value, analyserNode.value);
  },
  { immediate: true, deep: true }
);

watch(analyserNode, (node) => {
  if (node && nowPlaying.value) {
    detectMood(nowPlaying.value, node);
  }
});

onMounted(async () => {
  startIdleLoop();
  window.addEventListener("keydown", handleGlobalKeydown);
  if (token.value) {
    jukeboxClient.setToken(token.value);
  }
  jukeboxClient.connect(token.value);

  getYouTubeAuthStatus().then((s) => {
    jukeboxClient.youtubeAuthStatus.value = s;
  });

  try {
    const info = await whoami();
    lanUrl.value = `http://${info.lanIp}:${info.port}/`;

    const isCustomOrigin =
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1" &&
      window.location.hostname !== info.lanIp;

    const detectedPublic = info.publicUrl || (isCustomOrigin ? `${window.location.origin}/` : null);
    publicUrl.value = detectedPublic;
    tunnelMode.value = info.tunnelMode || (detectedPublic ? (detectedPublic.includes("trycloudflare.com") ? "quick" : "named") : "off");
    clientUrl.value = detectedPublic || lanUrl.value;
  } catch (err) {
    console.warn("[host] whoami error:", err);
  }
});

onBeforeUnmount(() => {
  stopIdleLoop();
  window.removeEventListener("keydown", handleGlobalKeydown);
});

watch(
  () => state.value?.publicUrl,
  (val) => {
    if (val) {
      publicUrl.value = val;
      if (state.value?.tunnelMode) tunnelMode.value = state.value.tunnelMode;
      clientUrl.value = val;
    }
  }
);

function toggleRemoteAudio() {
  jukeboxClient.send({
    type: "toggleRemoteAudio",
    enabled: !allowRemoteAudio.value,
    token: token.value,
  });
}

function onAnalyserReady(node: AnalyserNode) {
  analyserNode.value = node;
  setSharedAnalyser(node);
}

// Transport controls
function togglePlay() {
  if (isPlaying.value) {
    jukeboxClient.send({ type: "pause", token: token.value });
  } else {
    jukeboxClient.send({ type: "play", token: token.value });
  }
}

function skip() {
  onTrackSkipped();
  jukeboxClient.send({ type: "skip", token: token.value });
}

function updateVolume(val: number) {
  jukeboxClient.send({ type: "volume", value: val, token: token.value });
}

function toggleAutoDj() {
  jukeboxClient.send({ type: "toggleAutoDj", enabled: !autoDjEnabled.value, token: token.value });
}

function toggleKaraoke() {
  onKaraokeToggled(!karaokeEnabled.value);
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: !karaokeEnabled.value,
    level: karaokeLevel.value,
    token: token.value,
  });
}

function setKaraokeLevel(level: number) {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: karaokeEnabled.value,
    level,
    token: token.value,
  });
}

function setOutputMode(mode: "browser" | "native") {
  jukeboxClient.send({ type: "setOutputMode", mode, token: token.value });
}

function removeTrack(queueId: string) {
  jukeboxClient.send({ type: "removeTrack", queueId, token: token.value });
}

function onUpvote(queueId: string) {
  jukeboxClient.send({ type: "upvoteTrack", queueId });
}

function onRemoveVote(queueId: string) {
  jukeboxClient.send({ type: "removeVote", queueId });
}

function onSetRole(targetClientId: string, role: MemberRole) {
  jukeboxClient.setMemberRole(targetClientId, role);
}

function onSetDjPasscode(passcode: string) {
  jukeboxClient.setDjPasscode(passcode);
}

function triggerQuickPick(query: string) {
  prefillCatalogQuery.value = query;
  activeOverlay.value = "catalog";
  onTabSwitch("catalog");
}

function reRequestTrack(title: string, artist: string) {
  prefillCatalogQuery.value = `${title} ${artist}`;
  activeOverlay.value = "catalog";
  onTabSwitch("catalog");
}

const isSurging = ref(false);
const surgeEmoji = ref("🔥");
let surgeResetTimer: ReturnType<typeof setTimeout> | null = null;

function onMilestoneSurge(payload: { combo: number; emoji: string }) {
  isSurging.value = true;
  surgeEmoji.value = payload.emoji;
  onComboSurge(payload.combo, payload.emoji);
  if (surgeResetTimer) clearTimeout(surgeResetTimer);
  surgeResetTimer = setTimeout(() => {
    isSurging.value = false;
  }, 1800);
}
</script>

<template>
  <div class="host-container min-h-[100dvh] lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 text-slate-100 flex flex-col gap-3.5 select-none">
    <!-- Invisible Web Audio DSP Player -->
    <AudioEngine
      v-if="outputMode === 'browser'"
      :track="nowPlaying"
      :isPlaying="isPlaying && !isTriviaModalOpen && !isLyricBombModalOpen"
      :volume="volume"
      :karaokeEnabled="karaokeEnabled"
      :karaokeLevel="karaokeLevel"
      :crossfadeDuration="effectiveCrossfadeDuration"
      @analyserReady="onAnalyserReady"
      @timeUpdate="onAudioTimeUpdate"
    />

    <!-- =================================================================== -->
    <!-- PERSONA 5 HOST TOP HEADER BAR                                       -->
    <!-- =================================================================== -->
    <header
      class="shrink-0 px-4 sm:px-6 py-2.5 sm:py-3 bg-[#0b0b14] border-2 border-white flex items-center justify-between gap-3 shadow-[6px_6px_0px_#000000] relative z-30"
      style="transform: skewX(-2deg);"
    >
      <!-- Left: Brand Logo & Host Studio Beacon -->
      <div class="flex items-center gap-3 min-w-0" style="transform: skewX(2deg);">
        <div
          class="w-9 h-9 border-2 border-white flex items-center justify-center bg-[#e60012] shrink-0 shadow-[2px_2px_0px_#000]"
          style="transform: skewX(-12deg);"
        >
          <img src="/logo.png" alt="IsThisOurJukebox Logo" class="w-full h-full object-cover p-0.5" />
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-sm sm:text-base font-black italic tracking-wide text-white leading-tight uppercase flex items-center gap-1.5">
              <span>ISTHISOURJUKEBOX</span>
              <span class="text-[#e60012] font-black text-xs">P5</span>
            </h1>

            <span
              class="px-2 py-0.5 bg-amber-400 text-black border border-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-[2px_2px_0px_#000]"
              style="transform: skewX(-12deg);"
            >
              <UiIcon name="crown" :size="11" />
              <span>HOST STUDIO</span>
            </span>
          </div>

          <div class="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold text-slate-300">
            <span
              class="w-2 h-2 rounded-full transition-all duration-300 shrink-0"
              :class="status === 'connected' ? 'bg-[#10b981] shadow-[0_0_8px_#10b981] animate-pulse' : 'bg-amber-400'"
            ></span>
            <span>{{ status === 'connected' ? 'LIVE ON AIR' : status.toUpperCase() }}</span>
            <span class="text-slate-600">•</span>
            <span class="text-slate-300 tabular-nums">
              {{ members.length || activeListeners }} IN ROOM
              <span v-if="headphoneCount > 0" class="text-emerald-400">
                | 🎧 {{ headphoneCount }} (~{{ headphoneCount * 128 }}k)
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- Right: Host Action Deck (Reactions, YouTube Auth, Games, Members) -->
      <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end" style="transform: skewX(2deg);">
        <!-- Live Room Reactions Dock -->
        <ReactionDock :compact="true" class="hidden xl:flex" />

        <!-- Rhythm Game Leaderboard Button -->
        <button
          v-if="SHOW_OSU_MODE"
          type="button"
          class="h-8 px-2.5 bg-amber-400 hover:bg-white text-black border-2 border-white font-black text-xs uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-12deg);"
          title="Lihat Papan Peringkat osu!mania 4K"
          aria-label="Lihat Papan Peringkat osu!mania 4K"
          @click="isLeaderboardModalOpen = true"
        >
          <span>🏆 RANK</span>
        </button>

        <!-- YouTube Bot Bypass Status & Auth Button -->
        <button
          type="button"
          class="h-8 px-3 border-2 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
          :class="
            youtubeAuthStatus?.hasCookies
              ? 'bg-[#10b981] text-black border-white hover:bg-white'
              : 'bg-[#e60012] text-white border-white hover:bg-white hover:text-black'
          "
          style="transform: skewX(-12deg);"
          title="Status Akun YouTube & Anti-Bot Cookies"
          aria-label="Status Akun YouTube & Anti-Bot Cookies"
          @click="isYouTubeAuthModalOpen = true"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="youtubeAuthStatus?.hasCookies ? 'bg-black animate-pulse' : 'bg-white'"
          ></span>
          <span class="hidden sm:inline">YT:</span>
          <span>{{ youtubeAuthStatus?.hasCookies ? 'AKTIF' : 'LOGIN YT' }}</span>
        </button>

        <!-- Katalog Game Hub Button -->
        <button
          type="button"
          class="h-8 px-3 border-2 border-white bg-[#e60012] hover:bg-white text-white hover:text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-12deg);"
          title="Buka Katalog Minigame Kantor (Tebak Lagu, Lyric Bomb & lainnya)"
          aria-label="Buka Katalog Minigame Kantor"
          @click="isGameHubOpen = true"
        >
          <span>🎮 GAMES</span>
        </button>

        <!-- Room Member Management Drawer Button -->
        <button
          type="button"
          class="h-8 px-3 border-2 border-white bg-[#00e5ff] hover:bg-white text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-12deg);"
          title="Kelola member ruangan & DJ passcode"
          aria-label="Kelola member ruangan dan DJ passcode"
          @click="isMemberDrawerOpen = true"
        >
          <UiIcon name="users" :size="13" />
          <span class="tabular-nums">{{ members.length || activeListeners }}</span>
          <span class="hidden sm:inline">MEMBERS</span>
        </button>
      </div>
    </header>

    <!-- =================================================================== -->
    <!-- MAIN FULL-SCREEN PERSONA 5 BATTLE STAGE GRID                        -->
    <!-- =================================================================== -->
    <main class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch relative overflow-hidden">
      <!-- LEFT SECTION: Juke-chan Centerpiece + 5 Persona Command Ribbons -->
      <section
        class="transition-all duration-300 flex flex-col justify-between gap-3 h-full min-h-0 overflow-hidden"
        :class="activeOverlay === 'none' ? 'lg:col-span-7 xl:col-span-7' : 'lg:col-span-5 xl:col-span-5'"
      >
        <!-- Grand Persona Stage Canvas -->
        <div class="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          <JukeChanStage
            class="flex-1 h-full min-h-0"
            :track="nowPlaying"
            :isPlaying="isPlaying"
            :compact="activeOverlay !== 'none'"
            :fullScreen="true"
            :interactive="true"
            :sideLayout="activeOverlay !== 'none'"
          >
            <template #commands>
              <!-- Ribbon 1: Queue & History -->
              <PersonaCommandRibbon
                label="QUEUE // PLAYLIST"
                sublabel="SYS.PLAYLIST_VOTES"
                icon="list-music"
                color="red"
                :active="activeOverlay === 'queue'"
                :badge="queue.length"
                shortcut="1"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('queue')"
              />

              <!-- Ribbon 2: Catalog & Discovery -->
              <PersonaCommandRibbon
                label="CATALOG // SEARCH"
                sublabel="ARCHIVE.DISCOVERY"
                icon="sparkles"
                color="cyan"
                :active="activeOverlay === 'catalog'"
                shortcut="2"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('catalog')"
              />

              <!-- Ribbon 3: Live Lyrics & Karaoke -->
              <PersonaCommandRibbon
                label="LYRICS // VOCAL"
                sublabel="VOCAL.SYNC_FEED"
                icon="mic"
                color="yellow"
                :active="activeOverlay === 'lyrics'"
                :badge="karaokeEnabled ? `${karaokeLevel}%` : undefined"
                shortcut="3"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('lyrics')"
              />

              <!-- Ribbon 4: Games Arcade Center -->
              <PersonaCommandRibbon
                label="GAMES // ARCADE"
                sublabel="MINIGAME_CENTER"
                icon="crown"
                color="red"
                :active="activeOverlay === 'games'"
                shortcut="4"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('games')"
              />

              <!-- Ribbon 5: Studio DSP Config (Host Exclusive) -->
              <PersonaCommandRibbon
                label="STUDIO // CONFIG"
                sublabel="HOST.DSP_CONTROLS"
                icon="sliders"
                color="cyan"
                :active="activeOverlay === 'studio'"
                shortcut="5"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('studio')"
              />
            </template>
          </JukeChanStage>
        </div>

        <!-- Quick Trending Vibes Station (Persona Slanted Pill Deck) -->
        <div
          class="bg-[#0b0b14] border-2 border-white p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-[5px_5px_0px_#000] shrink-0"
          style="transform: skewX(-2deg);"
        >
          <div class="flex items-center gap-2 shrink-0">
            <span class="w-2 h-2 bg-[#e60012] rotate-45"></span>
            <span class="text-xs font-black italic tracking-wider text-white uppercase">TRENDING VIBES:</span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="vibe in quickPickVibes"
              :key="vibe.label"
              type="button"
              class="px-2.5 py-1 bg-black border border-white/40 hover:border-[#00e5ff] hover:text-[#00e5ff] text-slate-300 text-[11px] font-bold uppercase transition-all cursor-pointer active:scale-95 shadow-[2px_2px_0px_#000]"
              style="transform: skewX(-10deg);"
              @click="triggerQuickPick(vibe.query)"
            >
              + {{ vibe.label }}
            </button>
          </div>
        </div>
      </section>

      <!-- RIGHT SECTION: Persona 5 Standby HUD OR Dynamic Overlay Panel -->
      <section
        class="transition-all duration-300 flex flex-col gap-3.5 min-w-0 h-full min-h-0 overflow-hidden"
        :class="activeOverlay === 'none' ? 'lg:col-span-5 xl:col-span-5' : 'lg:col-span-7 xl:col-span-7'"
      >
        <!-- =============================================================== -->
        <!-- STANDBY MODE: HP/SP Gauge + Live Spectrum + QR Connect + DSP    -->
        <!-- =============================================================== -->
        <div v-if="activeOverlay === 'none'" class="flex flex-col gap-3.5 justify-between h-full min-h-0 overflow-y-auto pr-1">
          <!-- 1. Persona 5 Now Playing HP/SP Battle Gauge + Live Visualizer -->
          <PersonaNowPlayingGauge
            :track="nowPlaying"
            :isPlaying="isPlaying"
            :isDjOrHost="true"
            :karaokeEnabled="karaokeEnabled"
            :karaokeLevel="karaokeLevel"
            :volume="volume"
            :currentTime="currentTime"
            :duration="duration || nowPlaying?.duration || 0"
            :isFavorite="nowPlaying ? isFavorite(nowPlaying.id) : false"
            :isTunedIn="false"
            :isMuted="false"
            :personalVolume="volume"
            :hideHeadphoneToggle="true"
            @toggleFavorite="nowPlaying && toggleFavorite(nowPlaying)"
            @openLyrics="toggleOverlay('lyrics')"
            @seek="seekTo"
            @togglePlay="togglePlay"
            @skip="skip"
            @toggleKaraoke="toggleKaraoke"
            @setKaraokeLevel="setKaraokeLevel"
            @updateVolume="updateVolume"
          >
            <template #visualizer>
              <div class="flex flex-col gap-1 pt-0.5">
                <div class="flex items-center justify-between text-[10px] font-black font-mono">
                  <div class="flex items-center gap-1.5 text-white">
                    <span class="px-1 bg-[#00e5ff] text-black text-[9px] font-black rounded-xs">DSP</span>
                    <span class="tracking-wider">AUDIO_SPECTRUM // {{ outputMode.toUpperCase() }}</span>
                  </div>
                  <span v-if="karaokeEnabled" class="text-pink-400 font-bold">
                    VOCAL CUT {{ karaokeLevel }}%
                  </span>
                  <span v-else class="text-cyan-400 font-bold">
                    {{ autoDjEnabled ? 'AUTO-DJ ON' : 'MANUAL DJ' }}
                  </span>
                </div>
                <div
                  class="h-8 bg-black/90 border border-white/30 overflow-hidden flex items-center justify-center px-1"
                  style="transform: skewX(-10deg);"
                >
                  <Visualizer :analyser="analyserNode" :isPlaying="isPlaying" />
                </div>
              </div>
            </template>
          </PersonaNowPlayingGauge>

          <!-- 2. Persona 5 QR Share Panel -->
          <QrPanel
            v-if="clientUrl"
            :url="clientUrl"
            :lanUrl="lanUrl"
            :publicUrl="publicUrl"
            :tunnelMode="tunnelMode"
          />

          <!-- 3. Quick Host DSP Status & Emotes Bar -->
          <div
            class="bg-[#0b0b14] border-2 border-white p-3.5 flex flex-col gap-2.5 shadow-[6px_6px_0px_#000] shrink-0"
            style="transform: skewX(-2deg);"
          >
            <div class="flex items-center justify-between border-b border-white/20 pb-1.5">
              <div class="flex items-center gap-1.5 text-xs font-black uppercase text-white">
                <span class="text-[#00e5ff]">⚡</span>
                <span>STUDIO DSP // QUICK TOGGLES</span>
              </div>
              <button
                type="button"
                class="px-2 py-0.5 bg-[#e60012] hover:bg-white text-white hover:text-black border border-white text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                style="transform: skewX(-10deg);"
                @click="toggleOverlay('studio')"
              >
                [5] FULL CONFIG
              </button>
            </div>

            <!-- 1-Tap Host Toggles Row -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                class="py-1.5 px-2 border text-[10px] font-black uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer active:scale-95"
                :class="
                  autoDjEnabled
                    ? 'bg-[#10b981] text-black border-white shadow-[2px_2px_0px_#000]'
                    : 'bg-black text-slate-400 border-white/30 hover:text-white'
                "
                style="transform: skewX(-8deg);"
                @click="toggleAutoDj"
              >
                <span>AUTO-DJ</span>
                <span>{{ autoDjEnabled ? 'ON' : 'OFF' }}</span>
              </button>

              <button
                type="button"
                class="py-1.5 px-2 border text-[10px] font-black uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer active:scale-95"
                :class="
                  crossfadeEnabled
                    ? 'bg-[#00e5ff] text-black border-white shadow-[2px_2px_0px_#000]'
                    : 'bg-black text-slate-400 border-white/30 hover:text-white'
                "
                style="transform: skewX(-8deg);"
                @click="toggleCrossfade"
              >
                <span>XFADE</span>
                <span>{{ crossfadeEnabled ? `${crossfadeDuration}S` : 'OFF' }}</span>
              </button>

              <button
                type="button"
                class="py-1.5 px-2 border text-[10px] font-black uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer active:scale-95"
                :class="
                  outputMode === 'browser'
                    ? 'bg-amber-400 text-black border-white shadow-[2px_2px_0px_#000]'
                    : 'bg-purple-600 text-white border-white shadow-[2px_2px_0px_#000]'
                "
                style="transform: skewX(-8deg);"
                @click="setOutputMode(outputMode === 'browser' ? 'native' : 'browser')"
              >
                <span>OUT</span>
                <span>{{ outputMode.toUpperCase() }}</span>
              </button>

              <button
                type="button"
                class="py-1.5 px-2 border text-[10px] font-black uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer active:scale-95"
                :class="
                  allowRemoteAudio
                    ? 'bg-[#10b981] text-black border-white shadow-[2px_2px_0px_#000]'
                    : 'bg-[#e60012] text-white border-white shadow-[2px_2px_0px_#000]'
                "
                style="transform: skewX(-8deg);"
                @click="toggleRemoteAudio"
              >
                <span>STREAM</span>
                <span>{{ allowRemoteAudio ? 'ON' : 'MUTE' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- =============================================================== -->
        <!-- OVERLAY MODE: Slanted Persona 5 Panel with [O BACK]             -->
        <!-- =============================================================== -->
        <div v-else class="h-full min-h-0 flex flex-col overflow-hidden">
          <!-- 1. QUEUE & RECENTLY PLAYED OVERLAY -->
          <PersonaOverlayPanel
            v-if="activeOverlay === 'queue'"
            title="QUEUE // DAFTAR LAGU"
            subtitle="DEMOCRATIC_PLAYLIST_AND_HISTORY"
            icon="list-music"
            color="red"
            :badge="queue.length"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <div class="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-5">
              <!-- Empty Queue State -->
              <div
                v-if="queue.length === 0"
                class="bg-[#141424] border-2 border-dashed border-white/30 p-6 sm:p-8 flex flex-col items-center justify-center text-center gap-4 shadow-[4px_4px_0px_#000]"
              >
                <div class="w-14 h-14 bg-[#e60012] border-2 border-white flex items-center justify-center text-white shadow-[3px_3px_0px_#000]" style="transform: skewX(-10deg);">
                  <UiIcon name="disc" :size="30" />
                </div>
                <div class="flex flex-col gap-1 max-w-md">
                  <h4 class="text-base font-black italic uppercase text-white tracking-wide">
                    ANTREAN KOSONG // STANDBY
                  </h4>
                  <p class="text-xs text-slate-300 leading-relaxed">
                    Rekan kantor dapat memindai QR Code untuk request & vote lagu, atau pilih langsung dari katalog di bawah:
                  </p>
                </div>

                <div class="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                  <button
                    v-for="vibe in quickPickVibes"
                    :key="vibe.label"
                    type="button"
                    class="px-3 py-1 bg-black border border-white/40 hover:border-[#00e5ff] hover:text-[#00e5ff] text-xs font-black uppercase text-white transition-all cursor-pointer active:scale-95"
                    style="transform: skewX(-10deg);"
                    @click="triggerQuickPick(vibe.query)"
                  >
                    + {{ vibe.label }}
                  </button>
                </div>

                <button
                  type="button"
                  class="px-5 py-2 bg-[#00e5ff] hover:bg-white text-black border-2 border-white font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer active:scale-95 shadow-[4px_4px_0px_#000]"
                  style="transform: skewX(-10deg);"
                  @click="toggleOverlay('catalog')"
                >
                  <UiIcon name="sparkles" :size="14" />
                  <span>BUKA KATALOG LAGU</span>
                </button>
              </div>

              <!-- Active Queue Cards -->
              <transition-group v-else name="list" tag="div" class="flex flex-col gap-2.5">
                <QueueCard
                  v-for="item in queue"
                  :key="item.queueId"
                  :track="item"
                  :isAdmin="true"
                  :userRole="'host'"
                  :currentClientId="currentClientId"
                  @upvote="handleHostUpvote"
                  @removeVote="onRemoveVote"
                  @removeTrack="removeTrack"
                />
              </transition-group>

              <!-- Recently Played History Shelf (Persona 5 Style) -->
              <div
                v-if="history.length > 0"
                class="bg-[#141424] border-2 border-white/40 p-4 flex flex-col gap-3 shadow-[5px_5px_0px_#000]"
              >
                <div class="flex items-center justify-between border-b border-white/20 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-[#00e5ff] rotate-45"></span>
                    <h3 class="text-xs sm:text-sm font-black italic uppercase tracking-wider text-white">
                      RECENTLY PLAYED // RIWAYAT LAGU
                    </h3>
                  </div>
                  <span class="text-[10px] font-mono font-bold text-cyan-400 uppercase">
                    {{ history.length }} TRACKS
                  </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div
                    v-for="item in history.slice(0, 6)"
                    :key="item.queueId"
                    class="bg-[#0b0b14] border border-white/30 hover:border-white p-2.5 flex items-center gap-3 transition-all shadow-[3px_3px_0px_#000]"
                  >
                    <div class="w-10 h-10 bg-black border border-white/40 shrink-0 overflow-hidden">
                      <img v-if="item.thumbnail" :src="item.thumbnail" class="w-full h-full object-cover" alt="" />
                      <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                        <UiIcon name="music" :size="14" />
                      </div>
                    </div>
                    <div class="flex-1 min-w-0 flex flex-col">
                      <span class="text-xs font-black text-white truncate" :title="item.title">{{ item.title }}</span>
                      <span class="text-[10px] font-mono text-slate-400 truncate">{{ item.artist }}</span>
                    </div>
                    <button
                      type="button"
                      class="w-7 h-7 bg-[#e60012] hover:bg-white text-white hover:text-black border border-white flex items-center justify-center font-black cursor-pointer active:scale-90 shrink-0"
                      style="transform: skewX(-8deg);"
                      title="Putar ulang / cari di katalog"
                      @click="reRequestTrack(item.title, item.artist)"
                    >
                      <UiIcon name="plus" :size="12" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </PersonaOverlayPanel>

          <!-- 2. CATALOG OVERLAY -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'catalog'"
            title="CATALOG // CARI LAGU"
            subtitle="GLOBAL_MUSIC_ARCHIVE"
            icon="sparkles"
            color="cyan"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <CatalogView
              class="flex-1 min-h-0 overflow-y-auto pr-1"
              :nickname="hostNickname"
              :nowPlaying="nowPlaying"
              :initialQuery="prefillCatalogQuery"
              @requestTrack="handleTrackRequested"
            />
          </PersonaOverlayPanel>

          <!-- 3. LYRICS OVERLAY -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'lyrics'"
            title="LYRICS // VOCAL KARAOKE"
            subtitle="REALTIME_SYNCHRONIZED_TEXT"
            icon="mic"
            color="purple"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <LyricsView
              class="flex-1 min-h-0 h-full"
              :track="nowPlaying"
              :currentTime="currentTime"
              :duration="duration"
              :isPlaying="isPlaying"
              :canSeek="true"
              :karaokeEnabled="karaokeEnabled"
              :karaokeLevel="karaokeLevel"
              @seek="seekTo"
              @back="closeOverlay"
            />
          </PersonaOverlayPanel>

          <!-- 4. GAMES ARCADE OVERLAY -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'games'"
            title="GAMES // ARCADE CENTER"
            subtitle="OFFICE_MINIGAME_HUB"
            icon="crown"
            color="red"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <PersonaGameCatalogView
              class="flex-1 min-h-0 overflow-y-auto pr-1"
              :isDjOrHost="true"
              :triviaState="triviaState"
              :showOsuMode="SHOW_OSU_MODE"
              @openTrivia="onOpenTriviaHost"
              @openLyricBomb="onOpenLyricBombHost"
              @openRhythm="isRhythmModalOpen = true"
              @openLeaderboard="isLeaderboardModalOpen = true"
            />
          </PersonaOverlayPanel>

          <!-- 5. STUDIO DSP CONFIG OVERLAY (Host Exclusive) -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'studio'"
            title="STUDIO // HOST DSP CONFIG"
            subtitle="BROADCAST_AUDIO_AND_ROOM_ENGINE"
            icon="sliders"
            color="cyan"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <div class="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3.5">
              <!-- Card 1: Auto-Radio DJ -->
              <div
                class="bg-[#141424] border-2 border-white p-4 flex items-center justify-between gap-4 shadow-[5px_5px_0px_#000]"
                style="transform: skewX(-2deg);"
              >
                <div class="flex flex-col gap-0.5">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 bg-[#e60012] text-white text-[9px] font-black uppercase">AI DJ</span>
                    <span class="text-sm font-black italic uppercase text-white">AUTO-RADIO DJ</span>
                  </div>
                  <span class="text-xs text-slate-300">
                    Memutar lagu rekomendasi serupa secara otomatis saat antrean kosong.
                  </span>
                </div>

                <button
                  type="button"
                  class="h-9 px-4 border-2 font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0 shadow-[3px_3px_0px_#000]"
                  :class="
                    autoDjEnabled
                      ? 'bg-[#10b981] text-black border-white'
                      : 'bg-black text-slate-400 border-white/40 hover:text-white'
                  "
                  style="transform: skewX(-10deg);"
                  @click="toggleAutoDj"
                >
                  {{ autoDjEnabled ? 'ENABLED' : 'DISABLED' }}
                </button>
              </div>

              <!-- Card 2: Karaoke DSP Mode & Vocal Cut Slider -->
              <div
                class="bg-[#141424] border-2 border-white p-4 flex flex-col gap-3 shadow-[5px_5px_0px_#000]"
                style="transform: skewX(-2deg);"
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <span class="px-1.5 py-0.5 bg-pink-600 text-white text-[9px] font-black uppercase">VOCAL DSP</span>
                      <span class="text-sm font-black italic uppercase text-white">KARAOKE VOCAL REDUCER</span>
                    </div>
                    <span class="text-xs text-slate-300">
                      Reduksi vokal tengah real-time dengan tetap mempertahankan dentuman bass.
                    </span>
                  </div>

                  <button
                    type="button"
                    class="h-9 px-4 border-2 font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0 shadow-[3px_3px_0px_#000]"
                    :class="
                      karaokeEnabled
                        ? 'bg-pink-600 text-white border-white'
                        : 'bg-black text-slate-400 border-white/40 hover:text-white'
                    "
                    style="transform: skewX(-10deg);"
                    @click="toggleKaraoke"
                  >
                    {{ karaokeEnabled ? `ACTIVE (${karaokeLevel}%)` : 'OFF' }}
                  </button>
                </div>

                <div
                  v-if="karaokeEnabled"
                  class="pt-2.5 border-t border-white/20 flex items-center justify-between gap-4"
                >
                  <span class="text-xs font-mono font-black text-pink-300 uppercase">
                    VOCAL CUT LEVEL: <strong class="text-white">{{ karaokeLevel }}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    :value="karaokeLevel"
                    class="flex-1 max-w-[220px] accent-pink-500 cursor-pointer"
                    @input="(e) => setKaraokeLevel(Number((e.target as HTMLInputElement).value))"
                  />
                </div>
              </div>

              <!-- Card 3: Crossfade & Seamless Play -->
              <div
                class="bg-[#141424] border-2 border-white p-4 flex flex-col gap-3 shadow-[5px_5px_0px_#000]"
                style="transform: skewX(-2deg);"
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <span class="px-1.5 py-0.5 bg-[#00e5ff] text-black text-[9px] font-black uppercase">TRANSITION</span>
                      <span class="text-sm font-black italic uppercase text-white">CROSSFADE & SEAMLESS PLAY</span>
                    </div>
                    <span class="text-xs text-slate-300">
                      Transisi antar-lagu mulus tanpa jeda hening.
                    </span>
                  </div>

                  <button
                    type="button"
                    class="h-9 px-4 border-2 font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0 shadow-[3px_3px_0px_#000]"
                    :class="
                      crossfadeEnabled
                        ? 'bg-[#00e5ff] text-black border-white'
                        : 'bg-black text-slate-400 border-white/40 hover:text-white'
                    "
                    style="transform: skewX(-10deg);"
                    @click="toggleCrossfade"
                  >
                    {{ crossfadeEnabled ? `${crossfadeDuration} SEC` : 'OFF' }}
                  </button>
                </div>

                <div
                  v-if="crossfadeEnabled"
                  class="pt-2.5 border-t border-white/20 flex items-center justify-between gap-4"
                >
                  <span class="text-xs font-mono font-black text-cyan-300 uppercase">
                    OVERLAP DURATION: <strong class="text-white">{{ crossfadeDuration }}s</strong>
                  </span>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    step="1"
                    :value="crossfadeDuration"
                    class="flex-1 max-w-[220px] accent-cyan-400 cursor-pointer"
                    @input="(e) => setCrossfadeDuration(Number((e.target as HTMLInputElement).value))"
                  />
                </div>
              </div>

              <!-- Card 4: Audio Output Destination & Remote Headphone Stream -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <!-- Audio Output Destination -->
                <div
                  class="bg-[#141424] border-2 border-white p-4 flex flex-col justify-between gap-3 shadow-[5px_5px_0px_#000]"
                  style="transform: skewX(-2deg);"
                >
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-black italic uppercase text-white">AUDIO DESTINATION</span>
                    <span class="text-[11px] text-slate-300">Pilih output speaker Browser DSP atau Native Driver.</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="flex-1 h-8 border-2 font-black text-xs uppercase tracking-wider cursor-pointer transition-all"
                      :class="
                        outputMode === 'browser'
                          ? 'bg-[#e60012] text-white border-white shadow-[2px_2px_0px_#000]'
                          : 'bg-black text-slate-400 border-white/30 hover:text-white'
                      "
                      style="transform: skewX(-10deg);"
                      @click="setOutputMode('browser')"
                    >
                      BROWSER
                    </button>
                    <button
                      type="button"
                      class="flex-1 h-8 border-2 font-black text-xs uppercase tracking-wider cursor-pointer transition-all"
                      :class="
                        outputMode === 'native'
                          ? 'bg-[#00e5ff] text-black border-white shadow-[2px_2px_0px_#000]'
                          : 'bg-black text-slate-400 border-white/30 hover:text-white'
                      "
                      style="transform: skewX(-10deg);"
                      @click="setOutputMode('native')"
                    >
                      NATIVE
                    </button>
                  </div>
                </div>

                <!-- Remote Headphone Stream (Bandwidth Saver) -->
                <div
                  class="bg-[#141424] border-2 border-white p-4 flex flex-col justify-between gap-3 shadow-[5px_5px_0px_#000]"
                  style="transform: skewX(-2deg);"
                >
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-black italic uppercase text-white">REMOTE HEADPHONE AUDIO</span>
                    <span class="text-[11px] text-slate-300">
                      {{ allowRemoteAudio ? 'Rekan kantor dapat streaming audio ke headphone.' : 'Bandwidth Saver ON (menghemat upload kantor).' }}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="w-full h-8 border-2 font-black text-xs uppercase tracking-wider cursor-pointer transition-all shadow-[2px_2px_0px_#000]"
                    :class="
                      allowRemoteAudio
                        ? 'bg-[#10b981] text-black border-white'
                        : 'bg-amber-400 text-black border-white'
                    "
                    style="transform: skewX(-10deg);"
                    @click="toggleRemoteAudio"
                  >
                    {{ allowRemoteAudio ? '🎧 ALLOWED (ACTIVE)' : '⏸ PAUSED (SAVER ON)' }}
                  </button>
                </div>
              </div>
            </div>
          </PersonaOverlayPanel>
        </div>
      </section>
    </main>

    <!-- Member Management Drawer -->
    <MemberDrawer
      :isOpen="isMemberDrawerOpen"
      :members="members"
      :currentClientId="currentClientId"
      :isAdmin="true"
      @close="isMemberDrawerOpen = false"
      @setRole="onSetRole"
      @setDjPasscode="onSetDjPasscode"
    />

    <!-- Immersive Floating Reaction & Shoutout Stream Stage -->
    <ReactionOverlay
      positionClass="bottom-6 right-6"
      @milestone="onMilestoneSurge"
    />

    <!-- osu!mania 4-Key Rhythm Game Modal -->
    <RhythmManiaModal
      :isOpen="isRhythmModalOpen"
      :track="nowPlaying"
      :isPlaying="isPlaying"
      :currentTime="currentTime"
      :nickname="hostNickname"
      :onClose="() => isRhythmModalOpen = false"
    />

    <!-- Office Rhythm Leaderboard Modal -->
    <LeaderboardModal
      :isOpen="isLeaderboardModalOpen"
      :currentTrack="nowPlaying"
      :onClose="() => isLeaderboardModalOpen = false"
    />

    <!-- Persona 5 Katalog Game (Game Hub) Modal -->
    <PersonaGameHubModal
      :isOpen="isGameHubOpen"
      :isDjOrHost="true"
      :triviaState="triviaState"
      :showOsuMode="SHOW_OSU_MODE"
      @close="isGameHubOpen = false"
      @openTrivia="onOpenTriviaHost"
      @openLyricBomb="onOpenLyricBombHost"
      @openRhythm="isRhythmModalOpen = true"
      @openLeaderboard="isLeaderboardModalOpen = true"
    />

    <!-- Lyric Bomb Game Modal -->
    <LyricBombModal
      :isOpen="isLyricBombModalOpen"
      @close="isLyricBombModalOpen = false"
    />

    <!-- Trivia Host Setup Modal -->
    <TriviaHostSetupModal
      :isOpen="isTriviaHostSetupOpen"
      @close="isTriviaHostSetupOpen = false"
      @createGame="onCreateTriviaGame"
    />

    <!-- Trivia Main Game Modal -->
    <TriviaModal
      :isOpen="isTriviaModalOpen"
      @close="isTriviaModalOpen = false"
    />

    <!-- YouTube Session & Anti-Bot Bypass Modal -->
    <YouTubeAuthModal
      :isOpen="isYouTubeAuthModalOpen"
      @close="isYouTubeAuthModalOpen = false"
    />

    <!-- Full-Screen Loading Overlay saat Menyiapkan Room Tebak Lagu -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isTriviaCreating"
        class="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 bg-obsidian-950/90 backdrop-blur-2xl select-none"
      >
        <div
          class="bg-[#0b0b14] p-8 sm:p-10 border-3 border-white max-w-md w-full flex flex-col items-center text-center shadow-[10px_10px_0px_#e60012] space-y-5"
          style="transform: skewX(-2deg);"
        >
          <div class="relative w-16 h-16 bg-[#e60012] border-2 border-white flex items-center justify-center shadow-[4px_4px_0px_#000] text-3xl animate-bounce">
            🎮
          </div>

          <div class="space-y-2">
            <h3 class="text-lg sm:text-xl font-black italic uppercase text-white tracking-wide">
              MENYIAPKAN GAME TEBAK LAGU...
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sedang memuat playlist, mengacak soal, dan menyiapkan cuplikan audio untuk seluruh ruangan.
            </p>
          </div>

          <div class="flex items-center gap-2 px-4 py-1.5 bg-[#00e5ff] text-black border-2 border-black text-xs font-black uppercase tracking-wider">
            <span class="w-2 h-2 rounded-full bg-black animate-ping"></span>
            <span>HARAP TUNGGU SEBENTAR 🎵</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

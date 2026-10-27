<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { jukeboxClient } from "../shared/ws.ts";
import { whoami, getYouTubeAuthStatus } from "../shared/api.ts";
import YouTubeAuthModal from "../components/auth/YouTubeAuthModal.vue";
import AudioEngine from "../components/AudioEngine.vue";
import Visualizer from "../components/Visualizer.vue";
import QueueCard from "../components/QueueCard.vue";
import CatalogView from "../components/CatalogView.vue";
import LyricsView from "../components/LyricsView.vue";
import QrPanel from "../components/QrPanel.vue";
import MemberDrawer from "../components/MemberDrawer.vue";
import SeekBar from "../components/SeekBar.vue";
import UiIcon from "../components/UiIcon.vue";
import ReactionOverlay from "../components/ReactionOverlay.vue";
import ReactionDock from "../components/ReactionDock.vue";
import LeaderboardModal from "../components/rhythm/LeaderboardModal.vue";
import JukeChan from "../components/mascot/JukeChan.vue";
import JukeChanStage from "../components/mascot/JukeChanStage.vue";
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

type HostTab = "queue" | "catalog" | "lyrics";
const activeTab = ref<HostTab>("queue");

const isMemberDrawerOpen = ref(false);
const isLeaderboardModalOpen = ref(false);
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

  // Safety fallback: jika dalam 15s belum ada respon dari server, matikan overlay
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
  { label: "Indie Indo", query: "Hindia Rumah Ke Rumah" },
  { label: "City Pop", query: "Miki Matsubara Stay With Me" },
  { label: "Anime Hits", query: "Yoasobi Idol" },
  { label: "Lofi Chill", query: "Lofi Hip Hop beats" },
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
  currentMood,
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

function handleSelectTab(tab: HostTab) {
  if (tab !== activeTab.value) {
    onTabSwitch(tab);
  }
  activeTab.value = tab;
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
  activeTab.value = "catalog";
}

function reRequestTrack(title: string, artist: string) {
  prefillCatalogQuery.value = `${title} ${artist}`;
  activeTab.value = "catalog";
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
  <div class="host-container min-h-screen max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-6 text-slate-100">
    <!-- Invisible Web Audio DSP Player -->
    <AudioEngine
      v-if="outputMode === 'browser'"
      :track="nowPlaying"
      :isPlaying="isPlaying && !isLyricBombModalOpen"
      :volume="volume"
      :karaokeEnabled="karaokeEnabled"
      :karaokeLevel="karaokeLevel"
      :crossfadeDuration="effectiveCrossfadeDuration"
      @analyserReady="onAnalyserReady"
      @timeUpdate="onAudioTimeUpdate"
    />

    <!-- Studio Top Navigation Header -->
    <header class="glass-panel px-5 py-3.5 rounded-2xl flex items-center justify-between gap-4 shadow-lg border-white/10 backdrop-blur-xl">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl overflow-hidden border border-indigo-500/35 flex items-center justify-center bg-slate-900/60 shadow-[0_0_20px_rgba(99,102,241,0.25)] shrink-0">
          <img src="/logo.png" alt="IsThisOurJukebox Logo" class="w-full h-full object-cover" />
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <h1 class="text-base sm:text-lg font-black tracking-tight text-white leading-tight">IsThisOurJukebox</h1>
            <span class="role-badge role-host text-[10px] px-2 py-0.5">
              <UiIcon name="crown" :size="11" />
              <span>Host Studio</span>
            </span>
          </div>
          <p class="text-xs text-slate-400 font-medium">Standalone High-Fidelity LAN Broadcast</p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <!-- Live Connection Status Indicator -->
        <div class="glass-pill px-3 py-1 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <span
            class="w-2 h-2 rounded-full transition-all duration-300"
            :class="status === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-400'"
          ></span>
          <span>{{ status === 'connected' ? 'Live on Air' : status }}</span>
        </div>

        <!-- Live Room Reactions Dock -->
        <ReactionDock :compact="true" class="hidden md:flex" />

        <!-- Rhythm Game Leaderboard Button (Hidden via feature flag) -->
        <button
          v-if="SHOW_OSU_MODE"
          class="glass-pill px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-white border-amber-500/30 hover:border-amber-400 active:scale-95 transition-all cursor-pointer shadow-sm"
          title="Lihat Papan Peringkat osu!mania 4K"
          @click="isLeaderboardModalOpen = true"
        >
          <span>🏆 Leaderboard</span>
        </button>

        <!-- YouTube Bot Bypass Status & Auth Button -->
        <button
          class="glass-pill px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
          :class="youtubeAuthStatus?.hasCookies ? 'text-emerald-400 border-emerald-500/30 hover:border-emerald-400 bg-emerald-500/10' : 'text-rose-300 border-rose-500/40 hover:border-rose-400 bg-rose-500/10'"
          title="Status Akun YouTube & Anti-Bot Cookies"
          @click="isYouTubeAuthModalOpen = true"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="youtubeAuthStatus?.hasCookies ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'"
          ></span>
          <span class="hidden sm:inline">YouTube:</span>
          <span>{{ youtubeAuthStatus?.hasCookies ? 'Aktif' : 'Login Diperlukan' }}</span>
        </button>

        <!-- Katalog Game Hub Button for Host DJ -->
        <button
          class="glass-pill px-3.5 py-1.5 flex items-center gap-1.5 text-xs font-black text-white hover:text-black border-2 border-white bg-[#e60012] hover:bg-white active:scale-95 transition-all cursor-pointer shadow-[3px_3px_0px_#000]"
          style="transform: skewX(-8deg);"
          title="Buka Katalog Minigame Kantor (Tebak Lagu & lainnya)"
          @click="isGameHubOpen = true"
        >
          <span>🎮 KATALOG GAME</span>
        </button>

        <!-- Room Member Management Drawer -->
        <button
          class="glass-pill px-3.5 py-1.5 flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-white hover:border-white/20 active:scale-95 transition-all cursor-pointer shadow-sm"
          title="View connected room members and manage DJ access"
          @click="isMemberDrawerOpen = true"
        >
          <UiIcon name="users" :size="14" class="text-indigo-400" />
          <span class="tabular-nums">{{ members.length || activeListeners }} in Room</span>
          <span
            v-if="headphoneCount > 0"
            class="text-emerald-400 font-bold flex items-center gap-1 ml-0.5"
            :title="`${headphoneCount} listening via headphones (~${headphoneCount * 128} kbps upload)`"
          >
            • <UiIcon name="headphones" :size="11" /> {{ headphoneCount }} <span class="text-[10px] opacity-80">(~{{ headphoneCount * 128 }}k)</span>
          </span>
        </button>
      </div>
    </header>

    <!-- Main Studio Dashboard: 2-Column Responsive Layout -->
    <main class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- LEFT COLUMN: Juke-chan Stage Anchor, Sticky Hero Player, Studio Controls, and QR Panel -->
      <section class="lg:col-span-5 xl:col-span-4 flex flex-col gap-5 sticky top-5">
        <!-- Main Mascot Anchor Stage -->
        <JukeChanStage
          :track="nowPlaying"
          :isPlaying="isPlaying"
          :compact="false"
          :interactive="true"
        />

        <!-- Now Playing Hero Card -->
        <div class="now-playing-card glass-panel relative overflow-hidden p-5 sm:p-6 rounded-3xl flex flex-col gap-4 shadow-xl border-white/10">
          <!-- Ambient Backlight Projection -->
          <div
            class="ambient-glow"
            :class="{ 'surge-glow': isSurging }"
            :style="{
              backgroundImage: nowPlaying?.thumbnail ? `url(${nowPlaying.thumbnail})` : 'none',
              opacity: isSurging ? '0.8' : (isPlaying ? '0.45' : '0.2')
            }"
          ></div>

          <!-- Album Art & Track Meta -->
          <div class="relative z-10 flex gap-4 items-center">
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

                <!-- Live Status Beacon Pill -->
                <span
                  v-if="isPlaying"
                  class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/40 text-[9px] font-black tracking-wider text-emerald-400 flex items-center gap-1 uppercase"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>LIVE</span>
                </span>
              </div>
            </div>

            <!-- Track Details -->
            <div class="flex-1 min-w-0 flex flex-col gap-1">
              <div class="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span v-if="nowPlaying?.requestedBy" class="glass-pill px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                    <UiIcon name="user" :size="10" />
                    <span class="truncate max-w-[130px]">Requested by {{ nowPlaying.requestedBy }}</span>
                  </span>
                  <span v-else class="glass-pill px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                    <UiIcon name="sparkles" :size="10" />
                    <span>Auto-Radio Ready</span>
                  </span>

                  <span
                    v-if="karaokeEnabled"
                    class="glass-pill px-2 py-0.5 text-[10px] font-bold text-pink-300 bg-pink-500/15 border-pink-500/35 flex items-center gap-1"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
                    <span>Vocal Cut {{ karaokeLevel }}%</span>
                  </span>
                </div>

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
              </div>

              <h2 class="text-base sm:text-lg font-extrabold tracking-tight text-white truncate leading-snug" :title="nowPlaying?.title || 'Jukebox is idle'">
                {{ nowPlaying?.title || "Jukebox is idle" }}
              </h2>
              <p class="text-xs sm:text-sm text-slate-400 truncate font-medium">
                {{ nowPlaying ? displayArtist : "Queue empty — Auto-DJ ready to groove" }}
              </p>

              <!-- Interactive Visualizer -->
              <div class="w-full mt-2 h-8 rounded-lg overflow-hidden bg-black/30 border border-white/5 flex items-center justify-center">
                <Visualizer :analyser="analyserNode" :isPlaying="isPlaying" />
              </div>
            </div>
          </div>

          <!-- Progress Scrubber -->
          <div class="relative z-10 pt-2 border-t border-white/5">
            <SeekBar
              :currentTime="currentTime"
              :duration="duration || nowPlaying?.duration || 0"
              :isPlaying="isPlaying"
              :canSeek="true"
              @seek="seekTo"
            />
          </div>

          <!-- Transport Controls -->
          <div class="relative z-10 flex items-center justify-between gap-3 pt-1 flex-wrap">
            <div class="flex items-center gap-2">
              <!-- Play / Pause -->
              <button
                class="w-11 h-11 rounded-full bg-white text-black font-bold flex items-center justify-center shadow-[0_4px_16px_rgba(255,255,255,0.3)] active:scale-95 transition-transform cursor-pointer"
                :title="isPlaying ? 'Pause' : 'Play'"
                @click="togglePlay"
              >
                <UiIcon v-if="isPlaying" name="pause" :size="18" />
                <UiIcon v-else name="play" :size="18" style="margin-left: 2px" />
              </button>

              <!-- Skip Track -->
              <button
                class="btn-secondary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Skip to next song"
                @click="skip"
              >
                <span>Next</span>
                <UiIcon name="skip-forward" :size="13" />
              </button>

              <!-- Lyrics Stage Switcher -->
              <button
                class="glass-pill px-3 py-2 text-xs font-semibold flex items-center gap-1.5 text-purple-300 hover:text-white cursor-pointer active:scale-95"
                :class="{ 'bg-pink-500/20 border-pink-500/40 text-pink-200': activeTab === 'lyrics' }"
                title="Switch to Live Synced Lyrics"
                @click="activeTab = 'lyrics'"
              >
                <UiIcon name="mic" :size="13" />
                <span>Lyrics</span>
              </button>

              <!-- Karaoke Vocal Cancellation Switch -->
              <button
                class="glass-pill px-3 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95"
                :class="karaokeEnabled ? 'bg-pink-500/20 border-pink-500/40 text-pink-200 shadow-[0_0_12px_rgba(236,72,153,0.3)]' : 'text-slate-400 hover:text-white'"
                title="Toggle Real-Time Vocal Cancellation"
                @click="toggleKaraoke"
              >
                <UiIcon name="mic" :size="13" />
                <span>Karaoke</span>
                <span v-if="karaokeEnabled" class="text-[10px] font-mono tabular-nums text-pink-300 bg-pink-500/30 px-1 py-0.2 rounded">{{ karaokeLevel }}%</span>
              </button>
            </div>

            <!-- Volume Scrubber -->
            <div class="flex items-center gap-2 glass-pill px-3 py-1.5 ml-auto">
              <UiIcon v-if="volume === 0" name="volume-x" :size="14" class="text-slate-400 shrink-0" />
              <UiIcon v-else-if="volume < 50" name="volume-1" :size="14" class="text-slate-400 shrink-0" />
              <UiIcon v-else name="volume-2" :size="14" class="text-slate-400 shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                :value="volume"
                class="w-20 accent-indigo-500 cursor-pointer"
                @input="(e) => updateVolume(Number((e.target as HTMLInputElement).value))"
              />
              <span class="text-xs font-mono tabular-nums text-slate-300 w-8 text-right">{{ volume }}%</span>
            </div>
          </div>
        </div>

        <!-- Studio Controls Card -->
        <div class="glass-panel p-5 rounded-3xl flex flex-col gap-4 shadow-xl border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-extrabold text-white tracking-wide uppercase">
              <UiIcon name="sliders" :size="14" class="text-indigo-400" />
              <span>Studio Controls</span>
            </div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 glass-pill px-2 py-0.5 bg-amber-500/10 border-amber-500/30">Host Exclusive</span>
          </div>

          <!-- Auto-Radio DJ -->
          <div class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-bold text-white">Auto-Radio DJ</span>
              <span class="text-[11px] text-slate-400">Autoplays similar tracks when queue is clear</span>
            </div>
            <div
              class="spring-switch cursor-pointer"
              :class="{ active: autoDjEnabled }"
              role="switch"
              :aria-checked="autoDjEnabled"
              @click="toggleAutoDj"
            >
              <div class="spring-switch-thumb"></div>
            </div>
          </div>

          <!-- Karaoke DSP Mode -->
          <div class="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div class="flex items-center justify-between gap-3">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-white">Karaoke DSP (Vocal Reducer)</span>
                <span class="text-[11px] text-slate-400">Real-time center cancellation with punchy bass</span>
              </div>
              <div
                class="spring-switch cursor-pointer"
                :class="{ active: karaokeEnabled }"
                role="switch"
                :aria-checked="karaokeEnabled"
                @click="toggleKaraoke"
              >
                <div class="spring-switch-thumb"></div>
              </div>
            </div>
            <div v-if="karaokeEnabled" class="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
              <span class="text-[11px] text-pink-300 font-semibold">Vocal Cut: <strong class="tabular-nums">{{ karaokeLevel }}%</strong></span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                :value="karaokeLevel"
                class="flex-1 max-w-[180px] accent-pink-500 cursor-pointer"
                @input="(e) => setKaraokeLevel(Number((e.target as HTMLInputElement).value))"
              />
            </div>
          </div>

          <!-- Crossfade & Transitions -->
          <div class="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div class="flex items-center justify-between gap-3">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-white">Crossfade & Seamless Play</span>
                <span class="text-[11px] text-slate-400">Smooth play/pause fade & overlapping track transitions</span>
              </div>
              <div
                class="spring-switch cursor-pointer"
                :class="{ active: crossfadeEnabled }"
                role="switch"
                :aria-checked="crossfadeEnabled"
                @click="toggleCrossfade"
              >
                <div class="spring-switch-thumb"></div>
              </div>
            </div>
            <div v-if="crossfadeEnabled" class="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
              <span class="text-[11px] text-indigo-300 font-semibold">Overlap: <strong class="tabular-nums">{{ crossfadeDuration }}s</strong></span>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                :value="crossfadeDuration"
                class="flex-1 max-w-[180px] accent-indigo-500 cursor-pointer"
                @input="(e) => setCrossfadeDuration(Number((e.target as HTMLInputElement).value))"
              />
            </div>
          </div>

          <!-- Audio Output Destination -->
          <div class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-bold text-white">Audio Destination</span>
              <span class="text-[11px] text-slate-400">Route audio to browser or native driver</span>
            </div>
            <div class="glass-pill p-0.5 flex items-center text-xs">
              <button
                class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer"
                :class="outputMode === 'browser' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'"
                @click="setOutputMode('browser')"
              >
                Browser
              </button>
              <button
                class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer"
                :class="outputMode === 'native' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'"
                @click="setOutputMode('native')"
              >
                Native
              </button>
            </div>
          </div>

          <!-- Bandwidth Saver: Remote Headphone Audio Toggle -->
          <div class="flex items-center justify-between pt-2 border-t border-white/5">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <UiIcon name="headphones" :size="13" class="text-indigo-400" />
                Remote Headphone Audio
              </span>
              <span class="text-[11px] text-slate-400">
                {{ allowRemoteAudio ? 'Coworkers can stream headphone audio' : 'Paused (Bandwidth Saver ON — saves office upload)' }}
              </span>
            </div>
            <button
              class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer"
              :class="allowRemoteAudio ? 'bg-emerald-600 text-white shadow-md' : 'bg-amber-600/30 text-amber-300 border border-amber-500/40'"
              :title="allowRemoteAudio ? 'Pause remote headphone audio to conserve office internet upload' : 'Allow remote coworkers to stream headphone audio'"
              @click="toggleRemoteAudio"
            >
              {{ allowRemoteAudio ? 'Allowed' : 'Paused' }}
            </button>
          </div>
        </div>

        <!-- QR Share Panel -->
        <QrPanel
          v-if="clientUrl"
          :url="clientUrl"
          :lanUrl="lanUrl"
          :publicUrl="publicUrl"
          :tunnelMode="tunnelMode"
        />
      </section>

      <!-- RIGHT STAGE: Multi-Tab Studio Center -->
      <section class="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 min-w-0">
        <!-- Tactile Stage Tab Navigation Bar (Anime Sci-Fi HUD) -->
        <nav class="glass-panel p-1.5 rounded-2xl flex items-center justify-between gap-1.5 shadow-lg bg-obsidian-950/80 border-white/10 backdrop-blur-2xl">
          <!-- Queue Tab -->
          <button
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-[0.98] cursor-pointer border"
            :class="activeTab === 'queue' ? 'bg-indigo-600/90 text-white border-indigo-400/60 shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5 font-semibold'"
            @click="handleSelectTab('queue')"
          >
            <UiIcon name="list-music" :size="16" />
            <span class="font-mono text-xs uppercase tracking-wider">[SYS.QUEUE]</span>
            <span
              v-if="queue.length > 0"
              class="tabular-nums text-xs px-2 py-0.5 rounded-md font-mono ml-0.5"
              :class="activeTab === 'queue' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'"
            >
              {{ queue.length }}
            </span>
          </button>

          <!-- Catalog & Discovery Tab -->
          <button
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-[0.98] cursor-pointer border"
            :class="activeTab === 'catalog' ? 'bg-indigo-600/90 text-white border-indigo-400/60 shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5 font-semibold'"
            @click="handleSelectTab('catalog')"
          >
            <UiIcon name="sparkles" :size="15" />
            <span class="font-mono text-xs uppercase tracking-wider">[CATALOG.DB]</span>
          </button>

          <!-- Live Lyrics & Karaoke Tab -->
          <button
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-[0.98] cursor-pointer border"
            :class="[
              activeTab === 'lyrics'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white border-pink-400/60 shadow-[0_0_20px_rgba(236,72,153,0.5)]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5 font-semibold',
              karaokeEnabled && activeTab !== 'lyrics' ? 'text-pink-300' : ''
            ]"
            @click="handleSelectTab('lyrics')"
          >
            <UiIcon name="mic" :size="15" />
            <span class="font-mono text-xs uppercase tracking-wider">[VOCAL.SYNC]</span>
            <span
              v-if="karaokeEnabled"
              class="w-2 h-2 rounded-full bg-pink-400 animate-pulse ml-0.5"
            ></span>
          </button>
        </nav>

        <!-- Stage View Animated Transitions -->
        <transition name="page-fade" mode="out-in">
          <!-- 1. QUEUE STAGE -->
          <div v-if="activeTab === 'queue'" key="queue" class="flex flex-col gap-5">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2">
                <div class="text-indigo-400">
                  <UiIcon name="list-music" :size="18" />
                </div>
                <h3 class="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>Democratic Queue</span>
                  <span class="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full bg-white/10 text-indigo-200">
                    {{ queue.length }}
                  </span>
                </h3>
              </div>
              <span class="text-xs text-slate-400 font-medium">Sorted by democratic votes</span>
            </div>

            <!-- Empty State Vibe Station -->
            <div v-if="queue.length === 0" class="empty-queue-box glass-panel p-8 sm:p-10 rounded-3xl flex flex-col items-center justify-center text-center gap-4 border-dashed border-white/15">
              <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
                <UiIcon name="disc" :size="36" strokeWidth="1.2" class="empty-disc-icon" />
              </div>
              <div class="flex flex-col gap-1 max-w-md">
                <h4 class="text-base sm:text-lg font-bold text-white tracking-tight">Queue is Clear</h4>
                <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  The room is quiet. Coworkers can scan the QR code to vote, or explore the catalog to queue a track:
                </p>
              </div>

              <!-- Quick Pick Chips -->
              <div class="flex flex-wrap items-center justify-center gap-2 max-w-lg my-1">
                <button
                  v-for="vibe in quickPickVibes"
                  :key="vibe.label"
                  class="glass-pill px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-400/40 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  @click="triggerQuickPick(vibe.query)"
                >
                  <UiIcon name="sparkles" :size="11" class="text-indigo-400" />
                  <span>{{ vibe.label }}</span>
                </button>
              </div>

              <div class="flex items-center gap-3 pt-2">
                <button class="btn-primary text-xs px-4 py-2 cursor-pointer shadow-lg" @click="activeTab = 'catalog'">
                  <UiIcon name="sparkles" :size="14" />
                  <span>Open Catalog & Library</span>
                </button>
              </div>
            </div>

            <!-- Queue Cards List -->
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

            <!-- Recently Played History Shelf -->
            <div v-if="history.length > 0" class="glass-panel p-5 rounded-3xl flex flex-col gap-3.5 shadow-lg border-white/10">
              <div class="flex items-center justify-between px-1">
                <div class="flex items-center gap-2">
                  <UiIcon name="music" :size="15" class="text-indigo-400" />
                  <h3 class="text-xs sm:text-sm font-extrabold text-white">Recently Played in Room</h3>
                </div>
                <span class="text-xs font-mono text-slate-400 tabular-nums">{{ history.length }} tracks</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div
                  v-for="item in history.slice(0, 6)"
                  :key="item.queueId"
                  class="glass-panel p-2.5 rounded-2xl flex items-center gap-3 hover:bg-white/[0.04] transition-all"
                >
                  <div class="w-10 h-10 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10">
                    <img v-if="item.thumbnail" :src="item.thumbnail" class="w-full h-full object-cover" alt="" />
                    <div v-else class="w-full h-full flex items-center justify-center text-slate-500">
                      <UiIcon name="music" :size="14" />
                    </div>
                  </div>
                  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-white truncate" :title="item.title">{{ item.title }}</span>
                    <span class="text-[11px] text-slate-400 truncate">{{ item.artist }}</span>
                  </div>
                  <span class="glass-pill px-2 py-0.5 text-[10px] text-slate-400 shrink-0 max-w-[80px] truncate">
                    {{ item.requestedBy }}
                  </span>
                  <button
                    class="glass-pill w-7 h-7 flex items-center justify-center text-indigo-300 hover:text-white hover:bg-indigo-500/20 active:scale-90 transition-all cursor-pointer shrink-0"
                    title="Re-request track"
                    @click="reRequestTrack(item.title, item.artist)"
                  >
                    <UiIcon name="plus" :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. CATALOG & DISCOVERY STAGE -->
          <div v-else-if="activeTab === 'catalog'" key="catalog">
            <CatalogView
              :nickname="hostNickname"
              :nowPlaying="nowPlaying"
              :initialQuery="prefillCatalogQuery"
              @requestTrack="handleTrackRequested"
            />
          </div>

          <!-- 3. LIVE LYRICS & KARAOKE STAGE -->
          <div v-else-if="activeTab === 'lyrics'" key="lyrics" class="h-[calc(100vh-140px)] min-h-[580px] flex flex-col">
            <LyricsView
              class="h-full flex-1 min-h-0"
              :track="nowPlaying"
              :currentTime="currentTime"
              :duration="duration"
              :isPlaying="isPlaying"
              :canSeek="true"
              :karaokeEnabled="karaokeEnabled"
              :karaokeLevel="karaokeLevel"
              @seek="seekTo"
              @back="handleSelectTab('queue')"
            />
          </div>
        </transition>
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
      @openRhythm="() => {}"
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
        <div class="glass-panel p-8 sm:p-10 rounded-3xl border border-indigo-500/30 bg-obsidian-900/95 max-w-md w-full flex flex-col items-center text-center shadow-[0_0_50px_rgba(99,102,241,0.25)] space-y-5">
          <!-- Animated Music/Game Icon Badge -->
          <div class="relative w-20 h-20 flex items-center justify-center">
            <div class="absolute inset-0 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-spin opacity-40 blur-md"></div>
            <div class="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-pink-600 flex items-center justify-center shadow-lg text-3xl animate-bounce">
              🎮
            </div>
          </div>

          <div class="space-y-2">
            <h3 class="text-lg sm:text-xl font-black text-white tracking-tight">
              Menyiapkan Game Tebak Lagu...
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sedang memuat playlist, mengacak soal, dan menyiapkan cuplikan audio untuk seluruh ruangan.
            </p>
          </div>

          <!-- Pulsing Progress Pill -->
          <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-indigo-300 font-bold">
            <span class="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
            <span>Harap tunggu sebentar 🎵</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Ambient Dynamic Backlight Projection */
.ambient-glow {
  position: absolute;
  inset: -25px;
  background-size: cover;
  background-position: center;
  filter: blur(55px) saturate(1.4);
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.8s ease, filter 0.8s ease;
}

.ambient-glow.surge-glow {
  filter: blur(40px) saturate(2.5) brightness(1.35);
  box-shadow: 0 0 90px rgba(245, 158, 11, 0.6);
  transform: scale(1.08);
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

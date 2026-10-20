<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import ClientDesktopLayout from "../components/client/desktop/ClientDesktopLayout.vue";
import ClientMobileLayout from "../components/client/mobile/ClientMobileLayout.vue";
import DjPasscodeModal from "../components/DjPasscodeModal.vue";
import RhythmManiaModal from "../components/rhythm/RhythmManiaModal.vue";
import LeaderboardModal from "../components/rhythm/LeaderboardModal.vue";
import TriviaHostSetupModal from "../components/trivia/TriviaHostSetupModal.vue";
import TriviaModal from "../components/trivia/TriviaModal.vue";
import TriviaInvitationBanner from "../components/trivia/TriviaInvitationBanner.vue";
import PersonaGameHubModal from "../components/persona/PersonaGameHubModal.vue";
import { SHOW_OSU_MODE } from "../shared/config.ts";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";
import { useHeadphoneAudio } from "../shared/useHeadphoneAudio.ts";
import { useFavorites } from "../shared/useFavorites.ts";
import { useJukeChanMood } from "../shared/useJukeChanMood.ts";
import { setPlaybackSync } from "../shared/jukechan/beatDriver.ts";
import type { TriviaGameSettings } from "../shared/types.ts";

type ClientTab = "queue" | "catalog" | "lyrics";
const activeTab = ref<ClientTab>("queue");

const isPasscodeModalOpen = ref(false);
const isRhythmModalOpen = ref(false);
const isLeaderboardModalOpen = ref(false);
const isTriviaHostSetupOpen = ref(false);
const isTriviaModalOpen = ref(false);
const isTriviaCreating = ref(false);
const isGameHubOpen = ref(false);
const prefillSearchQuery = ref("");

const triviaState = computed(() => jukeboxClient.triviaState.value);

watch(triviaState, (ts) => {
  if (ts && ts.status !== "idle" && currentClientId.value && ts.players[currentClientId.value]) {
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

function onOpenTriviaModal() {
  if (triviaState.value && triviaState.value.status !== "idle") {
    // Jika belum gabung ke lobby yang sedang ada, gabung otomatis
    if (triviaState.value.status === "lobby" && currentClientId.value && !triviaState.value.players[currentClientId.value]) {
      jukeboxClient.joinTriviaLobby();
    }
    isTriviaModalOpen.value = true;
  } else if (isDjOrHost.value) {
    isTriviaHostSetupOpen.value = true;
  } else {
    jukeboxClient.addToast("Belum ada game Tebak Lagu yang dibuka oleh Host/DJ 🎧", "info");
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

const { isFavorite, toggleFavorite } = useFavorites();
const nickname = ref(localStorage.getItem("jukebox_nickname") || "Anonymous");

const state = computed(() => jukeboxClient.state.value);
const nowPlaying = computed(() => state.value?.nowPlaying ?? null);
const isPlaying = computed(() => state.value?.isPlaying ?? false);
const queue = computed(() => state.value?.queue ?? []);
const activeListeners = computed(() => state.value?.activeListeners ?? 1);
const headphoneCount = computed(
  () => (state.value?.members || []).filter((m) => m.isListening).length
);
const karaokeEnabled = computed(() => state.value?.karaokeEnabled ?? false);
const karaokeLevel = computed(() => state.value?.karaokeLevel ?? 90);
const status = computed(() => jukeboxClient.status.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);
const myRole = computed(() => jukeboxClient.myRole.value);
const isDjOrHost = computed(
  () => myRole.value === "dj" || myRole.value === "host" || jukeboxClient.isAdmin.value
);
const volume = computed(() => state.value?.volume ?? 80);
const allowRemoteAudio = computed(() => state.value?.allowRemoteAudio ?? true);

// Personal Headphone Streaming Engine ("Silent Disco")
const {
  isTunedIn,
  isMuted,
  personalVolume,
  syncStatus,
  driftMs,
  tuneIn,
  tuneOut,
  toggleMute,
  setPersonalVolume,
} = useHeadphoneAudio({
  track: nowPlaying,
  isPlaying,
});

watch(allowRemoteAudio, (allowed) => {
  if (!allowed && isTunedIn.value) {
    tuneOut();
  }
});

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

const {
  detectMood,
  onMemberJoined,
  onTrackSkipped,
  onTrackUpvoted,
  onKaraokeToggled,
  startIdleLoop,
  stopIdleLoop,
} = useJukeChanMood();

watch([isPlaying, currentTime], ([playing, cur]) => {
  setPlaybackSync(!!playing, cur);
});

let prevClientMemberIds = new Set<string>();
watch(
  () => state.value?.members ?? [],
  (list) => {
    const currentIds = new Set<string>(list.map((m) => m.clientId));
    if (prevClientMemberIds.size > 0 && list.length > prevClientMemberIds.size) {
      const newest = list.find((m) => !prevClientMemberIds.has(m.clientId));
      onMemberJoined(newest?.nickname);
    }
    prevClientMemberIds = currentIds;
  },
  { deep: true }
);

watch(
  [nowPlaying, () => nowPlaying.value?.mood, () => nowPlaying.value?.genre],
  () => {
    detectMood(nowPlaying.value);
  },
  { immediate: true, deep: true }
);

onMounted(() => {
  startIdleLoop();
  jukeboxClient.connect();
});

onBeforeUnmount(() => {
  stopIdleLoop();
});

function onUpdateNickname(name: string) {
  nickname.value = name;
  jukeboxClient.setNickname(name);
  jukeboxClient.addToast(`Nickname set to "${name}"`, "success");
}

function openCatalog(searchQuery: string = "") {
  prefillSearchQuery.value = searchQuery;
  activeTab.value = "catalog";
}

function onUpvote(queueId: string) {
  const item = queue.value.find((q) => q.queueId === queueId);
  onTrackUpvoted(item?.title);
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
  onTrackSkipped();
  jukeboxClient.send({ type: "skip" });
}

function toggleKaraoke() {
  onKaraokeToggled(!karaokeEnabled.value);
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
  <div class="client-container min-h-[100dvh] lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden max-w-[1400px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 text-slate-100 flex flex-col">
    <!-- Desktop Studio Workspace (>= 1024px) -->
    <div class="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:h-full lg:overflow-hidden">
      <ClientDesktopLayout
        class="flex-1 min-h-0 h-full"
        :activeTab="activeTab"
        :status="status"
        :myRole="myRole"
        :isDjOrHost="isDjOrHost"
        :nickname="nickname"
        :activeListeners="activeListeners"
        :headphoneCount="headphoneCount"
        :nowPlaying="nowPlaying"
        :isPlaying="isPlaying"
        :karaokeEnabled="karaokeEnabled"
        :karaokeLevel="karaokeLevel"
        :volume="volume"
        :currentTime="currentTime"
        :duration="duration"
        :isFavorite="nowPlaying ? isFavorite(nowPlaying.id) : false"
        :isTunedIn="isTunedIn"
        :isMuted="isMuted"
        :personalVolume="personalVolume"
        :syncStatus="syncStatus"
        :driftMs="driftMs"
        :allowRemoteAudio="allowRemoteAudio"
        :queue="queue"
        :currentClientId="currentClientId"
        :prefillSearchQuery="prefillSearchQuery"
        :triviaState="triviaState"
        :showOsuMode="SHOW_OSU_MODE"
        @selectTab="activeTab = $event"
        @openPasscodeModal="isPasscodeModalOpen = true"
        @updateNickname="onUpdateNickname"
        @toggleFavorite="nowPlaying && toggleFavorite(nowPlaying)"
        @seek="seekTo"
        @lockedSeekClick="onLockedSeekBarClick"
        @togglePlay="togglePlay"
        @skip="skip"
        @toggleKaraoke="toggleKaraoke"
        @setKaraokeLevel="setKaraokeLevel"
        @updateVolume="updateVolume"
        @tuneIn="tuneIn"
        @tuneOut="tuneOut"
        @toggleMute="toggleMute"
        @setPersonalVolume="setPersonalVolume"
        @openCatalog="openCatalog"
        @upvote="onUpvote"
        @removeVote="onRemoveVote"
        @removeTrack="onRemoveTrack"
        @openRhythmModal="isRhythmModalOpen = true"
        @openLeaderboardModal="isLeaderboardModalOpen = true"
        @openTriviaModal="onOpenTriviaModal"
        @openGameHub="isGameHubOpen = true"
      />
    </div>

    <!-- Mobile Touch-First Flow (< 1024px) -->
    <div class="block lg:hidden">
      <ClientMobileLayout
        :activeTab="activeTab"
        :status="status"
        :myRole="myRole"
        :isDjOrHost="isDjOrHost"
        :nickname="nickname"
        :activeListeners="activeListeners"
        :headphoneCount="headphoneCount"
        :nowPlaying="nowPlaying"
        :isPlaying="isPlaying"
        :karaokeEnabled="karaokeEnabled"
        :karaokeLevel="karaokeLevel"
        :volume="volume"
        :currentTime="currentTime"
        :duration="duration"
        :isFavorite="nowPlaying ? isFavorite(nowPlaying.id) : false"
        :isTunedIn="isTunedIn"
        :isMuted="isMuted"
        :personalVolume="personalVolume"
        :syncStatus="syncStatus"
        :driftMs="driftMs"
        :allowRemoteAudio="allowRemoteAudio"
        :queue="queue"
        :currentClientId="currentClientId"
        :prefillSearchQuery="prefillSearchQuery"
        @selectTab="activeTab = $event"
        @openPasscodeModal="isPasscodeModalOpen = true"
        @updateNickname="onUpdateNickname"
        @toggleFavorite="nowPlaying && toggleFavorite(nowPlaying)"
        @seek="seekTo"
        @lockedSeekClick="onLockedSeekBarClick"
        @togglePlay="togglePlay"
        @skip="skip"
        @toggleKaraoke="toggleKaraoke"
        @setKaraokeLevel="setKaraokeLevel"
        @updateVolume="updateVolume"
        @tuneIn="tuneIn"
        @tuneOut="tuneOut"
        @toggleMute="toggleMute"
        @setPersonalVolume="setPersonalVolume"
        @openCatalog="openCatalog"
        @upvote="onUpvote"
        @removeVote="onRemoveVote"
        @removeTrack="onRemoveTrack"
        @openRhythmModal="isRhythmModalOpen = true"
        @openLeaderboardModal="isLeaderboardModalOpen = true"
        @openTriviaModal="onOpenTriviaModal"
        @openGameHub="isGameHubOpen = true"
      />
    </div>

    <!-- Persona 5 Katalog Game (Game Hub) Modal -->
    <PersonaGameHubModal
      :isOpen="isGameHubOpen"
      :isDjOrHost="isDjOrHost"
      :triviaState="triviaState"
      :showOsuMode="SHOW_OSU_MODE"
      @close="isGameHubOpen = false"
      @openTrivia="onOpenTriviaModal"
      @openRhythm="isRhythmModalOpen = true"
      @openLeaderboard="isLeaderboardModalOpen = true"
    />

    <!-- Floating Trivia Invitation Banner -->
    <TriviaInvitationBanner @join="onOpenTriviaModal" />

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

    <!-- DJ / Host Passcode Claim Modal -->
    <DjPasscodeModal
      :isOpen="isPasscodeModalOpen"
      :currentRole="myRole"
      @close="isPasscodeModalOpen = false"
      @claimRole="onClaimRole"
    />

    <!-- osu!mania 4-Key Rhythm Game Modal -->
    <RhythmManiaModal
      :isOpen="isRhythmModalOpen"
      :track="nowPlaying"
      :isPlaying="isPlaying"
      :currentTime="currentTime"
      :nickname="nickname"
      :onClose="() => isRhythmModalOpen = false"
    />

    <!-- Office Rhythm Leaderboard Modal -->
    <LeaderboardModal
      :isOpen="isLeaderboardModalOpen"
      :currentTrack="nowPlaying"
      :onClose="() => isLeaderboardModalOpen = false"
    />
  </div>
</template>

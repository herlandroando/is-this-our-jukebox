<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import ClientDesktopLayout from "../components/client/desktop/ClientDesktopLayout.vue";
import ClientMobileLayout from "../components/client/mobile/ClientMobileLayout.vue";
import DjPasscodeModal from "../components/DjPasscodeModal.vue";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";
import { useHeadphoneAudio } from "../shared/useHeadphoneAudio.ts";
import { useFavorites } from "../shared/useFavorites.ts";

type ClientTab = "queue" | "catalog" | "lyrics";
const activeTab = ref<ClientTab>("queue");

const isPasscodeModalOpen = ref(false);
const prefillSearchQuery = ref("");

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

onMounted(() => {
  jukeboxClient.connect();
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
  <div class="client-container min-h-[100dvh] max-w-[1400px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-5 text-slate-100 flex flex-col gap-3 sm:gap-6">
    <!-- Desktop Studio Workspace (>= 1024px) -->
    <div class="hidden lg:block">
      <ClientDesktopLayout
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
      />
    </div>

    <!-- DJ / Host Passcode Claim Modal -->
    <DjPasscodeModal
      :isOpen="isPasscodeModalOpen"
      :currentRole="myRole"
      @close="isPasscodeModalOpen = false"
      @claimRole="onClaimRole"
    />
  </div>
</template>

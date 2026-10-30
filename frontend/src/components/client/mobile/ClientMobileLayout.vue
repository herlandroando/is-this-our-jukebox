<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import type { MemberRole, QueueTrack } from "../../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import MobileHeader from "./MobileHeader.vue";
import MobileDjDeck from "./MobileDjDeck.vue";
import MobileQueueSection from "./MobileQueueSection.vue";
import CatalogView from "../../CatalogView.vue";
import LyricsView from "../../LyricsView.vue";
import ReactionDock from "../../ReactionDock.vue";
import ReactionOverlay from "../../ReactionOverlay.vue";
import JukeChanStage from "../../mascot/JukeChanStage.vue";
import PersonaNowPlayingGauge from "../../persona/PersonaNowPlayingGauge.vue";
import PersonaOverlayPanel from "../../persona/PersonaOverlayPanel.vue";
import { useJukeChanMood } from "../../../shared/useJukeChanMood.ts";
import { registerModal } from "../../../shared/useModalStack.ts";

const props = defineProps<{
  activeTab: "queue" | "catalog" | "lyrics";
  status: string;
  myRole: MemberRole;
  isDjOrHost: boolean;
  nickname: string;
  activeListeners: number;
  headphoneCount: number;
  nowPlaying: QueueTrack | null;
  isPlaying: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
  volume: number;
  currentTime: number;
  duration: number;
  isFavorite: boolean;
  isTunedIn: boolean;
  isMuted: boolean;
  personalVolume: number;
  syncStatus: HeadphoneSyncStatus;
  driftMs: number;
  allowRemoteAudio: boolean;
  queue: QueueTrack[];
  currentClientId: string;
  prefillSearchQuery: string;
}>();

const emit = defineEmits<{
  (e: "selectTab", tab: "queue" | "catalog" | "lyrics"): void;
  (e: "openPasscodeModal"): void;
  (e: "updateNickname", nickname: string): void;
  (e: "toggleFavorite"): void;
  (e: "seek", time: number): void;
  (e: "lockedSeekClick"): void;
  (e: "togglePlay"): void;
  (e: "skip"): void;
  (e: "toggleKaraoke"): void;
  (e: "setKaraokeLevel", level: number): void;
  (e: "updateVolume", val: number): void;
  (e: "tuneIn"): void;
  (e: "tuneOut"): void;
  (e: "toggleMute"): void;
  (e: "setPersonalVolume", vol: number): void;
  (e: "openCatalog", query?: string): void;
  (e: "upvote", queueId: string): void;
  (e: "removeVote", queueId: string): void;
  (e: "removeTrack", queueId: string): void;
  (e: "openRhythmModal"): void;
  (e: "openLeaderboardModal"): void;
  (e: "openTriviaModal"): void;
  (e: "openGameHub"): void;
}>();

const {
  onTabSwitch,
  onTrackRequested,
  onTrackUpvoted,
  onKaraokeToggled,
} = useJukeChanMood();

type OverlayType = "none" | "queue" | "catalog" | "lyrics";
const activeOverlay = ref<OverlayType>("none");

watch(
  () => props.prefillSearchQuery,
  (newQ) => {
    if (newQ) {
      activeOverlay.value = "catalog";
    }
  }
);

watch(
  () => props.activeTab,
  (tab) => {
    if (tab) {
      activeOverlay.value = tab;
    }
  }
);

let unregisterOverlay: (() => void) | null = null;
watch(activeOverlay, (val) => {
  if (unregisterOverlay) {
    unregisterOverlay();
    unregisterOverlay = null;
  }
  if (val !== "none") {
    unregisterOverlay = registerModal("client-mobile-overlay", () => {
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

function toggleOverlay(tab: "queue" | "catalog" | "lyrics") {
  if (activeOverlay.value === tab) {
    activeOverlay.value = "none";
  } else {
    activeOverlay.value = tab;
    onTabSwitch(tab);
    emit("selectTab", tab);
  }
}

function closeOverlay() {
  activeOverlay.value = "none";
}

function handleTrackRequested(track: { title: string }) {
  onTrackRequested(track.title);
}

function handleUpvote(queueId: string) {
  const item = props.queue.find((q) => q.queueId === queueId);
  onTrackUpvoted(item?.title);
  emit("upvote", queueId);
}

function handleToggleKaraoke() {
  onKaraokeToggled(!props.karaokeEnabled);
  emit("toggleKaraoke");
}
</script>

<template>
  <div class="client-mobile-layout flex flex-col gap-3 min-h-[100dvh] pb-24 select-none">
    <!-- Mobile Persona 5 Sticky Header -->
    <MobileHeader
      :status="status"
      :myRole="myRole"
      :nickname="nickname"
      :activeListeners="activeListeners"
      :headphoneCount="headphoneCount"
      :queueCount="queue.length"
      @openPasscodeModal="emit('openPasscodeModal')"
      @updateNickname="emit('updateNickname', $event)"
    />

    <!-- Vertical Full-Screen Persona Stage Hero -->
    <section class="flex-1 flex flex-col min-h-[380px] sm:min-h-[460px]">
      <JukeChanStage
        class="flex-1"
        :track="nowPlaying"
        :isPlaying="isPlaying"
        :compact="false"
        :fullScreen="true"
        :interactive="true"
      />
    </section>

    <!-- Persona 5 Now Playing Battle Gauge (Bottom-Pinned above deck) -->
    <section class="px-1">
      <PersonaNowPlayingGauge
        :track="nowPlaying"
        :isPlaying="isPlaying"
        :isDjOrHost="isDjOrHost"
        :karaokeEnabled="karaokeEnabled"
        :karaokeLevel="karaokeLevel"
        :volume="volume"
        :currentTime="currentTime"
        :duration="duration"
        :isFavorite="isFavorite"
        :isTunedIn="isTunedIn"
        :isMuted="isMuted"
        :personalVolume="personalVolume"
        :syncStatus="syncStatus"
        :driftMs="driftMs"
        :allowRemoteAudio="allowRemoteAudio"
        @toggleFavorite="emit('toggleFavorite')"
        @openLyrics="toggleOverlay('lyrics')"
        @seek="emit('seek', $event)"
        @lockedSeekClick="emit('lockedSeekClick')"
        @togglePlay="emit('togglePlay')"
        @skip="emit('skip')"
        @toggleKaraoke="handleToggleKaraoke"
        @setKaraokeLevel="emit('setKaraokeLevel', $event)"
        @updateVolume="emit('updateVolume', $event)"
        @tuneIn="emit('tuneIn')"
        @tuneOut="emit('tuneOut')"
        @toggleMute="emit('toggleMute')"
        @setPersonalVolume="emit('setPersonalVolume', $event)"
      />
    </section>

    <!-- Mobile DJ Deck Controls (If DJ/Host) -->
    <MobileDjDeck
      v-if="isDjOrHost && nowPlaying"
      :isPlaying="isPlaying"
      :karaokeEnabled="karaokeEnabled"
      :karaokeLevel="karaokeLevel"
      :volume="volume"
      @togglePlay="emit('togglePlay')"
      @skip="emit('skip')"
      @toggleKaraoke="handleToggleKaraoke"
      @setKaraokeLevel="emit('setKaraokeLevel', $event)"
      @updateVolume="emit('updateVolume', $event)"
    />

    <!-- Quick Reactions Dock -->
    <div class="px-1">
      <ReactionDock :compact="true" class="w-full" />
    </div>

    <!-- Slanted Bottom Action Dock (Thumb-Friendly Persona Command Strip) -->
    <div
      class="fixed bottom-2 inset-x-2 z-40 bg-[#0b0b14]/95 border-2 border-white p-1.5 shadow-[5px_5px_0px_#000000] flex items-center justify-between gap-1.5 backdrop-blur-md"
      style="transform: skewX(-2deg);"
    >
      <!-- Queue -->
      <button
        type="button"
        class="flex-1 h-11 border-2 font-black text-[11px] uppercase tracking-wider flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95"
        :class="[
          activeOverlay === 'queue'
            ? 'bg-[#e60012] text-white border-white shadow-[2px_2px_0px_#000]'
            : 'bg-black text-slate-300 border-white/40 hover:text-white',
        ]"
        style="transform: skewX(-10deg);"
        @click="toggleOverlay('queue')"
      >
        <span style="transform: skewX(10deg);">QUEUE ({{ queue.length }})</span>
      </button>

      <!-- Catalog -->
      <button
        type="button"
        class="flex-1 h-11 border-2 font-black text-[11px] uppercase tracking-wider flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95"
        :class="[
          activeOverlay === 'catalog'
            ? 'bg-[#00e5ff] text-black border-white shadow-[2px_2px_0px_#000]'
            : 'bg-black text-slate-300 border-white/40 hover:text-white',
        ]"
        style="transform: skewX(-10deg);"
        @click="toggleOverlay('catalog')"
      >
        <span style="transform: skewX(10deg);">CATALOG</span>
      </button>

      <!-- Lyrics -->
      <button
        type="button"
        class="flex-1 h-11 border-2 font-black text-[11px] uppercase tracking-wider flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95"
        :class="[
          activeOverlay === 'lyrics'
            ? 'bg-[#d946ef] text-white border-white shadow-[2px_2px_0px_#000]'
            : 'bg-black text-slate-300 border-white/40 hover:text-white',
        ]"
        style="transform: skewX(-10deg);"
        @click="toggleOverlay('lyrics')"
      >
        <span style="transform: skewX(10deg);">LIRIK</span>
      </button>

      <!-- Katalog Game -->
      <button
        type="button"
        class="flex-1 h-11 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-[11px] uppercase tracking-wider flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 shadow-[2px_2px_0px_#000]"
        style="transform: skewX(-10deg);"
        @click="emit('openGameHub')"
      >
        <span style="transform: skewX(10deg);">🎮 GAME</span>
      </button>
    </div>

    <!-- Mobile Slide-Up Persona Overlay Sheets -->
    <Teleport to="body">
      <div
        v-if="activeOverlay !== 'none'"
        class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end p-2 sm:p-4 select-none animate-in fade-in duration-200"
      >
        <div class="w-full h-[88vh] max-h-[88vh] flex flex-col">
          <!-- 1. QUEUE SHEET -->
          <PersonaOverlayPanel
            v-if="activeOverlay === 'queue'"
            title="QUEUE // ANTREAN LAGU"
            subtitle="DEMOCRATIC_PLAYLIST_SYSTEM"
            icon="list-music"
            color="red"
            :badge="queue.length"
            @close="closeOverlay"
          >
            <MobileQueueSection
              class="flex-1 overflow-y-auto"
              :queue="queue"
              :activeListeners="activeListeners"
              :headphoneCount="headphoneCount"
              :myRole="myRole"
              :currentClientId="currentClientId"
              @openCatalog="emit('openCatalog', $event); activeOverlay = 'catalog'"
              @upvote="handleUpvote"
              @removeVote="emit('removeVote', $event)"
              @removeTrack="emit('removeTrack', $event)"
            />
          </PersonaOverlayPanel>

          <!-- 2. CATALOG SHEET -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'catalog'"
            title="CATALOG // PENCARIAN"
            subtitle="GLOBAL_MUSIC_ARCHIVE"
            icon="sparkles"
            color="cyan"
            @close="closeOverlay"
          >
            <CatalogView
              class="flex-1 overflow-y-auto"
              :nickname="nickname"
              :nowPlaying="nowPlaying"
              :initialQuery="prefillSearchQuery"
              @requestTrack="handleTrackRequested"
            />
          </PersonaOverlayPanel>

          <!-- 3. LYRICS SHEET -->
          <PersonaOverlayPanel
            v-else-if="activeOverlay === 'lyrics'"
            title="LYRICS // VOCAL KARAOKE"
            subtitle="REALTIME_SYNCHRONIZED_TEXT"
            icon="mic"
            color="purple"
            @close="closeOverlay"
          >
            <LyricsView
              class="flex-1 min-h-0"
              :track="nowPlaying"
              :currentTime="currentTime"
              :duration="duration"
              :isPlaying="isPlaying"
              :canSeek="isDjOrHost"
              :karaokeEnabled="karaokeEnabled"
              :karaokeLevel="karaokeLevel"
              @seek="emit('seek', $event)"
              @back="closeOverlay"
            />
          </PersonaOverlayPanel>
        </div>
      </div>
    </Teleport>

    <!-- Reaction Stream Overlay -->
    <ReactionOverlay positionClass="bottom-24 right-3" :compact="true" />
  </div>
</template>

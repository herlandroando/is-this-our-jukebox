<script setup lang="ts">
import type { MemberRole, QueueTrack } from "../../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import DesktopHeader from "./DesktopHeader.vue";
import DesktopNowPlayingCard from "./DesktopNowPlayingCard.vue";
import DesktopQueueSection from "./DesktopQueueSection.vue";
import CatalogView from "../../CatalogView.vue";
import LyricsView from "../../LyricsView.vue";
import UiIcon from "../../UiIcon.vue";
import ReactionDock from "../../ReactionDock.vue";
import ReactionOverlay from "../../ReactionOverlay.vue";

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
}>();

const quickPickVibes = [
  { label: "Sheila On 7", query: "Sheila On 7 Dan" },
  { label: "Dewa 19", query: "Dewa 19 Kangen" },
  { label: "Queen", query: "Queen Bohemian Rhapsody" },
  { label: "Coldplay", query: "Coldplay Fix You" },
  { label: "Bruno Mars", query: "Bruno Mars Just The Way You Are" },
];
</script>

<template>
  <div class="client-desktop-layout flex flex-col gap-6">
    <!-- Desktop Studio Top Header -->
    <DesktopHeader
      :status="status"
      :myRole="myRole"
      :nickname="nickname"
      :activeListeners="activeListeners"
      :headphoneCount="headphoneCount"
      :activeTab="activeTab"
      :queueCount="queue.length"
      :karaokeEnabled="karaokeEnabled"
      @openPasscodeModal="emit('openPasscodeModal')"
      @updateNickname="emit('updateNickname', $event)"
      @selectTab="emit('selectTab', $event)"
    />

    <!-- 12-Column Studio Grid Workspace -->
    <div class="grid grid-cols-12 gap-6 items-start">
      <!-- LEFT COLUMN: Sticky Hero Player & Studio Controls -->
      <aside class="col-span-5 xl:col-span-4 sticky top-5 flex flex-col gap-5">
        <DesktopNowPlayingCard
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
          @openLyrics="emit('selectTab', 'lyrics')"
          @seek="emit('seek', $event)"
          @lockedSeekClick="emit('lockedSeekClick')"
          @togglePlay="emit('togglePlay')"
          @skip="emit('skip')"
          @toggleKaraoke="emit('toggleKaraoke')"
          @setKaraokeLevel="emit('setKaraokeLevel', $event)"
          @updateVolume="emit('updateVolume', $event)"
          @tuneIn="emit('tuneIn')"
          @tuneOut="emit('tuneOut')"
          @toggleMute="emit('toggleMute')"
          @setPersonalVolume="emit('setPersonalVolume', $event)"
        />

        <!-- Live Room Reactions Dock -->
        <ReactionDock class="w-full" />

        <!-- Desktop Quick Vibe Station Box -->
        <div class="glass-panel p-4 rounded-3xl border-white/10 flex flex-col gap-2.5 shadow-md">
          <div class="flex items-center justify-between text-xs font-bold text-slate-300">
            <span class="flex items-center gap-1.5 text-indigo-400">
              <UiIcon name="sparkles" :size="13" />
              <span>Trending Office Vibes</span>
            </span>
            <span class="text-[10px] text-slate-500 uppercase tracking-wider font-mono">1-Tap Request</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="vibe in quickPickVibes"
              :key="vibe.label"
              class="glass-pill px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-400/40 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              @click="emit('openCatalog', vibe.query)"
            >
              <UiIcon name="plus" :size="11" />
              <span>{{ vibe.label }}</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- RIGHT COLUMN: Main Dynamic Workspace with Page Fade Transitions -->
      <main class="col-span-7 xl:col-span-8 flex flex-col gap-5 min-w-0">
        <transition name="page-fade" mode="out-in">
          <!-- 1. QUEUE TAB -->
          <div v-if="activeTab === 'queue'" key="desktop-queue">
            <DesktopQueueSection
              :queue="queue"
              :activeListeners="activeListeners"
              :headphoneCount="headphoneCount"
              :myRole="myRole"
              :currentClientId="currentClientId"
              @openCatalog="emit('openCatalog', $event)"
              @upvote="emit('upvote', $event)"
              @removeVote="emit('removeVote', $event)"
              @removeTrack="emit('removeTrack', $event)"
            />
          </div>

          <!-- 2. CATALOG TAB -->
          <div v-else-if="activeTab === 'catalog'" key="desktop-catalog">
            <CatalogView
              :nickname="nickname"
              :nowPlaying="nowPlaying"
              :initialQuery="prefillSearchQuery"
              @requestTrack="() => { /* Track requested */ }"
            />
          </div>

          <!-- 3. LYRICS TAB -->
          <div v-else-if="activeTab === 'lyrics'" key="desktop-lyrics" class="h-[750px] min-h-0 flex flex-col">
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
              @back="emit('selectTab', 'queue')"
            />
          </div>
        </transition>
      </main>
    </div>

    <!-- Immersive Floating Reaction & Shoutout Stream Stage -->
    <ReactionOverlay positionClass="bottom-8 right-8" />
  </div>
</template>

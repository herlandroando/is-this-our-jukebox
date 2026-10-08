<script setup lang="ts">
import type { MemberRole, QueueTrack } from "../../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import MobileHeader from "./MobileHeader.vue";
import MobileNowPlayingCard from "./MobileNowPlayingCard.vue";
import MobileDjDeck from "./MobileDjDeck.vue";
import MobileQueueSection from "./MobileQueueSection.vue";
import MobileNavigationDock from "./MobileNavigationDock.vue";
import CatalogView from "../../CatalogView.vue";
import LyricsView from "../../LyricsView.vue";
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
</script>

<template>
  <div
    class="client-mobile-layout flex flex-col gap-2.5 sm:gap-3"
    :class="activeTab === 'lyrics' ? 'pb-20' : 'pb-28 sm:pb-32'"
  >
    <!-- Mobile Sticky Top Header -->
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

    <!-- Dynamic Flow: Switched via Bottom Navigation Dock -->
    <main class="mobile-main-flow flex flex-col gap-2.5 min-w-0">
      <!-- 1. QUEUE TAB -->
      <template v-if="activeTab === 'queue'">
        <!-- Ultra-Compact Mobile Now Playing Card (~88px) -->
        <MobileNowPlayingCard
          :track="nowPlaying"
          :isPlaying="isPlaying"
          :isDjOrHost="isDjOrHost"
          :karaokeEnabled="karaokeEnabled"
          :karaokeLevel="karaokeLevel"
          :currentTime="currentTime"
          :duration="duration"
          :isFavorite="isFavorite"
          :isTunedIn="isTunedIn"
          :isMuted="isMuted"
          @toggleFavorite="emit('toggleFavorite')"
          @openLyrics="emit('selectTab', 'lyrics')"
          @seek="emit('seek', $event)"
          @lockedSeekClick="emit('lockedSeekClick')"
          @tuneIn="emit('tuneIn')"
          @tuneOut="emit('tuneOut')"
        />

        <!-- Compact DJ Deck (Only for DJ/Host when track is active) -->
        <MobileDjDeck
          v-if="isDjOrHost && nowPlaying"
          :isPlaying="isPlaying"
          :karaokeEnabled="karaokeEnabled"
          :karaokeLevel="karaokeLevel"
          :volume="volume"
          @togglePlay="emit('togglePlay')"
          @skip="emit('skip')"
          @toggleKaraoke="emit('toggleKaraoke')"
          @setKaraokeLevel="emit('setKaraokeLevel', $event)"
          @updateVolume="emit('updateVolume', $event)"
        />

        <!-- Live Room Reactions Dock -->
        <div class="flex justify-center px-0.5">
          <ReactionDock :compact="true" class="w-full max-w-[380px]" />
        </div>

        <!-- Live Queue Section -->
        <MobileQueueSection
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
      </template>

      <!-- 2. CATALOG TAB -->
      <div v-else-if="activeTab === 'catalog'">
        <CatalogView
          :nickname="nickname"
          :nowPlaying="nowPlaying"
          :initialQuery="prefillSearchQuery"
          @requestTrack="() => { /* Track requested, toast handled */ }"
        />
      </div>

      <!-- 3. LYRICS TAB -->
      <div v-else-if="activeTab === 'lyrics'" class="h-[calc(100dvh-8.5rem)] min-h-[460px] flex flex-col">
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

        <div class="flex justify-center px-0.5 pt-1 pb-1 shrink-0">
          <ReactionDock :compact="true" class="w-full max-w-[380px]" />
        </div>
      </div>
    </main>

    <!-- Mobile Floating Navigation Dock with Touch Targets & Safe-Area Margins -->
    <MobileNavigationDock
      :activeTab="activeTab"
      :queueCount="queue.length"
      :karaokeEnabled="karaokeEnabled"
      :isTunedIn="isTunedIn"
      :isMuted="isMuted"
      :personalVolume="personalVolume"
      :syncStatus="syncStatus"
      :driftMs="driftMs"
      :hasTrack="!!nowPlaying"
      :isPlaying="isPlaying"
      :allowRemoteAudio="allowRemoteAudio"
      @selectTab="emit('selectTab', $event)"
      @tuneIn="emit('tuneIn')"
      @tuneOut="emit('tuneOut')"
      @toggleMute="emit('toggleMute')"
      @setPersonalVolume="emit('setPersonalVolume', $event)"
    />

    <!-- Immersive Floating Reaction & Shoutout Stream Stage -->
    <ReactionOverlay positionClass="bottom-24 sm:bottom-28 right-3 sm:right-5" :compact="true" />
  </div>
</template>

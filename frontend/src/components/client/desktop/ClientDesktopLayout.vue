<script setup lang="ts">
import { ref, watch } from "vue";
import type { MemberRole, QueueTrack, TriviaGameState } from "../../../shared/types.ts";
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import DesktopHeader from "./DesktopHeader.vue";
import DesktopQueueSection from "./DesktopQueueSection.vue";
import CatalogView from "../../CatalogView.vue";
import LyricsView from "../../LyricsView.vue";
import UiIcon from "../../UiIcon.vue";
import ReactionDock from "../../ReactionDock.vue";
import ReactionOverlay from "../../ReactionOverlay.vue";
import JukeChanStage from "../../mascot/JukeChanStage.vue";
import PersonaCommandRibbon from "../../persona/PersonaCommandRibbon.vue";
import PersonaNowPlayingGauge from "../../persona/PersonaNowPlayingGauge.vue";
import PersonaOverlayPanel from "../../persona/PersonaOverlayPanel.vue";
import PersonaGameCatalogView from "../../persona/PersonaGameCatalogView.vue";
import { useJukeChanMood } from "../../../shared/useJukeChanMood.ts";

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
  triviaState?: TriviaGameState | null;
  showOsuMode?: boolean;
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

// Overlay active state: "none" = full-screen Juke-chan battle stage
type OverlayType = "none" | "queue" | "catalog" | "lyrics" | "games";
const activeOverlay = ref<OverlayType>("none");

// Watch if user searched query from vibe or prop
watch(
  () => props.prefillSearchQuery,
  (newQ) => {
    if (newQ) {
      activeOverlay.value = "catalog";
    }
  }
);

function toggleOverlay(tab: "queue" | "catalog" | "lyrics" | "games") {
  if (activeOverlay.value === tab) {
    activeOverlay.value = "none";
  } else {
    activeOverlay.value = tab;
    if (tab !== "games") {
      onTabSwitch(tab);
      emit("selectTab", tab);
    }
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

function handleQuickVibe(query: string) {
  activeOverlay.value = "catalog";
  emit("openCatalog", query);
}

const quickPickVibes = [
  { label: "Sheila On 7", query: "Sheila On 7 Dan" },
  { label: "Dewa 19", query: "Dewa 19 Kangen" },
  { label: "Queen", query: "Queen Bohemian Rhapsody" },
  { label: "Coldplay", query: "Coldplay Fix You" },
  { label: "Bruno Mars", query: "Bruno Mars Just The Way You Are" },
];
</script>

<template>
  <div class="client-desktop-layout flex flex-col gap-3.5 h-full max-h-full min-h-0 overflow-hidden select-none">
    <!-- Desktop Persona 5 Top Bar -->
    <DesktopHeader
      class="shrink-0"
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
      @selectTab="toggleOverlay"
      @openGameHub="emit('openGameHub')"
      @openTriviaModal="emit('openTriviaModal')"
      @openRhythmModal="emit('openRhythmModal')"
      @openLeaderboardModal="emit('openLeaderboardModal')"
    />

    <!-- Main Full-Screen Persona 5 Battle Stage Grid -->
    <div class="flex-1 min-h-0 grid grid-cols-12 gap-5 items-stretch relative overflow-hidden">
      <!-- LEFT SECTION: Juke-chan Full-Screen Centerpiece + Dynamic Command Ribbons -->
      <div
        class="transition-all duration-300 flex flex-col justify-between gap-3 h-full min-h-0 overflow-hidden"
        :class="activeOverlay === 'none' ? 'col-span-7 xl:col-span-8' : 'col-span-5 xl:col-span-5'"
      >
        <!-- The Grand Persona Stage Canvas -->
        <div class="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          <!-- Juke-chan Mascot Stage with Integrated Command Ribbons Slot -->
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
              <!-- Ribbon 1: Queue -->
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

              <!-- Ribbon 2: Catalog -->
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

              <!-- Ribbon 3: Lyrics -->
              <PersonaCommandRibbon
                label="LYRICS // VOCAL"
                sublabel="VOCAL.SYNC_FEED"
                icon="mic"
                color="yellow"
                :active="activeOverlay === 'lyrics'"
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
                shortcut="4"
                :active="activeOverlay === 'games'"
                :size="activeOverlay !== 'none' ? 'sm' : 'md'"
                @click="toggleOverlay('games')"
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
              @click="handleQuickVibe(vibe.query)"
            >
              + {{ vibe.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT SECTION: Persona 5 Party Status HP/SP Gauge OR Dynamic Overlay Panel -->
      <div
        class="transition-all duration-300 flex flex-col gap-4 min-w-0 h-full min-h-0 overflow-hidden"
        :class="activeOverlay === 'none' ? 'col-span-5 xl:col-span-4' : 'col-span-7 xl:col-span-7'"
      >
        <!-- IF NO OVERLAY: Display Party HP/SP Gauges + Live Reaction Station -->
        <div v-if="activeOverlay === 'none'" class="flex flex-col gap-4 justify-between h-full min-h-0 overflow-y-auto pr-1">
          <!-- Persona 5 Now Playing HP/SP Battle Gauge -->
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

          <!-- Live Room Reactions Dock -->
          <div
            class="bg-[#0b0b14] border-2 border-white p-4 shadow-[6px_6px_0px_#000] shrink-0"
            style="transform: skewX(-2deg);"
          >
            <div class="flex items-center justify-between text-xs font-black uppercase text-white mb-2 pb-1 border-b border-white/20">
              <span class="flex items-center gap-1.5">
                <span class="text-[#e60012]">●</span>
                <span>ROOM EMOTES // SHOUTOUTS</span>
              </span>
              <span class="text-[10px] font-mono text-cyan-400">1-TAP REACTION</span>
            </div>
            <ReactionDock class="w-full" />
          </div>

          <!-- Stage Interaction Guide Banner -->
          <div
            class="bg-[#141424] border-2 border-white/40 p-3.5 flex flex-col gap-1 text-slate-300 shadow-[4px_4px_0px_#000] shrink-0"
            style="transform: skewX(-2deg);"
          >
            <div class="flex items-center gap-2 text-xs font-black text-[#00e5ff] uppercase">
              <span>⚡ PERSONA 5 STAGE CONTROLS</span>
            </div>
            <p class="text-[11px] leading-relaxed">
              Klik salah satu pita menu di samping Juke-chan untuk membuka antrean, katalog lagu, lirik, atau minigame arcade. Tekan <span class="text-white font-black underline">[O BACK]</span> untuk kembali ke panggung penuh kapan saja.
            </p>
          </div>
        </div>

        <!-- IF OVERLAY ACTIVE: Display Persona 5 Slanted Panel with [O BACK] -->
        <div v-else class="h-full min-h-0 flex flex-col overflow-hidden">
          <!-- 1. QUEUE OVERLAY -->
          <PersonaOverlayPanel
            v-if="activeOverlay === 'queue'"
            title="QUEUE // DAFTAR LAGU"
            subtitle="DEMOCRATIC_PLAYLIST_SYSTEM"
            icon="list-music"
            color="red"
            :badge="queue.length"
            class="h-full min-h-0"
            @close="closeOverlay"
          >
            <DesktopQueueSection
              class="flex-1 min-h-0 overflow-y-auto pr-1"
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
              :nickname="nickname"
              :nowPlaying="nowPlaying"
              :initialQuery="prefillSearchQuery"
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
              :canSeek="isDjOrHost"
              :karaokeEnabled="karaokeEnabled"
              :karaokeLevel="karaokeLevel"
              @seek="emit('seek', $event)"
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
              :isDjOrHost="isDjOrHost"
              :triviaState="triviaState"
              :showOsuMode="showOsuMode ?? true"
              @openTrivia="emit('openTriviaModal')"
              @openRhythm="emit('openRhythmModal')"
              @openLeaderboard="emit('openLeaderboardModal')"
            />
          </PersonaOverlayPanel>
        </div>
      </div>
    </div>

    <!-- Immersive Floating Reaction Stream -->
    <ReactionOverlay positionClass="bottom-8 right-8" />
  </div>
</template>

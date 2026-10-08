<script setup lang="ts">
import type { HeadphoneSyncStatus } from "../../../shared/useHeadphoneAudio.ts";
import HeadphoneTuneIn from "../../HeadphoneTuneIn.vue";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  activeTab: "queue" | "catalog" | "lyrics";
  queueCount: number;
  karaokeEnabled: boolean;
  isTunedIn: boolean;
  isMuted: boolean;
  personalVolume: number;
  syncStatus: HeadphoneSyncStatus;
  driftMs: number;
  hasTrack: boolean;
  isPlaying: boolean;
  allowRemoteAudio: boolean;
}>();

const emit = defineEmits<{
  (e: "selectTab", tab: "queue" | "catalog" | "lyrics"): void;
  (e: "tuneIn"): void;
  (e: "tuneOut"): void;
  (e: "toggleMute"): void;
  (e: "setPersonalVolume", vol: number): void;
}>();
</script>

<template>
  <div class="mobile-nav-dock-container">
    <!-- Floating Headphone Audio Capsule (Visible when tuned in on Catalog or Lyrics tab) -->
    <transition name="list">
      <div
        v-if="isTunedIn && activeTab !== 'queue'"
        class="fixed inset-x-0 mx-auto max-w-[340px] sm:max-w-[380px] z-40 px-3 pointer-events-auto transition-all duration-300"
        style="bottom: calc(4.25rem + max(0.5rem, env(safe-area-inset-bottom, 0px)));"
      >
        <HeadphoneTuneIn
          :compact="true"
          :isTunedIn="isTunedIn"
          :isMuted="isMuted"
          :personalVolume="personalVolume"
          :syncStatus="syncStatus"
          :driftMs="driftMs"
          :hasTrack="hasTrack"
          :isPlaying="isPlaying"
          :allowRemoteAudio="allowRemoteAudio"
          @tuneIn="emit('tuneIn')"
          @tuneOut="emit('tuneOut')"
          @toggleMute="emit('toggleMute')"
          @setVolume="emit('setPersonalVolume', $event)"
        />
      </div>
    </transition>

    <!-- Emil Kowalski Tactile Floating Bottom Navigation Dock -->
    <nav
      class="fixed inset-x-0 mx-auto max-w-[340px] sm:max-w-[380px] z-40 px-3 pointer-events-none"
      style="bottom: max(0.75rem, env(safe-area-inset-bottom, 0.75rem));"
    >
      <div class="pointer-events-auto tactile-dock justify-between gap-1 p-1 shadow-2xl">
        <!-- Queue Tab -->
        <button
          class="flex-1 h-10 flex items-center justify-center gap-1.5 px-2.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="activeTab === 'queue' ? 'bg-white/15 text-white font-black shadow-[0_0_12px_rgba(255,255,255,0.15)]' : 'text-slate-400 hover:text-slate-200 font-semibold'"
          @click="emit('selectTab', 'queue')"
        >
          <UiIcon name="list-music" :size="14" />
          <span>Queue</span>
          <span
            v-if="queueCount > 0"
            class="tabular-nums text-[10px] px-1.5 py-0.2 rounded-full font-mono ml-0.5"
            :class="activeTab === 'queue' ? 'bg-indigo-500/40 text-indigo-200' : 'bg-white/10 text-slate-300'"
          >
            {{ queueCount }}
          </span>
        </button>

        <!-- Catalog Tab -->
        <button
          class="flex-1 h-10 flex items-center justify-center gap-1.5 px-2.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="activeTab === 'catalog' ? 'bg-indigo-600/90 text-white font-black shadow-[0_0_14px_rgba(99,102,241,0.45)]' : 'text-slate-400 hover:text-slate-200 font-semibold'"
          @click="emit('selectTab', 'catalog')"
        >
          <UiIcon name="sparkles" :size="13" />
          <span>Catalog</span>
        </button>

        <!-- Lyrics Tab -->
        <button
          class="flex-1 h-10 flex items-center justify-center gap-1.5 px-2.5 rounded-full text-xs transition-all active:scale-95 cursor-pointer"
          :class="[
            activeTab === 'lyrics'
              ? 'bg-pink-600/90 text-white font-black shadow-[0_0_14px_rgba(236,72,153,0.45)]'
              : 'text-slate-400 hover:text-slate-200 font-semibold',
            karaokeEnabled && activeTab !== 'lyrics' ? 'text-pink-300' : ''
          ]"
          @click="emit('selectTab', 'lyrics')"
        >
          <UiIcon name="mic" :size="13" />
          <span>Lyrics</span>
          <span
            v-if="karaokeEnabled"
            class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse ml-0.5"
          ></span>
        </button>
      </div>
    </nav>
  </div>
</template>

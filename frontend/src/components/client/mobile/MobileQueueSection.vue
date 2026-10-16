<script setup lang="ts">
import type { MemberRole, QueueTrack } from "../../../shared/types.ts";
import QueueCard from "../../QueueCard.vue";
import UiIcon from "../../UiIcon.vue";

const props = defineProps<{
  queue: QueueTrack[];
  activeListeners: number;
  headphoneCount: number;
  myRole: MemberRole;
  currentClientId: string;
}>();

const emit = defineEmits<{
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
  <div class="mobile-queue-section flex flex-col gap-3.5">
    <!-- Compact Mobile Music Search CTA Pill -->
    <button
      class="w-full h-11 px-3.5 rounded-2xl glass-panel bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-indigo-500/40 flex items-center justify-between text-xs text-slate-300 transition-all cursor-pointer active:scale-[0.98] shadow-md group"
      title="Search songs, artists, or browse catalog"
      @click="emit('openCatalog', '')"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition-transform shadow-[0_0_8px_rgba(99,102,241,0.25)]">
          <UiIcon name="search" :size="13" :strokeWidth="2.4" />
        </div>
        <span class="font-medium truncate text-slate-300 group-hover:text-white transition-colors">
          Search music or artists...
        </span>
      </div>

      <span class="glass-pill px-2.5 py-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/15 border-indigo-400/35 flex items-center gap-1.5 shrink-0">
        <UiIcon name="sparkles" :size="11" />
        <span>Browse</span>
      </span>
    </button>

    <!-- Live Democratic Queue & Vibe Station -->
    <section id="mobile-queue" class="flex flex-col gap-2.5">
      <!-- Section Header -->
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <UiIcon name="list-music" :size="14" />
          </div>
          <h3 class="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
            <span>Antrean Playlist</span>
            <span class="text-[10px] font-mono font-bold tabular-nums px-2 py-0.2 rounded-md bg-white/10 text-indigo-200 border border-white/10">
              {{ queue.length }}
            </span>
          </h3>
        </div>

        <span class="text-[10px] font-mono text-indigo-300 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
          ▲ TAP TO VOTE
        </span>
      </div>

      <!-- Empty State: Compact Vibe Station -->
      <div
        v-if="queue.length === 0"
        class="empty-queue-station glass-panel p-5 rounded-2xl flex flex-col items-center justify-center text-center gap-2.5 border-dashed border-white/15"
      >
        <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
          <UiIcon name="disc" :size="26" strokeWidth="1.2" class="empty-disc-icon" />
        </div>

        <div class="flex flex-col gap-0.5 max-w-xs">
          <h4 class="text-xs sm:text-sm font-black text-white tracking-tight">Antrean Masih Kosong 🎧</h4>
          <p class="text-[11px] text-slate-400 leading-normal">
            Pilih lagu hits rekomendasi Juke-chan di bawah ini:
          </p>
        </div>

        <!-- Quick-Pick Vibe Chips -->
        <div class="flex flex-wrap items-center justify-center gap-1.5 max-w-sm my-0.5">
          <button
            v-for="vibe in quickPickVibes"
            :key="vibe.label"
            class="glass-pill h-8 px-2.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-indigo-500/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
            @click="emit('openCatalog', vibe.query)"
          >
            <UiIcon name="plus" :size="10" />
            <span>{{ vibe.label }}</span>
          </button>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button class="btn-primary text-xs px-3.5 py-1.5 cursor-pointer shadow-md" @click="emit('openCatalog', '')">
            <UiIcon name="search" :size="12" :strokeWidth="2.2" />
            <span>Search Music</span>
          </button>
          <button class="btn-secondary text-xs px-3.5 py-1.5 cursor-pointer shadow-sm" @click="emit('openCatalog', '')">
            <UiIcon name="sparkles" :size="12" />
            <span>Catalog</span>
          </button>
        </div>
      </div>

      <!-- Populated Queue with Vue Transition Group -->
      <transition-group v-else name="list" tag="div" class="flex flex-col gap-2">
        <QueueCard
          v-for="item in queue"
          :key="item.queueId"
          :track="item"
          :isAdmin="myRole === 'host'"
          :userRole="myRole"
          :currentClientId="currentClientId"
          @upvote="emit('upvote', item.queueId)"
          @removeVote="emit('removeVote', item.queueId)"
          @removeTrack="emit('removeTrack', item.queueId)"
        />
      </transition-group>
    </section>
  </div>
</template>

<style scoped>
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

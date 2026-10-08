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
  <div class="desktop-queue-section flex flex-col gap-5">
    <!-- Search CTA Button -->
    <button
      class="w-full h-12 px-4 rounded-2xl glass-panel bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-indigo-500/40 flex items-center justify-between text-sm text-slate-300 transition-all cursor-pointer active:scale-[0.98] shadow-md group"
      title="Search songs, artists, or browse music catalog"
      @click="emit('openCatalog', '')"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition-transform shadow-[0_0_8px_rgba(99,102,241,0.25)]">
          <UiIcon name="search" :size="15" :strokeWidth="2.4" />
        </div>
        <span class="font-medium truncate text-slate-300 group-hover:text-white transition-colors">
          Search songs, artists, or paste YouTube link...
        </span>
      </div>

      <span class="glass-pill px-3 py-1 text-xs font-bold text-indigo-300 bg-indigo-500/15 border-indigo-400/35 flex items-center gap-1.5 shrink-0 group-hover:bg-indigo-500/25 transition-all">
        <UiIcon name="sparkles" :size="12" />
        <span>Browse</span>
      </span>
    </button>

    <!-- Live Democratic Queue & Vibe Station -->
    <section id="desktop-queue" class="flex flex-col gap-3">
      <!-- Section Header -->
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <div class="text-indigo-400">
            <UiIcon name="list-music" :size="18" />
          </div>
          <h3 class="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
            <span>Office Queue</span>
            <span class="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full bg-white/10 text-indigo-200">
              {{ queue.length }}
            </span>
          </h3>
        </div>

        <div class="glass-pill px-3 py-1 flex items-center gap-1.5 text-xs font-medium text-slate-400 shadow-sm">
          <UiIcon name="users" :size="12" />
          <span class="tabular-nums">{{ activeListeners }} in room</span>
          <span
            v-if="headphoneCount > 0"
            class="text-emerald-400 font-bold flex items-center gap-1 ml-0.5"
            :title="`${headphoneCount} listening via headphones`"
          >
            • <UiIcon name="headphones" :size="11" /> {{ headphoneCount }}
          </span>
        </div>
      </div>

      <!-- Empty State: The Obsidian Vibe Station -->
      <div
        v-if="queue.length === 0"
        class="empty-queue-station glass-panel p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-4 border-dashed border-white/15"
      >
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
          <UiIcon name="disc" :size="34" strokeWidth="1.2" class="empty-disc-icon" />
        </div>

        <div class="flex flex-col gap-1 max-w-sm">
          <h4 class="text-lg font-bold text-white tracking-tight">The Queue is Clear</h4>
          <p class="text-sm text-slate-400 leading-relaxed">
            The room is waiting for your selection. Tap a trending hit below to request it in one tap:
          </p>
        </div>

        <!-- Quick-Pick Vibe Chips -->
        <div class="flex flex-wrap items-center justify-center gap-2 max-w-md my-1">
          <button
            v-for="vibe in quickPickVibes"
            :key="vibe.label"
            class="glass-pill h-9 px-3.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-400/40 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            @click="emit('openCatalog', vibe.query)"
          >
            <UiIcon name="plus" :size="12" />
            <span>{{ vibe.label }}</span>
          </button>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button class="btn-primary text-xs px-4 py-2 cursor-pointer shadow-md" @click="emit('openCatalog', '')">
            <UiIcon name="search" :size="13" :strokeWidth="2.2" />
            <span>Search Music</span>
          </button>
          <button class="btn-secondary text-xs px-4 py-2 cursor-pointer shadow-sm" @click="emit('openCatalog', '')">
            <UiIcon name="sparkles" :size="13" />
            <span>Explore Catalog</span>
          </button>
        </div>
      </div>

      <!-- Populated Queue with Vue Transition Group -->
      <transition-group v-else name="list" tag="div" class="flex flex-col gap-2.5">
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

<script setup lang="ts">
import { computed } from "vue";
import type { MemberRole, QueueTrack } from "../shared/types.ts";

const props = defineProps<{
  track: QueueTrack;
  isAdmin?: boolean;
  userRole?: MemberRole;
  currentClientId: string;
}>();

const emit = defineEmits<{
  (e: "upvote", queueId: string): void;
  (e: "removeVote", queueId: string): void;
  (e: "removeTrack", queueId: string): void;
}>();

const hasVoted = computed(() => {
  return (
    props.track.votedIps?.includes(props.currentClientId) ||
    props.track.voters?.some((v) => v.clientId === props.currentClientId) ||
    false
  );
});

const canRemove = computed(() => {
  return props.isAdmin || props.userRole === "dj" || props.userRole === "host";
});

const hasVipOrDjVote = computed(() => {
  return props.track.voters?.some((v) => v.role === "dj" || v.role === "vip") || false;
});

const votersTooltip = computed(() => {
  if (!props.track.voters || props.track.voters.length === 0) {
    return `${props.track.votes} votes`;
  }
  const voterList = props.track.voters
    .map((v) => `${v.nickname} (${v.role === "dj" ? "🎧" : v.role === "vip" ? "⭐" : "👤"}+${v.weight})`)
    .join(", ");
  return `${props.track.votes} votes: ${voterList}`;
});

function toggleVote() {
  if (hasVoted.value) {
    emit("removeVote", props.track.queueId);
  } else {
    emit("upvote", props.track.queueId);
  }
}

function formatDuration(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>

<template>
  <div
    class="queue-card glass-panel"
    :class="{
      'is-playing': track.status === 'playing',
      'has-special-vote': hasVipOrDjVote,
    }"
  >
    <div class="thumb-wrapper">
      <img v-if="track.thumbnail" :src="track.thumbnail" :alt="track.title" class="thumb" loading="lazy" />
      <div v-else class="thumb-placeholder">🎵</div>
      <span class="provider-tag" :class="`badge-${track.provider}`">{{ track.provider.toUpperCase() }}</span>
    </div>

    <div class="info">
      <div class="title-row">
        <h3 class="track-title" :title="track.title">{{ track.title }}</h3>
      </div>
      <p class="track-artist">{{ track.artist }}</p>
      
      <div class="meta-row">
        <span class="requester-pill glass-pill">
          <span class="user-icon">👤</span>
          <span class="requester-name">{{ track.requestedBy }}</span>
        </span>
        <span v-if="track.duration" class="duration">{{ formatDuration(track.duration) }}</span>
        <span v-if="track.fallbackCount" class="fallback-pill" title="Alternative match selected">⚡ Fallback</span>
        
        <!-- Voter role tags if boosted -->
        <span v-if="hasVipOrDjVote" class="boosted-tag" :title="votersTooltip">
          ⚡ Boosted
        </span>
      </div>
    </div>

    <div class="actions">
      <button
        class="vote-btn"
        :class="{ voted: hasVoted }"
        :title="votersTooltip"
        @click="toggleVote"
      >
        <span class="vote-icon">▲</span>
        <span class="vote-count">{{ track.votes }}</span>
      </button>

      <button
        v-if="canRemove"
        class="btn-icon remove-btn"
        title="Remove from queue (DJ / Host Privilege)"
        @click="emit('removeTrack', track.queueId)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.queue-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  transition: transform var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.queue-card:hover {
  background: var(--bg-surface-hover);
  border-color: rgba(255, 255, 255, 0.12);
}

.queue-card.is-playing {
  border-color: var(--border-focus);
  background: rgba(99, 102, 241, 0.08);
}

.thumb-wrapper {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000;
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: rgba(255, 255, 255, 0.05);
}

.provider-tag {
  position: absolute;
  bottom: 3px;
  right: 3px;
  font-size: 0.55rem;
  font-weight: 800;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.track-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
}

.track-artist {
  font-size: 0.82rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.2rem;
}

.requester-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.user-icon {
  font-size: 0.65rem;
}

.requester-name {
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.duration {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.fallback-pill {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-warning);
  background: rgba(245, 158, 11, 0.15);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.4rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.vote-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-fast);
  padding: 0.2rem;
}

.vote-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.vote-icon {
  font-size: 0.75rem;
  color: var(--text-muted);
  transition: transform var(--transition-bounce), color var(--transition-fast);
}

.vote-count {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.vote-btn.voted {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 0 16px -2px var(--accent-glow);
}

.vote-btn.voted .vote-icon {
  color: #818cf8;
  transform: translateY(-1px) scale(1.15);
}

.vote-btn.voted .vote-count {
  color: #c7d2fe;
}

.remove-btn {
  width: 34px;
  height: 34px;
  color: var(--text-muted);
}

.remove-btn:hover {
  color: var(--color-error);
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.3);
}

.queue-card.has-special-vote {
  border-color: rgba(139, 92, 246, 0.25);
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.04) 0%, rgba(18, 20, 29, 0.7) 100%);
}

.boosted-tag {
  font-size: 0.68rem;
  font-weight: 700;
  color: #c084fc;
  background: rgba(139, 92, 246, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.45rem;
}
</style>

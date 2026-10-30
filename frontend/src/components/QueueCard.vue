<script setup lang="ts">
import { computed } from "vue";
import type { MemberRole, QueueTrack } from "../shared/types.ts";
import { useFavorites } from "../shared/useFavorites.ts";
import UiIcon from "./UiIcon.vue";

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

const { isFavorite, toggleFavorite } = useFavorites();

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
    .map((v) => `${v.nickname} (${v.role.toUpperCase()} +${v.weight})`)
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

const displayArtist = computed(() => {
  const a = props.track.artist;
  if (!a || a === "YouTube Music" || /^\d+:\d{2}(:\d{2})?$/.test(a.trim())) {
    const t = props.track.title || "";
    if (t.includes(" - ")) {
      const parts = t.split(" - ");
      if (parts.length >= 2 && parts[0].trim().length > 1) {
        return parts[0].trim();
      }
    }
    return "";
  }
  return a;
});
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
      <div v-else class="thumb-placeholder">
        <UiIcon name="music" :size="20" />
      </div>
      <span class="provider-tag" :class="`badge-${track.provider}`">{{ track.provider.toUpperCase() }}</span>
    </div>

    <div class="info">
      <div class="title-row">
        <h3 class="track-title" :title="track.title">{{ track.title }}</h3>
      </div>
      <p v-if="displayArtist" class="track-artist">{{ displayArtist }}</p>
      
      <div class="meta-row">
        <span class="requester-pill glass-pill">
          <UiIcon name="user" :size="11" />
          <span class="requester-name">{{ track.requestedBy }}</span>
        </span>
        <span v-if="track.duration" class="duration tabular-nums">{{ formatDuration(track.duration) }}</span>
        <span v-if="track.fallbackCount" class="fallback-pill" title="Alternative match selected">
          <UiIcon name="sparkles" :size="10" /> Fallback
        </span>
        
        <!-- Voter role tags if boosted -->
        <span v-if="hasVipOrDjVote" class="boosted-tag" :title="votersTooltip">
          <UiIcon name="sparkles" :size="10" /> Boosted
        </span>
      </div>
    </div>

    <div class="actions">
      <button
        class="star-btn"
        :class="{ active: isFavorite(track.id) }"
        :title="isFavorite(track.id) ? 'Remove from Favorites' : 'Save to Favorites'"
        :aria-label="isFavorite(track.id) ? 'Hapus dari lagu favorit' : 'Simpan ke lagu favorit'"
        @click="toggleFavorite(track)"
      >
        <UiIcon v-if="isFavorite(track.id)" name="star-filled" :size="14" />
        <UiIcon v-else name="star" :size="14" />
      </button>

      <button
        class="vote-btn"
        :class="{ voted: hasVoted }"
        :title="votersTooltip"
        :aria-label="hasVoted ? 'Batalkan vote untuk ' + track.title : 'Vote untuk ' + track.title"
        @click="toggleVote"
      >
        <UiIcon name="arrow-up" :size="13" class="vote-icon" />
        <span class="vote-count tabular-nums">{{ track.votes }}</span>
      </button>

      <button
        v-if="canRemove"
        class="btn-icon remove-btn"
        title="Remove from queue (Host / DJ)"
        :aria-label="'Hapus ' + track.title + ' dari antrean'"
        @click="emit('removeTrack', track.queueId)"
      >
        <UiIcon name="trash-2" :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.queue-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.75rem 0.95rem;
  border-radius: var(--radius-md);
  background: rgba(14, 17, 26, 0.65);
  border: 1px solid var(--border-subtle);
  transition: transform var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.queue-card:hover {
  background: rgba(22, 26, 38, 0.85);
  border-color: rgba(255, 255, 255, 0.14);
  transform: translateY(-1px);
}

.queue-card.is-playing {
  border-color: var(--border-focus);
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 24px -6px rgba(99, 102, 241, 0.3);
}

.thumb-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
}

.provider-tag {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.52rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 0.08rem 0.28rem;
  border-radius: 3px;
  line-height: 1;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.track-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.track-artist {
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.15rem;
}

.requester-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.12rem 0.5rem;
  font-size: 0.68rem;
  color: var(--text-muted);
}

.requester-name {
  max-width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.duration {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.fallback-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-warning);
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--radius-full);
  padding: 0.08rem 0.4rem;
}

.boosted-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #c084fc;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: var(--radius-full);
  padding: 0.08rem 0.4rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.vote-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: transform var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
  padding: 0.15rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

@media (hover: hover) and (pointer: fine) {
  .vote-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
  }
}

.vote-btn:active {
  transform: scale(0.92) !important;
}

.vote-icon {
  color: var(--text-muted);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s ease;
}

.vote-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  line-height: 1;
}

.vote-btn.voted {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 16px -2px var(--accent-glow);
}

.vote-btn.voted .vote-icon {
  color: #818cf8;
  transform: translateY(-2px);
}

.vote-btn.voted .vote-count {
  color: #c7d2fe;
}

.star-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

@media (hover: hover) and (pointer: fine) {
  .star-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fbbf24;
    transform: scale(1.08);
  }
}

.star-btn:active {
  transform: scale(0.9) !important;
}

.star-btn.active {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.35);
  box-shadow: 0 0 12px -2px rgba(251, 191, 36, 0.3);
}

.remove-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

@media (hover: hover) and (pointer: fine) {
  .remove-btn:hover {
    color: var(--color-error);
    background: rgba(244, 63, 94, 0.15);
    border-color: rgba(244, 63, 94, 0.3);
    transform: scale(1.05);
  }
}

.remove-btn:active {
  transform: scale(0.9) !important;
}

.queue-card.has-special-vote {
  border-color: rgba(139, 92, 246, 0.3);
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.08) 0%, rgba(14, 17, 26, 0.7) 100%);
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import QueueCard from "../components/QueueCard.vue";
import SearchModal from "../components/SearchModal.vue";
import LyricsModal from "../components/LyricsModal.vue";
import DjPasscodeModal from "../components/DjPasscodeModal.vue";
import SeekBar from "../components/SeekBar.vue";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";

const isSearchOpen = ref(false);
const isLyricsOpen = ref(false);
const isPasscodeModalOpen = ref(false);
const isEditingNickname = ref(false);
const nicknameInput = ref("");

const nickname = ref(localStorage.getItem("jukebox_nickname") || "Anonymous");

const state = computed(() => jukeboxClient.state.value);
const nowPlaying = computed(() => state.value?.nowPlaying ?? null);
const isPlaying = computed(() => state.value?.isPlaying ?? false);
const queue = computed(() => state.value?.queue ?? []);
const activeListeners = computed(() => state.value?.activeListeners ?? 1);
const status = computed(() => jukeboxClient.status.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);
const myRole = computed(() => jukeboxClient.myRole.value);
const isDjOrHost = computed(
  () => myRole.value === "dj" || myRole.value === "host" || jukeboxClient.isAdmin.value
);

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

const volume = computed(() => state.value?.volume ?? 80);

onMounted(() => {
  jukeboxClient.connect();
});

function startEditNickname() {
  nicknameInput.value = nickname.value;
  isEditingNickname.value = true;
}

function saveNickname() {
  const trimmed = nicknameInput.value.trim();
  nickname.value = trimmed || "Anonymous";
  jukeboxClient.setNickname(nickname.value);
  isEditingNickname.value = false;
  jukeboxClient.addToast(`Nickname set to "${nickname.value}"`, "success");
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

function onSeek(time: number) {
  seekTo(time);
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

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>

<template>
  <div class="client-page">
    <header class="client-header glass-panel">
      <div class="brand">
        <span class="logo">📻</span>
        <div class="brand-text">
          <h1>Office Jukebox</h1>
          <span class="status-dot" :class="status">
            {{ status === 'connected' ? 'Connected' : 'Reconnecting...' }}
          </span>
        </div>
      </div>

      <!-- User Role & Nickname Pill -->
      <div class="user-pill-group">
        <button
          class="role-badge"
          :class="`role-${myRole}`"
          :title="`Current role: ${myRole.toUpperCase()} (Click to claim DJ/VIP role)`"
          @click="isPasscodeModalOpen = true"
        >
          <span v-if="myRole === 'host'">👑 HOST</span>
          <span v-else-if="myRole === 'dj'">🎧 DJ</span>
          <span v-else-if="myRole === 'vip'">⭐ VIP</span>
          <span v-else>👤 MEMBER</span>
        </button>

        <div class="nickname-container">
          <div v-if="!isEditingNickname" class="nickname-pill glass-pill" @click="startEditNickname">
            <span class="name-display">{{ nickname }}</span>
            <span class="edit-hint">✎</span>
          </div>

          <div v-else class="nickname-edit-box glass-pill">
            <input
              v-model="nicknameInput"
              type="text"
              placeholder="Your name"
              maxlength="24"
              class="nickname-input"
              @keyup.enter="saveNickname"
            />
            <button class="save-btn" @click="saveNickname">✓</button>
          </div>
        </div>
      </div>
    </header>

    <main class="client-content">
      <!-- Now Playing Section -->
      <section class="now-playing-section glass-panel">
        <div class="ambient-glow" :style="{ backgroundImage: nowPlaying?.thumbnail ? `url(${nowPlaying.thumbnail})` : 'none' }"></div>

        <div class="hero-body">
          <div class="thumb-container">
            <img v-if="nowPlaying?.thumbnail" :src="nowPlaying.thumbnail" class="hero-thumb" alt="" />
            <div v-else class="hero-placeholder">🎵</div>
            <span v-if="isPlaying" class="playing-badge">PLAYING NOW</span>
          </div>

          <div class="hero-details">
            <div class="details-top">
              <span v-if="nowPlaying?.requestedBy" class="dj-pill glass-pill">
                Requested by {{ nowPlaying.requestedBy }}
              </span>
              <button
                v-if="nowPlaying"
                class="lyrics-icon-btn glass-pill"
                title="View Synced Lyrics"
                @click="isLyricsOpen = true"
              >
                🎤 Lyrics
              </button>
            </div>

            <h2 class="hero-title">{{ nowPlaying?.title || "No track playing" }}</h2>
            <p class="hero-artist">{{ nowPlaying?.artist || "Office speakers are waiting for your tune!" }}</p>

            <!-- Progress Bar / Seekbar -->
            <div v-if="nowPlaying" class="progress-wrap">
              <SeekBar
                :currentTime="currentTime"
                :duration="duration || nowPlaying?.duration || 0"
                :isPlaying="isPlaying"
                :canSeek="isDjOrHost"
                :compact="true"
                @seek="seekTo"
                @lockedClick="onLockedSeekBarClick"
              />
            </div>
          </div>
        </div>

        <!-- DJ Transport Controls Bar (Unlocked when DJ or Host!) -->
        <div v-if="isDjOrHost && nowPlaying" class="dj-transport-panel glass-panel">
          <div class="dj-badge-row">
            <span class="role-badge role-dj">🎧 DJ REMOTE ACTIVE</span>
            <span class="dj-hint">Controls office speakers directly</span>
          </div>

          <div class="dj-controls-row">
            <button class="dj-play-btn" :class="{ playing: isPlaying }" @click="togglePlay">
              <span v-if="isPlaying">⏸</span>
              <span v-else>▶</span>
            </button>

            <button class="btn-secondary dj-skip-btn" @click="skip">
              <span>Next</span> ⏭
            </button>

            <button
              class="btn-secondary dj-lyrics-btn"
              @click="isLyricsOpen = true"
            >
              🎤 Lyrics
            </button>

            <div class="dj-vol-group">
              <span class="vol-icon">🔊</span>
              <input
                type="range"
                min="0"
                max="100"
                :value="volume"
                class="dj-vol-range"
                @input="(e) => updateVolume(Number((e.target as HTMLInputElement).value))"
              />
              <span class="dj-vol-num">{{ volume }}%</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Primary CTA to Request -->
      <section class="cta-section">
        <button class="btn-primary request-cta-btn" @click="isSearchOpen = true">
          <span class="plus-icon">+</span> Request a Song
        </button>
      </section>

      <!-- Live Democratic Queue -->
      <section class="queue-section">
        <div class="section-title-row">
          <h3>Office Queue ({{ queue.length }})</h3>
          <span class="listeners-badge glass-pill">👥 {{ activeListeners }} listening</span>
        </div>

        <div v-if="queue.length === 0" class="empty-state glass-panel">
          <span class="empty-icon">🎶</span>
          <h4>The queue is clear</h4>
          <p>Be the office DJ! Add a song and it will play next.</p>
        </div>

        <transition-group v-else name="list" tag="div" class="queue-list">
          <QueueCard
            v-for="item in queue"
            :key="item.queueId"
            :track="item"
            :isAdmin="myRole === 'host'"
            :userRole="myRole"
            :currentClientId="currentClientId"
            @upvote="onUpvote"
            @removeVote="onRemoveVote"
            @removeTrack="onRemoveTrack"
          />
        </transition-group>
      </section>
    </main>

    <!-- Search Modal / Drawer -->
    <SearchModal
      :isOpen="isSearchOpen"
      :nickname="nickname"
      @close="isSearchOpen = false"
    />

    <!-- Synced Lyrics Modal -->
    <LyricsModal
      :isOpen="isLyricsOpen"
      :track="nowPlaying"
      :currentTime="currentTime"
      :canSeek="isDjOrHost"
      @close="isLyricsOpen = false"
      @seek="onSeek"
    />

    <!-- DJ Passcode Modal -->
    <DjPasscodeModal
      :isOpen="isPasscodeModalOpen"
      :currentRole="myRole"
      @close="isPasscodeModalOpen = false"
      @claimRole="onClaimRole"
    />
  </div>
</template>

<style scoped>
.client-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 1rem 1rem 6rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.client-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo {
  font-size: 1.6rem;
}

.brand-text h1 {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.status-dot {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.status-dot.connected {
  color: var(--color-success);
}

.nickname-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.nickname-pill:hover {
  background: rgba(255, 255, 255, 0.1);
}

.name-display {
  font-size: 0.85rem;
  font-weight: 600;
  max-width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.nickname-edit-box {
  display: flex;
  align-items: center;
  padding: 0.2rem 0.5rem 0.2rem 0.75rem;
  background: rgba(255, 255, 255, 0.08);
}

.nickname-input {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-family: inherit;
  font-size: 0.85rem;
  width: 100px;
}

.save-btn {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-success);
  padding: 0.2rem 0.4rem;
}

.client-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.now-playing-section {
  position: relative;
  overflow: hidden;
  padding: 1.35rem;
  border-color: rgba(255, 255, 255, 0.1);
}

.ambient-glow {
  position: absolute;
  inset: -15px;
  background-size: cover;
  background-position: center;
  filter: blur(40px) brightness(0.3);
  opacity: 0.7;
  z-index: 0;
  pointer-events: none;
}

.hero-body {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.thumb-container {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
  box-shadow: var(--shadow-md);
}

.hero-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.playing-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(16, 185, 129, 0.9);
  color: #fff;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 0.15rem 0;
}

.hero-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.dj-pill {
  align-self: flex-start;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  color: var(--accent-primary);
  font-weight: 600;
}

.hero-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-artist {
  font-size: 0.82rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-wrap {
  margin-top: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.time-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  font-family: "JetBrains Mono", monospace;
  color: var(--text-muted);
}

.progress-bg {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width 0.3s linear;
}

.cta-section {
  display: flex;
}

.request-cta-btn {
  width: 100%;
  padding: 0.85rem;
  font-size: 1rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glow);
}

.plus-icon {
  font-size: 1.25rem;
  font-weight: 700;
}

.queue-section {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title-row h3 {
  font-size: 1rem;
  font-weight: 700;
}

.listeners-badge {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0.2rem 0.6rem;
}

.empty-state {
  padding: 2.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
}

.empty-icon {
  font-size: 2rem;
}

.empty-state h4 {
  font-size: 0.95rem;
  font-weight: 600;
}

.empty-state p {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 260px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.user-pill-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.details-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.lyrics-icon-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  color: #c084fc;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.25);
  transition: all var(--transition-fast);
}

.lyrics-icon-btn:hover {
  background: rgba(139, 92, 246, 0.22);
  transform: translateY(-1px);
}

.dj-transport-panel {
  position: relative;
  z-index: 1;
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.dj-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dj-hint {
  font-size: 0.72rem;
  color: #c084fc;
  font-weight: 600;
}

.dj-controls-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.dj-play-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff;
  color: #000;
  font-size: 1.1rem;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(255, 255, 255, 0.2);
}

.dj-play-btn:hover {
  transform: scale(1.05);
}

.dj-skip-btn {
  padding: 0.5rem 0.9rem;
  font-size: 0.85rem;
}

.dj-lyrics-btn {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  color: #c084fc;
}

.dj-vol-group {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.dj-vol-range {
  width: 80px;
  accent-color: var(--accent-primary);
}

.dj-vol-num {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 30px;
}
</style>

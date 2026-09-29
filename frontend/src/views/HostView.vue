<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { jukeboxClient } from "../shared/ws.ts";
import { whoami } from "../shared/api.ts";
import AudioEngine from "../components/AudioEngine.vue";
import Visualizer from "../components/Visualizer.vue";
import QueueCard from "../components/QueueCard.vue";
import SearchModal from "../components/SearchModal.vue";
import QrPanel from "../components/QrPanel.vue";
import MemberDrawer from "../components/MemberDrawer.vue";
import LyricsModal from "../components/LyricsModal.vue";
import SeekBar from "../components/SeekBar.vue";
import { usePlaybackProgress } from "../shared/usePlaybackProgress.ts";
import type { MemberRole } from "../shared/types.ts";

const route = useRoute();

const token = computed(() => {
  const q = route.query.token;
  if (typeof q === "string") return q;
  if (Array.isArray(q) && typeof q[0] === "string") return q[0];
  return "";
});

const isSearchOpen = ref(false);
const isMemberDrawerOpen = ref(false);
const isLyricsOpen = ref(false);

const analyserNode = ref<AnalyserNode | null>(null);
const clientUrl = ref("");
const hostNickname = ref("Host DJ 🎧");

const state = computed(() => jukeboxClient.state.value);
const nowPlaying = computed(() => state.value?.nowPlaying ?? null);
const isPlaying = computed(() => state.value?.isPlaying ?? false);
const queue = computed(() => state.value?.queue ?? []);
const history = computed(() => state.value?.history ?? []);
const volume = computed(() => state.value?.volume ?? 80);
const autoDjEnabled = computed(() => state.value?.autoDjEnabled ?? true);
const karaokeEnabled = computed(() => state.value?.karaokeEnabled ?? false);
const karaokeLevel = computed(() => state.value?.karaokeLevel ?? 90);
const outputMode = computed(() => state.value?.outputMode ?? "browser");
const activeListeners = computed(() => state.value?.activeListeners ?? 1);
const members = computed(() => state.value?.members ?? []);
const status = computed(() => jukeboxClient.status.value);
const currentClientId = computed(() => jukeboxClient.clientId.value);

const {
  currentTime,
  duration,
  seekTo,
  setDirectTime,
} = usePlaybackProgress({
  track: nowPlaying,
  isPlaying,
  onSeek: (time) => {
    jukeboxClient.send({ type: "seek", time, token: token.value });
  },
});

function onAudioTimeUpdate(cur: number, dur: number) {
  setDirectTime(cur, dur);
}

onMounted(async () => {
  if (token.value) {
    jukeboxClient.setToken(token.value);
  }
  jukeboxClient.connect(token.value);

  try {
    const info = await whoami();
    clientUrl.value = `http://${info.lanIp}:${info.port}/`;
  } catch (err) {
    console.warn("[host] whoami error:", err);
  }
});

function onAnalyserReady(node: AnalyserNode) {
  analyserNode.value = node;
}

// Transport controls
function togglePlay() {
  if (isPlaying.value) {
    jukeboxClient.send({ type: "pause", token: token.value });
  } else {
    jukeboxClient.send({ type: "play", token: token.value });
  }
}

function skip() {
  jukeboxClient.send({ type: "skip", token: token.value });
}

function updateVolume(val: number) {
  jukeboxClient.send({ type: "volume", value: val, token: token.value });
}

function toggleAutoDj() {
  jukeboxClient.send({ type: "toggleAutoDj", enabled: !autoDjEnabled.value, token: token.value });
}

function toggleKaraoke() {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: !karaokeEnabled.value,
    level: karaokeLevel.value,
    token: token.value,
  });
}

function setKaraokeLevel(level: number) {
  jukeboxClient.send({
    type: "setKaraokeMode",
    enabled: karaokeEnabled.value,
    level,
    token: token.value,
  });
}

function setOutputMode(mode: "browser" | "native") {
  jukeboxClient.send({ type: "setOutputMode", mode, token: token.value });
}

function removeTrack(queueId: string) {
  jukeboxClient.send({ type: "removeTrack", queueId, token: token.value });
}

function onUpvote(queueId: string) {
  jukeboxClient.send({ type: "upvoteTrack", queueId });
}

function onRemoveVote(queueId: string) {
  jukeboxClient.send({ type: "removeVote", queueId });
}

function onSetRole(targetClientId: string, role: MemberRole) {
  jukeboxClient.setMemberRole(targetClientId, role);
}

function onSetDjPasscode(passcode: string) {
  jukeboxClient.setDjPasscode(passcode);
}

function onLyricsSeek(time: number) {
  seekTo(time);
}

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>

<template>
  <div class="host-page">
    <!-- Invisible Audio Engine with DSP Karaoke Processor -->
    <AudioEngine
      v-if="outputMode === 'browser'"
      :track="nowPlaying"
      :isPlaying="isPlaying"
      :volume="volume"
      :karaokeEnabled="karaokeEnabled"
      :karaokeLevel="karaokeLevel"
      @analyserReady="onAnalyserReady"
      @timeUpdate="onAudioTimeUpdate"
    />

    <header class="top-nav glass-panel">
      <div class="brand">
        <span class="logo-icon">📻</span>
        <div class="brand-text">
          <h1>Office Jukebox</h1>
          <span class="role-badge role-host">👑 Host Center</span>
        </div>
      </div>

      <div class="status-group">
        <span class="status-indicator" :class="status">
          <span class="dot"></span>
          {{ status === 'connected' ? 'Live on Air' : status }}
        </span>
        <button class="btn-secondary members-btn glass-pill" @click="isMemberDrawerOpen = true">
          👥 {{ members.length || activeListeners }} in Room
        </button>
        <button class="btn-primary" @click="isSearchOpen = true">
          + Request Song
        </button>
      </div>
    </header>

    <main class="host-grid">
      <!-- Left Column: Player & Controls -->
      <section class="player-column">
        <!-- Now Playing Hero Card -->
        <div class="now-playing-card glass-panel">
          <div class="ambient-glow" :style="{ backgroundImage: nowPlaying?.thumbnail ? `url(${nowPlaying.thumbnail})` : 'none' }"></div>

          <div class="card-content">
            <div class="cover-wrapper">
              <img v-if="nowPlaying?.thumbnail" :src="nowPlaying.thumbnail" class="cover-art" alt="Album Cover" />
              <div v-else class="cover-placeholder">🎵</div>
              <span v-if="nowPlaying" class="provider-badge" :class="`badge-${nowPlaying.provider}`">
                {{ nowPlaying.provider.toUpperCase() }}
              </span>
            </div>

            <div class="track-details">
              <span v-if="nowPlaying?.requestedBy" class="dj-pill glass-pill">
                Requested by {{ nowPlaying.requestedBy }}
              </span>
              <h2 class="title">{{ nowPlaying?.title || "Jukebox is idle" }}</h2>
              <p class="artist">{{ nowPlaying?.artist || "Queue empty — Auto-DJ ready to groove" }}</p>
              
              <div class="visualizer-wrapper">
                <Visualizer :analyser="analyserNode" :isPlaying="isPlaying" />
              </div>
            </div>
          </div>

          <!-- Real-Time Karaoke Quick-Access Banner -->
          <transition name="karaoke-banner-pop">
            <div v-if="karaokeEnabled && nowPlaying" class="karaoke-banner glass-panel">
              <div class="karaoke-banner-left">
                <span class="karaoke-pulse-icon">🎤</span>
                <div class="karaoke-banner-info">
                  <div class="karaoke-banner-title">
                    <span class="banner-heading">Karaoke Mode Active</span>
                    <span class="karaoke-cut-badge">Vocal Cut {{ karaokeLevel }}%</span>
                  </div>
                  <span class="karaoke-banner-desc">Real-time center cancellation with punchy bass preservation</span>
                </div>
              </div>
              <button class="karaoke-sing-btn" @click="isLyricsOpen = true">
                <span>Sing Along (Lyrics)</span>
                <span class="arrow-up-right">↗</span>
              </button>
            </div>
          </transition>

          <!-- Progress Bar / Seekbar -->
          <div class="progress-section">
            <SeekBar
              :currentTime="currentTime"
              :duration="duration || nowPlaying?.duration || 0"
              :isPlaying="isPlaying"
              :canSeek="true"
              @seek="seekTo"
            />
          </div>

          <!-- Transport Bar -->
          <div class="transport-bar">
            <button class="play-btn" :class="{ playing: isPlaying }" @click="togglePlay">
              <span v-if="isPlaying">⏸</span>
              <span v-else>▶</span>
            </button>

            <button class="btn-secondary skip-btn" @click="skip">
              <span>Next</span> ⏭
            </button>

            <button
              class="btn-secondary lyrics-btn"
              title="Karaoke Synced Lyrics"
              @click="isLyricsOpen = true"
            >
              🎤 Lyrics
            </button>

            <button
              class="btn-secondary karaoke-btn"
              :class="{ active: karaokeEnabled }"
              title="Toggle Real-Time Karaoke Mode (No Voice / Just Music)"
              @click="toggleKaraoke"
            >
              <span class="karaoke-btn-mic">🎤</span>
              <span>Karaoke</span>
              <span v-if="karaokeEnabled" class="karaoke-pill-tag">{{ karaokeLevel }}%</span>
            </button>

            <div class="volume-slider-group">
              <span class="vol-icon">🔊</span>
              <input
                type="range"
                min="0"
                max="100"
                :value="volume"
                class="volume-range"
                @input="(e) => updateVolume(Number((e.target as HTMLInputElement).value))"
              />
              <span class="vol-num">{{ volume }}%</span>
            </div>
          </div>
        </div>

        <!-- Host Settings & Output Switcher -->
        <div class="settings-card glass-panel">
          <div class="setting-row">
            <div class="setting-info">
              <h4>Auto-Radio DJ</h4>
              <p>Keep the vibe alive with smart recommendations when queue empties</p>
            </div>
            <button class="toggle-btn" :class="{ active: autoDjEnabled }" @click="toggleAutoDj">
              {{ autoDjEnabled ? "ON" : "OFF" }}
            </button>
          </div>

          <div class="setting-row karaoke-setting-row">
            <div class="setting-info">
              <h4>🎤 Karaoke Mode (Vocal Reducer)</h4>
              <p>Real-time center vocal phase cancellation with low-frequency crossover</p>
            </div>
            <div class="karaoke-controls-wrap">
              <div v-if="karaokeEnabled" class="karaoke-slider-box">
                <span class="karaoke-slider-label">Vocal Cut: <strong>{{ karaokeLevel }}%</strong></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  :value="karaokeLevel"
                  class="karaoke-range-slider"
                  @input="(e) => setKaraokeLevel(Number((e.target as HTMLInputElement).value))"
                />
              </div>
              <button class="toggle-btn" :class="{ active: karaokeEnabled }" @click="toggleKaraoke">
                {{ karaokeEnabled ? "ON" : "OFF" }}
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <h4>Audio Output Mode</h4>
              <p>Stream directly in this browser window to office speaker</p>
            </div>
            <div class="mode-pills">
              <button
                class="mode-btn"
                :class="{ active: outputMode === 'browser' }"
                @click="setOutputMode('browser')"
              >
                Web Browser
              </button>
              <button
                class="mode-btn"
                :class="{ active: outputMode === 'native' }"
                @click="setOutputMode('native')"
              >
                Native Host
              </button>
            </div>
          </div>
        </div>

        <!-- QR Code Share Card -->
        <QrPanel v-if="clientUrl" :url="clientUrl" />
      </section>

      <!-- Right Column: Live Queue & History -->
      <section class="queue-column">
        <div class="queue-header">
          <h3>Up Next ({{ queue.length }})</h3>
          <span class="hint">Democratic voting order</span>
        </div>

        <div v-if="queue.length === 0" class="empty-queue-box glass-panel">
          <span class="empty-icon">🎧</span>
          <h4>No songs in queue</h4>
          <p>Coworkers can scan the QR code to add their favorite tracks.</p>
          <button class="btn-secondary" @click="isSearchOpen = true">Add a track now</button>
        </div>

        <transition-group v-else name="list" tag="div" class="queue-list">
          <QueueCard
            v-for="item in queue"
            :key="item.queueId"
            :track="item"
            :isAdmin="true"
            :userRole="'host'"
            :currentClientId="currentClientId"
            @upvote="onUpvote"
            @removeVote="onRemoveVote"
            @removeTrack="removeTrack"
          />
        </transition-group>

        <!-- History -->
        <div v-if="history.length > 0" class="history-section">
          <h3>Recently Played</h3>
          <div class="history-list">
            <div v-for="item in history.slice(0, 5)" :key="item.queueId" class="history-item glass-panel">
              <img v-if="item.thumbnail" :src="item.thumbnail" class="history-thumb" alt="" />
              <div class="history-info">
                <span class="history-title">{{ item.title }}</span>
                <span class="history-artist">{{ item.artist }}</span>
              </div>
              <span class="history-by glass-pill">👤 {{ item.requestedBy }}</span>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Search Modal -->
    <SearchModal
      :isOpen="isSearchOpen"
      :nickname="hostNickname"
      @close="isSearchOpen = false"
    />

    <!-- Member Management Drawer -->
    <MemberDrawer
      :isOpen="isMemberDrawerOpen"
      :members="members"
      :currentClientId="currentClientId"
      :isAdmin="true"
      @close="isMemberDrawerOpen = false"
      @setRole="onSetRole"
      @setDjPasscode="onSetDjPasscode"
    />

    <!-- Synced Lyrics Modal -->
    <LyricsModal
      :isOpen="isLyricsOpen"
      :track="nowPlaying"
      :currentTime="currentTime"
      :canSeek="true"
      @close="isLyricsOpen = false"
      @seek="onLyricsSeek"
    />
  </div>
</template>

<style scoped>
.host-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.logo-icon {
  font-size: 1.8rem;
}

.brand-text h1 {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.role-tag {
  font-size: 0.72rem;
  color: var(--accent-primary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-indicator.connected .dot {
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}

.listeners-pill {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.host-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 900px) {
  .host-grid {
    grid-template-columns: 1fr;
  }
}

.player-column {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.now-playing-card {
  position: relative;
  overflow: hidden;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  border-color: rgba(255, 255, 255, 0.1);
}

.ambient-glow {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(50px) brightness(0.25);
  opacity: 0.7;
  z-index: 0;
  pointer-events: none;
}

.card-content {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 1.25rem;
  align-items: center;
}

.cover-wrapper {
  position: relative;
  width: 110px;
  height: 110px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

.cover-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
}

.provider-badge {
  position: absolute;
  top: 6px;
  left: 6px;
}

.track-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dj-pill {
  align-self: flex-start;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  color: var(--accent-primary);
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.02em;
}

.artist {
  font-size: 0.95rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.visualizer-wrapper {
  margin-top: 0.4rem;
}

.progress-section {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.time-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  font-family: "JetBrains Mono", monospace;
  color: var(--text-muted);
}

.progress-bar-bg {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width 0.3s linear;
}

.transport-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.play-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #fff;
  color: #000;
  font-size: 1.2rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.2);
}

.play-btn:hover {
  transform: scale(1.05);
}

.play-btn:active {
  transform: scale(0.95);
}

.skip-btn {
  padding: 0.65rem 1.1rem;
}

.volume-slider-group {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.vol-icon {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.volume-range {
  width: 100px;
  accent-color: var(--accent-primary);
}

.vol-num {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  min-width: 32px;
}

.settings-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.setting-info h4 {
  font-size: 0.9rem;
  font-weight: 600;
}

.setting-info p {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.toggle-btn {
  padding: 0.35rem 0.9rem;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.toggle-btn.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: var(--color-success);
}

.mode-pills {
  display: flex;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.25rem;
  border-radius: var(--radius-full);
}

.mode-btn {
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.mode-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-weight: 600;
}

.queue-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.queue-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.queue-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
}

.queue-header .hint {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.empty-queue-box {
  padding: 2.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.6rem;
}

.empty-icon {
  font-size: 2.2rem;
}

.empty-queue-box h4 {
  font-size: 1rem;
  font-weight: 600;
}

.empty-queue-box p {
  font-size: 0.82rem;
  color: var(--text-muted);
  max-width: 280px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.history-section {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.history-section h3 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
}

.history-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.history-title {
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-artist {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-by {
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
  color: var(--text-muted);
}

/* ========================================================
   🎤 Emil Kowalski-grade Real-Time Karaoke UI
======================================================== */

.karaoke-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 1rem;
  border-radius: var(--radius-full);
  font-size: 0.85rem;
  font-weight: 600;
  transition: all var(--transition-smooth);
}

.karaoke-btn.active {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.22) 0%, rgba(139, 92, 246, 0.28) 100%);
  border: 1px solid rgba(236, 72, 153, 0.5);
  color: #fff;
  box-shadow: 0 0 20px -3px rgba(236, 72, 153, 0.35);
}

.karaoke-btn.active:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 0 24px -2px rgba(236, 72, 153, 0.5);
}

.karaoke-pill-tag {
  background: rgba(236, 72, 153, 0.3);
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fbcfe8;
}

/* Quick-Access Karaoke Sing Banner */
.karaoke-banner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.15rem;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(99, 102, 241, 0.15) 100%);
  border: 1px solid rgba(236, 72, 153, 0.25);
  box-shadow: 0 8px 30px -8px rgba(236, 72, 153, 0.2);
  backdrop-filter: blur(16px);
  margin-top: 0.25rem;
}

.karaoke-banner-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.karaoke-pulse-icon {
  font-size: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: micPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes micPulse {
  0%, 100% {
    transform: scale(1);
    filter: drop-shadow(0 0 4px rgba(236, 72, 153, 0.4));
  }
  50% {
    transform: scale(1.14);
    filter: drop-shadow(0 0 12px rgba(236, 72, 153, 0.8));
  }
}

.karaoke-banner-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.karaoke-banner-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.banner-heading {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.karaoke-cut-badge {
  font-size: 0.68rem;
  font-weight: 700;
  background: rgba(236, 72, 153, 0.25);
  border: 1px solid rgba(236, 72, 153, 0.4);
  color: #f472b6;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-full);
}

.karaoke-banner-desc {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.karaoke-sing-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.95rem;
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 700;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  color: #fff;
  box-shadow: 0 4px 14px rgba(236, 72, 153, 0.35);
  cursor: pointer;
  transition: all var(--transition-bounce);
  white-space: nowrap;
}

.karaoke-sing-btn:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 6px 20px rgba(236, 72, 153, 0.5);
}

.karaoke-sing-btn:active {
  transform: scale(0.96);
}

.arrow-up-right {
  font-size: 0.9rem;
  transition: transform var(--transition-fast);
}

.karaoke-sing-btn:hover .arrow-up-right {
  transform: translate(2px, -2px);
}

/* Banner Spring Pop Transition */
.karaoke-banner-pop-enter-active,
.karaoke-banner-pop-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.karaoke-banner-pop-enter-from,
.karaoke-banner-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

/* Host Settings Karaoke Row */
.karaoke-setting-row {
  align-items: center;
}

.karaoke-controls-wrap {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.karaoke-slider-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}

.karaoke-slider-label {
  font-size: 0.74rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.karaoke-slider-label strong {
  color: #f472b6;
}

.karaoke-range-slider {
  width: 90px;
  accent-color: #ec4899;
  cursor: pointer;
}
</style>

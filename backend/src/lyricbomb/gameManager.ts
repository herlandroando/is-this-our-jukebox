import type {
  LyricBombGameStatus,
  LyricBombPlayer,
  LyricBombPodiumEntry,
  LyricBombSegment,
  LyricBombSongInfo,
  LyricBombState,
} from "./types.ts";
import { prepareLyricBombSong } from "./songValidator.ts";
import { getVerifiedLyricBombPresets } from "./songCatalog.ts";
import { queueStore } from "../queue/store.ts";
import { jukeboxDb, isTestingTrack } from "../db.ts";
import { resolveStreamUrl } from "../stream/resolver.ts";
import { memoryBufferManager } from "../stream/memoryBuffer.ts";

export type LyricBombEventListener = (
  state: LyricBombState,
  eventType: string,
  payload?: any
) => void;

const PICKER_TIMEOUT_SEC = 35;
const WRONG_TAP_PENALTY_SEC = 2;
const HINT_COST_SEC = 3;

class LyricBombGameManager {
  private state: LyricBombState = this.getInitialState();
  private listeners: Set<LyricBombEventListener> = new Set();
  private bombTimerInterval: ReturnType<typeof setInterval> | null = null;
  private pickerTimerInterval: ReturnType<typeof setInterval> | null = null;
  private segmentTimeout: ReturnType<typeof setTimeout> | null = null;
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private audioReadyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private barrierTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readyAudioClients: Set<string> = new Set();
  private playedVideoIds: Set<string> = new Set();
  private hostNickname = "Host DJ";
  private configuredStartingDuration = 18;

  private getInitialState(): LyricBombState {
    return {
      status: "idle",
      hostClientId: null,
      isHostPlaying: true,
      roundNumber: 1,
      startingBombDuration: 18,
      turnBombDuration: 18,
      currentBombTimeLeft: 18,
      pickerTimeLeft: null,
      players: {},
      playerTurnOrder: [],
      activePlayerId: null,
      pickerPlayerId: null,
      currentSong: null,
      currentSegmentIndex: 0,
      selectedWordIds: [],
      lastExplodedPlayerId: null,
      lastWrongTap: null,
      lastPointsEarned: undefined,
      lastLifeGained: undefined,
      winnerPlayerId: null,
      podium: undefined,
      isAudioReady: false,
      audioIssueReports: [],
    };
  }

  private createDefaultPlayer(id: string, nickname: string, isHost: boolean): LyricBombPlayer {
    return {
      id,
      nickname: nickname || (isHost ? "Host DJ" : `Player ${Object.keys(this.state.players).length + 1}`),
      isHost,
      isReady: isHost,
      hp: 3,
      isEliminated: false,
      isOnline: true,
      defusalCount: 0,
      explosionsTaken: 0,
      score: 0,
      streak: 0,
      maxStreak: 0,
      hintsUsed: 0,
      wrongTaps: 0,
    };
  }

  public getState(): LyricBombState {
    return {
      ...this.state,
      players: { ...this.state.players },
      playerTurnOrder: [...this.state.playerTurnOrder],
      selectedWordIds: [...this.state.selectedWordIds],
      audioIssueReports: [...(this.state.audioIssueReports || [])],
    };
  }

  public subscribe(listener: LyricBombEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(eventType: string, payload?: any) {
    const copy = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(copy, eventType, payload);
      } catch (e) {
        console.error("[LyricBomb] Broadcast listener error:", e);
      }
    }
  }

  public createLobby(hostId: string, hostNickname: string): { success: boolean; error?: string } {
    this.cleanupTimers();
    this.playedVideoIds.clear();
    // Pause jukebox background audio for Lyric Bomb
    queueStore.pauseForTrivia();

    this.hostNickname = hostNickname || "Host DJ";
    this.configuredStartingDuration = 18;
    this.state = this.getInitialState();
    this.state.status = "lobby";
    this.state.hostClientId = hostId;
    this.state.isHostPlaying = true;
    this.state.players[hostId] = this.createDefaultPlayer(hostId, this.hostNickname, true);

    this.broadcast("lobbyCreated", { hostId });
    return { success: true };
  }

  public setHostPlaying(clientId: string, isPlaying: boolean): void {
    if (this.state.status !== "lobby") return;
    const hostId = this.state.hostClientId || clientId;
    this.state.hostClientId = hostId;
    this.state.isHostPlaying = isPlaying;

    if (isPlaying) {
      if (!this.state.players[hostId]) {
        this.state.players[hostId] = this.createDefaultPlayer(hostId, this.hostNickname, true);
      }
    } else {
      delete this.state.players[hostId];
    }

    this.broadcast("hostPlayingChanged", { hostId, isPlaying });
  }

  public setStartingDuration(durationSec: number): { success: boolean; duration?: number; error?: string } {
    if (this.state.status !== "lobby") {
      return { success: false, error: "Durasi bom hanya dapat diatur saat berada di lobby." };
    }
    const clamped = Math.max(10, Math.min(40, Math.round(durationSec)));
    this.configuredStartingDuration = clamped;
    this.state.startingBombDuration = clamped;
    this.state.turnBombDuration = clamped;
    this.state.currentBombTimeLeft = clamped;
    this.broadcast("startingDurationChanged", { duration: clamped });
    return { success: true, duration: clamped };
  }

  public joinLobby(playerId: string, nickname: string): { success: boolean; error?: string } {
    if (this.state.status !== "lobby") {
      // Reconnection check
      if (this.state.players[playerId]) {
        const player = this.state.players[playerId];
        player.isOnline = true;
        if (nickname) {
          player.nickname = nickname;
        }
        this.broadcast("playerRejoined", { playerId, nickname: player.nickname });
        return { success: true };
      }

      // Fallback session migration: if someone reconnected with a new ID (e.g. Incognito / cache cleared)
      const cleanNick = (nickname || "").trim();
      if (cleanNick && cleanNick.toLowerCase() !== "anonymous" && !cleanNick.toLowerCase().startsWith("player ")) {
        const offlineMatch = Object.values(this.state.players).find(
          (p) => p.isOnline === false && p.nickname.trim().toLowerCase() === cleanNick.toLowerCase()
        );
        if (offlineMatch) {
          const oldId = offlineMatch.id;
          delete this.state.players[oldId];
          offlineMatch.id = playerId;
          offlineMatch.isOnline = true;
          this.state.players[playerId] = offlineMatch;
          this.state.playerTurnOrder = this.state.playerTurnOrder.map((id) => (id === oldId ? playerId : id));
          if (this.state.activePlayerId === oldId) {
            this.state.activePlayerId = playerId;
          }
          if (this.state.pickerPlayerId === oldId) {
            this.state.pickerPlayerId = playerId;
          }
          this.broadcast("playerRejoined", { playerId, nickname: offlineMatch.nickname });
          return { success: true };
        }
      }

      return { success: false, error: "Game sedang berlangsung atau belum dibuka." };
    }

    // If host clicks join while in spectator mode, toggle host playing on
    if (playerId === this.state.hostClientId && !this.state.isHostPlaying) {
      this.setHostPlaying(playerId, true);
      return { success: true };
    }

    if (!this.state.players[playerId]) {
      this.state.players[playerId] = this.createDefaultPlayer(playerId, nickname, false);
    } else {
      this.state.players[playerId].isOnline = true;
      if (nickname) {
        this.state.players[playerId].nickname = nickname;
      }
    }

    this.broadcast("playerJoined", { playerId, player: this.state.players[playerId] });
    return { success: true };
  }

  public leaveLobby(playerId: string, intentional = true): void {
    if (!this.state.players[playerId]) return;

    if (this.state.status === "lobby") {
      if (playerId === this.state.hostClientId && intentional) {
        this.closeGame();
        return;
      }
      delete this.state.players[playerId];
      this.broadcast("playerLeft", { playerId });
      return;
    }

    // Ignore transient WS disconnects during active gameplay, but mark player offline
    if (!intentional) {
      const p = this.state.players[playerId];
      if (p) {
        p.isOnline = false;
        this.broadcast("playerLeft", { playerId, isTransient: true });
      }
      return;
    }

    // In-game intentional leave
    this.state.players[playerId].isEliminated = true;
    this.state.players[playerId].hp = 0;
    this.state.playerTurnOrder = this.state.playerTurnOrder.filter((id) => id !== playerId);
    this.broadcast("playerLeft", { playerId });

    if (this.checkWinnerCondition()) {
      return;
    }

    if (this.state.status === "picking_song" && this.state.pickerPlayerId === playerId) {
      const alivePlayers = this.getAlivePlayers();
      const nextPicker = alivePlayers[0]?.id || null;
      this.startPickingSongPhase(nextPicker);
      return;
    }

    // If active player left during defusal or playing, advance to next turn
    if (this.state.activePlayerId === playerId) {
      this.advanceToNextTurn();
    }
  }

  public setReady(playerId: string, isReady: boolean): void {
    if (this.state.status !== "lobby" || !this.state.players[playerId]) return;
    this.state.players[playerId].isReady = isReady;
    this.broadcast("playerReady", { playerId, isReady });
  }

  public updatePlayerNickname(playerId: string, nickname: string): void {
    if (!nickname) return;
    const player = this.state.players[playerId];
    if (player) {
      player.nickname = nickname;
      this.broadcast("stateSync", this.getState());
    }
  }

  /**
   * Set preferensi output audio pemain ("host" vs "self")
   */
  public setPlayerAudioMode(playerId: string, mode: "host" | "self"): void {
    const player = this.state.players[playerId];
    if (player) {
      player.audioOutputMode = mode;
    }
  }

  private getAlivePlayers(): LyricBombPlayer[] {
    return Object.values(this.state.players).filter((p) => !p.isEliminated && p.hp > 0);
  }

  public startGame(): { success: boolean; error?: string } {
    if (this.state.status !== "lobby") {
      return { success: false, error: "Game belum dalam mode lobby." };
    }

    const playerList = Object.values(this.state.players);
    if (playerList.length < 1) {
      return {
        success: false,
        error: "Minimal 1 pemain aktif diperlukan (aktifkan 'Host Ikut Main' atau tunggu pemain bergabung).",
      };
    }

    this.state.roundNumber = 1;
    this.state.startingBombDuration = this.configuredStartingDuration;
    this.state.turnBombDuration = this.configuredStartingDuration;
    this.state.currentBombTimeLeft = this.configuredStartingDuration;
    this.state.podium = undefined;
    this.state.winnerPlayerId = null;

    // Pick random starting player to choose song
    const randomPicker = playerList[Math.floor(Math.random() * playerList.length)];
    this.startPickingSongPhase(randomPicker.id, "gameStarted");
    return { success: true };
  }

  public rematchGame(): { success: boolean; error?: string } {
    if (this.state.status === "idle") {
      return { success: false, error: "Belum ada sesi game." };
    }

    this.cleanupTimers();
    this.playedVideoIds.clear();

    for (const p of Object.values(this.state.players)) {
      p.hp = 3;
      p.isEliminated = false;
      p.isOnline = true;
      p.defusalCount = 0;
      p.explosionsTaken = 0;
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.hintsUsed = 0;
      p.wrongTaps = 0;
      p.isReady = p.isHost;
    }

    this.state.status = "lobby";
    this.state.roundNumber = 1;
    this.state.startingBombDuration = this.configuredStartingDuration;
    this.state.turnBombDuration = this.configuredStartingDuration;
    this.state.currentBombTimeLeft = this.configuredStartingDuration;
    this.state.currentSong = null;
    this.state.currentSegmentIndex = 0;
    this.state.selectedWordIds = [];
    this.state.lastExplodedPlayerId = null;
    this.state.lastWrongTap = null;
    this.state.lastPointsEarned = undefined;
    this.state.lastLifeGained = undefined;
    this.state.winnerPlayerId = null;
    this.state.podium = undefined;

    this.broadcast("rematchLobby");
    return { success: true };
  }

  private startPickingSongPhase(pickerId: string | null, eventName = "newRoundSongPick"): void {
    this.cleanupTimers();
    this.state.status = "picking_song";
    this.state.pickerPlayerId = pickerId;
    this.state.pickerTimeLeft = null;
    this.state.lastWrongTap = null;
    this.state.lastPointsEarned = undefined;
    this.state.lastLifeGained = undefined;
    this.state.audioIssueReports = [];

    this.broadcast(eventName, {
      roundNumber: this.state.roundNumber,
      pickerPlayerId: pickerId,
      startingBombDuration: this.state.startingBombDuration,
      pickerTimeLeft: null,
    });
  }

  public getOfficePlaylist(): Array<{
    id: string;
    videoId: string;
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
    playCount: number;
    badge: string;
    category: string;
  }> {
    const combined: Array<{
      id: string;
      videoId: string;
      title: string;
      artist: string;
      duration: number;
      thumbnail: string;
      playCount: number;
      badge: string;
      category: string;
    }> = [];
    const seenIds = new Set<string>();

    const jukeboxState = queueStore.getState();
    const liveCandidates = [
      ...(jukeboxState.nowPlaying ? [jukeboxState.nowPlaying] : []),
      ...(jukeboxState.history || []),
      ...(jukeboxState.queue || []),
    ];

    for (const item of liveCandidates) {
      if (!item || !item.id || item.id.startsWith("sc:") || seenIds.has(item.id) || isTestingTrack(item)) {
        continue;
      }
      seenIds.add(item.id);
      combined.push({
        id: item.id,
        videoId: item.id,
        title: item.title,
        artist: item.artist,
        duration: item.duration || 210,
        thumbnail: item.thumbnail || "",
        playCount: 1,
        badge: "🎧 Sesi Aktif",
        category: "Baru Diputar",
      });
    }

    const topTracks = jukeboxDb.getOfficePlaylistTracks(80);
    for (const item of topTracks) {
      if (!item || !item.id || item.id.startsWith("sc:") || seenIds.has(item.id) || isTestingTrack(item)) {
        continue;
      }
      seenIds.add(item.id);
      const count = item.playCount || 1;
      combined.push({
        id: item.id,
        videoId: item.id,
        title: item.title,
        artist: item.artist,
        duration: item.duration || 210,
        thumbnail: item.thumbnail || "",
        playCount: count,
        badge: count > 1 ? `🔥 ${count}x Diputar` : "🎵 Office Playlist",
        category: count >= 2 ? "Sering Diputar" : "Baru Diputar",
      });
    }

    const recentTracks = jukeboxDb.getRecentTracks(undefined, 40);
    for (const item of recentTracks) {
      if (!item || !item.id || item.id.startsWith("sc:") || seenIds.has(item.id) || isTestingTrack(item)) {
        continue;
      }
      seenIds.add(item.id);
      combined.push({
        id: item.id,
        videoId: item.id,
        title: item.title,
        artist: item.artist,
        duration: item.duration || 210,
        thumbnail: item.thumbnail || "",
        playCount: 1,
        badge: "⏱️ Baru Diputar",
        category: "Baru Diputar",
      });
    }

    return combined;
  }

  public async pickRandomSong(requesterId: string): Promise<{ success: boolean; error?: string }> {
    if (this.state.status !== "picking_song") {
      return { success: false, error: "Bukan saatnya memilih lagu." };
    }
    const isAuthorized =
      !this.state.pickerPlayerId ||
      this.state.pickerPlayerId === requesterId ||
      this.state.hostClientId === requesterId;
    if (!isAuthorized) {
      return { success: false, error: "Bukan giliranmu memilih lagu." };
    }

    // 1. Try Office Playlist (songs played in this player) first!
    const officeSongs = this.getOfficePlaylist();
    if (officeSongs.length > 0) {
      const unplayedOffice = officeSongs.filter((s) => !this.playedVideoIds.has(s.videoId));
      const pool = (unplayedOffice.length > 0 ? unplayedOffice : officeSongs).sort(
        () => Math.random() - 0.5
      );

      for (const candidate of pool.slice(0, 6)) {
        const res = await this.selectSong(this.state.pickerPlayerId || requesterId, {
          videoId: candidate.videoId,
          title: candidate.title,
          artist: candidate.artist,
          duration: candidate.duration,
          albumArt: candidate.thumbnail || undefined,
        });
        if (res.success) {
          return res;
        }
      }
    }

    // 2. Fallback if office history is empty or none of the sampled office tracks had synced lyrics
    const presets = getVerifiedLyricBombPresets();
    if (presets.length === 0) {
      return { success: false, error: "Daftar lagu kosong." };
    }

    const unplayed = presets.filter((p) => !this.playedVideoIds.has(p.videoId));
    const fallbackPool = unplayed.length > 0 ? unplayed : presets;
    const chosen = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    return this.selectSong(this.state.pickerPlayerId || requesterId, {
      videoId: chosen.videoId,
      title: chosen.title,
      artist: chosen.artist,
      duration: chosen.duration,
    });
  }

  private async preWarmAudioStream(videoId: string): Promise<void> {
    if (!videoId || process.env.NODE_ENV === "test") return;
    try {
      const streamUrl = await resolveStreamUrl(videoId, "yt");
      if (streamUrl) {
        await memoryBufferManager.getOrStartBuffer(videoId, "yt", streamUrl);
      }
    } catch (err) {
      console.warn(`[LyricBomb] Stream pre-warm warning for ${videoId}:`, err);
    }
  }

  public async selectSong(
    pickerId: string,
    songParams: { videoId: string; title: string; artist: string; duration: number; albumArt?: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (this.state.status !== "picking_song") {
      return { success: false, error: "Bukan saatnya memilih lagu." };
    }
    const isAuthorized =
      !this.state.pickerPlayerId ||
      this.state.pickerPlayerId === pickerId ||
      this.state.hostClientId === pickerId;
    if (!isAuthorized) {
      return { success: false, error: "Bukan giliranmu memilih lagu." };
    }

    this.cleanupTimers();
    this.state.status = "song_loading";
    this.broadcast("songLoading", { title: songParams.title, artist: songParams.artist });

    const aliveCount = this.getAlivePlayers().length;
    const targetSegments = Math.max(4, Math.min(6, aliveCount * 2));

    // Kick off audio stream pre-warming in parallel with lyric preparation
    const preWarmPromise = this.preWarmAudioStream(songParams.videoId);
    const prepared = await prepareLyricBombSong({ ...songParams, maxSegments: targetSegments });

    if (!prepared.valid || !prepared.songInfo) {
      this.startPickingSongPhase(this.state.pickerPlayerId, "songLoadFailed");
      return { success: false, error: prepared.reason };
    }

    // Give stream pre-warm up to 1000ms head-start before segment 0 starts
    await Promise.race([
      preWarmPromise,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);

    this.playedVideoIds.add(songParams.videoId);
    this.state.currentSong = prepared.songInfo;
    this.state.currentSegmentIndex = 0;
    this.state.selectedWordIds = [];
    this.state.lastWrongTap = null;
    this.state.lastPointsEarned = undefined;
    this.state.lastLifeGained = undefined;
    this.state.audioIssueReports = [];

    // Set turn order from non-eliminated players
    const alivePlayerIds = this.getAlivePlayers().map((p) => p.id);

    // Shuffle turn order at the start of the song
    this.state.playerTurnOrder = [...alivePlayerIds].sort(() => Math.random() - 0.5);
    this.state.activePlayerId = this.state.playerTurnOrder[0] || pickerId;

    this.startSegmentPlayback();
    return { success: true };
  }

  private computeTurnBombDuration(segmentIndex: number): number {
    // Escalate speed slightly as the song progresses (-1s every 2 segments, min 8s)
    const reduction = Math.floor(segmentIndex / 2);
    return Math.max(8, this.state.startingBombDuration - reduction);
  }

  private startSegmentPlayback() {
    this.cleanupTimers();
    if (!this.state.currentSong) return;

    const segment = this.state.currentSong.segments[this.state.currentSegmentIndex];
    if (!segment) {
      this.handleSongSurvived();
      return;
    }

    const turnDuration = this.computeTurnBombDuration(this.state.currentSegmentIndex);
    this.state.status = "playing";
    this.state.isAudioReady = false;
    this.state.selectedWordIds = [];
    this.state.lastWrongTap = null;
    this.state.lastPointsEarned = undefined;
    this.state.lastLifeGained = undefined;
    this.state.turnBombDuration = turnDuration;
    this.state.currentBombTimeLeft = turnDuration;
    this.readyAudioClients.clear();

    this.broadcast("segmentPlaying", {
      segmentIndex: this.state.currentSegmentIndex,
      segment,
      activePlayerId: this.state.activePlayerId,
    });

    // Fallback: jika dalam 4.2 detik barrier audio belum terpenuhi,
    // mulai pemutaran secara otomatis agar game tidak macet
    const segIdx = this.state.currentSegmentIndex;
    this.audioReadyFallbackTimer = setTimeout(() => {
      if (this.state.status === "playing" && !this.state.isAudioReady) {
        this.triggerSegmentPlayback(segIdx);
      }
    }, 4200);
  }

  /**
   * Konfirmasi bahwa audio segmen telah siap di-buffer oleh Host atau Klien
   */
  public onAudioReady(segmentIndex: number, clientId: string): void {
    if (this.state.status !== "playing") return;
    if (this.state.currentSegmentIndex !== segmentIndex) return;
    if (this.state.isAudioReady) return;

    this.readyAudioClients.add(clientId);

    // Hitung client wajib: Host (meskipun mode MC/Spectator) + seluruh player dengan mode audio "self"
    const requiredClientIds = new Set<string>();
    if (this.state.hostClientId) {
      requiredClientIds.add(this.state.hostClientId);
    }
    for (const p of Object.values(this.state.players)) {
      if (p.isHost || p.audioOutputMode === "self") {
        requiredClientIds.add(p.id);
      }
    }

    const allReady =
      requiredClientIds.size === 0 ||
      Array.from(requiredClientIds).every((reqId) => this.readyAudioClients.has(reqId));

    if (allReady) {
      this.triggerSegmentPlayback(segmentIndex);
    } else if (!this.barrierTimeoutTimer) {
      // Begitu minimal 1 perangkat siap, beri grace window 2.0 detik untuk perangkat lain
      this.barrierTimeoutTimer = setTimeout(() => {
        if (this.state.status === "playing" && !this.state.isAudioReady) {
          this.triggerSegmentPlayback(segmentIndex);
        }
      }, 2000);
    }
  }

  private triggerSegmentPlayback(segmentIndex: number): void {
    if (this.state.status !== "playing" || this.state.currentSegmentIndex !== segmentIndex) return;
    if (this.state.isAudioReady) return;

    if (this.audioReadyFallbackTimer) {
      clearTimeout(this.audioReadyFallbackTimer);
      this.audioReadyFallbackTimer = null;
    }
    if (this.barrierTimeoutTimer) {
      clearTimeout(this.barrierTimeoutTimer);
      this.barrierTimeoutTimer = null;
    }

    this.state.isAudioReady = true;
    this.broadcast("segmentAudioReady", { segmentIndex });

    const segment = this.state.currentSong?.segments[segmentIndex];
    if (!segment) return;

    // Exact lead-in duration matching segment.stopTime - segment.leadInStartTime
    const rawDurationMs = (segment.stopTime - segment.leadInStartTime) * 1000;
    const playDurationMs = Math.max(2000, Math.min(15000, Math.round(rawDurationMs)));

    this.segmentTimeout = setTimeout(() => {
      this.enterDefusalPhase();
    }, playDurationMs);
  }

  private enterDefusalPhase() {
    this.cleanupTimers();
    const turnDuration = this.computeTurnBombDuration(this.state.currentSegmentIndex);
    this.state.status = "defusing";
    this.state.turnBombDuration = turnDuration;
    this.state.currentBombTimeLeft = turnDuration;
    this.state.lastWrongTap = null;

    const segment = this.state.currentSong?.segments[this.state.currentSegmentIndex];

    this.broadcast("defusalActive", {
      activePlayerId: this.state.activePlayerId,
      segmentIndex: this.state.currentSegmentIndex,
      chips: segment?.scrambledChips || [],
      timeLeft: this.state.currentBombTimeLeft,
      turnBombDuration: this.state.turnBombDuration,
    });

    // Start bomb countdown
    this.bombTimerInterval = setInterval(() => {
      this.state.currentBombTimeLeft = Math.max(0, this.state.currentBombTimeLeft - 1);
      this.broadcast("bombTick", { timeLeft: this.state.currentBombTimeLeft });

      if (this.state.currentBombTimeLeft <= 0) {
        this.handleBombExplosion();
      }
    }, 1000);
  }

  private normalizeWord(w: string): string {
    return (w || "").trim().toLowerCase();
  }

  public submitWordTap(
    playerId: string,
    chipId: string
  ): { success: boolean; completed?: boolean; penaltySec?: number; error?: string } {
    if (this.state.status !== "defusing") {
      return { success: false, error: "Bukan saatnya menyusun kata." };
    }
    if (this.state.activePlayerId !== playerId) {
      return { success: false, error: "Bukan giliranmu memegang bom!" };
    }

    const segment = this.state.currentSong?.segments[this.state.currentSegmentIndex];
    if (!segment) return { success: false, error: "Segmen tidak ditemukan." };

    const chip = segment.scrambledChips.find((c) => c.id === chipId);
    if (!chip) return { success: false, error: "Chip tidak valid." };

    if (this.state.selectedWordIds.includes(chipId)) {
      return { success: false, error: "Kata ini sudah dipilih." };
    }

    const expectedIndex = this.state.selectedWordIds.length;
    const expectedWord = segment.words[expectedIndex] || "";

    const isMatch =
      chip.originalIndex === expectedIndex ||
      this.normalizeWord(chip.text) === this.normalizeWord(expectedWord);

    if (!isMatch) {
      // Wrong word tapped: deduct 2s, reset streak, broadcast feedback
      const player = this.state.players[playerId];
      if (player) {
        player.streak = 0;
        player.wrongTaps++;
      }

      this.state.currentBombTimeLeft = Math.max(0, this.state.currentBombTimeLeft - WRONG_TAP_PENALTY_SEC);
      this.state.lastWrongTap = {
        playerId,
        chipId,
        penaltySec: WRONG_TAP_PENALTY_SEC,
        timestamp: Date.now(),
      };

      this.broadcast("wordTapWrong", {
        playerId,
        chipId,
        penaltySec: WRONG_TAP_PENALTY_SEC,
        timeLeft: this.state.currentBombTimeLeft,
      });

      if (this.state.currentBombTimeLeft <= 0) {
        this.handleBombExplosion();
      }

      return {
        success: false,
        penaltySec: WRONG_TAP_PENALTY_SEC,
        error: `Urutan kata salah! (-${WRONG_TAP_PENALTY_SEC} detik)`,
      };
    }

    // Correct word tapped
    this.state.selectedWordIds.push(chipId);
    this.state.lastWrongTap = null;
    this.broadcast("wordTapCorrect", {
      playerId,
      chipId,
      selectedCount: this.state.selectedWordIds.length,
      totalCount: segment.words.length,
    });

    // Check if line completed
    if (this.state.selectedWordIds.length === segment.words.length) {
      this.handleLineDefused();
      return { success: true, completed: true };
    }

    return { success: true, completed: false };
  }

  public useHint(playerId: string): { success: boolean; completed?: boolean; chipId?: string; error?: string } {
    if (this.state.status !== "defusing") {
      return { success: false, error: "Bukan saatnya menyusun kata." };
    }
    if (this.state.activePlayerId !== playerId) {
      return { success: false, error: "Bukan giliranmu memegang bom!" };
    }
    if (this.state.currentBombTimeLeft <= HINT_COST_SEC) {
      return { success: false, error: `Waktu bom terlalu kritis untuk Hint (butuh >${HINT_COST_SEC}d)!` };
    }

    const segment = this.state.currentSong?.segments[this.state.currentSegmentIndex];
    if (!segment) return { success: false, error: "Segmen tidak ditemukan." };

    const expectedIndex = this.state.selectedWordIds.length;
    const expectedWord = segment.words[expectedIndex];
    if (expectedWord === undefined) {
      return { success: false, error: "Semua kata sudah terjawab." };
    }

    // Find matching unselected chip (exact index first, then normalized text match for duplicates)
    let targetChip = segment.scrambledChips.find(
      (c) => !this.state.selectedWordIds.includes(c.id) && c.originalIndex === expectedIndex
    );
    if (!targetChip) {
      targetChip = segment.scrambledChips.find(
        (c) =>
          !this.state.selectedWordIds.includes(c.id) &&
          this.normalizeWord(c.text) === this.normalizeWord(expectedWord)
      );
    }
    if (!targetChip) {
      return { success: false, error: "Chip hint tidak ditemukan." };
    }

    this.state.currentBombTimeLeft = Math.max(1, this.state.currentBombTimeLeft - HINT_COST_SEC);
    this.state.selectedWordIds.push(targetChip.id);
    this.state.lastWrongTap = null;

    const player = this.state.players[playerId];
    if (player) {
      player.hintsUsed++;
    }

    this.broadcast("hintUsed", {
      playerId,
      chipId: targetChip.id,
      timeLeft: this.state.currentBombTimeLeft,
    });

    if (this.state.selectedWordIds.length === segment.words.length) {
      this.handleLineDefused();
      return { success: true, completed: true, chipId: targetChip.id };
    }

    return { success: true, completed: false, chipId: targetChip.id };
  }

  public resetTappedWords(playerId: string): void {
    if (this.state.status !== "defusing" || this.state.activePlayerId !== playerId) return;
    this.state.selectedWordIds = [];
    this.state.lastWrongTap = null;
    this.broadcast("wordTapReset", { playerId });
  }

  public reportAudioIssue(
    playerId: string,
    nickname?: string
  ): { success: boolean; alreadyReported?: boolean; error?: string } {
    if (
      this.state.status !== "playing" &&
      this.state.status !== "defusing" &&
      this.state.status !== "line_success" &&
      this.state.status !== "song_loading"
    ) {
      return { success: false, error: "Tidak ada pemutaran lagu aktif untuk dilaporkan." };
    }

    if (!this.state.audioIssueReports) {
      this.state.audioIssueReports = [];
    }

    const displayName =
      nickname?.trim() || this.state.players[playerId]?.nickname || "Pemain";

    const existing = this.state.audioIssueReports.find((r) => r.playerId === playerId);
    if (existing) {
      existing.timestamp = Date.now();
      this.broadcast("audioIssueReported", {
        playerId,
        nickname: displayName,
        count: this.state.audioIssueReports.length,
      });
      return { success: true, alreadyReported: true };
    }

    this.state.audioIssueReports.push({
      playerId,
      nickname: displayName,
      timestamp: Date.now(),
    });

    queueStore.toast(
      `🔇 ${displayName} melaporkan musik tidak terdengar! Host bisa tekan tombol Skip Lagu.`,
      "warning"
    );

    this.broadcast("audioIssueReported", {
      playerId,
      nickname: displayName,
      count: this.state.audioIssueReports.length,
    });
    return { success: true };
  }

  public skipCurrentSong(
    requesterId: string,
    isAdmin = false
  ): { success: boolean; error?: string } {
    const isAuthorized = isAdmin || requesterId === this.state.hostClientId;
    if (!isAuthorized) {
      return { success: false, error: "Hanya Host yang dapat melewati (skip) lagu!" };
    }

    if (
      this.state.status !== "playing" &&
      this.state.status !== "defusing" &&
      this.state.status !== "line_success" &&
      this.state.status !== "song_loading"
    ) {
      return { success: false, error: "Tidak ada lagu aktif yang sedang berjalan." };
    }

    const skippedTitle = this.state.currentSong?.title || "Lagu";
    this.cleanupTimers();
    this.state.currentSong = null;
    this.state.currentSegmentIndex = 0;
    this.state.selectedWordIds = [];
    this.state.lastWrongTap = null;
    this.state.lastPointsEarned = undefined;
    this.state.lastLifeGained = undefined;
    this.state.audioIssueReports = [];

    const alivePlayers = this.getAlivePlayers();
    const nextPicker =
      (this.state.pickerPlayerId &&
      !this.state.players[this.state.pickerPlayerId]?.isEliminated
        ? this.state.pickerPlayerId
        : null) ||
      (this.state.activePlayerId &&
      !this.state.players[this.state.activePlayerId]?.isEliminated
        ? this.state.activePlayerId
        : null) ||
      alivePlayers[0]?.id ||
      null;

    queueStore.toast(
      `⏭️ Host melewati "${skippedTitle}" karena kendala musik. Silakan pilih lagu lain!`,
      "info"
    );

    this.startPickingSongPhase(nextPicker, "songSkippedByHost");
    return { success: true };
  }

  private handleLineDefused() {
    this.cleanupTimers();
    this.state.status = "line_success";

    const activePlayer = this.state.activePlayerId ? this.state.players[this.state.activePlayerId] : null;
    let pointsEarned = 0;
    let lifeGained = false;

    if (activePlayer) {
      activePlayer.defusalCount++;
      activePlayer.streak++;
      if (activePlayer.streak > activePlayer.maxStreak) {
        activePlayer.maxStreak = activePlayer.streak;
      }

      // Reward +1 HP on 3x Streak Defuse
      if (activePlayer.streak > 0 && activePlayer.streak % 3 === 0 && activePlayer.hp < 3) {
        activePlayer.hp = Math.min(3, activePlayer.hp + 1);
        lifeGained = true;
      }

      const maxDur = Math.max(1, this.state.turnBombDuration || this.state.startingBombDuration);
      const timeRatio = Math.min(1, Math.max(0, this.state.currentBombTimeLeft / maxDur));
      const basePoints = 300;
      const speedBonus = Math.round(timeRatio * 300);
      const streakBonus = Math.min(400, (activePlayer.streak - 1) * 100);
      pointsEarned = basePoints + speedBonus + streakBonus;
      activePlayer.score += pointsEarned;
    }

    this.state.lastPointsEarned = pointsEarned;
    this.state.lastLifeGained = lifeGained;

    const segment = this.state.currentSong?.segments[this.state.currentSegmentIndex];
    const hasResumeTiming =
      segment &&
      typeof segment.resumeEndTime === "number" &&
      typeof segment.resumeStartTime === "number" &&
      !isNaN(segment.resumeEndTime) &&
      !isNaN(segment.resumeStartTime);
    const rewardDurationMs = hasResumeTiming
      ? Math.max(2500, Math.min(6000, Math.round((segment.resumeEndTime - segment.resumeStartTime) * 1000)))
      : 3000;

    this.broadcast("lineSuccess", {
      activePlayerId: this.state.activePlayerId,
      segmentIndex: this.state.currentSegmentIndex,
      targetOriginalText: segment?.targetOriginalText,
      resumeStartTime: segment?.resumeStartTime,
      resumeEndTime: segment?.resumeEndTime,
      pointsEarned,
      lifeGained,
      streak: activePlayer?.streak ?? 0,
      remainingHp: activePlayer?.hp ?? 0,
    });

    // Advance segment & pass turn after audio reward plays
    this.transitionTimeout = setTimeout(() => {
      this.state.currentSegmentIndex++;
      this.advanceToNextTurn();
    }, rewardDurationMs);
  }

  private handleBombExplosion() {
    this.cleanupTimers();
    this.state.status = "exploded";
    const explodedPlayerId = this.state.activePlayerId;
    this.state.lastExplodedPlayerId = explodedPlayerId;

    if (explodedPlayerId && this.state.players[explodedPlayerId]) {
      const player = this.state.players[explodedPlayerId];
      player.hp = Math.max(0, player.hp - 1);
      player.explosionsTaken++;
      player.streak = 0;
      if (player.hp === 0) {
        player.isEliminated = true;
      }
    }

    this.broadcast("bombExploded", {
      explodedPlayerId,
      remainingHp: explodedPlayerId ? this.state.players[explodedPlayerId]?.hp : 0,
      isEliminated: explodedPlayerId ? this.state.players[explodedPlayerId]?.isEliminated : false,
    });

    this.transitionTimeout = setTimeout(() => {
      if (this.checkWinnerCondition()) {
        return;
      }

      // Next round: the exploded player picks the next song (or next alive if eliminated)
      const alivePlayers = this.getAlivePlayers();
      const nextPicker =
        explodedPlayerId && !this.state.players[explodedPlayerId]?.isEliminated
          ? explodedPlayerId
          : alivePlayers[0]?.id || null;

      this.state.roundNumber++;
      // Decay starting bomb duration each round (min 9s)
      this.state.startingBombDuration = Math.max(9, this.state.startingBombDuration - 2);
      this.startPickingSongPhase(nextPicker);
    }, 3500);
  }

  private handleSongSurvived() {
    this.cleanupTimers();
    this.state.status = "song_survived";

    // Reward: ALL alive players gain +1000 survival bonus score (HP is earned via 3x Defuse Streaks)
    for (const p of Object.values(this.state.players)) {
      if (!p.isEliminated && p.hp > 0) {
        p.score += 1000;
      }
    }

    this.broadcast("songSurvived", {
      roundNumber: this.state.roundNumber,
      players: this.state.players,
      bonusScore: 1000,
    });

    this.transitionTimeout = setTimeout(() => {
      this.state.roundNumber++;
      this.state.startingBombDuration = Math.max(9, this.state.startingBombDuration - 2);
      // Pick next alive player as picker
      const alivePlayers = this.getAlivePlayers();
      const nextPicker = alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.id || null;
      this.startPickingSongPhase(nextPicker);
    }, 4000);
  }

  private advanceToNextTurn() {
    const aliveIdsSet = new Set(this.getAlivePlayers().map((p) => p.id));

    if (aliveIdsSet.size <= 1) {
      if (this.checkWinnerCondition()) return;
    }

    // Maintain turn order based on playerTurnOrder
    const currentOrder = this.state.playerTurnOrder.filter((id) => aliveIdsSet.has(id));
    for (const id of aliveIdsSet) {
      if (!currentOrder.includes(id)) {
        currentOrder.push(id);
      }
    }
    this.state.playerTurnOrder = currentOrder;

    const currentIndex = currentOrder.indexOf(this.state.activePlayerId || "");
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % currentOrder.length : 0;
    this.state.activePlayerId = currentOrder[nextIndex] || null;

    this.startSegmentPlayback();
  }

  private buildPodium(): LyricBombPodiumEntry[] {
    const allPlayers = Object.values(this.state.players);
    const sorted = [...allPlayers].sort((a, b) => {
      const aAlive = !a.isEliminated && a.hp > 0 ? 1 : 0;
      const bAlive = !b.isEliminated && b.hp > 0 ? 1 : 0;
      if (bAlive !== aAlive) return bAlive - aAlive;
      if (b.score !== a.score) return b.score - a.score;
      if (b.defusalCount !== a.defusalCount) return b.defusalCount - a.defusalCount;
      return b.hp - a.hp;
    });

    return sorted.map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      hp: p.hp,
      isEliminated: p.isEliminated,
      defusalCount: p.defusalCount,
      maxStreak: p.maxStreak,
      explosionsTaken: p.explosionsTaken,
    }));
  }

  private checkWinnerCondition(): boolean {
    const totalPlayers = Object.keys(this.state.players).length;
    const alivePlayers = this.getAlivePlayers();

    if (alivePlayers.length === 1 && totalPlayers > 1) {
      this.cleanupTimers();
      this.state.status = "game_over";
      this.state.winnerPlayerId = alivePlayers[0].id;
      this.state.podium = this.buildPodium();
      this.broadcast("gameOver", { winner: alivePlayers[0], podium: this.state.podium });
      return true;
    } else if (alivePlayers.length === 0) {
      this.cleanupTimers();
      this.state.status = "game_over";
      const podium = this.buildPodium();
      this.state.podium = podium;
      // In solo mode, the solo player is shown as top scorer if they defused at least 1 line
      this.state.winnerPlayerId = totalPlayers === 1 && podium[0]?.defusalCount > 0 ? podium[0].id : null;
      this.broadcast("gameOver", { winner: null, podium });
      return true;
    }
    return false;
  }

  public closeGame(): void {
    this.cleanupTimers();
    this.playedVideoIds.clear();
    this.state = this.getInitialState();
    // Resume jukebox background playback
    queueStore.resumeAfterTrivia();
    this.broadcast("closed");
  }

  private cleanupTimers() {
    if (this.bombTimerInterval) {
      clearInterval(this.bombTimerInterval);
      this.bombTimerInterval = null;
    }
    if (this.pickerTimerInterval) {
      clearInterval(this.pickerTimerInterval);
      this.pickerTimerInterval = null;
    }
    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
    if (this.audioReadyFallbackTimer) {
      clearTimeout(this.audioReadyFallbackTimer);
      this.audioReadyFallbackTimer = null;
    }
    if (this.barrierTimeoutTimer) {
      clearTimeout(this.barrierTimeoutTimer);
      this.barrierTimeoutTimer = null;
    }
    this.readyAudioClients.clear();
  }
}

export const lyricBombGameManager = new LyricBombGameManager();

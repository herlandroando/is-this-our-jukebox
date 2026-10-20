import type { MemberRole } from "../types.ts";
import { queueStore } from "../queue/store.ts";
import { jukeboxDb } from "../db.ts";
import {
  TRIVIA_CATEGORIES,
  getAvailableCategories,
  generateTriviaQuestions,
  preResolveTriviaStreams,
} from "./songCatalog.ts";
import { fetchPlaylistSongs } from "./playlistService.ts";
import type {
  TriviaGameSettings,
  TriviaGameState,
  TriviaPlayer,
  TriviaPodiumEntry,
  TriviaPresetItem,
  TriviaQuestion,
  TriviaRoundResult,
} from "./types.ts";

export type TriviaEventListener = (
  state: TriviaGameState,
  eventType: string,
  payload?: any
) => void;

export class TriviaGameManager {
  private state: TriviaGameState;
  private activeQuestions: TriviaQuestion[] = [];
  private correctAnswers = new Map<number, string>(); // roundIndex -> correctOptionId
  private currentRoundIndex = 0;

  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private autoResumeTimer: ReturnType<typeof setTimeout> | null = null;
  private audioReadyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private barrierTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readyAudioClients = new Set<string>();
  private isCreatingLobby = false;
  private listeners: Set<TriviaEventListener> = new Set();

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): TriviaGameState {
    return {
      status: "idle",
      hostClientId: null,
      hostNickname: "",
      isHostPlaying: false,
      settings: {
        categoryId: "pop-indo",
        roundCount: 5,
        roundDurationSec: 20,
      },
      players: {},
      currentRound: undefined,
      roundResult: undefined,
      podium: undefined,
      countdownSec: undefined,
    };
  }

  public subscribe(listener: TriviaEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(eventType: string, payload?: any) {
    for (const listener of this.listeners) {
      try {
        listener(this.getState(), eventType, payload);
      } catch (err) {
        console.error("[trivia] Listener error:", err);
      }
    }
  }

  public getState(): TriviaGameState {
    return {
      ...this.state,
      players: { ...this.state.players },
    };
  }

  public getCategories() {
    return getAvailableCategories();
  }

  public getPresets(): TriviaPresetItem[] {
    return jukeboxDb.getAllTriviaPresets(false);
  }

  public savePreset(preset: Partial<TriviaPresetItem> & { id: string; name: string }) {
    jukeboxDb.saveTriviaPreset(preset);
    this.broadcast("presetsUpdated", { presets: this.getPresets() });
  }

  public deletePreset(id: string): boolean {
    const ok = jukeboxDb.deleteTriviaPreset(id);
    if (ok) {
      this.broadcast("presetsUpdated", { presets: this.getPresets() });
    }
    return ok;
  }

  public async syncPreset(id: string): Promise<{ success: boolean; count: number; error?: string }> {
    const preset = jukeboxDb.getTriviaPreset(id);
    if (!preset || !preset.playlistId) {
      return { success: false, count: 0, error: "Preset bukan tipe playlist atau tidak memiliki playlist ID" };
    }
    try {
      const songs = await fetchPlaylistSongs(preset.playlistId, true, preset.id);
      this.broadcast("presetsUpdated", { presets: this.getPresets() });
      return { success: true, count: songs.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || "Gagal sinkronisasi" };
    }
  }

  public isGameActive(): boolean {
    return this.isCreatingLobby || this.state.status !== "idle";
  }

  /**
   * Host / DJ membuka lobby tebak lagu
   */
  public async createLobby(
    hostClientId: string,
    hostNickname: string,
    settings: TriviaGameSettings
  ): Promise<{ success: boolean; message?: string }> {
    if (this.isGameActive()) {
      return { success: false, message: "Sesi tebak lagu sedang disiapkan atau sedang berjalan!" };
    }

    this.isCreatingLobby = true;
    try {
      this.clearAllTimers();

      // 1. Pause lagu jukebox dan simpan posisi detiknya
      queueStore.pauseForTrivia();

      // 2. Generate daftar pertanyaan & bank jawaban benar secara dinamis
      const { questions, answers } = await generateTriviaQuestions(
        settings.categoryId,
        settings.roundCount,
        settings.roundDurationSec,
        settings.customPlaylistUrl
      );

      if (!questions || questions.length === 0) {
        queueStore.resumeAfterTrivia();
        return {
          success: false,
          message: "Tidak ada lagu yang berhasil dimuat dari kategori/playlist ini. Pastikan playlist publik dan memiliki lagu.",
        };
      }

      this.activeQuestions = questions;
      this.correctAnswers = answers;
      this.currentRoundIndex = 0;

      // 3. Pre-resolve seluruh stream audio ke cache agar saat diputar langsung 0ms
      preResolveTriviaStreams(questions);

      // 4. Inisialisasi state lobby (Host default adalah MC/Spectator, bukan player tebak)
      this.state = {
        status: "lobby",
        hostClientId,
        hostNickname,
        isHostPlaying: false,
        settings,
        players: {},
        currentRound: undefined,
        roundResult: undefined,
        podium: undefined,
      };

      console.log(
        `[trivia] Lobby dibuat oleh "${hostNickname}" (Kategori: ${settings.categoryId}, ${questions.length} lagu). Host default: MC / Layar Ruangan.`
      );

      this.broadcast("lobbyCreated");
      return { success: true };
    } finally {
      this.isCreatingLobby = false;
    }
  }

  /**
   * Mengatur apakah Host ikut bermain sebagai peserta tebak lagu
   */
  public setHostPlaying(clientId: string, isPlaying: boolean) {
    if (clientId !== this.state.hostClientId) return;

    this.state.isHostPlaying = isPlaying;
    if (isPlaying) {
      this.state.players[clientId] = {
        clientId,
        nickname: this.state.hostNickname || "Host DJ 🎧",
        role: "host",
        score: 0,
        isReady: true,
        hasAnswered: false,
        joinedAt: Date.now(),
      };
      console.log(`[trivia] Host "${this.state.hostNickname}" ikut bermain sebagai peserta.`);
    } else {
      delete this.state.players[clientId];
      console.log(`[trivia] Host "${this.state.hostNickname}" beralih ke mode Spectator/MC.`);
    }

    this.broadcast("stateSync", this.getState());
  }

  /**
   * Pemain bergabung ke dalam lobby tebak lagu, atau pulihkan sesi saat reconnect/late-join
   */
  public joinLobby(
    clientId: string,
    nickname: string,
    role: MemberRole
  ): { success: boolean; message?: string } {
    if (!this.isGameActive()) {
      return { success: false, message: "Tidak ada lobby tebak lagu yang aktif." };
    }

    const isHost = clientId === this.state.hostClientId;

    // 1. Kasus reconnect: pemain sudah ada dalam daftar
    if (this.state.players[clientId]) {
      const existing = this.state.players[clientId];
      existing.isOnline = true;
      if (nickname) existing.nickname = nickname;
      console.log(`[trivia] Player "${existing.nickname}" (${clientId}) berhasil reconnect.`);
      this.broadcast("playerJoined", { clientId, nickname: existing.nickname, isReconnect: true });
      return { success: true };
    }

    // 2. Kasus late-join saat game sudah berjalan (ronde 1 dst)
    if (this.state.status !== "lobby") {
      this.state.players[clientId] = {
        clientId,
        nickname: nickname || "Anonymous",
        role,
        score: 0,
        isReady: true,
        hasAnswered: false,
        isOnline: true,
        joinedAt: Date.now(),
      };
      console.log(`[trivia] Pemain baru "${nickname}" (${clientId}) bergabung di tengah permainan (late-join).`);
      this.broadcast("playerJoined", { clientId, nickname, isLateJoin: true });
      return { success: true };
    }

    // 3. Bergabung normal di ruang tunggu (status === "lobby")
    this.state.players[clientId] = {
      clientId,
      nickname,
      role,
      score: 0,
      isReady: isHost, // Host default siap
      hasAnswered: false,
      isOnline: true,
      joinedAt: Date.now(),
    };

    this.broadcast("playerJoined", { clientId, nickname });
    return { success: true };
  }

  /**
   * Pemain keluar dari lobby / disconnect
   */
  public leaveLobby(clientId: string, isPermanent = false) {
    if (!this.state.players[clientId]) return;

    const leftPlayer = this.state.players[clientId];

    // Jika sedang di lobby atau keluar permanen secara manual:
    if (this.state.status === "lobby" || isPermanent) {
      delete this.state.players[clientId];

      // Jika yang keluar adalah Host saat di lobby dan tidak ada player lain, batalkan game
      if (clientId === this.state.hostClientId && this.state.status === "lobby") {
        const remaining = Object.keys(this.state.players);
        if (remaining.length === 0) {
          this.closeGame();
          return;
        } else {
          // Tunjuk player pertama sebagai host baru
          const nextHostId = remaining[0];
          this.state.hostClientId = nextHostId;
          this.state.hostNickname = this.state.players[nextHostId].nickname;
          this.state.players[nextHostId].isReady = true;
        }
      }
    } else {
      // Game sedang berjalan di tengah ronde: tandai pemain offline tanpa menghapus skornya
      leftPlayer.isOnline = false;
      console.log(`[trivia] Player "${leftPlayer.nickname}" (${clientId}) terputus sementara (offline).`);
    }

    this.broadcast("playerLeft", { clientId, nickname: leftPlayer.nickname, isPermanent });

    // Jika sedang dalam ronde dan semua player yang tersisa online sudah menjawab, selesaikan ronde
    if (this.state.status === "question") {
      this.checkAllAnsweredEarly();
    }
  }

  /**
   * Set preferensi output audio pemain ("host" vs "self")
   */
  public setPlayerAudioMode(clientId: string, mode: "host" | "self") {
    const player = this.state.players[clientId];
    if (player) {
      player.audioOutputMode = mode;
      console.log(`[trivia] Player ${player.nickname} (${clientId}) audio mode diset ke: ${mode}`);
    }
  }

  /**
   * Toggle status Ready pemain
   */
  public setReady(clientId: string, isReady: boolean) {
    if (this.state.status !== "lobby") return;
    const player = this.state.players[clientId];
    if (!player) return;

    player.isReady = isReady;
    this.broadcast("playerReady", { clientId, isReady });

    // Cek apakah semua pemain sudah ready
    const allPlayers = Object.values(this.state.players);
    if (allPlayers.length > 0 && allPlayers.every((p) => p.isReady)) {
      this.startCountdown();
    }
  }

  /**
   * Host melakukan Force Start
   */
  public forceStart(clientId: string): boolean {
    if (this.state.status !== "lobby") return false;
    if (clientId !== this.state.hostClientId) return false;

    this.startCountdown();
    return true;
  }

  /**
   * Memulai hitung mundur 3 detik sebelum ronde pertama
   */
  private startCountdown() {
    this.clearAllTimers();
    this.state.status = "countdown";
    this.state.countdownSec = 3;
    this.broadcast("countdownStart", { countdownSec: 3 });

    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        this.state.countdownSec = count;
        this.broadcast("countdownTick", { countdownSec: count });
      } else {
        clearInterval(interval);
        this.state.countdownSec = undefined;
        this.startRound(1);
      }
    }, 1000);
  }

  /**
   * Memulai ronde soal tebak lagu (fase buffering audio)
   */
  private startRound(roundIndex: number) {
    this.clearAllTimers();
    this.readyAudioClients.clear();
    if (roundIndex > this.activeQuestions.length) {
      this.finishGame();
      return;
    }

    this.currentRoundIndex = roundIndex;
    const question = this.activeQuestions[roundIndex - 1];

    question.isAudioReady = false;
    question.startTime = 0;
    question.endTime = 0;

    // Reset status menjawab pemain
    for (const p of Object.values(this.state.players)) {
      p.hasAnswered = false;
      p.selectedOptionId = undefined;
      p.lastAnswerCorrect = undefined;
      p.lastAnswerPoints = undefined;
    }

    this.state.status = "question";
    this.state.currentRound = question;
    this.state.roundResult = undefined;

    console.log(
      `[trivia] Ronde ${roundIndex}/${question.totalRounds} dimulai (menunggu audio barrier ready): Track ID ${question.trackId}.`
    );

    this.broadcast("roundStart", { round: question });

    // Fallback: Jika setelah 4.5 detik barrier belum terpenuhi,
    // jalankan timer secara otomatis agar game dan tombol di HP tidak macet lama
    this.audioReadyFallbackTimer = setTimeout(() => {
      if (this.state.status === "question" && !this.state.currentRound?.isAudioReady) {
        console.log(`[trivia] Audio ready fallback timer terpicu untuk ronde ${roundIndex} (4.5s timeout).`);
        this.triggerTimerStart(roundIndex);
      }
    }, 4500);
  }

  /**
   * Dipanggil saat Host atau klien mengonfirmasi bahwa audio cuplikan telah siap/berputar
   */
  public onAudioReady(roundIndex: number, clientId?: string) {
    if (this.state.status !== "question") return;
    if (this.currentRoundIndex !== roundIndex) return;

    const question = this.state.currentRound;
    if (!question || question.isAudioReady) return;

    if (clientId) {
      this.readyAudioClients.add(clientId);
    }

    // Perangkat yang wajib siap sebelum musik dibunyikan serempak:
    // 1. Host (selalu jika ada host di room)
    // 2. Pemain remote yang memakai mode audio "self" (Speaker Sendiri)
    const requiredClientIds = new Set<string>();
    if (this.state.hostClientId) {
      requiredClientIds.add(this.state.hostClientId);
    }
    for (const p of Object.values(this.state.players)) {
      if (p.audioOutputMode === "self") {
        requiredClientIds.add(p.clientId);
      }
    }

    const allRequiredReady =
      requiredClientIds.size === 0 ||
      Array.from(requiredClientIds).every((id) => this.readyAudioClients.has(id));

    if (allRequiredReady) {
      this.triggerTimerStart(roundIndex);
    } else if (!this.barrierTimeoutTimer) {
      // Barrier grace window: begitu ada setidaknya satu perangkat yang siap,
      // beri waktu maksimal 2.5 detik untuk perangkat lain menyelesaikan buffering
      this.barrierTimeoutTimer = setTimeout(() => {
        if (this.state.status === "question" && !this.state.currentRound?.isAudioReady) {
          console.log(`[trivia] Barrier timeout (2.5s) terpicu untuk ronde ${roundIndex}. Memulai timer.`);
          this.triggerTimerStart(roundIndex);
        }
      }, 2500);
    }
  }

  private triggerTimerStart(roundIndex: number) {
    if (this.state.status !== "question") return;
    if (this.currentRoundIndex !== roundIndex) return;

    const question = this.state.currentRound;
    if (!question || question.isAudioReady) return;

    if (this.audioReadyFallbackTimer) {
      clearTimeout(this.audioReadyFallbackTimer);
      this.audioReadyFallbackTimer = null;
    }
    if (this.barrierTimeoutTimer) {
      clearTimeout(this.barrierTimeoutTimer);
      this.barrierTimeoutTimer = null;
    }

    const listenDurationSec = 3;
    const listenDurationMs = listenDurationSec * 1000;
    const durationMs = (question.durationSec || 20) * 1000;
    const now = Date.now();

    question.isAudioReady = true;
    question.listenDurationSec = listenDurationSec;
    question.listenStartTime = now;
    question.startTime = now + listenDurationMs;
    question.endTime = question.startTime + durationMs;

    console.log(
      `[trivia] Audio ready barrier terpenuhi! Fase dengarkan (${listenDurationSec}s) dimulai, lalu timer ronde ${roundIndex} (${question.durationSec}s) akan berdetik (${this.readyAudioClients.size} perangkat siap).`
    );

    this.broadcast("timerStart", {
      roundIndex,
      startTime: question.startTime,
      endTime: question.endTime,
      durationSec: question.durationSec,
      listenDurationSec,
      listenStartTime: question.listenStartTime,
    });

    // Pasang timer batas waktu total ronde (fase dengarkan + durasi tebak + buffer)
    this.roundTimer = setTimeout(() => {
      this.endRound();
    }, listenDurationMs + durationMs + 200);
  }

  /**
   * Pemain mengirimkan tebakan jawaban
   */
  public submitAnswer(
    clientId: string,
    roundIndex: number,
    optionId: string
  ): { success: boolean; points?: number; isCorrect?: boolean } {
    if (this.state.status !== "question") return { success: false };
    if (roundIndex !== this.currentRoundIndex) return { success: false };

    const player = this.state.players[clientId];
    if (!player || player.hasAnswered) return { success: false };

    const question = this.state.currentRound;
    if (!question) return { success: false };

    // Jangan izinkan submit jika masih dalam fase dengarkan (3 detik pertama)
    if (question.startTime > 0 && Date.now() < question.startTime) {
      return { success: false };
    }

    const correctOptionId = this.correctAnswers.get(roundIndex);
    const isCorrect = optionId === correctOptionId;

    let points = 0;
    if (isCorrect) {
      const totalDuration = (question.durationSec || 20) * 1000;
      const now = Date.now();
      const timeLeft = question.endTime > 0 ? Math.max(0, question.endTime - now) : totalDuration;
      const ratio = Math.min(1, Math.max(0, timeLeft / totalDuration));
      points = Math.round(500 + 500 * ratio);
    }

    player.hasAnswered = true;
    player.selectedOptionId = optionId;
    player.lastAnswerCorrect = isCorrect;
    player.lastAnswerPoints = points;
    player.score += points;

    this.broadcast("answerReceived", {
      clientId,
      hasAnswered: true,
      answeredCount: Object.values(this.state.players).filter((p) => p.hasAnswered).length,
      totalPlayers: Object.values(this.state.players).length,
    });

    // Cek jika seluruh pemain yang ada di game sudah menjawab
    this.checkAllAnsweredEarly();

    return { success: true, points, isCorrect };
  }

  private checkAllAnsweredEarly() {
    const activeOnlinePlayers = Object.values(this.state.players).filter(
      (p) => p.isOnline !== false
    );
    if (activeOnlinePlayers.length > 0 && activeOnlinePlayers.every((p) => p.hasAnswered)) {
      if (this.roundTimer) {
        clearTimeout(this.roundTimer);
        this.roundTimer = null;
      }
      // Beri delay singkat 600ms agar animasi tap terasa mulus
      setTimeout(() => {
        if (this.state.status === "question") {
          this.endRound();
        }
      }, 600);
    }
  }

  /**
   * Akhir ronde: tampilkan kunci jawaban & skor sementara
   */
  private endRound() {
    this.clearAllTimers();
    const question = this.state.currentRound;
    if (!question) return;

    const correctOptionId = this.correctAnswers.get(this.currentRoundIndex) || "";
    const correctOpt = question.options.find((o) => o.id === correctOptionId);

    // Kumpulkan hasil ronde untuk tiap pemain
    const playerResults = Object.values(this.state.players).map((p) => ({
      clientId: p.clientId,
      nickname: p.nickname,
      isCorrect: p.lastAnswerCorrect || false,
      pointsEarned: p.lastAnswerPoints || 0,
      totalScore: p.score,
      selectedOptionId: p.selectedOptionId,
    }));

    // Urutkan peringkat sementara berdasarkan skor total tertinggi
    playerResults.sort((a, b) => b.totalScore - a.totalScore);

    // Siapkan informasi cuplikan lagu berikutnya agar frontend bisa pre-buffer selama 5 detik recap
    let nextSnippet = undefined;
    if (this.currentRoundIndex < question.totalRounds && this.activeQuestions[this.currentRoundIndex]) {
      const nextQ = this.activeQuestions[this.currentRoundIndex];
      nextSnippet = {
        trackId: nextQ.trackId,
        provider: nextQ.provider,
        snippetStartSec: nextQ.snippetStartSec,
        durationSec: nextQ.durationSec,
      };
    }

    const result: TriviaRoundResult = {
      roundIndex: this.currentRoundIndex,
      totalRounds: question.totalRounds,
      correctOptionId,
      correctTitle: correctOpt?.title || "",
      correctArtist: correctOpt?.artist || "",
      trackId: question.trackId,
      playerResults,
      nextSnippet,
    };

    this.state.status = "recap";
    this.state.roundResult = result;

    this.broadcast("roundEnd", { result });

    // Tampilkan recap selama 5 detik, lalu lanjut ke ronde berikutnya atau podium
    this.roundTimer = setTimeout(() => {
      if (this.currentRoundIndex < question.totalRounds) {
        this.startRound(this.currentRoundIndex + 1);
      } else {
        this.finishGame();
      }
    }, 5000);
  }

  /**
   * Permainan selesai: Tampilkan layar podium juara 1, 2, 3
   */
  private finishGame() {
    this.clearAllTimers();

    // Urutkan seluruh pemain berdasarkan skor akhir
    const sorted = Object.values(this.state.players).sort((a, b) => b.score - a.score);

    const podium: TriviaPodiumEntry[] = sorted.slice(0, 3).map((p, idx) => ({
      rank: idx + 1,
      clientId: p.clientId,
      nickname: p.nickname,
      score: p.score,
    }));

    this.state.status = "podium";
    this.state.podium = podium;
    this.state.currentRound = undefined;

    console.log(
      `[trivia] Game selesai! Juara 1: ${podium[0]?.nickname || "Nobody"} (${podium[0]?.score || 0} pts).`
    );

    this.broadcast("gameOver", { podium, allRankings: sorted });

    // Hitung mundur otomatis 15 detik sebelum kembali ke jukebox
    this.autoResumeTimer = setTimeout(() => {
      if (this.state.status === "podium") {
        this.closeGame();
      }
    }, 15000);
  }

  /**
   * Menutup game dan mengembalikan pemutaran musik jukebox
   */
  public closeGame() {
    this.clearAllTimers();
    this.state = this.getInitialState();
    this.activeQuestions = [];
    this.correctAnswers.clear();
    this.currentRoundIndex = 0;

    // Lanjutkan lagu jukebox yang sempat terhenti
    queueStore.resumeAfterTrivia();

    console.log("[trivia] Game ditutup, pemutaran musik jukebox dilanjutkan.");
    this.broadcast("gameClosed");
  }

  private clearAllTimers() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.autoResumeTimer) {
      clearTimeout(this.autoResumeTimer);
      this.autoResumeTimer = null;
    }
    if (this.audioReadyFallbackTimer) {
      clearTimeout(this.audioReadyFallbackTimer);
      this.audioReadyFallbackTimer = null;
    }
    if (this.barrierTimeoutTimer) {
      clearTimeout(this.barrierTimeoutTimer);
      this.barrierTimeoutTimer = null;
    }
  }
}

export const triviaGameManager = new TriviaGameManager();

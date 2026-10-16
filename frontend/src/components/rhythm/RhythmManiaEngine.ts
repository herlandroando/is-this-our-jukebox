import type { RhythmBeatmap, RhythmNote, RhythmScoreSubmission } from "../../shared/types.ts";

export type JudgeRating = "300max" | "300" | "200" | "100" | "50" | "miss";

export interface ActiveNote {
  note: RhythmNote;
  hit: boolean;
  missed: boolean;
  judge?: JudgeRating;
  hitDelta?: number;
}

export interface FloatingJudge {
  id: number;
  rating: JudgeRating;
  text: string;
  color: string;
  timestamp: number;
}

export interface HitEffect {
  id: number;
  lane: 0 | 1 | 2 | 3;
  color: string;
  timestamp: number;
}

// Timing windows in seconds
export const TIMING_WINDOWS = {
  "300max": 0.022,
  "300": 0.048,
  "200": 0.090,
  "100": 0.140,
  "50": 0.185,
  missWindow: 0.200,
};

export class RhythmManiaEngine {
  public beatmap: RhythmBeatmap | null = null;
  public activeNotes: ActiveNote[] = [];
  public isRunning = false;
  public isPaused = false;
  public isFinished = false;

  // Countdown State
  public inCountdown = true;
  public countdownNumber = 3; // 3 -> 2 -> 1 -> 0 (GO)
  public countdownStartRealTime = 0;
  private readonly COUNTDOWN_DURATION = 3.0; // 3 seconds

  // Score & Stats
  public score = 0;
  public combo = 0;
  public maxCombo = 0;
  public accuracy = 100.0;
  public hp = 100.0; // 0 to 100

  public hits300max = 0;
  public hits300 = 0;
  public hits200 = 0;
  public hits100 = 0;
  public hits50 = 0;
  public misses = 0;

  // Visual state
  public laneKeysDown = [false, false, false, false];
  public floatingJudges: FloatingJudge[] = [];
  public hitEffects: HitEffect[] = [];
  private judgeIdSeq = 1;
  private effectIdSeq = 1;

  // Audio Sync & Calibration
  public offsetMs = 0; // manual player calibration
  public scrollSpeed = 550; // pixels per second
  private audioGetter: () => number;
  private audioCtx: AudioContext | null = null;

  // Song initial playback start time
  public sessionStartTime = 0;

  constructor(getAudioTime: () => number) {
    this.audioGetter = getAudioTime;
    this.initAudioContext();
  }

  private initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    } catch {
      // AudioContext unavailable
    }
  }

  public playHitsound(rating: JudgeRating) {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (rating === "300max" || rating === "300") {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (rating === "200" || rating === "100") {
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.04);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (rating === "50") {
        osc.frequency.setValueAtTime(280, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (rating === "miss") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch {
      // Ignore audio synthesis errors
    }
  }

  public playTickSound() {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch {
      // Ignore
    }
  }

  public loadBeatmap(beatmap: RhythmBeatmap, currentSongTime: number = 0) {
    this.beatmap = beatmap;
    this.sessionStartTime = currentSongTime;

    // Filter out notes that were already played before session start,
    // but keep notes within countdown window so player sees them descending!
    const effectiveStart = Math.max(0, currentSongTime);
    this.activeNotes = beatmap.notes
      .filter((n) => n.time >= effectiveStart - 0.5)
      .map((n) => ({
        note: n,
        hit: false,
        missed: false,
      }));

    this.resetStats();
    this.startCountdown();
  }

  private resetStats() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.accuracy = 100.0;
    this.hp = 100.0;
    this.hits300max = 0;
    this.hits300 = 0;
    this.hits200 = 0;
    this.hits100 = 0;
    this.hits50 = 0;
    this.misses = 0;
    this.floatingJudges = [];
    this.hitEffects = [];
    this.isFinished = false;
  }

  public startCountdown() {
    this.inCountdown = true;
    this.countdownNumber = 3;
    this.countdownStartRealTime = performance.now();
    this.isRunning = true;
    this.playTickSound();
  }

  public getCurrentTime(): number {
    const rawAudioTime = this.audioGetter();
    const calibratedTime = rawAudioTime + this.offsetMs / 1000;

    // During countdown, simulate a smooth pre-roll
    if (this.inCountdown) {
      const elapsed = (performance.now() - this.countdownStartRealTime) / 1000;
      return this.sessionStartTime + (elapsed - this.COUNTDOWN_DURATION);
    }

    return calibratedTime;
  }

  public update() {
    if (!this.isRunning || this.isPaused || !this.beatmap) return;

    const nowReal = performance.now();

    // 1. Handle Countdown 3 -> 2 -> 1 -> GO!
    if (this.inCountdown) {
      const elapsed = (nowReal - this.countdownStartRealTime) / 1000;
      const prevNum = this.countdownNumber;
      if (elapsed < 1.0) {
        this.countdownNumber = 3;
      } else if (elapsed < 2.0) {
        this.countdownNumber = 2;
      } else if (elapsed < 3.0) {
        this.countdownNumber = 1;
      } else {
        this.countdownNumber = 0; // GO!
        this.inCountdown = false;
      }

      if (this.countdownNumber !== prevNum && this.countdownNumber > 0) {
        this.playTickSound();
      }
    }

    const currentTime = this.getCurrentTime();

    // 2. Check for Missed Notes (notes that dropped past the hit line)
    for (let i = 0; i < this.activeNotes.length; i++) {
      const an = this.activeNotes[i];
      if (an.hit || an.missed) continue;

      // Note has passed the late miss window
      if (currentTime - an.note.time > TIMING_WINDOWS.missWindow) {
        an.missed = true;
        this.registerHit("miss", an.note.lane);
      }
    }

    // 3. Clean up expired floating judgment labels and hit particle effects
    const expireTime = nowReal - 900;
    this.floatingJudges = this.floatingJudges.filter((j) => j.timestamp > expireTime);
    this.hitEffects = this.hitEffects.filter((e) => e.timestamp > nowReal - 250);

    // 4. Check if all notes are done
    const remaining = this.activeNotes.filter((n) => !n.hit && !n.missed);
    if (remaining.length === 0 && this.activeNotes.length > 0 && !this.inCountdown) {
      this.isFinished = true;
    }
  }

  public pressLane(lane: 0 | 1 | 2 | 3) {
    if (!this.isRunning || this.isPaused || this.inCountdown || !this.beatmap) {
      this.laneKeysDown[lane] = true;
      return;
    }

    this.laneKeysDown[lane] = true;
    const currentTime = this.getCurrentTime();

    // Find the earliest unhit note in this lane within the hit window
    let closestIndex = -1;
    let minDelta = Infinity;

    for (let i = 0; i < this.activeNotes.length; i++) {
      const an = this.activeNotes[i];
      if (an.note.lane !== lane || an.hit || an.missed) continue;

      const delta = Math.abs(currentTime - an.note.time);
      if (delta <= TIMING_WINDOWS["50"]) {
        if (delta < minDelta) {
          minDelta = delta;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      const target = this.activeNotes[closestIndex];
      target.hit = true;
      target.hitDelta = currentTime - target.note.time;

      const delta = Math.abs(target.hitDelta);
      let rating: JudgeRating = "50";
      if (delta <= TIMING_WINDOWS["300max"]) rating = "300max";
      else if (delta <= TIMING_WINDOWS["300"]) rating = "300";
      else if (delta <= TIMING_WINDOWS["200"]) rating = "200";
      else if (delta <= TIMING_WINDOWS["100"]) rating = "100";

      target.judge = rating;
      this.registerHit(rating, lane);
    }
  }

  public releaseLane(lane: 0 | 1 | 2 | 3) {
    this.laneKeysDown[lane] = false;
  }

  private registerHit(rating: JudgeRating, lane: 0 | 1 | 2 | 3) {
    const nowReal = performance.now();

    // Spawn visual feedback & hit effect
    let color = "#38bdf8";
    let text = "300";

    switch (rating) {
      case "300max":
        this.hits300max++;
        this.combo++;
        this.hp = Math.min(100, this.hp + 2.5);
        color = "#38bdf8"; // rainbow / cyan
        text = "300 MAX";
        break;
      case "300":
        this.hits300++;
        this.combo++;
        this.hp = Math.min(100, this.hp + 2.0);
        color = "#fbbf24"; // golden yellow
        text = "300";
        break;
      case "200":
        this.hits200++;
        this.combo++;
        this.hp = Math.min(100, this.hp + 1.2);
        color = "#34d399"; // emerald green
        text = "200";
        break;
      case "100":
        this.hits100++;
        this.combo++;
        this.hp = Math.min(100, this.hp + 0.5);
        color = "#a78bfa"; // purple
        text = "100";
        break;
      case "50":
        this.hits50++;
        this.combo++;
        this.hp = Math.max(0, this.hp - 1.0);
        color = "#f97316"; // orange
        text = "50";
        break;
      case "miss":
        this.misses++;
        this.combo = 0;
        this.hp = Math.max(0, this.hp - 6.0);
        color = "#ef4444"; // red
        text = "MISS";
        break;
    }

    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    // Play hitsound
    this.playHitsound(rating);

    // Add floating feedback label
    this.floatingJudges.push({
      id: this.judgeIdSeq++,
      rating,
      text,
      color,
      timestamp: nowReal,
    });

    // Add glowing column hit effect
    if (rating !== "miss") {
      this.hitEffects.push({
        id: this.effectIdSeq++,
        lane,
        color,
        timestamp: nowReal,
      });
    }

    // Recalculate score and accuracy
    this.recalculateScore();
  }

  private recalculateScore() {
    const totalHit =
      this.hits300max +
      this.hits300 +
      this.hits200 +
      this.hits100 +
      this.hits50 +
      this.misses;

    if (totalHit === 0) {
      this.accuracy = 100.0;
      this.score = 0;
      return;
    }

    // Mania Accuracy Formula
    const weightedPoints =
      (this.hits300max + this.hits300) * 300 +
      this.hits200 * 200 +
      this.hits100 * 100 +
      this.hits50 * 50;

    const maxPoints = totalHit * 300;
    this.accuracy = Math.round((weightedPoints / maxPoints) * 10000) / 100;

    // Mania Score (Standard 1,000,000 max base + combo scaling)
    const baseScore =
      this.hits300max * 320 +
      this.hits300 * 300 +
      this.hits200 * 200 +
      this.hits100 * 100 +
      this.hits50 * 50;

    const comboBonus = Math.floor(this.maxCombo * 15);
    this.score = baseScore * 10 + comboBonus;
  }

  public getGrade(): "SS" | "S" | "A" | "B" | "C" | "D" {
    if (this.accuracy === 100.0) return "SS";
    if (this.accuracy >= 95.0 && this.misses === 0) return "S";
    if (this.accuracy >= 90.0) return "A";
    if (this.accuracy >= 80.0) return "B";
    if (this.accuracy >= 70.0) return "C";
    return "D";
  }

  public getSubmission(
    trackId: string,
    title: string,
    artist: string,
    thumbnail?: string,
    clientId: string = "",
    nickname: string = "Anonymous"
  ): RhythmScoreSubmission {
    return {
      trackId,
      trackTitle: title,
      trackArtist: artist,
      trackThumbnail: thumbnail,
      clientId,
      nickname,
      score: this.score,
      accuracy: this.accuracy,
      maxCombo: this.maxCombo,
      grade: this.getGrade(),
      hits300: this.hits300max + this.hits300,
      hits200: this.hits200,
      hits100: this.hits100,
      hits50: this.hits50,
      misses: this.misses,
      difficulty: this.beatmap?.difficulty || "normal",
    };
  }

  public destroy() {
    this.isRunning = false;
    this.activeNotes = [];
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      void this.audioCtx.close();
    }
  }
}

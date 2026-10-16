import { ref } from "vue";
import type { MoodKey } from "../useJukeChanMood.ts";

export interface BeatDriverFrame {
  beatPhase: number;   // 0..1 sawtooth phase per beat
  subPhase: number;    // 0..1 half-speed phase (2-beat sway)
  beatHit: boolean;    // true on the frame a kick/onset is detected
  bassEnergy: number;  // 0..1 smoothed low-frequency energy
  vocalEnergy: number; // 0..1 smoothed mid-frequency vocal energy (for lip-sync)
  isPlaying: boolean;
}

let sharedAnalyser: AnalyserNode | null = null;
let freqBuffer: Uint8Array<ArrayBuffer> | null = null;

export const sharedPlaybackActive = ref<boolean>(false);
let syncedSongTimeSec = 0;
let syncedSongTimestampMs = 0;

// Spectral flux & onset detection state
let prevBassEnergy = 0;
let fluxAvg = 0.04;
let lastOnsetMs = 0;
const onsetIntervalsMs: number[] = [];
let estimatedPeriodMs = 500; // default 120 BPM
let lastUpdatedFrameMs = 0;
let cachedFrame: BeatDriverFrame = {
  beatPhase: 0,
  subPhase: 0,
  beatHit: false,
  bassEnergy: 0,
  vocalEnergy: 0,
  isPlaying: false,
};

export function setSharedAnalyser(node: AnalyserNode | null) {
  sharedAnalyser = node;
  if (node) {
    freqBuffer = new Uint8Array(node.frequencyBinCount);
  } else {
    freqBuffer = null;
  }
}

export function setPlaybackSync(isPlaying: boolean, currentTimeSec?: number) {
  sharedPlaybackActive.value = isPlaying;
  if (typeof currentTimeSec === "number" && Number.isFinite(currentTimeSec)) {
    syncedSongTimeSec = currentTimeSec;
    syncedSongTimestampMs = performance.now();
  }
}

const MOOD_DEFAULT_PERIOD_MS: Record<MoodKey, number> = {
  hype: 450,    // ~133 BPM
  romance: 545, // ~110 BPM
  lofi: 750,    // ~80 BPM
  galau: 880,   // ~68 BPM
};

/**
 * Computes or returns the current frame's beat & vocal telemetry.
 * Deduplicated per animation frame so multiple rig instances share one FFT read.
 */
export function sampleBeatDriver(nowMs: number, mood: MoodKey): BeatDriverFrame {
  if (Math.abs(nowMs - lastUpdatedFrameMs) < 6) {
    return cachedFrame;
  }
  lastUpdatedFrameMs = nowMs;

  const isPlaying = sharedPlaybackActive.value;
  if (!isPlaying) {
    // Gentle idle pulse when paused/stopped
    const idlePeriod = 1800;
    const phase = (nowMs % idlePeriod) / idlePeriod;
    cachedFrame = {
      beatPhase: phase,
      subPhase: (nowMs % (idlePeriod * 2)) / (idlePeriod * 2),
      beatHit: false,
      bassEnergy: 0.08,
      vocalEnergy: 0,
      isPlaying: false,
    };
    return cachedFrame;
  }

  // 1. Real Web Audio Analyser path (Host / Headphone Tune-In)
  if (sharedAnalyser && freqBuffer) {
    try {
      sharedAnalyser.getByteFrequencyData(freqBuffer);
      const binCount = freqBuffer.length;

      // Bass bins: ~0..18% of bins
      const bassEnd = Math.max(2, Math.floor(binCount * 0.18));
      let bassSum = 0;
      for (let i = 0; i < bassEnd; i++) {
        bassSum += freqBuffer[i];
      }
      const rawBass = bassSum / (bassEnd * 255);

      // Mid/vocal bins: ~20%..62% of bins
      const midStart = bassEnd;
      const midEnd = Math.max(midStart + 2, Math.floor(binCount * 0.62));
      let midSum = 0;
      for (let i = midStart; i < midEnd; i++) {
        midSum += freqBuffer[i];
      }
      const rawMid = midSum / ((midEnd - midStart) * 255);

      // If analyser has real signal (> 0.015), drive from real audio
      if (rawBass > 0.015 || rawMid > 0.015) {
        const flux = Math.max(0, rawBass - prevBassEnergy);
        prevBassEnergy = rawBass * 0.7 + prevBassEnergy * 0.3;
        fluxAvg = fluxAvg * 0.92 + flux * 0.08;

        let beatHit = false;
        const refractoryMs = 240;
        if (
          flux > Math.max(0.055, fluxAvg * 1.65) &&
          rawBass > 0.28 &&
          nowMs - lastOnsetMs > refractoryMs
        ) {
          beatHit = true;
          const interval = nowMs - lastOnsetMs;
          lastOnsetMs = nowMs;
          if (interval >= 280 && interval <= 1100) {
            onsetIntervalsMs.push(interval);
            if (onsetIntervalsMs.length > 8) onsetIntervalsMs.shift();
            const sorted = [...onsetIntervalsMs].sort((a, b) => a - b);
            estimatedPeriodMs = sorted[Math.floor(sorted.length / 2)];
          }
        }

        const period = estimatedPeriodMs || MOOD_DEFAULT_PERIOD_MS[mood];
        const elapsedSinceBeat = Math.max(0, nowMs - lastOnsetMs);
        const beatPhase = (elapsedSinceBeat % period) / period;
        const subPhase = ((nowMs / period) * 0.5) % 1;

        // Vocal envelope shaped for natural mouth movement
        const vocalEnergy = Math.min(
          1,
          Math.max(0, (rawMid - 0.14) * 2.1)
        );

        cachedFrame = {
          beatPhase,
          subPhase,
          beatHit,
          bassEnergy: Math.min(1, rawBass * 1.25),
          vocalEnergy,
          isPlaying: true,
        };
        return cachedFrame;
      }
    } catch {
      // Fall through to synthetic beat
    }
  }

  // 2. Synthetic phase-locked beat path (Client devices or muted Host)
  const periodMs = MOOD_DEFAULT_PERIOD_MS[mood] ?? 520;
  const effectiveSongMs =
    syncedSongTimestampMs > 0
      ? syncedSongTimeSec * 1000 + (nowMs - syncedSongTimestampMs)
      : nowMs;

  const beatPhase = ((effectiveSongMs % periodMs) + periodMs) % periodMs / periodMs;
  const subPhase =
    (((effectiveSongMs % (periodMs * 2)) + periodMs * 2) % (periodMs * 2)) /
    (periodMs * 2);

  let beatHit = false;
  if (beatPhase < 0.09 && nowMs - lastOnsetMs > periodMs * 0.75) {
    beatHit = true;
    lastOnsetMs = nowMs;
  }

  const synthPulse = Math.pow(Math.max(0, 1 - beatPhase * 1.6), 2);
  const moodEnergyBase =
    mood === "hype" ? 0.72 : mood === "romance" ? 0.52 : mood === "lofi" ? 0.35 : 0.28;

  // Pseudo-vocal syllable oscillation for singing animation
  const syllableWave =
    0.5 +
    0.3 * Math.sin(effectiveSongMs * 0.011) +
    0.2 * Math.cos(effectiveSongMs * 0.027);

  cachedFrame = {
    beatPhase,
    subPhase,
    beatHit,
    bassEnergy: moodEnergyBase * (0.65 + 0.35 * synthPulse),
    vocalEnergy: syllableWave * 0.65,
    isPlaying: true,
  };
  return cachedFrame;
}

import type { RhythmBeatmap, RhythmNote } from "./types.ts";

/**
 * Simple Linear Congruential Generator for deterministic pseudo-random sequences
 * seeded by track ID hash. Ensures 100% reproducible beatmaps for every song.
 */
class SeededRandom {
  private seed: number;

  constructor(seedStr: string) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    this.seed = Math.abs(hash) || 1234567;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  range(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/**
 * Estimate song BPM based on track metadata hash or default musical tempos (90 - 150 BPM).
 */
export function estimateTrackBpm(trackId: string): number {
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = (hash * 31 + trackId.charCodeAt(i)) >>> 0;
  }
  // Standard dance / pop / rock tempos: 105 to 145 BPM
  const commonBpms = [100, 110, 116, 120, 124, 128, 130, 132, 135, 140, 144, 150];
  return commonBpms[hash % commonBpms.length];
}

/**
 * Generate a deterministic 4-key rhythm beatmap for any track duration.
 * Rhythms are snapped to musical grids (quarter notes, 8th notes, 16th notes)
 * across 4 lanes (0, 1, 2, 3) structured by musical song phases.
 */
export function generateBeatmap(
  trackId: string,
  durationSeconds: number,
  difficulty: "easy" | "normal" | "hard" = "normal"
): RhythmBeatmap {
  const bpm = estimateTrackBpm(trackId);
  const beatSec = 60 / bpm; // duration of 1 quarter beat (e.g. 0.468s at 128 BPM)
  const rng = new SeededRandom(`${trackId}:${difficulty}`);

  const notes: RhythmNote[] = [];
  const duration = Math.max(15, durationSeconds);
  const startTime = 2.0; // 2 seconds intro buffer so player can settle in
  const endTime = Math.max(startTime + 10, duration - 2.5);

  // Subdivisions based on difficulty
  const stepRatio = difficulty === "easy" ? 1.0 : difficulty === "hard" ? 0.25 : 0.5;
  const stepSec = beatSec * stepRatio;

  let currentTime = startTime;
  let lastLaneTimes: [number, number, number, number] = [-1, -1, -1, -1];

  const minGap = difficulty === "hard" ? 0.08 : 0.12;

  while (currentTime < endTime) {
    const progress = (currentTime - startTime) / (endTime - startTime);

    // Dynamic density by musical song progression:
    // 0.00 - 0.15 : Intro (moderate, single lane hits)
    // 0.15 - 0.40 : Verse (steady rhythm)
    // 0.40 - 0.70 : Chorus / Drop (high energy, chords, syncopations)
    // 0.70 - 0.85 : Bridge (moderate / half-time)
    // 0.85 - 1.00 : Climax & Outro (peak energy then resolution)
    let isChorus = (progress >= 0.38 && progress <= 0.68) || (progress >= 0.82 && progress <= 0.94);
    let isBridge = progress > 0.68 && progress < 0.82;
    let isIntro = progress < 0.15;

    // Chance of placing a note on this step
    let hitProbability = 0.55;
    if (isIntro) hitProbability = difficulty === "easy" ? 0.35 : 0.45;
    else if (isChorus) hitProbability = difficulty === "hard" ? 0.85 : difficulty === "normal" ? 0.7 : 0.5;
    else if (isBridge) hitProbability = difficulty === "easy" ? 0.3 : 0.45;
    else hitProbability = difficulty === "hard" ? 0.7 : 0.55;

    if (rng.next() < hitProbability) {
      // Pick primary lane
      let lane = rng.range(0, 3) as 0 | 1 | 2 | 3;
      if (currentTime - lastLaneTimes[lane] >= minGap) {
        notes.push({ time: Math.round(currentTime * 1000) / 1000, lane });
        lastLaneTimes[lane] = currentTime;
      }

      // In Chorus or Hard mode, allow rhythmic double notes (chords) on strong beats
      const isStrongBeat = Math.round((currentTime - startTime) / beatSec) % 2 === 0;
      if (isChorus && isStrongBeat && difficulty !== "easy" && rng.next() < 0.35) {
        // Pick complimentary lane
        const secondLane = ((lane + 2) % 4) as 0 | 1 | 2 | 3;
        if (currentTime - lastLaneTimes[secondLane] >= minGap) {
          notes.push({ time: Math.round(currentTime * 1000) / 1000, lane: secondLane });
          lastLaneTimes[secondLane] = currentTime;
        }
      }
    }

    // Step forward
    if (difficulty === "easy") {
      currentTime += beatSec * (rng.next() > 0.3 ? 1.0 : 2.0);
    } else if (difficulty === "normal") {
      currentTime += beatSec * (rng.next() > 0.25 ? 0.5 : 1.0);
    } else {
      // Hard mode: mix of 8th and 16th steps
      currentTime += beatSec * (rng.next() > 0.4 ? 0.25 : 0.5);
    }
  }

  // Sort notes chronologically
  notes.sort((a, b) => a.time - b.time);

  return {
    trackId,
    bpm,
    duration,
    totalNotes: notes.length,
    notes,
    difficulty,
    generatedAt: Date.now(),
  };
}

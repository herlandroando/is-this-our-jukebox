import { describe, expect, it } from "bun:test";
import { generateBeatmap, estimateTrackBpm } from "./beatDetector.ts";

describe("Rhythm Beatmap Generator", () => {
  it("estimates a reasonable BPM for track IDs", () => {
    const bpm1 = estimateTrackBpm("test-track-123");
    const bpm2 = estimateTrackBpm("another-track-abc");
    expect(bpm1).toBeGreaterThanOrEqual(100);
    expect(bpm1).toBeLessThanOrEqual(150);
    expect(bpm2).toBeGreaterThanOrEqual(100);
    expect(bpm2).toBeLessThanOrEqual(150);
  });

  it("generates deterministic beatmaps across identical seeds", () => {
    const mapA = generateBeatmap("dQw4w9WgXcQ", 120, "normal");
    const mapB = generateBeatmap("dQw4w9WgXcQ", 120, "normal");
    expect(mapA.bpm).toBe(mapB.bpm);
    expect(mapA.totalNotes).toBe(mapB.totalNotes);
    expect(mapA.notes).toEqual(mapB.notes);
  });

  it("produces valid 4-lane notes in chronological order", () => {
    const map = generateBeatmap("sampleSong456", 90, "hard");
    expect(map.totalNotes).toBeGreaterThan(10);
    expect(map.notes.length).toBe(map.totalNotes);

    for (let i = 0; i < map.notes.length; i++) {
      const note = map.notes[i];
      // Lanes must be 0, 1, 2, or 3
      expect([0, 1, 2, 3]).toContain(note.lane);
      // Timestamps must be within range
      expect(note.time).toBeGreaterThanOrEqual(2.0);
      expect(note.time).toBeLessThanOrEqual(90);

      if (i > 0) {
        expect(note.time).toBeGreaterThanOrEqual(map.notes[i - 1].time);
      }
    }
  });

  it("scales note density across easy, normal, and hard difficulties", () => {
    const easy = generateBeatmap("scalingTest", 120, "easy");
    const normal = generateBeatmap("scalingTest", 120, "normal");
    const hard = generateBeatmap("scalingTest", 120, "hard");

    expect(easy.totalNotes).toBeLessThan(normal.totalNotes);
    expect(normal.totalNotes).toBeLessThan(hard.totalNotes);
  });
});

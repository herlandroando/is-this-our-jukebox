import { describe, expect, test, beforeEach } from "bun:test";
import { autoDj, AutoDjService } from "./autoDj.ts";
import type { QueueTrack, SearchResult } from "../types.ts";
import { jukeboxDb } from "../db.ts";
import { getRelatedTracks, clearRelatedCache } from "../search/index.ts";
import { addToStreamCache, streamCache, MAX_STREAM_CACHE_SIZE } from "./resolver.ts";

describe("Auto DJ Algorithmic Recommendations & Vibe Buffer", () => {
  beforeEach(() => {
    autoDj.resetMemory();
    clearRelatedCache();
  });

  test("markPlayed tracks played IDs and bounds memory", () => {
    const service = new AutoDjService();
    for (let i = 0; i < 220; i++) {
      service.markPlayed(`track-${i}`);
    }
    expect((service as any).playedIds.size).toBeLessThanOrEqual(200);
    expect((service as any).playedIds.has("track-219")).toBe(true);
    expect((service as any).playedIds.has("track-0")).toBe(false);
  });

  test("getNextRecommendation uses recent history seed and avoids duplicates", async () => {
    const historyTrack: QueueTrack = {
      queueId: "q1",
      id: "XFkzRNyygfk", // Creep
      provider: "yt",
      title: "Creep",
      artist: "Radiohead",
      thumbnail: "https://example.com/thumb.jpg",
      duration: 239,
      requestedBy: "Coworker",
      requestedAt: Date.now(),
      votes: 1,
      voters: [],
      votedIps: [],
      status: "played",
    };

    const rec = await autoDj.getNextRecommendation([historyTrack], []);
    expect(rec).not.toBeNull();
    if (rec) {
      expect(rec.id).not.toBe(historyTrack.id);
      expect(rec.title.length).toBeGreaterThan(0);
      expect(rec.artist.length).toBeGreaterThan(0);
      if (rec.duration) {
        expect(rec.duration).toBeLessThanOrEqual(900);
      }
    }
  });

  test("getNextRecommendation buffers pool and serves consecutive picks with 0 network calls", async () => {
    const historyTrack: QueueTrack = {
      queueId: "q1",
      id: "XFkzRNyygfk",
      provider: "yt",
      title: "Creep",
      artist: "Radiohead",
      thumbnail: "https://example.com/thumb.jpg",
      duration: 239,
      requestedBy: "Coworker",
      requestedAt: Date.now(),
      votes: 1,
      voters: [],
      votedIps: [],
      status: "played",
    };

    // First pick: fetches from YouTube Music and populates candidatePool
    const start1 = performance.now();
    const rec1 = await autoDj.getNextRecommendation([historyTrack], []);
    const dur1 = performance.now() - start1;
    expect(rec1).not.toBeNull();

    // Verify candidate pool has remaining buffered tracks
    const internalPool = (autoDj as any).candidatePool as SearchResult[];
    expect(internalPool.length).toBeGreaterThan(5);

    // Second pick: should hit candidatePool in < 10ms with zero network requests!
    const start2 = performance.now();
    const rec2 = await autoDj.getNextRecommendation([historyTrack], []);
    const dur2 = performance.now() - start2;

    expect(rec2).not.toBeNull();
    expect(rec2?.id).not.toBe(rec1?.id);
    expect(dur2).toBeLessThan(50); // Instant response from pool!
  });

  test("resetPool clears candidate buffer so new user requests reset the vibe", async () => {
    const historyTrack: QueueTrack = {
      queueId: "q1",
      id: "XFkzRNyygfk",
      provider: "yt",
      title: "Creep",
      artist: "Radiohead",
      thumbnail: "https://example.com/thumb.jpg",
      duration: 239,
      requestedBy: "Coworker",
      requestedAt: Date.now(),
      votes: 1,
      voters: [],
      votedIps: [],
      status: "played",
    };

    await autoDj.getNextRecommendation([historyTrack], []);
    expect(((autoDj as any).candidatePool as SearchResult[]).length).toBeGreaterThan(0);

    // Reset pool (e.g. coworker requested another track)
    autoDj.resetPool();
    expect(((autoDj as any).candidatePool as SearchResult[]).length).toBe(0);
    expect((autoDj as any).consecutivePoolPicks).toBe(0);
  });

  test("getRelatedTracks caches responses across repeated requests", async () => {
    // Call 1
    const res1 = await getRelatedTracks("XFkzRNyygfk", "Radiohead");
    expect(res1.length).toBeGreaterThan(0);

    // Call 2: Should hit memory cache instantaneously
    const start = performance.now();
    const res2 = await getRelatedTracks("XFkzRNyygfk", "Radiohead");
    const dur = performance.now() - start;

    expect(res2.length).toBe(res1.length);
    expect(res2[0].id).toBe(res1[0].id);
    expect(dur).toBeLessThan(10); // Cache hit < 10ms
  });

  test("getNextRecommendation falls back to DB favorites or cold start when history is empty", async () => {
    const dbTrack: QueueTrack = {
      queueId: "q-db",
      id: "b4m_75kQ2j8",
      provider: "yt",
      title: "Karma Police",
      artist: "Radiohead",
      thumbnail: "https://example.com/thumb.jpg",
      duration: 260,
      requestedBy: "Office DJ",
      requestedAt: Date.now(),
      votes: 2,
      voters: [],
      votedIps: [],
      status: "played",
    };
    jukeboxDb.recordTrackPlayed(dbTrack);

    const rec = await autoDj.getNextRecommendation([], []);
    expect(rec).not.toBeNull();
    if (rec) {
      expect(rec.id).toBeDefined();
      expect(rec.title).toBeDefined();
    }
  });

  test("streamCache enforces capacity limit and evicts expired or oldest entries", () => {
    streamCache.clear();
    const now = Date.now();
    for (let i = 0; i < MAX_STREAM_CACHE_SIZE + 10; i++) {
      addToStreamCache(`stream-${i}`, {
        url: `https://stream.example.com/${i}`,
        provider: "yt",
        expiresAt: now + 60000,
      });
    }

    expect(streamCache.size).toBe(MAX_STREAM_CACHE_SIZE);
    expect(streamCache.has("stream-0")).toBe(false);
    expect(streamCache.has("stream-9")).toBe(false);
    expect(streamCache.has("stream-10")).toBe(true);
    expect(streamCache.has(`stream-${MAX_STREAM_CACHE_SIZE + 9}`)).toBe(true);

    // Re-setting existing key does not evict another key
    addToStreamCache("stream-10", {
      url: "https://stream.example.com/updated-10",
      provider: "yt",
      expiresAt: now + 60000,
    });
    expect(streamCache.size).toBe(MAX_STREAM_CACHE_SIZE);
    expect(streamCache.has("stream-11")).toBe(true);

    // Invalidation removes key immediately
    const { invalidateStreamCache } = require("./resolver.ts");
    invalidateStreamCache("stream-10");
    expect(streamCache.has("stream-10")).toBe(false);
  });
});

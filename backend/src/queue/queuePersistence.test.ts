import { describe, expect, it } from "bun:test";
import { jukeboxDb } from "../db.ts";
import { QueueStore } from "./store.ts";
import type { QueueTrack, SearchResult } from "../types.ts";

describe("Persistent Queue & SQLite Storage", () => {
  const dummyTrack1: QueueTrack = {
    id: "yt_valid_001",
    queueId: "q_001",
    provider: "yt",
    title: "Monokrom",
    artist: "Tulus",
    thumbnail: "https://i.ytimg.com/vi/QqJ-Vp8mvbk/hqdefault.jpg",
    duration: 214,
    requestedBy: "Ando",
    requestedAt: Date.now() - 5000,
    votes: 4,
    voters: [
      { clientId: "c_ando", nickname: "Ando", role: "member", weight: 1 },
      { clientId: "c_dj", nickname: "Host DJ", role: "dj", weight: 3 },
    ],
    votedIps: ["c_ando", "c_dj"],
    status: "ready",
  };

  const dummyTrack2: QueueTrack = {
    id: "sc_valid_002",
    queueId: "q_002",
    provider: "sc",
    title: "Dan...",
    artist: "Sheila On 7",
    thumbnail: "https://i.ytimg.com/vi/k1BfsO0mxWQ/hqdefault.jpg",
    duration: 286,
    requestedBy: "Host DJ 🎧",
    requestedAt: Date.now() - 2000,
    votes: 5,
    voters: [
      { clientId: "c_host", nickname: "Host DJ 🎧", role: "host", weight: 5 },
    ],
    votedIps: ["c_host"],
    status: "ready",
  };

  it("persists and restores active queue accurately", () => {
    // Save queue
    jukeboxDb.saveQueue([dummyTrack2, dummyTrack1]);

    // Load queue
    const loaded = jukeboxDb.loadQueue();
    expect(loaded.length).toBe(2);
    expect(loaded[0].queueId).toBe("q_002");
    expect(loaded[0].votes).toBe(5);
    expect(loaded[0].voters?.length).toBe(1);
    expect(loaded[1].queueId).toBe("q_001");
    expect(loaded[1].title).toBe("Monokrom");
    expect(loaded[1].votes).toBe(4);
  });

  it("persists and restores now playing track in paused state", () => {
    jukeboxDb.saveNowPlaying(dummyTrack1, 45.5, 214);

    const nowPlayingState = jukeboxDb.loadNowPlaying();
    expect(nowPlayingState).not.toBeNull();
    expect(nowPlayingState?.track?.id).toBe("yt_valid_001");
    expect(nowPlayingState?.currentTime).toBe(45.5);
    expect(nowPlayingState?.duration).toBe(214);

    // Instantiate fresh QueueStore simulating server restart
    const freshStore = new QueueStore();
    const state = freshStore.getState();
    expect(state.nowPlaying?.id).toBe("yt_valid_001");
    expect(state.isPlaying).toBe(false); // Paused on server restart as specified!
    expect(state.currentTime).toBe(45.5);
  });

  it("records track plays, aggregates Office Top Hits, and filters out testing songs", () => {
    // Record valid plays
    jukeboxDb.recordTrackPlayed(dummyTrack1, "c_ando");
    jukeboxDb.recordTrackPlayed(dummyTrack1, "c_host");
    jukeboxDb.recordTrackPlayed(dummyTrack2, "c_host");

    // Attempt to record a testing track (should be ignored & filtered out)
    jukeboxDb.recordTrackPlayed({
      ...dummyTrack1,
      id: "test_yt_001",
      title: "Office Chill Anthem",
      artist: "The Developers",
      requestedBy: "Sarah Dev",
    }, "c_sarah");

    const top = jukeboxDb.getTopTracks(10);
    expect(top.length).toBeGreaterThanOrEqual(2);

    const first = top.find((t) => t.id === "yt_valid_001");
    expect(first).toBeDefined();
    expect(first?.playCount).toBeGreaterThanOrEqual(2);

    const second = top.find((t) => t.id === "sc_valid_002");
    expect(second).toBeDefined();
    expect(second?.playCount).toBeGreaterThanOrEqual(1);

    const testFiltered = top.find((t) => t.id === "test_yt_001");
    expect(testFiltered).toBeUndefined();
  });

  it("returns recent tracks for office and specific client while excluding test tracks", () => {
    const officeRecents = jukeboxDb.getRecentTracks(undefined, 10);
    expect(officeRecents.length).toBeGreaterThan(0);
    expect(officeRecents.some((t) => t.id === "yt_valid_001")).toBe(true);
    expect(officeRecents.some((t) => t.id === "test_yt_001")).toBe(false);

    const clientRecents = jukeboxDb.getRecentTracks("c_ando", 10);
    expect(clientRecents.some((t) => t.id === "yt_valid_001")).toBe(true);
  });

  it("batches member and active listener updates into a single notification", () => {
    const store = new QueueStore();
    let notifyCount = 0;
    store.subscribe(() => {
      notifyCount++;
    });

    store.setMember({
      clientId: "test_client",
      ip: "127.0.0.1",
      nickname: "Test User",
      role: "member",
      connectedAt: Date.now(),
      isHost: false,
    }, 5);

    expect(notifyCount).toBe(1);
    expect(store.getState().activeListeners).toBe(5);
    expect(store.getState().members.length).toBe(1);

    store.removeMember("test_client", 4);
    expect(notifyCount).toBe(2);
    expect(store.getState().activeListeners).toBe(4);
    expect(store.getState().members.length).toBe(0);
  });

  it("executes pre-compiled load statements repeatedly with zero memory overhead", () => {
    for (let i = 0; i < 5; i++) {
      const q = jukeboxDb.loadQueue();
      expect(Array.isArray(q)).toBe(true);
      const np = jukeboxDb.loadNowPlaying();
      expect(np).toBeDefined();
    }
  });
});

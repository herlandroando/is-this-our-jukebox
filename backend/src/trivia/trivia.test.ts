import { describe, expect, test } from "bun:test";
import { TriviaGameManager } from "./gameManager.ts";
import { generateTriviaQuestions } from "./songCatalog.ts";
import { jukeboxDb } from "../db.ts";

describe("Trivia Game Manager & Smart Decoys", () => {
  test("leaveLobby preserves score and marks player offline during active game", () => {
    const mgr = new TriviaGameManager();
    // Simulate active game state
    (mgr as any).state.status = "question";
    (mgr as any).state.players["player-1"] = {
      clientId: "player-1",
      nickname: "Ando",
      role: "listener",
      score: 1500,
      isReady: true,
      hasAnswered: false,
      isOnline: true,
      joinedAt: Date.now(),
    };

    // Socket disconnect (isPermanent = false)
    mgr.leaveLobby("player-1", false);

    const state = mgr.getState();
    expect(state.players["player-1"]).toBeDefined();
    expect(state.players["player-1"].score).toBe(1500);
    expect(state.players["player-1"].isOnline).toBe(false);

    // Player reconnects
    const rejoinRes = mgr.joinLobby("player-1", "Ando", "listener");
    expect(rejoinRes.success).toBe(true);
    expect(mgr.getState().players["player-1"].isOnline).toBe(true);
    expect(mgr.getState().players["player-1"].score).toBe(1500);
  });

  test("allows late-join mid-game so new players are not stuck", () => {
    const mgr = new TriviaGameManager();
    (mgr as any).state.status = "question";

    const res = mgr.joinLobby("player-new", "Budi", "listener");
    expect(res.success).toBe(true);

    const p = mgr.getState().players["player-new"];
    expect(p).toBeDefined();
    expect(p.nickname).toBe("Budi");
    expect(p.score).toBe(0);
    expect(p.isOnline).toBe(true);
  });

  test("triggerTimerStart enforces 3-second listening phase and rejects early answer submissions", () => {
    const mgr = new TriviaGameManager();
    (mgr as any).state.status = "question";
    (mgr as any).currentRoundIndex = 1;
    (mgr as any).correctAnswers.set(1, "opt-1-correct");

    const question = {
      roundIndex: 1,
      totalRounds: 5,
      trackId: "track-123",
      provider: "yt" as const,
      snippetStartSec: 20,
      durationSec: 20,
      options: [
        { id: "opt-1-correct", label: "Song A - Artist X", title: "Song A", artist: "Artist X" },
        { id: "opt-1-decoy-1", label: "Song B - Artist X", title: "Song B", artist: "Artist X" },
        { id: "opt-1-decoy-2", label: "Song C - Artist Y", title: "Song C", artist: "Artist Y" },
        { id: "opt-1-decoy-3", label: "Song D - Artist Z", title: "Song D", artist: "Artist Z" },
      ],
      startTime: 0,
      endTime: 0,
      isAudioReady: false,
    };
    (mgr as any).state.currentRound = question;
    (mgr as any).state.players["player-1"] = {
      clientId: "player-1",
      nickname: "Ando",
      role: "listener",
      score: 0,
      isReady: true,
      hasAnswered: false,
      isOnline: true,
      joinedAt: Date.now(),
    };

    // Audio becomes ready -> triggerTimerStart
    (mgr as any).triggerTimerStart(1);

    expect(question.isAudioReady).toBe(true);
    expect(question.listenDurationSec).toBe(3);
    expect(question.startTime).toBeGreaterThan(Date.now() + 2500); // 3 seconds in the future
    expect(question.endTime).toBeGreaterThan(question.startTime);

    // Try submitting answer while in listening phase -> should be rejected!
    const earlySubmit = mgr.submitAnswer("player-1", 1, "opt-1-correct");
    expect(earlySubmit.success).toBe(false);
    expect(mgr.getState().players["player-1"].hasAnswered).toBe(false);

    // Fast-forward past listening phase
    question.startTime = Date.now() - 500; // now in guessing phase
    const validSubmit = mgr.submitAnswer("player-1", 1, "opt-1-correct");
    expect(validSubmit.success).toBe(true);
    expect(validSubmit.isCorrect).toBe(true);
    expect(validSubmit.points).toBeGreaterThanOrEqual(500);
    expect(mgr.getState().players["player-1"].hasAnswered).toBe(true);
  });

  test("jukeboxDb.getTracksByArtist finds songs by artist while excluding current title", () => {
    // Record sample plays into SQLite
    jukeboxDb.recordTrackPlayed({
      queueId: "q-1",
      id: "test-artist-1",
      provider: "yt",
      title: "Hampa",
      artist: "Ari Lasso",
      requestedBy: "Tester",
      requestedAt: Date.now(),
    });
    jukeboxDb.recordTrackPlayed({
      queueId: "q-2",
      id: "test-artist-2",
      provider: "yt",
      title: "Misteri Ilahi",
      artist: "Ari Lasso",
      requestedBy: "Tester",
      requestedAt: Date.now(),
    });

    const tracks = jukeboxDb.getTracksByArtist("Ari Lasso", "Hampa", 5);
    expect(tracks.length).toBeGreaterThan(0);
    const titles = tracks.map((t) => t.title.toLowerCase());
    expect(titles).toContain("misteri ilahi");
    expect(titles).not.toContain("hampa");
  });
});

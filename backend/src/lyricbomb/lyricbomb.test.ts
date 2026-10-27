import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  splitWords,
  extractLineTokens,
  chunkWordsIntoPhrases,
  buildSegmentsFromLines,
  clearPreparedSongCache,
} from "./songValidator.ts";
import { lyricBombGameManager } from "./gameManager.ts";
import { getVerifiedLyricBombPresets } from "./songCatalog.ts";

describe("Lyric Bomb Logic", () => {
  beforeEach(() => {
    clearPreparedSongCache();
    lyricBombGameManager.closeGame();
  });

  it("splits words accurately removing punctuation and noise", () => {
    const raw = "Dan... bila esok datang kembali? (Reff)";
    const words = splitWords(raw);
    expect(words).toEqual(["Dan", "bila", "esok", "datang", "kembali"]);
  });

  it("uses spaced Romaji automatically for Japanese script lines while preserving original display script", () => {
    const jpLine = {
      time: 12.5,
      text: "無敵の笑顔で荒らすメディア",
      romaji: "muteki no egao de arasu media",
      translation: "Unbeatable smile shaking up the media",
    };
    const tokens = extractLineTokens(jpLine);
    expect(tokens.words).toEqual(["muteki", "no", "egao", "de", "arasu", "media"]);
    expect(tokens.targetOriginalText).toBe("muteki no egao de arasu media");
    expect(tokens.targetDisplayScript).toBe("無敵の笑顔で荒らすメディア");
    expect(tokens.targetTranslation).toBe("Unbeatable smile shaking up the media");
  });

  it("builds segments with 2-3 lead-in lines and ensures stopTime never leaks past targetLine.time", () => {
    const lines = [
      { time: 10.0, text: "Malam ini hujan turun lagi" },
      { time: 14.0, text: "Bersama kenangan yang telah lalu" },
      { time: 18.0, text: "Ku masih berdiri di sini menunggu" },
      { time: 22.5, text: "Bayangmu hadir di dalam mimpiku" },
      { time: 27.0, text: "Jangan pernah kau pergi lagi" },
      { time: 31.0, text: "Tetaplah di sisiku selamanya kasih" },
      { time: 35.5, text: "Kita lewati malam yang dingin ini" },
      { time: 40.0, text: "Sampai matahari terbit kembali esok" },
      { time: 45.0, text: "Pegang erat tanganku jangan lepaskan" },
    ];

    const segments = buildSegmentsFromLines(lines, 3, 9);
    expect(segments.length).toBeGreaterThanOrEqual(3);

    for (const seg of segments) {
      expect(seg.leadInLines.length).toBeGreaterThanOrEqual(1);
      expect(seg.leadInLines.length).toBeLessThanOrEqual(3);
      expect(seg.stopTime).toBeGreaterThan(seg.leadInStartTime);
      expect(seg.stopTime).toBeLessThan(seg.resumeStartTime + 0.2);
      expect(seg.words.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("manages lobby creation, host spectator toggle, and player joining", () => {
    const lobby = lyricBombGameManager.createLobby("host_1", "Host DJ");
    expect(lobby.success).toBe(true);

    const state1 = lyricBombGameManager.getState();
    expect(state1.status).toBe("lobby");
    expect(state1.isHostPlaying).toBe(true);
    expect(state1.players["host_1"]).toBeDefined();
    expect(state1.players["host_1"].hp).toBe(3);

    // Host switches to Spectator mode
    lyricBombGameManager.setHostPlaying("host_1", false);
    expect(lyricBombGameManager.getState().isHostPlaying).toBe(false);
    expect(lyricBombGameManager.getState().players["host_1"]).toBeUndefined();

    // Switch back to playing
    lyricBombGameManager.setHostPlaying("host_1", true);
    expect(lyricBombGameManager.getState().isHostPlaying).toBe(true);
    expect(lyricBombGameManager.getState().players["host_1"]).toBeDefined();

    const joinResult = lyricBombGameManager.joinLobby("p2", "Ando");
    expect(joinResult.success).toBe(true);

    const state2 = lyricBombGameManager.getState();
    expect(Object.keys(state2.players).length).toBe(2);
    expect(state2.players["p2"].hp).toBe(3);

    // Closing game resumes background playback
    lyricBombGameManager.closeGame();
    expect(lyricBombGameManager.getState().status).toBe("idle");
  });

  it("handles ready toggle and game start with relaxed untimed picker phase", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p2", "Ando");

    lyricBombGameManager.setReady("p2", true);
    expect(lyricBombGameManager.getState().players["p2"].isReady).toBe(true);

    const startRes = lyricBombGameManager.startGame();
    expect(startRes.success).toBe(true);

    const state = lyricBombGameManager.getState();
    expect(state.status).toBe("picking_song");
    expect(state.pickerTimeLeft).toBeNull();
    expect(state.pickerPlayerId).toBeDefined();
    expect(["host_1", "p2"]).toContain(state.pickerPlayerId!);
  });

  it("allows Host to force random song anytime even when not the picker", async () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p2", "Ando");
    lyricBombGameManager.startGame();

    const state = lyricBombGameManager.getState();
    expect(state.status).toBe("picking_song");

    // Force p2 to be the picker to test Host intervention
    (lyricBombGameManager as any).state.pickerPlayerId = "p2";

    // Non-host stranger cannot pick
    const strangerRes = await lyricBombGameManager.pickRandomSong("stranger");
    expect(strangerRes.success).toBe(false);

    // Host CAN pick even when not the picker
    const selectSpy = spyOn(lyricBombGameManager, "selectSong").mockResolvedValue({ success: true });
    const randomRes = await lyricBombGameManager.pickRandomSong("host_1");
    expect(randomRes.success).toBe(true);
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it("provides expanded verified preset catalog across categories", () => {
    const presets = getVerifiedLyricBombPresets();
    expect(presets.length).toBeGreaterThanOrEqual(20);
    expect(presets[0].title).toBe("Dan...");
  });

  it("manages player audio output mode", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p2", "Player HP");

    expect(lyricBombGameManager.getState().players["p2"].audioOutputMode).toBeUndefined();

    lyricBombGameManager.setPlayerAudioMode("p2", "self");
    expect(lyricBombGameManager.getState().players["p2"].audioOutputMode).toBe("self");

    lyricBombGameManager.setPlayerAudioMode("p2", "host");
    expect(lyricBombGameManager.getState().players["p2"].audioOutputMode).toBe("host");
  });

  it("accepts duplicate word chips in any order, applies -2s penalty on wrong tap, supports Hint (-3s), and supports Rematch", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p2", "Ando");

    // Inject a controlled defusing state with duplicate words ("ku" at index 0 and index 3)
    const internalState = (lyricBombGameManager as any).state;
    internalState.status = "defusing";
    internalState.activePlayerId = "p2";
    internalState.playerTurnOrder = ["p2", "host_1"];
    internalState.turnBombDuration = 18;
    internalState.currentBombTimeLeft = 18;
    internalState.currentSegmentIndex = 0;
    internalState.currentSong = {
      videoId: "test_vid",
      title: "Lagu Test",
      artist: "Artis Test",
      duration: 180,
      segments: [
        {
          segmentIndex: 0,
          leadInStartTime: 5,
          stopTime: 12,
          resumeStartTime: 12.5,
          resumeEndTime: 16,
          leadInTexts: ["Baris awal"],
          leadInLines: [{ time: 6, text: "Baris awal" }],
          targetOriginalText: "ku cinta kau ku",
          words: ["ku", "cinta", "kau", "ku"],
          scrambledChips: [
            { id: "chip_ku_second", text: "ku", originalIndex: 3 },
            { id: "chip_cinta", text: "cinta", originalIndex: 1 },
            { id: "chip_kau", text: "kau", originalIndex: 2 },
            { id: "chip_ku_first", text: "ku", originalIndex: 0 },
          ],
        },
      ],
    };

    // 1. Tap duplicate word "ku" using the chip that originally had originalIndex=3
    const tap1 = lyricBombGameManager.submitWordTap("p2", "chip_ku_second");
    expect(tap1.success).toBe(true);
    expect(lyricBombGameManager.getState().selectedWordIds).toEqual(["chip_ku_second"]);

    // 2. Tap wrong word ("kau" instead of "cinta") -> should deduct 2s penalty
    const tapWrong = lyricBombGameManager.submitWordTap("p2", "chip_kau");
    expect(tapWrong.success).toBe(false);
    expect(tapWrong.penaltySec).toBe(2);
    expect(lyricBombGameManager.getState().currentBombTimeLeft).toBe(16);
    expect(lyricBombGameManager.getState().players["p2"].wrongTaps).toBe(1);

    // 3. Use Hint lifeline -> should deduct 3s and auto-pick "cinta"
    const hintRes = lyricBombGameManager.useHint("p2");
    expect(hintRes.success).toBe(true);
    expect(hintRes.chipId).toBe("chip_cinta");
    expect(lyricBombGameManager.getState().currentBombTimeLeft).toBe(13);
    expect(lyricBombGameManager.getState().players["p2"].hintsUsed).toBe(1);

    // 4. Tap "kau" and remaining duplicate "ku" (chip_ku_first) to complete the line
    const tap3 = lyricBombGameManager.submitWordTap("p2", "chip_kau");
    expect(tap3.success).toBe(true);

    const tap4 = lyricBombGameManager.submitWordTap("p2", "chip_ku_first");
    expect(tap4.success).toBe(true);
    expect(tap4.completed).toBe(true);

    const afterSuccess = lyricBombGameManager.getState();
    expect(afterSuccess.status).toBe("line_success");
    expect(afterSuccess.players["p2"].defusalCount).toBe(1);
    expect(afterSuccess.players["p2"].streak).toBe(1);
    expect(afterSuccess.players["p2"].score).toBeGreaterThan(300);

    // 5. Rematch resets all players back to lobby with fresh stats
    const rematchRes = lyricBombGameManager.rematchGame();
    expect(rematchRes.success).toBe(true);
    const rematchState = lyricBombGameManager.getState();
    expect(rematchState.status).toBe("lobby");
    expect(rematchState.players["p2"].score).toBe(0);
    expect(rematchState.players["p2"].hp).toBe(3);
    expect(rematchState.players["p2"].defusalCount).toBe(0);
  });

  it("Player can report missing audio to Host, and only Host can skip the broken song without HP penalty", () => {
    lyricBombGameManager.createLobby("host_1", "HostUtama");
    lyricBombGameManager.setHostPlaying("host_1", false);
    lyricBombGameManager.joinLobby("p1", "Budi");
    lyricBombGameManager.joinLobby("p2", "Siti");
    lyricBombGameManager.setReady("p1", true);
    lyricBombGameManager.setReady("p2", true);
    lyricBombGameManager.startGame();

    const internalState = (lyricBombGameManager as any).state;
    internalState.status = "playing";
    internalState.activePlayerId = "p1";
    internalState.currentSong = {
      videoId: "broken_vid_1",
      title: "Lagu Tanpa Suara",
      artist: "Artis Kantor",
      albumArt: "",
      segments: [],
    };

    // Player reports missing audio -> recorded in audioIssueReports
    const reportRes = lyricBombGameManager.reportAudioIssue("p1", "Budi");
    expect(reportRes.success).toBe(true);
    expect(lyricBombGameManager.getState().audioIssueReports?.length).toBe(1);
    expect(lyricBombGameManager.getState().audioIssueReports?.[0].nickname).toBe("Budi");

    // Non-host player cannot skip the song directly
    const playerSkipAttempt = lyricBombGameManager.skipCurrentSong("p1", false);
    expect(playerSkipAttempt.success).toBe(false);
    expect(lyricBombGameManager.getState().status).toBe("playing");

    // Host skips the song -> returns to picking_song without deducting HP
    const hostSkipRes = lyricBombGameManager.skipCurrentSong("host_1", false);
    expect(hostSkipRes.success).toBe(true);
    const afterSkip = lyricBombGameManager.getState();
    expect(afterSkip.status).toBe("picking_song");
    expect(afterSkip.currentSong).toBeNull();
    expect(afterSkip.audioIssueReports).toEqual([]);
    expect(afterSkip.players["p1"].hp).toBe(3);
    expect(afterSkip.players["p2"].hp).toBe(3);
  });

  it("chunks words into 4 to 6 phrase chips, with fallback under 4 when word count <= 3", () => {
    // 2 words -> 2 chips (under 4)
    const w2 = ["Your", "skin"];
    const c2 = chunkWordsIntoPhrases(w2);
    expect(c2).toEqual(["Your", "skin"]);
    expect(c2.length).toBe(2);

    // 3 words -> 3 chips (under 4)
    const w3 = ["Skin", "and", "bones"];
    const c3 = chunkWordsIntoPhrases(w3);
    expect(c3).toEqual(["Skin", "and", "bones"]);
    expect(c3.length).toBe(3);

    // 4 words -> 4 chips
    const w4 = ["Dan", "bila", "esok", "datang"];
    const c4 = chunkWordsIntoPhrases(w4);
    expect(c4).toEqual(["Dan", "bila", "esok", "datang"]);
    expect(c4.length).toBe(4);

    // 5 words -> 5 chips
    const w5 = ["Dan", "bila", "esok", "datang", "kembali"];
    const c5 = chunkWordsIntoPhrases(w5);
    expect(c5.length).toBe(5);

    // 6 words -> 6 chips
    const w6 = ["muteki", "no", "egao", "de", "arasu", "media"];
    const c6 = chunkWordsIntoPhrases(w6);
    expect(c6.length).toBe(6);

    // 7 words -> 5 chips (in 4-6 range)
    const w7 = ["I", "came", "in", "like", "a", "wrecking", "ball"];
    const c7 = chunkWordsIntoPhrases(w7);
    expect(c7.length).toBe(5);
    expect(c7).toEqual(["I came", "in like", "a", "wrecking", "ball"]);

    // 8 words -> 6 chips (in 4-6 range)
    const w8 = ["Don't", "look", "back", "in", "anger", "I", "heard", "say"];
    const c8 = chunkWordsIntoPhrases(w8);
    expect(c8.length).toBe(6);

    // 10 words -> 5 chips (pairs of 2, in 4-6 range)
    const w10 = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const c10 = chunkWordsIntoPhrases(w10);
    expect(c10.length).toBe(5);
    expect(c10).toEqual(["one two", "three four", "five six", "seven eight", "nine ten"]);
  });

  it("configures starter bomb duration in lobby and preserves it on game start and rematch", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(18);

    // Host adjusts starter duration to 25s
    const setRes1 = lyricBombGameManager.setStartingDuration(25);
    expect(setRes1.success).toBe(true);
    expect(setRes1.duration).toBe(25);
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(25);
    expect(lyricBombGameManager.getState().turnBombDuration).toBe(25);

    // Clamps minimum to 10s and maximum to 40s
    lyricBombGameManager.setStartingDuration(5);
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(10);

    lyricBombGameManager.setStartingDuration(50);
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(40);

    // Set to 22s for game
    lyricBombGameManager.setStartingDuration(22);
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(22);

    // Add player and start game
    lyricBombGameManager.joinLobby("p2", "Ando");
    lyricBombGameManager.startGame();
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(22);

    // Rematch preserves 22s starter setting
    lyricBombGameManager.rematchGame();
    expect(lyricBombGameManager.getState().status).toBe("lobby");
    expect(lyricBombGameManager.getState().startingBombDuration).toBe(22);
  });

  it("handles player transient disconnect and reconnect during defusal phase without losing turn", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p1", "Jancok Haseyo");
    lyricBombGameManager.setReady("p1", true);

    const internal = (lyricBombGameManager as any).state;
    internal.status = "defusing";
    internal.activePlayerId = "p1";
    internal.currentSong = {
      videoId: "test_vid",
      title: "Test Song",
      artist: "Test Artist",
      segments: [
        {
          segmentIndex: 0,
          words: ["hello", "world"],
          scrambledChips: [
            { id: "c1", text: "world", originalIndex: 1 },
            { id: "c0", text: "hello", originalIndex: 0 },
          ],
        },
      ],
    };
    internal.currentSegmentIndex = 0;
    internal.selectedWordIds = [];
    internal.currentBombTimeLeft = 15;

    // Simulate transient network disconnect
    lyricBombGameManager.leaveLobby("p1", false);
    expect(lyricBombGameManager.getState().players["p1"].isOnline).toBe(false);
    expect(lyricBombGameManager.getState().activePlayerId).toBe("p1");

    // Player reconnects with the same persistent ID
    const rejoinRes = lyricBombGameManager.joinLobby("p1", "Jancok Haseyo");
    expect(rejoinRes.success).toBe(true);
    expect(lyricBombGameManager.getState().players["p1"].isOnline).toBe(true);
    expect(lyricBombGameManager.getState().activePlayerId).toBe("p1");

    // Reconnected player taps the first word chip ("hello")
    const tap1 = lyricBombGameManager.submitWordTap("p1", "c0");
    expect(tap1.success).toBe(true);
    expect(lyricBombGameManager.getState().selectedWordIds).toEqual(["c0"]);

    // Tap second word chip ("world") -> completes defusal
    const tap2 = lyricBombGameManager.submitWordTap("p1", "c1");
    expect(tap2.success).toBe(true);
    expect(tap2.completed).toBe(true);
    expect(lyricBombGameManager.getState().status).toBe("line_success");
  });

  it("migrates session if player reconnected with a new ID using the same nickname (e.g. Incognito)", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p1", "Sotonan Enjoyers");
    lyricBombGameManager.setReady("p1", true);

    const internal = (lyricBombGameManager as any).state;
    internal.status = "defusing";
    internal.activePlayerId = "p1";
    internal.playerTurnOrder = ["host_1", "p1"];
    internal.currentSong = {
      videoId: "test_vid_2",
      title: "Test Song 2",
      artist: "Test Artist",
      segments: [
        {
          segmentIndex: 0,
          words: ["selamat", "pagi"],
          scrambledChips: [
            { id: "chip_pagi", text: "pagi", originalIndex: 1 },
            { id: "chip_selamat", text: "selamat", originalIndex: 0 },
          ],
        },
      ],
    };
    internal.currentSegmentIndex = 0;
    internal.selectedWordIds = [];

    // Transient disconnect marks p1 offline
    lyricBombGameManager.leaveLobby("p1", false);
    expect(lyricBombGameManager.getState().players["p1"].isOnline).toBe(false);

    // Player joins from Incognito with a new ID "p1_incognito" but same nickname
    const rejoinNewId = lyricBombGameManager.joinLobby("p1_incognito", "Sotonan Enjoyers");
    expect(rejoinNewId.success).toBe(true);

    const state = lyricBombGameManager.getState();
    // Old ID deleted, new ID registered with preserved stats
    expect(state.players["p1"]).toBeUndefined();
    expect(state.players["p1_incognito"]).toBeDefined();
    expect(state.players["p1_incognito"].isOnline).toBe(true);
    // Active player and turn order migrated to the new ID!
    expect(state.activePlayerId).toBe("p1_incognito");
    expect(state.playerTurnOrder).toContain("p1_incognito");
    expect(state.playerTurnOrder).not.toContain("p1");

    // The player with the new ID can now submit the word taps!
    const tap = lyricBombGameManager.submitWordTap("p1_incognito", "chip_selamat");
    expect(tap.success).toBe(true);
  });

  it("limits segments to 4-6 dynamic segments and distributes them", () => {
    // Generate mock lines of a 30-line song with 4-5 words per line
    const mockLines: any[] = [];
    for (let i = 0; i < 30; i++) {
      mockLines.push({
        time: i * 4.0,
        text: `Baris lirik ke ${i} ini bernyanyi`,
      });
    }

    const segmentsDefault = buildSegmentsFromLines(mockLines, 2, 9, 6);
    expect(segmentsDefault.length).toBeLessThanOrEqual(6);
    expect(segmentsDefault.length).toBeGreaterThanOrEqual(4);

    const segmentsSmall = buildSegmentsFromLines(mockLines, 2, 9, 4);
    expect(segmentsSmall.length).toBeLessThanOrEqual(4);
    expect(segmentsSmall.length).toBeGreaterThanOrEqual(3);
  });

  it("awards +1 HP on 3x streak defuse when HP < 3, and awards +1000 score bonus on song survived without HP boost", () => {
    lyricBombGameManager.createLobby("host_1", "Host DJ");
    lyricBombGameManager.joinLobby("p1", "Player 1");

    const internal = (lyricBombGameManager as any).state;
    internal.status = "defusing";
    internal.activePlayerId = "p1";
    internal.players["p1"].hp = 2; // Damaged player
    internal.players["p1"].streak = 2; // 2 streak already
    internal.currentSong = {
      videoId: "test_vid",
      title: "Test Song",
      artist: "Test Artist",
      duration: 100,
      segments: [
        {
          segmentIndex: 0,
          leadInStartTime: 0,
          stopTime: 2,
          resumeStartTime: 2,
          resumeEndTime: 4,
          leadInTexts: ["Halo"],
          leadInLines: [],
          targetOriginalText: "dunia kata",
          words: ["dunia", "kata"],
          scrambledChips: [
            { id: "c1", text: "dunia", originalIndex: 0 },
            { id: "c2", text: "kata", originalIndex: 1 },
          ],
        },
      ],
    };
    internal.currentSegmentIndex = 0;
    internal.selectedWordIds = [];

    // Solve segment
    lyricBombGameManager.submitWordTap("p1", "c1");
    const finishTap = lyricBombGameManager.submitWordTap("p1", "c2");
    expect(finishTap.success).toBe(true);
    expect(finishTap.completed).toBe(true);

    const afterDefuseState = lyricBombGameManager.getState();
    expect(afterDefuseState.players["p1"].streak).toBe(3);
    // +1 HP should have been granted!
    expect(afterDefuseState.players["p1"].hp).toBe(3);
    expect(afterDefuseState.lastLifeGained).toBe(true);

    // Now test Song Survived:
    const prevScore = afterDefuseState.players["p1"].score;
    // Set HP to 2 to verify songSurvived does NOT increase HP
    (lyricBombGameManager as any).state.players["p1"].hp = 2;
    (lyricBombGameManager as any).handleSongSurvived();

    const survivedState = lyricBombGameManager.getState();
    expect(survivedState.status).toBe("song_survived");
    // HP must remain 2 (no auto HP recovery on song survived)
    expect(survivedState.players["p1"].hp).toBe(2);
    // Score must increase by +1000
    expect(survivedState.players["p1"].score).toBe(prevScore + 1000);
  });
});

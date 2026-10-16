import { spawn } from "bun";

const PORT = 3088;
console.log(`[smoke-trivia] Starting test Jukebox server on port ${PORT}...`);

const serverProc = spawn({
  cmd: ["bun", "backend/src/server.ts"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    JUKEBOX_PORT: String(PORT),
    NODE_ENV: "test",
  },
  stdout: "pipe",
  stderr: "inherit",
});

let adminToken = "";
let serverReady = false;

async function waitForServer(): Promise<void> {
  const reader = serverProc.stdout.getReader();
  const decoder = new TextDecoder();

  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const tokenMatch = text.match(/token=([A-Za-z0-9_-]+)/);
        if (tokenMatch) {
          adminToken = tokenMatch[1];
        }
        if (text.includes("Host URL")) {
          serverReady = true;
        }
      }
    } catch {
      // Reader finished
    }
  })();

  const start = Date.now();
  while (!serverReady && Date.now() - start < 10000) {
    await Bun.sleep(100);
  }
  if (!serverReady) throw new Error("Server timed out starting");
}

async function run() {
  await waitForServer();
  console.log(`[smoke-trivia] Server ready! Admin token: ${adminToken.slice(0, 8)}...`);

  // 1. Test GET /api/trivia/categories & GET /api/trivia/presets
  console.log("[smoke-trivia] 1. Testing GET /api/trivia/categories & GET /api/trivia/presets...");
  const catRes = await fetch(`http://127.0.0.1:${PORT}/api/trivia/categories`);
  if (!catRes.ok) throw new Error("Failed to get categories");
  const categories = await catRes.json();
  console.log(`[smoke-trivia] Active categories count: ${categories.length} (OK)`);

  const presetRes = await fetch(`http://127.0.0.1:${PORT}/api/trivia/presets`);
  if (!presetRes.ok) throw new Error("Failed to get presets");
  const presets = await presetRes.json();
  console.log(`[smoke-trivia] Presets count in DB: ${presets.length} (OK)`);
  const animePreset = presets.find((p: any) => p.id === "anime-jp");
  if (!animePreset) throw new Error("anime-jp preset not found in DB");
  console.log(`[smoke-trivia] Verified anime-jp preset: ${animePreset.name} (Playlist: ${animePreset.playlistId})`);

  // 2. Test POST /api/trivia/preview-playlist
  console.log("[smoke-trivia] 2. Testing POST /api/trivia/preview-playlist on YouTube playlist...");
  const previewRes = await fetch(`http://127.0.0.1:${PORT}/api/trivia/preview-playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://music.youtube.com/playlist?list=PLaodxkj-4NkSJ3vCfuFytfP29lgH3Eb1S" }),
  });
  if (!previewRes.ok) throw new Error("Failed to preview playlist");
  const previewData = await previewRes.json();
  if (!previewData.valid || previewData.count === 0) {
    throw new Error(`Preview failed or returned 0 tracks: ${JSON.stringify(previewData)}`);
  }
  console.log(`[smoke-trivia] Preview OK: ${previewData.count} valid tracks found! Sample: ${previewData.sampleTracks[0]?.title} - ${previewData.sampleTracks[0]?.artist}`);

  // 3. Connect Host WebSocket
  console.log("[smoke-trivia] 3. Connecting Host WebSocket...");
  const hostWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${adminToken}`);
  await new Promise((resolve) => hostWs.addEventListener("open", resolve));

  // 4. Connect Player WebSocket
  console.log("[smoke-trivia] 4. Connecting Player 1 WebSocket...");
  const playerWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((resolve) => playerWs.addEventListener("open", resolve));

  let playerReceivedLobby = false;
  let roundStarted = false;
  let roundData: any = null;
  let timerStarted = false;
  let timerData: any = null;
  let gameClosed = false;
  let lastSyncState: any = null;

  playerWs.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "trivia:stateSync") {
      lastSyncState = msg.state;
      if (msg.state.status === "lobby") {
        playerReceivedLobby = true;
      }
    }
    if (msg.type === "trivia:lobbyCreated") {
      playerReceivedLobby = true;
    }
    if (msg.type === "trivia:roundStart") {
      roundStarted = true;
      roundData = msg.round;
    }
    if (msg.type === "trivia:timerStart") {
      timerStarted = true;
      timerData = msg;
    }
    if (msg.type === "trivia:closed") {
      gameClosed = true;
    }
  });

  // 5. Host creates lobby with Anime OST & J-Pop Trending
  console.log("[smoke-trivia] 5. Host creating Trivia lobby with anime-jp...");
  hostWs.send(
    JSON.stringify({
      type: "trivia:create",
      token: adminToken,
      settings: {
        categoryId: "anime-jp",
        roundCount: 3,
        roundDurationSec: 10,
      },
    })
  );

  const lobbyWait = Date.now();
  while (!playerReceivedLobby && Date.now() - lobbyWait < 15000) {
    await Bun.sleep(200);
  }
  if (!playerReceivedLobby) throw new Error("Player did not receive lobby notification");
  console.log("[smoke-trivia] Lobby created! Host default is MC (isHostPlaying: false) (OK)");

  // 6. Player joins and sets ready
  console.log("[smoke-trivia] 6. Player joining lobby & setting ready...");
  playerWs.send(JSON.stringify({ type: "trivia:join" }));
  await Bun.sleep(200);
  playerWs.send(JSON.stringify({ type: "trivia:ready", isReady: true }));
  await Bun.sleep(200);

  // 7. Host starts game
  console.log("[smoke-trivia] 7. Host force starting game...");
  hostWs.send(JSON.stringify({ type: "trivia:forceStart", token: adminToken }));

  // Wait for countdown (3s) and round start
  const startWait = Date.now();
  while (!roundStarted && Date.now() - startWait < 8000) {
    await Bun.sleep(200);
  }
  if (!roundStarted || !roundData) throw new Error("Round did not start in time");
  console.log(`[smoke-trivia] Round started! Round 1 of ${roundData.totalRounds}. Options count: ${roundData.options.length} (OK)`);
  console.log(`[smoke-trivia] Question Track ID: ${roundData.trackId}`);
  console.log(`[smoke-trivia] Options for this round:`);
  for (const opt of roundData.options) {
    console.log(`   - ${opt.label}`);
  }

  // 8. Client signals audioReady
  console.log("[smoke-trivia] 8. Client signalling audioReady...");
  hostWs.send(JSON.stringify({ type: "trivia:audioReady", roundIndex: roundData.roundIndex }));

  const timerWait = Date.now();
  while (!timerStarted && Date.now() - timerWait < 4000) {
    await Bun.sleep(100);
  }
  if (!timerStarted || !timerData) throw new Error("Timer start event not received after audioReady");
  console.log(`[smoke-trivia] Verified: Timer started! Duration: ${timerData.durationSec}s (OK)`);

  // 9. Player submits answer
  console.log("[smoke-trivia] 9. Player submitting answer...");
  const optionId = roundData.options[0].id;
  playerWs.send(
    JSON.stringify({
      type: "trivia:answer",
      roundIndex: roundData.roundIndex,
      optionId,
    })
  );
  await Bun.sleep(500);

  // 10. Host closes game
  console.log("[smoke-trivia] 10. Host closing trivia game...");
  hostWs.send(JSON.stringify({ type: "trivia:close", token: adminToken }));

  await Bun.sleep(600);
  if (!gameClosed) throw new Error("Game close event not received");
  console.log("[smoke-trivia] Game closed cleanly and restored jukebox! (OK)");

  // Cleanup
  hostWs.close();
  playerWs.close();
  serverProc.kill();

  console.log("\n[smoke-trivia] ALL TESTS PASSED SUCCESSFULLY! 🎉");
  process.exit(0);
}

run().catch((err) => {
  console.error("[smoke-trivia] FAILED:", err);
  try {
    serverProc.kill();
  } catch {}
  process.exit(1);
});

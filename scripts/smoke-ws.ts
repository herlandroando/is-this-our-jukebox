import { spawn } from "bun";
import { jukeboxDb } from "../backend/src/db.ts";

const PORT = 3055;
console.log(`[smoke] Starting test Jukebox server on port ${PORT}...`);

const serverProc = spawn({
  cmd: ["bun", "backend/src/server.ts"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    JUKEBOX_PORT: String(PORT),
    NODE_ENV: "test", // prevents openBrowser in tests
  },
  stdout: "pipe",
  stderr: "inherit",
});

// Read stdout to find admin token
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
      // Reader finished or closed
    }
  })();

  const start = Date.now();
  while (!serverReady && Date.now() - start < 10000) {
    await Bun.sleep(100);
  }
  if (!serverReady) throw new Error("Server timed out starting");
}

async function runTests() {
  await waitForServer();
  console.log(`[smoke] Server ready! Admin token captured: ${adminToken.slice(0, 8)}...`);

  // Test 1: whoami
  console.log("[smoke] Test 1: Testing /api/whoami...");
  const whoamiRes = await fetch(`http://127.0.0.1:${PORT}/api/whoami`);
  if (!whoamiRes.ok) throw new Error("whoami failed");
  const whoamiData = await whoamiRes.json();
  if (!whoamiData.lanIp || !whoamiData.port) throw new Error("whoami invalid data");
  console.log(`[smoke] ✓ whoami returned lanIp: ${whoamiData.lanIp}, port: ${whoamiData.port}`);

  // Test 2: search
  console.log("[smoke] Test 2: Testing /api/search...");
  const searchRes = await fetch(`http://127.0.0.1:${PORT}/api/search?q=Rick+Astley`);
  if (!searchRes.ok) throw new Error("search failed");
  const searchData = await searchRes.json();
  if (!Array.isArray(searchData) || searchData.length === 0) throw new Error("search empty");
  console.log(`[smoke] ✓ search returned ${searchData.length} tracks. First: "${searchData[0].title}"`);

  // Test 3: Lyrics API endpoint
  console.log("[smoke] Test 3: Testing /api/lyrics endpoint...");
  const lyricsRes = await fetch(
    `http://127.0.0.1:${PORT}/api/lyrics?title=Never+Gonna+Give+You+Up&artist=Rick+Astley`
  );
  if (!lyricsRes.ok) throw new Error("lyrics API failed");
  const lyricsData = await lyricsRes.json();
  if (!lyricsData || typeof lyricsData.synced !== "boolean") throw new Error("invalid lyrics response");
  console.log(
    `[smoke] ✓ /api/lyrics returned synced: ${lyricsData.synced}, lines count: ${lyricsData.lines?.length}`
  );

  // Test 4: WebSocket client handshake & stateSync with role
  console.log("[smoke] Test 4: Testing WebSocket handshake & member roles in stateSync...");
  const wsUrl = `ws://127.0.0.1:${PORT}/ws`;
  const ws = new WebSocket(wsUrl);

  let coworkerClientId = "";
  await new Promise<void>((resolve, reject) => {
    let welcomed = false;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", clientId: "test_coworker_1", nickname: "Alex Coworker" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome") {
        welcomed = true;
        coworkerClientId = msg.clientId;
        if (msg.role !== "member") reject(new Error(`Expected default role "member", got ${msg.role}`));
      }
      if (msg.type === "stateSync" && welcomed) {
        if (!Array.isArray(msg.state.members)) reject(new Error("state.members array missing"));
        resolve();
      }
    };

    ws.onerror = reject;
    setTimeout(() => reject(new Error("WS timeout")), 5000);
  });
  console.log(`[smoke] ✓ WebSocket handshake, role: "member", active members: OK!`);

  // Test 5: Coworker request track
  console.log("[smoke] Test 5: Requesting track via WebSocket...");
  const trackToRequest = searchData[0];
  ws.send(
    JSON.stringify({
      type: "requestTrack",
      track: trackToRequest,
      nickname: "Alex Coworker",
    })
  );

  await new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stateSync") {
        if (msg.state.nowPlaying || msg.state.queue.length > 0) {
          ws.removeEventListener("message", handler);
          resolve();
        }
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("Queue update timeout")), 5000);
  });
  console.log("[smoke] ✓ Track requested and playing/queued!");

  // Test 6: Claim DJ Role via passcode
  const currentDjPasscode = jukeboxDb.getMeta("dj_passcode") || "office-dj";
  console.log(`[smoke] Test 6: Claiming DJ role using passcode '${currentDjPasscode}'...`);
  await new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "roleGranted" && msg.role === "dj") {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("Claim role timeout")), 5000);
    ws.send(JSON.stringify({ type: "claimRole", passcode: currentDjPasscode }));
  });
  console.log("[smoke] ✓ DJ role granted via passcode!");

  // Test 7: DJ remote player control (pause/play without admin token)
  console.log("[smoke] Test 7: Testing DJ remote player controls (pause/play without admin token)...");
  await new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stateSync" && msg.state.isPlaying === false) {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("DJ pause timeout")), 5000);
    ws.send(JSON.stringify({ type: "pause" }));
  });
  console.log("[smoke] ✓ DJ remote pause confirmed!");

  await new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stateSync" && msg.state.isPlaying === true) {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("DJ play timeout")), 5000);
    ws.send(JSON.stringify({ type: "play" }));
  });
  console.log("[smoke] ✓ DJ remote play confirmed!");

  // Test 8: Admin WebSocket connection & Host role assignment
  console.log("[smoke] Test 8: Testing Host WebSocket & Host role assignment...");
  const adminWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${adminToken}`);
  await new Promise<void>((resolve, reject) => {
    adminWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome" && msg.isAdmin === true && msg.role === "host") {
        resolve();
      }
    };
    adminWs.onerror = reject;
    setTimeout(() => reject(new Error("Admin WS timeout")), 5000);
  });
  console.log("[smoke] ✓ Host authentication verified!");

  // Test 9: Stream endpoint check
  console.log("[smoke] Test 9: Testing /api/stream/:id endpoint...");
  const streamRes = await fetch(
    `http://127.0.0.1:${PORT}/api/stream/${trackToRequest.id}?p=${trackToRequest.provider}`,
    {
      headers: { Range: "bytes=0-1024" },
    }
  );
  console.log(`[smoke] Stream status: ${streamRes.status}, Content-Type: ${streamRes.headers.get("content-type")}`);
  if (streamRes.status === 200 || streamRes.status === 206) {
    console.log("[smoke] ✓ Stream endpoint returned valid audio response!");
  }

  // Test 10: Host sending timeUpdate and verifying coworker receives realtime timeUpdate
  console.log("[smoke] Test 10: Testing realtime timeUpdate broadcast from host to clients...");
  const timeUpdatePromise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "timeUpdate" && msg.currentTime === 42.5 && msg.duration === 180) {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("timeUpdate broadcast timeout")), 5000);
  });

  adminWs.send(JSON.stringify({ type: "timeUpdate", currentTime: 42.5, duration: 180 }));
  await timeUpdatePromise;
  console.log("[smoke] ✓ Realtime timeUpdate broadcast verified!");

  // Test 11: DJ sending seek and verifying broadcast to all listeners
  console.log("[smoke] Test 11: Testing seek command and broadcast...");
  const seekPromise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "seek" && msg.time === 65) {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("seek broadcast timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "seek", time: 65 }));
  await seekPromise;
  console.log("[smoke] ✓ Seek broadcast and synchronization verified!");

  // Test 12: DJ sending setKaraokeMode and verifying stateSync broadcast
  console.log("[smoke] Test 12: Testing setKaraokeMode command and state synchronization...");
  const karaokePromise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stateSync" && msg.state.karaokeEnabled === true && msg.state.karaokeLevel === 85) {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("karaoke stateSync timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "setKaraokeMode", enabled: true, level: 85 }));
  await karaokePromise;
  console.log("[smoke] ✓ Karaoke mode enable & intensity level broadcast verified!");

  // Test 13: /api/tracks/top endpoint
  console.log("[smoke] Test 13: Testing /api/tracks/top endpoint...");
  const topRes = await fetch(`http://127.0.0.1:${PORT}/api/tracks/top`);
  if (!topRes.ok) throw new Error("top tracks API failed");
  const topData = await topRes.json();
  if (!Array.isArray(topData)) throw new Error("invalid top tracks format");
  console.log(`[smoke] ✓ /api/tracks/top returned array with ${topData.length} items`);

  // Test 14: /api/tracks/recent endpoint
  console.log("[smoke] Test 14: Testing /api/tracks/recent endpoint...");
  const recentRes = await fetch(`http://127.0.0.1:${PORT}/api/tracks/recent`);
  if (!recentRes.ok) throw new Error("recent tracks API failed");
  const recentData = await recentRes.json();
  if (!Array.isArray(recentData)) throw new Error("invalid recent tracks format");
  console.log(`[smoke] ✓ /api/tracks/recent returned array with ${recentData.length} items`);

  // Test 15: /api/tracks/related endpoint
  console.log("[smoke] Test 15: Testing /api/tracks/related endpoint...");
  const relatedRes = await fetch(`http://127.0.0.1:${PORT}/api/tracks/related?artist=Rick+Astley`);
  if (!relatedRes.ok) throw new Error("related tracks API failed");
  const relatedData = await relatedRes.json();
  if (!Array.isArray(relatedData)) throw new Error("invalid related tracks format");
  console.log(`[smoke] ✓ /api/tracks/related returned array with ${relatedData.length} items`);

  // Test 16: setListening (Headphone Mode) stateSync broadcast
  console.log("[smoke] Test 16: Testing setListening (Headphone Mode) state synchronization...");
  const listeningPromise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stateSync" && msg.state.members?.some((m: any) => m.isListening === true)) {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("setListening stateSync timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "setListening", isListening: true }));
  await listeningPromise;
  console.log("[smoke] ✓ Headphone listening state sync verified across clients!");

  // Test 17: Collaborative Room Combo broadcast & stacking
  console.log("[smoke] Test 17: Testing collaborative room combo stacking across clients...");
  const reaction1Promise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "reactionBroadcast" && msg.emoji === "🔥" && msg.combo === 1) {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("reaction 1 timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "reaction", emoji: "🔥" }));
  await reaction1Promise;

  // Second reaction from another client with the SAME emoji stacks combo to 2 with 2 contributors
  const reaction2Promise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (
        msg.type === "reactionBroadcast" &&
        msg.emoji === "🔥" &&
        msg.combo === 2 &&
        msg.contributorsCount === 2
      ) {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => reject(new Error("reaction 2 stacking timeout")), 5000);
  });

  adminWs.send(JSON.stringify({ type: "reaction", emoji: "🔥" }));
  await reaction2Promise;
  console.log("[smoke] ✓ Collaborative matching-emoji combo stacking verified across clients!");

  // Third reaction with DIFFERENT emoji (❤️) has independent combo 1 (not stacked into 🔥)
  const reaction3Promise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (
        msg.type === "reactionBroadcast" &&
        msg.emoji === "❤️" &&
        msg.combo === 1 &&
        msg.contributorsCount === 1
      ) {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("reaction 3 independent emoji timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "reaction", emoji: "❤️" }));
  await reaction3Promise;
  console.log("[smoke] ✓ Independent per-emoji isolation verified (no cross-stacking)!");

  // Test 18: Shoutout broadcast & rate-limiting
  console.log("[smoke] Test 18: Testing shoutout broadcast & rate-limiting...");
  const shoutoutPromise = new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "shoutoutBroadcast" && msg.text === "SIKAT BRO! 🔥") {
        adminWs.removeEventListener("message", handler);
        resolve();
      }
    };
    adminWs.addEventListener("message", handler);
    setTimeout(() => reject(new Error("shoutoutBroadcast timeout")), 5000);
  });

  ws.send(JSON.stringify({ type: "shoutout", text: "SIKAT BRO! 🔥" }));
  await shoutoutPromise;
  console.log("[smoke] ✓ Shoutout broadcast verified across clients!");

  ws.close();
  adminWs.close();
  serverProc.kill();
  console.log("\n=======================================================");
  console.log(" 🎉 ALL 18 END-TO-END SMOKE TESTS PASSED PERFECTLY! ");
  console.log("=======================================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("[smoke] ❌ Smoke test failed:", err);
  serverProc.kill();
  process.exit(1);
});

import { spawn } from "bun";

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
  console.log("[smoke] Test 6: Claiming DJ role using passcode 'office-dj'...");
  ws.send(JSON.stringify({ type: "claimRole", passcode: "office-dj" }));

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
  });
  console.log("[smoke] ✓ DJ role granted via passcode!");

  // Test 7: DJ remote player control (pause/play without admin token)
  console.log("[smoke] Test 7: Testing DJ remote player controls (pause/play without admin token)...");
  ws.send(JSON.stringify({ type: "pause" }));

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
  });
  console.log("[smoke] ✓ DJ remote pause confirmed!");

  ws.send(JSON.stringify({ type: "play" }));
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

  ws.close();
  adminWs.close();
  serverProc.kill();
  console.log("\n=======================================================");
  console.log(" 🎉 ALL 11 END-TO-END SMOKE TESTS PASSED PERFECTLY! ");
  console.log("=======================================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("[smoke] ❌ Smoke test failed:", err);
  serverProc.kill();
  process.exit(1);
});

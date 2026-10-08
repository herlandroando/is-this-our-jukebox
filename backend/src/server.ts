import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { getAdminToken, verifyAdminToken } from "./adminToken.ts";
import { getLanIPv4 } from "./lan.ts";
import { openBrowser } from "./openBrowser.ts";
import { searchTracks, getRelatedTracks } from "./search/index.ts";
import { resolveStreamUrl, invalidateStreamCache } from "./stream/resolver.ts";
import { getStaticMap } from "./static.ts";
import { wsHub, type WsUserData } from "./ws/server.ts";
import { queueStore } from "./queue/store.ts";
import { getLyrics } from "./lyrics/index.ts";
import { jukeboxDb } from "./db.ts";
import type { AudioProvider } from "./types.ts";

const app = new Hono();

app.use("*", cors());

// API endpoints
app.get("/api/whoami", (c) => {
  const lanIp = getLanIPv4();
  const port = process.env.JUKEBOX_PORT || "3000";
  const publicUrl = queueStore.getPublicUrl();
  const tunnelMode = queueStore.getTunnelMode();
  const allowRemoteAudio = queueStore.getAllowRemoteAudio();
  return c.json({
    lanIp,
    port,
    publicUrl,
    tunnelMode,
    allowRemoteAudio,
  });
});

/**
 * Register or update dynamic public tunnel URL (e.g. from quick tunnel runner or reverse proxy)
 */
app.post("/api/tunnel/register", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "") || c.req.query("token");
  const cfIp = c.req.header("cf-connecting-ip");
  const forwardedFor = c.req.header("x-forwarded-for");
  const isRemote = Boolean(cfIp || forwardedFor);

  // If request originates remotely, require admin token verification
  if (isRemote && (!token || !verifyAdminToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as { url?: string; mode?: string };
  if (typeof body.url === "string" && body.url.trim()) {
    const cleanUrl = body.url.trim().replace(/\/+$/, "");
    const mode = body.mode || (cleanUrl.includes("trycloudflare.com") ? "quick" : "named");
    queueStore.setPublicUrl(cleanUrl, mode);
    console.log(`[tunnel] Registered dynamic public tunnel URL: ${cleanUrl} (${mode})`);
    return c.json({ success: true, publicUrl: cleanUrl, tunnelMode: mode });
  }

  return c.json({ error: "Invalid URL provided" }, 400);
});

app.get("/api/lyrics", async (c) => {
  const title = c.req.query("title") || "";
  const artist = c.req.query("artist") || "";
  const videoId = c.req.query("videoId") || c.req.query("v") || "";
  const duration = parseFloat(c.req.query("duration") || "0");
  if (!title.trim() && !videoId.trim()) {
    return c.json({ synced: false, instrumental: false, lines: [] });
  }
  const lyrics = await getLyrics(title, artist, { duration, videoId });
  return c.json(lyrics);
});

app.get("/api/tracks/top", (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 30)));
  const topTracks = jukeboxDb.getTopTracks(limit);
  return c.json(topTracks);
});

app.get("/api/tracks/recent", (c) => {
  const clientId = c.req.query("clientId") || undefined;
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 30)));
  const recentTracks = jukeboxDb.getRecentTracks(clientId, limit);
  return c.json(recentTracks);
});

app.get("/api/tracks/related", async (c) => {
  const videoId = c.req.query("videoId") || undefined;
  const artist = c.req.query("artist") || undefined;
  const tracks = await getRelatedTracks(videoId, artist);
  return c.json(tracks);
});

app.get("/api/search", async (c) => {
  const q = c.req.query("q") || "";
  const provider = c.req.query("p") as AudioProvider | undefined;
  if (!q.trim() || c.req.raw.signal.aborted) {
    return c.json([]);
  }
  const results = await searchTracks(q, provider, c.req.raw.signal);
  return c.json(results);
});

/**
 * Direct Audio Streaming Proxy:
 * Streams audio directly into HTML5 <audio> tags with Range header support,
 * completely bypassing YouTube iframe embed restrictions!
 */
app.get("/api/stream/:id", async (c) => {
  if (c.req.raw.signal.aborted) {
    return new Response(null, { status: 499 });
  }

  // Check if request is remote and if remote audio streaming is allowed
  const cfIp = c.req.header("cf-connecting-ip");
  const forwardedFor = c.req.header("x-forwarded-for");
  const isRemote = Boolean(cfIp || forwardedFor);
  if (isRemote && !queueStore.getAllowRemoteAudio()) {
    return c.text("Remote headphone streaming is currently paused by Host to conserve bandwidth.", 403);
  }

  const id = c.req.param("id");
  const queryProvider = c.req.query("p") as AudioProvider | undefined;
  const permalink = c.req.query("permalink") || undefined;
  const provider: AudioProvider = id.startsWith("sc:") || queryProvider === "sc" ? "sc" : "yt";

  const streamUrl = await resolveStreamUrl(id, provider, permalink, c.req.raw.signal);
  if (c.req.raw.signal.aborted) {
    return new Response(null, { status: 499 });
  }
  if (!streamUrl) {
    return c.text("Audio stream could not be resolved", 404);
  }

  // Forward Range header if requested by HTML5 player
  const rangeHeader = c.req.header("range");
  const fetchHeaders: HeadersInit = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (rangeHeader) {
    fetchHeaders["Range"] = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(streamUrl, {
      headers: fetchHeaders,
      signal: c.req.raw.signal,
    });

    if (upstreamRes.status >= 400 && upstreamRes.status < 500) {
      invalidateStreamCache(id);
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstreamRes.headers.get("content-type") || "audio/webm");
    responseHeaders.set("Accept-Ranges", "bytes");

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || c.req.raw.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error(`[stream] Error proxying audio stream for ${id}:`, err);
    return c.text("Stream proxy error", 502);
  }
});

// Static assets serving
app.get("*", async (c) => {
  const staticMap = await getStaticMap();
  const urlPath = new URL(c.req.url).pathname;

  const exactAsset = staticMap.assets.get(urlPath);
  if (exactAsset) {
    const headers: Record<string, string> = { "Content-Type": exactAsset.contentType };
    if (urlPath.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else if (urlPath === "/" || urlPath === "/index.html" || exactAsset.contentType.includes("text/html")) {
      headers["Cache-Control"] = "no-cache";
    }
    return new Response(exactAsset.body as unknown as BodyInit, {
      headers,
    });
  }

  // SPA fallback to index.html
  if (staticMap.indexHtml) {
    return new Response(staticMap.indexHtml as unknown as BodyInit, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  return c.text("Jukebox V2 running. Please build frontend dist.", 200);
});

// Start Server
const port = Number(process.env.JUKEBOX_PORT || 3000);
const lanIp = getLanIPv4();
const adminToken = getAdminToken();

const adminUrl = `http://${lanIp}:${port}/#/host?token=${adminToken}`;
const clientUrl = `http://${lanIp}:${port}/`;

const server = Bun.serve<WsUserData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const cfIp = req.headers.get("cf-connecting-ip");
      const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const rawIp = server.requestIP(req)?.address;
      const clientIp = cfIp || forwardedFor || rawIp || "127.0.0.1";
      const token = url.searchParams.get("token");
      const isAdmin = token ? verifyAdminToken(token) : false;

      const upgraded = server.upgrade(req, {
        data: {
          id: randomUUID(),
          ip: clientIp,
          nickname: isAdmin ? "Host DJ 🎧" : "Anonymous",
          role: isAdmin ? "host" : "member",
          isAdmin,
          connectedAt: Date.now(),
        },
      });
      if (upgraded) return undefined;
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      wsHub.handleOpen(ws);
    },
    message(ws, msg) {
      wsHub.handleMessage(ws, msg);
    },
    close(ws) {
      wsHub.handleClose(ws);
    },
  },
});

console.log("\n=======================================================");
console.log(" 🎵  IsThisOurJukebox V2 — Standalone Office Jukebox");
console.log("=======================================================");
console.log(` 🎧 Host URL (DJ / Controls): ${adminUrl}`);
console.log(` 📱 Coworker URL (LAN QR):    ${clientUrl}`);
const activePublic = queueStore.getPublicUrl();
if (activePublic) {
  console.log(` 🌐 Public Tunnel URL:        ${activePublic}/ (${queueStore.getTunnelMode()})`);
}
console.log("=======================================================\n");

// Automatically launch browser to the Host Dashboard
if (process.env.NODE_ENV !== "test") {
  void openBrowser(adminUrl);
}

export default server;

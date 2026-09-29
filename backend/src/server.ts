import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { getAdminToken } from "./adminToken.ts";
import { getLanIPv4 } from "./lan.ts";
import { openBrowser } from "./openBrowser.ts";
import { searchTracks } from "./search/index.ts";
import { resolveStreamUrl } from "./stream/resolver.ts";
import { getStaticMap } from "./static.ts";
import { wsHub, type WsUserData } from "./ws/server.ts";
import { getLyrics } from "./lyrics/index.ts";
import type { AudioProvider } from "./types.ts";

const app = new Hono();

app.use("*", cors());

// API endpoints
app.get("/api/whoami", (c) => {
  const lanIp = getLanIPv4();
  const port = process.env.JUKEBOX_PORT || "3000";
  return c.json({
    lanIp,
    port,
  });
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

app.get("/api/search", async (c) => {
  const q = c.req.query("q") || "";
  const provider = c.req.query("p") as AudioProvider | undefined;
  if (!q.trim()) {
    return c.json([]);
  }
  const results = await searchTracks(q, provider);
  return c.json(results);
});

/**
 * Direct Audio Streaming Proxy:
 * Streams audio directly into HTML5 <audio> tags with Range header support,
 * completely bypassing YouTube iframe embed restrictions!
 */
app.get("/api/stream/:id", async (c) => {
  const id = c.req.param("id");
  const queryProvider = c.req.query("p") as AudioProvider | undefined;
  const provider: AudioProvider = id.startsWith("sc:") || queryProvider === "sc" ? "sc" : "yt";

  const streamUrl = await resolveStreamUrl(id, provider);
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
    });

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
  } catch (err) {
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
    return new Response(exactAsset.body as unknown as BodyInit, {
      headers: { "Content-Type": exactAsset.contentType },
    });
  }

  // SPA fallback to index.html
  if (staticMap.indexHtml) {
    return new Response(staticMap.indexHtml as unknown as BodyInit, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
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
      const clientIp = server.requestIP(req)?.address || "127.0.0.1";
      const token = url.searchParams.get("token");
      const isAdmin = token ? token === adminToken : false;

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
console.log("=======================================================\n");

// Automatically launch browser to the Host Dashboard
if (process.env.NODE_ENV !== "test") {
  void openBrowser(adminUrl);
}

export default server;

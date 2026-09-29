import YTMusic from "ytmusic-api";
import Soundcloud from "soundcloud.ts";
import type { AudioProvider, SearchResult } from "../types.ts";

let ytMusicClient: YTMusic | null = null;
let ytMusicInit: Promise<YTMusic> | null = null;

async function getYTMusic(): Promise<YTMusic> {
  if (ytMusicClient) return ytMusicClient;
  if (!ytMusicInit) {
    ytMusicInit = (async () => {
      const c = new YTMusic();
      await c.initialize();
      ytMusicClient = c;
      return c;
    })();
  }
  return ytMusicInit;
}

let scClient: Soundcloud | null = null;
function getSoundcloud(): Soundcloud {
  if (!scClient) {
    scClient = new Soundcloud();
  }
  return scClient;
}

interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

function pickThumb(thumbs?: Thumbnail[]): string {
  if (!thumbs || thumbs.length === 0) return "";
  let best = thumbs[0];
  for (const t of thumbs) {
    if ((t.width ?? 0) * (t.height ?? 0) > (best.width ?? 0) * (best.height ?? 0)) {
      best = t;
    }
  }
  return best.url;
}

export async function searchYT(query: string): Promise<SearchResult[]> {
  try {
    const yt = await getYTMusic();
    const raw = await yt.search(query);
    const results: SearchResult[] = [];

    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const anyItem = item as any;
      if (anyItem.type !== "SONG" && anyItem.type !== "VIDEO") continue;
      if (!anyItem.videoId) continue;

      const artistName = anyItem.artist?.name || anyItem.artists?.[0]?.name || "Unknown artist";

      results.push({
        id: anyItem.videoId,
        provider: "yt",
        title: anyItem.name || "(untitled)",
        artist: artistName,
        thumbnail: pickThumb(anyItem.thumbnails),
        duration: typeof anyItem.duration === "number" ? anyItem.duration : 0,
      });
    }

    return results;
  } catch (err) {
    console.warn("[search] YouTube search error:", err);
    return [];
  }
}

export async function searchSC(query: string): Promise<SearchResult[]> {
  try {
    const sc = getSoundcloud();
    const res = await sc.tracks.search({ q: query });
    const collection = Array.isArray(res.collection) ? res.collection : [];
    const results: SearchResult[] = [];

    for (const item of collection) {
      if (!item.id || item.streamable === false) continue;
      const permalink = item.permalink_url || "";
      if (!permalink) continue;

      results.push({
        id: `sc:${item.id}`,
        provider: "sc",
        permalink,
        title: item.title || "(untitled)",
        artist: item.user?.username || item.user?.full_name || "Unknown artist",
        thumbnail: item.artwork_url || "",
        duration: Math.max(0, Math.round((item.duration ?? 0) / 1000)),
      });
    }

    return results;
  } catch (err) {
    console.warn("[search] SoundCloud search error:", err);
    return [];
  }
}

export async function searchTracks(query: string, provider?: AudioProvider): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (provider === "sc") {
    return await searchSC(trimmed);
  }
  if (provider === "yt") {
    return await searchYT(trimmed);
  }

  // Combined search: fetch both concurrently
  const [ytResults, scResults] = await Promise.all([
    searchYT(trimmed),
    searchSC(trimmed),
  ]);

  // Interleave results or return YouTube prioritized with SoundCloud
  const combined: SearchResult[] = [];
  const maxLen = Math.max(ytResults.length, scResults.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < ytResults.length) combined.push(ytResults[i]);
    if (i < scResults.length) combined.push(scResults[i]);
  }

  return combined;
}

/**
 * Searches for a fallback track (preferring SoundCloud if YouTube failed, or vice versa).
 */
export async function searchFallback(query: string, failedProvider?: AudioProvider): Promise<SearchResult | null> {
  if (failedProvider === "yt") {
    // Try SoundCloud first
    const sc = await searchSC(query);
    if (sc.length > 0) return sc[0];
  } else {
    // Try YouTube first
    const yt = await searchYT(query);
    if (yt.length > 0) return yt[0];
  }

  // Fallback to whichever is available
  const all = await searchTracks(query);
  return all.length > 0 ? all[0] : null;
}

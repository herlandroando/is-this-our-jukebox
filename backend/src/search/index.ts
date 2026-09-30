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

function pickThumb(thumbs?: any): string {
  if (!thumbs) return "";
  if (typeof thumbs === "string" && thumbs.trim()) return thumbs.trim();
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    let best = thumbs[0];
    for (const t of thumbs) {
      if ((t.width ?? 0) * (t.height ?? 0) > (best.width ?? 0) * (best.height ?? 0)) {
        best = t;
      }
    }
    return best?.url || (typeof best === "string" ? best : "");
  }
  if (typeof thumbs === "object" && thumbs.url) {
    return thumbs.url;
  }
  return "";
}

export async function searchYT(query: string): Promise<SearchResult[]> {
  try {
    const yt = await getYTMusic();
    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    // 1. Primary: searchSongs returns clean, structured song metadata with accurate artist names and durations
    try {
      const songs = await yt.searchSongs(query);
      if (Array.isArray(songs) && songs.length > 0) {
        for (const item of songs) {
          if (!item || !item.videoId || seenIds.has(item.videoId)) continue;
          seenIds.add(item.videoId);

          const artistName = (typeof item.artist === "object" ? item.artist?.name : item.artist) || "";
          const thumb =
            pickThumb(item.thumbnails) ||
            `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;

          results.push({
            id: item.videoId,
            provider: "yt",
            title: item.name || "(untitled)",
            artist: artistName.trim() || "Unknown Artist",
            thumbnail: thumb,
            duration: typeof item.duration === "number" ? item.duration : 0,
          });
        }
      }
    } catch (err) {
      console.warn("[search] yt.searchSongs error:", err);
    }

    // 2. Fallback / supplement with generic search if searchSongs yielded few items (e.g. niche videos/covers)
    if (results.length < 10) {
      try {
        const raw = await yt.search(query);
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const anyItem = item as any;
          if (anyItem.type !== "SONG" && anyItem.type !== "VIDEO") continue;
          if (!anyItem.videoId || seenIds.has(anyItem.videoId)) continue;
          seenIds.add(anyItem.videoId);

          let rawArtist = "";
          if (typeof anyItem.artists === "string") {
            rawArtist = anyItem.artists;
          } else if (Array.isArray(anyItem.artists)) {
            rawArtist = anyItem.artists.map((a: any) => (typeof a === "string" ? a : a.name)).filter(Boolean).join(", ");
          } else if (anyItem.artists && typeof anyItem.artists === "object") {
            rawArtist = anyItem.artists.name || "";
          } else if (anyItem.artist) {
            rawArtist = typeof anyItem.artist === "string" ? anyItem.artist : anyItem.artist.name || "";
          }

          const isDurationString = /^\d+:\d{2}(:\d{2})?$/.test(rawArtist.trim());
          let artistName = (!rawArtist || isDurationString) ? "" : rawArtist.trim();

          const trackTitle = anyItem.name || anyItem.title || "(untitled)";
          if (!artistName && trackTitle.includes(" - ")) {
            const parts = trackTitle.split(" - ");
            if (parts.length >= 2 && parts[0].trim().length > 1) {
              artistName = parts[0].trim();
            }
          }

          if (!artistName) {
            artistName = "Unknown Artist";
          }

          let duration = 0;
          if (typeof anyItem.duration === "number") {
            duration = anyItem.duration;
          } else if (typeof anyItem.duration === "string") {
            const parts = anyItem.duration.trim().split(":").map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              duration = parts[0] * 60 + parts[1];
            } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
              duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }
          if (duration === 0 && isDurationString) {
            const parts = rawArtist.trim().split(":").map(Number);
            if (parts.length === 2) duration = parts[0] * 60 + parts[1];
            else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }

          let thumb =
            pickThumb(anyItem.thumbnail) ||
            pickThumb(anyItem.thumbnails) ||
            `https://i.ytimg.com/vi/${anyItem.videoId}/hqdefault.jpg`;

          results.push({
            id: anyItem.videoId,
            provider: "yt",
            title: trackTitle,
            artist: artistName,
            thumbnail: thumb,
            duration,
          });
        }
      } catch (err) {
        console.warn("[search] YouTube generic search fallback error:", err);
      }
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

export async function searchTracks(query: string, provider?: AudioProvider, signal?: AbortSignal): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || signal?.aborted) return [];

  if (provider === "sc") {
    const res = await searchSC(trimmed);
    return signal?.aborted ? [] : res;
  }
  if (provider === "yt") {
    const res = await searchYT(trimmed);
    return signal?.aborted ? [] : res;
  }

  // Combined search: fetch both concurrently
  const [ytResults, scResults] = await Promise.all([
    searchYT(trimmed),
    searchSC(trimmed),
  ]);

  if (signal?.aborted) return [];

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

interface CachedRelated {
  timestamp: number;
  tracks: SearchResult[];
}

const relatedCache = new Map<string, CachedRelated>();
const RELATED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
const MAX_RELATED_CACHE_SIZE = 150;

export function clearRelatedCache() {
  relatedCache.clear();
}

/**
 * Retrieves related / recommended tracks for a given videoId or artist.
 */
export async function getRelatedTracks(videoId?: string, artist?: string): Promise<SearchResult[]> {
  const cacheKey = `${videoId || ""}:${artist || ""}`;
  if (cacheKey !== ":") {
    const cached = relatedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < RELATED_CACHE_TTL_MS) {
      relatedCache.delete(cacheKey);
      relatedCache.set(cacheKey, cached);
      return [...cached.tracks];
    }
  }

  const cacheAndReturn = (tracks: SearchResult[]): SearchResult[] => {
    if (tracks.length > 0 && cacheKey !== ":") {
      if (relatedCache.has(cacheKey)) {
        relatedCache.delete(cacheKey);
      } else if (relatedCache.size >= MAX_RELATED_CACHE_SIZE) {
        const oldestKey = relatedCache.keys().next().value;
        if (oldestKey) relatedCache.delete(oldestKey);
      }
      relatedCache.set(cacheKey, {
        timestamp: Date.now(),
        tracks: [...tracks],
      });
    }
    return tracks;
  };

  const results: SearchResult[] = [];

  if (videoId && !videoId.startsWith("sc:")) {
    try {
      const yt = await getYTMusic();
      const upNexts = await yt.getUpNexts(videoId);
      if (Array.isArray(upNexts)) {
        for (const item of upNexts) {
          if (!item || typeof item !== "object") continue;
          const anyItem = item as any;
          if (!anyItem.videoId) continue;

          let rawArtist = "";
          if (typeof anyItem.artists === "string") {
            rawArtist = anyItem.artists;
          } else if (Array.isArray(anyItem.artists)) {
            rawArtist = anyItem.artists.map((a: any) => (typeof a === "string" ? a : a.name)).filter(Boolean).join(", ");
          } else if (anyItem.artists && typeof anyItem.artists === "object") {
            rawArtist = anyItem.artists.name || "";
          } else if (anyItem.artist) {
            rawArtist = typeof anyItem.artist === "string" ? anyItem.artist : anyItem.artist.name || "";
          }

          const isDurationString = /^\d+:\d{2}(:\d{2})?$/.test(rawArtist.trim());
          let artistName = (!rawArtist || isDurationString) ? (artist && artist !== "YouTube Music" ? artist : "") : rawArtist.trim();

          // Duration parsing (supports number or string like "4:48")
          let duration = 0;
          if (typeof anyItem.duration === "number") {
            duration = anyItem.duration;
          } else if (typeof anyItem.duration === "string") {
            const parts = anyItem.duration.trim().split(":").map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              duration = parts[0] * 60 + parts[1];
            } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
              duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }
          if (duration === 0 && isDurationString) {
            const parts = rawArtist.trim().split(":").map(Number);
            if (parts.length === 2) duration = parts[0] * 60 + parts[1];
            else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }

          const trackTitle = anyItem.title || anyItem.name || "(untitled)";
          if ((!rawArtist || isDurationString || !artistName || artistName === "YouTube Music") && trackTitle.includes(" - ")) {
            const parts = trackTitle.split(" - ");
            if (parts.length >= 2 && parts[0].trim().length > 1) {
              artistName = parts[0].trim();
            }
          }

          if (!artistName || artistName === "YouTube Music") {
            artistName = artist && artist !== "YouTube Music" ? artist : "Unknown Artist";
          }

          // Thumbnail with robust fallbacks
          const thumb =
            pickThumb(anyItem.thumbnail) ||
            pickThumb(anyItem.thumbnails) ||
            `https://i.ytimg.com/vi/${anyItem.videoId}/hqdefault.jpg`;

          results.push({
            id: anyItem.videoId,
            provider: "yt",
            title: trackTitle,
            artist: artistName,
            thumbnail: thumb,
            duration,
          });
        }
      }
      if (results.length > 0) {
        return cacheAndReturn(results.slice(0, 20));
      }
    } catch (err) {
      console.warn("[search] getUpNexts error, falling back to artist search:", err);
    }
  }

  // Fallback: If artist is provided, search for their songs
  if (artist && artist !== "YouTube Music" && artist !== "Unknown artist") {
    try {
      const yt = await getYTMusic();
      const songs = await yt.searchSongs(artist);
      if (Array.isArray(songs) && songs.length > 0) {
        for (const item of songs) {
          if (!item || !item.videoId) continue;
          results.push({
            id: item.videoId,
            provider: "yt",
            title: item.name || "(untitled)",
            artist: (typeof item.artist === "object" ? item.artist.name : item.artist) || artist,
            thumbnail: pickThumb(item.thumbnails) || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
            duration: typeof item.duration === "number" ? item.duration : 0,
          });
        }
        if (results.length > 0) {
          return cacheAndReturn(results.slice(0, 15));
        }
      }
    } catch (err) {
      console.warn("[search] yt.searchSongs fallback error:", err);
    }

    try {
      const query = `${artist} hits`;
      const fallbackResults = await searchYT(query);
      if (fallbackResults.length > 0) {
        return cacheAndReturn(fallbackResults.slice(0, 15));
      }
    } catch (err) {
      console.warn("[search] related artist search error:", err);
    }
  }

  return [];
}

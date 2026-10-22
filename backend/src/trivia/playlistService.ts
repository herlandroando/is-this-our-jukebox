import type { SearchResult } from "../types.ts";
import { getYTMusic } from "../search/index.ts";
import { jukeboxDb } from "../db.ts";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

export function parsePlaylistId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // If it's a URL
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const parsedUrl = new URL(trimmed);
      const listParam = parsedUrl.searchParams.get("list");
      if (listParam) return listParam;
    }
  } catch {}

  // Match list=... query regex if not parsed by URL constructor
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Raw playlist ID format (usually starts with PL, RDCLAK5uy, OLAK5uy, etc., at least 10 chars)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function cleanTrackTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[\{][^\)\]\}]*(?:official|video|audio|lyric|clip|remaster|visualizer|mv|live)[^\)\]\}]*[\)\]\}]/gi, "")
    .replace(/\s*[\(\[\{][^\)\]\}]*$/g, "") // remove dangling opening paren/bracket
    .replace(/\s*ft\..*$/i, "")
    .replace(/\s*feat\..*$/i, "")
    .trim();
}

export async function fetchPlaylistSongs(
  playlistIdOrUrl: string,
  forceRefresh = false,
  presetId?: string,
  maxTracks = 50
): Promise<SearchResult[]> {
  const cleanId = parsePlaylistId(playlistIdOrUrl);
  if (!cleanId) {
    console.warn(`[trivia-playlist] Invalid playlist ID or URL: "${playlistIdOrUrl}"`);
    return [];
  }

  // 1. Check SQLite cache if presetId or cleanId is available
  const targetId = presetId || cleanId;
  if (!forceRefresh) {
    const cached = jukeboxDb.getPresetCachedSongs(targetId);
    if (cached && Date.now() - cached.lastSyncedAt < CACHE_TTL_MS) {
      try {
        const parsed = JSON.parse(cached.cachedSongsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }
  }

  // 2. Fetch fresh from YouTube Music with timeout
  try {
    const yt = await getYTMusic();
    const fetchPromise = yt.getPlaylistVideos(cleanId);
    const timeoutPromise = new Promise<any[]>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout mengambil playlist YouTube")), 5000)
    );
    const videos = await Promise.race([fetchPromise, timeoutPromise]);

    if (!Array.isArray(videos) || videos.length === 0) {
      console.warn(`[trivia-playlist] No videos found in playlist: ${cleanId}`);
      return [];
    }

    const results: SearchResult[] = [];
    const seenIds = new Set<string>();
    const limit = maxTracks > 0 ? maxTracks : 150;

    for (const v of videos) {
      if (results.length >= limit) break;
      if (!v || !v.videoId || seenIds.has(v.videoId)) continue;
      const dur = v.duration || 0;

      // Filter out tracks shorter than 50s or longer than 10 minutes (blocks 1-hour loops / DJ mixes / full albums)
      if (dur > 0 && (dur < 50 || dur > 600)) continue;

      const rawArtist = (typeof v.artist === "object" ? v.artist?.name : v.artist) || "";
      const cleanedTitle = cleanTrackTitle(v.name || "");
      if (!cleanedTitle) continue;

      seenIds.add(v.videoId);

      let thumb = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      if (Array.isArray(v.thumbnails) && v.thumbnails.length > 0) {
        thumb = v.thumbnails[v.thumbnails.length - 1].url || thumb;
      }

      results.push({
        id: v.videoId,
        provider: "yt",
        title: cleanedTitle,
        artist: rawArtist.trim() || "Various Artists",
        thumbnail: thumb,
        duration: dur || 180,
      });
    }

    // 3. Save to cache
    if (results.length > 0) {
      jukeboxDb.updatePresetCache(targetId, JSON.stringify(results), Date.now());
      console.log(`[trivia-playlist] Successfully synced ${results.length} tracks for playlist "${cleanId}" (Target: ${targetId})`);
    }

    return results;
  } catch (err) {
    console.error(`[trivia-playlist] Error fetching playlist ${cleanId}:`, err);

    // Fallback to expired cache if available
    const fallback = jukeboxDb.getPresetCachedSongs(targetId);
    if (fallback) {
      try {
        return JSON.parse(fallback.cachedSongsJson);
      } catch {}
    }

    return [];
  }
}

export async function previewPlaylist(urlOrId: string): Promise<{
  valid: boolean;
  id?: string;
  count: number;
  sampleTracks: Array<{ title: string; artist: string }>;
}> {
  const cleanId = parsePlaylistId(urlOrId);
  if (!cleanId) return { valid: false, count: 0, sampleTracks: [] };

  try {
    const songs = await fetchPlaylistSongs(cleanId, false);
    return {
      valid: songs.length > 0,
      id: cleanId,
      count: songs.length,
      sampleTracks: songs.slice(0, 5).map((s) => ({ title: s.title, artist: s.artist })),
    };
  } catch (err) {
    return { valid: false, count: 0, sampleTracks: [] };
  }
}

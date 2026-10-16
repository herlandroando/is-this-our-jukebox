import Soundcloud from "soundcloud.ts";
import type { AudioProvider, SearchResult } from "../types.ts";

interface CachedStream {
  url: string;
  provider: AudioProvider;
  expiresAt: number;
}

export const MAX_STREAM_CACHE_SIZE = 150;
export const streamCache = new Map<string, CachedStream>();

export function addToStreamCache(id: string, entry: CachedStream) {
  if (streamCache.has(id)) {
    streamCache.delete(id);
  } else if (streamCache.size >= MAX_STREAM_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, value] of streamCache) {
      if (value.expiresAt <= now) {
        streamCache.delete(key);
      }
    }
    if (streamCache.size >= MAX_STREAM_CACHE_SIZE) {
      const oldestKey = streamCache.keys().next().value;
      if (oldestKey) streamCache.delete(oldestKey);
    }
  }
  streamCache.set(id, entry);
}

export function invalidateStreamCache(id: string) {
  streamCache.delete(id);
}

function getSoundcloudClass(): typeof Soundcloud {
  const mod: any = Soundcloud;
  return mod.default?.default || mod.Soundcloud || mod.default || mod;
}

// Cache soundcloud client instance
let scInstance: Soundcloud | null = null;
function getSoundCloud(): Soundcloud {
  if (!scInstance) {
    const ScClass = getSoundcloudClass();
    scInstance = new ScClass();
  }
  return scInstance;
}

let memoizedYtDlpPrefix: string[] | null = null;

/**
 * Executes yt-dlp to get a direct playable audio stream URL.
 */
async function resolveYouTubeUrl(videoId: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Try memoized prefix first if available; otherwise try known command prefixes
  const candidatePrefixes: string[][] = memoizedYtDlpPrefix
    ? [memoizedYtDlpPrefix]
    : [
        ["yt-dlp"],
        ["python", "-m", "yt_dlp"],
        ["py", "-3", "-m", "yt_dlp"],
      ];

  for (const prefix of candidatePrefixes) {
    if (signal?.aborted) return null;
    try {
      // Prioritize m4a/aac (format 140) for universal native browser <audio> compatibility
      const cmd = [...prefix, "-g", "-f", "ba[ext=m4a]/ba[vcodec=none][acodec^=mp4a]/ba/b", ytUrl];
      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "ignore",
      });

      const onAbort = () => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      };
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const text = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }

      if (signal?.aborted) return null;

      if (exitCode === 0 && text.trim().startsWith("http")) {
        memoizedYtDlpPrefix = prefix;
        const streamUrl = text.trim().split("\n")[0].trim();
        return streamUrl;
      }
    } catch {
      // try next command variant
    }
  }

  if (signal?.aborted) return null;

  // If the previously memoized prefix failed, invalidate and retry all variants once
  if (memoizedYtDlpPrefix) {
    memoizedYtDlpPrefix = null;
    return resolveYouTubeUrl(videoId, signal);
  }

  return null;
}

/**
 * Resolves a SoundCloud direct audio stream URL or progressive stream.
 */
async function resolveSoundCloudUrl(trackIdOrUrl: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  try {
    const sc = getSoundCloud();
    let url = trackIdOrUrl;
    if (trackIdOrUrl.startsWith("sc:")) {
      const id = trackIdOrUrl.slice(3);
      const track = await sc.tracks.get(Number(id));
      if (track?.permalink_url) {
        url = track.permalink_url;
      }
    }
    
    // 1. Try direct progressive stream link first
    try {
      const progressive = await sc.util.streamLink(url, "progressive");
      if (progressive && progressive.startsWith("http")) {
        return progressive;
      }
    } catch {
      // progressive not available, proceed to fallback
    }

    // 2. Try yt-dlp to extract stream for SoundCloud URL
    const candidatePrefixes: string[][] = memoizedYtDlpPrefix
      ? [memoizedYtDlpPrefix]
      : [
          ["yt-dlp"],
          ["python", "-m", "yt_dlp"],
          ["py", "-3", "-m", "yt_dlp"],
        ];

    for (const prefix of candidatePrefixes) {
      if (signal?.aborted) return null;
      try {
        const cmd = [...prefix, "-g", url];
        const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
        const onAbort = () => {
          try {
            proc.kill();
          } catch {
            // ignore
          }
        };
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        const text = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (signal) signal.removeEventListener("abort", onAbort);
        if (signal?.aborted) return null;

        if (exitCode === 0 && text.trim().startsWith("http")) {
          memoizedYtDlpPrefix = prefix;
          return text.trim().split("\n")[0].trim();
        }
      } catch {
        // try next command variant
      }
    }

    // 3. Fallback to HLS stream link
    try {
      const hls = await sc.util.streamLink(url, "hls");
      if (hls && hls.startsWith("http")) {
        return hls;
      }
    } catch {
      // ignore
    }

    return null;
  } catch (err) {
    console.warn(`[resolver] SoundCloud resolve failed for ${trackIdOrUrl}:`, err);
    return null;
  }
}

/**
 * Main stream resolver with caching.
 */
export async function resolveStreamUrl(
  id: string,
  provider: AudioProvider,
  permalink?: string,
  signal?: AbortSignal,
  forceFresh?: boolean
): Promise<string | null> {
  if (signal?.aborted) return null;

  if (!forceFresh) {
    const cached = streamCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      // Refresh LRU order on hit
      streamCache.delete(id);
      streamCache.set(id, cached);
      return cached.url;
    }
  } else {
    streamCache.delete(id);
  }

  let resolvedUrl: string | null = null;

  if (provider === "sc") {
    resolvedUrl = await resolveSoundCloudUrl(permalink || id, signal);
  } else {
    resolvedUrl = await resolveYouTubeUrl(id, signal);
  }

  if (signal?.aborted) return null;

  if (resolvedUrl) {
    // Cache for 45 minutes with bounded size
    addToStreamCache(id, {
      url: resolvedUrl,
      provider,
      expiresAt: Date.now() + 45 * 60 * 1000,
    });
  }

  return resolvedUrl;
}

/**
 * Pre-verifies a track's stream in the background.
 * If resolution fails, it searches for a fallback alternative.
 */
export async function preResolveTrack(
  track: SearchResult,
  searchAlternative: (query: string) => Promise<SearchResult | null>
): Promise<{ success: boolean; fallbackTrack?: SearchResult }> {
  try {
    const streamUrl = await resolveStreamUrl(track.id, track.provider, track.permalink);
    if (streamUrl) {
      return { success: true };
    }
  } catch (e) {
    console.warn(`[resolver] Pre-resolve failed for ${track.title}:`, e);
  }

  // If primary stream resolution failed, search for an alternative
  console.log(`[resolver] Attempting fallback search for: ${track.title} - ${track.artist}`);
  const query = `${track.title} ${track.artist}`.trim();
  const alt = await searchAlternative(query);

  if (alt && alt.id !== track.id) {
    const altStream = await resolveStreamUrl(alt.id, alt.provider, alt.permalink);
    if (altStream) {
      console.log(`[resolver] Successfully found pre-resolved fallback: ${alt.title} (${alt.provider})`);
      return { success: true, fallbackTrack: alt };
    }
  }

  return { success: false };
}

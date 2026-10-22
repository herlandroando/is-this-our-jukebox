import { existsSync } from "fs";
import Soundcloud from "soundcloud.ts";
import type { AudioProvider, SearchResult } from "../types.ts";
import { getCookiesFilePath } from "../auth/youtubeLogin.ts";

interface CachedStream {
  url: string;
  provider: AudioProvider;
  expiresAt: number;
}

export const MAX_STREAM_CACHE_SIZE = 150;
export const streamCache = new Map<string, CachedStream>();
const inFlightResolutions = new Map<string, Promise<string | null>>();

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

export function clearAllStreamCache() {
  streamCache.clear();
  inFlightResolutions.clear();
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

const CANDIDATE_PREFIXES: string[][] = [
  ["yt-dlp"],
  ["python", "-m", "yt_dlp"],
  ["py", "-3", "-m", "yt_dlp"],
];

let memoizedYtDlpPrefix: string[] | null = null;
let ytDlpPrefixPromise: Promise<string[] | null> | null = null;

/**
 * Discovers and memoizes the working command prefix for yt-dlp.
 */
export async function getYtDlpPrefix(): Promise<string[] | null> {
  if (memoizedYtDlpPrefix) return memoizedYtDlpPrefix;
  if (!ytDlpPrefixPromise) {
    ytDlpPrefixPromise = (async () => {
      for (const prefix of CANDIDATE_PREFIXES) {
        try {
          const proc = Bun.spawn([...prefix, "--version"], {
            stdout: "ignore",
            stderr: "ignore",
          });
          const code = await proc.exited;
          if (code === 0) {
            memoizedYtDlpPrefix = prefix;
            return prefix;
          }
        } catch {
          // ignore candidate failure
        }
      }
      return null;
    })();
  }
  const result = await ytDlpPrefixPromise;
  if (!result) ytDlpPrefixPromise = null;
  return result;
}

/**
 * Spawns yt-dlp with the specified arguments and returns the first stream URL line.
 */
async function spawnYtDlpExtract(
  prefix: string[],
  args: string[],
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) return null;
  try {
    const proc = Bun.spawn([...prefix, ...args], {
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
      return text.trim().split("\n")[0].trim();
    }
  } catch {
    // ignore process spawn errors
  }
  return null;
}

/**
 * Executes yt-dlp to get a direct playable audio stream URL.
 * 
 * Uses a 2-Pass Hybrid Resolution strategy:
 * Pass 1 (Primary): Clean stream without cookies.
 *   - Requests format 140 (audio/m4a AAC) with EJS challenge solver.
 *   - Bypasses YouTube's authenticated web SABR-only experiment (which otherwise forces format 18 video/mp4 and causes 403 Forbidden).
 * Pass 2 (Authenticated Fallback): Uses cookies.txt.
 *   - Triggered only if Pass 1 fails and cookies file exists (e.g. for age-restricted or members-only videos).
 */
async function resolveYouTubeUrl(videoId: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  const prefix = await getYtDlpPrefix();
  if (!prefix) return null;

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const baseAudioFormat = "ba[ext=m4a]/ba[vcodec=none][acodec^=mp4a]/ba/b";

  // Pass 1: Clean stream without cookies (format 140 audio/m4a)
  const pass1Args = [
    "--remote-components", "ejs:github",
    "--js-runtimes", "node",
    "-g",
    "-f", baseAudioFormat,
    ytUrl,
  ];

  const cleanUrl = await spawnYtDlpExtract(prefix, pass1Args, signal);
  if (cleanUrl) {
    return cleanUrl;
  }

  if (signal?.aborted) return null;

  // Pass 2: Authenticated fallback with cookies (if available and Pass 1 failed)
  const cookieFile = getCookiesFilePath();
  if (existsSync(cookieFile)) {
    const pass2Args = [
      "--cookies", cookieFile,
      "--remote-components", "ejs:github",
      "--js-runtimes", "node",
      "-g",
      "-f", baseAudioFormat,
      ytUrl,
    ];

    const authUrl = await spawnYtDlpExtract(prefix, pass2Args, signal);
    if (authUrl) {
      return authUrl;
    }
  }

  // If failed with memoized prefix, invalidate memoization once to allow re-detecting
  if (memoizedYtDlpPrefix) {
    memoizedYtDlpPrefix = null;
    ytDlpPrefixPromise = null;
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
    const prefix = await getYtDlpPrefix();
    if (prefix && !signal?.aborted) {
      const streamUrl = await spawnYtDlpExtract(prefix, ["-g", url], signal);
      if (streamUrl) {
        return streamUrl;
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
 * Main stream resolver with caching and in-flight Promise deduplication.
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

  // Deduplicate in-flight resolutions for identical stream requests
  const flightKey = `${provider}:${id}`;
  let resolutionPromise = inFlightResolutions.get(flightKey);

  if (!resolutionPromise || forceFresh) {
    resolutionPromise = (async () => {
      try {
        let resolvedUrl: string | null = null;
        if (provider === "sc") {
          resolvedUrl = await resolveSoundCloudUrl(permalink || id);
        } else {
          resolvedUrl = await resolveYouTubeUrl(id);
        }

        // Reject HLS/m3u8 manifest URLs since native HTML5 <audio> on Chromium desktop cannot decode them
        if (resolvedUrl && (resolvedUrl.includes(".m3u8") || resolvedUrl.includes("/hls/"))) {
          console.warn(`[resolver] Filtered out HLS stream for ${id}: progressive audio stream required`);
          resolvedUrl = null;
        }

        if (resolvedUrl) {
          // Cache for 45 minutes with bounded size
          addToStreamCache(id, {
            url: resolvedUrl,
            provider,
            expiresAt: Date.now() + 45 * 60 * 1000,
          });
        }

        return resolvedUrl;
      } finally {
        inFlightResolutions.delete(flightKey);
      }
    })();

    inFlightResolutions.set(flightKey, resolutionPromise);
  }

  if (signal) {
    if (signal.aborted) return null;
    return await Promise.race([
      resolutionPromise,
      new Promise<null>((resolve) => {
        signal.addEventListener("abort", () => resolve(null), { once: true });
      }),
    ]);
  }

  return await resolutionPromise;
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

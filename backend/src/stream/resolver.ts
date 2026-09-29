import Soundcloud from "soundcloud.ts";
import type { AudioProvider, SearchResult } from "../types.ts";

interface CachedStream {
  url: string;
  provider: AudioProvider;
  expiresAt: number;
}

const streamCache = new Map<string, CachedStream>();

// Cache soundcloud client instance
let scInstance: Soundcloud | null = null;
function getSoundCloud(): Soundcloud {
  if (!scInstance) {
    scInstance = new Soundcloud();
  }
  return scInstance;
}

/**
 * Executes yt-dlp to get a direct playable audio stream URL.
 */
async function resolveYouTubeUrl(videoId: string): Promise<string | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Try running python -m yt_dlp or yt-dlp
  const commands = [
    ["yt-dlp", "-g", "-f", "ba/b", ytUrl],
    ["python", "-m", "yt_dlp", "-g", "-f", "ba/b", ytUrl],
    ["py", "-3", "-m", "yt_dlp", "-g", "-f", "ba/b", ytUrl],
  ];

  for (const cmd of commands) {
    try {
      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "ignore",
      });

      const text = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode === 0 && text.trim().startsWith("http")) {
        const streamUrl = text.trim().split("\n")[0].trim();
        return streamUrl;
      }
    } catch {
      // try next command variant
    }
  }

  return null;
}

/**
 * Resolves a SoundCloud direct audio stream URL or progressive stream.
 */
async function resolveSoundCloudUrl(trackIdOrUrl: string): Promise<string | null> {
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
    
    // Resolve stream
    const stream = await sc.util.streamTrack(url);
    if (stream && (stream as any).url) {
      return (stream as any).url;
    }
    return url;
  } catch (err) {
    console.warn(`[resolver] SoundCloud resolve failed for ${trackIdOrUrl}:`, err);
    return null;
  }
}

/**
 * Main stream resolver with caching.
 */
export async function resolveStreamUrl(id: string, provider: AudioProvider, permalink?: string): Promise<string | null> {
  const cached = streamCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  let resolvedUrl: string | null = null;

  if (provider === "sc") {
    resolvedUrl = await resolveSoundCloudUrl(permalink || id);
  } else {
    resolvedUrl = await resolveYouTubeUrl(id);
  }

  if (resolvedUrl) {
    // Cache for 45 minutes
    streamCache.set(id, {
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

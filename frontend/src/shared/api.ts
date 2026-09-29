import type { AudioProvider, LyricsData, SearchResult } from "./types.ts";

export interface WhoamiResponse {
  lanIp: string;
  port: string;
}

export async function whoami(): Promise<WhoamiResponse> {
  const res = await fetch("/api/whoami");
  if (!res.ok) throw new Error(`whoami failed: ${res.statusText}`);
  return await res.json();
}

export async function searchTracks(query: string, provider?: AudioProvider, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (provider) params.set("p", provider);

  const res = await fetch(`/api/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`search failed: ${res.statusText}`);
  return await res.json();
}

export async function fetchLyrics(
  title: string,
  artist: string,
  options?: { duration?: number; videoId?: string },
  signal?: AbortSignal
): Promise<LyricsData> {
  const params = new URLSearchParams({ title, artist });
  if (options?.duration && options.duration > 0) {
    params.set("duration", Math.round(options.duration).toString());
  }
  if (options?.videoId) {
    params.set("videoId", options.videoId);
  }
  const res = await fetch(`/api/lyrics?${params.toString()}`, { signal });
  if (!res.ok) return { synced: false, instrumental: false, lines: [] };
  return await res.json();
}

export function getStreamUrl(id: string, provider: AudioProvider): string {
  return `/api/stream/${encodeURIComponent(id)}?p=${encodeURIComponent(provider)}`;
}

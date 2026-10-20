import type { AudioProvider, LyricsData, SearchResult, TopTrackResult } from "./types.ts";

export interface WhoamiResponse {
  lanIp: string;
  port: string;
  publicUrl?: string | null;
  tunnelMode?: string;
  allowRemoteAudio?: boolean;
}

export async function whoami(): Promise<WhoamiResponse> {
  const res = await fetch("/api/whoami");
  if (!res.ok) throw new Error(`whoami failed: ${res.statusText}`);
  return await res.json();
}

export async function getTopTracks(limit: number = 30): Promise<TopTrackResult[]> {
  const res = await fetch(`/api/tracks/top?limit=${limit}`);
  if (!res.ok) throw new Error(`getTopTracks failed: ${res.statusText}`);
  return await res.json();
}

export async function getRecentTracks(clientId?: string, limit: number = 30): Promise<SearchResult[]> {
  const url = clientId
    ? `/api/tracks/recent?clientId=${encodeURIComponent(clientId)}&limit=${limit}`
    : `/api/tracks/recent?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getRecentTracks failed: ${res.statusText}`);
  return await res.json();
}

export async function getRelatedTracks(
  videoId?: string,
  artist?: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  if (videoId) params.set("videoId", videoId);
  if (artist) params.set("artist", artist);
  const res = await fetch(`/api/tracks/related?${params.toString()}`, { signal });
  if (!res.ok) return [];
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

export function getStreamUrl(id: string, provider: AudioProvider, permalink?: string): string {
  let url = `/api/stream/${encodeURIComponent(id)}?p=${encodeURIComponent(provider)}`;
  if (permalink) {
    url += `&permalink=${encodeURIComponent(permalink)}`;
  }
  return url;
}

// --- Rhythm Game API Helpers ---

export async function fetchBeatmap(
  trackId: string,
  difficulty: "easy" | "normal" | "hard" = "normal",
  duration?: number
): Promise<import("./types.ts").RhythmBeatmap> {
  const params = new URLSearchParams({ difficulty });
  if (duration && duration > 0) {
    params.set("duration", duration.toString());
  }
  const res = await fetch(`/api/rhythm/beatmap/${encodeURIComponent(trackId)}?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load beatmap: ${res.statusText}`);
  return await res.json();
}

export async function fetchTrackLeaderboard(
  trackId: string,
  limit: number = 10
): Promise<import("./types.ts").RhythmScoreEntry[]> {
  const res = await fetch(`/api/rhythm/leaderboard/${encodeURIComponent(trackId)}?limit=${limit}`);
  if (!res.ok) return [];
  return await res.json();
}

export async function fetchAllRankedSongs(
  searchQuery: string = "",
  limit: number = 50
): Promise<import("./types.ts").RankedSongSummary[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (searchQuery.trim()) {
    params.set("q", searchQuery.trim());
  }
  const res = await fetch(`/api/rhythm/leaderboard/songs?${params.toString()}`);
  if (!res.ok) return [];
  return await res.json();
}

export async function fetchGlobalRankings(
  limit: number = 20
): Promise<import("./types.ts").GlobalUserRanking[]> {
  const res = await fetch(`/api/rhythm/leaderboard/global?limit=${limit}`);
  if (!res.ok) return [];
  return await res.json();
}

export async function submitRhythmScore(
  data: import("./types.ts").RhythmScoreSubmission
): Promise<{ success: boolean; entry: import("./types.ts").RhythmScoreEntry; isNewRecord: boolean }> {
  const res = await fetch("/api/rhythm/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Submission failed" }));
    throw new Error(err.error || "Failed to submit score");
  }
  return await res.json();
}

export async function getYouTubeAuthStatus(): Promise<import("./types.ts").YouTubeCookieStatus> {
  const res = await fetch("/api/auth/youtube/status");
  if (!res.ok) return { hasCookies: false, isLoggedIn: false, loginInProgress: false };
  return await res.json();
}

export async function startYouTubeLogin(): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/auth/youtube/start-login", { method: "POST" });
  return await res.json();
}

export async function cancelYouTubeLogin(): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/youtube/cancel-login", { method: "POST" });
  return await res.json();
}

export async function deleteYouTubeCookies(): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/youtube/cookies", { method: "DELETE" });
  return await res.json();
}

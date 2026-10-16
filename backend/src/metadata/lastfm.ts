/**
 * Last.fm Non-Commercial Client
 * Compliant with Last.fm API Terms of Service for non-commercial software:
 * - Reads LASTFM_API_KEY from environment variables
 * - Fetches community-curated tags (moods, genres, acoustic styles)
 * - Returns empty array if no API key is provided
 */

export async function fetchLastFmTags(title: string, artist: string): Promise<string[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return [];
  }

  const tags: string[] = [];

  try {
    // 1. Try track.getTopTags
    const trackUrl = `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&api_key=${encodeURIComponent(apiKey)}&format=json`;
    const res = await fetch(trackUrl, { signal: AbortSignal.timeout(3000) });

    if (res.ok) {
      const data: any = await res.json();
      const rawTags = data?.toptags?.tag;
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          if (t?.name) tags.push(t.name.toLowerCase().trim());
        }
      }
    }

    // 2. Fallback to artist.getTopTags if track has few/no tags
    if (tags.length === 0 && artist) {
      const artistUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artist)}&api_key=${encodeURIComponent(apiKey)}&format=json`;
      const artistRes = await fetch(artistUrl, { signal: AbortSignal.timeout(3000) });
      if (artistRes.ok) {
        const artistData: any = await artistRes.json();
        const rawArtistTags = artistData?.toptags?.tag;
        if (Array.isArray(rawArtistTags)) {
          for (const t of rawArtistTags) {
            if (t?.name) tags.push(t.name.toLowerCase().trim());
          }
        }
      }
    }
  } catch (err) {
    console.warn("[lastfm] Tags lookup failed:", err);
  }

  return tags;
}

/**
 * MusicBrainz Open Data Client (CC0 / Open Data)
 * Compliant with MetaBrainz Foundation API Terms & Etiquette:
 * - Proper User-Agent header identifying the application
 * - Throttled to max 1 request per second
 */

const USER_AGENT = "IsThisOurJukebox/2.0 ( https://github.com/ando/isthisourjukebox; contact@isthisourjukebox.local )";

let lastRequestTime = 0;

/**
 * Throttle requests to respect MusicBrainz rate limit (1 req/sec)
 */
async function throttleMusicBrainz(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < 1050) {
    await new Promise((resolve) => setTimeout(resolve, 1050 - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

/**
 * Clean track title and artist string for better fuzzy matching in MusicBrainz search
 */
function cleanQueryTerm(str: string): string {
  if (!str) return "";
  return str
    .replace(/\s*[\(\[\{].*?[\)\]\}]/g, "") // remove parenthetical like (Official Audio), (Remastered)
    .replace(/\s*feat\..*$/i, "")
    .replace(/\s*ft\..*$/i, "")
    .replace(/["\\]/g, "")
    .trim();
}

export async function fetchMusicBrainzTags(title: string, artist: string): Promise<{ tags: string[]; canonicalArtist?: string }> {
  const cleanTitle = cleanQueryTerm(title);
  const cleanArtist = cleanQueryTerm(artist);

  if (!cleanTitle && !cleanArtist) {
    return { tags: [] };
  }

  const tagsSet = new Set<string>();
  let canonicalArtist: string | undefined = undefined;

  try {
    // 1. Query Recording on MusicBrainz
    await throttleMusicBrainz();

    const query = cleanArtist
      ? `recording:"${cleanTitle}" AND ${cleanArtist}`
      : `recording:"${cleanTitle}"`;

    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data: any = await res.json();
      const rec = data?.recordings?.[0];

      if (rec) {
        canonicalArtist = rec["artist-credit"]?.[0]?.name;

        // Tags on recording
        if (Array.isArray(rec.tags)) {
          for (const t of rec.tags) {
            if (t.name) tagsSet.add(t.name.toLowerCase().trim());
          }
        }

        // Tags on release / release-group
        const relGroup = rec.releases?.[0]?.["release-group"];
        if (relGroup && Array.isArray(relGroup.tags)) {
          for (const t of relGroup.tags) {
            if (t.name) tagsSet.add(t.name.toLowerCase().trim());
          }
        }
      }
    }
  } catch (err) {
    console.warn("[musicbrainz] Recording lookup failed:", err);
  }

  // 2. If tags are still empty, query Artist Tags on MusicBrainz (alias-aware)
  if (tagsSet.size === 0 && cleanArtist) {
    try {
      await throttleMusicBrainz();
      const artistUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(cleanArtist)}&fmt=json&limit=1`;
      const artistRes = await fetch(artistUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4000),
      });

      if (artistRes.ok) {
        const artistData: any = await artistRes.json();
        const artistObj = artistData?.artists?.[0];
        if (artistObj) {
          if (!canonicalArtist) canonicalArtist = artistObj.name;
          if (Array.isArray(artistObj.tags)) {
            for (const t of artistObj.tags) {
              if (t.name) tagsSet.add(t.name.toLowerCase().trim());
            }
          }
        }
      }
    } catch (err) {
      console.warn("[musicbrainz] Artist lookup failed:", err);
    }
  }

  return {
    tags: Array.from(tagsSet),
    canonicalArtist,
  };
}

/**
 * Mengambil daftar judul lagu lain dari artis yang sama di database MusicBrainz
 * untuk digunakan sebagai pengecoh cerdas (smart decoys) di kuis tebak lagu.
 */
export async function fetchMusicBrainzArtistRecordings(artist: string, limit = 6): Promise<string[]> {
  const clean = cleanQueryTerm(artist);
  if (!clean) return [];

  try {
    await throttleMusicBrainz();
    const query = `artist:"${clean}"`;
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.recordings)) {
        const titles = new Set<string>();
        for (const r of data.recordings) {
          const t = cleanQueryTerm(r.title);
          if (t && t.length > 1) {
            titles.add(t);
          }
        }
        return Array.from(titles);
      }
    }
  } catch (err) {
    console.warn("[musicbrainz] fetchMusicBrainzArtistRecordings failed:", err);
  }
  return [];
}

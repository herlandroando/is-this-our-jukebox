import type { LyricLine, LyricsData } from "../types.ts";

const lyricsCache = new Map<string, LyricsData>();

const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const LRC_TIMESTAMP_REGEX = /\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
const TTML_PARAGRAPH_REGEX = /<p\b[^>]*\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;

/**
 * Cleans YouTube/SoundCloud title noise (e.g. "(Official Music Video)", "[4K]", "feat. ...")
 * to improve search hit rates on Unison and LRCLIB.
 */
export function cleanTitleAndArtist(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let title = rawTitle || "";
  let artist = rawArtist || "";

  // Sometimes YouTube title is "Artist - Song Title"
  if (title.includes(" - ") && (!artist || /topic|vevo/i.test(artist))) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  // Remove common YouTube/SoundCloud artifacts
  title = title
    .replace(/\s*[\(\[][^\)\]]*(?:official|video|audio|lyrics?|visualizer|hd|4k|mv|remaster|deluxe|version)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[](?:ft\.?|feat\.?)[^\)\]]*[\)\]]/gi, "")
    .trim();

  artist = artist
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();

  return { title, artist };
}

/**
 * Parses timestamps in various formats (TTML clock time, seconds with s, milliseconds).
 * Supports:
 * - (hh:)?mm:ss(.ms)? e.g. "0:15.500", "3:29.365", "01:02:03.456"
 * - raw seconds e.g. "45.5s", "45.5"
 * - raw milliseconds e.g. "5000ms"
 */
export function parseTimestamp(timeStr: string): number {
  if (!timeStr || !timeStr.trim()) return 0;
  const s = timeStr.trim();

  // Try ms: e.g. "5000ms"
  const msMatch = s.match(/^(\d+)ms$/i);
  if (msMatch) {
    return parseInt(msMatch[1], 10) / 1000;
  }

  // Try raw seconds: e.g. "45.5s" or "45.5"
  const secMatch = s.match(/^(\d+(?:\.\d+)?)s?$/i);
  if (secMatch) {
    return parseFloat(secMatch[1]);
  }

  // Try (hours:)?min:sec(.ms)?
  const clockMatch = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
  if (clockMatch) {
    const hours = clockMatch[1] ? parseInt(clockMatch[1], 10) : 0;
    const minutes = parseInt(clockMatch[2], 10);
    const seconds = parseInt(clockMatch[3], 10);
    let ms = 0;
    if (clockMatch[4]) {
      const msStr = clockMatch[4];
      if (msStr.length === 1) ms = parseInt(msStr, 10) * 100;
      else if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
      else if (msStr.length === 3) ms = parseInt(msStr, 10);
      else ms = parseInt(msStr.substring(0, 3), 10);
    }
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
  }

  const fallback = parseFloat(s);
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Decodes standard HTML entities commonly found in TTML paragraphs.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Merges consecutive bilingual lines (e.g. original language followed immediately
 * by a translation line with timestamp within 150ms).
 */
export function mergeConsecutiveBilingualLines(items: LyricLine[]): LyricLine[] {
  if (items.length <= 1) return items;

  const merged: LyricLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    if (!current.translation && i + 1 < items.length) {
      const next = items[i + 1];
      if (!next.translation && Math.abs(next.time - current.time) <= 0.15) {
        merged.push({
          time: current.time,
          text: current.text,
          translation: next.text,
        });
        i++; // Skip paired next line
        continue;
      }
    }
    merged.push(current);
  }
  return merged;
}

/**
 * Parses TTML timed text XML (Apple Music / Spotify format from Unison).
 */
export function parseTtml(ttmlContent: string): LyricLine[] {
  const rawLines: LyricLine[] = [];
  if (!ttmlContent || !ttmlContent.trim()) return rawLines;

  const matches = ttmlContent.matchAll(TTML_PARAGRAPH_REGEX);
  for (const match of matches) {
    const beginStr = match[1];
    const rawContent = match[2];
    const time = Math.round(parseTimestamp(beginStr) * 1000) / 1000;

    let text = rawContent.replace(/<[^>]+>/g, ""); // strip inner tags like <span>
    text = decodeHtmlEntities(text).trim();
    text = text.replace(/\s+/g, " ");

    if (text) {
      rawLines.push({ time, text });
    }
  }

  rawLines.sort((a, b) => a.time - b.time);
  return mergeConsecutiveBilingualLines(rawLines);
}

/**
 * Parses raw LRC string into structured LyricLine objects.
 * Handles formats like [01:23.45], [01:23.456], inline delimiters ('//' or '|'),
 * and consecutive bilingual lines.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const unmerged: LyricLine[] = [];
  if (!lrcText) return unmerged;

  const lines = lrcText.split(/\r?\n/);
  for (const rawLine of lines) {
    const matches = Array.from(rawLine.matchAll(LRC_TIMESTAMP_REGEX));
    if (matches.length === 0) continue;

    const lineText = rawLine.replace(LRC_TIMESTAMP_REGEX, "").trim();
    if (!lineText) continue;

    let text = lineText;
    let translation: string | undefined = undefined;

    if (lineText.includes(" // ")) {
      const parts = lineText.split(" // ");
      text = parts[0].trim();
      translation = parts.slice(1).join(" // ").trim();
    } else if (lineText.includes(" | ")) {
      const parts = lineText.split(" | ");
      text = parts[0].trim();
      translation = parts.slice(1).join(" | ").trim();
    }

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let ms = 0;
      if (match[3]) {
        const msStr = match[3];
        if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
        else if (msStr.length === 3) ms = parseInt(msStr, 10);
        else ms = parseInt(msStr.substring(0, 3), 10);
      }
      const time = Math.round((minutes * 60 + seconds + ms / 1000) * 100) / 100;
      unmerged.push({ time, text, translation });
    }
  }

  unmerged.sort((a, b) => a.time - b.time);
  return mergeConsecutiveBilingualLines(unmerged);
}

/**
 * Auto-detects and parses raw lyrics in TTML, LRC, or plain text format.
 */
export function parseRawLyrics(raw: string, format?: string): LyricLine[] {
  if (!raw || !raw.trim()) return [];

  if (
    format?.toLowerCase() === "ttml" ||
    (raw.includes("<tt") && raw.includes("</tt>")) ||
    (raw.includes("<p") && raw.includes("begin="))
  ) {
    const ttmlResult = parseTtml(raw);
    if (ttmlResult.length > 0) return ttmlResult;
  }

  if (format?.toLowerCase() === "lrc" || /\[\d{1,2}:\d{2}/.test(raw)) {
    const lrcResult = parseLrc(raw);
    if (lrcResult.length > 0) return lrcResult;
  }

  // Plain lyrics fallback
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text, idx) => ({ time: idx * 4, text }));
}

/**
 * Selects the best lyrics match from LRCLIB candidate list using TrackDot's scoring algorithm:
 * - Synced preference (+100)
 * - Japanese character matching bonus / penalty
 * - Duration matching closeness bonus / penalty
 */
export function selectBestLrclibMatch(
  candidates: any[],
  queryTitle: string,
  queryArtist: string,
  targetDuration?: number
): any | null {
  let bestItem: any = null;
  let maxScore = -Infinity;

  const queryHasJapanese = JAPANESE_CHAR_REGEX.test(queryTitle) || JAPANESE_CHAR_REGEX.test(queryArtist);

  for (const item of candidates) {
    if (!item.syncedLyrics && !item.plainLyrics) continue;

    let score = 0;

    // 1. Synced lyrics preference (+100)
    if (item.syncedLyrics && item.syncedLyrics.trim().length > 0) {
      score += 100;
    }

    // 2. Japanese character presence
    const combinedLyrics = (item.syncedLyrics || "") + " " + (item.plainLyrics || "");
    const lyricsHasJapanese = JAPANESE_CHAR_REGEX.test(combinedLyrics);
    const metadataHasJapanese =
      (item.trackName && JAPANESE_CHAR_REGEX.test(item.trackName)) ||
      (item.artistName && JAPANESE_CHAR_REGEX.test(item.artistName));

    if (queryHasJapanese) {
      if (lyricsHasJapanese) score += 300;
      else score -= 100;

      if (metadataHasJapanese) score += 50;
    } else {
      if (lyricsHasJapanese) score += 80;
    }

    // 3. Duration match
    if (targetDuration && targetDuration > 0 && item.duration && item.duration > 0) {
      const diff = Math.abs(item.duration - targetDuration);
      if (diff <= 2.0) score += 60;
      else if (diff <= 5.0) score += 40;
      else if (diff <= 10.0) score += 20;
      else if (diff > 20.0) score -= 50;
    }

    if (score > maxScore) {
      maxScore = score;
      bestItem = item;
    }
  }

  return bestItem;
}

/**
 * Fetches lyrics from Unison (primary provider, supports Apple Music richsync TTML and YouTube video IDs).
 */
async function fetchFromUnison(
  title: string,
  artist: string,
  options?: { duration?: number; videoId?: string }
): Promise<LyricsData | null> {
  const headers = {
    "User-Agent": "TrackDot/0.3.0 (https://github.com/herlandroando/TrackDot)",
  };

  const videoId = options?.videoId;
  const duration = options?.duration;

  // 1. If YouTube video ID is available, query directly by videoId
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    try {
      const url = `https://unison.boidu.dev/lyrics?v=${encodeURIComponent(videoId)}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json: any = await res.json();
        if (json?.success && json?.data?.lyrics) {
          const lines = parseRawLyrics(json.data.lyrics, json.data.format);
          if (lines.length > 0) {
            return {
              synced: lines.some((l) => l.time > 0),
              instrumental: false,
              lines,
              source: "Unison",
            };
          }
        }
      }
    } catch {
      // Continue to song + artist
    }
  }

  // 2. Query by song + artist
  if (title) {
    try {
      let url = `https://unison.boidu.dev/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
      if (duration && duration > 0) {
        url += `&duration=${Math.round(duration)}`;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json: any = await res.json();
        if (json?.success && json?.data?.lyrics) {
          const lines = parseRawLyrics(json.data.lyrics, json.data.format);
          if (lines.length > 0) {
            return {
              synced: lines.some((l) => l.time > 0),
              instrumental: false,
              lines,
              source: "Unison",
            };
          }
        }
      }
    } catch {
      // Continue to search
    }

    // 3. Fallback to Unison search
    try {
      const query = `${artist} ${title}`.trim();
      const searchUrl = `https://unison.boidu.dev/lyrics/search?q=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(6000) });
      if (searchRes.ok) {
        const searchJson: any = await searchRes.json();
        const candidates = searchJson?.data;
        if (Array.isArray(candidates) && candidates.length > 0) {
          for (const cand of candidates.slice(0, 3)) {
            if (cand.videoId) {
              const candRes = await fetch(`https://unison.boidu.dev/lyrics?v=${encodeURIComponent(cand.videoId)}`, {
                headers,
                signal: AbortSignal.timeout(5000),
              });
              if (candRes.ok) {
                const candJson: any = await candRes.json();
                if (candJson?.success && candJson?.data?.lyrics) {
                  const lines = parseRawLyrics(candJson.data.lyrics, candJson.data.format);
                  if (lines.length > 0) {
                    return {
                      synced: lines.some((l) => l.time > 0),
                      instrumental: false,
                      lines,
                      source: "Unison",
                    };
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Fallback to LRCLIB
    }
  }

  return null;
}

/**
 * Fetches lyrics from LRCLIB (fallback provider).
 */
async function fetchFromLrclib(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricsData | null> {
  const headers = {
    "User-Agent": "TrackDot/0.3.0 (https://github.com/herlandroando/TrackDot)",
  };

  // 1. Exact match /api/get
  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    if (duration && duration > 0) {
      getUrl += `&duration=${Math.round(duration)}`;
    }
    const response = await fetch(getUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data: any = await response.json();
      if (data && (data.syncedLyrics || data.plainLyrics || data.instrumental)) {
        if (data.instrumental) {
          return {
            synced: false,
            instrumental: true,
            lines: [{ time: 0, text: "♪ Instrumental ♪" }],
            source: "LRCLIB",
          };
        }
        const queryHasJapanese = JAPANESE_CHAR_REGEX.test(title) || JAPANESE_CHAR_REGEX.test(artist);
        const combined = (data.syncedLyrics || "") + " " + (data.plainLyrics || "");
        const resultHasJapanese = JAPANESE_CHAR_REGEX.test(combined);

        if (!queryHasJapanese || resultHasJapanese || data.syncedLyrics) {
          if (data.syncedLyrics) {
            const lines = parseLrc(data.syncedLyrics);
            if (lines.length > 0) {
              return {
                synced: true,
                instrumental: false,
                lines,
                plain: data.plainLyrics || undefined,
                source: "LRCLIB",
              };
            }
          }
          if (data.plainLyrics) {
            const plainLines = data.plainLyrics
              .split(/\r?\n/)
              .map((l: string) => l.trim())
              .filter(Boolean)
              .map((text: string, idx: number) => ({ time: idx * 4, text }));
            return {
              synced: false,
              instrumental: false,
              lines: plainLines,
              plain: data.plainLyrics,
              source: "LRCLIB",
            };
          }
        }
      }
    }
  } catch {
    // Continue to search
  }

  // 2. Search fallback /api/search
  try {
    const query = `${artist} ${title}`.trim();
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (searchRes.ok) {
      const searchList: any[] = await searchRes.json();
      if (Array.isArray(searchList) && searchList.length > 0) {
        const bestMatch = selectBestLrclibMatch(searchList, title, artist, duration);
        if (bestMatch) {
          if (bestMatch.instrumental) {
            return {
              synced: false,
              instrumental: true,
              lines: [{ time: 0, text: "♪ Instrumental ♪" }],
              source: "LRCLIB",
            };
          }
          if (bestMatch.syncedLyrics) {
            const lines = parseLrc(bestMatch.syncedLyrics);
            if (lines.length > 0) {
              return {
                synced: true,
                instrumental: false,
                lines,
                plain: bestMatch.plainLyrics || undefined,
                source: "LRCLIB",
              };
            }
          }
          if (bestMatch.plainLyrics) {
            const plainLines = bestMatch.plainLyrics
              .split(/\r?\n/)
              .map((l: string) => l.trim())
              .filter(Boolean)
              .map((text: string, idx: number) => ({ time: idx * 4, text }));
            return {
              synced: false,
              instrumental: false,
              lines: plainLines,
              plain: bestMatch.plainLyrics,
              source: "LRCLIB",
            };
          }
        }
      }
    }
  } catch {
    // Return null
  }

  return null;
}

/**
 * Fetch lyrics using TrackDot's multi-provider strategy:
 * 1. Unison (primary - richsync TTML, direct YouTube videoId support)
 * 2. LRCLIB (fallback - smart duration & Japanese scoring, bilingual merging)
 */
export async function getLyrics(
  rawTitle: string,
  rawArtist: string,
  options?: { duration?: number; videoId?: string }
): Promise<LyricsData> {
  const { title, artist } = cleanTitleAndArtist(rawTitle, rawArtist);
  const videoId = options?.videoId;
  const duration = options?.duration;

  const cacheKey = videoId
    ? `vid:${videoId}`
    : `${artist.toLowerCase()}|${title.toLowerCase()}|${duration ? Math.round(duration) : 0}`;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  const emptyResult: LyricsData = {
    synced: false,
    instrumental: false,
    lines: [],
  };

  try {
    // 1. Try Unison (primary source)
    const unisonResult = await fetchFromUnison(title, artist, { duration, videoId });
    if (unisonResult && unisonResult.lines.length > 0) {
      lyricsCache.set(cacheKey, unisonResult);
      return unisonResult;
    }

    // 2. Fallback to LRCLIB
    const lrclibResult = await fetchFromLrclib(title, artist, duration);
    if (lrclibResult && (lrclibResult.lines.length > 0 || lrclibResult.instrumental)) {
      lyricsCache.set(cacheKey, lrclibResult);
      return lrclibResult;
    }
  } catch (err) {
    console.warn(`[lyrics] Failed to fetch lyrics for "${title}" by "${artist}":`, err);
  }

  lyricsCache.set(cacheKey, emptyResult);
  return emptyResult;
}

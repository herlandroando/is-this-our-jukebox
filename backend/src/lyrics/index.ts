import type { LyricLine, LyricsData } from "../types.ts";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";

export const MAX_LYRICS_CACHE_SIZE = 100;
export const lyricsCache = new Map<string, LyricsData>();

export function getCachedLyrics(key: string): LyricsData | undefined {
  const item = lyricsCache.get(key);
  if (item) {
    // Refresh LRU order
    lyricsCache.delete(key);
    lyricsCache.set(key, item);
  }
  return item;
}

export function setCachedLyrics(key: string, data: LyricsData) {
  if (lyricsCache.has(key)) {
    lyricsCache.delete(key);
  } else if (lyricsCache.size >= MAX_LYRICS_CACHE_SIZE) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey) lyricsCache.delete(oldestKey);
  }
  lyricsCache.set(key, data);
}

const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const LRC_TIMESTAMP_REGEX = /\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g;
const TTML_PARAGRAPH_REGEX = /<p\b[^>]*\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;

let kuroshiroInstance: any = null;
let kuroshiroInitPromise: Promise<any> | null = null;

async function getKuroshiro(): Promise<any> {
  if (kuroshiroInstance) return kuroshiroInstance;
  if (!kuroshiroInitPromise) {
    kuroshiroInitPromise = (async () => {
      try {
        const KuroshiroClass: any = (Kuroshiro as any).default || Kuroshiro;
        const AnalyzerClass: any = (KuromojiAnalyzer as any).default || KuromojiAnalyzer;

        const cwd = process.cwd();
        const exeDir = dirname(process.execPath);
        const possiblePaths = [
          join(cwd, "dict"),
          join(cwd, "backend", "dict"),
          join(exeDir, "dict"),
          join(exeDir, "backend", "dict"),
          join(cwd, "node_modules", ".bun", "kuromoji@0.1.2", "node_modules", "kuromoji", "dict"),
          join(cwd, "node_modules", "kuromoji", "dict"),
          join(cwd, "backend", "node_modules", "kuromoji", "dict"),
          resolve("node_modules/kuromoji/dict"),
        ];

        let resolvedDictPath: string | undefined;
        for (const p of possiblePaths) {
          if (existsSync(p)) {
            resolvedDictPath = p;
            break;
          }
        }

        const k = new KuroshiroClass();
        await k.init(new AnalyzerClass(resolvedDictPath ? { dictPath: resolvedDictPath } : undefined));
        kuroshiroInstance = k;
        return k;
      } catch (err) {
        console.warn("[lyrics] Failed to initialize Kuroshiro for romaji:", err);
        return null;
      }
    })();
  }
  return kuroshiroInitPromise;
}

/**
 * Converts Japanese lyrics lines into phonetic Hepburn Romaji.
 * Leaves non-Japanese lines untouched.
 */
export async function addRomajiToLyrics(lines: LyricLine[]): Promise<LyricLine[]> {
  const hasJapanese = lines.some((l) => JAPANESE_CHAR_REGEX.test(l.text));
  if (!hasJapanese) return lines;

  try {
    const kuro = await getKuroshiro();
    if (!kuro) return lines;

    const enriched: LyricLine[] = [];
    for (const line of lines) {
      if (line.romaji || !JAPANESE_CHAR_REGEX.test(line.text)) {
        enriched.push(line);
        continue;
      }

      try {
        const romaji = await kuro.convert(line.text, {
          to: "romaji",
          mode: "spaced",
          romajiSystem: "hepburn",
        });
        enriched.push({
          ...line,
          romaji: romaji ? romaji.trim() : undefined,
        });
      } catch {
        enriched.push(line);
      }
    }
    return enriched;
  } catch (err) {
    console.warn("[lyrics] Romaji conversion failed:", err);
    return lines;
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "of", "and", "is", "it",
  "for", "with", "at", "by", "from", "up", "about", "into", "over", "after",
  "you", "me", "my", "your", "we", "our", "i", "he", "she", "they", "them",
  "or", "as", "be", "so", "that", "this", "but"
]);

/**
 * Normalizes text for similarity comparison:
 * lowercase, strips punctuation/accents, collapses whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculates Levenshtein ratio between two normalized strings (0 to 1).
 */
function levenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;

  const d = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) d[i][0] = i;
  for (let j = 0; j <= len2; j++) d[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return 1 - d[len1][len2] / maxLen;
}

/**
 * Calculates similarity between two strings using multi-factor scoring:
 * - Levenshtein distance on compact strings
 * - Token Sorensen-Dice coefficient
 * - Non-stopword significant token match (prevents matching completely different titles with common words)
 * - Substring length ratio
 */
export function calculateSimilarity(strA: string, strB: string): number {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const compactA = normA.replace(/\s+/g, "");
  const compactB = normB.replace(/\s+/g, "");
  if (compactA === compactB) return 1;

  let substringBonus = 0;
  if (compactA.includes(compactB) || compactB.includes(compactA)) {
    const minLen = Math.min(compactA.length, compactB.length);
    const maxLen = Math.max(compactA.length, compactB.length);
    const lenRatio = minLen / maxLen;
    if (lenRatio >= 0.6) {
      substringBonus = Math.max(0.75, lenRatio);
    }
  }

  const lev = levenshteinRatio(compactA, compactB);

  const tokensA = normA.split(" ").filter(Boolean);
  const tokensB = normB.split(" ").filter(Boolean);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let tokenInter = 0;
  for (const t of setA) {
    if (setB.has(t)) tokenInter++;
  }
  const tokenSim = (2 * tokenInter) / (setA.size + setB.size);

  // Significant words
  const sigA = tokensA.filter((t) => !STOPWORDS.has(t));
  const sigB = tokensB.filter((t) => !STOPWORDS.has(t));
  const sigSetA = new Set(sigA);
  const sigSetB = new Set(sigB);

  let sigSim = tokenSim;
  if (sigSetA.size > 0 && sigSetB.size > 0) {
    let sigInter = 0;
    for (const t of sigSetA) {
      if (sigSetB.has(t)) sigInter++;
    }
    if (sigInter === 0) {
      sigSim = 0;
    } else {
      sigSim = (2 * sigInter) / (sigSetA.size + sigSetB.size);
    }
  }

  const baseSim = sigSim === 0 ? Math.min(tokenSim * 0.3, lev * 0.4) : (tokenSim * 0.4 + sigSim * 0.3 + lev * 0.3);
  return Math.max(baseSim, substringBonus);
}

/**
 * Cleans YouTube/SoundCloud title noise (e.g. "(Official Music Video)", "[4K]", "feat. ...")
 * to improve search hit rates on LRCLIB and third-party lyric providers.
 */
export function cleanTitleAndArtist(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let title = rawTitle || "";
  let artist = rawArtist || "";

  // Split "Artist - Song Title" if artist is redundant or topic
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      const left = parts[0].trim();
      const right = parts.slice(1).join(" - ").trim();
      if (!artist || /topic|vevo/i.test(artist)) {
        artist = left;
        title = right;
      } else if (calculateSimilarity(left, artist) >= 0.6) {
        title = right;
      }
    }
  }

  // Remove common YouTube/SoundCloud artifacts
  title = title
    .replace(/\s*[\(\[][^\)\]]*(?:official|video|audio|lyrics?|visualizer|hd|4k|mv|remaster|deluxe|version)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[](?:ft\.?|feat\.?)[^\)\]]*[\)\]]/gi, "")
    .replace(/["“”'‘’]/g, "")
    .trim();

  artist = artist
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/["“”'‘’]/g, "")
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
 * Selects the best lyrics match from candidate list:
 * - Requires title similarity >= 0.5
 * - Requires artist similarity >= 0.35 if artist was specified
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
  const cleanQueryArtist = queryArtist?.trim() || "";

  for (const item of candidates) {
    if (!item.syncedLyrics && !item.plainLyrics) continue;

    const trackName = item.trackName || "";
    const artistName = item.artistName || "";

    const titleSim = calculateSimilarity(queryTitle, trackName);
    // Ignore candidates that don't match query title
    if (titleSim < 0.5) continue;

    const artistSim = cleanQueryArtist ? calculateSimilarity(cleanQueryArtist, artistName) : 1;
    // Reject candidate when query artist is provided and artist does not match
    if (cleanQueryArtist && artistSim < 0.35) {
      continue;
    }

    let score = titleSim * 200; // Heavily weighted by title similarity (0 to 200)
    score += artistSim * 60; // Artist similarity bonus (0 to 60)

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
      else if (diff > 25.0 && titleSim < 0.9) score -= 60;
    }

    if (score > maxScore) {
      maxScore = score;
      bestItem = item;
    }
  }

  return bestItem;
}

/**
 * Fetches lyrics from Unison by videoId or song + artist.
 * Strictly verifies returned metadata against query to avoid returning wrong songs.
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
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const json: any = await res.json();
        if (json?.success && json?.data?.lyrics) {
          const candSong = json.data.song || "";
          const candArtist = json.data.artist || "";
          const titleSim = candSong ? calculateSimilarity(title, candSong) : 1;
          const artistSim = artist && candArtist ? calculateSimilarity(artist, candArtist) : 1;
          if (titleSim >= 0.5 && artistSim >= 0.35) {
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
      }
    } catch {
      // Continue
    }
  }

  // 2. Query by song + artist
  if (title) {
    try {
      let url = `https://unison.boidu.dev/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
      if (duration && duration > 0) {
        url += `&duration=${Math.round(duration)}`;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const json: any = await res.json();
        if (json?.success && json?.data?.lyrics) {
          const candSong = json.data.song || "";
          const candArtist = json.data.artist || "";
          const titleSim = candSong ? calculateSimilarity(title, candSong) : 1;
          const artistSim = artist && candArtist ? calculateSimilarity(artist, candArtist) : 1;
          if (titleSim >= 0.5 && artistSim >= 0.35) {
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
      }
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Searches Unison with strict artist and title validation.
 */
async function searchUnison(title: string, artist: string, duration?: number): Promise<LyricsData | null> {
  if (!title) return null;
  const headers = {
    "User-Agent": "TrackDot/0.3.0 (https://github.com/herlandroando/TrackDot)",
  };

  try {
    const query = `${artist} ${title}`.trim();
    const searchUrl = `https://unison.boidu.dev/lyrics/search?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(2500) });
    if (searchRes.ok) {
      const searchJson: any = await searchRes.json();
      const candidates = searchJson?.data;
      if (Array.isArray(candidates) && candidates.length > 0) {
        let evaluatedCount = 0;
        for (const cand of candidates) {
          if (evaluatedCount >= 3) break;
          if (!cand.videoId) continue;

          const candSong = cand.song || "";
          const candArtist = cand.artist || "";
          const titleSim = calculateSimilarity(title, candSong);
          // Strict title similarity (0.75+) to avoid false positives like "Welcome to the Internet"
          if (titleSim < 0.75) continue;

          // If artist is known, candidate artist MUST match
          if (artist) {
            const artistSim = calculateSimilarity(artist, candArtist);
            if (artistSim < 0.5) continue;
          }

          // Duration sanity check
          if (duration && duration > 0 && cand.duration && cand.duration > 0) {
            const durDiff = Math.abs(cand.duration - duration);
            if (durDiff > 25 && titleSim < 0.9) continue;
          }

          evaluatedCount++;
          const candRes = await fetch(`https://unison.boidu.dev/lyrics?v=${encodeURIComponent(cand.videoId)}`, {
            headers,
            signal: AbortSignal.timeout(2500),
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
  } catch {}

  return null;
}

/**
 * Fetches lyrics from LRCLIB (primary synced lyrics database with 10M+ tracks).
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
    const response = await fetch(getUrl, { headers, signal: AbortSignal.timeout(5000) });
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
  } catch {}

  // 2. Search by track_name & artist_name (more targeted than free-text query)
  try {
    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(5000) });
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
  } catch {}

  // 3. Fallback search /api/search?q=
  try {
    const query = `${artist} ${title}`.trim();
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(5000) });
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
  } catch {}

  return null;
}

/**
 * Fetches synced LRC lyrics from Kugou's public lyrics repository.
 */
async function fetchFromKugou(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricsData | null> {
  try {
    const query = `${artist} ${title}`.trim();
    const searchUrl = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(query)}&page=1&pagesize=5&clientver=&platform=WebFilter`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const list = data?.data?.lists;
    if (!Array.isArray(list) || list.length === 0) return null;

    for (const item of list) {
      if (!item.FileHash) continue;
      const songName = item.SongName || "";
      const singerName = item.SingerName || "";
      const titleSim = calculateSimilarity(title, songName);
      if (titleSim < 0.5) continue;
      if (artist) {
        const artistSim = calculateSimilarity(artist, singerName);
        if (artistSim < 0.35) continue;
      }

      const lrcSearchUrl = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${item.Duration || 0}&hash=${item.FileHash}`;
      const lrcRes = await fetch(lrcSearchUrl, { signal: AbortSignal.timeout(3000) });
      if (!lrcRes.ok) continue;
      const lrcData: any = await lrcRes.json();
      const cand = lrcData?.candidates?.[0];
      if (!cand?.id || !cand?.accesskey) continue;

      const dlUrl = `https://krcs.kugou.com/download?ver=1&client=pc&id=${cand.id}&accesskey=${cand.accesskey}&fmt=lrc&charset=utf8`;
      const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(3000) });
      if (!dlRes.ok) continue;
      const dlData: any = await dlRes.json();
      if (!dlData?.content) continue;

      const lrcContent = Buffer.from(dlData.content, "base64").toString("utf8");
      const lines = parseLrc(lrcContent);
      if (lines.length > 0) {
        return {
          synced: lines.some((l) => l.time > 0),
          instrumental: false,
          lines,
          source: "Kugou",
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Fetches plain lyrics from lyrics.ovh as a safety fallback.
 */
async function fetchFromLyricsOvh(
  title: string,
  artist: string
): Promise<LyricsData | null> {
  if (!artist || !title) return null;
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.lyrics) {
      const lines = parseRawLyrics(data.lyrics, "plain");
      if (lines.length > 0) {
        return {
          synced: false,
          instrumental: false,
          lines,
          plain: data.lyrics,
          source: "lyrics.ovh",
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Multi-provider lyrics fetcher:
 * 1. Unison videoId (if YouTube videoId matches verified track metadata)
 * 2. LRCLIB primary (10M+ curated synced LRC database)
 * 3. Unison direct song + artist lookup
 * 4. Kugou public synced LRC search
 * 5. Unison fuzzy search (strictly requiring artist and title match)
 * 6. lyrics.ovh plain lyrics fallback
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

  const cached = getCachedLyrics(cacheKey);
  if (cached) {
    return cached;
  }

  const emptyResult: LyricsData = {
    synced: false,
    instrumental: false,
    lines: [],
  };

  try {
    // 1. If YouTube video ID is provided, check Unison direct for verified richsync TTML
    if (videoId) {
      const unisonVidResult = await fetchFromUnison(title, artist, { duration, videoId });
      if (unisonVidResult && unisonVidResult.lines.length > 0) {
        unisonVidResult.lines = await addRomajiToLyrics(unisonVidResult.lines);
        setCachedLyrics(cacheKey, unisonVidResult);
        return unisonVidResult;
      }
    }

    // 2. LRCLIB primary (world's largest open synchronized lyrics database)
    const lrclibResult = await fetchFromLrclib(title, artist, duration);
    if (lrclibResult && (lrclibResult.lines.length > 0 || lrclibResult.instrumental)) {
      if (!lrclibResult.instrumental && lrclibResult.lines.length > 0) {
        lrclibResult.lines = await addRomajiToLyrics(lrclibResult.lines);
      }
      setCachedLyrics(cacheKey, lrclibResult);
      return lrclibResult;
    }

    // 3. Unison direct song + artist lookup
    const unisonDirectResult = await fetchFromUnison(title, artist, { duration });
    if (unisonDirectResult && unisonDirectResult.lines.length > 0) {
      unisonDirectResult.lines = await addRomajiToLyrics(unisonDirectResult.lines);
      setCachedLyrics(cacheKey, unisonDirectResult);
      return unisonDirectResult;
    }

    // 4. Kugou public lyrics search (massive synchronized LRC repository)
    const kugouResult = await fetchFromKugou(title, artist, duration);
    if (kugouResult && kugouResult.lines.length > 0) {
      kugouResult.lines = await addRomajiToLyrics(kugouResult.lines);
      setCachedLyrics(cacheKey, kugouResult);
      return kugouResult;
    }

    // 5. Unison fuzzy search (strictly requiring artist and title match)
    const unisonSearchResult = await searchUnison(title, artist, duration);
    if (unisonSearchResult && unisonSearchResult.lines.length > 0) {
      unisonSearchResult.lines = await addRomajiToLyrics(unisonSearchResult.lines);
      setCachedLyrics(cacheKey, unisonSearchResult);
      return unisonSearchResult;
    }

    // 6. lyrics.ovh fallback (plain lyrics)
    const ovhResult = await fetchFromLyricsOvh(title, artist);
    if (ovhResult && ovhResult.lines.length > 0) {
      ovhResult.lines = await addRomajiToLyrics(ovhResult.lines);
      setCachedLyrics(cacheKey, ovhResult);
      return ovhResult;
    }
  } catch (err) {
    console.warn(`[lyrics] Failed to fetch lyrics for "${title}" by "${artist}":`, err);
  }

  setCachedLyrics(cacheKey, emptyResult);
  return emptyResult;
}

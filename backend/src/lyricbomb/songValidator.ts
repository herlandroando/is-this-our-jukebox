import { getLyrics } from "../lyrics/index.ts";
import type { LyricLine } from "../types.ts";
import type {
  LyricBombLeadInLine,
  LyricBombSegment,
  LyricBombSongInfo,
  LyricBombWordChip,
} from "./types.ts";

const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const INSTRUMENTAL_MARKER_REGEX = /^(?:[♪♫♬🎵🎶~\-\s]+|\[.*?(?:intro|outro|instrumental|musik|music|solo|interlude).*?\]|\(.*?(?:intro|outro|instrumental|musik|music|solo|interlude).*?\))$/i;

const MAX_PREPARED_CACHE = 30;
const preparedSongCache = new Map<string, LyricBombSongInfo>();

export function clearPreparedSongCache(): void {
  preparedSongCache.clear();
}

/**
 * Clean and split a lyric line into individual words suitable for word-chips.
 */
export function splitWords(line: string): string[] {
  // Remove parenthetical noise like (Refrain), [Chorus]
  const cleaned = line
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^\p{L}\p{N}'\- ]/gu, " ")
    .trim();

  if (!cleaned) return [];
  return cleaned.split(/\s+/).filter(Boolean);
}

/**
 * Chunks a list of words into meaningful phrase chips.
 * Target: between 4 and 6 chips.
 * If total words <= 3, gracefully returns individual words (< 4 chips).
 * If total words > 6, evenly groups adjacent words into 4 to 6 coherent phrase chunks.
 */
export function chunkWordsIntoPhrases(
  words: string[],
  targetMin = 4,
  targetMax = 6
): string[] {
  const len = words.length;
  if (len <= targetMin) {
    return [...words];
  }
  if (len <= targetMax) {
    return [...words];
  }

  // len >= 7: target 5 or 6 chunks
  const targetChunks = len <= 8 ? Math.min(6, len - 2) : len <= 10 ? 5 : 6;
  const baseSize = Math.floor(len / targetChunks);
  const remainder = len % targetChunks;

  const chunks: string[] = [];
  let currentIdx = 0;
  for (let i = 0; i < targetChunks; i++) {
    const take = baseSize + (i < remainder ? 1 : 0);
    const slice = words.slice(currentIdx, currentIdx + take);
    chunks.push(slice.join(" "));
    currentIdx += take;
  }

  return chunks;
}

/**
 * Extracts word tokens from a LyricLine, automatically using spaced Hepburn Romaji
 * when the line contains unspaced Japanese script.
 */
export function extractLineTokens(line: LyricLine): {
  words: string[];
  targetOriginalText: string;
  targetDisplayScript?: string;
  targetTranslation?: string;
} {
  const rawText = (line.text || "").trim();
  const romajiText = (line.romaji || "").trim();
  const directWords = splitWords(rawText);
  const romajiWords = romajiText ? splitWords(romajiText) : [];

  const hasJapanese = JAPANESE_CHAR_REGEX.test(rawText);

  if ((hasJapanese || directWords.length <= 1) && romajiWords.length >= 2) {
    return {
      words: romajiWords,
      targetOriginalText: romajiText,
      targetDisplayScript: rawText,
      targetTranslation: line.translation,
    };
  }

  return {
    words: directWords,
    targetOriginalText: rawText,
    targetDisplayScript: romajiText && romajiText !== rawText ? romajiText : undefined,
    targetTranslation: line.translation,
  };
}

/**
 * Fisher-Yates shuffle array
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildScrambledChips(segmentIndex: number, words: string[]): LyricBombWordChip[] {
  const chips: LyricBombWordChip[] = words.map((w, wIdx) => ({
    id: `chip_${segmentIndex}_${wIdx}_${Math.random().toString(36).slice(2, 6)}`,
    text: w,
    originalIndex: wIdx,
  }));

  let scrambled = shuffleArray(chips);
  if (scrambled.length > 1 && scrambled.every((c, wIdx) => c.originalIndex === wIdx)) {
    scrambled = [...scrambled].reverse();
  }
  return scrambled;
}

function cloneWithFreshScrambledChips(songInfo: LyricBombSongInfo, albumArt?: string): LyricBombSongInfo {
  return {
    ...songInfo,
    albumArt: albumArt || songInfo.albumArt,
    segments: songInfo.segments.map((seg, idx) => ({
      ...seg,
      leadInTexts: [...seg.leadInTexts],
      leadInLines: seg.leadInLines.map((l) => ({ ...l })),
      words: [...seg.words],
      scrambledChips: buildScrambledChips(idx, seg.words),
    })),
  };
}

/**
 * Validates and transforms synced lyrics into LyricBomb segments.
 * Requirements:
 * - Must be synced (time > 0 on lines)
 * - Must have at least 3 usable segments with 2–10 words
 * - Each segment includes a 2–3 line lead-in window (typically 5–12s) with timed karaoke lines
 */
export async function prepareLyricBombSong(params: {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  albumArt?: string;
  maxSegments?: number;
}): Promise<{ valid: boolean; reason?: string; songInfo?: LyricBombSongInfo }> {
  try {
    const targetMax = Math.max(4, Math.min(6, params.maxSegments ?? 6));
    const cacheKey = params.videoId?.trim() ? `${params.videoId.trim()}_${targetMax}` : undefined;
    if (cacheKey && preparedSongCache.has(cacheKey)) {
      const cached = preparedSongCache.get(cacheKey)!;
      return {
        valid: true,
        songInfo: cloneWithFreshScrambledChips(cached, params.albumArt),
      };
    }

    const lyricsData = await getLyrics(params.title, params.artist, {
      videoId: params.videoId,
      duration: params.duration,
    });

    if (!lyricsData || !lyricsData.lines || lyricsData.lines.length === 0) {
      return {
        valid: false,
        reason: "Lirik tidak ditemukan untuk lagu ini.",
      };
    }

    if (!lyricsData.synced) {
      return {
        valid: false,
        reason: "Lirik lagu ini belum memiliki sinkronisasi waktu (synced timestamps).",
      };
    }

    const rawLines = lyricsData.lines.filter(
      (l) =>
        typeof l.time === "number" &&
        l.time >= 0 &&
        l.text.trim().length > 0 &&
        !INSTRUMENTAL_MARKER_REGEX.test(l.text.trim())
    );

    if (rawLines.length < 5) {
      return {
        valid: false,
        reason: "Jumlah baris lirik bersinkronisasi terlalu sedikit untuk dimainkan.",
      };
    }

    const segments = buildSegmentsFromLines(rawLines, 3, 9, targetMax);
    const finalSegments =
      segments.length >= 3 ? segments : buildSegmentsFromLines(rawLines, 2, 10, targetMax);

    if (finalSegments.length < 3) {
      return {
        valid: false,
        reason: "Baris lirik yang valid dan dapat dipecah kata terlalu sedikit.",
      };
    }

    const songInfo: LyricBombSongInfo = {
      videoId: params.videoId,
      title: params.title,
      artist: params.artist,
      albumArt: params.albumArt,
      duration: params.duration,
      segments: finalSegments,
    };

    if (cacheKey) {
      if (preparedSongCache.size >= MAX_PREPARED_CACHE) {
        const oldest = preparedSongCache.keys().next().value;
        if (oldest) preparedSongCache.delete(oldest);
      }
      preparedSongCache.set(cacheKey, songInfo);
    }

    return {
      valid: true,
      songInfo: cloneWithFreshScrambledChips(songInfo, params.albumArt),
    };
  } catch (err: any) {
    return {
      valid: false,
      reason: `Gagal memproses lirik: ${err?.message || "Unknown error"}`,
    };
  }
}

export function buildSegmentsFromLines(
  rawLines: LyricLine[],
  minWords = 2,
  maxWords = 9,
  maxSegments = 6
): LyricBombSegment[] {
  const targetMax = Math.max(4, Math.min(6, maxSegments));
  const segments: LyricBombSegment[] = [];
  let idx = 0;

  while (idx < rawLines.length && segments.length < targetMax) {
    const leadInStartIdx = idx;

    // Prefer 2 lines of lead-in context when enough lines remain, or 1 line near the end
    const preferredOffset = rawLines.length - idx >= 6 ? 2 : 1;
    let targetIdx = idx + preferredOffset;
    if (targetIdx >= rawLines.length) break;

    let selectedTokens: ReturnType<typeof extractLineTokens> | null = null;

    while (targetIdx < rawLines.length) {
      const candidateLine = rawLines[targetIdx];
      const tokens = extractLineTokens(candidateLine);

      // Determine up to 3 preceding lines as lead-in
      const sliceStart = Math.max(leadInStartIdx, targetIdx - 3);
      let leadInCandidate = rawLines.slice(sliceStart, targetIdx);

      // Trim oldest lead-in lines if the gap exceeds 12.5s so lead-in stays crisp (5–12s)
      while (
        leadInCandidate.length > 1 &&
        candidateLine.time - leadInCandidate[0].time > 12.5
      ) {
        leadInCandidate = leadInCandidate.slice(1);
      }

      const firstLeadInTime = leadInCandidate[0]?.time ?? candidateLine.time;
      const estLeadInStart = Math.max(0, firstLeadInTime - 0.8);
      const leadInSpan = candidateLine.time - estLeadInStart;

      if (
        tokens.words.length >= minWords &&
        tokens.words.length <= maxWords &&
        leadInSpan >= 2.4
      ) {
        selectedTokens = tokens;
        break;
      }
      targetIdx++;
    }

    if (targetIdx >= rawLines.length || !selectedTokens) break;

    const targetLine = rawLines[targetIdx];

    // Take up to 3 lines immediately preceding targetIdx
    const sliceStart = Math.max(leadInStartIdx, targetIdx - 3);
    let leadInSlice = rawLines.slice(sliceStart, targetIdx);
    while (leadInSlice.length > 1 && targetLine.time - leadInSlice[0].time > 12.5) {
      leadInSlice = leadInSlice.slice(1);
    }

    const firstLeadIn = leadInSlice[0] || targetLine;
    const leadInStartTime = Math.max(
      0,
      Math.max(firstLeadIn.time - 0.8, targetLine.time - 13.0)
    );

    // Safety stop margin of 0.5s before targetLine.time, never exceeding targetLine.time - 0.25s
    const stopTime = Math.min(
      Math.max(0, targetLine.time - 0.25),
      Math.max(leadInStartTime + 1.8, targetLine.time - 0.5)
    );

    const afterTargetLine = rawLines[targetIdx + 1];
    const resumeStartTime = Math.max(0, targetLine.time - 0.15);
    const resumeEndTime =
      afterTargetLine && afterTargetLine.time > targetLine.time + 1.5
        ? Math.min(targetLine.time + 6.5, afterTargetLine.time)
        : targetLine.time + 4.2;

    const leadInLines: LyricBombLeadInLine[] = leadInSlice.map((l) => ({
      time: l.time,
      text: l.text.trim(),
      romaji: l.romaji,
      translation: l.translation,
    }));
    const leadInTexts = leadInLines.map((l) => l.text).filter(Boolean);

    const segmentWords = chunkWordsIntoPhrases(selectedTokens.words);
    const segmentIndex = segments.length;
    segments.push({
      segmentIndex,
      leadInStartTime: Math.round(leadInStartTime * 100) / 100,
      stopTime: Math.round(stopTime * 100) / 100,
      resumeStartTime: Math.round(resumeStartTime * 100) / 100,
      resumeEndTime: Math.round(resumeEndTime * 100) / 100,
      leadInTexts,
      leadInLines,
      targetOriginalText: selectedTokens.targetOriginalText,
      targetDisplayScript: selectedTokens.targetDisplayScript,
      targetTranslation: selectedTokens.targetTranslation,
      words: segmentWords,
      scrambledChips: buildScrambledChips(segmentIndex, segmentWords),
    });

    // Advance past targetIdx; if ample lines remain, jump slightly ahead to distribute segments nicely across the song
    const remainingSegments = targetMax - segments.length;
    const remainingLines = rawLines.length - (targetIdx + 1);
    if (remainingSegments > 0 && remainingLines > remainingSegments * 4) {
      const skipStep = Math.floor(remainingLines / (remainingSegments + 1));
      idx = Math.max(targetIdx + 1, targetIdx + Math.max(1, skipStep));
    } else {
      idx = targetIdx + 1;
    }
  }

  return segments;
}

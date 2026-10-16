import { jukeboxDb, type CachedTrackMetadata } from "../db.ts";
import { fetchMusicBrainzTags } from "./musicbrainz.ts";
import { fetchLastFmTags } from "./lastfm.ts";

export type JukeboxMood = "hype" | "lofi" | "romance" | "galau";

export interface ResolvedMetadata {
  id: string;
  genre?: string;
  mood: JukeboxMood;
  tags: string[];
  source: string;
}

// Tag Mapping Definitions
const TAGS_GALAU = new Set([
  "emo", "sad", "acoustic", "melancholy", "ballad", "slow rock", "grief",
  "tearjerker", "breakup", "heartbreak", "crying", "dark", "post-hardcore",
  "indie folk", "acoustic rock", "sadcore", "slowcore",
]);

const TAGS_HYPE = new Set([
  "rock", "metal", "electronic", "dance", "house", "edm", "techno",
  "drum and bass", "dnb", "punk", "hardcore", "party", "phonk", "pop punk",
  "dubstep", "synthwave", "electropop", "hard rock", "heavy metal", "club",
  "trance", "hyperpop", "trap", "hip hop",
]);

const TAGS_LOFI = new Set([
  "lo-fi", "lofi", "chill", "ambient", "coffee", "relax", "downtempo",
  "jazz", "chillout", "sleep", "study", "beats to relax", "calm", "mellow",
  "trip hop",
]);

const TAGS_ROMANCE = new Set([
  "city pop", "disco", "j-pop", "k-pop", "sweet", "romantic", "love",
  "love songs", "funk", "groove", "boogie", "synth-pop", "r&b", "soul",
]);

// Sad / Ballad cues in title when song is rock/emo/acoustic
const SAD_TITLE_CUES = [
  "cancer", "die", "dying", "death", "dead", "funeral", "leaving", "left",
  "cry", "crying", "tears", "goodbye", "hurt", "pain", "sad", "alone",
  "broken", "i don't love you", "disenchanted", "ghost of you", "numb",
  "in the end", "wake me up when september ends", "boulevard of broken dreams",
  "creep", "my immortal", "snuff", "luka", "hampa", "kehilangan",
];

export function deriveMoodFromTags(
  tags: string[],
  title: string = "",
  duration: number = 0
): { mood: JukeboxMood; primaryGenre?: string } {
  const lowerTitle = title.toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase().trim());

  let galauScore = 0;
  let hypeScore = 0;
  let lofiScore = 0;
  let romanceScore = 0;

  for (const t of lowerTags) {
    if (TAGS_GALAU.has(t)) galauScore += 3;
    if (TAGS_HYPE.has(t)) hypeScore += 2;
    if (TAGS_LOFI.has(t)) lofiScore += 3;
    if (TAGS_ROMANCE.has(t)) romanceScore += 3;
  }

  // Check specific sad title cues for rock/emo/alternative
  const hasSadCue = SAD_TITLE_CUES.some((cue) => lowerTitle.includes(cue));
  if (hasSadCue) {
    galauScore += 4;
  }

  // Derive readable primary genre name
  let primaryGenre: string | undefined = undefined;
  if (lowerTags.length > 0) {
    // Pick the most meaningful genre tag
    primaryGenre = lowerTags.find(
      (t) =>
        t !== "seen live" &&
        t !== "favorites" &&
        !t.includes("favorite") &&
        t.length > 2
    );
    if (primaryGenre) {
      primaryGenre = primaryGenre.charAt(0).toUpperCase() + primaryGenre.slice(1);
    }
  }

  const max = Math.max(galauScore, hypeScore, lofiScore, romanceScore);
  let mood: JukeboxMood = "hype";

  if (max > 0) {
    if (max === galauScore) mood = "galau";
    else if (max === lofiScore) mood = "lofi";
    else if (max === romanceScore) mood = "romance";
    else mood = "hype";
  } else {
    // Duration fallback heuristic
    if (duration > 270) mood = "galau";
    else if (duration < 180) mood = "hype";
    else mood = "romance";
  }

  return { mood, primaryGenre };
}

export async function resolveTrackMetadata(track: {
  id: string;
  provider: string;
  title: string;
  artist: string;
  duration?: number;
}): Promise<ResolvedMetadata> {
  // 1. Check SQLite Cache (0ms instant lookup)
  const cached = jukeboxDb.getTrackMetadata(track.id, track.artist, track.title);
  if (cached) {
    return {
      id: cached.id,
      genre: cached.genre,
      mood: cached.mood,
      tags: cached.tags,
      source: cached.source,
    };
  }

  // 2. Fetch from MusicBrainz (CC0 / Open Data)
  const mbResult = await fetchMusicBrainzTags(track.title, track.artist);
  let tags = [...mbResult.tags];
  let source = "musicbrainz";

  // 3. Optional: Fetch from Last.fm if API key is configured
  if (process.env.LASTFM_API_KEY) {
    const lastFmTags = await fetchLastFmTags(track.title, track.artist);
    if (lastFmTags.length > 0) {
      tags = Array.from(new Set([...tags, ...lastFmTags]));
      source = "musicbrainz+lastfm";
    }
  }

  // 4. Derive Mood & Primary Genre
  const { mood, primaryGenre } = deriveMoodFromTags(
    tags,
    track.title,
    track.duration || 0
  );

  const safeId = track.id || `${track.provider || "custom"}:${(track.artist || "").trim().toLowerCase()}:${(track.title || "").trim().toLowerCase()}`;
  const safeProvider = track.provider || "youtube";

  const resolved: CachedTrackMetadata = {
    id: safeId,
    provider: safeProvider,
    title: track.title,
    artist: mbResult.canonicalArtist || track.artist,
    genre: primaryGenre,
    mood,
    tags,
    source,
    updatedAt: Date.now(),
  };

  // 5. Persist to SQLite Cache
  jukeboxDb.saveTrackMetadata(resolved);

  return {
    id: resolved.id,
    genre: resolved.genre,
    mood: resolved.mood,
    tags: resolved.tags,
    source: resolved.source,
  };
}

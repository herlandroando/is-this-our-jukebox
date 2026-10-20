import type { AudioProvider, SearchResult } from "../types.ts";
import type { TriviaCategory, TriviaOption, TriviaQuestion } from "./types.ts";
import { jukeboxDb } from "../db.ts";
import { queueStore } from "../queue/store.ts";
import { searchTracks, getRelatedTracks } from "../search/index.ts";
import { fetchMusicBrainzArtistRecordings } from "../metadata/musicbrainz.ts";
import { fetchPlaylistSongs } from "./playlistService.ts";

export function getAvailableCategories(): TriviaCategory[] {
  try {
    const presets = jukeboxDb.getAllTriviaPresets(true);
    if (presets && presets.length > 0) {
      return presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        popularArtists: p.type === "dynamic" ? ["Lagu Ruangan"] : ["Koleksi Playlist"],
      }));
    }
  } catch {}

  // Fallback default
  return [
    {
      id: "room-vibe",
      name: "Antrean & Vibe Ruangan 🎧",
      description: "Ditebak dari lagu antrean sekarang & rekomendasi Auto DJ terkait!",
      icon: "radio",
      popularArtists: ["Lagu Antrean & Terkait"],
    },
    {
      id: "anime-jp",
      name: "Anime OST & J-Pop Trending 🌸",
      description: "Opening anime ikonik & J-Pop trending (YOASOBI, Yorushika, Creepy Nuts, dll).",
      icon: "tv",
      popularArtists: ["YOASOBI", "Yorushika", "Creepy Nuts", "Akasaki"],
    },
  ];
}

// Backward compatibility export
export const TRIVIA_CATEGORIES: TriviaCategory[] = getAvailableCategories();

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[\{][^\)\]\}]*(?:official|video|audio|lyric|clip|remaster|visualizer|mv|live)[^\)\]\}]*[\)\]\}]/gi, "")
    .replace(/\s*[\(\[\{][^\)\]\}]*$/g, "")
    .replace(/\s*ft\..*$/i, "")
    .replace(/\s*feat\..*$/i, "")
    .trim();
}

/**
 * Mengambil calon lagu:
 * 1. Jika Custom Playlist -> Ambil langsung via playlistService
 * 2. Jika Room Vibe -> Ambil dari antrean ruangan aktif + Related Music
 * 3. Jika Office History -> Ambil dari database statistik kantor
 * 4. Jika Preset Kategori Genre -> Ambil dari Playlist YouTube Music kurator via playlistService
 */
async function fetchDynamicCandidates(
  categoryId: string,
  customPlaylistUrl?: string
): Promise<SearchResult[]> {
  const candidates: SearchResult[] = [];

  // 1. Custom Playlist yang diinput Host
  if (categoryId === "custom" && customPlaylistUrl) {
    try {
      const plSongs = await fetchPlaylistSongs(customPlaylistUrl, false);
      if (plSongs.length > 0) return plSongs;
    } catch (err) {
      console.warn("[trivia] Failed to fetch custom playlist:", err);
    }
  }

  // 2. Kategori Antrean Ruangan
  if (categoryId === "room-vibe") {
    const state = queueStore.getState();
    if (state.nowPlaying) candidates.push(state.nowPlaying);
    candidates.push(...state.queue);
    candidates.push(...state.history);

    try {
      const dbRecent = jukeboxDb.getRecentTracks(undefined, 10);
      candidates.push(...dbRecent);
      const dbTop = jukeboxDb.getTopTracks(10);
      candidates.push(...dbTop);
    } catch {}

    const seeds = candidates.slice(0, 3);
    for (const s of seeds) {
      if (!s.id) continue;
      try {
        const related = await getRelatedTracks(s.id, s.artist);
        candidates.push(...related);
      } catch {}
    }
    return candidates;
  }

  // 3. Kategori Riwayat Kantor
  if (categoryId === "office-history") {
    try {
      const top = jukeboxDb.getTopTracks(30);
      const recent = jukeboxDb.getRecentTracks(undefined, 20);
      candidates.push(...top, ...recent);

      if (candidates.length > 0 && candidates[0].id) {
        const related = await getRelatedTracks(candidates[0].id, candidates[0].artist);
        candidates.push(...related);
      }
    } catch {}
    return candidates;
  }

  // 4. Kategori Genre (Pop Indo, Indie, Rock, Western, Hits 00s, K-Pop, Anime, Custom Preset)
  try {
    const preset = jukeboxDb.getTriviaPreset(categoryId);
    if (preset && preset.type === "playlist" && preset.playlistId) {
      const plSongs = await fetchPlaylistSongs(preset.playlistId, false, preset.id);
      if (plSongs.length > 0) {
        candidates.push(...plSongs);
      }
    }
  } catch (err) {
    console.warn(`[trivia] Error getting preset for ${categoryId}:`, err);
  }

  // Fallback jika playlist kosong atau error
  if (candidates.length < 6) {
    try {
      const dbTop = jukeboxDb.getTopTracks(20);
      candidates.push(...dbTop);
    } catch {}
  }

  if (candidates.length < 6) {
    try {
      const backupHits = await searchTracks("Popular acoustic pop hits", "yt");
      candidates.push(...backupHits);
    } catch {}
  }

  return candidates;
}

// Cache pencarian lagu artis agar responsif dan efisien (0ms pada pencarian berulang)
const artistSongsCache = new Map<string, Array<{ title: string; artist: string }>>();

async function fetchSameArtistCandidates(
  artist: string,
  currentTitle: string,
  pool: SearchResult[]
): Promise<Array<{ title: string; artist: string }>> {
  const normArtist = artist.trim().toLowerCase();
  const normTitle = cleanTitle(currentTitle).toLowerCase();
  const results: Array<{ title: string; artist: string }> = [];
  const seenTitles = new Set<string>([normTitle]);

  // 1. Dari memory pool playlist saat ini (0ms)
  for (const item of pool) {
    if (!item.title || !item.artist) continue;
    const itemArtistNorm = item.artist.trim().toLowerCase();
    const itemTitleNorm = cleanTitle(item.title).toLowerCase();
    if (
      (itemArtistNorm === normArtist || itemArtistNorm.includes(normArtist) || normArtist.includes(itemArtistNorm)) &&
      !seenTitles.has(itemTitleNorm)
    ) {
      seenTitles.add(itemTitleNorm);
      results.push({ title: cleanTitle(item.title), artist: item.artist });
    }
  }

  // 2. Dari database SQLite jukebox lokal (0ms)
  try {
    const dbTracks = jukeboxDb.getTracksByArtist(artist, currentTitle, 6);
    for (const dt of dbTracks) {
      const dtTitleNorm = cleanTitle(dt.title).toLowerCase();
      if (!seenTitles.has(dtTitleNorm)) {
        seenTitles.add(dtTitleNorm);
        results.push({ title: cleanTitle(dt.title), artist: dt.artist || artist });
      }
    }
  } catch {}

  // 3. Cek cache memori
  const cached = artistSongsCache.get(normArtist);
  if (cached) {
    for (const c of cached) {
      const cTitleNorm = cleanTitle(c.title).toLowerCase();
      if (!seenTitles.has(cTitleNorm)) {
        seenTitles.add(cTitleNorm);
        results.push(c);
      }
    }
  }

  // 4. Jika masih kurang dan belum di-cache, fetch cepat dari YTMusic (timeout 1.5 detik agar tidak memblokir)
  if (results.length < 3 && !artistSongsCache.has(normArtist)) {
    try {
      const timeoutPromise = new Promise<any[]>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1500)
      );
      const searchPromise = (async () => {
        const { getYTMusic } = await import("../search/index.ts");
        const yt = await getYTMusic();
        return await yt.searchSongs(artist);
      })();

      const ytSongs = await Promise.race([searchPromise, timeoutPromise]);
      const fetched: Array<{ title: string; artist: string }> = [];
      if (Array.isArray(ytSongs)) {
        for (const s of ytSongs) {
          if (!s || !s.name) continue;
          const sArtist = (typeof s.artist === "object" ? s.artist?.name : s.artist) || artist;
          const sTitle = cleanTitle(s.name);
          const sTitleNorm = sTitle.toLowerCase();
          if (!seenTitles.has(sTitleNorm)) {
            seenTitles.add(sTitleNorm);
            const item = { title: sTitle, artist: sArtist };
            results.push(item);
            fetched.push(item);
          }
        }
      }
      artistSongsCache.set(normArtist, fetched);
    } catch {
      artistSongsCache.set(normArtist, []);
    }
  }

  return results;
}

/**
 * Membangun daftar pertanyaan (ronde) kuis tebak lagu multi-genre.
 * - Lagu diambil langsung dari Curated Playlist atau antrean dinamis.
 * - Pilihan ganda pengecoh diambil dari lagu lain di playlist yang sama (se-genre).
 * - Sekitar 50%-70% ronde menyertakan 2-3 pilihan dari artis yang sama agar tidak terlalu mudah ditebak.
 */
export async function generateTriviaQuestions(
  categoryId: string,
  roundCount: number,
  roundDurationSec: number,
  customPlaylistUrl?: string
): Promise<{ questions: TriviaQuestion[]; answers: Map<number, string> }> {
  const rawCandidates = await fetchDynamicCandidates(categoryId, customPlaylistUrl);

  // Deduplikasi calon lagu berdasarkan ID dan judul bersih
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const validPool: SearchResult[] = [];

  for (const c of rawCandidates) {
    if (!c.id || !c.title || !c.artist) continue;
    const cTitle = cleanTitle(c.title).toLowerCase();
    if (seenIds.has(c.id) || seenTitles.has(cTitle)) continue;

    // Filter track yang terlalu panjang (>10 menit) atau kompilasi album
    if (c.duration && c.duration > 600) continue;

    seenIds.add(c.id);
    seenTitles.add(cTitle);
    validPool.push(c);
  }

  const shuffledPool = shuffleArray(validPool);
  const selectedCount = Math.max(1, Math.min(roundCount, shuffledPool.length));
  const selectedSongs = shuffledPool.slice(0, selectedCount);

  // Tentukan ronde mana saja yang memprioritaskan 2-3 lagu dengan penyanyi yang sama (sekitar 60%)
  const sameArtistRounds = new Set<number>();
  for (let i = 0; i < selectedSongs.length; i++) {
    if (Math.random() < 0.65 || selectedSongs.length <= 3) {
      sameArtistRounds.add(i);
    }
  }

  const questions: TriviaQuestion[] = [];
  const answers = new Map<number, string>(); // roundIndex -> correctOptionId

  for (let index = 0; index < selectedSongs.length; index++) {
    const song = selectedSongs[index];
    const roundIndex = index + 1;
    const correctOptionId = `opt-${roundIndex}-correct`;
    answers.set(roundIndex, correctOptionId);

    const songCleanTitle = cleanTitle(song.title);

    const correctOption: TriviaOption = {
      id: correctOptionId,
      label: `${songCleanTitle} - ${song.artist}`,
      title: songCleanTitle,
      artist: song.artist,
    };

    const isSameArtistTargeted = sameArtistRounds.has(index);
    const uniqueDecoys: Array<{ title: string; artist: string }> = [];
    const usedTitles = new Set<string>([songCleanTitle.toLowerCase()]);

    // 1. Jika ronde ini ditargetkan memiliki 2-3 lagu dari penyanyi yang sama:
    if (isSameArtistTargeted) {
      const sameArtistCandidates = await fetchSameArtistCandidates(song.artist, songCleanTitle, validPool);
      // Ingin 1-2 lagu tambahan dari penyanyi yang sama (sehingga total ada 2-3 pilihan artis tsb)
      const targetSameArtistCount = Math.random() < 0.5 ? 2 : 1;
      const shuffledSame = shuffleArray(sameArtistCandidates);

      for (const item of shuffledSame) {
        const itemTitleNorm = item.title.toLowerCase();
        if (!usedTitles.has(itemTitleNorm)) {
          usedTitles.add(itemTitleNorm);
          uniqueDecoys.push(item);
          if (uniqueDecoys.length >= targetSameArtistCount) break;
        }
      }
    }

    // 2. Lengkapi sisa pengecoh dari lagu-lagu lain di dalam pool/playlist yang sama (se-genre!)
    const otherPoolSongs = validPool.filter(
      (item) => cleanTitle(item.title).toLowerCase() !== songCleanTitle.toLowerCase()
    );
    for (const other of shuffleArray(otherPoolSongs)) {
      if (uniqueDecoys.length >= 3) break;
      const otherTitle = cleanTitle(other.title);
      const otherTitleNorm = otherTitle.toLowerCase();
      if (!usedTitles.has(otherTitleNorm)) {
        usedTitles.add(otherTitleNorm);
        uniqueDecoys.push({
          title: otherTitle,
          artist: other.artist,
        });
      }
    }

    // 3. Pengecoh cadangan jika opsi unik masih kurang dari 3
    if (uniqueDecoys.length < 3) {
      try {
        const mbRecordings = await fetchMusicBrainzArtistRecordings(song.artist, 4);
        for (const mbTitle of mbRecordings) {
          const mbTitleNorm = cleanTitle(mbTitle).toLowerCase();
          if (!usedTitles.has(mbTitleNorm)) {
            usedTitles.add(mbTitleNorm);
            uniqueDecoys.push({ title: cleanTitle(mbTitle), artist: song.artist });
            if (uniqueDecoys.length >= 3) break;
          }
        }
      } catch {}
    }

    // 4. Fallback absolut jika benar-benar kurang
    let fallbackCounter = 1;
    while (uniqueDecoys.length < 3) {
      uniqueDecoys.push({
        title: `Pilihan Lagu ${fallbackCounter++}`,
        artist: song.artist,
      });
    }

    const decoyOptions: TriviaOption[] = uniqueDecoys.slice(0, 3).map((item, dIdx) => ({
      id: `opt-${roundIndex}-decoy-${dIdx + 1}`,
      label: `${item.title} - ${item.artist}`,
      title: item.title,
      artist: item.artist,
    }));

    // Acak posisi 4 pilihan ganda (A, B, C, D)
    const options = shuffleArray([correctOption, ...decoyOptions]);

    // Cuplikan offset detik: mulai di sekitar 20s - 35s (bagian verse/chorus)
    const dur = song.duration || 180;
    const snippetStartSec = Math.max(15, Math.min(35, Math.floor(dur * 0.2)));

    questions.push({
      roundIndex,
      totalRounds: selectedSongs.length,
      trackId: song.id,
      provider: song.provider || "yt",
      snippetStartSec,
      durationSec: roundDurationSec,
      options,
      startTime: 0,
      endTime: 0,
      isAudioReady: false,
    });
  }

  return { questions, answers };
}

/**
 * Pre-resolves audio stream URLs into streamCache so that requests
 * to /api/stream/:id return in 0ms without waiting for yt-dlp.
 * Uses controlled batching (2 at a time) to prevent system process exhaustion & rate limits.
 */
export async function preResolveTriviaStreams(questions: TriviaQuestion[]) {
  try {
    const { resolveStreamUrl } = await import("../stream/resolver.ts");
    for (let i = 0; i < questions.length; i += 2) {
      const batch = questions.slice(i, i + 2);
      await Promise.allSettled(
        batch.map((q) =>
          resolveStreamUrl(q.trackId, q.provider).catch((err) => {
            console.warn(`[trivia] Pre-resolve stream failed for track ${q.trackId}:`, err);
          })
        )
      );
    }
  } catch (err) {
    console.warn("[trivia] Error during preResolveTriviaStreams:", err);
  }
}

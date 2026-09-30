import type { QueueTrack, SearchResult } from "../types.ts";
import { getRelatedTracks, searchTracks } from "../search/index.ts";
import { jukeboxDb } from "../db.ts";

const COLD_START_SEEDS = [
  { title: "Creep", artist: "Radiohead" },
  { title: "Get Lucky", artist: "Daft Punk" },
  { title: "Dreams", artist: "Fleetwood Mac" },
  { title: "Feel Good Inc.", artist: "Gorillaz" },
  { title: "Blinding Lights", artist: "The Weeknd" },
  { title: "The Less I Know The Better", artist: "Tame Impala" },
  { title: "Levitating", artist: "Dua Lipa" },
  { title: "Come as You Are", artist: "Nirvana" },
];

export class AutoDjService {
  private playedIds = new Set<string>();
  private candidatePool: SearchResult[] = [];
  private poolAnchorId: string | null = null;
  private consecutivePoolPicks = 0;
  private readonly MAX_CONSECUTIVE_POOL_PICKS = 3;

  public markPlayed(id: string) {
    this.playedIds.add(id);
    if (this.playedIds.size > 200) {
      // Keep set bounded: remove the first 50 entries
      const toDelete = Array.from(this.playedIds).slice(0, 50);
      for (const item of toDelete) this.playedIds.delete(item);
    }
  }

  public resetMemory() {
    this.playedIds.clear();
    this.resetPool();
  }

  /**
   * Resets the candidate pool and pick counter.
   * Call this when a human queues a song to immediately align Auto DJ to the new vibe.
   */
  public resetPool() {
    this.candidatePool = [];
    this.poolAnchorId = null;
    this.consecutivePoolPicks = 0;
  }

  /**
   * Generates the next song recommendation for the queue using a hybrid
   * candidate pool (buffer) and YouTube Music's algorithmic up-next recommendations.
   *
   * @param history Recent playback history (most recently played first)
   * @param activeQueueIds Track IDs currently waiting in the active queue
   */
  public async getNextRecommendation(
    history: QueueTrack[],
    activeQueueIds: string[] = []
  ): Promise<SearchResult | null> {
    try {
      // 1. Build an excluded IDs set
      const excludedIds = new Set<string>([
        ...this.playedIds,
        ...history.map((h) => h.id),
        ...activeQueueIds,
      ]);

      // 2. Check existing candidate pool (vibe buffer)
      if (
        this.candidatePool.length > 0 &&
        this.consecutivePoolPicks < this.MAX_CONSECUTIVE_POOL_PICKS
      ) {
        const unplayedInPool = this.candidatePool.filter(
          (c) =>
            !excludedIds.has(c.id) &&
            (!c.duration || (c.duration <= 900 && (c.duration === 0 || c.duration >= 30)))
        );

        if (unplayedInPool.length >= 2) {
          const selected = this.selectWeightedCandidate(unplayedInPool);
          this.consecutivePoolPicks++;
          console.log(
            `[autoDj] Selected from active vibe pool (pick ${this.consecutivePoolPicks}/${this.MAX_CONSECUTIVE_POOL_PICKS}): "${selected.title}" by ${selected.artist} (${unplayedInPool.length} candidates left in pool, 0ms latency)`
          );
          this.markPlayed(selected.id);
          return selected;
        }
      }

      // 3. Pool is low, expired, or empty: identify seed tracks to replenish
      const seeds: Array<{ id?: string; title?: string; artist?: string }> = [];

      if (history.length > 0) {
        // Use most recent tracks as seeds (prioritizing the most recent track)
        for (const track of history.slice(0, 4)) {
          seeds.push({ id: track.id, title: track.title, artist: track.artist });
        }
      } else {
        // Queue/history empty: check persistent DB for office favorites or recent history
        const dbRecents = jukeboxDb.getRecentTracks(undefined, 5);
        if (dbRecents.length > 0) {
          for (const track of dbRecents) {
            seeds.push({ id: track.id, title: track.title, artist: track.artist });
          }
        } else {
          const dbTop = jukeboxDb.getTopTracks(5);
          if (dbTop.length > 0) {
            for (const track of dbTop) {
              seeds.push({ id: track.id, title: track.title, artist: track.artist });
            }
          }
        }
      }

      // If still no seeds (cold start with fresh empty DB), pick a curated seed
      if (seeds.length === 0) {
        const coldSeed = COLD_START_SEEDS[Math.floor(Math.random() * COLD_START_SEEDS.length)];
        seeds.push(coldSeed);
      }

      // 4. Try seeds to replenish candidate pool
      for (const seed of seeds) {
        console.log(`[autoDj] Replenishing recommendations related to "${seed.title || seed.artist || seed.id}"...`);
        let candidates: SearchResult[] = [];

        try {
          candidates = await getRelatedTracks(seed.id, seed.artist);
        } catch (err) {
          console.warn(`[autoDj] Error getting related tracks for seed ${seed.id}:`, err);
        }

        // If seed didn't have an ID (e.g. cold start seed) or getRelatedTracks returned empty, try searching for the seed first
        if (candidates.length === 0 && seed.title && seed.artist && !seed.id) {
          try {
            const found = await searchTracks(`${seed.title} ${seed.artist}`);
            if (found.length > 0) {
              const matched = found[0];
              candidates = await getRelatedTracks(matched.id, matched.artist);
              if (!excludedIds.has(matched.id) && candidates.length === 0) {
                candidates = [matched];
              }
            }
          } catch (e) {
            console.warn(`[autoDj] Cold start seed search failed:`, e);
          }
        }

        // Filter valid candidates
        const valid = candidates.filter((c) => {
          if (excludedIds.has(c.id)) return false;
          if (seed.id && c.id === seed.id) return false;
          // Filter out tracks longer than 15 minutes (often playlists or multi-hour ambient streams)
          if (c.duration && c.duration > 900) return false;
          // Filter out ultra-short clips (< 30s) if duration is provided
          if (c.duration && c.duration > 0 && c.duration < 30) return false;
          return true;
        });

        if (valid.length > 0) {
          // Store all valid candidates in pool for upcoming picks
          this.candidatePool = valid;
          this.poolAnchorId = seed.id || seed.artist || null;
          this.consecutivePoolPicks = 1;

          const selected = this.selectWeightedCandidate(valid);
          console.log(
            `[autoDj] Refreshed pool and selected candidate: "${selected.title}" by ${selected.artist} (${valid.length} tracks buffered)`
          );
          this.markPlayed(selected.id);
          return selected;
        }
      }

      // 5. Fallback: If all candidates from all seeds were marked as played,
      // prune older played IDs and retry the primary seed
      if (this.playedIds.size > 0 && seeds.length > 0) {
        console.log("[autoDj] All related tracks played; recycling older played history...");
        const halfSize = Math.floor(this.playedIds.size / 2);
        const toDelete = Array.from(this.playedIds).slice(0, halfSize);
        for (const id of toDelete) {
          this.playedIds.delete(id);
          excludedIds.delete(id);
        }

        const primarySeed = seeds[0];
        const candidates = await getRelatedTracks(primarySeed.id, primarySeed.artist);
        const valid = candidates.filter(
          (c) =>
            !activeQueueIds.includes(c.id) &&
            !history.some((h) => h.id === c.id) &&
            c.id !== primarySeed.id &&
            (!c.duration || c.duration <= 900)
        );

        if (valid.length > 0) {
          this.candidatePool = valid;
          this.consecutivePoolPicks = 1;
          const selected = valid[0];
          console.log(`[autoDj] Recycled fallback selected: "${selected.title}" by ${selected.artist}`);
          this.markPlayed(selected.id);
          return selected;
        }
      }

      // 6. Ultimate Fallback: search popular artist hits
      if (seeds.length > 0 && seeds[0].artist) {
        const artist = seeds[0].artist;
        console.log(`[autoDj] Fallback search for "${artist} hits"...`);
        const searchResults = await searchTracks(`${artist} hits`);
        const fallback = searchResults.find(
          (r) => !activeQueueIds.includes(r.id) && !history.some((h) => h.id === r.id)
        );
        if (fallback) {
          this.resetPool();
          this.markPlayed(fallback.id);
          return fallback;
        }
      }
    } catch (err) {
      console.warn("[autoDj] Failed to get recommendation:", err);
    }

    return null;
  }

  /**
   * Selects a candidate from the top unplayed candidates with weighted probability:
   * Favors YouTube Music's #1 recommendation while allowing #2 and #3 to be chosen
   * occasionally to provide variety without leaving the musical genre/mood.
   */
  private selectWeightedCandidate(candidates: SearchResult[]): SearchResult {
    const topPool = candidates.slice(0, 3);
    if (topPool.length === 1) return topPool[0];
    if (topPool.length === 2) {
      // 70% chance for #1, 30% chance for #2
      return Math.random() < 0.7 ? topPool[0] : topPool[1];
    }
    // 3 or more candidates: 60% chance for #1, 25% for #2, 15% for #3
    const rand = Math.random();
    if (rand < 0.6) return topPool[0];
    if (rand < 0.85) return topPool[1];
    return topPool[2];
  }
}

export const autoDj = new AutoDjService();

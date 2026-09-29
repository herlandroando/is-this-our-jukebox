import type { QueueTrack, SearchResult } from "../types.ts";
import { searchTracks } from "../search/index.ts";

const CURATED_SEEDS = [
  "lofi hip hop radio chill beats",
  "daft punk get lucky",
  "fleetwood mac dreams",
  "gorillaz feel good inc",
  "the weeknd blinding lights",
  "khruangbin texas sun",
  "tame impala the less i know the better",
  "masego tadow",
  "dua lipa levitating",
  "billie eilish ocean eyes",
];

export class AutoDjService {
  private playedIds = new Set<string>();

  public markPlayed(id: string) {
    this.playedIds.add(id);
    if (this.playedIds.size > 200) {
      // Keep set bounded
      const toDelete = Array.from(this.playedIds).slice(0, 50);
      for (const item of toDelete) this.playedIds.delete(item);
    }
  }

  /**
   * Generates the next song recommendation for the queue.
   */
  public async getNextRecommendation(history: QueueTrack[]): Promise<SearchResult | null> {
    try {
      let query = "";

      if (history.length > 0) {
        // Pick from the last 3 played tracks to stay in a similar musical vibe
        const recent = history.slice(0, 3);
        const sample = recent[Math.floor(Math.random() * recent.length)];
        query = `${sample.artist} radio`;
      } else {
        // Use a random curated seed
        query = CURATED_SEEDS[Math.floor(Math.random() * CURATED_SEEDS.length)];
      }

      console.log(`[autoDj] Finding next track with query: "${query}"`);
      const results = await searchTracks(query);

      // Filter out songs that were already played
      const candidate = results.find(
        (r) => !this.playedIds.has(r.id) && !history.some((h) => h.id === r.id)
      );

      if (candidate) {
        this.playedIds.add(candidate.id);
        return candidate;
      }

      // If all were played, pick any result not equal to the currently playing song
      if (results.length > 0) {
        return results[0];
      }
    } catch (err) {
      console.warn("[autoDj] Failed to get recommendation:", err);
    }

    return null;
  }
}

export const autoDj = new AutoDjService();

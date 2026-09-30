import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { QueueTrack, SearchResult } from "./types.ts";

export interface TopTrackResult extends SearchResult {
  playCount: number;
  lastPlayedAt?: number;
}

class JukeboxDatabase {
  private db: Database;
  private clearQueueStmt!: ReturnType<Database["prepare"]>;
  private saveQueueStmt!: ReturnType<Database["prepare"]>;
  private loadQueueStmt!: ReturnType<Database["prepare"]>;
  private saveNowPlayingStmt!: ReturnType<Database["prepare"]>;
  private loadNowPlayingStmt!: ReturnType<Database["prepare"]>;
  private recordTrackStmt!: ReturnType<Database["prepare"]>;
  private saveMetaStmt!: ReturnType<Database["prepare"]>;
  private getMetaStmt!: ReturnType<Database["prepare"]>;

  constructor() {
    const defaultPath = join(process.cwd(), "data", "jukebox.db");
    const dbPath = process.env.JUKEBOX_DB_PATH || defaultPath;

    const dir = dirname(dbPath);
    if (dir && dir !== "." && dir !== "/" && dir !== "\\" && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL;");
    this.initTables();
    this.initStatements();
  }

  private initStatements() {
    this.clearQueueStmt = this.db.prepare("DELETE FROM queue_items");
    this.saveQueueStmt = this.db.prepare(`
      INSERT INTO queue_items (
        queue_id, id, provider, permalink, title, artist,
        thumbnail, duration, requested_by, requested_at,
        votes, voters_json, voted_ips_json, status, fallback_count, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.loadQueueStmt = this.db.prepare("SELECT * FROM queue_items ORDER BY position ASC");

    this.saveNowPlayingStmt = this.db.prepare(`
      INSERT INTO now_playing (id, track_json, seek_time, duration, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        track_json = excluded.track_json,
        seek_time = excluded.seek_time,
        duration = excluded.duration,
        updated_at = excluded.updated_at
    `);
    this.loadNowPlayingStmt = this.db.prepare(
      "SELECT track_json, seek_time, duration FROM now_playing WHERE id = 1"
    );

    this.recordTrackStmt = this.db.prepare(`
      INSERT INTO track_stats (
        id, provider, permalink, title, artist,
        thumbnail, duration, requested_by, client_id, played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.saveMetaStmt = this.db.prepare(`
      INSERT INTO server_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    this.getMetaStmt = this.db.prepare("SELECT value FROM server_meta WHERE key = ?");
  }

  private initTables() {
    // 1. Persistent Active Queue
    this.db.run(`
      CREATE TABLE IF NOT EXISTS queue_items (
        queue_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        provider TEXT NOT NULL,
        permalink TEXT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        thumbnail TEXT,
        duration INTEGER NOT NULL,
        requested_by TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        votes INTEGER NOT NULL DEFAULT 1,
        voters_json TEXT NOT NULL DEFAULT '[]',
        voted_ips_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        fallback_count INTEGER DEFAULT 0,
        position INTEGER NOT NULL
      );
    `);

    // 2. Persistent Now Playing Track
    this.db.run(`
      CREATE TABLE IF NOT EXISTS now_playing (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        track_json TEXT,
        seek_time REAL DEFAULT 0,
        duration REAL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);

    // 3. Track Play & Request Statistics (For Office Top Hits & Recents)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS track_stats (
        id TEXT NOT NULL,
        provider TEXT NOT NULL,
        permalink TEXT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        thumbnail TEXT,
        duration INTEGER NOT NULL,
        requested_by TEXT,
        client_id TEXT,
        played_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_track_stats_id ON track_stats (id);
      CREATE INDEX IF NOT EXISTS idx_track_stats_client ON track_stats (client_id);
      CREATE INDEX IF NOT EXISTS idx_track_stats_played_at ON track_stats (played_at DESC);
    `);

    // 4. Server Metadata (auto-dj, passcode, volume, etc.)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS server_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // --- Queue Persistence ---

  public saveQueue(items: QueueTrack[]) {
    const tx = this.db.transaction((tracks: QueueTrack[]) => {
      this.clearQueueStmt.run();

      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        this.saveQueueStmt.run(
          t.queueId,
          t.id,
          t.provider,
          t.permalink || null,
          t.title,
          t.artist,
          t.thumbnail || null,
          t.duration || 0,
          t.requestedBy || "Anonymous",
          t.requestedAt || Date.now(),
          t.votes || 1,
          JSON.stringify(t.voters || []),
          JSON.stringify(t.votedIps || []),
          t.status || "pending",
          t.fallbackCount || 0,
          i
        );
      }
    });

    try {
      tx(items);
    } catch (err) {
      console.error("[db] Error saving queue:", err);
    }
  }

  public loadQueue(): QueueTrack[] {
    try {
      const rows = this.loadQueueStmt.all() as any[];

      return rows.map((r) => ({
        queueId: r.queue_id,
        id: r.id,
        provider: r.provider,
        permalink: r.permalink || undefined,
        title: r.title,
        artist: r.artist,
        thumbnail: r.thumbnail || "",
        duration: r.duration,
        requestedBy: r.requested_by,
        requestedAt: r.requested_at,
        votes: r.votes,
        voters: JSON.parse(r.voters_json || "[]"),
        votedIps: JSON.parse(r.voted_ips_json || "[]"),
        status: r.status,
        fallbackCount: r.fallback_count || 0,
      }));
    } catch (err) {
      console.error("[db] Error loading queue:", err);
      return [];
    }
  }

  // --- Now Playing Persistence ---

  public saveNowPlaying(track: QueueTrack | null, currentTime: number = 0, duration: number = 0) {
    try {
      this.saveNowPlayingStmt.run(
        track ? JSON.stringify(track) : null,
        currentTime,
        duration,
        Date.now()
      );
    } catch (err) {
      console.error("[db] Error saving now playing:", err);
    }
  }

  public loadNowPlaying(): { track: QueueTrack | null; currentTime: number; duration: number } | null {
    try {
      const row = this.loadNowPlayingStmt.get() as any;
      if (!row || !row.track_json) return null;

      const track = JSON.parse(row.track_json) as QueueTrack;
      return {
        track,
        currentTime: row.seek_time || 0,
        duration: row.duration || track.duration || 0,
      };
    } catch (err) {
      console.error("[db] Error loading now playing:", err);
      return null;
    }
  }

  // --- Track History & Play Count Statistics ---

  public recordTrackPlayed(track: QueueTrack, clientId?: string) {
    try {
      this.recordTrackStmt.run(
        track.id,
        track.provider,
        track.permalink || null,
        track.title,
        track.artist,
        track.thumbnail || null,
        track.duration || 0,
        track.requestedBy || "Auto-DJ 🎧",
        clientId || (track.voters && track.voters[0]?.clientId) || null,
        Date.now()
      );
    } catch (err) {
      console.error("[db] Error recording track stats:", err);
    }
  }

  public getTopTracks(limit: number = 30): TopTrackResult[] {
    try {
      const rows = this.db
        .query(`
          SELECT 
            id, provider, permalink, title, artist, thumbnail, duration,
            COUNT(*) as play_count,
            MAX(played_at) as last_played_at
          FROM track_stats
          GROUP BY id
          ORDER BY play_count DESC, last_played_at DESC
          LIMIT ?
        `)
        .all(limit) as any[];

      return rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        permalink: r.permalink || undefined,
        title: r.title,
        artist: r.artist,
        thumbnail: r.thumbnail || "",
        duration: r.duration,
        playCount: r.play_count,
        lastPlayedAt: r.last_played_at,
      }));
    } catch (err) {
      console.error("[db] Error getting top tracks:", err);
      return [];
    }
  }

  public getRecentTracks(clientId?: string, limit: number = 30): SearchResult[] {
    try {
      let rows: any[];
      if (clientId) {
        rows = this.db
          .query(`
            SELECT
              id, provider, permalink, title, artist, thumbnail, duration,
              MAX(played_at) as recent_time
            FROM track_stats
            WHERE client_id = ?
            GROUP BY id
            ORDER BY recent_time DESC
            LIMIT ?
          `)
          .all(clientId, limit) as any[];
      } else {
        rows = this.db
          .query(`
            SELECT
              id, provider, permalink, title, artist, thumbnail, duration,
              MAX(played_at) as recent_time
            FROM track_stats
            GROUP BY id
            ORDER BY recent_time DESC
            LIMIT ?
          `)
          .all(limit) as any[];
      }

      return rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        permalink: r.permalink || undefined,
        title: r.title,
        artist: r.artist,
        thumbnail: r.thumbnail || "",
        duration: r.duration,
      }));
    } catch (err) {
      console.error("[db] Error getting recent tracks:", err);
      return [];
    }
  }

  // --- Server Meta Persistence ---

  public saveMeta(key: string, value: string) {
    try {
      this.saveMetaStmt.run(key, value);
    } catch (err) {
      console.error(`[db] Error saving meta ${key}:`, err);
    }
  }

  public getMeta(key: string): string | null {
    try {
      const row = this.getMetaStmt.get(key) as any;
      return row ? row.value : null;
    } catch {
      return null;
    }
  }

  public close() {
    this.db.close();
  }
}

export const jukeboxDb = new JukeboxDatabase();

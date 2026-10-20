import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { QueueTrack, SearchResult } from "./types.ts";
import type { TriviaPresetItem } from "./trivia/types.ts";
import type {
  RhythmBeatmap,
  RhythmScoreSubmission,
  RhythmScoreEntry,
  RankedSongSummary,
  GlobalUserRanking,
} from "./rhythm/types.ts";

export interface TopTrackResult extends SearchResult {
  playCount: number;
  lastPlayedAt?: number;
}

export interface CachedTrackMetadata {
  id: string;
  provider: string;
  title: string;
  artist: string;
  genre?: string;
  mood: "hype" | "lofi" | "romance" | "galau";
  tags: string[];
  source: string;
  updatedAt: number;
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
  private getMetadataStmt!: ReturnType<Database["prepare"]>;
  private getMetadataByArtistTitleStmt!: ReturnType<Database["prepare"]>;
  private saveMetadataStmt!: ReturnType<Database["prepare"]>;

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

    this.getMetadataStmt = this.db.prepare(
      "SELECT * FROM track_metadata_cache WHERE id = ?"
    );
    this.getMetadataByArtistTitleStmt = this.db.prepare(
      "SELECT * FROM track_metadata_cache WHERE lower(artist) = ? AND lower(title) = ? LIMIT 1"
    );
    this.saveMetadataStmt = this.db.prepare(`
      INSERT INTO track_metadata_cache (
        id, provider, title, artist, genre, mood, tags_json, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        artist = excluded.artist,
        genre = excluded.genre,
        mood = excluded.mood,
        tags_json = excluded.tags_json,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);
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

    // 5. Rhythm Beatmaps Cache
    this.db.run(`
      CREATE TABLE IF NOT EXISTS rhythm_beatmaps (
        track_id TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        bpm REAL NOT NULL,
        beatmap_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (track_id, difficulty)
      );
    `);

    // 6. Rhythm Scores & Leaderboard
    this.db.run(`
      CREATE TABLE IF NOT EXISTS rhythm_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        track_title TEXT NOT NULL,
        track_artist TEXT NOT NULL,
        track_thumbnail TEXT,
        client_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        score INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        max_combo INTEGER NOT NULL,
        grade TEXT NOT NULL,
        hits_300 INTEGER NOT NULL,
        hits_200 INTEGER NOT NULL,
        hits_100 INTEGER NOT NULL,
        hits_50 INTEGER NOT NULL,
        misses INTEGER NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'normal',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rhythm_scores_track ON rhythm_scores (track_id, score DESC);
      CREATE INDEX IF NOT EXISTS idx_rhythm_scores_client ON rhythm_scores (client_id);
      CREATE INDEX IF NOT EXISTS idx_rhythm_scores_created ON rhythm_scores (created_at DESC);
    `);

    // 7. Track Metadata Cache (MusicBrainz CC0 / Last.fm / Source of Truth)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS track_metadata_cache (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        genre TEXT,
        mood TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_track_metadata_mood ON track_metadata_cache (mood);
      CREATE INDEX IF NOT EXISTS idx_track_metadata_artist_title ON track_metadata_cache (artist, title);
    `);

    // 8. Trivia Presets Table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trivia_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        type TEXT NOT NULL,
        playlist_id TEXT,
        is_builtin INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        cached_songs_json TEXT,
        last_synced_at INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);
    this.seedDefaultTriviaPresets();
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

  // --- Rhythm Beatmaps & Scores Persistence ---

  public saveBeatmap(trackId: string, difficulty: string, bpm: number, beatmapJson: string) {
    try {
      this.db
        .prepare(`
          INSERT INTO rhythm_beatmaps (track_id, difficulty, bpm, beatmap_json, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(track_id, difficulty) DO UPDATE SET
            bpm = excluded.bpm,
            beatmap_json = excluded.beatmap_json,
            created_at = excluded.created_at
        `)
        .run(trackId, difficulty, bpm, beatmapJson, Date.now());
    } catch (err) {
      console.error(`[db] Error saving beatmap for ${trackId}:`, err);
    }
  }

  public getBeatmap(trackId: string, difficulty: string): RhythmBeatmap | null {
    try {
      const row = this.db
        .prepare("SELECT * FROM rhythm_beatmaps WHERE track_id = ? AND difficulty = ?")
        .get(trackId, difficulty) as any;
      if (!row || !row.beatmap_json) return null;
      return JSON.parse(row.beatmap_json) as RhythmBeatmap;
    } catch (err) {
      console.error(`[db] Error reading beatmap for ${trackId}:`, err);
      return null;
    }
  }

  public saveRhythmScore(data: RhythmScoreSubmission): RhythmScoreEntry {
    const now = Date.now();
    const info = this.db
      .prepare(`
        INSERT INTO rhythm_scores (
          track_id, track_title, track_artist, track_thumbnail,
          client_id, nickname, score, accuracy, max_combo, grade,
          hits_300, hits_200, hits_100, hits_50, misses, difficulty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        data.trackId,
        data.trackTitle,
        data.trackArtist,
        data.trackThumbnail || null,
        data.clientId,
        data.nickname || "Anonymous",
        data.score,
        data.accuracy,
        data.maxCombo,
        data.grade,
        data.hits300,
        data.hits200,
        data.hits100,
        data.hits50,
        data.misses,
        data.difficulty || "normal",
        now
      );

    return {
      ...data,
      id: Number(info.lastInsertRowid),
      createdAt: now,
    };
  }

  public getTrackLeaderboard(trackId: string, limit = 10): RhythmScoreEntry[] {
    try {
      const rows = this.db
        .prepare(`
          SELECT * FROM rhythm_scores
          WHERE track_id = ?
          ORDER BY score DESC, accuracy DESC, created_at ASC
          LIMIT ?
        `)
        .all(trackId, limit) as any[];

      return rows.map((r) => ({
        id: r.id,
        trackId: r.track_id,
        trackTitle: r.track_title,
        trackArtist: r.track_artist,
        trackThumbnail: r.track_thumbnail || undefined,
        clientId: r.client_id,
        nickname: r.nickname,
        score: r.score,
        accuracy: r.accuracy,
        maxCombo: r.max_combo,
        grade: r.grade,
        hits300: r.hits_300,
        hits200: r.hits_200,
        hits100: r.hits_100,
        hits50: r.hits_50,
        misses: r.misses,
        difficulty: r.difficulty,
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.error(`[db] Error getting leaderboard for ${trackId}:`, err);
      return [];
    }
  }

  public getAllRankedSongs(searchQuery = "", limit = 50): RankedSongSummary[] {
    try {
      const q = searchQuery.trim();
      const pattern = `%${q}%`;

      const rows = this.db
        .prepare(`
          SELECT 
            s.track_id,
            s.track_title,
            s.track_artist,
            s.track_thumbnail,
            MAX(s.score) as top_score,
            COUNT(s.id) as total_plays,
            (SELECT nickname FROM rhythm_scores WHERE track_id = s.track_id ORDER BY score DESC LIMIT 1) as top_player,
            (SELECT grade FROM rhythm_scores WHERE track_id = s.track_id ORDER BY score DESC LIMIT 1) as top_grade
          FROM rhythm_scores s
          WHERE (? = '' OR s.track_title LIKE ? OR s.track_artist LIKE ?)
          GROUP BY s.track_id
          ORDER BY top_score DESC
          LIMIT ?
        `)
        .all(q, pattern, pattern, limit) as any[];

      return rows.map((r) => ({
        trackId: r.track_id,
        trackTitle: r.track_title,
        trackArtist: r.track_artist,
        trackThumbnail: r.track_thumbnail || undefined,
        topScore: r.top_score,
        topPlayer: r.top_player || "Anonymous",
        topGrade: r.top_grade || "D",
        totalPlays: r.total_plays,
      }));
    } catch (err) {
      console.error("[db] Error getting all ranked songs:", err);
      return [];
    }
  }

  public getGlobalUserRankings(limit = 20): GlobalUserRanking[] {
    try {
      // Find crowns (#1 player per track)
      const topSongRows = this.db
        .prepare(`
          SELECT track_id, (SELECT nickname FROM rhythm_scores WHERE track_id = s.track_id ORDER BY score DESC LIMIT 1) as winner
          FROM rhythm_scores s
          GROUP BY track_id
        `)
        .all() as Array<{ track_id: string; winner: string }>;

      const crownsMap = new Map<string, number>();
      for (const row of topSongRows) {
        if (row.winner) {
          crownsMap.set(row.winner, (crownsMap.get(row.winner) || 0) + 1);
        }
      }

      const rows = this.db
        .prepare(`
          SELECT
            nickname,
            client_id,
            SUM(score) as total_score,
            COUNT(id) as total_plays,
            ROUND(AVG(accuracy), 2) as avg_accuracy
          FROM rhythm_scores
          GROUP BY nickname
          ORDER BY total_score DESC
          LIMIT ?
        `)
        .all(limit) as any[];

      return rows.map((r) => ({
        nickname: r.nickname,
        clientId: r.client_id,
        totalScore: r.total_score,
        totalPlays: r.total_plays,
        crownsCount: crownsMap.get(r.nickname) || 0,
        avgAccuracy: r.avg_accuracy,
        bestGrade: "S",
      }));
    } catch (err) {
      console.error("[db] Error getting global user rankings:", err);
      return [];
    }
  }

  // --- Track Metadata Cache (Source of Truth) ---

  public getTrackMetadata(id?: string, artist?: string, title?: string): CachedTrackMetadata | null {
    try {
      let row: any = null;
      if (id) {
        row = this.getMetadataStmt.get(id);
      }
      if (!row && artist && title) {
        row = this.getMetadataByArtistTitleStmt.get(artist.trim().toLowerCase(), title.trim().toLowerCase());
      }
      if (!row) return null;
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags_json || "[]");
      } catch {}
      return {
        id: row.id,
        provider: row.provider,
        title: row.title,
        artist: row.artist,
        genre: row.genre || undefined,
        mood: row.mood as any,
        tags,
        source: row.source,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      console.warn("[db] getTrackMetadata error:", err);
      return null;
    }
  }

  public saveTrackMetadata(item: CachedTrackMetadata): void {
    try {
      const id = item.id || `${item.provider || "custom"}:${item.artist.trim().toLowerCase()}:${item.title.trim().toLowerCase()}`;
      const provider = item.provider || "youtube";
      this.saveMetadataStmt.run(
        id,
        provider,
        item.title,
        item.artist,
        item.genre || null,
        item.mood,
        JSON.stringify(item.tags || []),
        item.source,
        item.updatedAt || Date.now()
      );
    } catch (err) {
      console.warn("[db] saveTrackMetadata error:", err);
    }
  }

  // --- Trivia Presets Management ---

  private seedDefaultTriviaPresets(): void {
    try {
      const check = this.db.prepare("SELECT COUNT(*) as count FROM trivia_presets").get() as { count: number };
      if (check && check.count > 0) return;

      const seedPath = join(process.cwd(), "data", "trivia-presets.json");
      if (!existsSync(seedPath)) return;

      const content = readFileSync(seedPath, "utf-8");
      const list = JSON.parse(content);
      if (!Array.isArray(list)) return;

      const insertStmt = this.db.prepare(`
        INSERT INTO trivia_presets (
          id, name, description, icon, type, playlist_id,
          is_builtin, is_enabled, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      for (const item of list) {
        insertStmt.run(
          item.id,
          item.name,
          item.description || "",
          item.icon || "music",
          item.type || "playlist",
          item.playlistId || null,
          item.isBuiltin ? 1 : 0,
          item.isEnabled !== false ? 1 : 0,
          item.sortOrder || 0,
          now
        );
      }
      console.log(`[db] Seeded ${list.length} default trivia presets into database.`);
    } catch (err) {
      console.warn("[db] seedDefaultTriviaPresets error:", err);
    }
  }

  public getAllTriviaPresets(onlyEnabled = true): TriviaPresetItem[] {
    try {
      const query = onlyEnabled
        ? "SELECT * FROM trivia_presets WHERE is_enabled = 1 ORDER BY sort_order ASC, name ASC"
        : "SELECT * FROM trivia_presets ORDER BY sort_order ASC, name ASC";
      const rows = this.db.prepare(query).all() as any[];

      return rows.map((r) => {
        let songCount = 0;
        if (r.cached_songs_json) {
          try {
            const parsed = JSON.parse(r.cached_songs_json);
            if (Array.isArray(parsed)) songCount = parsed.length;
          } catch {}
        }
        return {
          id: r.id,
          name: r.name,
          description: r.description || "",
          icon: r.icon || "music",
          type: r.type,
          playlistId: r.playlist_id || undefined,
          isBuiltin: Boolean(r.is_builtin),
          isEnabled: Boolean(r.is_enabled),
          sortOrder: r.sort_order || 0,
          songCount,
          lastSyncedAt: r.last_synced_at || 0,
          updatedAt: r.updated_at || 0,
        };
      });
    } catch (err) {
      console.warn("[db] getAllTriviaPresets error:", err);
      return [];
    }
  }

  public getTriviaPreset(id: string): TriviaPresetItem | null {
    try {
      const row = this.db.prepare("SELECT * FROM trivia_presets WHERE id = ?").get(id) as any;
      if (!row) return null;
      let songCount = 0;
      if (row.cached_songs_json) {
        try {
          const parsed = JSON.parse(row.cached_songs_json);
          if (Array.isArray(parsed)) songCount = parsed.length;
        } catch {}
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description || "",
        icon: row.icon || "music",
        type: row.type,
        playlistId: row.playlist_id || undefined,
        isBuiltin: Boolean(row.is_builtin),
        isEnabled: Boolean(row.is_enabled),
        sortOrder: row.sort_order || 0,
        songCount,
        lastSyncedAt: row.last_synced_at || 0,
        updatedAt: row.updated_at || 0,
      };
    } catch (err) {
      console.warn("[db] getTriviaPreset error:", err);
      return null;
    }
  }

  public saveTriviaPreset(preset: Partial<TriviaPresetItem> & { id: string; name: string }): void {
    try {
      const now = Date.now();
      const existing = this.getTriviaPreset(preset.id);
      if (existing) {
        this.db.prepare(`
          UPDATE trivia_presets SET
            name = ?,
            description = ?,
            icon = ?,
            type = ?,
            playlist_id = ?,
            is_enabled = ?,
            sort_order = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          preset.name,
          preset.description ?? existing.description,
          preset.icon ?? existing.icon,
          preset.type ?? existing.type,
          preset.playlistId ?? existing.playlistId ?? null,
          preset.isEnabled !== undefined ? (preset.isEnabled ? 1 : 0) : (existing.isEnabled ? 1 : 0),
          preset.sortOrder ?? existing.sortOrder,
          now,
          preset.id
        );
      } else {
        this.db.prepare(`
          INSERT INTO trivia_presets (
            id, name, description, icon, type, playlist_id,
            is_builtin, is_enabled, sort_order, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          preset.id,
          preset.name,
          preset.description || "",
          preset.icon || "music",
          preset.type || "playlist",
          preset.playlistId || null,
          preset.isBuiltin ? 1 : 0,
          preset.isEnabled !== false ? 1 : 0,
          preset.sortOrder || 99,
          now
        );
      }
    } catch (err) {
      console.warn("[db] saveTriviaPreset error:", err);
      throw err;
    }
  }

  public deleteTriviaPreset(id: string): boolean {
    try {
      const row = this.getTriviaPreset(id);
      if (!row) return false;
      if (row.isBuiltin) {
        // Builtin cannot be permanently deleted, but can be disabled
        this.db.prepare("UPDATE trivia_presets SET is_enabled = 0, updated_at = ? WHERE id = ?").run(Date.now(), id);
        return true;
      }
      this.db.prepare("DELETE FROM trivia_presets WHERE id = ?").run(id);
      return true;
    } catch (err) {
      console.warn("[db] deleteTriviaPreset error:", err);
      return false;
    }
  }

  public updatePresetCache(id: string, songsJson: string, lastSyncedAt: number): void {
    try {
      this.db.prepare(`
        UPDATE trivia_presets SET
          cached_songs_json = ?,
          last_synced_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(songsJson, lastSyncedAt, Date.now(), id);
    } catch (err) {
      console.warn("[db] updatePresetCache error:", err);
    }
  }

  public getPresetCachedSongs(id: string): { cachedSongsJson: string; lastSyncedAt: number } | null {
    try {
      const row = this.db.prepare("SELECT cached_songs_json, last_synced_at FROM trivia_presets WHERE id = ?").get(id) as any;
      if (!row || !row.cached_songs_json) return null;
      return {
        cachedSongsJson: row.cached_songs_json,
        lastSyncedAt: row.last_synced_at || 0,
      };
    } catch (err) {
      console.warn("[db] getPresetCachedSongs error:", err);
      return null;
    }
  }

  public getTracksByArtist(artist: string, excludeTitle = "", limit = 5): Array<{ title: string; artist: string }> {
    try {
      const cleanArtist = artist.trim().toLowerCase();
      const cleanEx = excludeTitle.trim().toLowerCase();
      if (!cleanArtist) return [];

      const rows = this.db.prepare(`
        SELECT title, artist FROM (
          SELECT title, artist FROM track_stats WHERE lower(artist) LIKE ?
          UNION
          SELECT title, artist FROM track_metadata_cache WHERE lower(artist) LIKE ?
          UNION
          SELECT track_title as title, track_artist as artist FROM rhythm_scores WHERE lower(track_artist) LIKE ?
        )
        WHERE lower(title) NOT LIKE ?
        LIMIT ?
      `).all(`%${cleanArtist}%`, `%${cleanArtist}%`, `%${cleanArtist}%`, `%${cleanEx}%`, limit) as Array<{ title: string; artist: string }>;

      return rows || [];
    } catch (err) {
      console.warn("[db] getTracksByArtist error:", err);
      return [];
    }
  }

  public close() {
    this.db.close();
  }
}

export const jukeboxDb = new JukeboxDatabase();

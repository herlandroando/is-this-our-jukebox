import { randomUUID } from "node:crypto";
import type {
  MemberInfo,
  MemberRole,
  QueueTrack,
  SearchResult,
  ServerState,
  TrackVoter,
} from "../types.ts";
import { preResolveTrack } from "../stream/resolver.ts";
import { searchFallback } from "../search/index.ts";
import { autoDj } from "../stream/autoDj.ts";
import { jukeboxDb } from "../db.ts";
import { resolveTrackMetadata } from "../metadata/index.ts";
import { memoryBufferManager } from "../stream/memoryBuffer.ts";

export type StateListener = (state: ServerState) => void;
export type ToastListener = (message: string, type: "info" | "success" | "warning" | "error") => void;

const MAX_PENDING_PER_CLIENT = 5;

export function getRoleVoteWeight(role: MemberRole): number {
  switch (role) {
    case "host":
      return 5;
    case "dj":
      return 3;
    case "vip":
      return 2;
    case "member":
      return 1;
    case "listener":
      return 0;
    default:
      return 1;
  }
}

export class QueueStore {
  private queue: QueueTrack[] = [];
  private history: QueueTrack[] = [];
  private nowPlaying: QueueTrack | null = null;
  private isPlaying = false;
  private currentTime = 0;
  private duration = 0;
  private volume = 80;
  private outputMode: "browser" | "native" = "browser";
  private autoDjEnabled = true;
  private karaokeEnabled = false;
  private karaokeLevel = 90;
  private activeListeners = 0;
  private members: Map<string, MemberInfo> = new Map();
  private djPasscode = "office-dj";
  private allowRemoteAudio = process.env.ALLOW_REMOTE_AUDIO !== "false";
  private publicUrl: string | null = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.trim().replace(/\/+$/, "") : null;
  private tunnelMode: string = process.env.TUNNEL_MODE || (process.env.PUBLIC_URL ? "named" : "off");
  private failedPasscodeAttempts = new Map<string, { count: number; lockedUntil: number }>();
  private savedJukeboxState: {
    track: QueueTrack | null;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
  } | null = null;

  private stateListeners: Set<StateListener> = new Set();
  private toastListeners: Set<ToastListener> = new Set();

  constructor() {
    // Restore persistent queue and playback state from SQLite
    try {
      const restoredQueue = jukeboxDb.loadQueue();
      if (restoredQueue.length > 0) {
        this.queue = restoredQueue;
        this.sortQueue();
        console.log(`[queue] Restored ${restoredQueue.length} tracks from persistent storage.`);
      }

      const restoredNowPlaying = jukeboxDb.loadNowPlaying();
      if (restoredNowPlaying && restoredNowPlaying.track) {
        this.nowPlaying = restoredNowPlaying.track;
        this.currentTime = restoredNowPlaying.currentTime || 0;
        this.duration = restoredNowPlaying.duration || restoredNowPlaying.track.duration || 0;
        this.isPlaying = false; // Restored in paused state as requested
        console.log(`[queue] Restored now-playing track: "${this.nowPlaying.title}" (paused).`);
        if (!this.nowPlaying.mood) {
          this.enrichTrackMetadata(this.nowPlaying);
        }
      }

      const savedAutoDj = jukeboxDb.getMeta("auto_dj_enabled");
      if (savedAutoDj !== null) this.autoDjEnabled = savedAutoDj === "true";

      const savedDjPasscode = jukeboxDb.getMeta("dj_passcode");
      if (savedDjPasscode !== null) this.djPasscode = savedDjPasscode;

      const savedVolume = jukeboxDb.getMeta("volume");
      if (savedVolume !== null) this.volume = Number(savedVolume);
    } catch (err) {
      console.warn("[queue] Error restoring state from db:", err);
    }
  }

  public subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onToast(listener: ToastListener): () => void {
    this.toastListeners.add(listener);
    return () => this.toastListeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    for (const listener of this.stateListeners) {
      listener(s);
    }
  }

  public toast(message: string, type: "info" | "success" | "warning" | "error" = "info") {
    for (const listener of this.toastListeners) {
      listener(message, type);
    }
  }

  public getState(): ServerState {
    return {
      nowPlaying: this.nowPlaying,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
      volume: this.volume,
      outputMode: this.outputMode,
      autoDjEnabled: this.autoDjEnabled,
      karaokeEnabled: this.karaokeEnabled,
      karaokeLevel: this.karaokeLevel,
      queue: [...this.queue],
      history: [...this.history],
      activeListeners: this.activeListeners,
      members: Array.from(this.members.values()),
      djPasscodeEnabled: !!this.djPasscode,
      allowRemoteAudio: this.allowRemoteAudio,
      publicUrl: this.publicUrl,
      tunnelMode: this.tunnelMode,
    };
  }

  public getAllowRemoteAudio(): boolean {
    return this.allowRemoteAudio;
  }

  public setAllowRemoteAudio(allowed: boolean) {
    this.allowRemoteAudio = allowed;
    this.notify();
  }

  public getPublicUrl(): string | null {
    return this.publicUrl;
  }

  public setPublicUrl(url: string | null, mode?: string) {
    this.publicUrl = url ? url.trim().replace(/\/+$/, "") : null;
    if (mode) this.tunnelMode = mode;
    this.notify();
  }

  public getTunnelMode(): string {
    return this.tunnelMode;
  }

  public checkPasscodeRateLimit(clientKey: string): { locked: boolean; retryAfterSeconds: number } {
    const record = this.failedPasscodeAttempts.get(clientKey);
    if (!record) return { locked: false, retryAfterSeconds: 0 };
    const now = Date.now();
    if (record.lockedUntil > now) {
      return { locked: true, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
    }
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      this.failedPasscodeAttempts.delete(clientKey);
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  public recordPasscodeAttempt(clientKey: string, success: boolean) {
    if (success) {
      this.failedPasscodeAttempts.delete(clientKey);
      return;
    }
    const now = Date.now();
    const record = this.failedPasscodeAttempts.get(clientKey) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= 5) {
      record.lockedUntil = now + 2 * 60 * 1000; // 2 minutes lock
    }
    this.failedPasscodeAttempts.set(clientKey, record);
  }

  public setActiveListeners(count: number) {
    this.activeListeners = count;
    this.notify();
  }

  public setMember(info: MemberInfo, activeListeners?: number) {
    this.members.set(info.clientId, info);
    if (activeListeners !== undefined) {
      this.activeListeners = activeListeners;
    }
    this.notify();
  }

  public removeMember(clientId: string, activeListeners?: number) {
    this.members.delete(clientId);
    if (activeListeners !== undefined) {
      this.activeListeners = activeListeners;
    }
    this.notify();
  }

  public getMember(clientId: string): MemberInfo | undefined {
    return this.members.get(clientId);
  }

  public updateMemberRole(clientId: string, role: MemberRole): boolean {
    const member = this.members.get(clientId);
    if (!member) return false;
    member.role = role;
    this.notify();
    return true;
  }

  public updateMemberNickname(clientId: string, nickname: string): boolean {
    const member = this.members.get(clientId);
    if (!member) return false;
    member.nickname = nickname;
    this.notify();
    return true;
  }

  public updateMemberListening(clientId: string, isListening: boolean): boolean {
    const member = this.members.get(clientId);
    if (!member) return false;
    member.isListening = isListening;
    this.notify();
    return true;
  }

  public verifyDjPasscode(candidate: string): boolean {
    if (!this.djPasscode) return false;
    return candidate.trim().toLowerCase() === this.djPasscode.trim().toLowerCase();
  }

  public setDjPasscode(passcode: string) {
    this.djPasscode = passcode.trim();
    jukeboxDb.saveMeta("dj_passcode", this.djPasscode);
    this.toast("DJ Passcode updated by Host", "info");
    this.notify();
  }

  private persistQueue() {
    try {
      jukeboxDb.saveQueue(this.queue);
    } catch (err) {
      console.error("[queue] Failed to persist queue:", err);
    }
  }

  private persistNowPlaying() {
    try {
      jukeboxDb.saveNowPlaying(this.nowPlaying, this.currentTime, this.duration);
    } catch (err) {
      console.error("[queue] Failed to persist now-playing:", err);
    }
  }

  private async enrichTrackMetadata(track: QueueTrack | null) {
    if (!track) return;
    try {
      const meta = await resolveTrackMetadata(track);
      if (this.nowPlaying && this.nowPlaying.id === track.id) {
        this.nowPlaying.genre = meta.genre;
        this.nowPlaying.mood = meta.mood;
        this.nowPlaying.metadataSource = meta.source;
        this.persistNowPlaying();
        this.notify();
      }
    } catch (err) {
      console.warn("[queue] enrichTrackMetadata error:", err);
    }
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }
      return a.requestedAt - b.requestedAt;
    });
    this.persistQueue();
  }

  /**
   * Coworker requests a new track.
   */
  public async addTrack(
    track: SearchResult,
    clientId: string,
    nickname?: string,
    role: MemberRole = "member"
  ): Promise<{ success: boolean; message?: string }> {
    // Check pending count for client
    const pendingCount = this.queue.filter((t) => t.votedIps.includes(clientId)).length;
    if (pendingCount >= MAX_PENDING_PER_CLIENT && role !== "host" && role !== "dj") {
      return {
        success: false,
        message: `You already have ${MAX_PENDING_PER_CLIENT} tracks in the queue. Let coworkers pick some too!`,
      };
    }

    const displayName = nickname?.trim() || "Anonymous Coworker";
    const weight = getRoleVoteWeight(role);
    const queueItem: QueueTrack = {
      ...track,
      queueId: randomUUID(),
      requestedBy: displayName,
      requestedAt: Date.now(),
      votes: weight,
      voters: [
        {
          clientId,
          nickname: displayName,
          role,
          weight,
        },
      ],
      votedIps: [clientId],
      status: "resolving",
    };

    this.queue.push(queueItem);
    this.sortQueue();
    autoDj.resetPool();

    this.toast(`"${track.title}" requested by ${displayName}`, "info");

    // If nothing is playing, advance to start playback immediately
    if (!this.nowPlaying) {
      await this.nextTrack();
    } else {
      this.notify();
    }

    // Pre-resolve stream & metadata in the background for zero-stutter playback
    void (async () => {
      resolveTrackMetadata(track).catch(() => {});
      const res = await preResolveTrack(track, (q) => searchFallback(q, track.provider));
      const target = this.queue.find((t) => t.queueId === queueItem.queueId);
      if (target) {
        if (res.fallbackTrack) {
          // Swap to pre-resolved fallback
          Object.assign(target, res.fallbackTrack);
          target.status = "ready";
          target.fallbackCount = (target.fallbackCount || 0) + 1;
          this.persistQueue();
          this.toast(`Replaced "${track.title}" with playable match "${res.fallbackTrack.title}"`, "info");
        } else {
          target.status = res.success ? "ready" : "failed";
          this.persistQueue();
        }
        this.notify();
      }
    })();

    return { success: true };
  }

  /**
   * Democratic weighted upvoting
   */
  public upvote(
    queueId: string,
    clientId: string,
    nickname?: string,
    role: MemberRole = "member"
  ): { success: boolean; weight: number } {
    const item = this.queue.find((t) => t.queueId === queueId);
    if (!item) return { success: false, weight: 0 };

    if (role === "listener") {
      this.toast("Listener role is view-only and cannot upvote", "warning");
      return { success: false, weight: 0 };
    }

    if (item.votedIps.includes(clientId) || item.voters?.some((v) => v.clientId === clientId)) {
      return { success: false, weight: 0 }; // already voted
    }

    const weight = getRoleVoteWeight(role);
    const voterName = nickname?.trim() || "Coworker";

    if (!item.voters) item.voters = [];
    item.voters.push({
      clientId,
      nickname: voterName,
      role,
      weight,
    });
    item.votedIps.push(clientId);
    item.votes = item.voters.reduce((sum, v) => sum + v.weight, 0);

    this.sortQueue();

    const roleBadge = role === "host" ? "👑" : role === "dj" ? "🎧" : role === "vip" ? "⭐" : "";
    const weightText = weight > 1 ? ` (+${weight} votes!)` : "";
    this.toast(`${voterName} ${roleBadge} voted for "${item.title}"${weightText}`, "info");

    this.notify();
    return { success: true, weight };
  }

  public removeVote(queueId: string, clientId: string): boolean {
    const item = this.queue.find((t) => t.queueId === queueId);
    if (!item) return false;

    const voterIdx = item.voters ? item.voters.findIndex((v) => v.clientId === clientId) : -1;
    if (voterIdx !== -1) {
      item.voters.splice(voterIdx, 1);
    }

    const ipIdx = item.votedIps.indexOf(clientId);
    if (ipIdx !== -1) {
      item.votedIps.splice(ipIdx, 1);
    }

    item.votes = (item.voters || []).reduce((sum, v) => sum + v.weight, 0);
    this.sortQueue();
    this.notify();
    return true;
  }

  /**
   * Advance to the next track.
   */
  public async nextTrack(): Promise<void> {
    if (this.nowPlaying) {
      this.nowPlaying.status = "played";
      this.history.unshift(this.nowPlaying);
      autoDj.markPlayed(this.nowPlaying.id);
      jukeboxDb.recordTrackPlayed(this.nowPlaying);
      if (this.history.length > 20) {
        this.history = this.history.slice(0, 20);
      }
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next.status = "playing";
      this.nowPlaying = next;
      this.isPlaying = true;
      this.currentTime = 0;
      this.duration = next.duration;
      this.persistQueue();
      this.persistNowPlaying();
      this.enrichTrackMetadata(next);
      this.notify();
      this.manageMemoryBuffers();
      return;
    }

    // Queue is empty: check Auto-DJ
    if (this.autoDjEnabled) {
      console.log("[queue] Queue empty, requesting Auto-DJ track...");
      const currentQueueIds = this.queue.map((t) => t.id);
      const rec = await autoDj.getNextRecommendation(this.history, currentQueueIds);
      if (rec) {
        const autoTrack: QueueTrack = {
          ...rec,
          queueId: randomUUID(),
          requestedBy: "Auto-DJ 🎧",
          requestedAt: Date.now(),
          votes: 1,
          voters: [
            {
              clientId: "auto-dj",
              nickname: "Auto-DJ 🎧",
              role: "host",
              weight: 1,
            },
          ],
          votedIps: ["auto-dj"],
          status: "playing",
        };
        this.nowPlaying = autoTrack;
        this.isPlaying = true;
        this.currentTime = 0;
        this.duration = autoTrack.duration;
        this.persistNowPlaying();
        this.toast(`Auto-DJ selected "${rec.title}" by ${rec.artist}`, "info");
        this.enrichTrackMetadata(autoTrack);
        this.notify();
        this.manageMemoryBuffers();
        return;
      }
    }

    // Nothing to play
    this.nowPlaying = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.persistNowPlaying();
    this.notify();
    this.manageMemoryBuffers();
  }

  /**
   * Manages ephemeral memory buffers: retains active & next queued track, pre-buffers upcoming in RAM.
   */
  private manageMemoryBuffers() {
    const activeIds: string[] = [];
    if (this.nowPlaying) activeIds.push(this.nowPlaying.id);
    if (this.queue.length > 0) activeIds.push(this.queue[0].id);
    memoryBufferManager.retainOnly(activeIds);

    if (this.queue.length > 0) {
      const nextUp = this.queue[0];
      void (async () => {
        try {
          const { resolveStreamUrl } = await import("../stream/resolver.ts");
          const streamUrl = await resolveStreamUrl(nextUp.id, nextUp.provider, nextUp.permalink);
          if (streamUrl) {
            await memoryBufferManager.getOrStartBuffer(nextUp.id, nextUp.provider, streamUrl);
          }
        } catch {}
      })();
    }
  }

  /**
   * Handle unplayable track error seamlessly without skip loops.
   */
  public async handleTrackError(errorMessage: string) {
    if (!this.nowPlaying) return;

    const failed = this.nowPlaying;
    console.warn(`[queue] Playback error for "${failed.title}": ${errorMessage}`);

    // If it hasn't had a fallback yet, try a fallback search
    if (!failed.fallbackCount) {
      this.toast(`Stream error on "${failed.title}". Searching alternative...`, "warning");
      const alt = await searchFallback(`${failed.title} ${failed.artist}`, failed.provider);
      if (alt && alt.id !== failed.id) {
        console.log(`[queue] Swapping to fallback: ${alt.title} (${alt.provider})`);
        this.nowPlaying = {
          ...alt,
          queueId: failed.queueId,
          requestedBy: failed.requestedBy,
          requestedAt: failed.requestedAt,
          votes: failed.votes,
          voters: failed.voters || [],
          votedIps: failed.votedIps,
          status: "playing",
          fallbackCount: 1,
        };
        this.currentTime = 0;
        this.isPlaying = true;
        this.persistNowPlaying();
        this.toast(`Playing fallback: "${alt.title}"`, "info");
        this.notify();
        return;
      }
    }

    // Otherwise, cleanly advance to next song
    this.toast(`Could not stream "${failed.title}". Moving to next song.`, "warning");
    await this.nextTrack();
  }

  // Transport controls
  public play() {
    this.isPlaying = true;
    this.notify();
  }

  public pause() {
    this.isPlaying = false;
    this.persistNowPlaying();
    this.notify();
  }

  public pauseForTrivia(): { pausedTrackTitle: string | null } {
    if (this.nowPlaying) {
      this.savedJukeboxState = {
        track: this.nowPlaying,
        currentTime: this.currentTime,
        duration: this.duration,
        isPlaying: this.isPlaying,
      };
      const title = this.nowPlaying.title;
      this.isPlaying = false;
      this.persistNowPlaying();
      this.notify();
      this.toast("Jukebox dijeda untuk sesi Tebak Lagu 🎮", "info");
      return { pausedTrackTitle: title };
    }
    return { pausedTrackTitle: null };
  }

  public resumeAfterTrivia() {
    if (this.savedJukeboxState && this.savedJukeboxState.track) {
      this.nowPlaying = this.savedJukeboxState.track;
      this.currentTime = this.savedJukeboxState.currentTime;
      this.duration = this.savedJukeboxState.duration;
      this.isPlaying = true;
      const title = this.nowPlaying.title;
      this.savedJukeboxState = null;
      this.persistNowPlaying();
      this.notify();
      this.toast(`Melanjutkan lagu: "${title}" 🎵`, "success");
    } else if (!this.nowPlaying && this.queue.length > 0) {
      void this.nextTrack();
    }
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(100, v));
    jukeboxDb.saveMeta("volume", String(this.volume));
    this.notify();
  }

  public setTime(current: number, dur: number) {
    this.currentTime = current;
    if (dur > 0) this.duration = dur;
    // Don't flood listeners with every 200ms tick, but keep state updated
  }

  public seek(time: number) {
    this.currentTime = Math.max(0, time);
    this.persistNowPlaying();
    this.notify();
  }

  public removeTrack(queueId: string): boolean {
    const idx = this.queue.findIndex((t) => t.queueId === queueId);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      this.persistQueue();
      this.toast(`Removed "${removed.title}" from queue`, "info");
      this.notify();
      return true;
    }
    return false;
  }

  public async toggleAutoDj(enabled: boolean) {
    this.autoDjEnabled = enabled;
    jukeboxDb.saveMeta("auto_dj_enabled", String(enabled));
    this.toast(`Auto-DJ ${enabled ? "enabled" : "disabled"}`, "info");
    this.notify();
    if (enabled && !this.nowPlaying && this.queue.length === 0) {
      await this.nextTrack();
    }
  }

  public setOutputMode(mode: "browser" | "native") {
    this.outputMode = mode;
    this.toast(`Output mode set to ${mode}`, "info");
    this.notify();
  }

  public setKaraokeMode(enabled: boolean, level?: number) {
    this.karaokeEnabled = enabled;
    if (typeof level === "number" && !isNaN(level)) {
      this.karaokeLevel = Math.max(0, Math.min(100, Math.round(level)));
    }
    this.toast(
      enabled
        ? `🎤 Karaoke Mode ON (Vocal Cut: ${this.karaokeLevel}%)`
        : "Karaoke Mode OFF",
      enabled ? "success" : "info"
    );
    this.notify();
  }
}

export const queueStore = new QueueStore();

import { ref, shallowRef } from "vue";
import type {
  ClientMessage,
  MemberRole,
  ReactionBroadcastItem,
  ServerMessage,
  ServerState,
  ShoutoutBroadcastItem,
  ToastItem,
} from "./types.ts";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export class JukeboxClient {
  private ws: WebSocket | null = null;
  private token: string = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  public status = ref<ConnectionStatus>("connecting");
  public isAdmin = ref(false);
  public myRole = ref<MemberRole>("member");
  public clientId = ref("");
  public state = shallowRef<ServerState | null>(null);
  public toasts = ref<ToastItem[]>([]);
  public currentTime = ref(0);
  public duration = ref(0);

  // Trivia Song Guess Game State
  public triviaState = ref<import("./types.ts").TriviaGameState | null>(null);
  public isTriviaLobbyInvitationOpen = ref(false);
  public triviaInvitationData = ref<{ hostNickname: string; categoryId: string } | null>(null);
  public triviaPresets = ref<import("./types.ts").TriviaPresetItem[]>([]);

  private timeListeners = new Set<(currentTime: number, duration: number) => void>();
  private seekListeners = new Set<(time: number) => void>();
  private reactionListeners = new Set<(reaction: ReactionBroadcastItem) => void>();
  private shoutoutListeners = new Set<(shoutout: ShoutoutBroadcastItem) => void>();
  private comboResetListeners = new Set<(lastCombo: number, emoji?: string) => void>();
  private triviaTimerStartListeners = new Set<
    (payload: { roundIndex: number; startTime: number; endTime: number; durationSec: number }) => void
  >();
  private triviaClosedListeners = new Set<() => void>();

  constructor() {
    // Generate or restore client ID
    const storedId = localStorage.getItem("jukebox_client_id");
    if (storedId) {
      this.clientId.value = storedId;
    } else {
      const newId = "c_" + Math.random().toString(36).slice(2, 10);
      this.clientId.value = newId;
      localStorage.setItem("jukebox_client_id", newId);
    }
  }

  public setToken(token: string) {
    const tokenChanged = this.token !== token;
    this.token = token;
    if (token && (tokenChanged || !this.isAdmin.value)) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: "hello",
          token,
          clientId: this.clientId.value,
          nickname: localStorage.getItem("jukebox_nickname") || undefined,
        });
      }
    }
  }

  public connect(token?: string) {
    if (token) {
      this.setToken(token);
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.status.value = this.reconnectAttempts === 0 ? "connecting" : "reconnecting";

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${protocol}//${window.location.host}/ws`);
    if (this.token) {
      url.searchParams.set("token", this.token);
    }

    try {
      this.ws = new WebSocket(url.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.status.value = "connected";
      this.reconnectAttempts = 0;
      this.send({
        type: "hello",
        token: this.token,
        clientId: this.clientId.value,
        nickname: localStorage.getItem("jukebox_nickname") || undefined,
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.warn("[ws] message parse error:", err);
      }
    };

    this.ws.onclose = () => {
      this.status.value = "offline";
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // close event will trigger reconnect
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(5000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.isAdmin.value = msg.isAdmin;
        if (msg.role) this.myRole.value = msg.role;
        if (msg.clientId) this.clientId.value = msg.clientId;
        break;

      case "roleGranted":
        this.myRole.value = msg.role;
        this.addToast(msg.message, "success");
        break;

      case "stateSync":
        this.state.value = msg.state;
        if (msg.state.currentTime !== undefined) {
          this.currentTime.value = msg.state.currentTime;
        }
        if (msg.state.duration !== undefined) {
          this.duration.value = msg.state.duration;
        }
        // Keep myRole in sync with state.members if updated
        if (msg.state.members) {
          const self = msg.state.members.find((m) => m.clientId === this.clientId.value);
          if (self && self.role !== this.myRole.value) {
            this.myRole.value = self.role;
          }
        }
        break;

      case "timeUpdate":
        this.currentTime.value = msg.currentTime;
        if (msg.duration > 0) {
          this.duration.value = msg.duration;
        }
        if (this.state.value) {
          this.state.value.currentTime = msg.currentTime;
          if (msg.duration > 0) {
            this.state.value.duration = msg.duration;
          }
        }
        for (const cb of this.timeListeners) {
          cb(msg.currentTime, msg.duration);
        }
        break;

      case "seek":
        this.currentTime.value = msg.time;
        if (this.state.value) {
          this.state.value.currentTime = msg.time;
        }
        for (const cb of this.seekListeners) {
          cb(msg.time);
        }
        break;

      case "toast":
        this.addToast(msg.message, msg.toastType);
        break;

      case "reactionBroadcast":
        for (const cb of this.reactionListeners) {
          cb(msg);
        }
        break;

      case "shoutoutBroadcast":
        for (const cb of this.shoutoutListeners) {
          cb(msg);
        }
        break;

      case "comboReset":
        for (const cb of this.comboResetListeners) {
          cb(msg.lastCombo, msg.emoji);
        }
        break;

      case "trivia:stateSync":
        this.triviaState.value = msg.state;
        if (msg.state.status === "idle") {
          this.isTriviaLobbyInvitationOpen.value = false;
          this.triviaInvitationData.value = null;
          for (const cb of this.triviaClosedListeners) {
            cb();
          }
        }
        break;

      case "trivia:timerStart":
        if (this.triviaState.value?.currentRound && this.triviaState.value.currentRound.roundIndex === msg.roundIndex) {
          this.triviaState.value.currentRound.isAudioReady = true;
          this.triviaState.value.currentRound.startTime = msg.startTime;
          this.triviaState.value.currentRound.endTime = msg.endTime;
          this.triviaState.value.currentRound.durationSec = msg.durationSec;
        }
        for (const cb of this.triviaTimerStartListeners) {
          cb(msg);
        }
        break;

      case "trivia:lobbyCreated":
        this.triviaInvitationData.value = {
          hostNickname: msg.hostNickname,
          categoryId: msg.categoryId,
        };
        // Buka undangan jika user bukan host pembuat lobby
        if (this.clientId.value && this.triviaState.value?.hostClientId !== this.clientId.value) {
          this.isTriviaLobbyInvitationOpen.value = true;
        }
        break;

      case "trivia:closed":
        this.triviaState.value = null;
        this.isTriviaLobbyInvitationOpen.value = false;
        this.triviaInvitationData.value = null;
        for (const cb of this.triviaClosedListeners) {
          cb();
        }
        break;

      case "trivia:presetsUpdated":
        this.triviaPresets.value = msg.presets;
        break;
    }
  }

  // --- Trivia Actions ---

  public async fetchTriviaPresets(): Promise<import("./types.ts").TriviaPresetItem[]> {
    try {
      const res = await fetch("/api/trivia/presets");
      if (res.ok) {
        const data = await res.json();
        this.triviaPresets.value = data;
        return data;
      }
    } catch (e) {
      console.warn("fetchTriviaPresets error:", e);
    }
    return this.triviaPresets.value;
  }

  public async previewPlaylist(url: string) {
    try {
      const res = await fetch("/api/trivia/preview-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("previewPlaylist error:", e);
    }
    return { valid: false, count: 0, sampleTracks: [] };
  }

  public createTriviaLobby(settings: import("./types.ts").TriviaGameSettings) {
    this.send({ type: "trivia:create", settings, token: this.token || undefined });
  }

  public joinTriviaLobby() {
    this.isTriviaLobbyInvitationOpen.value = false;
    this.send({ type: "trivia:join" });
  }

  public leaveTriviaLobby() {
    this.send({ type: "trivia:leave" });
  }

  public setTriviaReady(isReady: boolean) {
    this.send({ type: "trivia:ready", isReady });
  }

  public setTriviaHostPlaying(isPlaying: boolean) {
    this.send({ type: "trivia:setHostPlaying", isPlaying, token: this.token || undefined });
  }

  public forceStartTrivia() {
    this.send({ type: "trivia:forceStart", token: this.token || undefined });
  }

  public signalTriviaAudioReady(roundIndex: number) {
    this.send({ type: "trivia:audioReady", roundIndex });
  }

  public submitTriviaAnswer(roundIndex: number, optionId: string) {
    this.send({ type: "trivia:answer", roundIndex, optionId });
  }

  public closeTriviaGame() {
    this.send({ type: "trivia:close", token: this.token || undefined });
  }

  public onTriviaTimerStart(
    cb: (payload: { roundIndex: number; startTime: number; endTime: number; durationSec: number }) => void
  ): () => void {
    this.triviaTimerStartListeners.add(cb);
    return () => this.triviaTimerStartListeners.delete(cb);
  }

  public onTriviaClosed(cb: () => void): () => void {
    this.triviaClosedListeners.add(cb);
    return () => this.triviaClosedListeners.delete(cb);
  }

  public onReaction(cb: (reaction: ReactionBroadcastItem) => void): () => void {
    this.reactionListeners.add(cb);
    return () => this.reactionListeners.delete(cb);
  }

  public onComboReset(cb: (lastCombo: number, emoji?: string) => void): () => void {
    this.comboResetListeners.add(cb);
    return () => this.comboResetListeners.delete(cb);
  }

  public onShoutout(cb: (shoutout: ShoutoutBroadcastItem) => void): () => void {
    this.shoutoutListeners.add(cb);
    return () => this.shoutoutListeners.delete(cb);
  }

  public sendReaction(emoji: string, combo = 1) {
    this.send({ type: "reaction", emoji, combo });
  }

  public sendShoutout(text: string) {
    this.send({ type: "shoutout", text });
  }

  public onTimeUpdate(cb: (currentTime: number, duration: number) => void): () => void {
    this.timeListeners.add(cb);
    return () => this.timeListeners.delete(cb);
  }

  public onSeek(cb: (time: number) => void): () => void {
    this.seekListeners.add(cb);
    return () => this.seekListeners.delete(cb);
  }

  public seek(time: number) {
    this.send({ type: "seek", time, token: this.token || undefined });
  }

  public setNickname(nickname: string) {
    localStorage.setItem("jukebox_nickname", nickname);
    this.send({ type: "setNickname", nickname });
  }

  public setListening(isListening: boolean) {
    this.send({ type: "setListening", isListening });
  }

  public claimRole(passcode: string) {
    this.send({ type: "claimRole", passcode });
  }

  public setMemberRole(targetClientId: string, role: MemberRole) {
    this.send({ type: "setRole", targetClientId, role, token: this.token });
  }

  public setDjPasscode(passcode: string) {
    this.send({ type: "setDjPasscode", passcode, token: this.token });
  }

  public addToast(message: string, type: ToastItem["type"] = "info") {
    const id = Math.random().toString(36).slice(2, 9);
    this.toasts.value.push({ id, message, type, timestamp: Date.now() });
    setTimeout(() => {
      this.toasts.value = this.toasts.value.filter((t) => t.id !== id);
    }, 4500);
  }

  public send(msg: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }
}

export const jukeboxClient = new JukeboxClient();

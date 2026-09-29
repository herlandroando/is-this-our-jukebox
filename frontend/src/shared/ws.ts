import { ref, shallowRef } from "vue";
import type { ClientMessage, MemberRole, ServerMessage, ServerState, ToastItem } from "./types.ts";

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

  private timeListeners = new Set<(currentTime: number, duration: number) => void>();
  private seekListeners = new Set<(time: number) => void>();

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
    if (this.token !== token) {
      this.token = token;
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
    if (token) this.token = token;
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
    }
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

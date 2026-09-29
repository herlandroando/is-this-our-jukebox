import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";
import type { ClientMessage, MemberRole, ServerMessage, ServerState } from "../types.ts";
import { queueStore } from "../queue/store.ts";
import { verifyAdminToken } from "../adminToken.ts";

export interface WsUserData {
  id: string;
  ip: string;
  nickname: string;
  role: MemberRole;
  isAdmin: boolean;
  connectedAt: number;
}

function canControlPlayback(ws: ServerWebSocket<WsUserData>, token?: string): boolean {
  if (ws.data.isAdmin || ws.data.role === "host" || ws.data.role === "dj") return true;
  if (token && verifyAdminToken(token)) return true;
  return false;
}

export class JukeboxWsHub {
  private sockets = new Set<ServerWebSocket<WsUserData>>();

  constructor() {
    // Listen to queue store state changes and broadcast to all
    queueStore.subscribe((state) => {
      this.broadcast({
        type: "stateSync",
        state,
      });
    });

    // Listen to toasts and broadcast
    queueStore.onToast((message, toastType) => {
      this.broadcast({
        type: "toast",
        message,
        toastType,
      });
    });
  }

  public handleOpen(ws: ServerWebSocket<WsUserData>) {
    this.sockets.add(ws);
    queueStore.setActiveListeners(this.sockets.size);

    queueStore.setMember({
      clientId: ws.data.id,
      ip: ws.data.ip,
      nickname: ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "Anonymous"),
      role: ws.data.role,
      connectedAt: ws.data.connectedAt || Date.now(),
      isHost: ws.data.isAdmin,
    });

    // Send initial state immediately
    const state = queueStore.getState();
    const welcome: ServerMessage = {
      type: "welcome",
      isAdmin: ws.data.isAdmin,
      clientId: ws.data.id,
      role: ws.data.role,
    };
    ws.send(JSON.stringify(welcome));

    const sync: ServerMessage = {
      type: "stateSync",
      state,
    };
    ws.send(JSON.stringify(sync));
  }

  public handleClose(ws: ServerWebSocket<WsUserData>) {
    this.sockets.delete(ws);
    queueStore.removeMember(ws.data.id);
    queueStore.setActiveListeners(this.sockets.size);
  }

  public async handleMessage(ws: ServerWebSocket<WsUserData>, message: string | Buffer) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === "string" ? message : message.toString("utf8"));
    } catch {
      return;
    }

    const { id: clientId } = ws.data;

    switch (msg.type) {
      case "hello": {
        if (msg.nickname) {
          ws.data.nickname = msg.nickname.trim();
        }
        if (msg.token && verifyAdminToken(msg.token)) {
          ws.data.isAdmin = true;
          ws.data.role = "host";
          ws.data.nickname = ws.data.nickname || "Host DJ 🎧";
        }
        queueStore.setMember({
          clientId: ws.data.id,
          ip: ws.data.ip,
          nickname: ws.data.nickname,
          role: ws.data.role,
          connectedAt: ws.data.connectedAt,
          isHost: ws.data.isAdmin,
        });

        ws.send(
          JSON.stringify({
            type: "welcome",
            isAdmin: ws.data.isAdmin,
            clientId,
            role: ws.data.role,
          })
        );
        break;
      }

      case "setNickname": {
        const cleanName = msg.nickname?.trim() || "Anonymous";
        ws.data.nickname = cleanName;
        queueStore.updateMemberNickname(clientId, cleanName);
        break;
      }

      case "setRole": {
        const isAuth = ws.data.isAdmin || (msg.token && verifyAdminToken(msg.token));
        if (!isAuth) {
          ws.send(JSON.stringify({ type: "toast", message: "Only the Host can assign roles", toastType: "error" }));
          return;
        }

        // Find target socket
        for (const sock of this.sockets) {
          if (sock.data.id === msg.targetClientId) {
            sock.data.role = msg.role;
            sock.send(
              JSON.stringify({
                type: "roleGranted",
                role: msg.role,
                message: `Your role has been set to ${msg.role.toUpperCase()} by Host`,
              })
            );
            break;
          }
        }

        queueStore.updateMemberRole(msg.targetClientId, msg.role);
        queueStore.toast(`Role updated to ${msg.role.toUpperCase()}`, "info");
        break;
      }

      case "claimRole": {
        if (queueStore.verifyDjPasscode(msg.passcode)) {
          ws.data.role = "dj";
          queueStore.updateMemberRole(clientId, "dj");
          ws.send(
            JSON.stringify({
              type: "roleGranted",
              role: "dj",
              message: "🎉 DJ Access Unlocked! Remote transport controls enabled.",
            })
          );
          queueStore.toast(`🎧 ${ws.data.nickname} unlocked DJ Controls!`, "success");
        } else {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Invalid DJ passcode. Ask the host for the code!",
              toastType: "error",
            })
          );
        }
        break;
      }

      case "setDjPasscode": {
        const isAuth = ws.data.isAdmin || (msg.token && verifyAdminToken(msg.token));
        if (isAuth) {
          queueStore.setDjPasscode(msg.passcode);
        }
        break;
      }

      case "requestTrack": {
        await queueStore.addTrack(msg.track, clientId, msg.nickname || ws.data.nickname, ws.data.role);
        break;
      }

      case "upvoteTrack": {
        queueStore.upvote(msg.queueId, clientId, ws.data.nickname, ws.data.role);
        break;
      }

      case "removeVote": {
        queueStore.removeVote(msg.queueId, clientId);
        break;
      }

      case "timeUpdate": {
        if (ws.data.isAdmin) {
          queueStore.setTime(msg.currentTime, msg.duration);
          this.broadcast({
            type: "timeUpdate",
            currentTime: msg.currentTime,
            duration: msg.duration,
          });
        }
        break;
      }

      case "trackEnded": {
        if (ws.data.isAdmin) {
          await queueStore.nextTrack();
        }
        break;
      }

      case "trackError": {
        if (ws.data.isAdmin) {
          await queueStore.handleTrackError(msg.error);
        }
        break;
      }

      // Player Controls (Admin OR DJ)
      case "play": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.play();
        }
        break;
      }

      case "pause": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.pause();
        }
        break;
      }

      case "skip": {
        if (canControlPlayback(ws, msg.token)) {
          await queueStore.nextTrack();
        }
        break;
      }

      case "seek": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.seek(msg.time);
          this.broadcast({
            type: "seek",
            time: msg.time,
          });
        }
        break;
      }

      case "volume": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.setVolume(msg.value);
        }
        break;
      }

      case "removeTrack": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.removeTrack(msg.queueId);
        }
        break;
      }

      case "toggleAutoDj": {
        if (ws.data.isAdmin || (msg.token && verifyAdminToken(msg.token))) {
          queueStore.toggleAutoDj(msg.enabled);
        }
        break;
      }

      case "setOutputMode": {
        if (ws.data.isAdmin || (msg.token && verifyAdminToken(msg.token))) {
          queueStore.setOutputMode(msg.mode);
        }
        break;
      }

      case "setKaraokeMode": {
        if (canControlPlayback(ws, msg.token)) {
          queueStore.setKaraokeMode(msg.enabled, msg.level);
        }
        break;
      }
    }
  }

  public broadcast(msg: ServerMessage) {
    const payload = JSON.stringify(msg);
    for (const socket of this.sockets) {
      try {
        socket.send(payload);
      } catch {
        // Socket closed
      }
    }
  }
}

export const wsHub = new JukeboxWsHub();

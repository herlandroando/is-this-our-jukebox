import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";
import type { ClientMessage, MemberRole, ServerMessage, ServerState } from "../types.ts";
import { queueStore } from "../queue/store.ts";
import { verifyAdminToken } from "../adminToken.ts";
import { triviaGameManager } from "../trivia/gameManager.ts";

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

interface EmojiComboState {
  count: number;
  lastUpdatedAt: number;
  contributors: Set<string>;
  decayTimer?: ReturnType<typeof setTimeout> | null;
  isClimaxing?: boolean;
}

function getComboDecayWindow(combo: number): number {
  if (combo >= 80) return 3000;
  if (combo >= 50) return 2600;
  if (combo >= 20) return 2200;
  return 1800;
}

export class JukeboxWsHub {
  private sockets = new Set<ServerWebSocket<WsUserData>>();
  private clientSockets = new Map<string, ServerWebSocket<WsUserData>>();
  private lastShoutoutTimes = new Map<string, number>();
  private emojiCombos = new Map<string, EmojiComboState>();

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

    // Listen to Trivia Game events and broadcast
    triviaGameManager.subscribe((state, eventType, payload) => {
      if (eventType === "presetsUpdated") {
        this.broadcast({
          type: "trivia:presetsUpdated",
          presets: payload.presets,
        });
        return;
      }
      if (eventType === "lobbyCreated") {
        this.broadcast({
          type: "trivia:lobbyCreated",
          hostNickname: state.hostNickname,
          categoryId: state.settings.categoryId,
        });
      } else if (eventType === "roundStart") {
        this.broadcast({
          type: "trivia:roundStart",
          round: payload.round,
        });
      } else if (eventType === "timerStart") {
        this.broadcast({
          type: "trivia:timerStart",
          roundIndex: payload.roundIndex,
          startTime: payload.startTime,
          endTime: payload.endTime,
          durationSec: payload.durationSec,
          listenDurationSec: payload.listenDurationSec,
          listenStartTime: payload.listenStartTime,
        });
      } else if (eventType === "roundEnd") {
        this.broadcast({
          type: "trivia:roundEnd",
          result: payload.result,
        });
      } else if (eventType === "gameOver") {
        this.broadcast({
          type: "trivia:gameOver",
          podium: payload.podium,
        });
      } else if (eventType === "gameClosed") {
        this.broadcast({
          type: "trivia:closed",
        });
      }

      this.broadcast({
        type: "trivia:stateSync",
        state,
      });
    });
  }

  public handleOpen(ws: ServerWebSocket<WsUserData>) {
    const clientId = ws.data.id;

    // 1. If an existing socket already exists for this client (e.g. reconnect or page refresh),
    // close the older socket cleanly and replace it
    const existingWs = this.clientSockets.get(clientId);
    if (existingWs && existingWs !== ws) {
      this.sockets.delete(existingWs);
      try {
        existingWs.close(4001, "Replaced by new connection");
      } catch {}
    }

    // 2. Register socket to active maps
    this.clientSockets.set(clientId, ws);
    this.sockets.add(ws);

    // 3. Send welcome message to newly connected client first
    const welcome: ServerMessage = {
      type: "welcome",
      isAdmin: ws.data.isAdmin,
      clientId: ws.data.id,
      role: ws.data.role,
    };
    ws.send(JSON.stringify(welcome));

    // 4. Batch member addition & accurate unique client listener count into store
    queueStore.setMember(
      {
        clientId: ws.data.id,
        ip: ws.data.ip,
        nickname: ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "Anonymous"),
        role: ws.data.role,
        connectedAt: ws.data.connectedAt || Date.now(),
        isHost: ws.data.isAdmin,
      },
      this.clientSockets.size
    );

    // 5. Send current Trivia Game state if a game is active
    const triviaState = triviaGameManager.getState();
    if (triviaState.status !== "idle") {
      ws.send(
        JSON.stringify({
          type: "trivia:stateSync",
          state: triviaState,
        })
      );
    }
  }

  public handleClose(ws: ServerWebSocket<WsUserData>) {
    const clientId = ws.data.id;
    this.sockets.delete(ws);

    // If this closing socket is still the active socket registered for this client,
    // perform full cleanup. If it was already superseded by a new connection, skip removal.
    if (this.clientSockets.get(clientId) === ws) {
      this.clientSockets.delete(clientId);
      this.lastShoutoutTimes.delete(clientId);
      triviaGameManager.leaveLobby(clientId, false);
      queueStore.removeMember(clientId, this.clientSockets.size);
    } else {
      queueStore.setActiveListeners(this.clientSockets.size);
    }
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
      case "ping": {
        try {
          ws.send(JSON.stringify({ type: "pong" }));
        } catch {}
        break;
      }

      case "hello": {
        if (msg.clientId && /^[a-zA-Z0-9_-]{4,64}$/.test(msg.clientId) && msg.clientId !== ws.data.id) {
          const oldId = ws.data.id;
          if (this.clientSockets.get(oldId) === ws) {
            this.clientSockets.delete(oldId);
          }
          queueStore.removeMember(oldId);
          ws.data.id = msg.clientId;
          this.clientSockets.set(msg.clientId, ws);
        }
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
        }, this.clientSockets.size);

        ws.send(
          JSON.stringify({
            type: "welcome",
            isAdmin: ws.data.isAdmin,
            clientId: ws.data.id,
            role: ws.data.role,
          })
        );
        break;
      }

      case "setNickname": {
        const cleanName = msg.nickname?.trim() || "Anonymous";
        ws.data.nickname = cleanName;
        queueStore.updateMemberNickname(clientId, cleanName);
        triviaGameManager.updatePlayerNickname(clientId, cleanName);
        break;
      }

      case "setListening": {
        queueStore.updateMemberListening(clientId, !!msg.isListening);
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
        const clientKey = `${ws.data.ip}_${clientId}`;
        const limit = queueStore.checkPasscodeRateLimit(clientKey);
        if (limit.locked) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: `Too many failed attempts. Please try again in ${limit.retryAfterSeconds}s.`,
              toastType: "error",
            })
          );
          break;
        }

        if (verifyAdminToken(msg.passcode)) {
          queueStore.recordPasscodeAttempt(clientKey, true);
          ws.data.isAdmin = true;
          ws.data.role = "host";
          ws.data.nickname = ws.data.nickname || "Host DJ 🎧";
          queueStore.updateMemberRole(clientId, "host");
          ws.send(
            JSON.stringify({
              type: "welcome",
              isAdmin: true,
              clientId,
              role: "host",
            })
          );
          ws.send(
            JSON.stringify({
              type: "roleGranted",
              role: "host",
              message: "👑 Host DJ Access Unlocked!",
            })
          );
          queueStore.toast(`👑 ${ws.data.nickname} unlocked Host Access!`, "success");
          break;
        }

        if (queueStore.verifyDjPasscode(msg.passcode)) {
          queueStore.recordPasscodeAttempt(clientKey, true);
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
          queueStore.recordPasscodeAttempt(clientKey, false);
          const updatedLimit = queueStore.checkPasscodeRateLimit(clientKey);
          if (updatedLimit.locked) {
            ws.send(
              JSON.stringify({
                type: "toast",
                message: `Too many failed attempts. Locked out for ${updatedLimit.retryAfterSeconds}s.`,
                toastType: "error",
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: "toast",
                message: "Invalid DJ passcode. Ask the host for the code!",
                toastType: "error",
              })
            );
          }
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
          void queueStore.toggleAutoDj(msg.enabled);
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

      case "toggleRemoteAudio": {
        if (ws.data.isAdmin || (msg.token && verifyAdminToken(msg.token))) {
          queueStore.setAllowRemoteAudio(!!msg.enabled);
          queueStore.toast(
            msg.enabled
              ? "🎧 Remote headphone streaming enabled"
              : "⚠️ Remote headphone streaming paused (Bandwidth Saver ON)",
            msg.enabled ? "info" : "warning"
          );
        }
        break;
      }

      case "reaction": {
        const emoji = (msg.emoji || "").trim().slice(0, 8);
        if (!emoji) break;

        const now = Date.now();
        let state = this.emojiCombos.get(emoji);
        if (!state) {
          state = {
            count: 0,
            lastUpdatedAt: 0,
            contributors: new Set<string>(),
            decayTimer: null,
            isClimaxing: false,
          };
          this.emojiCombos.set(emoji, state);
        }

        // If this emoji is currently in climax explosion cooldown,
        // do not increment combo and do not cancel or reset the auto-reset timer!
        if (state.isClimaxing) {
          this.broadcast({
            type: "reactionBroadcast",
            id: randomUUID(),
            clientId: ws.data.id,
            nickname: ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "Anonymous"),
            role: ws.data.role,
            emoji,
            combo: 100,
            contributorsCount: state.contributors.size,
            isMilestone: false,
            isClimax: false,
            timestamp: now,
          });
          break;
        }

        const decayWindow = getComboDecayWindow(state.count);

        // Independent Collaborative Stacking per emoji:
        // Combo only increments and stacks if within decayWindow of reactions for the same emoji
        if (now - state.lastUpdatedAt < decayWindow && state.count > 0) {
          state.count++;
          state.contributors.add(ws.data.id);
        } else {
          state.count = 1;
          state.contributors = new Set([ws.data.id]);
        }

        state.lastUpdatedAt = now;

        const currentCombo = state.count;
        const contributorsCount = state.contributors.size;
        const isClimax = currentCombo >= 100;
        const isMilestone = isClimax || (currentCombo >= 10 && currentCombo % 5 === 0);

        // Reset decay timer specifically for this emoji
        if (state.decayTimer) clearTimeout(state.decayTimer);

        if (isClimax) {
          // Lock state so subsequent taps during explosion do not cancel or postpone reset
          state.isClimaxing = true;
          state.decayTimer = setTimeout(() => {
            const lastCombo = state.count;
            this.emojiCombos.delete(emoji);
            this.broadcast({
              type: "comboReset",
              lastCombo,
              emoji,
            });
          }, 3000);
        } else {
          const nextDecayWindow = getComboDecayWindow(currentCombo);
          state.decayTimer = setTimeout(() => {
            const lastCombo = state.count;
            this.emojiCombos.delete(emoji);
            this.broadcast({
              type: "comboReset",
              lastCombo,
              emoji,
            });
          }, nextDecayWindow);
        }

        this.broadcast({
          type: "reactionBroadcast",
          id: randomUUID(),
          clientId: ws.data.id,
          nickname: ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "Anonymous"),
          role: ws.data.role,
          emoji,
          combo: currentCombo,
          contributorsCount,
          isMilestone,
          isClimax,
          timestamp: now,
        });
        break;
      }

      case "shoutout": {
        const text = (msg.text || "").trim().slice(0, 60);
        if (!text) break;

        const now = Date.now();
        const lastTime = this.lastShoutoutTimes.get(ws.data.id) || 0;
        if (now - lastTime < 2500) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Tunggu sebentar sebelum kirim shoutout lagi ya! ⏳",
              toastType: "warning",
            })
          );
          break;
        }

        this.lastShoutoutTimes.set(ws.data.id, now);
        this.broadcast({
          type: "shoutoutBroadcast",
          id: randomUUID(),
          clientId: ws.data.id,
          nickname: ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "Anonymous"),
          role: ws.data.role,
          text,
          timestamp: now,
        });
        break;
      }

      // Trivia Song Guess Game Handlers
      case "trivia:create": {
        if (!canControlPlayback(ws, msg.token)) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Hanya Host atau DJ yang dapat membuat sesi Tebak Lagu!",
              toastType: "error",
            })
          );
          break;
        }

        const res = await triviaGameManager.createLobby(
          ws.data.id,
          ws.data.nickname || (ws.data.isAdmin ? "Host DJ 🎧" : "DJ"),
          msg.settings
        );
        if (!res.success && res.message) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: res.message,
              toastType: "warning",
            })
          );
        }
        break;
      }

      case "trivia:join": {
        triviaGameManager.joinLobby(
          ws.data.id,
          ws.data.nickname || "Anonymous",
          ws.data.role
        );
        break;
      }

      case "trivia:leave": {
        triviaGameManager.leaveLobby(ws.data.id, true);
        break;
      }

      case "trivia:ready": {
        triviaGameManager.setReady(ws.data.id, msg.isReady);
        break;
      }

      case "trivia:setHostPlaying": {
        if (!canControlPlayback(ws, msg.token)) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Hanya Host atau DJ yang dapat mengubah status bermain!",
              toastType: "error",
            })
          );
          break;
        }
        triviaGameManager.setHostPlaying(ws.data.id, msg.isPlaying);
        break;
      }

      case "trivia:forceStart": {
        if (!canControlPlayback(ws, msg.token)) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Hanya Host atau DJ yang dapat memulai game!",
              toastType: "error",
            })
          );
          break;
        }
        triviaGameManager.forceStart(ws.data.id);
        break;
      }

      case "trivia:setAudioMode": {
        triviaGameManager.setPlayerAudioMode(ws.data.id, msg.mode);
        break;
      }

      case "trivia:audioReady": {
        triviaGameManager.onAudioReady(msg.roundIndex, ws.data.id);
        break;
      }

      case "trivia:answer": {
        triviaGameManager.submitAnswer(ws.data.id, msg.roundIndex, msg.optionId);
        break;
      }

      case "trivia:reportAudioIssue": {
        triviaGameManager.reportAudioIssue(ws.data.id, ws.data.nickname);
        break;
      }

      case "trivia:skipQuestion": {
        if (!canControlPlayback(ws, msg.token)) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Hanya Host yang dapat melewati soal!",
              toastType: "error",
            })
          );
          break;
        }
        triviaGameManager.skipCurrentQuestion(ws.data.id, true);
        break;
      }

      case "trivia:close": {
        if (!canControlPlayback(ws, msg.token)) {
          ws.send(
            JSON.stringify({
              type: "toast",
              message: "Hanya Host atau DJ yang dapat menutup game!",
              toastType: "error",
            })
          );
          break;
        }
        triviaGameManager.closeGame();
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

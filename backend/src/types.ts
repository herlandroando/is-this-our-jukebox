export type AudioProvider = "yt" | "sc";

export type MemberRole = "host" | "dj" | "vip" | "member" | "listener";

export interface SearchResult {
  id: string; // "dQw4w9WgXcQ" or "sc:123456"
  provider: AudioProvider;
  permalink?: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // in seconds
}

export type QueueItemStatus = "pending" | "resolving" | "ready" | "playing" | "played" | "failed";

export interface TrackVoter {
  clientId: string;
  nickname: string;
  role: MemberRole;
  weight: number;
}

export interface QueueTrack extends SearchResult {
  queueId: string; // unique UUID for this queue entry
  requestedBy: string; // nickname or "Anonymous"
  requestedAt: number; // timestamp
  votes: number;
  voters: TrackVoter[];
  votedIps: string[]; // IP addresses or client UUIDs that voted (for backward compatibility)
  status: QueueItemStatus;
  fallbackCount?: number;
  genre?: string;
  mood?: "hype" | "lofi" | "romance" | "galau";
  metadataSource?: string;
}

export interface MemberInfo {
  clientId: string;
  ip: string;
  nickname: string;
  role: MemberRole;
  connectedAt: number;
  isHost: boolean;
  isListening?: boolean;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
  romaji?: string;
}

export interface LyricsData {
  synced: boolean;
  instrumental: boolean;
  lines: LyricLine[];
  plain?: string;
  source?: string;
}

export interface NowPlayingState {
  track: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number; // seconds
  duration: number;
  volume: number; // 0 - 100
  startedAt: number | null;
  outputMode: "browser" | "native";
  autoDjEnabled: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
}

export interface ServerState {
  nowPlaying: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  outputMode: "browser" | "native";
  autoDjEnabled: boolean;
  karaokeEnabled: boolean;
  karaokeLevel: number;
  queue: QueueTrack[];
  history: QueueTrack[];
  activeListeners: number;
  members: MemberInfo[];
  djPasscodeEnabled: boolean;
  allowRemoteAudio?: boolean;
  publicUrl?: string | null;
  tunnelMode?: string;
  triviaState?: import("./trivia/types.ts").TriviaGameState;
}

export type ClientMessage =
  | { type: "hello"; token?: string; clientId?: string; nickname?: string }
  | { type: "setNickname"; nickname: string }
  | { type: "requestTrack"; track: SearchResult; nickname?: string }
  | { type: "upvoteTrack"; queueId: string }
  | { type: "removeVote"; queueId: string }
  | { type: "timeUpdate"; currentTime: number; duration: number }
  | { type: "trackEnded" }
  | { type: "trackError"; error: string }
  // Role & Passcode Management
  | { type: "setRole"; targetClientId: string; role: MemberRole; token?: string }
  | { type: "claimRole"; passcode: string }
  | { type: "setDjPasscode"; passcode: string; token?: string }
  // Player Controls (authorized for Admin OR DJ)
  | { type: "play"; token?: string }
  | { type: "pause"; token?: string }
  | { type: "skip"; token?: string }
  | { type: "seek"; time: number; token?: string }
  | { type: "volume"; value: number; token?: string }
  | { type: "removeTrack"; queueId: string; token?: string }
  | { type: "toggleAutoDj"; enabled: boolean; token?: string }
  | { type: "setOutputMode"; mode: "browser" | "native"; token?: string }
  | { type: "setKaraokeMode"; enabled: boolean; level?: number; token?: string }
  | { type: "toggleRemoteAudio"; enabled: boolean; token?: string }
  | { type: "setListening"; isListening: boolean }
  | { type: "reaction"; emoji: string; combo?: number }
  | { type: "shoutout"; text: string }
  // Trivia Song Guess Game
  | { type: "trivia:create"; settings: import("./trivia/types.ts").TriviaGameSettings; token?: string }
  | { type: "trivia:join" }
  | { type: "trivia:leave" }
  | { type: "trivia:ready"; isReady: boolean }
  | { type: "trivia:setHostPlaying"; isPlaying: boolean; token?: string }
  | { type: "trivia:forceStart"; token?: string }
  | { type: "trivia:audioReady"; roundIndex: number }
  | { type: "trivia:setAudioMode"; mode: "host" | "self" }
  | { type: "trivia:answer"; roundIndex: number; optionId: string }
  | { type: "trivia:close"; token?: string };

export type ServerMessage =
  | { type: "welcome"; isAdmin: boolean; clientId: string; role: MemberRole }
  | { type: "stateSync"; state: ServerState }
  | { type: "timeUpdate"; currentTime: number; duration: number }
  | { type: "seek"; time: number }
  | { type: "queueUpdated"; queue: QueueTrack[] }
  | { type: "nowPlayingUpdated"; nowPlaying: QueueTrack | null; isPlaying: boolean }
  | { type: "historyUpdated"; history: QueueTrack[] }
  | { type: "roleGranted"; role: MemberRole; message: string }
  | { type: "toast"; message: string; toastType: "info" | "success" | "warning" | "error" }
  | {
      type: "reactionBroadcast";
      id: string;
      clientId: string;
      nickname: string;
      role: MemberRole;
      emoji: string;
      combo: number;
      contributorsCount: number;
      isMilestone?: boolean;
      isClimax?: boolean;
      timestamp: number;
    }
  | {
      type: "comboReset";
      lastCombo: number;
      emoji?: string;
    }
  | {
      type: "shoutoutBroadcast";
      id: string;
      clientId: string;
      nickname: string;
      role: MemberRole;
      text: string;
      timestamp: number;
    }
  | {
      type: "rhythmScoreBroadcast";
      score: {
        id: number;
        trackId: string;
        trackTitle: string;
        trackArtist: string;
        trackThumbnail?: string;
        clientId: string;
        nickname: string;
        score: number;
        accuracy: number;
        maxCombo: number;
        grade: string;
        difficulty: string;
        createdAt: number;
      };
      isNewRecord?: boolean;
    }
  // Trivia Broadcasts
  | { type: "trivia:stateSync"; state: import("./trivia/types.ts").TriviaGameState }
  | { type: "trivia:lobbyCreated"; hostNickname: string; categoryId: string }
  | { type: "trivia:roundStart"; round: import("./trivia/types.ts").TriviaQuestion }
  | {
      type: "trivia:timerStart";
      roundIndex: number;
      startTime: number;
      endTime: number;
      durationSec: number;
    }
  | { type: "trivia:roundEnd"; result: import("./trivia/types.ts").TriviaRoundResult }
  | { type: "trivia:gameOver"; podium: import("./trivia/types.ts").TriviaPodiumEntry[] }
  | { type: "trivia:presetsUpdated"; presets: import("./trivia/types.ts").TriviaPresetItem[] }
  | { type: "trivia:closed" }
  | { type: "youtubeAuthStatus"; status: import("./auth/youtubeLogin.ts").YouTubeCookieStatus };

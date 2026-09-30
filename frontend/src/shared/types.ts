export type AudioProvider = "yt" | "sc";

export type MemberRole = "host" | "dj" | "vip" | "member" | "listener";

export interface SearchResult {
  id: string;
  provider: AudioProvider;
  permalink?: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

export interface TopTrackResult extends SearchResult {
  playCount: number;
  lastPlayedAt?: number;
}

export type QueueItemStatus = "pending" | "resolving" | "ready" | "playing" | "played" | "failed";

export interface TrackVoter {
  clientId: string;
  nickname: string;
  role: MemberRole;
  weight: number;
}

export interface QueueTrack extends SearchResult {
  queueId: string;
  requestedBy: string;
  requestedAt: number;
  votes: number;
  voters?: TrackVoter[];
  votedIps: string[];
  status: QueueItemStatus;
  fallbackCount?: number;
}

export interface MemberInfo {
  clientId: string;
  ip: string;
  nickname: string;
  role: MemberRole;
  connectedAt: number;
  isHost: boolean;
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
  | { type: "setKaraokeMode"; enabled: boolean; level?: number; token?: string };

export type ServerMessage =
  | { type: "welcome"; isAdmin: boolean; clientId: string; role: MemberRole }
  | { type: "stateSync"; state: ServerState }
  | { type: "timeUpdate"; currentTime: number; duration: number }
  | { type: "seek"; time: number }
  | { type: "queueUpdated"; queue: QueueTrack[] }
  | { type: "nowPlayingUpdated"; nowPlaying: QueueTrack | null; isPlaying: boolean }
  | { type: "historyUpdated"; history: QueueTrack[] }
  | { type: "roleGranted"; role: MemberRole; message: string }
  | { type: "toast"; message: string; toastType: "info" | "success" | "warning" | "error" };

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
}

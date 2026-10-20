import type { AudioProvider, MemberRole, SearchResult } from "../types.ts";

export interface TriviaCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  popularArtists: string[];
}

export interface TriviaOption {
  id: string;
  label: string; // "Judul Lagu - Nama Artis"
  title: string;
  artist: string;
}

export interface TriviaSongItem {
  id: string; // YouTube video ID or search query fallback
  provider: AudioProvider;
  title: string;
  artist: string;
  snippetOffset?: number; // detik mulai cuplikan (default 30)
}

export interface TriviaPresetItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "playlist" | "dynamic";
  playlistId?: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  sortOrder: number;
  songCount?: number;
  lastSyncedAt?: number;
  updatedAt?: number;
}

export interface TriviaGameSettings {
  categoryId: string;
  roundCount: number; // 5, 10, 15
  roundDurationSec: number; // 10, 20, 30
  customPlaylistUrl?: string; // Opsi playlist dadakan dari Host
}

export interface TriviaPlayer {
  clientId: string;
  nickname: string;
  role: MemberRole;
  score: number;
  isReady: boolean;
  hasAnswered: boolean;
  selectedOptionId?: string;
  lastAnswerCorrect?: boolean;
  lastAnswerPoints?: number;
  audioOutputMode?: "host" | "self";
  isOnline?: boolean;
  joinedAt: number;
}

export interface TriviaQuestion {
  roundIndex: number; // 1-indexed
  totalRounds: number;
  trackId: string;
  provider: AudioProvider;
  snippetStartSec: number;
  durationSec: number;
  options: TriviaOption[]; // 4 opsi acak
  startTime: number;
  endTime: number;
  listenDurationSec?: number;
  listenStartTime?: number;
  isAudioReady?: boolean;
}

export interface TriviaPlayerRoundResult {
  clientId: string;
  nickname: string;
  isCorrect: boolean;
  pointsEarned: number;
  totalScore: number;
  selectedOptionId?: string;
}

export interface TriviaRoundResult {
  roundIndex: number;
  totalRounds: number;
  correctOptionId: string;
  correctTitle: string;
  correctArtist: string;
  trackId: string;
  playerResults: TriviaPlayerRoundResult[];
  nextSnippet?: {
    trackId: string;
    provider: AudioProvider;
    snippetStartSec: number;
    durationSec: number;
  };
}

export interface TriviaPodiumEntry {
  rank: number; // 1, 2, 3
  clientId: string;
  nickname: string;
  score: number;
}

export type TriviaGameStatus =
  | "idle"
  | "lobby"
  | "countdown"
  | "question"
  | "recap"
  | "podium";

export interface TriviaGameState {
  status: TriviaGameStatus;
  hostClientId: string | null;
  hostNickname: string;
  isHostPlaying: boolean;
  settings: TriviaGameSettings;
  players: Record<string, TriviaPlayer>;
  currentRound?: TriviaQuestion;
  roundResult?: TriviaRoundResult;
  podium?: TriviaPodiumEntry[];
  countdownSec?: number;
}

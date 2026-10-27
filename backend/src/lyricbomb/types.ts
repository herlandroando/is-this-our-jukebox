export type LyricBombGameStatus =
  | "idle"
  | "lobby"
  | "picking_song"
  | "song_loading"
  | "playing"
  | "defusing"
  | "line_success"
  | "exploded"
  | "song_survived"
  | "game_over";

export interface LyricBombPlayer {
  id: string; // socket/user id
  nickname: string;
  avatarSeed?: string;
  isHost: boolean;
  isReady: boolean;
  hp: number; // Max 3, 0 = eliminated
  isEliminated: boolean;
  isOnline?: boolean;
  defusalCount: number; // Statistics
  explosionsTaken: number;
  score: number;
  streak: number;
  maxStreak: number;
  hintsUsed: number;
  wrongTaps: number;
  audioOutputMode?: "host" | "self";
}

export interface LyricBombWordChip {
  id: string; // unique chip id
  text: string;
  originalIndex: number;
}

export interface LyricBombLeadInLine {
  time: number;
  text: string;
  romaji?: string;
  translation?: string;
}

export interface LyricBombSegment {
  segmentIndex: number;
  leadInStartTime: number;
  stopTime: number;
  resumeStartTime: number;
  resumeEndTime: number;
  leadInTexts: string[];
  leadInLines: LyricBombLeadInLine[];
  targetOriginalText: string;
  targetDisplayScript?: string;
  targetTranslation?: string;
  words: string[];
  scrambledChips: LyricBombWordChip[];
}

export interface LyricBombSongInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt?: string;
  duration: number;
  segments: LyricBombSegment[];
}

export interface LyricBombPodiumEntry {
  rank: number;
  id: string;
  nickname: string;
  score: number;
  hp: number;
  isEliminated: boolean;
  defusalCount: number;
  maxStreak: number;
  explosionsTaken: number;
}

export interface LyricBombWrongTapEvent {
  playerId: string;
  chipId: string;
  penaltySec: number;
  timestamp: number;
}

export interface LyricBombState {
  status: LyricBombGameStatus;
  hostClientId: string | null;
  isHostPlaying: boolean;
  roundNumber: number; // 1, 2, 3...
  startingBombDuration: number; // e.g. 18, 16, 14... seconds
  turnBombDuration: number; // current turn's max bomb duration
  currentBombTimeLeft: number; // seconds remaining in current turn
  pickerTimeLeft: number | null; // seconds remaining to pick a song, or null if untimed
  players: Record<string, LyricBombPlayer>;
  playerTurnOrder: string[]; // Active player IDs in turn order
  activePlayerId: string | null;
  pickerPlayerId: string | null;
  currentSong: LyricBombSongInfo | null;
  currentSegmentIndex: number;
  selectedWordIds: string[]; // Current tapped words by active player
  lastExplodedPlayerId: string | null;
  lastWrongTap: LyricBombWrongTapEvent | null;
  lastPointsEarned?: number;
  lastLifeGained?: boolean;
  winnerPlayerId: string | null;
  podium?: LyricBombPodiumEntry[];
  isAudioReady?: boolean;
  audioIssueReports?: Array<{ playerId: string; nickname: string; timestamp: number }>;
}

export interface VerifiedLyricBombSong {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  category: string;
  duration: number;
  lineCount: number;
}

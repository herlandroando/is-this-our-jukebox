export type AudioProvider = "yt" | "sc";
export type SearchFilterProvider = "yt_music" | "yt_normal" | "sc";

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
  | { type: "trivia:create"; settings: TriviaGameSettings; token?: string }
  | { type: "trivia:join" }
  | { type: "trivia:leave" }
  | { type: "trivia:ready"; isReady: boolean }
  | { type: "trivia:setHostPlaying"; isPlaying: boolean; token?: string }
  | { type: "trivia:forceStart"; token?: string }
  | { type: "trivia:audioReady"; roundIndex: number }
  | { type: "trivia:setAudioMode"; mode: "host" | "self" }
  | { type: "trivia:answer"; roundIndex: number; optionId: string }
  | { type: "trivia:reportAudioIssue" }
  | { type: "trivia:skipQuestion"; token?: string }
  | { type: "trivia:close"; token?: string }
  // Lyric Bomb Game
  | { type: "lyricbomb:create"; token?: string }
  | { type: "lyricbomb:join" }
  | { type: "lyricbomb:leave" }
  | { type: "lyricbomb:ready"; isReady: boolean }
  | { type: "lyricbomb:setHostPlaying"; isPlaying: boolean; token?: string }
  | { type: "lyricbomb:setStartingDuration"; durationSec: number; token?: string }
  | { type: "lyricbomb:setAudioMode"; mode: "host" | "self" }
  | { type: "lyricbomb:audioReady"; segmentIndex: number }
  | { type: "lyricbomb:start"; token?: string }
  | {
      type: "lyricbomb:selectSong";
      song: { videoId: string; title: string; artist: string; duration: number; albumArt?: string };
    }
  | { type: "lyricbomb:randomSong" }
  | { type: "lyricbomb:wordTap"; chipId: string }
  | { type: "lyricbomb:useHint" }
  | { type: "lyricbomb:resetWords" }
  | { type: "lyricbomb:reportAudioIssue" }
  | { type: "lyricbomb:skipSong"; token?: string }
  | { type: "lyricbomb:rematch"; token?: string }
  | { type: "lyricbomb:close"; token?: string }
  | { type: "ping" };

export interface ReactionBroadcastItem {
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

export interface ShoutoutBroadcastItem {
  id: string;
  clientId: string;
  nickname: string;
  role: MemberRole;
  text: string;
  timestamp: number;
}

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
  | ({ type: "reactionBroadcast" } & ReactionBroadcastItem)
  | { type: "comboReset"; lastCombo: number; emoji?: string }
  | ({ type: "shoutoutBroadcast" } & ShoutoutBroadcastItem)
  | {
      type: "rhythmScoreBroadcast";
      score: RhythmScoreEntry;
      isNewRecord?: boolean;
    }
  // Trivia Broadcasts
  | { type: "trivia:stateSync"; state: TriviaGameState }
  | { type: "trivia:lobbyCreated"; hostNickname: string; categoryId: string }
  | { type: "trivia:roundStart"; round: TriviaQuestion }
  | {
      type: "trivia:timerStart";
      roundIndex: number;
      startTime: number;
      endTime: number;
      durationSec: number;
      listenDurationSec?: number;
      listenStartTime?: number;
    }
  | { type: "trivia:roundEnd"; result: TriviaRoundResult }
  | { type: "trivia:gameOver"; podium: TriviaPodiumEntry[] }
  | { type: "trivia:closed" }
  | { type: "trivia:presetsUpdated"; presets: TriviaPresetItem[] }
  // Lyric Bomb Broadcasts
  | { type: "lyricbomb:stateSync"; state: LyricBombState }
  | { type: "lyricbomb:lobbyCreated"; hostId: string }
  | {
      type: "lyricbomb:wordTapWrong";
      playerId: string;
      chipId: string;
      penaltySec: number;
      timeLeft: number;
    }
  | { type: "lyricbomb:closed" }
  | { type: "pong" }
  | { type: "youtubeAuthStatus"; status: YouTubeCookieStatus };

// --- Lyric Bomb Types ---
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
  id: string;
  nickname: string;
  avatarSeed?: string;
  isHost: boolean;
  isReady: boolean;
  hp: number;
  isEliminated: boolean;
  isOnline?: boolean;
  defusalCount: number;
  explosionsTaken: number;
  score: number;
  streak: number;
  maxStreak: number;
  hintsUsed: number;
  wrongTaps: number;
  audioOutputMode?: "host" | "self";
}

export interface LyricBombWordChip {
  id: string;
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
  roundNumber: number;
  startingBombDuration: number;
  turnBombDuration: number;
  currentBombTimeLeft: number;
  pickerTimeLeft: number | null;
  players: Record<string, LyricBombPlayer>;
  playerTurnOrder: string[];
  activePlayerId: string | null;
  pickerPlayerId: string | null;
  currentSong: LyricBombSongInfo | null;
  currentSegmentIndex: number;
  selectedWordIds: string[];
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

export interface YouTubeCookieStatus {
  hasCookies: boolean;
  fileSize?: number;
  lastModified?: number;
  isLoggedIn?: boolean;
  loginInProgress?: boolean;
  statusMessage?: string;
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

export interface TriviaCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  popularArtists: string[];
}

export interface TriviaOption {
  id: string;
  label: string;
  title: string;
  artist: string;
}

export interface TriviaGameSettings {
  categoryId: string;
  roundCount: number;
  roundDurationSec: number;
  customPlaylistUrl?: string;
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
  roundIndex: number;
  totalRounds: number;
  trackId: string;
  provider: AudioProvider;
  snippetStartSec: number;
  durationSec: number;
  options: TriviaOption[];
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
  rank: number;
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
  isHostPlaying?: boolean;
  settings: TriviaGameSettings;
  players: Record<string, TriviaPlayer>;
  currentRound?: TriviaQuestion;
  roundResult?: TriviaRoundResult;
  podium?: TriviaPodiumEntry[];
  countdownSec?: number;
  audioIssueReports?: Array<{ playerId: string; nickname: string; timestamp: number }>;
}

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
}

export interface RhythmNote {
  time: number;
  lane: 0 | 1 | 2 | 3;
  duration?: number;
}

export interface RhythmBeatmap {
  trackId: string;
  bpm: number;
  duration: number;
  totalNotes: number;
  notes: RhythmNote[];
  difficulty: "easy" | "normal" | "hard";
  generatedAt: number;
}

export interface RhythmScoreSubmission {
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackThumbnail?: string;
  clientId: string;
  nickname: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: "SS" | "S" | "A" | "B" | "C" | "D";
  hits300: number;
  hits200: number;
  hits100: number;
  hits50: number;
  misses: number;
  difficulty: "easy" | "normal" | "hard";
}

export interface RhythmScoreEntry extends RhythmScoreSubmission {
  id: number;
  createdAt: number;
}

export interface RankedSongSummary {
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackThumbnail?: string;
  topScore: number;
  topPlayer: string;
  topGrade: string;
  totalPlays: number;
}

export interface GlobalUserRanking {
  nickname: string;
  clientId: string;
  totalScore: number;
  totalPlays: number;
  crownsCount: number;
  avgAccuracy: number;
  bestGrade: string;
}

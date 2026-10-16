export interface RhythmNote {
  time: number; // in seconds
  lane: 0 | 1 | 2 | 3; // 4 lanes
  duration?: number; // for hold notes (optional, default 0 for tap)
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
  crownsCount: number; // number of #1 songs held
  avgAccuracy: number;
  bestGrade: string;
}

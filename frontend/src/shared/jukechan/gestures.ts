import type { ArmPoseKey, EmotionKey, EyeSpecial } from "./params.ts";

export type GestureKey =
  | "patHead"
  | "pinchCheek"
  | "adjustHeadphone"
  | "flickAhoge"
  | "annoyedWarn"
  | "poutSulking"
  | "waveWelcome"
  | "peaceStart"
  | "clapCombo"
  | "holdEarcupDrop"
  | "thumbsUpVote"
  | "karaokeMic"
  | "skipShock"
  | "reactFire"
  | "reactHeart"
  | "reactDance"
  | "reactGuitar"
  | "reactSkull"
  | "reactParty"
  | "wakeShock";

export type FxKind =
  | "notes"
  | "hearts"
  | "sparkles"
  | "anger"
  | "sweat"
  | "zzz"
  | "shock"
  | "confetti"
  | "fire";

export interface GestureSpec {
  key: GestureKey;
  priority: number;       // higher overrides lower (pout = 100, room = 60, tap = 50, emoji = 40)
  durationMs: number;
  emotion: EmotionKey;
  armPose: ArmPoseKey;
  eyeSpecial?: EyeSpecial;
  fx?: FxKind;
  headRollImpulse?: number;
  bounceImpulse?: number;
  ahogeImpulse?: number;
  oscillateSpeedHz?: number; // for waving, fanning, clapping, air-guitar
}

export const GESTURE_SPECS: Record<GestureKey, GestureSpec> = {
  patHead: {
    key: "patHead",
    priority: 55,
    durationMs: 2400,
    emotion: "happy",
    armPose: "relaxed",
    fx: "hearts",
    headRollImpulse: 18,
    bounceImpulse: 35,
    ahogeImpulse: 45,
  },
  pinchCheek: {
    key: "pinchCheek",
    priority: 55,
    durationMs: 2500,
    emotion: "flustered",
    armPose: "surprisedUp",
    fx: "sweat",
    headRollImpulse: -28,
    ahogeImpulse: 35,
  },
  adjustHeadphone: {
    key: "adjustHeadphone",
    priority: 55,
    durationMs: 2300,
    emotion: "happy",
    armPose: "holdEarcup",
    eyeSpecial: "star",
    fx: "notes",
    headRollImpulse: 15,
    bounceImpulse: -40,
  },
  flickAhoge: {
    key: "flickAhoge",
    priority: 58,
    durationMs: 2100,
    emotion: "surprised",
    armPose: "surprisedUp",
    fx: "shock",
    bounceImpulse: -65,
    ahogeImpulse: 160,
  },
  annoyedWarn: {
    key: "annoyedWarn",
    priority: 75,
    durationMs: 2200,
    emotion: "annoyed",
    armPose: "crossedPout",
    fx: "anger",
    headRollImpulse: -20,
    ahogeImpulse: 60,
  },
  poutSulking: {
    key: "poutSulking",
    priority: 100,
    durationMs: 5000,
    emotion: "pout",
    armPose: "crossedPout",
    fx: "anger",
    headRollImpulse: -25,
  },
  waveWelcome: {
    key: "waveWelcome",
    priority: 65,
    durationMs: 3200,
    emotion: "happy",
    armPose: "wave",
    fx: "sparkles",
    oscillateSpeedHz: 3.4,
    bounceImpulse: -45,
  },
  peaceStart: {
    key: "peaceStart",
    priority: 60,
    durationMs: 2800,
    emotion: "happy",
    armPose: "peace",
    eyeSpecial: "star",
    fx: "notes",
    headRollImpulse: 22,
    bounceImpulse: -55,
  },
  clapCombo: {
    key: "clapCombo",
    priority: 62,
    durationMs: 3000,
    emotion: "laugh",
    armPose: "clap",
    eyeSpecial: "star",
    fx: "confetti",
    oscillateSpeedHz: 4.2,
    bounceImpulse: -60,
  },
  holdEarcupDrop: {
    key: "holdEarcupDrop",
    priority: 45,
    durationMs: 2200,
    emotion: "happy",
    armPose: "holdEarcup",
    fx: "notes",
    bounceImpulse: -70,
  },
  thumbsUpVote: {
    key: "thumbsUpVote",
    priority: 58,
    durationMs: 2400,
    emotion: "happy",
    armPose: "thumbsUp",
    eyeSpecial: "star",
    fx: "sparkles",
    headRollImpulse: 16,
    bounceImpulse: -45,
  },
  karaokeMic: {
    key: "karaokeMic",
    priority: 65,
    durationMs: 3800,
    emotion: "laugh",
    armPose: "holdMic",
    eyeSpecial: "star",
    fx: "notes",
    bounceImpulse: -50,
  },
  skipShock: {
    key: "skipShock",
    priority: 68,
    durationMs: 2500,
    emotion: "surprised",
    armPose: "surprisedUp",
    fx: "sweat",
    headRollImpulse: -24,
    bounceImpulse: -60,
    ahogeImpulse: 95,
  },
  reactFire: {
    key: "reactFire",
    priority: 48,
    durationMs: 2400,
    emotion: "flustered",
    armPose: "fanHot",
    fx: "fire",
    oscillateSpeedHz: 5.0,
    bounceImpulse: -45,
  },
  reactHeart: {
    key: "reactHeart",
    priority: 48,
    durationMs: 2600,
    emotion: "happy",
    armPose: "heartHands",
    eyeSpecial: "heart",
    fx: "hearts",
    headRollImpulse: 20,
    bounceImpulse: -40,
  },
  reactDance: {
    key: "reactDance",
    priority: 48,
    durationMs: 2600,
    emotion: "laugh",
    armPose: "wave",
    fx: "notes",
    oscillateSpeedHz: 3.0,
    bounceImpulse: -55,
  },
  reactGuitar: {
    key: "reactGuitar",
    priority: 48,
    durationMs: 2600,
    emotion: "laugh",
    armPose: "airGuitar",
    eyeSpecial: "star",
    fx: "sparkles",
    oscillateSpeedHz: 5.5,
    bounceImpulse: -60,
  },
  reactSkull: {
    key: "reactSkull",
    priority: 48,
    durationMs: 2300,
    emotion: "surprised",
    armPose: "surprisedUp",
    eyeSpecial: "spiral",
    fx: "shock",
    headRollImpulse: -30,
    ahogeImpulse: 110,
  },
  reactParty: {
    key: "reactParty",
    priority: 48,
    durationMs: 2800,
    emotion: "laugh",
    armPose: "clap",
    eyeSpecial: "star",
    fx: "confetti",
    oscillateSpeedHz: 4.4,
    bounceImpulse: -65,
  },
  wakeShock: {
    key: "wakeShock",
    priority: 85,
    durationMs: 2400,
    emotion: "surprised",
    armPose: "surprisedUp",
    fx: "shock",
    bounceImpulse: -75,
    ahogeImpulse: 130,
  },
};

export function mapEmojiToGesture(emoji: string): GestureKey {
  switch (emoji) {
    case "🔥":
      return "reactFire";
    case "❤️":
      return "reactHeart";
    case "💃":
      return "reactDance";
    case "🎸":
      return "reactGuitar";
    case "💀":
      return "reactSkull";
    case "🎉":
    default:
      return "reactParty";
  }
}

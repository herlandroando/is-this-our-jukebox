import type { MoodKey } from "../useJukeChanMood.ts";

export type EmotionKey =
  | "neutral"
  | "happy"
  | "pout"
  | "annoyed"
  | "sleepy"
  | "asleep"
  | "surprised"
  | "sad"
  | "laugh"
  | "flustered";

export type AwarenessState = "awake" | "drowsy" | "asleep";

export type EyeSpecial = "none" | "heart" | "spiral" | "star" | "tears";

export type MouthShape = "default" | "cat" | "pout" | "o" | "teeth";

export type ArmPoseKey =
  | "relaxed"
  | "holdEarcup"
  | "peace"
  | "wave"
  | "clap"
  | "heartHands"
  | "fanHot"
  | "airGuitar"
  | "crossedPout"
  | "claspedSad"
  | "thumbsUp"
  | "holdMic"
  | "surprisedUp";

export type HitZone = "head" | "cheek" | "headphone" | "ahoge" | "body";

export interface RigParams {
  // Head & body kinematics
  headYaw: number;   // -1..1 (horizontal turn offset on top of 3/4 base)
  headPitch: number; // -1..1 (vertical nod)
  headRoll: number;  // degrees (-12..12)
  bodySway: number;  // degrees (-6..6)
  breath: number;    // 0..1
  bounce: number;    // px (-18..10)

  // Eyes & Gaze
  eyeOpenL: number;  // 0..1.25 (1.2 = wide surprised)
  eyeOpenR: number;  // 0..1.25
  eyeSmile: number;  // 0..1 (1 = happy ^ ^ arch)
  gazeX: number;     // -1..1
  gazeY: number;     // -1..1
  pupilScale: number;// 0.7..1.35
  eyeSpecial: EyeSpecial;

  // Brows & Mouth & Cheeks
  browY: number;     // -1..1 (down..up)
  browAngle: number; // -1..1 (-1 = sad/worried, +1 = angry/furrowed)
  mouthOpen: number; // 0..1 (lip-sync opening)
  mouthForm: number; // -1..1 (-1 = frown, +1 = bright smile)
  mouthShape: MouthShape;
  cheekPuff: number; // 0..1 (1 = full anime pout bulge)
  blush: number;     // 0..1

  // Arms
  armPose: ArmPoseKey;
  armWavePhase: number; // dynamic oscillation for wave/fan/clap/guitar

  // Secondary hair spring outputs (degrees / px)
  hair: {
    bangsRot: number;
    sideLRot: number;
    sideRRot: number;
    backRot: number;
    ahogeRot: number;
  };
}

export function createDefaultParams(): RigParams {
  return {
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    bodySway: 0,
    breath: 0,
    bounce: 0,
    eyeOpenL: 1,
    eyeOpenR: 1,
    eyeSmile: 0,
    gazeX: 0,
    gazeY: 0,
    pupilScale: 1,
    eyeSpecial: "none",
    browY: 0,
    browAngle: 0,
    mouthOpen: 0,
    mouthForm: 0.35,
    mouthShape: "default",
    cheekPuff: 0,
    blush: 0.25,
    armPose: "holdEarcup",
    armWavePhase: 0,
    hair: {
      bangsRot: 0,
      sideLRot: 0,
      sideRRot: 0,
      backRot: 0,
      ahogeRot: 0,
    },
  };
}

export interface MoodRigBaseline {
  eyeOpen: number;
  browY: number;
  browAngle: number;
  mouthForm: number;
  mouthShape: MouthShape;
  blush: number;
  bounceFactor: number;
  swayFactor: number;
  breathHz: number;
  defaultArm: ArmPoseKey;
}

export const MOOD_BASELINES: Record<MoodKey, MoodRigBaseline> = {
  hype: {
    eyeOpen: 1.05,
    browY: 0.2,
    browAngle: 0.15,
    mouthForm: 0.85,
    mouthShape: "cat",
    blush: 0.35,
    bounceFactor: 1.45,
    swayFactor: 1.3,
    breathHz: 0.36,
    defaultArm: "holdEarcup",
  },
  lofi: {
    eyeOpen: 0.78,
    browY: -0.05,
    browAngle: -0.15,
    mouthForm: 0.25,
    mouthShape: "default",
    blush: 0.2,
    bounceFactor: 0.55,
    swayFactor: 0.75,
    breathHz: 0.2,
    defaultArm: "relaxed",
  },
  romance: {
    eyeOpen: 1.0,
    browY: 0.15,
    browAngle: -0.1,
    mouthForm: 0.7,
    mouthShape: "cat",
    blush: 0.65,
    bounceFactor: 0.95,
    swayFactor: 1.05,
    breathHz: 0.28,
    defaultArm: "holdEarcup",
  },
  galau: {
    eyeOpen: 0.85,
    browY: -0.2,
    browAngle: -0.65,
    mouthForm: -0.35,
    mouthShape: "default",
    blush: 0.18,
    bounceFactor: 0.4,
    swayFactor: 0.6,
    breathHz: 0.18,
    defaultArm: "claspedSad",
  },
};

export interface EmotionPreset {
  eyeOpen?: number;
  eyeSmile?: number;
  eyeSpecial?: EyeSpecial;
  pupilScale?: number;
  browY?: number;
  browAngle?: number;
  mouthOpen?: number;
  mouthForm?: number;
  mouthShape?: MouthShape;
  cheekPuff?: number;
  blush?: number;
  headYawOffset?: number;
  headPitchOffset?: number;
  headRollOffset?: number;
}

export const EMOTION_PRESETS: Record<EmotionKey, EmotionPreset> = {
  neutral: {},
  happy: {
    eyeSmile: 1,
    browY: 0.35,
    browAngle: -0.1,
    mouthForm: 0.9,
    mouthShape: "cat",
    blush: 0.55,
    headRollOffset: 2.5,
  },
  laugh: {
    eyeSmile: 1,
    browY: 0.4,
    mouthOpen: 0.65,
    mouthForm: 1.0,
    mouthShape: "cat",
    blush: 0.6,
    headPitchOffset: -0.2,
  },
  flustered: {
    eyeOpen: 0.88,
    pupilScale: 1.15,
    browY: 0.1,
    browAngle: -0.5,
    mouthShape: "pout",
    mouthForm: -0.2,
    blush: 0.95,
    headYawOffset: -0.3,
    headRollOffset: -3,
  },
  annoyed: {
    eyeOpen: 0.68,
    browY: -0.25,
    browAngle: 0.75,
    mouthForm: -0.5,
    mouthShape: "pout",
    blush: 0.5,
  },
  pout: {
    eyeOpen: 0.62,
    browY: -0.3,
    browAngle: 0.85,
    mouthForm: -0.6,
    mouthShape: "pout",
    cheekPuff: 1,
    blush: 0.8,
    headYawOffset: -0.55,
    headRollOffset: -4,
  },
  surprised: {
    eyeOpen: 1.22,
    pupilScale: 0.78,
    browY: 0.65,
    browAngle: -0.2,
    mouthOpen: 0.55,
    mouthShape: "o",
    headPitchOffset: -0.25,
  },
  sad: {
    eyeOpen: 0.82,
    eyeSpecial: "tears",
    browY: -0.25,
    browAngle: -0.85,
    mouthForm: -0.55,
    mouthShape: "default",
    blush: 0.25,
    headPitchOffset: 0.3,
    headRollOffset: -2.5,
  },
  sleepy: {
    eyeOpen: 0.35,
    browY: -0.2,
    browAngle: -0.3,
    mouthOpen: 0.15,
    mouthForm: -0.1,
    mouthShape: "o",
    headPitchOffset: 0.35,
    headRollOffset: 3,
  },
  asleep: {
    eyeOpen: 0,
    eyeSmile: 0,
    browY: -0.15,
    browAngle: -0.2,
    mouthOpen: 0.12,
    mouthShape: "o",
    blush: 0.35,
    headPitchOffset: 0.55,
    headRollOffset: 5.5,
  },
};

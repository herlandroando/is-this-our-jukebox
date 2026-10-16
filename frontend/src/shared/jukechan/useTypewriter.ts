import { ref } from "vue";
import type { MoodKey } from "../useJukeChanMood.ts";
import { reactionAudio } from "../useReactionSound.ts";

// Shared reactive mouth pulse driven by typewriter blips (0..1)
export const speechMouthLevel = ref<number>(0);
export const typedDialogueText = ref<string>("");

let typeTimer: ReturnType<typeof setTimeout> | null = null;
let mouthDecayTimer: ReturnType<typeof setTimeout> | null = null;
let currentFullText = "";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Starts typewriter reveal for Juke-chan dialogue text, firing voice blips & mouth pulses.
 */
export function startTypewriterSpeech(
  fullText: string,
  mood: MoodKey,
  playBlips = true
) {
  if (typeTimer) clearTimeout(typeTimer);
  if (mouthDecayTimer) clearTimeout(mouthDecayTimer);

  currentFullText = fullText;

  if (prefersReducedMotion()) {
    typedDialogueText.value = fullText;
    speechMouthLevel.value = 0;
    return;
  }

  // Split by code points so multi-byte emojis stay intact
  const chars = Array.from(fullText);
  let idx = 0;
  typedDialogueText.value = "";

  const baseStepMs =
    mood === "hype" ? 24 : mood === "romance" ? 28 : mood === "lofi" ? 34 : 38;

  const step = () => {
    if (idx >= chars.length) {
      speechMouthLevel.value = 0;
      return;
    }

    const ch = chars[idx];
    idx++;
    typedDialogueText.value = chars.slice(0, idx).join("");

    // Check if alphanumeric character for blip & lip-sync
    if (/[a-zA-Z0-9]/.test(ch)) {
      const isVowel = /[aiueoAIUEO]/.test(ch);
      speechMouthLevel.value = isVowel ? 0.85 : 0.45;
      if (playBlips && idx % 2 === 1) {
        reactionAudio.playVoiceBlip(mood, ch);
      }
      if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
      mouthDecayTimer = setTimeout(() => {
        speechMouthLevel.value = 0.12;
      }, 45);
    } else if (/[,.;!?~…]/.test(ch)) {
      speechMouthLevel.value = 0;
    }

    let delay = baseStepMs;
    if (/[.!?]/.test(ch)) delay = baseStepMs * 4.5;
    else if (/[,;~]/.test(ch)) delay = baseStepMs * 2.4;

    typeTimer = setTimeout(step, delay);
  };

  step();
}

/**
 * Instantly reveals the full dialogue text if user taps the speech bubble while typing.
 */
export function finishTypewriterSpeech(): boolean {
  if (typedDialogueText.value.length < currentFullText.length) {
    if (typeTimer) clearTimeout(typeTimer);
    if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
    typedDialogueText.value = currentFullText;
    speechMouthLevel.value = 0;
    return true;
  }
  return false;
}

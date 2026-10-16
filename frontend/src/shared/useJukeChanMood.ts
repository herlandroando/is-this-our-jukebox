import { ref, computed } from "vue";
import type { QueueTrack } from "./types.ts";
import { reactionAudio } from "./useReactionSound.ts";
import type { AwarenessState, EmotionKey, HitZone } from "./jukechan/params.ts";
import {
  GESTURE_SPECS,
  mapEmojiToGesture,
  type FxKind,
  type GestureKey,
} from "./jukechan/gestures.ts";
import { pickDialogue } from "./jukechan/dialogue.ts";
import {
  startTypewriterSpeech,
  finishTypewriterSpeech,
  typedDialogueText,
} from "./jukechan/useTypewriter.ts";
import { sharedPlaybackActive } from "./jukechan/beatDriver.ts";

export type MoodKey = "hype" | "lofi" | "romance" | "galau";

export interface MoodProfile {
  key: MoodKey;
  name: string;
  badge: string;
  primary: string;
  secondary: string;
  bg1: string;
  bg2: string;
  beatSpeed: string; // e.g. "0.45s"
  greetings: { text: string; lyric: string }[];
  comboSurges: { text: string; lyric: string }[];
  directTaps: { text: string; lyric: string }[];
  idleLyrics: { text: string; lyric: string }[];
}

export const MOOD_PROFILES: Record<MoodKey, MoodProfile> = {
  hype: {
    key: "hype",
    name: "Electronic Hype",
    badge: "⚡ HYPE",
    primary: "#00f5d4",
    secondary: "#f72585",
    bg1: "#240046",
    bg2: "#10002b",
    beatSpeed: "0.45s",
    greetings: [
      {
        text: "DROP THE BEAT! Lagu ini enerjik banget, ayo goyang semuanya! 🔥⚡",
        lyric: "\"Feel the electric pulse running through the jukebox!\"",
      },
      {
        text: "Track Hype terdeteksi! Siap-siap loncat bareng Juke-chan! 🎧💥",
        lyric: "\"Maximum bass overdrive activated!\"",
      },
      {
        text: "Volume naikin dikit lagi seru nih! Ruangan kita auto pecah! ⚡🔥",
        lyric: "\"Rhythm never stops, keep the party alive!\"",
      },
    ],
    comboSurges: [
      {
        text: "ULTRA BASS SURGE!! Jukebox-nya getar kencang banget guys! 🔥🔥🔥",
        lyric: "\"MAXIMUM POWER DROP ON REPEAT!\"",
      },
      {
        text: "Spam teruss! DJ Juke-chan makin semangat nih! ⚡🎧",
        lyric: "\"Crowd is going wild right now!\"",
      },
    ],
    directTaps: [
      {
        text: "Waktunya drop the bass! Mau request yang lebih kencang lagi? ⚡🎧",
        lyric: "\"Can't hold back the tempo!\"",
      },
      {
        text: "Hehe jangan cuma dicolek, ikutan joget dong! 💃🔥",
        lyric: "\"Let the rhythm take control!\"",
      },
    ],
    idleLyrics: [
      {
        text: "Bassline-nya enak parah, gak bisa diem dengerinnya~ ⚡",
        lyric: "\"Pumping through the veins, feel the sound!\"",
      },
    ],
  },
  lofi: {
    key: "lofi",
    name: "Midnight Lo-Fi",
    badge: "☕ LO-FI",
    primary: "#80ffdb",
    secondary: "#72efdd",
    bg1: "#1b263b",
    bg2: "#0d1b2a",
    beatSpeed: "1.3s",
    greetings: [
      {
        text: "Suasana tenang terdeteksi... Paling enak kerja sambil dengerin vibes ini ☕🌧️",
        lyric: "\"Rintik melodi di sela-sela malam yang sunyi...\"",
      },
      {
        text: "Chill mode activated. Tarik napas, rileks bareng alunan melodi~ 💜🍃",
        lyric: "\"Warm coffee in a quiet midnight room...\"",
      },
      {
        text: "Vibe lo-fi yang adem... Juke-chan temenin kamu fokus ya 🎧✨",
        lyric: "\"Vinyl softly crackling in the background...\"",
      },
    ],
    comboSurges: [
      {
        text: "Meskipun lagunya santai, antusias kalian hangat banget ya ☕💜",
        lyric: "\"Gentle sparks floating through the calm air~\"",
      },
      {
        text: "Vibing pol bareng-bareng! Rileks tapi tetap berenergi ✨☕",
        lyric: "\"Waves of harmony touching everyone...\"",
      },
    ],
    directTaps: [
      {
        text: "Sambil seruput kopi dulu yuk, gak usah buru-buru ☕💜",
        lyric: "\"Take your time, let the melody flow...\"",
      },
      {
        text: "Juke-chan selalu di sini nemenin kamu kok, santai aja ya~ 🍃🎧",
        lyric: "\"Peaceful beats for your heart...\"",
      },
    ],
    idleLyrics: [
      {
        text: "Dentingan nadanya bikin tenang banget di kepala ya... ☕",
        lyric: "\"Soft piano keys drifting into the night...\"",
      },
    ],
  },
  romance: {
    key: "romance",
    name: "Sweet City Pop",
    badge: "🌸 SWEET",
    primary: "#ff758f",
    secondary: "#ff4d6d",
    bg1: "#4a154b",
    bg2: "#230924",
    beatSpeed: "0.75s",
    greetings: [
      {
        text: "Aww melodinya manis banget! Siapa nih yang lagi jatuh cinta? 💖🌸",
        lyric: "\"Putar terus kaset kenangan indah ini~\"",
      },
      {
        text: "City Pop & Sweet Vibes terdeteksi! Bikin ruangan kita makin hangat~ 🍓✨",
        lyric: "\"Neon lights, sweet smiles, unforgettable night~\"",
      },
      {
        text: "Kyaa~ Liriknya romantis banget! Juke-chan jadi ikut senyum-senyum sendiri 💖🎧",
        lyric: "\"You are my favorite track on repeat...\"",
      },
    ],
    comboSurges: [
      {
        text: "Daisuki x1000!! Playlist hati Juke-chan penuh nama kalian! 💖🌸✨",
        lyric: "\"Spreading love vibrations across the whole room!\"",
      },
      {
        text: "Manis banget kalian semua! Mood-nya jadi pink berbunga-bunga! 🍓💖",
        lyric: "\"Sweet city love under the glitter ball!\"",
      },
    ],
    directTaps: [
      {
        text: "Ih colek-colek! Mau request lagu buat orang spesial ya? 💖🌸",
        lyric: "\"Every heartbeat sings your name~\"",
      },
      {
        text: "Juke-chan senang banget kalau kamu dengerin lagu di jukebox kita! 🍓✨",
        lyric: "\"Our favorite melody forever!\"",
      },
    ],
    idleLyrics: [
      {
        text: "Nuansa city pop klasik gini emang gak pernah gagal bikin seneng ya~ 🌸",
        lyric: "\"Dancing down the boulevard together...\"",
      },
    ],
  },
  galau: {
    key: "galau",
    name: "Sad Indie Acoustic",
    badge: "🌧️ GALAU",
    primary: "#4ea8de",
    secondary: "#5390d9",
    bg1: "#1d3557",
    bg2: "#0b132b",
    beatSpeed: "1.5s",
    greetings: [
      {
        text: "Liriknya dalem banget... Sini nemenin Juke-chan, jangan sedih sendirian ya 🥺🌧️",
        lyric: "\"Bahkan saat lagunya usai, kenangannya masih berputar...\"",
      },
      {
        text: "Acoustic melancholy terdeteksi... Ada yang lagi mengenang masa lalu ya? 🥀💧",
        lyric: "\"Petikan senar gitar dan rintik air mata...\"",
      },
      {
        text: "Lagunya menyentuh hati banget... Tarik selimut atau senderan dulu yuk 🌧️💙",
        lyric: "\"Echoes of words we never had the chance to say...\"",
      },
    ],
    comboSurges: [
      {
        text: "Huaaa jangan nangis bareng-bareng! Nanti Juke-chan putarin lagu ceria deh! 😭🤧",
        lyric: "\"Tears falling like rain on the turntable...\"",
      },
      {
        text: "Meskipun galau, kita laluin bareng-bareng di jukebox ini ya 💙🌧️",
        lyric: "\"Healing together through the music...\"",
      },
    ],
    directTaps: [
      {
        text: "Sini peluk Juke-chan dulu... Kalau sedih boleh diungkapin kok 🥺🌧️",
        lyric: "\"You are not alone in this melody...\"",
      },
      {
        text: "Juke-chan siap dengerin curhatan kamu kapan aja lewat lagu ini 💧💙",
        lyric: "\"Finding comfort in every chord...\"",
      },
    ],
    idleLyrics: [
      {
        text: "Lirik lagunya ngena banget di dada ya... 🥀",
        lyric: "\"Someday we will smile looking back at this song...\"",
      },
    ],
  },
};

const ARTISTS_ROCK_EMO = [
  "my chemical romance", "linkin park", "paramore", "green day", "fall out boy",
  "blink-182", "avenged sevenfold", "bring me the horizon", "radiohead", "nirvana",
  "muse", "system of a down", "slipknot", "foo fighters", "evanescence", "simple plan",
  "sum 41", "all time low", "weezer", "pierce the veil", "sleeping with sirens", "oasis"
];

const ARTISTS_CHILL = [
  "cigarettes after sex", "keshi", "boy pablo", "cuco", "phum viphurit",
  "chilledcow", "lofi girl", "joji", "bruno major", "fiji blue", "men i trust"
];

const KEYWORDS_HYPE = [
  "remix", "drop", "overdrive", "bass", "metal", "rock", "hardstyle",
  "electronic", "phonk", "party", "club", "dance", "beat", "hyper",
  "cyber", "drum and bass", "dnb", "techno", "trap", "edm", "speed",
  "fast", "hype", "energy", "festival", "rave", "dj", "mashup",
  "skrillex", "marshmello", "alan walker", "chainsmokers", "zedd",
  "avicii", "martin garrix", "tiesto", "deadmau5", "kpop", "uptempo",
];

const KEYWORDS_LOFI = [
  "lofi", "lo-fi", "chill", "coffee", "night", "rain", "sleep", "study",
  "relax", "instrumental", "soft", "jazz", "mellow", "midnight", "cafe",
  "calm", "vibes", "bedtime", "peaceful", "beats to relax", "chilledcow",
  "ambient", "cozy", "hujan", "malam", "santai", "hening",
];

const KEYWORDS_ROMANCE = [
  "love", "heart", "cinta", "sayang", "rindu", "sweet", "city pop",
  "disco", "darling", "honey", "kiss", "romantic", "kasih",
  "bucin", "crush", "memories", "summer", "kasmaran", "kekasih",
  "tatsuro yamashita", "mariya takeuchi", "anri", "miki matsubara",
  "pop manis", "lagu cinta", "happy", "cute", "smile", "cantik",
  "jatuh cinta", "soulmate", "forever",
];

const KEYWORDS_GALAU = [
  "cancer", "galau", "sad", "tears", "alone", "kenangan", "hilang", "luka",
  "acoustic", "akustik", "piano", "faded", "broken", "tangis", "kecewa",
  "putus", "sunyi", "sepi", "hampa", "menangis", "patah", "trauma",
  "sorry", "cry", "crying", "goodbye", "hurt", "pain", "terluka",
  "die", "dying", "death", "dead", "funeral", "leaving", "left me",
  "suicide", "melancholy", "regret", "broken heart", "heartbroken",
  "lonely", "depressed", "depression", "disenchanted", "ghost of you",
  "i don't love you", "pamungkas", "hindia", "fiersa besari", "judika",
  "tulus", "anggi marito", "mahalini", "raisa", "lyodra", "adele",
  "lewis capaldi", "olivia rodrigo",
];

// Global reactive states shared across all Juke-chan instances
const currentMoodKey = ref<MoodKey>("hype");
const fullDialogueText = ref<string>("Halo! Selamat datang di Is This Our Jukebox! 🎧✨");
const dialogueLyric = ref<string>("\"Let the music connect our souls~\"");
const isSpeaking = ref<boolean>(true);
const eyesExpression = ref<"normal" | "happy">("normal");
const mouthExpression = ref<"normal" | "sing">("normal");
const isBouncing = ref<boolean>(false);

// Extended Live2D-style rig reactive state
const emotion = ref<EmotionKey>("neutral");
const awareness = ref<AwarenessState>("awake");
const activeGesture = ref<GestureKey | null>(null);
const activeFx = ref<FxKind | null>(null);
const fxTriggerId = ref<number>(0);
const isKaraokeActive = ref<boolean>(false);

// Impulse event bus for physical springs (incremented id triggers animator impulse)
export const rigImpulseEvent = ref<{
  id: number;
  headRoll: number;
  bounce: number;
  ahoge: number;
}>({ id: 0, headRoll: 0, bounce: 0, ahoge: 0 });

// Poke-spam & pout state (≥6 taps within 3000ms -> 5000ms pout)
const pokeTimestamps: number[] = [];
let poutUntilMs = 0;
let poutRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

// Sleep / Drowsy tracking (90s drowsy, 150s asleep when not playing)
let lastActivityMs = Date.now();
let speechTimer: ReturnType<typeof setTimeout> | null = null;
let expressionTimer: ReturnType<typeof setTimeout> | null = null;
let gestureTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setInterval> | null = null;

// Initialize initial typewriter state
typedDialogueText.value = fullDialogueText.value;

export function useJukeChanMood() {
  const currentMood = computed(() => MOOD_PROFILES[currentMoodKey.value]);

  // Expose typewriter text as dialogueText so existing templates get live typewriter effect
  const dialogueText = computed(() =>
    typedDialogueText.value || fullDialogueText.value
  );

  function applyMoodCss(profile: MoodProfile) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--mood-primary", profile.primary);
    root.style.setProperty("--mood-secondary", profile.secondary);
    root.style.setProperty("--mood-bg-1", profile.bg1);
    root.style.setProperty("--mood-bg-2", profile.bg2);
    root.style.setProperty("--beat-speed", profile.beatSpeed);
  }

  function emitSpringImpulse(headRoll = 0, bounce = 0, ahoge = 0) {
    rigImpulseEvent.value = {
      id: rigImpulseEvent.value.id + 1,
      headRoll,
      bounce,
      ahoge,
    };
  }

  function triggerFx(fx?: FxKind) {
    if (!fx) return;
    activeFx.value = fx;
    fxTriggerId.value++;
  }

  /**
   * Plays a prioritized gesture with arm pose, facial override, spring impulse, and particle FX
   */
  function triggerGesture(key: GestureKey, customDurationMs?: number) {
    const spec = GESTURE_SPECS[key];
    if (!spec) return;

    // Respect higher-priority active gesture (e.g., poutSulking)
    if (activeGesture.value) {
      const currentSpec = GESTURE_SPECS[activeGesture.value];
      if (currentSpec && currentSpec.priority > spec.priority) {
        return;
      }
    }

    if (gestureTimer) clearTimeout(gestureTimer);
    activeGesture.value = key;
    emotion.value = spec.emotion;

    if (spec.fx) {
      triggerFx(spec.fx);
    }
    if (spec.headRollImpulse || spec.bounceImpulse || spec.ahogeImpulse) {
      emitSpringImpulse(
        spec.headRollImpulse ?? 0,
        spec.bounceImpulse ?? 0,
        spec.ahogeImpulse ?? 0
      );
    }

    const duration = customDurationMs ?? spec.durationMs;
    gestureTimer = setTimeout(() => {
      if (activeGesture.value === key) {
        activeGesture.value = null;
        if (awareness.value === "asleep") {
          emotion.value = "asleep";
        } else if (awareness.value === "drowsy") {
          emotion.value = "sleepy";
        } else {
          emotion.value = "neutral";
        }
      }
    }, duration);
  }

  /**
   * Records user or room activity; wakes Juke-chan up if she was drowsy or asleep
   */
  function recordActivity(announceWake = true): boolean {
    lastActivityMs = Date.now();
    if (awareness.value === "asleep" || awareness.value === "drowsy") {
      const wasAsleep = awareness.value === "asleep";
      awareness.value = "awake";
      emotion.value = "neutral";
      if (wasAsleep && announceWake) {
        triggerGesture("wakeShock");
        const line = pickDialogue("wakeUp");
        showSpeech(line.text, line.lyric, 3800);
        return true;
      }
    }
    return false;
  }

  /**
   * Trigger speaking speech bubble with dynamic typewriter & voice blips
   */
  function showSpeech(text: string, lyric = "", duration = 4200, playBlips = true) {
    if (speechTimer) clearTimeout(speechTimer);

    fullDialogueText.value = text;
    dialogueLyric.value = lyric;
    isSpeaking.value = true;

    startTypewriterSpeech(text, currentMoodKey.value, playBlips);

    // Legacy compatibility flags for mini avatar
    if (emotion.value !== "pout" && emotion.value !== "annoyed") {
      eyesExpression.value = "happy";
      mouthExpression.value = "sing";
      isBouncing.value = true;
    }

    if (expressionTimer) clearTimeout(expressionTimer);
    expressionTimer = setTimeout(() => {
      eyesExpression.value = "normal";
      mouthExpression.value = "normal";
      isBouncing.value = false;
    }, 1500);

    speechTimer = setTimeout(() => {
      isSpeaking.value = false;
    }, duration);
  }

  /**
   * Evaluates currently playing track metadata & optional Web Audio Analyser
   */
  function detectMood(track: QueueTrack | null, analyser: AnalyserNode | null = null): MoodKey {
    if (!track) {
      setMood("hype", false);
      return "hype";
    }

    if (
      track.mood &&
      (track.mood === "hype" || track.mood === "lofi" || track.mood === "romance" || track.mood === "galau")
    ) {
      const chosenMood = track.mood as MoodKey;
      setMood(chosenMood, true, track.title, track.genre);
      return chosenMood;
    }

    const title = (track.title || "").toLowerCase();
    const artist = (track.artist || "").toLowerCase();
    const fullText = `${title} ${artist}`;

    let hypeScore = 0;
    let lofiScore = 0;
    let romanceScore = 0;
    let galauScore = 0;

    const isMcr = artist.includes("my chemical romance") || artist.includes("mcr");
    const isRockEmo = isMcr || ARTISTS_ROCK_EMO.some((a) => artist.includes(a));
    const isChillArtist = ARTISTS_CHILL.some((a) => artist.includes(a));

    if (isRockEmo) {
      const hasSadKeywords = [
        "cancer", "die", "dying", "death", "dead", "funeral", "leaving", "left",
        "cry", "crying", "tears", "goodbye", "hurt", "pain", "sad", "alone",
        "broken", "i don't love you", "disenchanted", "ghost of you", "numb",
        "in the end", "wake me up", "boulevard", "creep", "my immortal", "snuff"
      ].some((kw) => title.includes(kw));

      if (hasSadKeywords) {
        galauScore += 4;
      } else {
        hypeScore += 3;
      }
    }

    if (isChillArtist) {
      lofiScore += 3;
    }

    for (const kw of KEYWORDS_HYPE) {
      if (fullText.includes(kw)) hypeScore += 2;
    }
    for (const kw of KEYWORDS_LOFI) {
      if (fullText.includes(kw)) lofiScore += 2;
    }
    for (const kw of KEYWORDS_GALAU) {
      if (fullText.includes(kw)) galauScore += 2;
    }
    for (const kw of KEYWORDS_ROMANCE) {
      if (title.includes(kw) || (!isRockEmo && artist.includes(kw))) {
        romanceScore += 2;
      }
    }

    if (analyser) {
      try {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const bassEnd = Math.floor(bufferLength * 0.15);
        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) bassSum += dataArray[i];
        const avgBass = bassSum / (bassEnd || 1);

        if (avgBass > 140) {
          hypeScore += 1.5;
        } else if (avgBass < 65) {
          lofiScore += 1;
          galauScore += 1;
        }
      } catch {}
    }

    const maxScore = Math.max(hypeScore, lofiScore, romanceScore, galauScore);
    let chosenMood: MoodKey = "hype";

    if (maxScore > 0) {
      if (maxScore === galauScore) chosenMood = "galau";
      else if (maxScore === romanceScore) chosenMood = "romance";
      else if (maxScore === lofiScore) chosenMood = "lofi";
      else chosenMood = "hype";
    } else {
      if (track.duration > 270) chosenMood = "galau";
      else if (track.duration < 180) chosenMood = "hype";
      else chosenMood = "romance";
    }

    setMood(chosenMood, true, track.title, track.genre);
    return chosenMood;
  }

  function setMood(key: MoodKey, announce = false, trackTitle?: string, trackGenre?: string) {
    const isDifferent = currentMoodKey.value !== key;
    currentMoodKey.value = key;
    const profile = MOOD_PROFILES[key];
    applyMoodCss(profile);

    if (isDifferent && announce) {
      reactionAudio.playMoodJingle(key);
    }

    if (announce) {
      recordActivity(false);
      triggerGesture("peaceStart");
      const g = profile.greetings[Math.floor(Math.random() * profile.greetings.length)];
      let announcement = g.text;
      if (trackTitle) {
        if (trackGenre) {
          announcement = `Now playing "${trackTitle}" [${trackGenre}]! ${g.text}`;
        } else {
          announcement = `Now playing "${trackTitle}"! ${g.text}`;
        }
      }
      showSpeech(announcement, g.lyric, 4600);
    }
  }

  /**
   * Body Hit-Zone Tap Handler with Poke-Spam Detection (≥6 taps in 3s -> 5s pout)
   */
  function onZoneTap(zone: HitZone = "body") {
    const now = Date.now();

    // If waking up from sleep, handle wake reaction first
    if (recordActivity(true)) {
      reactionAudio.playZoneSfx("ahoge");
      return;
    }

    // Check if currently pouting (ngambek)
    if (now < poutUntilMs) {
      poutUntilMs = Math.min(now + 6000, poutUntilMs + 1000);
      const remaining = Math.max(1000, poutUntilMs - now);
      reactionAudio.playZoneSfx("pout");
      triggerGesture("poutSulking", remaining);
      const line = pickDialogue("poutTap");
      showSpeech(line.text, line.lyric, 2800);

      if (poutRecoveryTimer) clearTimeout(poutRecoveryTimer);
      poutRecoveryTimer = setTimeout(() => {
        poutUntilMs = 0;
        activeGesture.value = null;
        emotion.value = "happy";
        const rec = pickDialogue("poutRecover");
        showSpeech(rec.text, rec.lyric, 3600);
      }, remaining);
      return;
    }

    // Track taps in 3000ms sliding window
    pokeTimestamps.push(now);
    while (pokeTimestamps.length > 0 && now - pokeTimestamps[0] > 3000) {
      pokeTimestamps.shift();
    }

    // ≥6 taps in 3 seconds -> Pout (Ngambek) for 5 seconds!
    if (pokeTimestamps.length >= 6) {
      pokeTimestamps.length = 0;
      poutUntilMs = now + 5000;
      reactionAudio.playZoneSfx("pout");
      triggerGesture("poutSulking", 5000);
      const line = pickDialogue("poutStart");
      showSpeech(line.text, line.lyric, 4800);

      if (poutRecoveryTimer) clearTimeout(poutRecoveryTimer);
      poutRecoveryTimer = setTimeout(() => {
        poutUntilMs = 0;
        activeGesture.value = null;
        emotion.value = "happy";
        const rec = pickDialogue("poutRecover");
        showSpeech(rec.text, rec.lyric, 3600);
      }, 5000);
      return;
    }

    // 4-5 rapid taps -> Annoyed warning
    if (pokeTimestamps.length === 4 || pokeTimestamps.length === 5) {
      reactionAudio.playZoneSfx("cheek");
      triggerGesture("annoyedWarn", 2000);
      const line = pickDialogue("annoyedWarn");
      showSpeech(line.text, line.lyric, 3000);
      return;
    }

    // Normal zone-specific reactions
    switch (zone) {
      case "head": {
        reactionAudio.playZoneSfx("head");
        triggerGesture("patHead");
        const line = pickDialogue("patHead");
        showSpeech(line.text, line.lyric, 3600);
        break;
      }
      case "cheek": {
        reactionAudio.playZoneSfx("cheek");
        triggerGesture("pinchCheek");
        const line = pickDialogue("pinchCheek");
        showSpeech(line.text, line.lyric, 3600);
        break;
      }
      case "headphone": {
        reactionAudio.playZoneSfx("headphone");
        triggerGesture("adjustHeadphone");
        const line = pickDialogue("adjustHeadphone");
        showSpeech(line.text, line.lyric, 3600);
        break;
      }
      case "ahoge": {
        reactionAudio.playZoneSfx("ahoge");
        triggerGesture("flickAhoge");
        const line = pickDialogue("flickAhoge");
        showSpeech(line.text, line.lyric, 3600);
        break;
      }
      case "body":
      default: {
        reactionAudio.playJukeChanChime();
        triggerGesture("peaceStart", 2000);
        const profile = currentMood.value;
        const t = profile.directTaps[Math.floor(Math.random() * profile.directTaps.length)];
        showSpeech(t.text, t.lyric, 3600);
        break;
      }
    }
  }

  /**
   * Backward-compatible direct tap handler (e.g. from mini avatar)
   */
  function onDirectTap() {
    onZoneTap("body");
  }

  /**
   * Called when user taps speech bubble: finishes typewriter first, or triggers tap if already done
   */
  function onSpeechBubbleTap() {
    if (!finishTypewriterSpeech()) {
      onZoneTap("head");
    }
  }

  /**
   * Called when room combo surges or emoji reaction is triggered from ReactionDock
   */
  function onComboSurge(combo: number, emoji?: string) {
    recordActivity(false);
    const profile = currentMood.value;

    // Trigger emoji-specific gesture or high-combo applause
    if (combo >= 10 && combo % 5 === 0) {
      triggerGesture("clapCombo");
    } else if (emoji) {
      const gKey = mapEmojiToGesture(emoji);
      triggerGesture(gKey);
    } else {
      emitSpringImpulse(10, -35, 30);
    }

    eyesExpression.value = "happy";
    mouthExpression.value = "sing";
    isBouncing.value = true;

    if (expressionTimer) clearTimeout(expressionTimer);
    expressionTimer = setTimeout(() => {
      eyesExpression.value = "normal";
      mouthExpression.value = "normal";
      isBouncing.value = false;
    }, 1200);

    // High combo speech milestone (at >=5 and multiples of 5)
    if (combo >= 5 && (combo % 5 === 0 || combo === 5)) {
      const s = profile.comboSurges[Math.floor(Math.random() * profile.comboSurges.length)];
      showSpeech(
        `${emoji ? emoji + " " : ""}COMBO x${combo}! ${s.text}`,
        s.lyric,
        3800
      );
    } else if (combo === 1 && emoji && !isSpeaking.value) {
      // Single emoji reaction speech when Juke-chan is quiet
      const gKey = mapEmojiToGesture(emoji);
      const line = pickDialogue(gKey as any);
      if (line) showSpeech(line.text, line.lyric, 3200);
    }
  }

  /**
   * Called when a new room member joins
   */
  function onMemberJoined(nickname?: string) {
    recordActivity(false);
    triggerGesture("waveWelcome");
    const cleanName = nickname?.trim() || "Teman Baru";
    const line = pickDialogue("memberJoin", { name: cleanName });
    showSpeech(line.text, line.lyric, 4000);
  }

  /**
   * Called when track is skipped by host/DJ
   */
  function onTrackSkipped() {
    recordActivity(false);
    triggerGesture("skipShock");
    const line = pickDialogue("skipTrack");
    showSpeech(line.text, line.lyric, 3600);
  }

  /**
   * Periodic idle & awareness loop (checks sleep state at 90s / 150s when no song is playing)
   */
  function startIdleLoop() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      const now = Date.now();
      const idleSec = (now - lastActivityMs) / 1000;

      // Never sleep while music is playing
      if (sharedPlaybackActive.value) {
        lastActivityMs = now;
        if (awareness.value !== "awake") {
          awareness.value = "awake";
          emotion.value = "neutral";
        }
      } else {
        if (idleSec >= 150 && awareness.value !== "asleep") {
          awareness.value = "asleep";
          emotion.value = "asleep";
          triggerFx("zzz");
          const line = pickDialogue("asleep");
          showSpeech(line.text, line.lyric, 4500, false);
          return;
        } else if (idleSec >= 90 && idleSec < 150 && awareness.value === "awake") {
          awareness.value = "drowsy";
          emotion.value = "sleepy";
          const line = pickDialogue("drowsy");
          showSpeech(line.text, line.lyric, 4200);
          return;
        }
      }

      // Periodic idle singing thoughts when awake
      if (
        awareness.value === "awake" &&
        !isSpeaking.value &&
        now > poutUntilMs &&
        Math.random() > 0.55
      ) {
        const profile = currentMood.value;
        const item = profile.idleLyrics[Math.floor(Math.random() * profile.idleLyrics.length)];
        showSpeech(item.text, item.lyric, 3400);
      }
    }, 15000);
  }

  function stopIdleLoop() {
    if (idleTimer) clearInterval(idleTimer);
  }

  function onTabSwitch(tab: "queue" | "catalog" | "lyrics") {
    recordActivity(false);
    reactionAudio.playJukeChanChime();
    if (tab === "catalog") {
      triggerGesture("peaceStart", 2000);
      showSpeech(
        "Buka database musik! Mau cari lagu anime, rock, atau city pop favoritmu? 🔍✨",
        "\"Endless songs waiting to be discovered!\"",
        3600
      );
    } else if (tab === "queue") {
      triggerGesture("thumbsUpVote", 2000);
      showSpeech(
        "Ini dia playlist antrean kita! Vote lagu kesukaanmu biar naik ke atas ya 🚀🎧",
        "\"Our shared room soundtrack!\"",
        3600
      );
    } else if (tab === "lyrics") {
      triggerGesture("karaokeMic", 2600);
      showSpeech(
        "Waktunya karaoke bareng! Yuk nyanyi yang lantang bareng Juke-chan 🎤🎶",
        "\"Sing out loud from your heart!\"",
        3600
      );
    }
  }

  function onTrackRequested(title: string) {
    recordActivity(false);
    reactionAudio.playJukeChanChime();
    triggerGesture("peaceStart");
    const cleanTitle = title.length > 28 ? title.slice(0, 25) + "..." : title;
    showSpeech(
      `Asyik! "${cleanTitle}" masuk antrean! Nanti kita dengerin bareng ya! ✨🎵`,
      "\"New track queued into our jukebox!\"",
      4000
    );
  }

  function onTrackUpvoted(title?: string) {
    recordActivity(false);
    reactionAudio.playJukeChanChime();
    triggerGesture("thumbsUpVote");
    const target = title ? `"${title.length > 24 ? title.slice(0, 21) + "..." : title}"` : "Lagu ini";
    showSpeech(
      `Vote masuk! ${target} makin naik peringkatnya di antrean! 🚀⚡`,
      "\"Upvoted by the room!\"",
      3500
    );
  }

  function onKaraokeToggled(enabled: boolean) {
    recordActivity(false);
    isKaraokeActive.value = enabled;
    reactionAudio.playJukeChanChime();
    if (enabled) {
      triggerGesture("karaokeMic");
      showSpeech(
        "Mode Karaoke AKTIF! Vokal diturunkan, panggung milikmu sekarang! 🎤🌟",
        "\"You are the main vocalist today!\"",
        4000
      );
    } else {
      showSpeech(
        "Mode Karaoke off, vokal asli kembali diputar di jukebox 🎧",
        "\"Original studio vocals restored\"",
        3000
      );
    }
  }

  return {
    currentMoodKey,
    currentMood,
    dialogueText,
    dialogueLyric,
    isSpeaking,
    eyesExpression,
    mouthExpression,
    isBouncing,
    emotion,
    awareness,
    activeGesture,
    activeFx,
    fxTriggerId,
    isKaraokeActive,
    detectMood,
    setMood,
    showSpeech,
    onZoneTap,
    onDirectTap,
    onSpeechBubbleTap,
    onComboSurge,
    onMemberJoined,
    onTrackSkipped,
    onTabSwitch,
    onTrackRequested,
    onTrackUpvoted,
    onKaraokeToggled,
    startIdleLoop,
    stopIdleLoop,
  };
}

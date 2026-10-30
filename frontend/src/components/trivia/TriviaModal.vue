<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { getStreamUrl } from "../../shared/api.ts";
import type { TriviaOption, TriviaPlayer } from "../../shared/types.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
import UiIcon from "../UiIcon.vue";
import JukeChanMini from "../mascot/JukeChanMini.vue";
import { useFocusTrap } from "../../shared/useFocusTrap.ts";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, () => props.isOpen);

const triviaState = computed(() => jukeboxClient.triviaState.value);
const myClientId = computed(() => jukeboxClient.clientId.value);
const isHost = computed(() => {
  return jukeboxClient.isAdmin.value || triviaState.value?.hostClientId === myClientId.value;
});

// Status apakah Host ikut bermain sebagai peserta
const isHostPlaying = computed(() => Boolean(triviaState.value?.isHostPlaying));

// Status apakah pengguna saat ini berpartisipasi sebagai pemain yang menjawab soal
const isPlayerParticipating = computed(() => {
  if (isHost.value) {
    return isHostPlaying.value;
  }
  return true;
});

const myPlayer = computed<TriviaPlayer | undefined>(() => {
  if (!triviaState.value || !myClientId.value) return undefined;
  return triviaState.value.players[myClientId.value];
});

const isReady = computed(() => Boolean(myPlayer.value?.isReady));
const hasAnswered = computed(() => Boolean(myPlayer.value?.hasAnswered));
const selectedOptionId = computed(() => myPlayer.value?.selectedOptionId);

const playersList = computed(() => {
  if (!triviaState.value) return [];
  return Object.values(triviaState.value.players);
});

// Hitung berapa pemain yang telah menjawab pada ronde ini
const answeredCount = computed(() => {
  return playersList.value.filter((p) => p.hasAnswered).length;
});

const currentRound = computed(() => triviaState.value?.currentRound);
const roundResult = computed(() => triviaState.value?.roundResult);
const podium = computed(() => triviaState.value?.podium || []);

const audioIssueReports = computed(() => {
  return triviaState.value?.audioIssueReports || [];
});

const hasReportedAudioIssue = computed(() => {
  if (!myClientId.value) return false;
  return audioIssueReports.value.some((r) => r.playerId === myClientId.value);
});

// Category label helper
const categoryLabel = computed(() => {
  const cat = triviaState.value?.settings.categoryId;
  switch (cat) {
    case "room-vibe": return "Antrean & Vibe Ruangan";
    case "pop-indo": return "Pop Indo 2000-an";
    case "indie-indo": return "Hits Indo Terkini";
    case "rock-indo": return "Rock Indonesia";
    case "western-hits": return "Western Hits";
    case "anime-jp": return "Anime OST & J-Pop";
    case "kpop": return "K-Pop Hits";
    case "office-history": return "Riwayat Kantor";
    default: return "Lagu Hits";
  }
});

// Timer countdown animation state
const remainingSeconds = ref(20);
const timerProgressPercent = ref(100);
const isListeningPhase = ref(false);
const listeningSecondsLeft = ref(3);
let timerInterval: ReturnType<typeof setInterval> | null = null;
let lastTickSecond: number | null = null;

// Audio & Autoplay state
const isAutoplayBlocked = ref(false);
const isAudioBuffering = ref(false);
const isHeadsetEnabled = ref(false);
const headsetVolume = ref(85);
let localAudio: HTMLAudioElement | null = null;
let prebufferAudio: HTMLAudioElement | null = null;
let currentLoadedRoundIndex: number | null = null;
let unsubTimerStart: (() => void) | null = null;

// Konfirmasi Sumber Suara: 'host' (Speaker Host) vs 'self' (Speaker Sendiri)
const speakerChoice = ref<"host" | "self" | null>(null);
const showSpeakerPrompt = ref(false);

// Notifikasi interaktif saat pengguna tap tombol pilihan sebelum audio ready
const showWaitingAudioNotice = ref(false);
let waitingNoticeTimer: ReturnType<typeof setTimeout> | null = null;

// Silent WAV mikro (44 byte) untuk membuka kunci AudioContext di Mobile Safari & Chrome Android secara aman
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

// Auto-countdown untuk penutupan podium
const podiumCountdown = ref(15);
let podiumInterval: ReturnType<typeof setInterval> | null = null;

// Navigator Juke-chan Reactive Dialogue Text
const navigatorSpeech = computed(() => {
  if (!triviaState.value) return "Sistem siap! Mari mulai kuis tebak lagu!";

  const status = triviaState.value.status;
  if (status === "lobby") {
    if (isReady.value) {
      return "Statusmu SIAP! Menunggu Phantom Thieves lain mengunci posisi...";
    }
    return "Target infiltrasi terdeteksi! Kawan-kawan pencuri, tekan READY sekarang!";
  }

  if (status === "question") {
    if (isListeningPhase.value) {
      return `Ssst... Stealth Mode aktif! Pasang telingamu baik-baik (${listeningSecondsLeft.value}s)!`;
    }
    if (hasAnswered.value) {
      return "Jawabanmu terkunci rapat! Berdoa semoga seranganmu tepat sasaran!";
    }
    return "TARGET TERBUKA! Tebak judul lagunya secepat mungkin untuk CRITICAL HIT!";
  }

  if (status === "recap") {
    if (isPlayerParticipating.value && myPlayer.value) {
      if (myPlayer.value.lastAnswerCorrect) {
        return `SHOWSTOPPER!! Tebakanmu tepat sekali! Bonus kecepatan +${myPlayer.value.lastAnswerPoints} Poin! 🔥`;
      }
      return "Aduh tebakannya meleset! Tetap tenang, kita balas di ronde berikutnya! ⚔️";
    }
    return `Ronde ${currentRound.value?.roundIndex} selesai! Klasemen para penyusup telah diperbarui! 🎤`;
  }

  if (status === "podium") {
    return "MISSION ACCOMPLISHED!! All-Out Attack sukses besar! Beri hormat pada sang juara!";
  }

  return "Sistem siaga!";
});

// Inisialisasi audio element lokal
function initLocalAudio() {
  if (!localAudio) {
    localAudio = new Audio();
    localAudio.preload = "auto";
  }
  localAudio.volume = isHost.value ? 1.0 : Math.max(0, Math.min(1, headsetVolume.value / 100));
}

// Buka kunci autoplay peramban dengan gestur interaksi pengguna awal
function primeAudio() {
  initLocalAudio();
  if (localAudio && localAudio.paused && (!localAudio.src || localAudio.src.startsWith("data:"))) {
    localAudio.src = SILENT_WAV;
    localAudio.play().catch((e) => {
      console.warn("[trivia-audio] primeAudio note:", e);
    });
  }
}

let hasAttemptedRetry = false;

function stopLocalAudio() {
  if (localAudio) {
    localAudio.pause();
    localAudio.currentTime = 0;
  }
  if (prebufferAudio) {
    prebufferAudio.pause();
    prebufferAudio.src = "";
  }
  isAutoplayBlocked.value = false;
  isAudioBuffering.value = false;
  currentLoadedRoundIndex = null;
}

function prebufferNextSnippet(trackId: string, provider: "yt" | "sc", startSec: number) {
  if (!isHost.value && !isHeadsetEnabled.value) return;
  console.log(`[trivia-audio] Pre-buffering cuplikan lagu berikutnya (${trackId}) di latar belakang...`);
  try {
    if (!prebufferAudio) {
      prebufferAudio = new Audio();
      prebufferAudio.preload = "auto";
    }
    const streamUrl = getStreamUrl(trackId, provider);
    prebufferAudio.src = streamUrl;
    prebufferAudio.load();
  } catch (err) {
    console.warn("[trivia-audio] Error pre-buffering next snippet:", err);
  }
}

function playSnippetAudio(trackId: string, provider: "yt" | "sc", startSec: number, roundIdx: number) {
  if (!isHost.value && !isHeadsetEnabled.value) {
    stopLocalAudio();
    return;
  }

  initLocalAudio();
  if (!localAudio) return;

  currentLoadedRoundIndex = roundIdx;
  isAudioBuffering.value = true;
  isAutoplayBlocked.value = false;
  hasAttemptedRetry = false;

  const streamUrl = getStreamUrl(trackId, provider);
  localAudio.src = streamUrl;

  let hasSignaledReady = false;

  const onCanPlay = () => {
    if (!localAudio || currentLoadedRoundIndex !== roundIdx) return;

    try {
      if (startSec > 0 && Math.abs(localAudio.currentTime - startSec) > 0.5) {
        localAudio.currentTime = startSec;
      }
    } catch (e) {
      console.warn("[trivia-audio] Seek position error:", e);
    }

    if (!hasSignaledReady) {
      hasSignaledReady = true;
      isAudioBuffering.value = false;
      console.log(`[trivia-audio] Audio ronde ${roundIdx} ter-buffer di detik ${startSec}s. Mengirim sinyal audioReady.`);
      jukeboxClient.signalTriviaAudioReady(roundIdx);
    }

    if (currentRound.value?.isAudioReady && localAudio.paused) {
      startAudiblePlayback(roundIdx);
    }
  };

  localAudio.addEventListener("canplay", onCanPlay, { once: true });
  localAudio.addEventListener("loadedmetadata", () => {
    try {
      if (startSec > 0 && localAudio) {
        localAudio.currentTime = startSec;
      }
    } catch {}
  }, { once: true });

  localAudio.addEventListener(
    "error",
    (e) => {
      console.warn("[trivia-audio] Error loading audio stream:", e, localAudio?.error);
      if (!hasAttemptedRetry && localAudio && currentLoadedRoundIndex === roundIdx) {
        hasAttemptedRetry = true;
        console.log(`[trivia-audio] Mencoba reload stream ronde ${roundIdx}...`);
        setTimeout(() => {
          if (currentLoadedRoundIndex === roundIdx && localAudio) {
            localAudio.load();
          }
        }, 500);
      } else {
        isAudioBuffering.value = false;
      }
    },
    { once: true }
  );

  if (localAudio.readyState >= 2) {
    onCanPlay();
  } else {
    localAudio.load();
  }
}

function startAudiblePlayback(roundIdx: number) {
  if (!localAudio || currentLoadedRoundIndex !== roundIdx) return;

  const playPromise = localAudio.play();
  if (playPromise) {
    playPromise
      .then(() => {
        isAudioBuffering.value = false;
        isAutoplayBlocked.value = false;
        console.log(`[trivia-audio] Pemutaran serempak ronde ${roundIdx} BERJALAN di detik ${localAudio?.currentTime}s!`);
      })
      .catch((err) => {
        console.warn("[trivia-audio] Autoplay prevented, menunggu ketukan layar pengguna:", err);
        isAudioBuffering.value = false;
        isAutoplayBlocked.value = true;
      });
  }
}

function unblockAudio() {
  personaAudio.playCursor();
  if (localAudio && currentRound.value) {
    try {
      if (currentRound.value.snippetStartSec > 0 && Math.abs(localAudio.currentTime - currentRound.value.snippetStartSec) > 0.5) {
        localAudio.currentTime = currentRound.value.snippetStartSec;
      }
    } catch {}

    startAudiblePlayback(currentRound.value.roundIndex);
  }
}

// Watch status perubahan game untuk sinkronisasi audio, sfx P5, dan timer
watch(
  () => triviaState.value?.status,
  (newStatus) => {
    if (newStatus && newStatus !== "idle" && !isHost.value && !myPlayer.value) {
      jukeboxClient.joinTriviaLobby();
    }

    if (newStatus === "question" && currentRound.value) {
      stopRoundTimer();
      const q = currentRound.value;
      remainingSeconds.value = q.durationSec || 20;
      timerProgressPercent.value = 100;
      lastTickSecond = null;

      playSnippetAudio(
        q.trackId,
        q.provider,
        q.snippetStartSec,
        q.roundIndex
      );

      if (q.isAudioReady) {
        startRoundTimer(
          q.startTime,
          q.endTime,
          q.durationSec,
          q.listenStartTime,
          q.listenDurationSec
        );
      }
    } else if (newStatus === "recap") {
      stopRoundTimer();
      stopLocalAudio();

      // Trigger P5 Result Sound Effect
      if (isPlayerParticipating.value && myPlayer.value) {
        if (myPlayer.value.lastAnswerCorrect) {
          personaAudio.playCriticalHit();
        } else {
          personaAudio.playMiss();
        }
      } else {
        personaAudio.playCursor();
      }
    } else if (newStatus === "podium") {
      stopRoundTimer();
      stopLocalAudio();
      personaAudio.playAllOutAttack();
      startPodiumCountdown();
    } else if (newStatus === "idle") {
      stopRoundTimer();
      stopLocalAudio();
      stopPodiumCountdown();
      emit("close");
    }

    if (newStatus !== "podium") {
      stopPodiumCountdown();
    }
  }
);

// Auto-join & Reconnect guard
watch(
  () => [props.isOpen, triviaState.value?.status, triviaState.value?.players] as const,
  ([open, status, players]) => {
    if (open && status && status !== "idle" && !isHost.value && myClientId.value) {
      if (!players || !players[myClientId.value]) {
        jukeboxClient.joinTriviaLobby();
      }
    }
  },
  { immediate: true }
);

// Watch jika server mengonfirmasi audioReady
watch(
  () => currentRound.value?.isAudioReady,
  (ready) => {
    if (ready && triviaState.value?.status === "question") {
      const q = currentRound.value;
      if (q) {
        startRoundTimer(
          q.startTime,
          q.endTime,
          q.durationSec,
          q.listenStartTime,
          q.listenDurationSec
        );
        if (localAudio && localAudio.paused) {
          startAudiblePlayback(q.roundIndex);
        }
      }
    }
  }
);

// Pre-buffer cuplikan berikutnya saat recap
watch(
  () => triviaState.value?.roundResult,
  (res) => {
    if (res?.nextSnippet) {
      prebufferNextSnippet(res.nextSnippet.trackId, res.nextSnippet.provider, res.nextSnippet.snippetStartSec);
    }
  }
);

// Watch player audio issue reports so Host hears an alert sound
watch(
  () => triviaState.value?.audioIssueReports?.length || 0,
  (newCount, oldCount) => {
    if (isHost.value && newCount > (oldCount || 0)) {
      personaAudio.playMiss();
    }
  }
);

function handleReportTriviaAudioIssue() {
  if (isHost.value || hasReportedAudioIssue.value) return;
  jukeboxClient.reportTriviaAudioIssue();
  personaAudio.playCursor();
}

function handleSkipTriviaQuestionByHost() {
  if (!isHost.value) return;
  stopLocalAudio();
  jukeboxClient.skipTriviaQuestion();
  personaAudio.playSelect();
}

function startRoundTimer(
  startTime?: number,
  endTime?: number,
  durationSec?: number,
  listenStartTime?: number,
  listenDurationSec?: number
) {
  stopRoundTimer();
  const q = currentRound.value;
  if (!q) return;

  const totalDuration = durationSec || q.durationSec || 20;
  const start = startTime || q.startTime || Date.now();
  const end = endTime || q.endTime || (start + totalDuration * 1000);

  const now = Date.now();
  if (start > now) {
    isListeningPhase.value = true;
    const diffMs = start - now;
    listeningSecondsLeft.value = Math.max(1, Math.ceil(diffMs / 1000));
    remainingSeconds.value = totalDuration;
    timerProgressPercent.value = 100;
  } else {
    isListeningPhase.value = false;
    const initialLeftMs = Math.max(0, end - now);
    remainingSeconds.value = Math.ceil(initialLeftMs / 1000);
    timerProgressPercent.value = Math.max(0, Math.min(100, (initialLeftMs / (totalDuration * 1000)) * 100));
  }

  timerInterval = setInterval(() => {
    const currentNow = Date.now();
    if (start > currentNow) {
      isListeningPhase.value = true;
      const leftListenMs = start - currentNow;
      listeningSecondsLeft.value = Math.max(1, Math.ceil(leftListenMs / 1000));
      remainingSeconds.value = totalDuration;
      timerProgressPercent.value = 100;
    } else {
      if (isListeningPhase.value) {
        isListeningPhase.value = false;
        personaAudio.playSelect();
      }
      const leftMs = Math.max(0, end - currentNow);
      const secs = Math.ceil(leftMs / 1000);
      remainingSeconds.value = secs;
      timerProgressPercent.value = Math.max(0, Math.min(100, (leftMs / (totalDuration * 1000)) * 100));

      // Ticking sound when <= 5 seconds remain
      if (secs <= 5 && secs > 0 && secs !== lastTickSecond) {
        lastTickSecond = secs;
        personaAudio.playTick();
      }

      if (leftMs <= 0) {
        stopRoundTimer();
      }
    }
  }, 100);
}

function stopRoundTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isListeningPhase.value = false;
  lastTickSecond = null;
}

function startPodiumCountdown() {
  stopPodiumCountdown();
  podiumCountdown.value = 15;
  podiumInterval = setInterval(() => {
    podiumCountdown.value--;
    if (podiumCountdown.value <= 0) {
      stopPodiumCountdown();
      emit("close");
    }
  }, 1000);
}

function stopPodiumCountdown() {
  if (podiumInterval) {
    clearInterval(podiumInterval);
    podiumInterval = null;
  }
}

// Aksi Pemain & Host
function toggleReady() {
  personaAudio.playReady();
  if (!isHost.value && !myPlayer.value) {
    jukeboxClient.joinTriviaLobby();
  }
  primeAudio();
  jukeboxClient.setTriviaReady(!isReady.value);
}

function toggleHostPlaying() {
  if (!isHost.value) return;
  personaAudio.playCursor();
  jukeboxClient.setTriviaHostPlaying(!isHostPlaying.value);
}

function forceStart() {
  personaAudio.playSelect();
  primeAudio();
  jukeboxClient.forceStartTrivia();
}

function triggerWaitingNotice() {
  personaAudio.playMiss();
  showWaitingAudioNotice.value = true;
  if (waitingNoticeTimer) clearTimeout(waitingNoticeTimer);
  waitingNoticeTimer = setTimeout(() => {
    showWaitingAudioNotice.value = false;
  }, 2200);
}

function selectAnswer(optionId: string) {
  if (!isPlayerParticipating.value) return;
  if (hasAnswered.value || triviaState.value?.status !== "question") return;

  if (!currentRound.value?.isAudioReady || isListeningPhase.value) {
    triggerWaitingNotice();
    return;
  }

  const roundIdx = currentRound.value?.roundIndex;
  if (!roundIdx) return;

  personaAudio.playSelect();
  jukeboxClient.submitTriviaAnswer(roundIdx, optionId);
}

function setSpeakerChoice(choice: "host" | "self") {
  personaAudio.playCursor();
  speakerChoice.value = choice;
  try {
    localStorage.setItem("trivia_speaker_choice", choice);
  } catch {}
  showSpeakerPrompt.value = false;

  jukeboxClient.setTriviaAudioMode(choice);

  if (choice === "self") {
    isHeadsetEnabled.value = true;
    primeAudio();
    if (triviaState.value?.status === "question" && currentRound.value) {
      playSnippetAudio(
        currentRound.value.trackId,
        currentRound.value.provider,
        currentRound.value.snippetStartSec,
        currentRound.value.roundIndex
      );
    }
  } else {
    isHeadsetEnabled.value = false;
    if (!isHost.value) {
      stopLocalAudio();
    }
  }
}

function toggleSpeakerChoice() {
  const nextChoice = isHeadsetEnabled.value ? "host" : "self";
  setSpeakerChoice(nextChoice);
}

function closeOrLeave() {
  personaAudio.playCursor();
  if (isHost.value && triviaState.value?.status !== "idle") {
    jukeboxClient.closeTriviaGame();
  } else {
    jukeboxClient.leaveTriviaLobby();
  }
  stopLocalAudio();
  emit("close");
}

// Shortcut Keyboard (PC / Desktop Friendly)
function handleKeydown(e: KeyboardEvent) {
  if (!props.isOpen || !triviaState.value) return;
  const key = e.key.toUpperCase();

  if (e.key === "Escape") {
    closeOrLeave();
    return;
  }

  if (e.key === " " && triviaState.value.status === "lobby") {
    if (isPlayerParticipating.value) {
      e.preventDefault();
      toggleReady();
    }
    return;
  }

  if (
    isPlayerParticipating.value &&
    triviaState.value.status === "question" &&
    currentRound.value &&
    currentRound.value.isAudioReady &&
    !isListeningPhase.value &&
    !hasAnswered.value
  ) {
    const opts = currentRound.value.options;
    let targetOpt: TriviaOption | undefined = undefined;

    if (key === "1" || key === "A") targetOpt = opts[0];
    else if (key === "2" || key === "B") targetOpt = opts[1];
    else if (key === "3" || key === "C") targetOpt = opts[2];
    else if (key === "4" || key === "D") targetOpt = opts[3];

    if (targetOpt) {
      e.preventDefault();
      selectAnswer(targetOpt.id);
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  const savedVol = localStorage.getItem("trivia_headset_vol");
  if (savedVol) headsetVolume.value = Number(savedVol);

  const savedChoice = localStorage.getItem("trivia_speaker_choice") as "host" | "self" | null;
  if (savedChoice === "self") {
    speakerChoice.value = "self";
    isHeadsetEnabled.value = true;
    showSpeakerPrompt.value = false;
    jukeboxClient.setTriviaAudioMode("self");
  } else if (savedChoice === "host") {
    speakerChoice.value = "host";
    isHeadsetEnabled.value = false;
    showSpeakerPrompt.value = false;
    jukeboxClient.setTriviaAudioMode("host");
  } else if (!isHost.value) {
    showSpeakerPrompt.value = true;
    jukeboxClient.setTriviaAudioMode("host");
  }

  unsubTimerStart = jukeboxClient.onTriviaTimerStart((payload) => {
    if (currentRound.value && currentRound.value.roundIndex === payload.roundIndex) {
      startRoundTimer(
        payload.startTime,
        payload.endTime,
        payload.durationSec,
        payload.listenStartTime,
        payload.listenDurationSec
      );
      if (localAudio && localAudio.paused) {
        startAudiblePlayback(payload.roundIndex);
      }
    }
  });

  if (triviaState.value?.status && triviaState.value.status !== "idle" && !isHost.value && !myPlayer.value) {
    jukeboxClient.joinTriviaLobby();
  }

  if (triviaState.value?.status === "question" && currentRound.value) {
    if (currentRound.value.isAudioReady) {
      startRoundTimer(
        currentRound.value.startTime,
        currentRound.value.endTime,
        currentRound.value.durationSec,
        currentRound.value.listenStartTime,
        currentRound.value.listenDurationSec
      );
    }
    playSnippetAudio(
      currentRound.value.trackId,
      currentRound.value.provider,
      currentRound.value.snippetStartSec,
      currentRound.value.roundIndex
    );
  }
});

watch(
  () => props.isOpen,
  (open) => {
    if (open && !isHost.value) {
      const saved = localStorage.getItem("trivia_speaker_choice");
      if (!saved) {
        showSpeakerPrompt.value = true;
      }
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (unsubTimerStart) unsubTimerStart();
  stopRoundTimer();
  stopPodiumCountdown();
  stopLocalAudio();
});
</script>

<template>
  <div
    v-if="isOpen && triviaState && triviaState.status !== 'idle'"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/90 backdrop-blur-2xl select-none overflow-y-auto animate-in fade-in duration-200"
  >
    <!-- Background Comics Speedlines & Halftone Texture -->
    <div class="fixed inset-0 pointer-events-none opacity-25 p5-halftone-dots"></div>
    <div class="fixed inset-0 pointer-events-none opacity-15 p5-speedlines"></div>
    <div class="fixed inset-0 pointer-events-none bg-radial from-[#e60012]/15 via-transparent to-black/80"></div>

    <!-- Main Persona 5 Battle Stage Container -->
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-label="Operation Phantom Guess Trivia"
      class="relative z-10 w-full max-w-4xl lg:max-w-5xl my-auto flex flex-col bg-[#0b0b14] border-4 border-white shadow-[8px_8px_0px_#000000] sm:shadow-[14px_14px_0px_#000000] text-slate-100"
      style="transform: skewX(-1deg);"
    >
      <!-- Top Red Corner Heist Banner Ribbon (Unclipped) -->
      <div
        class="absolute -top-4 -left-2 sm:-top-5 sm:-left-3 bg-[#e60012] border-2 border-white px-3 sm:px-4 py-1 font-black text-[10px] sm:text-xs text-white uppercase italic tracking-widest shadow-[3px_3px_0px_#000] z-30 pointer-events-none"
        style="transform: skewX(-12deg) rotate(-2deg);"
      >
        ★ OPERATION // PHANTOM GUESS
      </div>

      <!-- Header Navigation & Status Bar -->
      <header
        class="px-3.5 sm:px-6 pt-5 pb-3 border-b-3 border-white flex items-center justify-between gap-2.5 bg-[#0f0e1c] shrink-0 relative z-20"
      >
        <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            class="w-9 h-9 sm:w-11 sm:h-11 bg-[#e60012] border-2 border-white flex items-center justify-center text-lg sm:text-xl shrink-0 shadow-[3px_3px_0px_#000]"
            style="transform: rotate(-3deg);"
          >
            🎵
          </div>

          <div class="flex flex-col min-w-0 leading-tight">
            <div class="flex items-center gap-2">
              <span class="p5-cutout-black text-[9px] sm:text-[11px] font-black uppercase tracking-wider">
                {{ categoryLabel }}
              </span>
              <span v-if="triviaState.status === 'question'" class="text-[#00e5ff] text-[10px] sm:text-xs font-mono font-bold">
                RONDE {{ currentRound?.roundIndex }} / {{ triviaState.settings.roundCount }}
              </span>
            </div>
            <h1 class="text-sm sm:text-xl font-black italic uppercase text-white tracking-wider truncate mt-0.5">
              {{ triviaState.status === 'lobby' ? 'MISSION LOBBY // TARGET ROSTER' : triviaState.status === 'question' ? 'BATTLE STAGE // GUESS TRACK' : triviaState.status === 'recap' ? 'RESULT // CONFIDENTIAL RECAP' : 'ALL-OUT ATTACK // PODIUM' }}
            </h1>
          </div>
        </div>

        <!-- Controls: Audio Feedback / Skip, Sound Toggle, Speaker Choice, Exit Button -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <!-- Host Only: Skip Broken/Missing Audio Question Button -->
          <button
            v-if="isHost && triviaState.status === 'question'"
            type="button"
            class="h-8 sm:h-9 px-2 sm:px-2.5 border-2 font-black text-[10px] sm:text-xs uppercase flex items-center gap-1 cursor-pointer transition-all shadow-[2px_2px_0px_#000] active:scale-95"
            :class="
              audioIssueReports.length > 0
                ? 'bg-[#ffe600] border-white text-black animate-pulse'
                : 'bg-black hover:bg-[#ffe600] text-[#ffe600] hover:text-black border-[#ffe600]'
            "
            style="transform: skewX(-8deg);"
            title="Musik soal ini tidak keluar / rusak? Skip soal ini"
            @click="handleSkipTriviaQuestionByHost"
          >
            <span>⏭️</span>
            <span class="font-mono">Musik Gak Ada / Skip</span>
            <span
              v-if="audioIssueReports.length > 0"
              class="px-1 bg-[#e60012] text-white border border-white text-[9px] font-black"
            >
              {{ audioIssueReports.length }}!
            </span>
          </button>

          <!-- Player Only: Alert Host about Missing Audio -->
          <button
            v-else-if="!isHost && triviaState.status === 'question'"
            type="button"
            :disabled="hasReportedAudioIssue"
            class="h-8 sm:h-9 px-2 sm:px-2.5 border-2 font-black text-[10px] sm:text-xs uppercase flex items-center gap-1 cursor-pointer transition-all shadow-[2px_2px_0px_#000] active:scale-95"
            :class="
              hasReportedAudioIssue
                ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300 cursor-default'
                : 'bg-black hover:bg-[#ffe600] text-[#ffe600] hover:text-black border-[#ffe600]'
            "
            style="transform: skewX(-8deg);"
            :title="hasReportedAudioIssue ? 'Alert sudah dikirim ke Host' : 'Kirim alert ke Host bahwa musik tidak terdengar'"
            @click="handleReportTriviaAudioIssue"
          >
            <span>{{ hasReportedAudioIssue ? '✓' : '🔇' }}</span>
            <span class="font-mono">{{ hasReportedAudioIssue ? 'DILAPORKAN' : 'MUSIK GAK ADA?' }}</span>
          </button>

          <!-- SFX Sound Toggle -->
          <button
            type="button"
            class="h-8 sm:h-9 px-2 sm:px-2.5 bg-black hover:bg-white text-white hover:text-black border-2 border-white font-black text-[10px] sm:text-xs uppercase flex items-center gap-1 cursor-pointer transition-all shadow-[2px_2px_0px_#000] active:scale-95"
            style="transform: skewX(-8deg);"
            :title="personaAudio.isSoundEnabled.value ? 'Matikan Suara SFX Persona 5' : 'Nyalakan Suara SFX Persona 5'"
            @click="personaAudio.toggleSound()"
          >
            <span>{{ personaAudio.isSoundEnabled.value ? '🔊' : '🔇' }}</span>
            <span class="hidden sm:inline font-mono">{{ personaAudio.isSoundEnabled.value ? 'SFX ON' : 'SFX OFF' }}</span>
          </button>

          <!-- Headphone / Speaker Toggle (Untuk Pemain Non-Host) -->
          <button
            v-if="!isHost"
            type="button"
            class="h-8 sm:h-9 px-2 sm:px-2.5 border-2 font-black text-[10px] sm:text-xs uppercase flex items-center gap-1 cursor-pointer transition-all shadow-[2px_2px_0px_#000] active:scale-95"
            :class="
              isHeadsetEnabled
                ? 'bg-[#00e5ff] border-white text-black'
                : 'bg-black border-white text-white hover:bg-white hover:text-black'
            "
            style="transform: skewX(-8deg);"
            :title="isHeadsetEnabled ? 'Suara berputar di HP (Klik untuk ganti ke Speaker Host)' : 'Mendengarkan via Speaker Host (Klik untuk ganti ke HP)'"
            @click="toggleSpeakerChoice"
          >
            <span>{{ isHeadsetEnabled ? '🎧' : '📢' }}</span>
            <span class="hidden sm:inline font-mono">{{ isHeadsetEnabled ? 'HP AUDIO' : 'HOST SPEAKER' }}</span>
          </button>

          <!-- Close / Back Button -->
          <button
            type="button"
            class="h-8 sm:h-9 px-2.5 sm:px-3.5 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95"
            style="transform: skewX(-8deg);"
            :title="isHost ? 'Tutup Game (Esc)' : 'Tinggalkan Lobby (Esc)'"
            :aria-label="isHost ? 'Tutup Game (Esc)' : 'Tinggalkan Lobby (Esc)'"
            @click="closeOrLeave"
          >
            <span class="kbd-badge text-[9px] bg-black text-[#00e5ff] border-white/50">ESC</span>
            <span>{{ isHost ? 'TUTUP' : 'KELUAR' }}</span>
          </button>
        </div>
      </header>

      <!-- Subheader: Navigator Juke-chan Reactive Panel -->
      <div
        class="bg-[#121124] border-b-2 border-white/20 px-3 sm:px-6 py-2 flex items-center gap-2.5 sm:gap-3 shrink-0 relative z-10"
      >
        <div class="relative shrink-0">
          <!-- Mini Mascot Portrait in P5 angular frame -->
          <div
            class="w-8 h-8 sm:w-9 sm:h-9 bg-black border-2 border-[#00e5ff] flex items-center justify-center overflow-hidden shadow-[2px_2px_0px_#000]"
            style="transform: skewX(-8deg);"
          >
            <JukeChanMini size-classes="w-full h-full" />
          </div>
          <!-- Oracle radar pulse dot -->
          <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#e60012] border border-white rounded-full animate-ping"></span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="p5-cutout-red text-[8px] sm:text-[9px] font-black uppercase tracking-widest font-mono">
              ORACLE // NAVIGATOR
            </span>
          </div>
          <p class="text-[11px] sm:text-xs font-bold text-slate-200 truncate mt-0.5">
            {{ navigatorSpeech }}
          </p>
        </div>
      </div>

      <!-- Scrollable Main Stage Body -->
      <main class="flex-1 p-3.5 sm:p-6 max-h-[78vh] overflow-y-auto relative flex flex-col justify-between">

        <!-- ================= STAGE 1: LOBBY SCREEN ================= -->
        <div v-if="triviaState.status === 'lobby'" class="flex flex-col gap-4 w-full my-auto">
          <!-- Mission Overview Card -->
          <div
            class="p-4 sm:p-5 bg-black/80 border-2 border-white shadow-[4px_4px_0px_#000] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"
            style="transform: skewX(-1.5deg);"
          >
            <div class="flex flex-col">
              <span class="text-[10px] font-mono text-[#00e5ff] tracking-widest uppercase font-bold">
                [HEIST_TARGET_PARAMETERS]
              </span>
              <h2 class="text-base sm:text-xl font-black text-white uppercase italic">
                {{ categoryLabel }}
              </h2>
              <p class="text-xs text-slate-300 mt-0.5">
                Target: <strong>{{ triviaState.settings.roundCount }} Lagu</strong> • Durasi Cuplikan: <strong>{{ triviaState.settings.roundDurationSec }}s</strong>
              </p>
            </div>

            <!-- Ready Count Stamp -->
            <div
              class="px-4 py-2 bg-[#e60012] border-2 border-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-[3px_3px_0px_#000]"
              style="transform: skewX(-8deg);"
            >
              ★ {{ playersList.filter(p => p.isReady).length }} / {{ playersList.length }} SIAP
            </div>
          </div>

          <!-- Players Roster Badges Grid -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300">
              <span>PHANTOM THIEVES ROSTER ({{ playersList.length }} PENYUSUP):</span>
              <span class="text-[10px] font-mono text-slate-400">Tekan [Space] untuk toggle siap</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5 max-h-52 overflow-y-auto pr-1">
              <div
                v-for="p in playersList"
                :key="p.clientId"
                class="p-2 sm:p-2.5 border-2 flex items-center justify-between gap-2 shadow-[2px_2px_0px_#000] transition-all"
                :class="
                  p.isReady
                    ? 'bg-[#00e5ff]/20 border-[#00e5ff] text-white'
                    : 'bg-black/60 border-white/30 text-slate-400'
                "
                style="transform: skewX(-6deg);"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-xs">{{ (p.role === 'host' || p.clientId === triviaState?.hostClientId) ? '👑' : '🎭' }}</span>
                  <span class="text-xs font-black truncate" :class="p.clientId === myClientId ? 'text-[#ffe600]' : 'text-white'">
                    {{ p.nickname }}
                  </span>
                </div>
                <span
                  class="text-[9px] font-black uppercase font-mono px-1 py-0.2 border shrink-0"
                  :class="p.isReady ? 'bg-[#00e5ff] text-black border-white' : 'bg-[#e60012] text-white border-white animate-pulse'"
                >
                  {{ p.isReady ? 'READY' : 'WAIT' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Lobby Action Panel -->
          <div class="pt-2 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
            <!-- Ready Toggle Ribbon for Players -->
            <button
              v-if="isPlayerParticipating"
              type="button"
              class="w-full sm:flex-1 py-3 sm:py-3.5 border-3 font-black text-sm sm:text-base uppercase italic tracking-wider transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-[4px_4px_0px_#000] active:scale-95"
              :class="
                isReady
                  ? 'bg-[#00e5ff] border-white text-black'
                  : 'bg-[#e60012] border-white text-white hover:bg-white hover:text-black animate-p5-glow'
              "
              style="transform: skewX(-10deg);"
              @click="toggleReady"
            >
              <span>{{ isReady ? '✅ STATUS: SIAP BERTARUNG (BATALKAN?)' : '⚔️ SIAP MENEBAK (READY) // ENGAGE' }}</span>
            </button>

            <!-- Host MC Badge if not playing -->
            <div
              v-else
              class="w-full sm:flex-1 py-3 px-4 bg-black border-2 border-white flex items-center justify-between text-xs sm:text-sm"
              style="transform: skewX(-6deg);"
            >
              <span class="text-[#ffe600] font-black uppercase">🎤 MODE MC / LAYAR RUANGAN</span>
              <span class="text-slate-400 font-mono text-[11px]">(Siap memulai ronde kapan saja)</span>
            </div>

            <!-- Host Exclusive Start Game Button -->
            <button
              v-if="isHost"
              type="button"
              class="w-full sm:w-auto px-6 py-3 sm:py-3.5 bg-[#ffe600] hover:bg-white text-black border-3 border-white font-black text-xs sm:text-sm uppercase italic tracking-wider cursor-pointer shadow-[4px_4px_0px_#000] active:scale-95 transition-all shrink-0"
              style="transform: skewX(-10deg);"
              @click="forceStart"
            >
              MULAI SEKARANG ⚔️
            </button>
          </div>

          <!-- Host Toggle Mode (Ikut Main vs Layar MC) -->
          <div v-if="isHost" class="flex items-center justify-center pt-1">
            <button
              type="button"
              class="text-[11px] font-mono text-[#00e5ff] hover:underline cursor-pointer"
              @click="toggleHostPlaying"
            >
              {{ isHostPlaying ? '🔄 Ubah ke Mode MC (Hanya tampil di TV, tanpa menjawab)' : '🔄 Ubah ke Mode Ikut Bermain (Host ikut menebak)' }}
            </button>
          </div>
        </div>

        <!-- ================= STAGE 2: BATTLE STAGE (QUESTION) ================= -->
        <div v-else-if="triviaState.status === 'question' && currentRound" class="flex flex-col justify-between gap-3.5 h-full w-full my-auto">
          <!-- Host Alert Banner when Players report missing audio -->
          <div
            v-if="isHost && audioIssueReports.length > 0"
            class="p-2.5 bg-[#ffe600] border-2 border-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[3px_3px_0px_#000]"
            style="transform: skewX(-4deg);"
          >
            <div class="flex items-center gap-2 text-xs font-black text-black">
              <span>🔇</span>
              <span>
                Alert Pemain ({{ audioIssueReports.map((r) => r.nickname).join(", ") }}): Musik tidak terdengar!
              </span>
            </div>
            <button
              type="button"
              class="px-3 py-1 bg-[#e60012] text-white font-black text-xs uppercase border border-white cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95 shrink-0"
              @click="handleSkipTriviaQuestionByHost"
            >
              ⏭️ SKIP SOAL INI
            </button>
          </div>

          <!-- Autoplay Blocked Banner if applicable -->
          <div
            v-if="isAutoplayBlocked"
            class="p-2.5 bg-[#e60012] border-2 border-white flex items-center justify-between gap-2 shadow-[3px_3px_0px_#000] animate-bounce"
            style="transform: skewX(-4deg);"
          >
            <div class="flex items-center gap-2 text-xs font-black text-white">
              <span>🔊</span>
              <span>Audio tertahan browser! Ketuk untuk membunyikan suara cuplikan:</span>
            </div>
            <button
              type="button"
              class="px-3 py-1 bg-white text-black font-black text-xs uppercase border border-black cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95"
              @click="unblockAudio"
            >
              BUNYIKAN 🎵
            </button>
          </div>

          <!-- Top Battle Gauge: Round Indicator & Countdown Timer -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-black uppercase tracking-wider">
              <div class="flex items-center gap-2">
                <span class="p5-cutout-red text-[11px] font-black">
                  ROUND {{ currentRound.roundIndex }} / {{ triviaState.settings.roundCount }}
                </span>
                <span v-if="isListeningPhase" class="text-[#ffe600] font-mono animate-pulse">
                  🔒 STEALTH INFILTRATION ({{ listeningSecondsLeft }}s)
                </span>
                <span v-else class="text-[#00e5ff] font-mono">
                  ⚡ GUESS THE TRACK NOW!
                </span>
              </div>

              <!-- High Contrast Digital Countdown -->
              <div class="flex items-baseline gap-1 font-mono font-black">
                <span class="text-xs text-slate-400">TIME:</span>
                <span
                  class="text-lg sm:text-2xl"
                  :class="remainingSeconds <= 5 ? 'text-[#e60012] animate-ping' : 'text-white'"
                >
                  00:{{ remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds }}
                </span>
              </div>
            </div>

            <!-- Persona 5 Slanted Energy Timer Gauge -->
            <div
              class="w-full h-4 sm:h-5 bg-black border-2 border-white p-0.5 overflow-hidden shadow-[3px_3px_0px_#000]"
              style="transform: skewX(-14deg);"
            >
              <div
                class="h-full transition-all duration-100 p5-hazard-stripes"
                :style="{
                  width: `${timerProgressPercent}%`,
                  backgroundColor: remainingSeconds <= 5 ? '#e60012' : '#00e5ff'
                }"
              ></div>
            </div>
          </div>

          <!-- Middle Phase Presentation: Stealth Mode vs Guess Open -->
          <div class="relative py-2 sm:py-3 text-center">
            <!-- Stealth Mode Shutter (3s Listening Phase) -->
            <div
              v-if="isListeningPhase"
              class="p-4 sm:p-5 bg-black/90 border-3 border-white shadow-[6px_6px_0px_#000] flex flex-col items-center justify-center gap-2"
              style="transform: skewX(-3deg);"
            >
              <div class="text-3xl animate-bounce">🎧</div>
              <h3 class="text-base sm:text-lg font-black uppercase italic tracking-wider text-[#ffe600]">
                STEALTH INFILTRATION // DENGARKAN BAIK-BAIK
              </h3>
              <p class="text-xs text-slate-300 max-w-lg mx-auto">
                Cuplikan instrumen lagu sedang berputar! Pilihan tebakan akan terbuka serempak dalam <strong>{{ listeningSecondsLeft }} detik</strong>!
              </p>
            </div>

            <!-- Guess Phase Prompt -->
            <div
              v-else
              class="p-2 sm:p-3 bg-[#e60012] border-2 border-white shadow-[4px_4px_0px_#000] inline-block mx-auto"
              style="transform: skewX(-8deg);"
            >
              <span class="text-xs sm:text-sm font-black uppercase italic tracking-wider text-white">
                ★ ALL-OUT GUESS // PILIH JAWABAN YANG TEPAT! ★
              </span>
            </div>
          </div>

          <!-- Waiting notice pill -->
          <div
            v-if="showWaitingAudioNotice"
            class="py-1 px-4 bg-[#ffe600] border-2 border-black text-black font-black text-xs uppercase shadow-[3px_3px_0px_#000] mx-auto animate-bounce"
            style="transform: skewX(-8deg);"
          >
            ⚠️ {{ isListeningPhase ? 'Dengarkan dulu lagunya baik-baik!' : 'Tunggu sebentar, audio sedang disiapkan...' }}
          </div>

          <!-- 4 Multiple Choice Battle Ribbons -->
          <!-- A. Peserta yang ikut menebak -->
          <div
            v-if="isPlayerParticipating"
            class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pb-2 max-h-[48vh] sm:max-h-none overflow-y-auto pr-1"
          >
            <button
              v-for="(opt, idx) in currentRound.options"
              :key="opt.id"
              type="button"
              :disabled="hasAnswered || isListeningPhase"
              class="group relative min-h-[58px] sm:min-h-[66px] border-2 text-left transition-all duration-150 flex items-center justify-between gap-3 select-none cursor-pointer overflow-hidden p-3 sm:p-3.5 shadow-[4px_4px_0px_#000000] active:scale-[0.98]"
              :class="[
                selectedOptionId === opt.id
                  ? 'bg-[#00e5ff] border-white text-black font-black translate-x-1.5'
                  : hasAnswered
                    ? 'opacity-40 bg-black/60 border-white/20 text-slate-400 cursor-not-allowed'
                    : isListeningPhase
                      ? 'opacity-65 bg-black/70 border-white/30 text-slate-300 cursor-not-allowed'
                      : 'bg-black/90 hover:bg-[#1f1d36] border-white text-white hover:translate-x-1'
              ]"
              style="transform: skewX(-12deg) rotate(-1.5deg);"
              @click="selectAnswer(opt.id)"
            >
              <!-- Left Accent Notch -->
              <div
                class="absolute left-0 top-0 bottom-0 w-2.5 transition-colors"
                :class="selectedOptionId === opt.id ? 'bg-black' : 'bg-[#e60012] group-hover:bg-[#00e5ff]'"
              ></div>

              <!-- Content (Counter-skewed for perfect readability) -->
              <div
                class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 pl-2.5"
                style="transform: skewX(12deg) rotate(1.5deg);"
              >
                <!-- Stenciled A, B, C, D Badge -->
                <div
                  class="w-7 h-7 sm:w-8 sm:h-8 border-2 flex items-center justify-center font-mono font-black text-xs sm:text-sm shrink-0 shadow-[2px_2px_0px_#000]"
                  :class="selectedOptionId === opt.id ? 'bg-black text-[#00e5ff] border-white' : 'bg-[#e60012] text-white border-white'"
                >
                  {{ ['A', 'B', 'C', 'D'][idx] }}
                </div>

                <!-- Option Text -->
                <div v-if="isListeningPhase" class="flex flex-col min-w-0 flex-1 gap-1.5 animate-pulse">
                  <div class="h-3.5 bg-white/30 rounded w-3/4"></div>
                  <div class="h-2.5 bg-white/20 rounded w-1/2"></div>
                </div>
                <div v-else class="flex flex-col min-w-0 leading-tight">
                  <span
                    class="font-black text-xs sm:text-sm truncate uppercase tracking-wide"
                    :class="selectedOptionId === opt.id ? 'text-black' : 'text-white'"
                  >
                    {{ opt.title }}
                  </span>
                  <span
                    class="text-[10px] sm:text-[11px] truncate mt-0.5 font-semibold"
                    :class="selectedOptionId === opt.id ? 'text-black/80 font-bold' : 'text-[#00e5ff]'"
                  >
                    {{ opt.artist }}
                  </span>
                </div>
              </div>

              <!-- Right Lock / Status Badge -->
              <div
                class="shrink-0 pr-1"
                style="transform: skewX(12deg) rotate(1.5deg);"
              >
                <span v-if="selectedOptionId === opt.id" class="p5-cutout-black text-[9px] font-black uppercase font-mono">
                  ★ LOCKED!
                </span>
                <span v-else-if="isListeningPhase" class="text-xs text-[#ffe600]">🔒</span>
                <span v-else class="text-[10px] font-mono text-slate-400 hidden sm:inline">[{{ idx + 1 }}]</span>
              </div>
            </button>
          </div>

          <!-- B. Host MC Presentation View (Layar TV/Proyektor Besar) -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-2">
            <div
              v-for="(opt, idx) in currentRound.options"
              :key="opt.id"
              class="min-h-[64px] sm:min-h-[72px] p-3 sm:p-4 bg-black/90 border-2 border-white flex items-center justify-between gap-3 shadow-[5px_5px_0px_#000]"
              style="transform: skewX(-10deg);"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1" style="transform: skewX(10deg);">
                <div class="w-8 h-8 sm:w-9 sm:h-9 bg-[#e60012] border-2 border-white flex items-center justify-center font-mono font-black text-sm text-white shrink-0">
                  {{ ['A', 'B', 'C', 'D'][idx] }}
                </div>
                <div v-if="isListeningPhase" class="flex flex-col min-w-0 flex-1 gap-1.5 animate-pulse">
                  <div class="h-4 bg-white/20 rounded w-3/4"></div>
                  <div class="h-3 bg-white/10 rounded w-1/2"></div>
                </div>
                <div v-else class="flex flex-col min-w-0">
                  <span class="font-black text-sm sm:text-base text-white uppercase truncate">
                    {{ opt.title }}
                  </span>
                  <span class="text-xs text-[#00e5ff] font-semibold truncate">
                    {{ opt.artist }}
                  </span>
                </div>
              </div>

              <span class="text-xs font-mono font-black text-slate-400 uppercase" style="transform: skewX(10deg);">
                PIL {{ ['A', 'B', 'C', 'D'][idx] }}
              </span>
            </div>
          </div>

          <!-- Footer Status Bar -->
          <div class="flex items-center justify-between text-xs pt-1 border-t border-white/20">
            <span v-if="isPlayerParticipating && hasAnswered" class="p5-cutout-red text-[10px] font-black uppercase">
              🔒 JAWABANMU TERKUNCI! MENUNGGU PEMAIN LAIN...
            </span>
            <span v-else-if="!isPlayerParticipating" class="p5-cutout-black text-[10px] font-black uppercase text-[#ffe600]">
              🎤 LAYAR MC: {{ answeredCount }} / {{ playersList.length }} PEMAIN TELAH MENJAWAB
            </span>
            <span v-else class="text-[10px] font-mono text-slate-400">
              Pilih opsi A / B / C / D atau tekan tombol angka [1-4]
            </span>

            <span class="text-[10px] font-mono text-slate-400">
              SPEAKER: {{ isHost ? 'SPEAKER RUANGAN 🔊' : (isHeadsetEnabled ? 'HP / EARPHONE 🎧' : 'SPEAKER HOST 📢') }}
            </span>
          </div>
        </div>

        <!-- ================= STAGE 3: RECAP SCREEN ================= -->
        <div v-else-if="triviaState.status === 'recap' && roundResult" class="flex flex-col justify-between gap-3.5 h-full w-full my-auto">
          <!-- Persona 5 Cut-In Banner: Correct Answer Revealed -->
          <div
            class="p-4 sm:p-5 bg-[#e60012] border-3 border-white shadow-[6px_6px_0px_#000] text-center space-y-1 relative overflow-hidden"
            style="transform: skewX(-3deg);"
          >
            <div class="absolute inset-0 opacity-20 p5-speedlines pointer-events-none"></div>
            <span class="p5-cutout-black text-[9px] sm:text-[10px] font-black uppercase tracking-widest font-mono">
              ★ TARGET IDENTIFIED // JAWABAN BENAR ★
            </span>
            <h3 class="text-lg sm:text-2xl font-black text-white uppercase italic tracking-tight drop-shadow-md">
              {{ roundResult.correctTitle }}
            </h3>
            <p class="text-xs sm:text-sm text-[#ffe600] font-black uppercase font-mono">
              {{ roundResult.correctArtist }}
            </p>
          </div>

          <!-- My Result Card (for participating player) -->
          <div
            v-if="myPlayer"
            class="p-3.5 sm:p-4 border-3 flex items-center justify-between shadow-[5px_5px_0px_#000]"
            :class="
              myPlayer.lastAnswerCorrect
                ? 'bg-black border-[#00e5ff] text-white'
                : 'bg-black border-[#e60012] text-white'
            "
            style="transform: skewX(-2deg);"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 border-2 flex items-center justify-center text-xl font-black"
                :class="myPlayer.lastAnswerCorrect ? 'bg-[#00e5ff] text-black border-white' : 'bg-[#e60012] text-white border-white'"
              >
                {{ myPlayer.lastAnswerCorrect ? '⚔️' : '❌' }}
              </div>
              <div class="leading-tight">
                <h4 class="font-black text-sm sm:text-base uppercase italic" :class="myPlayer.lastAnswerCorrect ? 'text-[#00e5ff]' : 'text-[#e60012]'">
                  {{ myPlayer.lastAnswerCorrect ? 'CRITICAL HIT! TEBAKANMU TEPAT!' : 'MISS! TEBAKANMU KURANG TEPAT!' }}
                </h4>
                <p class="text-[11px] text-slate-300 font-mono mt-0.5">
                  {{ myPlayer.lastAnswerCorrect ? `BONUS KECEPATAN: +${myPlayer.lastAnswerPoints} PTS!` : 'Tetap semangat, balas di ronde berikutnya!' }}
                </p>
              </div>
            </div>

            <div class="text-right">
              <span class="text-xl sm:text-2xl font-black font-mono text-[#ffe600]">
                {{ myPlayer.score }}
              </span>
              <span class="block text-[9px] uppercase font-bold text-slate-400 font-mono">TOTAL SKOR</span>
            </div>
          </div>

          <!-- Round Rankings Table (P5 Confidant / Battle Results Style) -->
          <div
            class="flex-1 bg-black/80 border-2 border-white p-3 sm:p-4 flex flex-col min-h-0 shadow-[4px_4px_0px_#000]"
            style="transform: skewX(-1.5deg);"
          >
            <h4 class="text-xs font-black uppercase tracking-wider text-[#00e5ff] font-mono mb-2">
              ★ KLASEMEN SEMENTARA RONDE INI:
            </h4>
            <div class="overflow-y-auto flex-1 space-y-1.5 pr-1">
              <div
                v-for="(r, idx) in roundResult.playerResults"
                :key="r.clientId"
                class="p-2 border-2 flex items-center justify-between text-xs font-black transition-all"
                :class="
                  r.clientId === myClientId
                    ? 'bg-[#00e5ff] border-white text-black'
                    : 'bg-black/60 border-white/20 text-slate-300'
                "
                style="transform: skewX(-4deg);"
              >
                <div class="flex items-center gap-2">
                  <span class="w-6 text-center font-mono font-black" :class="r.clientId === myClientId ? 'text-black' : 'text-[#e60012]'">
                    #0{{ idx + 1 }}
                  </span>
                  <span class="uppercase">{{ r.nickname }}</span>
                  <span
                    v-if="r.isCorrect"
                    class="text-[9px] font-mono px-1 py-0.2 border"
                    :class="r.clientId === myClientId ? 'bg-black text-[#00e5ff] border-black' : 'bg-[#e60012] text-white border-white'"
                  >
                    +{{ r.pointsEarned }}
                  </span>
                </div>
                <span class="font-mono">{{ r.totalScore }} PTS</span>
              </div>
            </div>
          </div>

          <div class="text-center text-xs text-slate-400 font-mono font-bold py-1">
            Ronde berikutnya akan dimulai otomatis dalam hitungan detik...
          </div>
        </div>

        <!-- ================= STAGE 4: PODIUM SCREEN (ALL-OUT ATTACK FINISHER) ================= -->
        <div v-else-if="triviaState.status === 'podium'" class="flex flex-col justify-between gap-4 w-full my-auto">
          <!-- Massive All-Out Attack Header -->
          <div class="text-center space-y-1 pt-2">
            <div
              class="inline-block px-4 py-1 bg-[#e60012] border-2 border-white text-white font-black text-xs uppercase tracking-widest shadow-[3px_3px_0px_#000]"
              style="transform: skewX(-14deg);"
            >
              ★ MISSION ACCOMPLISHED ★
            </div>
            <h2 class="text-2xl sm:text-4xl font-black text-white italic uppercase tracking-wider drop-shadow-lg">
              THE SHOW'S OVER!
            </h2>
            <p class="text-xs font-mono text-[#00e5ff] tracking-widest uppercase">
              [PHANTOM_THIEVES_PODIUM_OF_FAME]
            </p>
          </div>

          <!-- 3 Angular Geometric Pedestals -->
          <div class="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
            <!-- Rank 2 (Perak / Silver) -->
            <div class="flex flex-col items-center" style="transform: skewX(-4deg);">
              <span class="text-2xl sm:text-3xl mb-1">🥈</span>
              <span class="text-xs sm:text-sm font-black text-slate-200 truncate max-w-[95px] sm:max-w-[130px] uppercase text-center">
                {{ podium[1]?.nickname || '-' }}
              </span>
              <span class="text-[11px] font-mono font-black text-[#00e5ff]">{{ podium[1]?.score || 0 }} PTS</span>
              <div class="w-full h-24 sm:h-32 bg-slate-800 border-3 border-slate-300 flex items-center justify-center font-black text-2xl text-slate-300 shadow-[5px_5px_0px_#000] mt-2">
                2
              </div>
            </div>

            <!-- Rank 1 (MVP Emas / Gold) -->
            <div class="flex flex-col items-center" style="transform: skewX(-4deg);">
              <span class="text-3xl sm:text-4xl mb-1 animate-bounce">👑</span>
              <div class="p5-cutout-red text-[9px] font-black uppercase font-mono mb-0.5">
                MVP MASTER THIEF
              </div>
              <span class="text-xs sm:text-base font-black text-[#ffe600] truncate max-w-[110px] sm:max-w-[150px] uppercase text-center">
                {{ podium[0]?.nickname || '-' }}
              </span>
              <span class="text-xs font-mono font-black text-[#ffe600]">{{ podium[0]?.score || 0 }} PTS</span>
              <div class="w-full h-32 sm:h-44 bg-[#e60012] border-3 border-white flex flex-col items-center justify-center font-black text-4xl text-white shadow-[6px_6px_0px_#000] mt-2 animate-p5-glow">
                <span>1</span>
                <span class="text-[10px] font-mono tracking-widest uppercase text-white/80">WINNER</span>
              </div>
            </div>

            <!-- Rank 3 (Perunggu / Bronze) -->
            <div class="flex flex-col items-center" style="transform: skewX(-4deg);">
              <span class="text-2xl sm:text-3xl mb-1">🥉</span>
              <span class="text-xs sm:text-sm font-black text-slate-200 truncate max-w-[95px] sm:max-w-[130px] uppercase text-center">
                {{ podium[2]?.nickname || '-' }}
              </span>
              <span class="text-[11px] font-mono font-black text-[#e60012]">{{ podium[2]?.score || 0 }} PTS</span>
              <div class="w-full h-20 sm:h-24 bg-amber-950 border-3 border-amber-600 flex items-center justify-center font-black text-xl text-amber-200 shadow-[5px_5px_0px_#000] mt-2">
                3
              </div>
            </div>
          </div>

          <!-- Auto Resume Countdown & CTA -->
          <div
            class="p-3.5 sm:p-4 bg-black border-2 border-white flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shadow-[4px_4px_0px_#000]"
            style="transform: skewX(-2deg);"
          >
            <div>
              <h4 class="text-xs sm:text-sm font-black text-white uppercase italic">
                Musik jukebox kantor otomatis berlanjut dalam <span class="font-mono text-[#ffe600] text-base">{{ podiumCountdown }}s</span>...
              </h4>
              <p class="text-[11px] text-slate-400 font-mono">Posisi detik lagu terakhir tersimpan dengan aman.</p>
            </div>

            <button
              v-if="isHost"
              type="button"
              class="w-full sm:w-auto px-5 py-2.5 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs uppercase italic tracking-wider shadow-[3px_3px_0px_#000] active:scale-95 transition-all cursor-pointer shrink-0"
              style="transform: skewX(-8deg);"
              @click="closeOrLeave"
            >
              LANJUT PUTAR JUKEBOX 🎵
            </button>
            <button
              v-else
              type="button"
              class="w-full sm:w-auto px-5 py-2.5 bg-black hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs uppercase italic tracking-wider shadow-[3px_3px_0px_#000] active:scale-95 transition-all cursor-pointer shrink-0"
              style="transform: skewX(-8deg);"
              @click="closeOrLeave"
            >
              KEMBALI KE JUKEBOX 🎵
            </button>
          </div>
        </div>

      </main>

      <!-- Speaker Choice Confirmation Modal (Speaker Host vs Speaker Sendiri) -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="showSpeakerPrompt && !isHost"
          class="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md"
        >
          <div
            class="w-full max-w-md p-5 sm:p-6 bg-[#0b0b14] border-4 border-white shadow-[8px_8px_0px_#000] flex flex-col text-center space-y-4"
            style="transform: skewX(-2deg);"
          >
            <div
              class="w-12 h-12 bg-[#e60012] border-2 border-white flex items-center justify-center text-2xl mx-auto shadow-[3px_3px_0px_#000]"
              style="transform: rotate(-3deg);"
            >
              🎧
            </div>

            <div class="space-y-1">
              <h3 class="text-base sm:text-lg font-black uppercase italic tracking-wider text-white">
                PILIH JALUR SUARA TEBAK LAGU
              </h3>
              <p class="text-xs text-slate-300 leading-relaxed">
                Ingin mendengarkan cuplikan lagu dari mana? Kamu bisa mengubahnya kapan saja di menu atas.
              </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <!-- Option 1: Speaker Host -->
              <button
                type="button"
                class="p-4 bg-black hover:bg-white text-white hover:text-black border-2 border-white flex flex-col items-center justify-center gap-1.5 transition cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95"
                style="transform: skewX(-6deg);"
                @click="setSpeakerChoice('host')"
              >
                <span class="text-2xl">📢</span>
                <span class="text-xs font-black uppercase">Speaker Host</span>
                <span class="text-[10px] opacity-80 text-center leading-tight">Dengar dari speaker utama ruangan</span>
              </button>

              <!-- Option 2: Speaker Sendiri -->
              <button
                type="button"
                class="p-4 bg-[#00e5ff] hover:bg-white text-black border-2 border-white flex flex-col items-center justify-center gap-1.5 transition cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95"
                style="transform: skewX(-6deg);"
                @click="setSpeakerChoice('self')"
              >
                <span class="text-2xl">🔊</span>
                <span class="text-xs font-black uppercase">Speaker Sendiri</span>
                <span class="text-[10px] text-black/80 text-center leading-tight">Putar cuplikan di HP / earphone</span>
              </button>
            </div>

            <div class="text-[10px] font-mono text-slate-400 pt-1">
              Tips: Pilih "Speaker Sendiri" jika kamu berada jauh dari speaker komputer Host.
            </div>
          </div>
        </div>
      </Transition>

    </div>
  </div>
</template>

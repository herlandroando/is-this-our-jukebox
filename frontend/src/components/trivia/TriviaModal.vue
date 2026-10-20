<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { getStreamUrl } from "../../shared/api.ts";
import type { TriviaOption, TriviaPlayer } from "../../shared/types.ts";
import UiIcon from "../UiIcon.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

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

// Inisialisasi audio element lokal
function initLocalAudio() {
  if (!localAudio) {
    localAudio = new Audio();
    localAudio.preload = "auto";
  }
  // Host volume adalah 1.0 (maksimal speaker kantor); pemain remote menggunakan headsetVolume
  localAudio.volume = isHost.value ? 1.0 : Math.max(0, Math.min(1, headsetVolume.value / 100));
}

// Buka kunci autoplay peramban dengan gestur interaksi pengguna awal (Speaker Sendiri / Siap)
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
  // Putar audio jika Host (speaker kantor default nyala) ATAU Mode Headset aktif untuk pemain lain
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

    // Jika timer ronde sudah dimulai oleh server (barrier sudah terpenuhi sebelumnya), langsung bunyikan!
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
  if (localAudio && currentRound.value) {
    try {
      if (currentRound.value.snippetStartSec > 0 && Math.abs(localAudio.currentTime - currentRound.value.snippetStartSec) > 0.5) {
        localAudio.currentTime = currentRound.value.snippetStartSec;
      }
    } catch {}

    startAudiblePlayback(currentRound.value.roundIndex);
  }
}

// Watch perubahan status game untuk sinkronisasi audio dan timer
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

      // Mulai muat & putar audio cuplikan
      playSnippetAudio(
        q.trackId,
        q.provider,
        q.snippetStartSec,
        q.roundIndex
      );

      // Jika server sudah menandai audio siap (misal reconnect)
      if (q.isAudioReady) {
        startRoundTimer(
          q.startTime,
          q.endTime,
          q.durationSec,
          q.listenStartTime,
          q.listenDurationSec
        );
      }
    } else if (newStatus === "recap" || newStatus === "podium" || newStatus === "idle") {
      stopRoundTimer();
      stopLocalAudio();
      if (newStatus === "idle") {
        emit("close");
      }
    }

    if (newStatus === "podium") {
      startPodiumCountdown();
    } else {
      stopPodiumCountdown();
    }
  }
);

// Auto-join & Reconnect guard: pastikan pemain non-host yang melihat modal selalu terdaftar di roster
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

// Watch jika server mengonfirmasi audioReady pada ronde yang sama
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

// Pre-buffer lagu berikutnya begitu ronde berakhir dan masuk ke layar recap 5 detik
watch(
  () => triviaState.value?.roundResult,
  (res) => {
    if (res?.nextSnippet) {
      prebufferNextSnippet(res.nextSnippet.trackId, res.nextSnippet.provider, res.nextSnippet.snippetStartSec);
    }
  }
);

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
    // Sedang dalam fase dengarkan (3 detik pertama)
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
      // Masih dalam fase dengarkan bersama
      isListeningPhase.value = true;
      const leftListenMs = start - currentNow;
      listeningSecondsLeft.value = Math.max(1, Math.ceil(leftListenMs / 1000));
      remainingSeconds.value = totalDuration;
      timerProgressPercent.value = 100;
    } else {
      // Fase tebak dibuka serempak!
      if (isListeningPhase.value) {
        isListeningPhase.value = false;
        triggerHaptic();
      }
      const leftMs = Math.max(0, end - currentNow);
      remainingSeconds.value = Math.ceil(leftMs / 1000);
      timerProgressPercent.value = Math.max(0, Math.min(100, (leftMs / (totalDuration * 1000)) * 100));

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
  if (!isHost.value && !myPlayer.value) {
    jukeboxClient.joinTriviaLobby();
  }
  // Buka kunci audio context pada gestur klik tombol Siap
  primeAudio();
  jukeboxClient.setTriviaReady(!isReady.value);
  triggerHaptic();
}

function toggleHostPlaying() {
  if (!isHost.value) return;
  triggerHaptic();
  jukeboxClient.setTriviaHostPlaying(!isHostPlaying.value);
}

function forceStart() {
  primeAudio();
  jukeboxClient.forceStartTrivia();
  triggerHaptic();
}

function triggerWaitingNotice() {
  triggerHaptic();
  showWaitingAudioNotice.value = true;
  if (waitingNoticeTimer) clearTimeout(waitingNoticeTimer);
  waitingNoticeTimer = setTimeout(() => {
    showWaitingAudioNotice.value = false;
  }, 2200);
}

function selectAnswer(optionId: string) {
  if (!isPlayerParticipating.value) return;
  if (hasAnswered.value || triviaState.value?.status !== "question") return;

  // Jika audio cuplikan masih dalam proses persiapan/buffering atau fase dengarkan (3s), beri notifikasi ramah & haptic
  if (!currentRound.value?.isAudioReady || isListeningPhase.value) {
    triggerWaitingNotice();
    return;
  }

  const roundIdx = currentRound.value?.roundIndex;
  if (!roundIdx) return;

  triggerHaptic();
  jukeboxClient.submitTriviaAnswer(roundIdx, optionId);
}

function setSpeakerChoice(choice: "host" | "self") {
  speakerChoice.value = choice;
  try {
    localStorage.setItem("trivia_speaker_choice", choice);
  } catch {}
  showSpeakerPrompt.value = false;
  triggerHaptic();

  // Beritahu server mode audio pemain untuk barrier synchronization
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

function triggerHaptic() {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(18);
    }
  } catch {}
}

function closeOrLeave() {
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

  // Escape to close/leave
  if (e.key === "Escape") {
    closeOrLeave();
    return;
  }

  // Spacebar to toggle Ready in lobby (hanya jika berpartisipasi sebagai pemain)
  if (e.key === " " && triviaState.value.status === "lobby") {
    if (isPlayerParticipating.value) {
      e.preventDefault();
      toggleReady();
    }
    return;
  }

  // 1, 2, 3, 4 atau A, B, C, D to pick answer in question mode (hanya jika berpartisipasi dan fase tebak sudah dibuka)
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

  // Jika komponen dimuat saat game tebak lagu aktif dan belum bergabung
  if (triviaState.value?.status && triviaState.value.status !== "idle" && !isHost.value && !myPlayer.value) {
    jukeboxClient.joinTriviaLobby();
  }

  // Jika komponen dimuat saat ronde tebak lagu sudah berjalan
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
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-obsidian-950/90 backdrop-blur-2xl animate-in fade-in duration-200"
  >
    <!-- Modal Card Container -->
    <div class="glass-panel w-full max-w-4xl h-[96dvh] sm:h-[88vh] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden bg-obsidian-900/95 text-slate-100 relative">
      
      <!-- Top Navigation & Controls Bar -->
      <header class="px-4 sm:px-6 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-white/[0.02]">
        <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(99,102,241,0.3)]">
            <span class="text-base sm:text-lg">🎮</span>
          </div>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-xs sm:text-sm font-black tracking-tight text-white uppercase">Tebak Lagu</h2>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate">
                {{ categoryLabel }}
              </span>
            </div>
            <span v-if="triviaState.status === 'question' || triviaState.status === 'recap'" class="text-[11px] font-bold text-slate-400">
              Ronde {{ currentRound?.roundIndex }} dari {{ currentRound?.totalRounds }}
            </span>
            <span v-else class="text-[11px] text-slate-400">
              Host: <strong class="text-slate-200">{{ triviaState.hostNickname }}</strong>
            </span>
          </div>
        </div>

        <!-- Right: Audio Status + Headset Toggle + Close Button -->
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <!-- Unblock Autoplay Alert Button if browser blocked audio -->
          <button
            v-if="isAutoplayBlocked"
            type="button"
            class="h-8 px-2.5 sm:px-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] flex items-center gap-1.5 animate-bounce shadow-lg cursor-pointer active:scale-95"
            title="Browser memblokir pemutaran otomatis. Klik untuk membunyikan audio!"
            @click="unblockAudio"
          >
            <span>🔊</span>
            <span class="hidden sm:inline">Bunyikan Audio</span>
          </button>

          <!-- Host Room Speaker Indicator -->
          <div
            v-if="isHost"
            class="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-bold text-indigo-200"
            title="Audio berbunyi melalui speaker kantor pada perangkat Host ini"
          >
            <span class="text-xs">🔊</span>
            <span>Speaker Ruangan</span>
          </div>

          <!-- Toggle Mode Speaker (Speaker Sendiri vs Speaker Host) -->
          <button
            v-if="!isHost"
            type="button"
            class="h-8 px-2.5 sm:px-3 rounded-full border text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            :class="isHeadsetEnabled
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'"
            :title="isHeadsetEnabled ? 'Cuplikan audio berbunyi di speaker HP kamu. Klik untuk alih ke Speaker Host.' : 'Mendengarkan dari speaker komputer host. Klik untuk bunyikan di HP.'"
            @click="toggleSpeakerChoice"
          >
            <span>{{ isHeadsetEnabled ? '🔊' : '📢' }}</span>
            <span class="text-[11px] font-black">
              {{ isHeadsetEnabled ? 'Speaker Sendiri' : 'Speaker Host' }}
            </span>
          </button>

          <!-- Leave / Close Button -->
          <button
            type="button"
            class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition cursor-pointer text-slate-400 hover:text-white"
            :title="isHost ? 'Tutup Game & Lanjut Musik' : 'Keluar dari Game'"
            @click="closeOrLeave"
          >
            <UiIcon name="x" :size="18" />
          </button>
        </div>
      </header>

      <!-- Main Game Stages Content -->
      <main class="flex-1 overflow-y-auto flex flex-col p-3 sm:p-6 min-h-0 relative">
        
        <!-- ================= LOBBY SCREEN ================= -->
        <div v-if="triviaState.status === 'lobby'" class="h-full flex flex-col justify-between gap-4 max-w-2xl mx-auto w-full">
          <!-- Lobby Header & Rules -->
          <div class="text-center space-y-1 pt-1 sm:pt-2">
            <h3 class="text-xl sm:text-2xl font-black text-white tracking-tight">
              Lobby Ruang Tunggu
            </h3>
            <p class="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              Tebak judul lagu & artis secepat mungkin! Semakin cepat menjawab benar, semakin tinggi skor Kahoot-mu (hingga 1000 poin).
            </p>
          </div>

          <!-- Host MC vs Participant Mode Toggle Card (Only visible to Host) -->
          <div
            v-if="isHost"
            class="bg-indigo-500/10 border border-indigo-500/25 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-md"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-lg shrink-0">
                <span>{{ isHostPlaying ? '🎮' : '🎤' }}</span>
              </div>
              <div class="min-w-0">
                <h4 class="text-xs sm:text-sm font-black text-indigo-100 flex items-center gap-1.5">
                  Peran Host: {{ isHostPlaying ? 'Peserta & Host' : 'MC Ruangan / Layar Utama' }}
                </h4>
                <p class="text-[11px] text-slate-400 truncate">
                  {{ isHostPlaying ? 'Kamu ikut menebak & masuk klasemen poin!' : 'Default: Host memandu game di layar kantor, tidak wajib menebak.' }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 border active:scale-95 shadow-sm"
              :class="isHostPlaying
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'"
              @click="toggleHostPlaying"
            >
              <span>Ikut Main:</span>
              <span class="font-black px-1.5 py-0.5 rounded text-[10px]" :class="isHostPlaying ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-800 text-slate-400'">
                {{ isHostPlaying ? 'ON' : 'OFF' }}
              </span>
            </button>
          </div>

          <!-- Speaker Selection Card (Pilihan Speaker Host vs Speaker Sendiri untuk Non-Host) -->
          <div
            v-if="!isHost"
            class="bg-white/[0.03] border border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md"
          >
            <div class="flex items-center gap-3 w-full sm:w-auto min-w-0">
              <div
                class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border"
                :class="isHeadsetEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300'"
              >
                <span>{{ isHeadsetEnabled ? '🔊' : '📢' }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-xs sm:text-sm font-black text-white">
                    Sumber Suara:
                  </h4>
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono"
                    :class="isHeadsetEnabled ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40' : 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40'"
                  >
                    {{ isHeadsetEnabled ? 'Speaker Sendiri' : 'Speaker Host' }}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 truncate">
                  {{ isHeadsetEnabled ? 'Audio lagu berbunyi langsung di HP / earphone kamu.' : 'Mendengarkan audio dari speaker komputer host / ruangan.' }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                class="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                :class="!isHeadsetEnabled
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'"
                @click="setSpeakerChoice('host')"
              >
                <span>📢</span>
                <span>Speaker Host</span>
              </button>

              <button
                type="button"
                class="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                :class="isHeadsetEnabled
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'"
                @click="setSpeakerChoice('self')"
              >
                <span>🔊</span>
                <span>Speaker Sendiri</span>
              </button>
            </div>
          </div>

          <!-- Players Roster Grid -->
          <div class="flex-1 bg-white/[0.02] border border-white/5 rounded-2xl p-3 sm:p-4 flex flex-col min-h-0">
            <div class="flex items-center justify-between pb-2.5 border-b border-white/10 mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Peserta di Ruangan ({{ playersList.length }})</span>
              <span>Status</span>
            </div>

            <div class="overflow-y-auto flex-1 space-y-2 pr-1">
              <div
                v-if="playersList.length === 0"
                class="h-28 flex flex-col items-center justify-center text-center text-slate-500 text-xs gap-1"
              >
                <span>⏳ Menunggu peserta bergabung ke lobby...</span>
                <span class="text-[11px] text-slate-600">Pemain di ruangan dapat mengklik tombol "Tebak Lagu" di menu atas</span>
              </div>

              <div
                v-for="p in playersList"
                :key="p.clientId"
                class="p-2.5 sm:p-3 rounded-xl border flex items-center justify-between transition-all"
                :class="p.isReady
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                  : 'bg-white/[0.03] border-white/5 text-slate-300'"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-black text-xs text-indigo-300 shrink-0">
                    {{ p.nickname.charAt(0).toUpperCase() }}
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="font-bold text-xs sm:text-sm truncate">
                      {{ p.nickname }}
                      <span v-if="p.clientId === myClientId" class="text-[10px] text-indigo-400 font-semibold">(Kamu)</span>
                    </span>
                    <span v-if="p.role === 'host'" class="text-[10px] text-amber-400 flex items-center gap-0.5">
                      <UiIcon name="crown" :size="10" /> Host DJ
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    class="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                    :class="p.isReady
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-slate-800 text-slate-400 border border-white/5'"
                  >
                    <span v-if="p.isReady" class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {{ p.isReady ? 'SIAP' : 'Menunggu' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Lobby Action Bottom Bar -->
          <div class="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <!-- If current user is participating as a contestant -->
            <template v-if="isPlayerParticipating">
              <button
                type="button"
                class="w-full sm:flex-1 py-3.5 sm:py-4 rounded-2xl font-black text-sm sm:text-base transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98]"
                :class="isReady
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30'"
                @click="toggleReady"
              >
                <span>{{ isReady ? '✅ Kamu Sudah Siap! (Batalkan)' : '🚀 Saya Siap! (Tekan Spasi)' }}</span>
              </button>

              <!-- Force Start Button for Host when playing -->
              <button
                v-if="isHost"
                type="button"
                class="w-full sm:w-auto px-6 py-3.5 sm:py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 shrink-0"
                title="Mulai langsung tanpa menunggu yang AFK"
                @click="forceStart"
              >
                Mulai Sekarang ⚡
              </button>
            </template>

            <!-- If Host is MC only (Not playing) -->
            <template v-else>
              <div class="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs sm:text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-amber-400 font-bold">🎤 Mode MC / Layar Ruangan</span>
                  <span class="text-slate-400 hidden sm:inline">(Siap memulai ronde kapan saja)</span>
                </div>
                <span class="text-indigo-300 font-bold">{{ playersList.length }} Peserta</span>
              </div>

              <button
                type="button"
                class="w-full sm:w-auto px-7 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 shrink-0"
                :disabled="playersList.length === 0"
                :class="playersList.length === 0 ? 'opacity-50 cursor-not-allowed' : ''"
                @click="forceStart"
              >
                Mulai Permainan ⚡
              </button>
            </template>
          </div>
        </div>

        <!-- ================= COUNTDOWN SCREEN ================= -->
        <div v-else-if="triviaState.status === 'countdown'" class="h-full flex flex-col items-center justify-center text-center">
          <span class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Bersiaplah!</span>
          <div class="text-7xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-indigo-400 via-fuchsia-400 to-pink-400 animate-pulse scale-110">
            {{ triviaState.countdownSec || 3 }}
          </div>
          <p class="text-sm font-semibold text-slate-400 mt-4">Pasang telingamu baik-baik 🎵</p>
        </div>

        <!-- ================= QUESTION SCREEN ================= -->
        <div v-else-if="triviaState.status === 'question' && currentRound" class="h-full flex flex-col justify-between gap-4 w-full max-w-3xl mx-auto">
          
          <!-- Top Progress & Timer Ring -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-bold">
              <span class="text-slate-400">
                <template v-if="!currentRound.isAudioReady">
                  <span class="flex items-center gap-1.5 text-amber-300 animate-pulse">
                    <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Memuat cuplikan audio... Harap tunggu sebentar 🎵</span>
                  </span>
                </template>
                <template v-else-if="isListeningPhase">
                  <span class="flex items-center gap-1.5 text-amber-300 font-black animate-pulse">
                    <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>🔒 Dengarkan baik-baik... ({{ listeningSecondsLeft }}s)</span>
                  </span>
                </template>
                <template v-else>
                  <span class="text-indigo-300 font-bold flex items-center gap-1.5">
                    <span>⚡ Silakan Tebak Lagu yang Sedang Berbunyi:</span>
                  </span>
                </template>
              </span>
              
              <span
                v-if="currentRound.isAudioReady && !isListeningPhase"
                class="font-mono text-sm sm:text-base font-black tabular-nums transition-colors"
                :class="remainingSeconds <= 5 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'"
              >
                ⏱️ {{ remainingSeconds }}s
              </span>
              <span
                v-else-if="isListeningPhase"
                class="font-mono text-xs text-amber-300 font-black tracking-wider uppercase animate-pulse"
              >
                🎧 Dengarkan ({{ listeningSecondsLeft }}s)
              </span>
              <span
                v-else
                class="font-mono text-xs text-amber-400 uppercase tracking-wider animate-pulse font-bold"
              >
                Buffering...
              </span>
            </div>

            <!-- Timer Progress Bar -->
            <div class="w-full h-2.5 sm:h-3 rounded-full bg-slate-800/80 overflow-hidden border border-white/10 shadow-inner">
              <div
                v-if="currentRound.isAudioReady && !isListeningPhase"
                class="h-full transition-all duration-100 rounded-full"
                :class="remainingSeconds <= 5
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                  : 'bg-gradient-to-r from-cyan-400 via-indigo-500 to-pink-500'"
                :style="{ width: `${timerProgressPercent}%` }"
              ></div>
              <div
                v-else-if="isListeningPhase"
                class="h-full w-full bg-gradient-to-r from-amber-500/50 via-yellow-400/70 to-amber-500/50 animate-pulse rounded-full"
              ></div>
              <div
                v-else
                class="h-full w-full bg-gradient-to-r from-indigo-500/30 via-pink-500/50 to-indigo-500/30 animate-pulse rounded-full"
              ></div>
            </div>
          </div>

          <!-- Vinyl Disc & Waveform Audio Visualizer Graphic -->
          <div class="flex-1 flex flex-col items-center justify-center my-1 sm:my-3">
            <div
              class="relative w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-slate-950 border-4 border-slate-800 shadow-[0_0_30px_rgba(99,102,241,0.25)] flex items-center justify-center"
              :class="currentRound.isAudioReady ? 'animate-[spin_4s_linear_infinite]' : 'opacity-70'"
            >
              <!-- Vinyl Grooves -->
              <div class="absolute inset-2 rounded-full border border-slate-700/50"></div>
              <div class="absolute inset-4 sm:inset-5 rounded-full border border-slate-700/40"></div>
              <div class="absolute inset-6 sm:inset-8 rounded-full border border-slate-700/30"></div>
              <!-- Vinyl Center Label -->
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center text-white text-xs shadow-md">
                <span>🎵</span>
              </div>
            </div>

            <!-- Audio Playing Status Indicator -->
            <div class="mt-2.5 flex items-center gap-1.5 text-xs font-semibold">
              <template v-if="!currentRound.isAudioReady">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span class="text-amber-300">Sinkronisasi cuplikan audio...</span>
              </template>
              <template v-else-if="isListeningPhase">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span class="text-amber-200 font-bold">
                  {{ isHost ? 'Audio berputar di speaker ruangan (Dengarkan bersama 3s) 🔊' : (isHeadsetEnabled ? 'Audio berputar di HP (Dengarkan bersama 3s) 🔊' : 'Mendengarkan dari Speaker Host (3s) 📢') }}
                </span>
              </template>
              <template v-else>
                <span class="w-2 h-2 rounded-full bg-pink-500 animate-ping"></span>
                <span class="text-slate-300">
                  {{ isHost ? 'Audio berputar di speaker ruangan 🔊' : (isHeadsetEnabled ? 'Audio berputar di HP (Speaker Sendiri) 🔊' : 'Mendengarkan dari Speaker Host 📢') }}
                </span>
              </template>
            </div>

            <!-- Autoplay Blocked Alert Pill if browser blocked audio -->
            <button
              v-if="isAutoplayBlocked"
              type="button"
              class="mt-2.5 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-xl cursor-pointer active:scale-95 animate-bounce"
              @click="unblockAudio"
            >
              <span>🔊</span>
              <span>Klik di sini untuk membunyikan suara di HP!</span>
            </button>

            <!-- Participant status vs Host MC status -->
            <template v-if="isPlayerParticipating">
              <span v-if="hasAnswered" class="mt-2 text-xs font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 animate-in fade-in">
                🔒 Jawabanmu Terkunci! Menunggu pemain lain...
              </span>
            </template>
            <template v-else>
              <div class="mt-2 flex items-center gap-2">
                <span class="text-xs font-black text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  🎤 Layar MC: {{ answeredCount }} / {{ playersList.length }} pemain telah menjawab
                </span>
              </div>
            </template>
          </div>

          <!-- Floating Notice saat pengguna tap tombol ketika audio masih proses buffer -->
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div
              v-if="showWaitingAudioNotice"
              class="py-1 px-3.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg mx-auto text-center animate-bounce mb-1"
            >
              <span>🎵</span>
              <span>{{ isListeningPhase ? 'Dengarkan dulu lagunya baik-baik... 🎧' : 'Tunggu sebentar, cuplikan lagu sedang dimulai...' }}</span>
            </div>
          </Transition>

          <!-- 4 Multiple Choice Interactive Cards -->
          <!-- A. Peserta yang ikut bermain -->
          <div v-if="isPlayerParticipating" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5 pb-2">
            <button
              v-for="(opt, idx) in currentRound.options"
              :key="opt.id"
              type="button"
              :disabled="hasAnswered || isListeningPhase"
              class="min-h-[56px] sm:min-h-[64px] p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left transition-all duration-200 flex items-center justify-between gap-3 select-none"
              :class="[
                selectedOptionId === opt.id
                  ? 'bg-gradient-to-r from-indigo-600/40 to-pink-600/40 border-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] scale-[1.01]'
                  : hasAnswered
                    ? 'opacity-40 bg-white/[0.02] border-white/5 cursor-not-allowed'
                    : isListeningPhase
                      ? 'opacity-70 bg-white/[0.03] border-white/10 cursor-not-allowed'
                      : !currentRound.isAudioReady
                        ? 'bg-white/[0.04] border-white/10 opacity-75 hover:border-amber-400/40 cursor-pointer'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 hover:border-indigo-400/50 cursor-pointer active:scale-[0.98]'
              ]"
              @click="selectAnswer(opt.id)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <!-- PC / Keyboard Shortcut Pill [1, 2, 3, 4] -->
                <div
                  class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs sm:text-sm shrink-0 shadow-sm"
                  :class="selectedOptionId === opt.id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 border border-white/10'"
                >
                  {{ ['A', 'B', 'C', 'D'][idx] }}
                </div>

                <!-- Jika fase mendengarkan (poin 1 & 3): samarkan teks dengan placeholder misteri yang berdenyut -->
                <div v-if="isListeningPhase" class="flex flex-col min-w-0 flex-1 gap-1.5 animate-pulse">
                  <div class="h-3.5 bg-white/20 rounded-md w-3/4"></div>
                  <div class="h-2.5 bg-white/10 rounded-md w-1/2"></div>
                </div>
                <!-- Saat tombol dibuka: tampilkan judul & penyanyi -->
                <div v-else class="flex flex-col min-w-0 transition-opacity duration-300">
                  <span class="font-bold text-xs sm:text-sm text-slate-100 truncate leading-snug">
                    {{ opt.title }}
                  </span>
                  <span class="text-[11px] text-slate-400 truncate">
                    {{ opt.artist }}
                  </span>
                </div>
              </div>

              <div class="shrink-0">
                <span v-if="selectedOptionId === opt.id" class="text-base sm:text-lg">✅</span>
                <span v-else-if="isListeningPhase" class="text-xs text-amber-300/70 font-mono">🔒</span>
                <span v-else class="text-[10px] font-mono text-slate-500 hidden sm:inline">[{{ idx + 1 }}]</span>
              </div>
            </button>
          </div>

          <!-- B. Host MC Presentation View (Pilihan ditampilkan besar untuk layar TV/proyektor) -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5 pb-2">
            <div
              v-for="(opt, idx) in currentRound.options"
              :key="opt.id"
              class="min-h-[56px] sm:min-h-[64px] p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-between gap-3 shadow-md"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-mono font-black text-sm text-indigo-300 shrink-0">
                  {{ ['A', 'B', 'C', 'D'][idx] }}
                </div>

                <div v-if="isListeningPhase" class="flex flex-col min-w-0 flex-1 gap-1.5 animate-pulse">
                  <div class="h-4 bg-white/20 rounded-md w-3/4"></div>
                  <div class="h-3 bg-white/10 rounded-md w-1/2"></div>
                </div>
                <div v-else class="flex flex-col min-w-0">
                  <span class="font-black text-xs sm:text-sm text-white truncate leading-snug">
                    {{ opt.title }}
                  </span>
                  <span class="text-[11px] text-slate-300 truncate font-semibold">
                    {{ opt.artist }}
                  </span>
                </div>
              </div>

              <span v-if="isListeningPhase" class="text-xs text-amber-300/70 font-mono">🔒</span>
              <span v-else class="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Pilihan {{ ['A', 'B', 'C', 'D'][idx] }}
              </span>
            </div>
          </div>
        </div>

        <!-- ================= RECAP SCREEN ================= -->
        <div v-else-if="triviaState.status === 'recap' && roundResult" class="h-full flex flex-col justify-between gap-4 max-w-2xl mx-auto w-full">
          <div class="text-center space-y-1 pt-2">
            <span class="text-xs font-black uppercase tracking-wider text-slate-400">Jawaban yang Benar Adalah:</span>
            <h3 class="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
              {{ roundResult.correctTitle }}
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 font-bold">
              {{ roundResult.correctArtist }}
            </p>
          </div>

          <!-- My Result Card (for participating player) -->
          <div
            v-if="myPlayer"
            class="p-4 rounded-2xl border flex items-center justify-between shadow-lg"
            :class="myPlayer.lastAnswerCorrect
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
              : 'bg-rose-500/15 border-rose-400/40 text-rose-200'"
          >
            <div class="flex items-center gap-3">
              <span class="text-2xl">{{ myPlayer.lastAnswerCorrect ? '🎉' : '❌' }}</span>
              <div>
                <h4 class="font-black text-sm sm:text-base">
                  {{ myPlayer.lastAnswerCorrect ? 'Tebakanmu Tepat Sekali!' : 'Yah, Tebakanmu Kurang Tepat!' }}
                </h4>
                <p class="text-xs opacity-80">
                  {{ myPlayer.lastAnswerCorrect ? `Kecepatanmu menghasilkan +${myPlayer.lastAnswerPoints} Poin!` : 'Tetap semangat di ronde berikutnya!' }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-lg sm:text-2xl font-black font-mono">
                {{ myPlayer.score }}
              </span>
              <span class="block text-[10px] uppercase font-bold text-slate-400">Total Skor</span>
            </div>
          </div>

          <!-- MC Overview Banner (if Host is not participating) -->
          <div
            v-else-if="isHost"
            class="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between text-xs text-indigo-200"
          >
            <div class="flex items-center gap-2.5">
              <span class="text-lg">🎤</span>
              <span><strong>Layar MC Ruangan:</strong> Ronde {{ currentRound?.roundIndex }} selesai! Berikut perolehan poin para peserta.</span>
            </div>
          </div>

          <!-- Round Rankings Table -->
          <div class="flex-1 bg-white/[0.02] border border-white/5 rounded-2xl p-3 sm:p-4 flex flex-col min-h-0">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Klasemen Sementara Ronde Ini:
            </h4>
            <div class="overflow-y-auto flex-1 space-y-1.5 pr-1">
              <div
                v-for="(r, idx) in roundResult.playerResults"
                :key="r.clientId"
                class="p-2 sm:p-2.5 rounded-xl border flex items-center justify-between text-xs"
                :class="r.clientId === myClientId
                  ? 'bg-indigo-500/15 border-indigo-400/30 text-white font-bold'
                  : 'bg-white/[0.02] border-white/5 text-slate-300'"
              >
                <div class="flex items-center gap-2">
                  <span class="w-5 text-center font-mono font-bold text-slate-500">{{ idx + 1 }}.</span>
                  <span>{{ r.nickname }}</span>
                  <span v-if="r.isCorrect" class="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                    +{{ r.pointsEarned }}
                  </span>
                </div>
                <span class="font-mono font-bold">{{ r.totalScore }} pts</span>
              </div>
            </div>
          </div>

          <div class="text-center text-xs text-slate-400 font-semibold py-1">
            Ronde berikutnya akan dimulai otomatis dalam beberapa detik...
          </div>
        </div>

        <!-- ================= PODIUM SCREEN ================= -->
        <div v-else-if="triviaState.status === 'podium'" class="h-full flex flex-col justify-between gap-4 max-w-2xl mx-auto w-full">
          <div class="text-center space-y-1 pt-2">
            <span class="text-xs font-black uppercase tracking-widest text-amber-400">🏆 Game Berakhir</span>
            <h3 class="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Podium Para Juara!
            </h3>
          </div>

          <!-- 3 Podium Pedestals -->
          <div class="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
            <!-- Rank 2 (Perak) -->
            <div class="flex flex-col items-center">
              <span class="text-2xl sm:text-3xl mb-1">🥈</span>
              <span class="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[90px] sm:max-w-[120px] text-center">
                {{ podium[1]?.nickname || '-' }}
              </span>
              <span class="text-[11px] font-mono text-slate-400 font-bold">{{ podium[1]?.score || 0 }} pts</span>
              <div class="w-full h-20 sm:h-28 rounded-t-2xl bg-gradient-to-t from-slate-700/60 to-slate-500/60 border-t border-slate-400 flex items-center justify-center font-black text-xl text-slate-300 shadow-lg mt-2">
                2
              </div>
            </div>

            <!-- Rank 1 (Emas) -->
            <div class="flex flex-col items-center">
              <span class="text-3xl sm:text-4xl mb-1 animate-bounce">👑</span>
              <span class="text-xs sm:text-base font-black text-amber-300 truncate max-w-[100px] sm:max-w-[140px] text-center">
                {{ podium[0]?.nickname || '-' }}
              </span>
              <span class="text-xs font-mono text-amber-400 font-bold">{{ podium[0]?.score || 0 }} pts</span>
              <div class="w-full h-28 sm:h-36 rounded-t-2xl bg-gradient-to-t from-amber-600/70 to-yellow-500/70 border-t-2 border-yellow-300 flex items-center justify-center font-black text-3xl text-white shadow-[0_0_25px_rgba(234,179,8,0.35)] mt-2">
                1
              </div>
            </div>

            <!-- Rank 3 (Perunggu) -->
            <div class="flex flex-col items-center">
              <span class="text-2xl sm:text-3xl mb-1">🥉</span>
              <span class="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[90px] sm:max-w-[120px] text-center">
                {{ podium[2]?.nickname || '-' }}
              </span>
              <span class="text-[11px] font-mono text-slate-400 font-bold">{{ podium[2]?.score || 0 }} pts</span>
              <div class="w-full h-16 sm:h-20 rounded-t-2xl bg-gradient-to-t from-amber-900/60 to-amber-700/60 border-t border-amber-600 flex items-center justify-center font-black text-lg text-amber-200 shadow-lg mt-2">
                3
              </div>
            </div>
          </div>

          <!-- Auto Resume Countdown & CTA -->
          <div class="p-3 sm:p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <h4 class="text-xs sm:text-sm font-bold text-indigo-200">
                Lagu jukebox kantor otomatis dilanjutkan dalam <span class="font-mono font-black text-amber-400">{{ podiumCountdown }}s</span>...
              </h4>
              <p class="text-[11px] text-slate-400">Posisi detik lagu terakhir tersimpan dengan aman.</p>
            </div>

            <button
              v-if="isHost"
              type="button"
              class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white font-extrabold text-xs shadow-lg active:scale-95 transition cursor-pointer shrink-0"
              @click="closeOrLeave"
            >
              Lanjut Putar Jukebox Sekarang 🎵
            </button>
            <button
              v-else
              type="button"
              class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs shadow-lg active:scale-95 transition cursor-pointer shrink-0 border border-white/15"
              @click="closeOrLeave"
            >
              Tutup & Kembali ke Jukebox 🎵
            </button>
          </div>
        </div>

      </main>

      <!-- Speaker Choice Confirmation Modal / Overlay (Speaker Host vs Speaker Sendiri) -->
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
          class="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-obsidian-950/90 backdrop-blur-md"
        >
          <div class="glass-panel w-full max-w-md p-5 sm:p-6 rounded-3xl border border-indigo-500/30 bg-obsidian-900/95 flex flex-col text-center shadow-2xl space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center text-2xl mx-auto shadow-lg">
              🎧
            </div>

            <div class="space-y-1.5">
              <h3 class="text-base sm:text-lg font-black text-white tracking-tight">
                Pilih Sumber Suara Tebak Lagu
              </h3>
              <p class="text-xs text-slate-300 leading-relaxed">
                Ingin mendengarkan cuplikan lagu dari mana? Kamu bisa mengubahnya kapan saja di menu atas.
              </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <!-- Option 1: Speaker Host -->
              <button
                type="button"
                class="p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition cursor-pointer active:scale-95 bg-white/[0.04] hover:bg-white/[0.08] border-white/15 text-slate-200 hover:border-indigo-400"
                @click="setSpeakerChoice('host')"
              >
                <span class="text-2xl">📢</span>
                <span class="text-xs font-black text-white text-center">Speaker Host</span>
                <span class="text-[10px] text-slate-400 text-center leading-tight">Dengar dari speaker utama host</span>
              </button>

              <!-- Option 2: Speaker Sendiri -->
              <button
                type="button"
                class="p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition cursor-pointer active:scale-95 bg-gradient-to-br from-indigo-600/30 to-emerald-600/30 border-emerald-400/50 text-white shadow-lg shadow-emerald-500/10 hover:border-emerald-300"
                @click="setSpeakerChoice('self')"
              >
                <span class="text-2xl">🔊</span>
                <span class="text-xs font-black text-emerald-300 text-center">Speaker Sendiri</span>
                <span class="text-[10px] text-slate-300 text-center leading-tight">Putar lagu langsung di HP / earphone</span>
              </button>
            </div>

            <div class="text-[10px] text-slate-400 pt-1">
              Tips: Pilih "Speaker Sendiri" jika kamu bermain jauh dari komputer Host.
            </div>
          </div>
        </div>
      </Transition>

    </div>
  </div>
</template>

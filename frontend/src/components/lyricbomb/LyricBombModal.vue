<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import { getStreamUrl } from "../../shared/api.ts";
import { personaAudio } from "../../shared/personaAudio.ts";
import type { LyricBombPlayer, LyricBombPodiumEntry, LyricBombSegment } from "../../shared/types.ts";
import UiIcon from "../UiIcon.vue";
import JukeChanMini from "../mascot/JukeChanMini.vue";
import LyricBombSongPickerModal from "./LyricBombSongPickerModal.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const lbState = computed(() => jukeboxClient.lyricBombState.value);
const myClientId = computed(() => jukeboxClient.clientId.value);
const myPlayer = computed<LyricBombPlayer | undefined>(() => {
  if (!lbState.value || !myClientId.value) return undefined;
  return lbState.value.players[myClientId.value];
});
const isHost = computed(() =>
  Boolean(
    jukeboxClient.isAdmin.value ||
      myPlayer.value?.isHost ||
      (myClientId.value && lbState.value?.hostClientId === myClientId.value)
  )
);
const isHostPlaying = computed(() => Boolean(lbState.value?.isHostPlaying ?? true));

// Konfirmasi Sumber Suara: 'host' (Speaker Host) vs 'self' (Speaker Sendiri di HP)
const speakerChoice = ref<"host" | "self" | null>(null);
const showSpeakerPrompt = ref(false);
const isHeadsetEnabled = computed(() => speakerChoice.value === "self");
const shouldPlayAudio = computed(() => isHost.value || isHeadsetEnabled.value);

// Audio & Autoplay state
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const isAutoplayBlocked = ref(false);
const isAudioBuffering = ref(false);
const currentLoadedVideoId = ref<string | null>(null);
const currentAudioTime = ref(0);

const isSongPickerOpen = ref(false);
const audioEl = ref<HTMLAudioElement | null>(null);
const userOffsetSec = ref(0);

// Wrong-tap visual feedback state
const isShakingWrong = ref(false);
const wrongTapChipId = ref<string | null>(null);
const showWrongPenaltyBanner = ref(false);
let wrongTapTimer: ReturnType<typeof setTimeout> | null = null;

// Buka kunci autoplay peramban dengan gestur interaksi pengguna
function primeAudio() {
  if (audioEl.value && audioEl.value.paused && (!audioEl.value.src || audioEl.value.src.startsWith("data:"))) {
    audioEl.value.src = SILENT_WAV;
    audioEl.value.play().catch((e) => console.warn("[LyricBomb] primeAudio note:", e));
  }
}

function unblockAudio() {
  personaAudio.playCursor();
  if (audioEl.value) {
    isAutoplayBlocked.value = false;
    audioEl.value.play().catch((err) => {
      console.warn("[LyricBomb] Unblock audio failed:", err);
    });
  }
}

function setSpeakerChoice(choice: "host" | "self") {
  personaAudio.playCursor();
  speakerChoice.value = choice;
  try {
    localStorage.setItem("lyricbomb_speaker_choice", choice);
  } catch {}
  showSpeakerPrompt.value = false;
  jukeboxClient.setLyricBombAudioMode(choice);

  if (choice === "self") {
    primeAudio();
    if (lbState.value?.status === "playing" && lbState.value?.currentSong && currentSegment.value) {
      setupSegmentAudio(lbState.value.currentSegmentIndex);
    }
  } else {
    if (!isHost.value && audioEl.value) {
      audioEl.value.pause();
      isAutoplayBlocked.value = false;
    }
  }
}

function toggleSpeakerChoice() {
  const nextChoice = isHeadsetEnabled.value ? "host" : "self";
  setSpeakerChoice(nextChoice);
}

// Watch for song change to load stored offset
watch(
  () => lbState.value?.currentSong?.videoId,
  (vid) => {
    if (vid) {
      const stored = localStorage.getItem(`lyricbomb_offset_${vid}`);
      userOffsetSec.value = stored ? parseFloat(stored) || 0 : 0;
    } else {
      userOffsetSec.value = 0;
    }
  },
  { immediate: true }
);

function adjustOffset(delta: number) {
  userOffsetSec.value = Math.round((userOffsetSec.value + delta) * 100) / 100;
  if (lbState.value?.currentSong?.videoId) {
    localStorage.setItem(`lyricbomb_offset_${lbState.value.currentSong.videoId}`, String(userOffsetSec.value));
  }
  if (audioEl.value && !audioEl.value.paused) {
    audioEl.value.currentTime = Math.max(0, audioEl.value.currentTime + delta);
  }
  personaAudio.playCursor();
}

function resetOffset() {
  userOffsetSec.value = 0;
  if (lbState.value?.currentSong?.videoId) {
    localStorage.removeItem(`lyricbomb_offset_${lbState.value.currentSong.videoId}`);
  }
  personaAudio.playCursor();
}

const isMyTurn = computed(() => {
  return Boolean(myClientId.value && lbState.value?.activePlayerId === myClientId.value);
});

const isPicker = computed(() => {
  return Boolean(myClientId.value && lbState.value?.pickerPlayerId === myClientId.value);
});

const currentSegment = computed<LyricBombSegment | undefined>(() => {
  if (!lbState.value?.currentSong) return undefined;
  return lbState.value.currentSong.segments[lbState.value.currentSegmentIndex];
});

const playerList = computed(() => {
  if (!lbState.value) return [];
  return Object.values(lbState.value.players);
});

const alivePlayers = computed(() => {
  return playerList.value.filter((p) => !p.isEliminated && p.hp > 0);
});

const turnOrderPlayers = computed<LyricBombPlayer[]>(() => {
  if (!lbState.value) return [];
  const order = lbState.value.playerTurnOrder || [];
  if (order.length > 0) {
    const mapped = order
      .map((id) => lbState.value?.players[id])
      .filter((p): p is LyricBombPlayer => Boolean(p && !p.isEliminated && p.hp > 0));
    if (mapped.length > 0) return mapped;
  }
  return alivePlayers.value;
});

const nextTurnPlayer = computed<LyricBombPlayer | undefined>(() => {
  const list = turnOrderPlayers.value;
  if (list.length <= 1 || !lbState.value?.activePlayerId) return undefined;
  const idx = list.findIndex((p) => p.id === lbState.value?.activePlayerId);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
});

const activePlayer = computed(() => {
  if (!lbState.value?.activePlayerId) return undefined;
  return lbState.value.players[lbState.value.activePlayerId];
});

const explodedPlayer = computed(() => {
  if (!lbState.value) return undefined;
  const targetId = lbState.value.lastExplodedPlayerId || lbState.value.activePlayerId;
  if (!targetId) return undefined;
  return lbState.value.players[targetId];
});

const pickerPlayer = computed(() => {
  if (!lbState.value?.pickerPlayerId) return undefined;
  return lbState.value.players[lbState.value.pickerPlayerId];
});

const podiumList = computed<LyricBombPodiumEntry[]>(() => {
  if (lbState.value?.podium && lbState.value.podium.length > 0) {
    return lbState.value.podium;
  }
  return [...playerList.value]
    .sort((a, b) => b.score - a.score || b.defusalCount - a.defusalCount)
    .map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      score: p.score || 0,
      hp: p.hp,
      isEliminated: p.isEliminated,
      defusalCount: p.defusalCount,
      maxStreak: p.maxStreak || 0,
      explosionsTaken: p.explosionsTaken,
    }));
});

const bombFusePercent = computed(() => {
  if (!lbState.value) return 100;
  const maxDur = Math.max(1, lbState.value.turnBombDuration || lbState.value.startingBombDuration || 18);
  return Math.min(100, Math.max(0, Math.round((lbState.value.currentBombTimeLeft / maxDur) * 100)));
});

const isCriticalTime = computed(() => {
  return lbState.value?.status === "defusing" && (lbState.value?.currentBombTimeLeft ?? 99) <= 5;
});

const canUseHint = computed(() => {
  return (
    isMyTurn.value &&
    lbState.value?.status === "defusing" &&
    (lbState.value?.currentBombTimeLeft ?? 0) > 3
  );
});

const isActiveSongPhase = computed(() => {
  const status = lbState.value?.status;
  return (
    status === "playing" ||
    status === "defusing" ||
    status === "line_success" ||
    status === "song_loading"
  );
});

const audioIssueReports = computed(() => {
  return lbState.value?.audioIssueReports || [];
});

const hasReportedAudioIssue = computed(() => {
  if (!myClientId.value) return false;
  return audioIssueReports.value.some((r) => r.playerId === myClientId.value);
});

// Active lead-in line index for live karaoke highlight
const activeLeadInIndex = computed(() => {
  const seg = currentSegment.value;
  if (!seg || !seg.leadInLines || seg.leadInLines.length === 0) return -1;
  let activeIdx = 0;
  for (let i = 0; i < seg.leadInLines.length; i++) {
    if (currentAudioTime.value >= seg.leadInLines[i].time - 0.25) {
      activeIdx = i;
    }
  }
  return activeIdx;
});

// Reactive Juke-chan Navigator Commentary
const navigatorSpeech = computed(() => {
  const state = lbState.value;
  if (!state) return "Sistem Bom Lirik siap! Ayo berkumpul di arena!";

  switch (state.status) {
    case "lobby":
      if (!myPlayer.value && isHost.value && !isHostPlaying.value) {
        return "Mode Layar Kantor aktif! Menunggu rekan-rekan menekan SIAP sebelum bom dinyalakan!";
      }
      if (myPlayer.value?.isReady) {
        return "Statusmu SIAP! Menunggu Host menyalakan sumbu bom pertama!";
      }
      return "Pasang sabuk pengaman! Tekan tombol SIAP untuk ikut oper-operan Bom Lirik!";
    case "picking_song":
      if (isPicker.value) {
        return "Giliranmu memilih lagu! Pilih dari Office Playlist, Cari Lagu, atau tekan Surprise Me!";
      }
      return `Menunggu ${pickerPlayer.value?.nickname || "rekan kita"} memilih lagu tantangan berikutnya...`;
    case "song_loading":
      return "Memvalidasi lirik tersinkronisasi dan menyiapkan sumbu bom...";
    case "playing":
      if (isMyTurn.value) {
        return " Giliranmu memegang bom! Dengarkan liriknya baik-baik sebelum musik berhenti mendadak!";
      }
      return `Dengarkan musiknya! Sebentar lagi ${activePlayer.value?.nickname || "pemegang bom"} harus menyambung liriknya!`;
    case "defusing":
      if (showWrongPenaltyBanner.value) {
        return "AWAS!! Urutan kata salah, sumbu bom berkurang -2 detik! Tetap tenang dan susun lagi!";
      }
      if (isMyTurn.value) {
        if (isCriticalTime.value) {
          return `KRITIS (${state.currentBombTimeLeft}d)!! Cepat ketuk kata berikutnya atau gunakan HINT sebelum meledak!`;
        }
        return "Musik berhenti! Ketuk kata-kata di bawah sesuai urutan lirik berikutnya!";
      }
      if (nextTurnPlayer.value?.id === myClientId.value) {
        return `Bersiaplah! Setelah ${activePlayer.value?.nickname} selesai, bom akan dioper ke tanganmu!`;
      }
      return `${activePlayer.value?.nickname} sedang menjinakkan bom! Jangan sampai meledak!`;
    case "line_success":
      if (state.lastLifeGained) {
        return `DEFUSED!! 3x STREAK DEFUSE (+1 NYAWA PULIH) & (+${state.lastPointsEarned || 300} pts)! Bom dioper!`;
      }
      return `DEFUSED!! Lirik terjawab tepat (+${state.lastPointsEarned || 300} pts)! Bom dioper ke pemain berikutnya!`;
    case "exploded":
      return `KABOOOM!! Bom meledak di tangan ${explodedPlayer.value?.nickname}! Nyawa berkurang -1 Hati!`;
    case "song_survived":
      return "LUAR BIASA!! Seluruh segmen lagu berhasil dijinakkan! Semua pemain hidup dapat Bonus Survival +1.000 Poin!";
    case "game_over":
      if (state.winnerPlayerId && state.players[state.winnerPlayerId]) {
        return `MISSION COMPLETE!! Selamat kepada ${state.players[state.winnerPlayerId].nickname} yang bertahan sebagai juara!`;
      }
      return "Permainan selesai! Cek papan klasemen akhir dan tekan Main Lagi untuk rematch!";
    default:
      return "Bom Lirik siaga!";
  }
});

// Client-side timeupdate gate so vocals NEVER leak past stopTime or resumeEndTime
function handleAudioTimeUpdate() {
  if (!audioEl.value || !currentSegment.value) return;
  const rawTime = audioEl.value.currentTime;
  const effectiveSongTime = rawTime - userOffsetSec.value;
  currentAudioTime.value = effectiveSongTime;

  const status = lbState.value?.status;
  if (status === "playing") {
    const cutoff = currentSegment.value.stopTime + userOffsetSec.value;
    if (rawTime >= cutoff && !audioEl.value.paused) {
      audioEl.value.pause();
    }
  } else if (status === "line_success") {
    const rewardEnd = currentSegment.value.resumeEndTime + userOffsetSec.value;
    if (rawTime >= rewardEnd && !audioEl.value.paused) {
      audioEl.value.pause();
    }
  }
}

function setupSegmentAudio(segIdx: number) {
  if (!shouldPlayAudio.value || !audioEl.value || !lbState.value?.currentSong || !currentSegment.value) return;

  const song = lbState.value.currentSong;
  const segment = currentSegment.value;
  const streamUrl = getStreamUrl(song.videoId, "yt");
  const isNewSong = currentLoadedVideoId.value !== song.videoId;

  isAudioBuffering.value = !lbState.value.isAudioReady;

  if (isNewSong) {
    currentLoadedVideoId.value = song.videoId;
    audioEl.value.src = streamUrl;
  }

  const targetTime = Math.max(0, segment.leadInStartTime + userOffsetSec.value);
  currentAudioTime.value = segment.leadInStartTime;

  const onCanPlay = () => {
    if (!audioEl.value || lbState.value?.status !== "playing") return;
    try {
      if (Math.abs(audioEl.value.currentTime - targetTime) > 0.25) {
        audioEl.value.currentTime = targetTime;
      }
    } catch (e) {
      console.warn("[LyricBomb] Seek error:", e);
    }

    // Mengirim sinyal audioReady ke backend
    jukeboxClient.signalLyricBombAudioReady(segIdx);

    // Jika backend mengabarkan isAudioReady telah terpenuhi, jalankan pemutaran
    if (lbState.value?.isAudioReady && audioEl.value.paused) {
      startAudiblePlayback();
    }
  };

  if (isNewSong || audioEl.value.readyState < 2) {
    audioEl.value.addEventListener("canplay", onCanPlay, { once: true });
    audioEl.value.load();
  } else {
    onCanPlay();
  }
}

function startAudiblePlayback() {
  if (!audioEl.value || !shouldPlayAudio.value) return;
  isAudioBuffering.value = false;
  const segment = currentSegment.value;
  if (segment) {
    const targetTime = Math.max(0, segment.leadInStartTime + userOffsetSec.value);
    try {
      if (Math.abs(audioEl.value.currentTime - targetTime) > 0.45) {
        audioEl.value.currentTime = targetTime;
      }
    } catch {}
  }

  const playPromise = audioEl.value.play();
  if (playPromise) {
    playPromise
      .then(() => {
        isAutoplayBlocked.value = false;
      })
      .catch((err) => {
        console.warn("[LyricBomb] Autoplay prevented, butuh interaksi:", err);
        isAutoplayBlocked.value = true;
      });
  }
}

// Watch jika server mengonfirmasi audioReady pada segmen aktif
watch(
  () => lbState.value?.isAudioReady,
  (ready) => {
    if (ready && lbState.value?.status === "playing" && shouldPlayAudio.value) {
      startAudiblePlayback();
    }
  }
);

// Watch both status AND currentSegmentIndex so consecutive segments always re-arm audio
watch(
  [() => lbState.value?.status, () => lbState.value?.currentSegmentIndex],
  ([newStatus, newSegIdx], [oldStatus, oldSegIdx]) => {
    if (newStatus === "playing") {
      if (
        (newStatus !== oldStatus || newSegIdx !== oldSegIdx) &&
        shouldPlayAudio.value &&
        lbState.value?.currentSong &&
        currentSegment.value &&
        typeof newSegIdx === "number"
      ) {
        setupSegmentAudio(newSegIdx);
      }
    } else if (newStatus === "defusing" && oldStatus !== "defusing") {
      if (audioEl.value) {
        audioEl.value.pause();
      }
      isAudioBuffering.value = false;
      personaAudio.playReady(); // Alert chime
      if (isMyTurn.value && "vibrate" in navigator) {
        try {
          navigator.vibrate([150, 100, 150]);
        } catch {}
      }
    } else if (newStatus === "line_success" && oldStatus !== "line_success") {
      // Audio reward: Play the target line vocal that was just solved!
      if (shouldPlayAudio.value && audioEl.value && currentSegment.value) {
        try {
          audioEl.value.currentTime = Math.max(0, currentSegment.value.resumeStartTime + userOffsetSec.value);
          audioEl.value.play().catch((err) => console.warn("[LyricBomb] Reward audio play prevented:", err));
        } catch {}
      }
      personaAudio.playCriticalHit();
    } else if (newStatus === "exploded" && oldStatus !== "exploded") {
      if (audioEl.value) {
        audioEl.value.pause();
      }
      personaAudio.playMiss();
      if (isMyTurn.value && "vibrate" in navigator) {
        try {
          navigator.vibrate([250, 100, 250]);
        } catch {}
      }
    } else if (newStatus === "song_survived" && oldStatus !== "song_survived") {
      if (audioEl.value) {
        audioEl.value.pause();
      }
      personaAudio.playAllOutAttack();
    } else if (newStatus === "picking_song" && oldStatus !== "picking_song") {
      if (audioEl.value) {
        audioEl.value.pause();
      }
      if (isPicker.value) {
        personaAudio.playReady();
      }
    } else if (newStatus === "idle" || newStatus === "game_over") {
      if (audioEl.value) {
        audioEl.value.pause();
        isAutoplayBlocked.value = false;
      }
      if (newStatus === "game_over" && oldStatus !== "game_over") {
        personaAudio.playAllOutAttack();
      }
    }
  }
);

// Ticking SFX during bomb countdown
watch(
  () => lbState.value?.currentBombTimeLeft,
  (timeLeft, prevTime) => {
    if (
      lbState.value?.status === "defusing" &&
      typeof timeLeft === "number" &&
      typeof prevTime === "number" &&
      timeLeft < prevTime &&
      timeLeft > 0
    ) {
      if (timeLeft <= 6 || isMyTurn.value) {
        personaAudio.playTick();
      }
    }
  }
);

// Watch wrong-tap events to trigger red shake & penalty banner
watch(
  () => lbState.value?.lastWrongTap?.timestamp,
  (ts) => {
    if (!ts || !lbState.value?.lastWrongTap) return;
    const wt = lbState.value.lastWrongTap;
    wrongTapChipId.value = wt.chipId;
    isShakingWrong.value = true;
    showWrongPenaltyBanner.value = true;
    personaAudio.playMiss();

    if (wrongTapTimer) clearTimeout(wrongTapTimer);
    wrongTapTimer = setTimeout(() => {
      isShakingWrong.value = false;
      wrongTapChipId.value = null;
      showWrongPenaltyBanner.value = false;
    }, 900);
  }
);

// Watch player audio issue reports so Host hears an alert sound
watch(
  () => lbState.value?.audioIssueReports?.length || 0,
  (newCount, oldCount) => {
    if (isHost.value && newCount > (oldCount || 0)) {
      personaAudio.playMiss();
    }
  }
);

function handleReportAudioIssue() {
  if (isHost.value || hasReportedAudioIssue.value) return;
  jukeboxClient.reportLyricBombAudioIssue();
  personaAudio.playCursor();
}

function handleSkipSongByHost() {
  if (!isHost.value) return;
  if (audioEl.value) {
    audioEl.value.pause();
  }
  jukeboxClient.skipLyricBombSong();
  personaAudio.playSelect();
}

function handleToggleReady() {
  if (!myPlayer.value) return;
  primeAudio();
  jukeboxClient.setLyricBombReady(!myPlayer.value.isReady);
  personaAudio.playCursor();
}

function handleJoinFromModal() {
  primeAudio();
  jukeboxClient.joinLyricBomb();
  personaAudio.playSelect();
}

function handleToggleHostPlaying() {
  primeAudio();
  jukeboxClient.setLyricBombHostPlaying(!isHostPlaying.value);
  personaAudio.playCursor();
}

const startingDurationPresets = [15, 18, 22, 28];

function handleSelectStartingDuration(dur: number) {
  if (!isHost.value) return;
  jukeboxClient.setLyricBombStartingDuration(dur);
  personaAudio.playSelect();
}

function handleAdjustStartingDuration(delta: number) {
  if (!isHost.value) return;
  const current = lbState.value?.startingBombDuration ?? 18;
  const next = Math.max(10, Math.min(40, current + delta));
  jukeboxClient.setLyricBombStartingDuration(next);
  personaAudio.playCursor();
}

function handleStartGame() {
  primeAudio();
  jukeboxClient.startLyricBomb();
  personaAudio.playSelect();
}

function handleSelectSong(song: any) {
  primeAudio();
  isSongPickerOpen.value = false;
  jukeboxClient.selectLyricBombSong(song);
  personaAudio.playSelect();
}

function handleRandomSong() {
  primeAudio();
  isSongPickerOpen.value = false;
  jukeboxClient.pickRandomLyricBombSong();
  personaAudio.playSelect();
}

function handleTapWord(chipId: string) {
  if (!isMyTurn.value || lbState.value?.status !== "defusing") return;
  jukeboxClient.tapLyricBombWord(chipId);
  personaAudio.playSelect();
}

function handleUseHint() {
  if (!canUseHint.value) return;
  jukeboxClient.useLyricBombHint();
  personaAudio.playReady();
}

function handleResetWords() {
  if (!isMyTurn.value) return;
  jukeboxClient.resetLyricBombWords();
  personaAudio.playCursor();
}

function handleRematch() {
  primeAudio();
  jukeboxClient.rematchLyricBomb();
  personaAudio.playSelect();
}

function handleClose() {
  if (isHost.value) {
    jukeboxClient.closeLyricBomb();
  } else {
    jukeboxClient.leaveLyricBomb();
  }
  if (audioEl.value) {
    audioEl.value.pause();
    isAutoplayBlocked.value = false;
  }
  emit("close");
}

onMounted(() => {
  const savedChoice = localStorage.getItem("lyricbomb_speaker_choice") as "host" | "self" | null;
  if (savedChoice === "self") {
    speakerChoice.value = "self";
    showSpeakerPrompt.value = false;
    jukeboxClient.setLyricBombAudioMode("self");
  } else if (savedChoice === "host") {
    speakerChoice.value = "host";
    showSpeakerPrompt.value = false;
    jukeboxClient.setLyricBombAudioMode("host");
  } else if (!isHost.value) {
    showSpeakerPrompt.value = true;
    jukeboxClient.setLyricBombAudioMode("host");
  }
});

watch(
  () => props.isOpen,
  (open) => {
    if (open && !isHost.value) {
      const saved = localStorage.getItem("lyricbomb_speaker_choice");
      if (!saved) {
        showSpeakerPrompt.value = true;
      }
    }
    if (!open && audioEl.value) {
      audioEl.value.pause();
      isAutoplayBlocked.value = false;
    }
  }
);

onBeforeUnmount(() => {
  if (wrongTapTimer) clearTimeout(wrongTapTimer);
  if (audioEl.value) {
    audioEl.value.pause();
    audioEl.value.src = "";
  }
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md select-none"
  >
    <!-- Hidden Audio Player with precision timeupdate cutoff gating -->
    <audio
      ref="audioEl"
      class="hidden"
      preload="auto"
      @timeupdate="handleAudioTimeUpdate"
    ></audio>

    <div
      class="relative bg-[#10101c] border-2 border-white w-full max-w-4xl h-[93vh] max-h-[860px] flex flex-col rounded-3xl shadow-[10px_10px_0px_#000] overflow-hidden transition-all"
      :class="{
        'ring-4 ring-rose-600': isMyTurn && lbState?.status === 'defusing',
        'animate-shake-wrong': isShakingWrong,
      }"
      style="transform: skewX(-1deg);"
    >
      <!-- HEADER -->
      <div class="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-[#18182a] border-b-2 border-white/20 flex items-center justify-between gap-2.5 shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#e60012] text-white flex items-center justify-center font-black border border-white text-lg sm:text-xl shadow-[2px_2px_0px_#000] shrink-0">
            💣
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h1 class="text-sm sm:text-xl font-black italic uppercase tracking-wider text-white truncate">
                LYRIC BOMB // BOM LIRIK
              </h1>
              <span class="px-2 py-0.5 bg-[#e60012] text-white text-[10px] font-black uppercase tracking-wider border border-white shrink-0" style="transform: skewX(-8deg);">
                R{{ lbState?.roundNumber || 1 }}
              </span>
            </div>
            <p class="text-[10px] sm:text-[11px] font-mono text-cyan-400 truncate">
              {{ lbState?.status === 'lobby' ? 'LOBBY PERMAINAN' : 'SURVIVAL BOM WAKTU MUSIK' }}
            </p>
          </div>
        </div>

        <!-- Quick Sync Calibration, Speaker Switcher, Audio Feedback & Close -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <!-- Host Only: Skip Broken/Missing Audio Song Button -->
          <button
            v-if="isHost && isActiveSongPhase"
            type="button"
            @click="handleSkipSongByHost"
            class="px-2.5 py-1.5 rounded-xl border text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            :class="
              audioIssueReports.length > 0
                ? 'bg-amber-400 hover:bg-amber-300 text-black border-white animate-pulse shadow-[2px_2px_0px_#000]'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/60'
            "
            title="Musik tidak keluar / rusak? Skip lagu ini dan pilih lagu baru tanpa mengurangi nyawa pemain"
          >
            <span>⏭️</span>
            <span class="uppercase text-[10px] tracking-wider">Musik Gak Ada / Skip</span>
            <span
              v-if="audioIssueReports.length > 0"
              class="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black border border-white"
            >
              {{ audioIssueReports.length }}!
            </span>
          </button>

          <!-- Player Only: Alert Host about Missing Audio -->
          <button
            v-else-if="!isHost && isActiveSongPhase"
            type="button"
            :disabled="hasReportedAudioIssue"
            @click="handleReportAudioIssue"
            class="px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            :class="
              hasReportedAudioIssue
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 cursor-default'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/60'
            "
            :title="hasReportedAudioIssue ? 'Alert sudah dikirim ke Host' : 'Kirim alert ke Host bahwa musik tidak terdengar'"
          >
            <span>{{ hasReportedAudioIssue ? '✓' : '🔇' }}</span>
            <span class="uppercase text-[10px] tracking-wider">
              {{ hasReportedAudioIssue ? 'Dilaporkan ke Host' : 'Musik Gak Ada? Lapor Host' }}
            </span>
          </button>

          <!-- Speaker Indicator / Switcher (Non-Host) -->
          <button
            v-if="!isHost"
            type="button"
            class="px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            :class="isHeadsetEnabled ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 hover:bg-cyan-500/30' : 'bg-black/50 text-slate-300 border-white/20 hover:bg-white/10'"
            :title="isHeadsetEnabled ? 'Suara berputar di HP (Klik untuk ganti ke Speaker Host)' : 'Mendengarkan via Speaker Host (Klik untuk ganti ke HP)'"
            @click="toggleSpeakerChoice"
          >
            <span>{{ isHeadsetEnabled ? '🎧' : '📢' }}</span>
            <span class="hidden sm:inline uppercase text-[10px] tracking-wider">{{ isHeadsetEnabled ? 'HP AUDIO' : 'HOST SPEAKER' }}</span>
          </button>
          <!-- Speaker Indicator (Host) -->
          <div
            v-else
            class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/20 text-[10px] font-mono text-emerald-300 uppercase tracking-wider"
            title="Komputer Host terhubung ke speaker utama ruangan"
          >
            <span>🔊</span>
            <span>SPEAKER RUANGAN</span>
          </div>

          <!-- Quick Sync Nudge Control -->
          <div
            v-if="lbState?.currentSong"
            class="flex items-center gap-1 bg-black/50 px-2 py-1 rounded-xl border border-white/20 text-xs font-mono"
            title="Kalibrasi timing lirik terhadap audio"
          >
            <span class="text-slate-400 text-[9px] uppercase tracking-wider hidden md:inline">SYNC:</span>
            <button
              type="button"
              @click="adjustOffset(-0.25)"
              class="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-black flex items-center justify-center cursor-pointer transition-colors"
              title="Perlambat audio (-0.25s)"
            >
              -
            </button>
            <span
              class="px-1 text-[10px] sm:text-xs font-black min-w-8 text-center"
              :class="userOffsetSec !== 0 ? 'text-amber-400' : 'text-slate-300'"
            >
              {{ userOffsetSec > 0 ? `+${userOffsetSec}s` : `${userOffsetSec}s` }}
            </span>
            <button
              type="button"
              @click="adjustOffset(0.25)"
              class="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white font-black flex items-center justify-center cursor-pointer transition-colors"
              title="Percepat audio (+0.25s)"
            >
              +
            </button>
            <button
              v-if="userOffsetSec !== 0"
              type="button"
              @click="resetOffset"
              class="text-[9px] text-slate-400 hover:text-amber-300 underline cursor-pointer ml-0.5"
            >
              reset
            </button>
          </div>

          <button
            type="button"
            @click="handleClose"
            class="px-2.5 py-1.5 sm:px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider border border-white rounded-lg transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <UiIcon name="x" class="w-4 h-4" />
            <span class="hidden sm:inline">{{ isHost ? 'Tutup Game' : 'Keluar' }}</span>
          </button>
        </div>
      </div>

      <!-- JUKE-CHAN NAVIGATOR COMMENTARY STRIP -->
      <div class="px-3.5 py-2 sm:px-6 bg-[#131324] border-b border-white/15 flex items-center gap-3 shrink-0">
        <div class="shrink-0">
          <JukeChanMini sizeClasses="w-9 h-9 sm:w-10 sm:h-10" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 bg-[#00e5ff] text-black text-[9px] font-black uppercase tracking-wider">
              NAVI // JUKE-CHAN
            </span>
            <span
              v-if="myPlayer && myPlayer.score > 0"
              class="text-[10px] font-mono font-bold text-amber-300"
            >
              ★ {{ myPlayer.score.toLocaleString() }} PTS
              <template v-if="myPlayer.streak > 1"> · 🔥 x{{ myPlayer.streak }}</template>
            </span>
          </div>
          <p class="text-xs text-slate-200 font-medium truncate mt-0.5">
            {{ navigatorSpeech }}
          </p>
        </div>
      </div>

      <!-- MAIN ARENA -->
      <div class="flex-1 overflow-y-auto p-3.5 sm:p-6 flex flex-col justify-between gap-4">
        <!-- Host Alert Banner when Players report missing audio -->
        <div
          v-if="isHost && isActiveSongPhase && audioIssueReports.length > 0"
          class="p-2.5 bg-amber-400 border-2 border-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[3px_3px_0px_#000] rounded-xl shrink-0"
          style="transform: skewX(-1deg);"
        >
          <div class="flex items-center gap-2 text-xs font-black text-black">
            <span class="text-base">🔇</span>
            <span>
              Alert Pemain ({{ audioIssueReports.map((r) => r.nickname).join(", ") }}): Musik tidak terdengar / rusak!
            </span>
          </div>
          <button
            type="button"
            class="px-3 py-1.5 bg-[#e60012] hover:bg-rose-500 text-white font-black text-xs uppercase border border-white cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95 rounded-lg shrink-0"
            @click="handleSkipSongByHost"
          >
            ⏭️ Skip Lagu Ini Sekarang
          </button>
        </div>

        <!-- Autoplay Blocked Banner if applicable -->
        <div
          v-if="isAutoplayBlocked && shouldPlayAudio"
          class="p-2.5 bg-[#e60012] border-2 border-white flex items-center justify-between gap-2 shadow-[3px_3px_0px_#000] animate-bounce rounded-xl shrink-0"
          style="transform: skewX(-2deg);"
        >
          <div class="flex items-center gap-2 text-xs font-black text-white">
            <span>🔊</span>
            <span>Audio tertahan browser! Ketuk untuk membunyikan suara musik:</span>
          </div>
          <button
            type="button"
            class="px-3 py-1 bg-white text-black font-black text-xs uppercase border border-black cursor-pointer shadow-[2px_2px_0px_#000] active:scale-95 rounded shrink-0"
            @click="unblockAudio"
          >
            Bunyikan Musik 🎵
          </button>
        </div>

        <!-- 1. LOBBY VIEW -->
        <div v-if="lbState?.status === 'lobby'" class="flex-1 flex flex-col justify-between gap-5 py-1">
          <div class="text-center space-y-2">
            <h2 class="text-xl sm:text-2xl font-black italic uppercase text-white tracking-wide">
              Menunggu Rekan Kantor Bergabung
            </h2>
            <p class="text-xs sm:text-sm text-slate-300 font-mono max-w-lg mx-auto">
              Musik akan berhenti mendadak! Susun kata lirik berikutnya sebelum bom meledak di tanganmu!
            </p>

            <!-- Host Participation Toggle & Bomb Starter Duration -->
            <div class="pt-1 flex flex-col items-center gap-2.5">
              <div v-if="isHost" class="flex justify-center">
                <button
                  type="button"
                  @click="handleToggleHostPlaying"
                  class="px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer"
                  :class="isHostPlaying ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400' : 'bg-amber-500/20 text-amber-300 border-amber-400'"
                >
                  <span>{{ isHostPlaying ? '🎮 Host Ikut Bermain (Peserta)' : '📺 Host Mode Layar / Speaker Ruangan (Spectator)' }}</span>
                  <span class="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white uppercase">Ubah</span>
                </button>
              </div>

              <!-- Starter Bomb Timer Setting -->
              <div class="bg-black/50 border border-white/15 px-3.5 py-2 rounded-2xl flex flex-wrap items-center justify-center gap-2.5 shadow-inner">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs">⏱️</span>
                  <span class="text-[10px] sm:text-[11px] font-mono text-slate-300 uppercase tracking-wider">Durasi Bom Awal:</span>
                  <span class="text-xs sm:text-sm font-black font-mono text-rose-400">
                    {{ lbState?.startingBombDuration ?? 18 }}s
                  </span>
                </div>

                <!-- Host Controls: Presets & Steppers -->
                <div v-if="isHost" class="flex items-center gap-1.5">
                  <div class="flex items-center gap-1">
                    <button
                      v-for="dur in startingDurationPresets"
                      :key="dur"
                      type="button"
                      @click="handleSelectStartingDuration(dur)"
                      class="px-2 py-0.5 rounded-lg border text-[10px] font-mono font-black transition-all cursor-pointer"
                      :class="
                        (lbState?.startingBombDuration ?? 18) === dur
                          ? 'bg-[#e60012] text-white border-white shadow-[1px_1px_0px_#000]'
                          : 'bg-white/5 text-slate-400 border-white/20 hover:bg-white/15'
                      "
                    >
                      {{ dur }}s
                    </button>
                  </div>

                  <div class="flex items-center gap-1 ml-0.5 border-l border-white/20 pl-1.5">
                    <button
                      type="button"
                      :disabled="(lbState?.startingBombDuration ?? 18) <= 10"
                      @click="handleAdjustStartingDuration(-1)"
                      class="w-5 h-5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-mono font-black text-xs flex items-center justify-center border border-white/20 cursor-pointer active:scale-95"
                      title="-1 detik"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      :disabled="(lbState?.startingBombDuration ?? 18) >= 40"
                      @click="handleAdjustStartingDuration(1)"
                      class="w-5 h-5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-mono font-black text-xs flex items-center justify-center border border-white/20 cursor-pointer active:scale-95"
                      title="+1 detik"
                    >
                      +
                    </button>
                  </div>
                </div>

                <!-- Non-host Client view -->
                <div v-else class="text-[10px] font-mono text-cyan-400">
                  (Diatur Host)
                </div>
              </div>
            </div>
          </div>

          <!-- Roster Grid -->
          <div v-if="playerList.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-2xl mx-auto w-full">
            <div
              v-for="p in playerList"
              :key="p.id"
              class="bg-[#18182c] border-2 p-3 rounded-2xl flex flex-col items-center gap-2 text-center transition-all shadow-sm"
              :class="p.isReady ? 'border-emerald-400 bg-emerald-950/20' : 'border-white/30'"
            >
              <div class="w-11 h-11 rounded-full bg-slate-800 border-2 border-white/50 flex items-center justify-center text-base font-black text-white">
                {{ p.nickname.slice(0, 2).toUpperCase() }}
              </div>
              <div class="w-full">
                <h4 class="text-xs font-black text-white truncate">{{ p.nickname }}</h4>
                <div class="flex justify-center gap-1 mt-1 text-xs">
                  <span v-for="i in p.hp" :key="i" class="text-rose-500">❤️</span>
                </div>
              </div>
              <span
                class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border"
                :class="p.isReady ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400' : 'bg-slate-700/40 text-slate-400 border-slate-600'"
              >
                {{ p.isReady ? 'SIAP' : 'BELUM SIAP' }}
              </span>
            </div>
          </div>
          <div v-else class="py-8 text-center text-slate-400 font-mono text-xs">
            Belum ada peserta di arena. Scan QR atau klik tombol Gabung di bawah!
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 border-t border-white/10">
            <button
              v-if="myPlayer"
              type="button"
              @click="handleToggleReady"
              class="w-full sm:w-auto px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider border-2 border-white transition-all shadow-sm cursor-pointer"
              :class="myPlayer.isReady ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-emerald-500 hover:bg-emerald-400 text-black'"
            >
              {{ myPlayer.isReady ? 'Batal Siap' : 'Saya Siap! ✓' }}
            </button>
            <button
              v-else-if="!isHost"
              type="button"
              @click="handleJoinFromModal"
              class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-wider border-2 border-white transition-all shadow-[4px_4px_0px_#000] cursor-pointer"
            >
              Gabung Arena Sekarang! 🔥
            </button>

            <button
              v-if="isHost"
              type="button"
              :disabled="playerList.length < 1"
              @click="handleStartGame"
              class="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-[#e60012] hover:bg-rose-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider border-2 border-white transition-all shadow-[4px_4px_0px_#000] cursor-pointer"
            >
              Mulai Game Bom Lirik 🔥 ({{ playerList.length }} Pemain)
            </button>
          </div>
        </div>

        <!-- 2. PICKING SONG VIEW -->
        <div v-else-if="lbState?.status === 'picking_song' || lbState?.status === 'song_loading'" class="flex-1 flex flex-col items-center justify-center text-center gap-5 py-4">
          <div class="relative">
            <div class="w-20 h-20 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-4xl animate-bounce">
              🎵
            </div>
            <span
              v-if="lbState?.pickerTimeLeft != null"
              class="absolute -bottom-2 -right-3 px-2 py-0.5 rounded-lg bg-[#e60012] border border-white text-white font-mono font-black text-xs shadow-sm"
            >
              {{ lbState.pickerTimeLeft }}s
            </span>
            <span
              v-else-if="lbState?.status === 'picking_song'"
              class="absolute -bottom-2 -right-3 px-2 py-0.5 rounded-lg bg-cyan-400 border border-white text-black font-mono font-black text-[10px] shadow-sm uppercase tracking-wide"
            >
              DJ PICK
            </span>
          </div>

          <div class="space-y-2 max-w-md">
            <h3 class="text-xl font-black italic uppercase text-white">
              Ronde {{ lbState?.roundNumber }} — Saatnya Memilih Lagu!
            </h3>
            <p v-if="isPicker" class="text-sm text-cyan-300 font-mono">
              Kamu terpilih memilih lagu! Pilih dari Office Playlist, Cari Lagu Baru, atau biarkan sistem memilih acak.
            </p>
            <p v-else class="text-sm text-slate-400 font-mono">
              Menunggu <span class="text-white font-black">{{ pickerPlayer?.nickname || 'rekan kantor' }}</span> menentukan lagu...
            </p>
          </div>

          <div v-if="isPicker && lbState?.status === 'picking_song'" class="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              @click="isSongPickerOpen = true"
              class="px-7 py-3 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs sm:text-sm uppercase tracking-wider border-2 border-white shadow-[5px_5px_0px_#000] transition-all cursor-pointer active:scale-95"
            >
              PILIH LAGU SEKARANG 🔍
            </button>

            <button
              type="button"
              @click="handleRandomSong"
              class="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs sm:text-sm uppercase tracking-wider border-2 border-white shadow-[5px_5px_0px_#000] transition-all cursor-pointer active:scale-95"
            >
              🎲 SURPRISE ME (ACAK)
            </button>
          </div>

          <!-- Host Force Random Button when another player is taking too long -->
          <div v-else-if="isHost && lbState?.status === 'picking_song'" class="flex flex-col items-center gap-2">
            <button
              type="button"
              @click="handleRandomSong"
              class="px-6 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs sm:text-sm uppercase tracking-wider border-2 border-white shadow-[4px_4px_0px_#000] transition-all cursor-pointer active:scale-95 flex items-center gap-2"
            >
              <span>🎲</span>
              <span>Paksa Acak Lagu (Host DJ)</span>
            </button>
            <p class="text-[11px] text-slate-400 font-mono">
              Tekan jika {{ pickerPlayer?.nickname || 'pemilih lagu' }} terlalu lama menentukan lagu.
            </p>
          </div>

          <div v-if="lbState?.status === 'song_loading'" class="flex flex-col items-center gap-2 text-cyan-400 font-mono text-xs">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Memvalidasi lirik & menyiapkan buffer audio...</span>
            </div>
          </div>
        </div>

        <!-- 3. ACTIVE GAMEPLAY: PLAYING / DEFUSING / LINE SUCCESS -->
        <div v-else-if="lbState?.status === 'playing' || lbState?.status === 'defusing' || lbState?.status === 'line_success'" class="flex-1 min-h-0 flex flex-col justify-between gap-3 overflow-hidden">
          <!-- Top Song & Turn-Order Conveyor HUD -->
          <div class="bg-[#181828] border-2 border-white/20 p-2.5 sm:p-3.5 rounded-2xl space-y-2 shrink-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div class="flex items-center gap-3 overflow-hidden">
                <img
                  v-if="lbState?.currentSong?.albumArt"
                  :src="lbState.currentSong.albumArt"
                  class="w-11 h-11 rounded-xl object-cover border border-white/20 shrink-0"
                />
                <div class="overflow-hidden">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono text-cyan-400 uppercase">
                      SEGMEN {{ (lbState?.currentSegmentIndex || 0) + 1 }} / {{ lbState?.currentSong?.segments.length || 1 }}
                    </span>
                    <span
                      v-if="isAudioBuffering && lbState?.status === 'playing'"
                      class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 animate-pulse"
                    >
                      Menyelaraskan Audio...
                    </span>
                  </div>
                  <h4 class="text-sm sm:text-base font-black text-white truncate">{{ lbState?.currentSong?.title }}</h4>
                  <p class="text-xs text-slate-400 truncate">{{ lbState?.currentSong?.artist }}</p>
                </div>
              </div>

              <!-- Spotlight Pemegang Bom & Next in Line -->
              <div class="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl border border-white/10 shrink-0">
                <div class="flex flex-col text-right">
                  <span class="text-[9px] font-mono uppercase text-slate-400">PEMEGANG BOM:</span>
                  <span class="text-xs sm:text-sm font-black text-white" :class="isMyTurn ? 'text-rose-400 animate-pulse' : ''">
                    {{ isMyTurn ? '🔥 KAMU SENDIRI!' : activePlayer?.nickname }}
                  </span>
                  <span v-if="nextTurnPlayer" class="text-[10px] font-mono text-cyan-300">
                    Next → {{ nextTurnPlayer.id === myClientId ? 'KAMU!' : nextTurnPlayer.nickname }}
                  </span>
                </div>
                <div
                  class="w-9 h-9 rounded-full bg-rose-600 border border-white flex items-center justify-center font-black text-white text-sm"
                  :class="lbState?.status === 'defusing' ? 'animate-bounce' : ''"
                >
                  💣
                </div>
              </div>
            </div>

            <!-- Turn-Order Conveyor Pills -->
            <div class="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-white/10">
              <span class="text-[9px] font-mono uppercase text-slate-400 shrink-0 mr-1">URUTAN GILIRAN:</span>
              <template v-for="(p, idx) in turnOrderPlayers" :key="p.id">
                <div
                  class="px-2.5 py-1 rounded-xl border text-[11px] font-mono flex items-center gap-1.5 shrink-0 transition-all"
                  :class="
                    p.id === lbState?.activePlayerId
                      ? 'bg-[#e60012] text-white border-white font-black shadow-[2px_2px_0px_#000]'
                      : 'bg-black/40 text-slate-300 border-white/15'
                  "
                >
                  <span v-if="p.id === lbState?.activePlayerId">💣</span>
                  <span class="truncate max-w-24">{{ p.nickname }}</span>
                  <span class="text-[10px]">{{ '❤️'.repeat(p.hp) }}</span>
                  <span v-if="p.streak > 1" class="text-[9px] text-amber-300 font-black">🔥x{{ p.streak }}</span>
                </div>
                <span v-if="idx < turnOrderPlayers.length - 1" class="text-slate-500 text-xs font-black shrink-0">→</span>
              </template>
            </div>
          </div>

          <!-- Bomb Timer & Fuse Bar Gauge -->
          <div class="flex flex-col items-center justify-center py-1 relative">
            <div
              class="w-full max-w-md relative flex flex-col items-center justify-center px-6 py-4 rounded-3xl border-2 transition-all shadow-[6px_6px_0px_#000]"
              :class="
                isCriticalTime
                  ? 'bg-rose-950/70 border-rose-400 scale-105'
                  : lbState?.status === 'defusing'
                  ? 'bg-rose-950/40 border-rose-500'
                  : 'bg-[#18182a] border-white/20'
              "
            >
              <div class="flex items-center gap-2">
                <span class="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-slate-300">
                  {{
                    lbState?.status === 'playing'
                      ? '🎧 DENGARKAN LIRIK PENGANTAR...'
                      : lbState?.status === 'line_success'
                      ? '✨ BOM BERHASIL DIJINAKKAN!'
                      : '⏱️ WAKTU MENYUSUN KATA'
                  }}
                </span>
              </div>

              <div
                class="text-4xl sm:text-5xl font-black font-mono tracking-tighter my-0.5"
                :class="
                  isCriticalTime
                    ? 'text-rose-400 animate-pulse'
                    : lbState?.status === 'defusing'
                    ? 'text-rose-300'
                    : lbState?.status === 'line_success'
                    ? 'text-emerald-400'
                    : 'text-white'
                "
              >
                00:{{ lbState?.currentBombTimeLeft !== undefined ? String(lbState.currentBombTimeLeft).padStart(2, '0') : '00' }}
              </div>

              <!-- Dynamic Bomb Fuse Progress Bar -->
              <div class="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/20 mt-1.5">
                <div
                  class="h-full transition-all duration-300 rounded-full"
                  :class="
                    bombFusePercent <= 28
                      ? 'bg-[#e60012]'
                      : bombFusePercent <= 55
                      ? 'bg-amber-400'
                      : 'bg-[#00e5ff]'
                  "
                  :style="{ width: `${bombFusePercent}%` }"
                ></div>
              </div>

              <!-- Wrong Tap Penalty Floating Alert -->
              <div
                v-if="showWrongPenaltyBanner"
                class="mt-2 px-3 py-0.5 rounded-full bg-[#e60012] border border-white text-white text-[11px] font-black uppercase tracking-wider animate-bounce"
              >
                ⚠️ SALAH URUTAN! -{{ lbState?.lastWrongTap?.penaltySec || 2 }} DETIK!
              </div>
            </div>
          </div>

          <!-- Karaoke Display (Timed Lead-in Context + Target Mystery Line) -->
          <div class="bg-[#141424] border-2 border-white/30 p-3 sm:p-4 rounded-2xl text-center space-y-2.5 shadow-inner max-h-[38vh] sm:max-h-[290px] overflow-y-auto pr-1 custom-scrollbar">
            <!-- Timed Lead-in lines -->
            <div
              v-if="currentSegment?.leadInLines && currentSegment.leadInLines.length > 0"
              class="space-y-1.5 mb-2 border-b border-white/10 pb-2.5"
            >
              <span class="text-[9px] font-mono text-cyan-400 uppercase tracking-widest block">
                LIRIK PENGANTAR (KARAOKE SYNC):
              </span>
              <div
                v-for="(line, idx) in currentSegment.leadInLines"
                :key="idx"
                class="transition-all duration-200 px-2 py-0.5 rounded-lg"
                :class="
                  lbState?.status === 'playing' && idx === activeLeadInIndex
                    ? 'text-white font-black text-sm sm:text-base bg-cyan-500/15 border border-cyan-400/30 scale-[1.01]'
                    : 'text-slate-400 text-xs sm:text-sm italic opacity-75'
                "
              >
                <p>"{{ line.text }}"</p>
                <p v-if="line.romaji && line.romaji !== line.text" class="text-[11px] font-mono text-cyan-300 not-italic">
                  {{ line.romaji }}
                </p>
              </div>
            </div>
            <div
              v-else-if="currentSegment?.leadInTexts && currentSegment.leadInTexts.length > 0"
              class="space-y-1 mb-2 opacity-80 text-xs sm:text-sm text-slate-300 font-medium italic border-b border-white/10 pb-2"
            >
              <span class="text-[9px] font-mono text-cyan-400 uppercase tracking-widest block not-italic">
                LIRIK YANG BARU DINYANYIKAN:
              </span>
              <p v-for="(txt, idx) in currentSegment.leadInTexts" :key="idx">
                "{{ txt }}"
              </p>
            </div>

            <!-- Target Cliffhanger line / Answer Slots -->
            <div class="space-y-1.5">
              <span class="text-[10px] font-mono text-rose-400 uppercase tracking-wider font-bold block">
                {{ lbState?.status === 'line_success' ? 'LIRIK BERHASIL DIJAWAB:' : 'SAMBUNGAN LIRIK BERIKUTNYA:' }}
              </span>

              <!-- Subtitle script context (e.g. original Kanji when chips use Romaji, or translation) -->
              <p
                v-if="currentSegment?.targetDisplayScript && lbState?.status !== 'playing'"
                class="text-xs font-mono text-cyan-300"
              >
                {{ currentSegment.targetDisplayScript }}
              </p>
              <p
                v-if="currentSegment?.targetTranslation && lbState?.status !== 'playing'"
                class="text-[11px] italic text-slate-400"
              >
                "{{ currentSegment.targetTranslation }}"
              </p>

              <div v-if="lbState?.status === 'line_success'" class="space-y-1.5 max-h-24 overflow-y-auto px-1 custom-scrollbar">
                <div class="text-lg sm:text-xl font-black text-emerald-400 animate-bounce">
                  ✓ {{ currentSegment?.targetOriginalText }}
                </div>
                <div class="flex items-center justify-center gap-2 flex-wrap">
                  <div v-if="lbState?.lastPointsEarned" class="text-xs font-mono font-bold text-amber-300">
                    +{{ lbState.lastPointsEarned }} POIN!
                  </div>
                  <div
                    v-if="lbState?.lastLifeGained"
                    class="px-2.5 py-0.5 rounded-lg bg-rose-600 border border-white text-white font-mono font-black text-xs animate-bounce shadow-md"
                  >
                    ❤️ +1 NYAWA PULIH (3x STREAK)!
                  </div>
                </div>
              </div>
              <div
                v-else-if="lbState?.status === 'defusing'"
                class="text-sm sm:text-base font-mono text-white flex flex-wrap justify-center gap-2 pt-1 max-h-28 sm:max-h-36 overflow-y-auto px-1 py-0.5 custom-scrollbar"
              >
                <span
                  v-for="(w, idx) in currentSegment?.words"
                  :key="idx"
                  class="px-2.5 py-1 rounded-md border font-black transition-all"
                  :class="
                    idx < (lbState?.selectedWordIds.length || 0)
                      ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400 scale-105'
                      : idx === (lbState?.selectedWordIds.length || 0)
                      ? 'bg-rose-500/20 text-rose-200 border-rose-400 animate-pulse'
                      : 'bg-white/5 text-slate-500 border-dashed border-white/20'
                  "
                >
                  {{ idx < (lbState?.selectedWordIds.length || 0) ? w : `Bagian #${idx + 1}` }}
                </span>
              </div>
              <div v-else class="text-base sm:text-lg font-black text-slate-500 italic">
                [ ? ? ? ? ? ? ]
              </div>
            </div>
          </div>

          <!-- CONTROLLER FOR ACTIVE PLAYER (WORD CHIPS + HINT LIFELINE) -->
          <div
            v-if="isMyTurn && lbState?.status === 'defusing'"
            class="bg-[#18182e] border-2 border-rose-500 p-3 sm:p-3.5 rounded-2xl space-y-2.5 shadow-[6px_6px_0px_#e60012] shrink-0 flex flex-col max-h-[38vh] sm:max-h-[220px]"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0">
              <span class="text-rose-400 font-black uppercase flex items-center gap-1">
                <span>🔥</span> SUSUN FRASA SESUAI URUTAN ({{ (lbState?.selectedWordIds.length || 0) }}/{{ currentSegment?.words.length || 0 }}):
              </span>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  :disabled="!canUseHint"
                  @click="handleUseHint"
                  class="px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canUseHint ? 'bg-cyan-400 hover:bg-cyan-300 text-black border-white shadow-[2px_2px_0px_#000]' : 'bg-slate-800 text-slate-500 border-slate-700'"
                  title="Buka otomatis 1 kata berikutnya dengan biaya -3 detik"
                >
                  💡 Hint Kata (-3d)
                </button>

                <button
                  type="button"
                  :disabled="(lbState?.selectedWordIds.length || 0) === 0"
                  @click="handleResetWords"
                  class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-amber-300 uppercase font-bold text-[11px] border border-white/20 cursor-pointer"
                >
                  ↺ Reset
                </button>
              </div>
            </div>

            <!-- Chips Container (Scrollable if chips wrap) -->
            <div class="flex-1 min-h-0 flex flex-wrap gap-2 justify-center py-1 overflow-y-auto pr-1 custom-scrollbar">
              <button
                v-for="chip in currentSegment?.scrambledChips"
                :key="chip.id"
                type="button"
                :disabled="lbState?.selectedWordIds.includes(chip.id)"
                @click="handleTapWord(chip.id)"
                class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wide border-2 transition-all shadow-sm"
                :class="
                  lbState?.selectedWordIds.includes(chip.id)
                    ? 'bg-emerald-950/30 text-emerald-500/50 border-emerald-900/40 cursor-not-allowed scale-95'
                    : wrongTapChipId === chip.id
                    ? 'bg-[#e60012] text-white border-white scale-95'
                    : 'bg-[#252540] hover:bg-[#323258] text-white border-white hover:scale-105 active:scale-95 cursor-pointer shadow-[3px_3px_0px_#000]'
                "
              >
                {{ chip.text }}
              </button>
            </div>
          </div>

          <!-- Spectator Notice when someone else is defusing -->
          <div v-else-if="lbState?.status === 'defusing'" class="text-center py-2.5 px-3 bg-black/40 rounded-xl border border-white/10 text-xs font-mono text-slate-300">
            👀 <span class="text-white font-black">{{ activePlayer?.nickname }}</span> sedang menyusun kata di HP-nya!
            <span v-if="nextTurnPlayer" class="text-cyan-300 ml-1">
              (Bersiap: <strong class="text-white">{{ nextTurnPlayer.nickname }}</strong>!)
            </span>
          </div>
        </div>

        <!-- 4. EXPLODED VIEW -->
        <div v-else-if="lbState?.status === 'exploded'" class="flex-1 flex flex-col items-center justify-center text-center gap-5 py-6">
          <div class="text-6xl animate-bounce">
            💥
          </div>
          <div class="space-y-2 max-w-lg">
            <h2 class="text-3xl sm:text-5xl font-black italic uppercase text-rose-500 tracking-wider">
              KABOOOOM!
            </h2>
            <p class="text-sm sm:text-base font-mono text-slate-300">
              Bom meledak di tangan <span class="text-white font-black underline">{{ explodedPlayer?.nickname || 'Pemain' }}</span>!
            </p>
            <p class="text-xs font-mono text-rose-400 font-bold">
              -1 Hati! (Sisa HP: {{ explodedPlayer?.hp ?? 0 }} · {{ explodedPlayer?.isEliminated ? 'TERELIMINASI 💀' : 'MASIH BERTAHAN' }})
            </p>
            <div v-if="currentSegment?.targetOriginalText" class="mt-3 p-3 bg-white/5 border border-white/15 rounded-xl text-xs font-mono text-slate-300">
              <span class="text-[10px] text-cyan-400 uppercase block mb-0.5">JAWABAN LIRIK SEHARUSNYA:</span>
              <strong class="text-white text-sm">"{{ currentSegment.targetOriginalText }}"</strong>
            </div>
          </div>
        </div>

        <!-- 5. SONG SURVIVED VIEW -->
        <div v-else-if="lbState?.status === 'song_survived'" class="flex-1 flex flex-col items-center justify-center text-center gap-5 py-6">
          <div class="text-6xl animate-bounce">
            🎉
          </div>
          <div class="space-y-2 max-w-md">
            <h2 class="text-2xl sm:text-4xl font-black italic uppercase text-amber-400 tracking-wider">
              SONG SURVIVED!
            </h2>
            <p class="text-sm font-mono text-emerald-400 font-bold">
              Kompak banget! Seluruh lirik berhasil dijinakkan tanpa meledak!
            </p>
            <div class="p-3 bg-emerald-500/20 border border-emerald-400 rounded-xl text-xs font-mono text-white mt-2">
              ⭐ SEMUA PEMAIN HIDUP MENDAPATKAN BONUS SURVIVAL +1.000 POIN! ⭐
            </div>
          </div>
        </div>

        <!-- 6. GAME OVER PODIUM VIEW -->
        <div v-else-if="lbState?.status === 'game_over'" class="flex-1 flex flex-col items-center justify-between gap-5 py-3">
          <div class="text-center space-y-1.5">
            <div class="text-5xl">👑</div>
            <h2 class="text-2xl sm:text-4xl font-black italic uppercase text-amber-400 tracking-wider">
              PERMAINAN SELESAI!
            </h2>
            <p v-if="lbState.winnerPlayerId && lbState.players[lbState.winnerPlayerId]" class="text-sm sm:text-base font-mono text-white">
              Juara Bertahan: <span class="text-amber-300 font-black underline">{{ lbState.players[lbState.winnerPlayerId].nickname }}</span>!
            </p>
            <p v-else class="text-xs sm:text-sm font-mono text-slate-400">
              Seluruh sumbu bom telah meledak! Berikut peringkat akhir misi Bom Lirik:
            </p>
          </div>

          <!-- Podium Standings List -->
          <div class="w-full max-w-2xl space-y-2 overflow-y-auto max-h-72 pr-1">
            <div
              v-for="entry in podiumList"
              :key="entry.id"
              class="flex items-center justify-between gap-3 p-3 rounded-2xl border-2 transition-all"
              :class="
                entry.rank === 1
                  ? 'bg-amber-500/15 border-amber-400 shadow-[4px_4px_0px_#000]'
                  : entry.rank === 2
                  ? 'bg-slate-300/10 border-slate-300/60'
                  : entry.rank === 3
                  ? 'bg-amber-700/15 border-amber-600/60'
                  : 'bg-[#181828] border-white/15'
              "
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-black/50 border border-white/30 flex items-center justify-center font-black text-sm text-white shrink-0">
                  {{ entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}` }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="text-xs sm:text-sm font-black text-white truncate">{{ entry.nickname }}</h4>
                    <span
                      class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border"
                      :class="!entry.isEliminated && entry.hp > 0 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50' : 'bg-rose-500/20 text-rose-300 border-rose-400/40'"
                    >
                      {{ !entry.isEliminated && entry.hp > 0 ? `BERTAHAN (${'❤️'.repeat(entry.hp)})` : 'TERELIMINASI' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 text-[10px] font-mono text-slate-300 mt-0.5">
                    <span>💣 {{ entry.defusalCount }} Jinak</span>
                    <span>🔥 Streak Maks x{{ entry.maxStreak }}</span>
                    <span>💥 {{ entry.explosionsTaken }} Ledakan</span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="text-sm sm:text-base font-black font-mono text-amber-300">
                  {{ entry.score.toLocaleString() }}
                </div>
                <div class="text-[9px] font-mono text-slate-400 uppercase">POIN</div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              v-if="isHost"
              type="button"
              @click="handleRematch"
              class="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs uppercase tracking-wider rounded-xl border-2 border-white shadow-[4px_4px_0px_#000] cursor-pointer active:scale-95 transition-all"
            >
              🔄 Main Lagi (Rematch)
            </button>

            <button
              type="button"
              @click="handleClose"
              class="px-6 py-2.5 bg-[#e60012] hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl border-2 border-white shadow-[4px_4px_0px_#000] cursor-pointer active:scale-95 transition-all"
            >
              {{ isHost ? 'Tutup Game' : 'Keluar Arena' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Song Picker Submodal -->
    <LyricBombSongPickerModal
      :isOpen="isSongPickerOpen"
      @close="isSongPickerOpen = false"
      @selectSong="handleSelectSong"
      @randomSong="handleRandomSong"
    />

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
          class="w-full max-w-md p-5 sm:p-6 bg-[#0b0b14] border-4 border-white shadow-[8px_8px_0px_#000] flex flex-col text-center space-y-4 rounded-3xl"
          style="transform: skewX(-2deg);"
        >
          <div
            class="w-12 h-12 bg-[#e60012] border-2 border-white flex items-center justify-center text-2xl mx-auto shadow-[3px_3px_0px_#000] rounded-xl"
            style="transform: rotate(-3deg);"
          >
            🎧
          </div>

          <div class="space-y-1">
            <h3 class="text-base sm:text-lg font-black uppercase italic tracking-wider text-white">
              PILIH JALUR SUARA BOM LIRIK
            </h3>
            <p class="text-xs text-slate-300 leading-relaxed">
              Ingin mendengarkan musik pengiring bom dari mana? Kamu bisa mengubahnya kapan saja di menu atas.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <!-- Option 1: Speaker Host -->
            <button
              type="button"
              class="p-4 bg-black hover:bg-white text-white hover:text-black border-2 border-white flex flex-col items-center justify-center gap-1.5 transition cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95 rounded-2xl"
              style="transform: skewX(-4deg);"
              @click="setSpeakerChoice('host')"
            >
              <span class="text-2xl">📢</span>
              <span class="text-xs font-black uppercase">Speaker Host</span>
              <span class="text-[10px] opacity-80 text-center leading-tight">Dengar dari speaker utama ruangan</span>
            </button>

            <!-- Option 2: Speaker Sendiri -->
            <button
              type="button"
              class="p-4 bg-[#00e5ff] hover:bg-white text-black border-2 border-white flex flex-col items-center justify-center gap-1.5 transition cursor-pointer shadow-[3px_3px_0px_#000] active:scale-95 rounded-2xl"
              style="transform: skewX(-4deg);"
              @click="setSpeakerChoice('self')"
            >
              <span class="text-2xl">🔊</span>
              <span class="text-xs font-black uppercase">Speaker Sendiri</span>
              <span class="text-[10px] text-black/80 text-center leading-tight">Putar musik di HP / earphone</span>
            </button>
          </div>

          <div class="text-[10px] font-mono text-slate-400 pt-1">
            Tips: Pilih "Speaker Sendiri" jika kamu berada jauh dari speaker komputer Host.
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@keyframes shakeWrong {
  0%, 100% { transform: skewX(-1deg) translateX(0); }
  20% { transform: skewX(-1deg) translateX(-10px); }
  40% { transform: skewX(-1deg) translateX(10px); }
  60% { transform: skewX(-1deg) translateX(-7px); }
  80% { transform: skewX(-1deg) translateX(7px); }
}
.animate-shake-wrong {
  animation: shakeWrong 0.38s ease-in-out;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #e60012;
}
</style>

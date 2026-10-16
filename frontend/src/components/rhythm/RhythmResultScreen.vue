<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { RhythmScoreEntry, RhythmScoreSubmission } from "../../shared/types.ts";
import { fetchTrackLeaderboard, submitRhythmScore } from "../../shared/api.ts";
import { jukeboxClient } from "../../shared/ws.ts";

const props = defineProps<{
  submission: RhythmScoreSubmission;
  onPlayAgain: () => void;
  onClose: () => void;
}>();

const leaderboard = ref<RhythmScoreEntry[]>([]);
const isSubmitting = ref(false);
const hasSubmitted = ref(false);
const submitError = ref("");
const isNewRecord = ref(false);

const gradeColors: Record<string, string> = {
  SS: "from-amber-300 via-yellow-400 to-amber-500 text-yellow-950 shadow-amber-400/50",
  S: "from-amber-400 to-yellow-500 text-yellow-950 shadow-yellow-500/40",
  A: "from-emerald-400 to-teal-500 text-teal-950 shadow-emerald-500/40",
  B: "from-cyan-400 to-blue-500 text-blue-950 shadow-cyan-500/40",
  C: "from-purple-400 to-pink-500 text-purple-950 shadow-purple-500/40",
  D: "from-rose-500 to-red-600 text-white shadow-rose-500/40",
};

onMounted(async () => {
  await loadLeaderboard();
  // Auto-submit score on result screen
  await doSubmitScore();
});

async function loadLeaderboard() {
  try {
    leaderboard.value = await fetchTrackLeaderboard(props.submission.trackId, 5);
  } catch (err) {
    console.warn("Failed to load leaderboard:", err);
  }
}

async function doSubmitScore() {
  if (hasSubmitted.value || isSubmitting.value) return;
  isSubmitting.value = true;
  submitError.value = "";

  try {
    const res = await submitRhythmScore(props.submission);
    hasSubmitted.value = true;
    isNewRecord.value = res.isNewRecord;
    await loadLeaderboard();
    if (res.isNewRecord) {
      jukeboxClient.addToast(`👑 REKOR BARU! Peringkat #1 untuk ${props.submission.trackTitle}!`, "success");
    } else {
      jukeboxClient.addToast(`Skor berhasil dicatat ke Leaderboard!`, "success");
    }
  } catch (err: any) {
    submitError.value = err.message || "Gagal mengirim skor";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center p-4 sm:p-6 max-w-xl mx-auto w-full text-white animate-in fade-in zoom-in-95 duration-200">
    <!-- Grade Letter Badge -->
    <div class="relative mb-4 flex items-center justify-center">
      <div
        class="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br flex items-center justify-center font-black text-5xl sm:text-6xl shadow-2xl transition-transform transform hover:scale-105"
        :class="gradeColors[submission.grade] || gradeColors.D"
      >
        {{ submission.grade }}
      </div>
      <div
        v-if="isNewRecord"
        class="absolute -top-3 -right-3 bg-amber-400 text-black text-xs font-black px-2.5 py-1 rounded-full shadow-lg border border-amber-300 animate-bounce"
      >
        👑 NEW #1 RECORD
      </div>
    </div>

    <!-- Track Title & Player -->
    <h2 class="text-xl sm:text-2xl font-black text-center truncate max-w-md">
      {{ submission.trackTitle }}
    </h2>
    <p class="text-xs sm:text-sm text-neutral-400 font-medium mb-3">
      {{ submission.trackArtist }} • <span class="text-indigo-400 font-bold uppercase">{{ submission.difficulty }}</span>
    </p>

    <!-- Score & Main Stats -->
    <div class="text-3xl sm:text-4xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-300 to-fuchsia-400 tracking-wider mb-4">
      {{ submission.score.toLocaleString() }}
    </div>

    <div class="grid grid-cols-2 gap-3 w-full max-w-sm mb-5">
      <div class="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-3 text-center">
        <div class="text-xs text-neutral-400 font-semibold uppercase">Accuracy</div>
        <div class="text-xl font-bold font-mono text-emerald-400">
          {{ submission.accuracy }}%
        </div>
      </div>
      <div class="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-3 text-center">
        <div class="text-xs text-neutral-400 font-semibold uppercase">Max Combo</div>
        <div class="text-xl font-bold font-mono text-cyan-400">
          {{ submission.maxCombo }}x
        </div>
      </div>
    </div>

    <!-- Judgement Breakdown Table -->
    <div class="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3 text-xs mb-5">
      <div class="text-center p-1.5 rounded-lg bg-neutral-800/50">
        <div class="text-cyan-400 font-bold">300 MAX</div>
        <div class="font-mono font-black text-sm">{{ submission.hits300 }}</div>
      </div>
      <div class="text-center p-1.5 rounded-lg bg-neutral-800/50">
        <div class="text-emerald-400 font-bold">200</div>
        <div class="font-mono font-black text-sm">{{ submission.hits200 }}</div>
      </div>
      <div class="text-center p-1.5 rounded-lg bg-neutral-800/50">
        <div class="text-purple-400 font-bold">100</div>
        <div class="font-mono font-black text-sm">{{ submission.hits100 }}</div>
      </div>
      <div class="text-center p-1.5 rounded-lg bg-neutral-800/50">
        <div class="text-amber-400 font-bold">50</div>
        <div class="font-mono font-black text-sm">{{ submission.hits50 }}</div>
      </div>
      <div class="text-center p-1.5 rounded-lg bg-neutral-800/50 col-span-2 sm:col-span-1">
        <div class="text-rose-400 font-bold">MISS</div>
        <div class="font-mono font-black text-sm">{{ submission.misses }}</div>
      </div>
    </div>

    <!-- Song Leaderboard Mini-Preview -->
    <div v-if="leaderboard.length > 0" class="w-full max-w-md mb-6">
      <div class="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
        <span>🏆 Top Leaderboard Lagu Ini</span>
        <span>Skor</span>
      </div>
      <div class="space-y-1.5">
        <div
          v-for="(entry, idx) in leaderboard"
          :key="entry.id"
          class="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border"
          :class="
            entry.nickname === submission.nickname && Math.abs(entry.score - submission.score) < 5
              ? 'bg-indigo-950/80 border-indigo-500/60 text-white'
              : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-300'
          "
        >
          <div class="flex items-center gap-2 truncate">
            <span class="font-bold text-neutral-500 w-4">{{ idx + 1 }}.</span>
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-black"
              :class="
                entry.grade === 'SS' || entry.grade === 'S'
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'bg-neutral-800 text-neutral-400'
              "
            >
              {{ entry.grade }}
            </span>
            <span class="truncate font-semibold">{{ entry.nickname }}</span>
          </div>
          <div class="font-mono font-bold text-neutral-200">
            {{ entry.score.toLocaleString() }}
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-3 w-full max-w-md">
      <button
        @click="onPlayAgain"
        class="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 transition-all text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
      >
        <span>🔄 Main Lagi</span>
      </button>
      <button
        @click="onClose"
        class="py-3 px-5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all text-neutral-300 hover:text-white font-bold text-sm border border-neutral-700 cursor-pointer"
      >
        Tutup
      </button>
    </div>
  </div>
</template>

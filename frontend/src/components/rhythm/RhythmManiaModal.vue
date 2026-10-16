<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { QueueTrack, RhythmBeatmap, RhythmScoreSubmission } from "../../shared/types.ts";
import { fetchBeatmap } from "../../shared/api.ts";
import { jukeboxClient } from "../../shared/ws.ts";
import { RhythmManiaEngine } from "./RhythmManiaEngine.ts";
import RhythmResultScreen from "./RhythmResultScreen.vue";

const props = defineProps<{
  isOpen: boolean;
  track: QueueTrack | null;
  isPlaying: boolean;
  currentTime: number;
  nickname: string;
  onClose: () => void;
}>();

// Difficulty selection
type Difficulty = "easy" | "normal" | "hard";
const difficulty = ref<Difficulty>("normal");

// Canvas & Engine
const canvasRef = ref<HTMLCanvasElement | null>(null);
let engine: RhythmManiaEngine | null = null;
let animFrameId: number | null = null;

// UI States
const isLoadingMap = ref(false);
const mapError = ref("");
const isSettingsOpen = ref(false);
const offsetCalibration = ref<number>(
  Number(localStorage.getItem("rhythm_audio_offset") || "0")
);
const currentKeybinds = ref(["D", "F", "J", "K"]);

// Result Screen State
const showResultScreen = ref(false);
const lastSubmission = ref<RhythmScoreSubmission | null>(null);

// Track Transition Prompt
const showTrackChangedDialog = ref(false);
const pendingNextTrack = ref<QueueTrack | null>(null);

// Active touches mapping: pointerId -> lane index
const activePointers = new Map<number, number>();

// Track lane colors (Classic osu!mania: Outer = Cyan, Inner = Magenta)
const LANE_COLORS = ["#38bdf8", "#f472b6", "#f472b6", "#38bdf8"];
const LANE_GLOW = ["rgba(56, 189, 248, 0.4)", "rgba(244, 114, 182, 0.4)", "rgba(244, 114, 182, 0.4)", "rgba(56, 189, 248, 0.4)"];

// Responsive Canvas Size
const canvasWidth = ref(400);
const canvasHeight = ref(700);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      nextTick(() => {
        initGame();
      });
    } else {
      stopGame();
    }
  }
);

// Watch for song skips / changes by DJ while playing
watch(
  () => props.track?.id,
  (newId, oldId) => {
    if (props.isOpen && oldId && newId && newId !== oldId && engine && engine.isRunning) {
      if (engine.score > 1000) {
        showTrackChangedDialog.value = true;
        pendingNextTrack.value = props.track;
      } else {
        // Just reload for new track
        loadBeatmapForTrack();
      }
    }
  }
);

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", handleResize);

  if (props.isOpen) {
    nextTick(() => {
      initGame();
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("resize", handleResize);
  stopGame();
});

function handleResize() {
  if (!canvasRef.value) return;
  const container = canvasRef.value.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  canvasWidth.value = Math.min(480, Math.max(300, rect.width));
  canvasHeight.value = Math.max(500, rect.height);
}

function initGame() {
  handleResize();
  showResultScreen.value = false;
  showTrackChangedDialog.value = false;

  // Initialize engine with local audio time getter
  engine = new RhythmManiaEngine(() => {
    return props.currentTime;
  });
  engine.offsetMs = offsetCalibration.value;

  loadBeatmapForTrack();
}

async function loadBeatmapForTrack() {
  if (!props.track?.id || !engine) return;

  isLoadingMap.value = true;
  mapError.value = "";
  showTrackChangedDialog.value = false;

  try {
    const beatmap = await fetchBeatmap(
      props.track.id,
      difficulty.value,
      props.track.duration || 180
    );

    // Pass current room song time so notes sync perfectly with room playback!
    engine.loadBeatmap(beatmap, props.currentTime);
    startGameLoop();
  } catch (err: any) {
    mapError.value = err.message || "Gagal memuat beatmap lagu";
  } finally {
    isLoadingMap.value = false;
  }
}

function startGameLoop() {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
}

function stopGame() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (engine) {
    engine.destroy();
    engine = null;
  }
}

function gameLoop() {
  if (!engine) return;

  // Update engine physics and hit checks
  engine.update();

  // Render to canvas
  renderCanvas();

  // Check if finished
  if (engine.isFinished && !showResultScreen.value) {
    showResultScreen.value = true;
    lastSubmission.value = engine.getSubmission(
      props.track?.id || "unknown",
      props.track?.title || "Unknown Title",
      props.track?.artist || "Unknown Artist",
      props.track?.thumbnail,
      jukeboxClient.clientId.value,
      props.nickname
    );
    return;
  }

  animFrameId = requestAnimationFrame(gameLoop);
}

function renderCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !engine) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const laneW = w / 4;
  const hitLineY = h - 90; // Hit receptor line
  const noteHeight = 18;

  ctx.clearRect(0, 0, w, h);

  // 1. Draw 4 Lanes Background & Dividers
  for (let l = 0; l < 4; l++) {
    const x = l * laneW;
    const isDown = engine.laneKeysDown[l];

    // Lane column background
    ctx.fillStyle = isDown
      ? "rgba(255, 255, 255, 0.08)"
      : l % 2 === 0
      ? "rgba(15, 23, 42, 0.4)"
      : "rgba(23, 23, 35, 0.4)";
    ctx.fillRect(x, 0, laneW, h);

    // Column dividers
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Hit Receptor Button at bottom
    ctx.fillStyle = isDown ? LANE_COLORS[l] : "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.roundRect(x + 4, hitLineY, laneW - 8, 14, 4);
    ctx.fill();

    // Key label inside receptor
    ctx.fillStyle = isDown ? "#000" : "rgba(255, 255, 255, 0.4)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(currentKeybinds.value[l], x + laneW / 2, hitLineY + 11);
  }

  // 2. Draw Hit Receptor Line Glow
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY);
  ctx.lineTo(w, hitLineY);
  ctx.stroke();

  // 3. Draw Active Falling Notes
  const currentTime = engine.getCurrentTime();
  const speed = engine.scrollSpeed;

  for (let i = 0; i < engine.activeNotes.length; i++) {
    const an = engine.activeNotes[i];
    if (an.hit || an.missed) continue;

    // Calculate Y from absolute time delta:
    // y = hitLineY - (noteTime - currentTime) * speed
    const delta = an.note.time - currentTime;
    const y = hitLineY - delta * speed;

    // Only draw if visible on screen
    if (y >= -noteHeight && y <= h) {
      const lane = an.note.lane;
      const x = lane * laneW + 4;
      const nw = laneW - 8;

      // Note glow & bar
      ctx.fillStyle = LANE_COLORS[lane];
      ctx.shadowColor = LANE_COLORS[lane];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(x, y - noteHeight, nw, noteHeight, 6);
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow

      // Bright inner core
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.beginPath();
      ctx.roundRect(x + 3, y - noteHeight + 3, nw - 6, 4, 2);
      ctx.fill();
    }
  }

  // 4. Draw Hit Column Glow Effects
  for (const eff of engine.hitEffects) {
    const x = eff.lane * laneW;
    const grad = ctx.createLinearGradient(0, hitLineY, 0, hitLineY - 120);
    grad.addColorStop(0, LANE_GLOW[eff.lane]);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(x, hitLineY - 120, laneW, 120);
  }

  // 5. Draw Combo Counter in Center Area
  if (engine.combo > 3) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "900 36px monospace";
    ctx.fillText(`${engine.combo}`, w / 2, h * 0.45);

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("COMBO", w / 2, h * 0.45 + 18);
  }

  // 6. Draw Floating Judgment Feedback
  const now = performance.now();
  for (const j of engine.floatingJudges) {
    const age = (now - j.timestamp) / 1000;
    const alpha = Math.max(0, 1 - age * 1.4);
    const floatY = h * 0.52 - age * 30;

    ctx.textAlign = "center";
    ctx.fillStyle = j.color;
    ctx.globalAlpha = alpha;
    ctx.font = "900 20px sans-serif";
    ctx.fillText(j.text, w / 2, floatY);
    ctx.globalAlpha = 1.0;
  }

  // 7. Draw Countdown Overlay (3 - 2 - 1 - GO!)
  if (engine.inCountdown) {
    const num = engine.countdownNumber;
    const text = num > 0 ? `${num}` : "GO!";
    const color = num === 3 ? "#f97316" : num === 2 ? "#fbbf24" : num === 1 ? "#38bdf8" : "#4ade80";

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.font = num > 0 ? "900 72px sans-serif" : "900 64px sans-serif";
    ctx.fillText(text, w / 2, h * 0.42);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(num > 0 ? "SIAP-SIAP..." : "MULAI!", w / 2, h * 0.42 + 45);
  }
}

// Keyboard Input Handling (Desktop)
function handleKeyDown(e: KeyboardEvent) {
  if (!props.isOpen || !engine || e.repeat) return;
  const key = e.key.toUpperCase();

  let lane = -1;
  if (key === currentKeybinds.value[0]) lane = 0;
  else if (key === currentKeybinds.value[1]) lane = 1;
  else if (key === currentKeybinds.value[2]) lane = 2;
  else if (key === currentKeybinds.value[3]) lane = 3;

  if (lane !== -1) {
    e.preventDefault();
    engine.pressLane(lane as 0 | 1 | 2 | 3);
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (!props.isOpen || !engine) return;
  const key = e.key.toUpperCase();

  let lane = -1;
  if (key === currentKeybinds.value[0]) lane = 0;
  else if (key === currentKeybinds.value[1]) lane = 1;
  else if (key === currentKeybinds.value[2]) lane = 2;
  else if (key === currentKeybinds.value[3]) lane = 3;

  if (lane !== -1) {
    e.preventDefault();
    engine.releaseLane(lane as 0 | 1 | 2 | 3);
  }
}

// Touch & Pointer Input Handling (Mobile & Tablet)
function handlePointerDown(e: PointerEvent) {
  if (!canvasRef.value || !engine) return;
  e.preventDefault();

  const rect = canvasRef.value.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  const laneW = rect.width / 4;
  const lane = Math.max(0, Math.min(3, Math.floor(relX / laneW))) as 0 | 1 | 2 | 3;

  activePointers.set(e.pointerId, lane);
  engine.pressLane(lane);
}

function handlePointerUp(e: PointerEvent) {
  if (!engine) return;
  e.preventDefault();

  const lane = activePointers.get(e.pointerId);
  if (lane !== undefined) {
    engine.releaseLane(lane as 0 | 1 | 2 | 3);
    activePointers.delete(e.pointerId);
  }
}

function handlePointerCancel(e: PointerEvent) {
  handlePointerUp(e);
}

function saveOffset(val: number) {
  offsetCalibration.value = val;
  localStorage.setItem("rhythm_audio_offset", val.toString());
  if (engine) engine.offsetMs = val;
}

function changeDifficulty(newDiff: Difficulty) {
  if (difficulty.value === newDiff) return;
  difficulty.value = newDiff;
  loadBeatmapForTrack();
}

function submitPartialAndContinueNext() {
  if (!engine || !pendingNextTrack.value) return;
  lastSubmission.value = engine.getSubmission(
    props.track?.id || "unknown",
    props.track?.title || "Unknown Title",
    props.track?.artist || "Unknown Artist",
    props.track?.thumbnail,
    jukeboxClient.clientId.value,
    props.nickname
  );
  showTrackChangedDialog.value = false;
  showResultScreen.value = true;
}

function skipToNextTrackImmediately() {
  showTrackChangedDialog.value = false;
  loadBeatmapForTrack();
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl select-none touch-none overscroll-none animate-in fade-in duration-200"
  >
    <!-- RESULT SCREEN -->
    <RhythmResultScreen
      v-if="showResultScreen && lastSubmission"
      :submission="lastSubmission"
      :onPlayAgain="() => { showResultScreen = false; loadBeatmapForTrack(); }"
      :onClose="onClose"
    />

    <!-- ACTIVE GAMEPLAY CONTAINER -->
    <div
      v-else
      class="relative w-full h-full max-w-lg flex flex-col items-center justify-between overflow-hidden"
    >
      <!-- Top HUD Header -->
      <div class="w-full px-4 pt-3 pb-2 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <!-- Track Info -->
        <div class="flex items-center gap-2.5 truncate max-w-[50%]">
          <img
            v-if="track?.thumbnail"
            :src="track.thumbnail"
            class="w-9 h-9 rounded-xl object-cover shrink-0 border border-neutral-700"
          />
          <div class="truncate">
            <div class="font-black text-xs sm:text-sm text-white truncate">{{ track?.title || "Mania 4K" }}</div>
            <div class="text-[11px] text-neutral-400 truncate">{{ track?.artist || "IsThisOurJukebox" }}</div>
          </div>
        </div>

        <!-- Live Score & Accuracy -->
        <div class="text-right">
          <div class="font-mono font-black text-base sm:text-lg text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-fuchsia-300">
            {{ (engine?.score || 0).toLocaleString() }}
          </div>
          <div class="text-xs font-mono font-bold text-emerald-400">
            {{ (engine?.accuracy || 100).toFixed(2) }}%
          </div>
        </div>

        <!-- Controls: Settings & Exit -->
        <div class="flex items-center gap-1.5 ml-2">
          <button
            @click="isSettingsOpen = !isSettingsOpen"
            class="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-xs text-neutral-300 cursor-pointer"
            title="Pengaturan & Kalibrasi"
          >
            ⚙️
          </button>
          <button
            @click="onClose"
            class="w-8 h-8 rounded-full bg-neutral-800 hover:bg-rose-900 flex items-center justify-center text-xs text-neutral-300 hover:text-white cursor-pointer"
            title="Keluar"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Health (HP) Bar -->
      <div class="w-full px-4 z-10">
        <div class="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-500 transition-all duration-150"
            :style="{ width: `${engine?.hp || 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Difficulty Selector Pills -->
      <div class="z-10 flex items-center gap-1.5 my-1 bg-neutral-900/80 p-1 rounded-xl border border-neutral-800 text-[11px] font-bold">
        <button
          v-for="d in (['easy', 'normal', 'hard'] as Difficulty[])"
          :key="d"
          @click="changeDifficulty(d)"
          class="px-2.5 py-0.5 rounded-lg capitalize transition-all cursor-pointer"
          :class="difficulty === d ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-white'"
        >
          {{ d }}
        </button>
      </div>

      <!-- MAIN 4-LANE CANVAS -->
      <div class="relative flex-1 w-full flex items-center justify-center overflow-hidden">
        <canvas
          ref="canvasRef"
          :width="canvasWidth"
          :height="canvasHeight"
          class="h-full max-w-full touch-none select-none"
          @pointerdown="handlePointerDown"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerCancel"
        ></canvas>

        <!-- Loading Overlay -->
        <div
          v-if="isLoadingMap"
          class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white"
        >
          <div class="text-3xl animate-spin mb-3">💿</div>
          <div class="font-bold text-sm">Menyiapkan Beatmap 4K...</div>
        </div>

        <!-- Error Overlay -->
        <div
          v-if="mapError"
          class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center text-white"
        >
          <div class="text-3xl mb-2">⚠️</div>
          <div class="font-bold text-rose-400 mb-3">{{ mapError }}</div>
          <button
            @click="loadBeatmapForTrack"
            class="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold"
          >
            Coba Lagi
          </button>
        </div>
      </div>

      <!-- Mobile Touch Helper Bar (Shows 4 Columns explicitly for mobile users) -->
      <div class="w-full grid grid-cols-4 gap-1 p-2 bg-black/60 border-t border-neutral-900 sm:hidden">
        <div
          v-for="(key, l) in currentKeybinds"
          :key="l"
          class="py-3.5 rounded-xl text-center font-black text-sm border transition-all"
          :class="
            engine?.laneKeysDown[l]
              ? 'bg-cyan-500/30 border-cyan-400 text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400'
          "
        >
          {{ key }}
        </div>
      </div>

      <!-- Settings / Calibration Drawer -->
      <div
        v-if="isSettingsOpen"
        class="absolute inset-x-4 top-16 z-30 bg-neutral-900 border border-neutral-700 rounded-2xl p-4 text-white shadow-2xl animate-in fade-in zoom-in-95"
      >
        <div class="flex items-center justify-between pb-2 border-b border-neutral-800 mb-3">
          <h3 class="font-bold text-sm">⚙️ Pengaturan & Kalibrasi Audio</h3>
          <button @click="isSettingsOpen = false" class="text-xs text-neutral-400 hover:text-white cursor-pointer">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <div class="flex justify-between font-semibold mb-1">
              <span>Audio Offset:</span>
              <span class="font-mono text-cyan-400">{{ offsetCalibration > 0 ? `+${offsetCalibration}` : offsetCalibration }} ms</span>
            </div>
            <input
              type="range"
              min="-150"
              max="150"
              step="5"
              v-model.number="offsetCalibration"
              @change="saveOffset(offsetCalibration)"
              class="w-full accent-indigo-500"
            />
            <p class="text-[10px] text-neutral-400 mt-0.5">
              Geser ke kanan (+) jika menggunakan earphone Bluetooth/TWS untuk kompensasi delay.
            </p>
          </div>

          <div>
            <div class="font-semibold mb-1">Tombol Keyboard (PC):</div>
            <div class="text-[11px] text-neutral-300 font-mono bg-neutral-800 p-2 rounded-lg">
              Kolom 1: <b>D</b> • Kolom 2: <b>F</b> • Kolom 3: <b>J</b> • Kolom 4: <b>K</b>
            </div>
          </div>
        </div>
      </div>

      <!-- DJ Song Changed Alert Dialog -->
      <div
        v-if="showTrackChangedDialog"
        class="absolute inset-x-4 bottom-20 z-40 bg-neutral-900/95 border border-amber-500/60 rounded-3xl p-4 shadow-2xl text-white animate-in zoom-in-95"
      >
        <div class="flex items-center gap-2 text-amber-400 font-black text-sm mb-1">
          <span>⚠️</span>
          <span>Lagu Telah Diganti oleh DJ!</span>
        </div>
        <p class="text-xs text-neutral-300 mb-3">
          DJ telah mengganti lagu antrean ke: <b>{{ pendingNextTrack?.title }}</b>.
          Skor Anda saat ini: <b>{{ (engine?.score || 0).toLocaleString() }}</b> (Combo {{ engine?.maxCombo }}x).
        </p>
        <div class="flex gap-2">
          <button
            @click="submitPartialAndContinueNext"
            class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-xs cursor-pointer"
          >
            Submit Skor Lagu Ini
          </button>
          <button
            @click="skipToNextTrackImmediately"
            class="py-2 px-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-bold text-xs text-neutral-300 cursor-pointer"
          >
            Lanjut Lagu Baru
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

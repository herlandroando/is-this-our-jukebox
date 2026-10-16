<script setup lang="ts">
import { computed } from "vue";
import type { TriviaGameState } from "../../shared/types.ts";
import UiIcon from "../UiIcon.vue";

const props = withDefaults(
  defineProps<{
    isDjOrHost?: boolean;
    triviaState?: TriviaGameState | null;
    showOsuMode?: boolean;
  }>(),
  {
    isDjOrHost: false,
    triviaState: null,
    showOsuMode: true,
  }
);

const emit = defineEmits<{
  (e: "openTrivia"): void;
  (e: "openRhythm"): void;
  (e: "openLeaderboard"): void;
}>();

const isTriviaActive = computed(() => {
  return props.triviaState && props.triviaState.status !== "idle";
});

const triviaPlayerCount = computed(() => {
  if (!props.triviaState?.players) return 0;
  return Object.keys(props.triviaState.players).length;
});
</script>

<template>
  <div class="persona-game-catalog flex flex-col gap-5 text-slate-100 select-none">
    <!-- Sci-Fi HUD Tag & Header Banner -->
    <div
      class="bg-[#141424] border-2 border-white/30 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-[4px_4px_0px_#000]"
      style="transform: skewX(-2deg);"
    >
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-[#e60012] animate-pulse"></span>
        <div class="flex flex-col">
          <span class="text-xs sm:text-sm font-black italic tracking-wide text-white uppercase flex items-center gap-2">
            <span>OFFICE ARCADE // MINIGAME CENTER</span>
          </span>
          <span class="text-[10px] font-mono text-cyan-400">Pilih game seru untuk dimainkan bersama rekan kantor secara langsung!</span>
        </div>
      </div>
      <span class="px-2.5 py-0.5 bg-[#e60012] text-white text-[10px] font-black uppercase tracking-wider border border-white shrink-0" style="transform: skewX(-8deg);">
        LIVE INTERACTIVE
      </span>
    </div>

    <!-- Games Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- 1. FEATURED GAME: TEBAK LAGU (TRIVIA) -->
      <div
        class="relative bg-[#141424] border-2 border-white p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:border-[#e60012] group shadow-[6px_6px_0px_#000]"
        style="transform: skewX(-2deg);"
      >
        <!-- Card Badge -->
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 bg-[#e60012] text-white font-black text-[10px] uppercase tracking-wider border border-white">
            🔥 UTAMA // MULTIPLAYER
          </span>

          <span
            v-if="isTriviaActive"
            class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>{{ triviaState?.status === 'lobby' ? 'LOBBY BUKA' : 'GAME BERLANGSUNG' }} ({{ triviaPlayerCount }} P)</span>
          </span>
          <span
            v-else
            class="text-[10px] font-mono text-slate-400 uppercase tracking-wider"
          >
            [SIAP DIMAINKAN]
          </span>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <div class="w-9 h-9 rounded-lg bg-[#e60012] text-white flex items-center justify-center font-black border border-white shadow-sm">
              🎮
            </div>
            <div>
              <h3 class="text-base font-black italic uppercase text-white tracking-wide group-hover:text-pink-400 transition-colors">
                Tebak Lagu (Trivia)
              </h3>
              <span class="text-[10px] font-mono text-cyan-400 tracking-wider">MUSIC TRIVIA SHOWDOWN</span>
            </div>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed mt-1">
            Uji wawasan musikmu! Tebak judul lagu & artis potongan audio secara real-time bersama seluruh kantor.
          </p>
        </div>

        <!-- Action Button -->
        <button
          type="button"
          class="w-full h-11 bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-[4px_4px_0px_#000]"
          style="transform: skewX(-8deg);"
          @click="emit('openTrivia')"
        >
          <span class="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-black">X</span>
          <span>{{ isTriviaActive ? 'GABUNG TEBAK LAGU' : isDjOrHost ? 'BUKA GAME TEBAK LAGU' : 'LIHAT STATUS TRIVIA' }}</span>
        </button>
      </div>

      <!-- 2. RHYTHM MANIA (osu!mania 4-Key) -->
      <div
        v-if="showOsuMode"
        class="relative bg-[#141424] border-2 border-white p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:border-[#00e5ff] group shadow-[6px_6px_0px_#000]"
        style="transform: skewX(-2deg);"
      >
        <!-- Card Badge -->
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 bg-[#00e5ff] text-black font-black text-[10px] uppercase tracking-wider border border-white">
            ⚡ 4-KEY RHYTHM
          </span>
          <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            [SOLO / HIGHSCORE]
          </span>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <div class="w-9 h-9 rounded-lg bg-[#00e5ff] text-black flex items-center justify-center font-black border border-white shadow-sm">
              🎹
            </div>
            <div>
              <h3 class="text-base font-black italic uppercase text-white tracking-wide group-hover:text-cyan-400 transition-colors">
                osu!mania 4K
              </h3>
              <span class="text-[10px] font-mono text-cyan-400 tracking-wider">RHYTHM BEAT ENGINE</span>
            </div>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed mt-1">
            Ketik tuts [D][F][J][K] mengikuti irama melodi lagu yang sedang diputar di jukebox dan catat skor tertinggimu.
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex-1 h-11 bg-[#00e5ff] hover:bg-white text-black border-2 border-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-[4px_4px_0px_#000]"
            style="transform: skewX(-8deg);"
            @click="emit('openRhythm')"
          >
            <span class="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-black">X</span>
            <span>MAIN 4K</span>
          </button>

          <button
            type="button"
            class="h-11 px-3 bg-amber-400 hover:bg-white text-black border-2 border-white font-black text-xs uppercase flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-[4px_4px_0px_#000]"
            style="transform: skewX(-8deg);"
            title="Papan Peringkat"
            @click="emit('openLeaderboard')"
          >
            <UiIcon name="crown" :size="14" />
          </button>
        </div>
      </div>

      <!-- 3. UPCOMING GAME SLOT (FUTURE EXPANSION) -->
      <div
        class="relative bg-[#0d0d18] border-2 border-dashed border-white/30 p-4 sm:p-5 flex flex-col justify-between gap-4 opacity-85 hover:opacity-100 transition-all shadow-[6px_6px_0px_#000]"
        style="transform: skewX(-2deg);"
      >
        <!-- Card Badge -->
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 bg-white/10 text-slate-300 font-mono font-black text-[10px] uppercase tracking-wider border border-white/20">
            SLOT GAME BARU
          </span>
          <span class="text-[10px] font-mono text-purple-400 uppercase tracking-wider">
            [COMING SOON]
          </span>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <div class="w-9 h-9 rounded-lg bg-white/10 text-white flex items-center justify-center font-black border border-white/20">
              🎲
            </div>
            <div>
              <h3 class="text-base font-black italic uppercase text-slate-300 tracking-wide">
                Next Minigame
              </h3>
              <span class="text-[10px] font-mono text-slate-500 tracking-wider">SYSTEM EXPANSION READY</span>
            </div>
          </div>

          <p class="text-xs text-slate-400 leading-relaxed mt-1">
            Katalog Game disiapkan untuk menyatukan game baru kantor berikutnya (Tebak Artis, Karaoke Battle, Wheel of Fortune, dll).
          </p>
        </div>

        <!-- Disabled Button -->
        <div
          class="w-full h-11 bg-white/5 border-2 border-white/20 text-slate-500 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed"
          style="transform: skewX(-8deg);"
        >
          <span>🔒 SEGERA HADIR</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import { reactionSoundEngine } from "../shared/useReactionSound.ts";
import type { MemberRole, ReactionBroadcastItem, ShoutoutBroadcastItem } from "../shared/types.ts";
import UiIcon from "./UiIcon.vue";

const props = withDefaults(
  defineProps<{
    positionClass?: string;
    allowSound?: boolean;
    compact?: boolean;
  }>(),
  {
    positionClass: "bottom-24 sm:bottom-28 right-4 sm:right-6",
    allowSound: true,
    compact: false,
  }
);

const emit = defineEmits<{
  (e: "milestone", payload: { combo: number; emoji: string }): void;
}>();

interface MainParticle {
  id: string;
  emoji: string;
  combo: number;
  xOffset: number;
  rotation: number;
  scale: number;
  duration: number;
}

interface SecondaryParticle {
  id: string;
  glyph: string;
  xOffset: number;
  yOffset: number;
  rotation: number;
  scale: number;
  duration: number;
}

interface ConfettiPiece {
  id: string;
  vx: number;
  vy: number;
  rot: number;
  color: string;
  shape: "rect" | "circle" | "strip";
  duration: number;
}

interface ShoutoutBubble {
  id: string;
  nickname: string;
  role: MemberRole;
  text: string;
}

interface MilestoneBanner {
  id: string;
  emoji: string;
  combo: number;
  text: string;
}

const CONFETTI_COLORS = [
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#eab308", // Yellow
];

const isCleanMode = ref(localStorage.getItem("jukebox_clean_reactions") === "true");
const particles = ref<MainParticle[]>([]);
const secondaryParticles = ref<SecondaryParticle[]>([]);
const confettiPieces = ref<ConfettiPiece[]>([]);
const shoutouts = ref<ShoutoutBubble[]>([]);
const milestoneBanner = ref<MilestoneBanner | null>(null);

// Collaborative Room Combo State
const roomCombo = ref(0);
const activeEmoji = ref("🔥");
const contributorsCount = ref(1);
const lastUpdatedAt = ref(0);
const decayProgress = ref(100);

// Screen Edge Aura
const edgeAuraActive = ref(false);
const edgeAuraColor = ref("rgba(245, 158, 11, 0.4)");
const isScreenRumble = ref(false);

let unsubscribeReaction: (() => void) | null = null;
let unsubscribeShoutout: (() => void) | null = null;
let unsubscribeComboReset: (() => void) | null = null;
let milestoneTimer: ReturnType<typeof setTimeout> | null = null;
let edgeTimer: ReturnType<typeof setTimeout> | null = null;
let rumbleTimer: ReturnType<typeof setTimeout> | null = null;
let decayInterval: ReturnType<typeof setInterval> | null = null;

function toggleCleanMode() {
  isCleanMode.value = !isCleanMode.value;
  localStorage.setItem("jukebox_clean_reactions", String(isCleanMode.value));
}

function getEmojiTheme(emoji: string) {
  switch (emoji) {
    case "🔥":
      return {
        name: "Hype Flame",
        aura: "rgba(245, 158, 11, 0.45)",
        badge: "from-amber-500 to-orange-600",
        secondary: ["✨", "💥", "⚡", "🌟", "🔥"],
      };
    case "❤️":
      return {
        name: "Warm Love",
        aura: "rgba(244, 63, 94, 0.45)",
        badge: "from-rose-500 to-pink-600",
        secondary: ["💕", "💖", "✨", "🌸", "❤️"],
      };
    case "💃":
      return {
        name: "Disco Groove",
        aura: "rgba(217, 70, 239, 0.45)",
        badge: "from-fuchsia-500 to-purple-600",
        secondary: ["🎶", "🎵", "✨", "🪩", "💃"],
      };
    case "🎸":
      return {
        name: "Rock Solo",
        aura: "rgba(59, 130, 246, 0.45)",
        badge: "from-blue-500 to-cyan-500",
        secondary: ["⚡", "🎵", "🎸", "💥", "🤘"],
      };
    case "💀":
      return {
        name: "Mood Dead",
        aura: "rgba(168, 85, 247, 0.45)",
        badge: "from-purple-500 to-violet-800",
        secondary: ["☠️", "👻", "💨", "✨", "💀"],
      };
    case "🎉":
      return {
        name: "Party Overload",
        aura: "rgba(234, 179, 8, 0.5)",
        badge: "from-amber-400 via-pink-500 to-cyan-400",
        secondary: ["🎊", "✨", "🎈", "🌟", "🎉"],
      };
    default:
      return {
        name: "Office Vibe",
        aura: "rgba(99, 102, 241, 0.45)",
        badge: "from-indigo-500 to-purple-600",
        secondary: ["✨", "🌟", "💫"],
      };
  }
}

const currentTier = computed(() => {
  const c = roomCombo.value;
  if (c >= 35) return { label: "OFFICE OVERDRIVE! 👑🎉", color: "text-amber-300", glow: "shadow-[0_0_24px_rgba(245,158,11,0.6)]" };
  if (c >= 20) return { label: "HYPER STREAK! 🚀", color: "text-fuchsia-300", glow: "shadow-[0_0_20px_rgba(217,70,239,0.5)]" };
  if (c >= 10) return { label: "ON FIRE! ⚡", color: "text-amber-400", glow: "shadow-[0_0_16px_rgba(245,158,11,0.4)]" };
  if (c >= 5) return { label: "HEATING UP 🔥", color: "text-orange-400", glow: "shadow-[0_0_12px_rgba(249,115,22,0.3)]" };
  return { label: "VIBING 🎶", color: "text-indigo-300", glow: "" };
});

function getMilestoneText(emoji: string, combo: number): string {
  if (combo >= 50) return `LEGENDARY COMBO x${combo}! 🚀`;
  if (combo >= 25) return `MAXIMUM HYPE x${combo}! ⚡`;
  if (combo >= 15) return `SUPER GROOVE x${combo}! ✨`;
  if (combo >= 10) return `ON FIRE x${combo}! 🔥`;
  return `COMBO x${combo}!`;
}

function spawnRadialConfetti(count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * (Math.PI * 2) + (Math.random() - 0.5) * 0.4;
    const distance = 80 + Math.random() * 110;
    const vx = Math.cos(angle) * distance;
    const vy = Math.sin(angle) * distance - 50; // Bias upward
    const rot = (Math.random() - 0.5) * 720;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const shapes: ("rect" | "circle" | "strip")[] = ["rect", "circle", "strip"];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const duration = 1.4 + Math.random() * 0.6;
    const id = Math.random().toString(36).slice(2, 9);

    confettiPieces.value.push({ id, vx, vy, rot, color, shape, duration });
    setTimeout(() => {
      confettiPieces.value = confettiPieces.value.filter((c) => c.id !== id);
    }, duration * 1000);
  }

  // Cap confetti array
  if (confettiPieces.value.length > 40) {
    confettiPieces.value.splice(0, confettiPieces.value.length - 40);
  }
}

function spawnReaction(item: ReactionBroadcastItem) {
  if (isCleanMode.value) return;

  const theme = getEmojiTheme(item.emoji);

  // 1. Update Collaborative Room Combo state
  roomCombo.value = item.combo;
  activeEmoji.value = item.emoji;
  contributorsCount.value = item.contributorsCount || 1;
  lastUpdatedAt.value = item.timestamp || Date.now();
  decayProgress.value = 100;

  // 2. Play distinct emoji sound
  if (props.allowSound) {
    reactionSoundEngine.playSound(item.emoji, item.combo);
  }

  // 3. Screen Edge Aura Pulse
  if (item.combo >= 4) {
    edgeAuraColor.value = theme.aura;
    edgeAuraActive.value = true;
    if (edgeTimer) clearTimeout(edgeTimer);
    edgeTimer = setTimeout(() => {
      edgeAuraActive.value = false;
    }, 700);
  }

  // 4. Main Floater Particle
  const id = Math.random().toString(36).slice(2, 9);
  const xOffset = (Math.random() - 0.5) * (props.compact ? 60 : 90);
  const rotation = (Math.random() - 0.5) * 36;
  const baseScale = Math.min(1.0 + (item.combo - 1) * 0.04, 1.5);
  const duration = 2.0 + Math.random() * 0.5;

  particles.value.push({
    id,
    emoji: item.emoji,
    combo: item.combo,
    xOffset,
    rotation,
    scale: baseScale,
    duration,
  });

  if (particles.value.length > 28) particles.value.shift();
  setTimeout(() => {
    particles.value = particles.value.filter((p) => p.id !== id);
  }, duration * 1000);

  // 5. Secondary Sparkle Particles (3 - 5 micro particles)
  const secCount = Math.min(3 + Math.floor(item.combo / 5), 6);
  for (let i = 0; i < secCount; i++) {
    const glyph = theme.secondary[Math.floor(Math.random() * theme.secondary.length)];
    const secId = Math.random().toString(36).slice(2, 9);
    const secDuration = 1.4 + Math.random() * 0.6;
    secondaryParticles.value.push({
      id: secId,
      glyph,
      xOffset: (Math.random() - 0.5) * 110,
      yOffset: -10 - Math.random() * 60,
      rotation: (Math.random() - 0.5) * 60,
      scale: 0.8 + Math.random() * 0.5,
      duration: secDuration,
    });
    setTimeout(() => {
      secondaryParticles.value = secondaryParticles.value.filter((s) => s.id !== secId);
    }, secDuration * 1000);
  }
  if (secondaryParticles.value.length > 40) {
    secondaryParticles.value.splice(0, secondaryParticles.value.length - 40);
  }

  // 6. Radial Confetti Cannon on High Combos (combo >= 8)
  if (item.combo >= 8) {
    spawnRadialConfetti(item.combo >= 20 ? 16 : 10);
  }

  // 7. Milestone Banner & Screen Rumble (x10, x15, x20, x25...)
  if (item.isMilestone || (item.combo >= 10 && item.combo % 5 === 0)) {
    emit("milestone", { combo: item.combo, emoji: item.emoji });

    isScreenRumble.value = true;
    if (rumbleTimer) clearTimeout(rumbleTimer);
    rumbleTimer = setTimeout(() => {
      isScreenRumble.value = false;
    }, 450);

    if (milestoneTimer) clearTimeout(milestoneTimer);
    milestoneBanner.value = {
      id: Math.random().toString(36).slice(2, 9),
      emoji: item.emoji,
      combo: item.combo,
      text: getMilestoneText(item.emoji, item.combo),
    };
    milestoneTimer = setTimeout(() => {
      milestoneBanner.value = null;
    }, 2500);
  }
}

function spawnShoutout(item: ShoutoutBroadcastItem) {
  if (isCleanMode.value) return;

  const bubble: ShoutoutBubble = {
    id: item.id || Math.random().toString(36).slice(2, 9),
    nickname: item.nickname,
    role: item.role,
    text: item.text,
  };

  shoutouts.value.push(bubble);
  if (shoutouts.value.length > 4) {
    shoutouts.value.shift();
  }

  setTimeout(() => {
    shoutouts.value = shoutouts.value.filter((s) => s.id !== bubble.id);
  }, 5200);
}

onMounted(() => {
  // Decay progress timer loop (1800ms decay window)
  decayInterval = setInterval(() => {
    if (roomCombo.value > 0 && lastUpdatedAt.value > 0) {
      const elapsed = Date.now() - lastUpdatedAt.value;
      const pct = Math.max(0, 100 - (elapsed / 1800) * 100);
      decayProgress.value = pct;
      if (elapsed > 1900) {
        roomCombo.value = 0;
      }
    }
  }, 40);

  unsubscribeReaction = jukeboxClient.onReaction((item) => {
    spawnReaction(item);
  });

  unsubscribeShoutout = jukeboxClient.onShoutout((item) => {
    spawnShoutout(item);
  });

  unsubscribeComboReset = jukeboxClient.onComboReset(() => {
    roomCombo.value = 0;
    decayProgress.value = 0;
  });
});

onBeforeUnmount(() => {
  if (unsubscribeReaction) unsubscribeReaction();
  if (unsubscribeShoutout) unsubscribeShoutout();
  if (unsubscribeComboReset) unsubscribeComboReset();
  if (milestoneTimer) clearTimeout(milestoneTimer);
  if (edgeTimer) clearTimeout(edgeTimer);
  if (rumbleTimer) clearTimeout(rumbleTimer);
  if (decayInterval) clearInterval(decayInterval);
});
</script>

<template>
  <div class="reaction-system-root">
    <!-- 1. Full-Screen Edge Neon Aura Vignette (Flashes in rhythm on combo hits) -->
    <transition name="aura-fade">
      <div
        v-if="edgeAuraActive && !isCleanMode"
        class="screen-edge-aura fixed inset-0 pointer-events-none z-40"
        :style="{ '--aura-color': edgeAuraColor }"
      ></div>
    </transition>

    <!-- 2. Main Reaction Floating Overlay Stage -->
    <div
      class="reaction-overlay fixed z-50 pointer-events-none flex flex-col items-end"
      :class="[positionClass, { 'rumble-active': isScreenRumble }]"
    >
      <!-- Clean View Toggle Pill -->
      <div class="pointer-events-auto mb-2 opacity-60 hover:opacity-100 transition-opacity">
        <button
          type="button"
          class="w-7 h-7 rounded-full bg-slate-900/75 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center backdrop-blur-md shadow-md active:scale-95 transition-all cursor-pointer"
          :title="isCleanMode ? 'Show live floating reactions & hype' : 'Hide floating reactions (Clean Mode)'"
          @click="toggleCleanMode"
        >
          <UiIcon :name="isCleanMode ? 'eye-off' : 'eye'" :size="12" />
        </button>
      </div>

      <!-- Active Stream Content -->
      <div v-if="!isCleanMode" class="relative flex flex-col items-end w-full max-w-[340px]">
        <!-- A. Milestone Surge Banner -->
        <transition name="surge">
          <div
            v-if="milestoneBanner"
            class="milestone-surge pointer-events-none mb-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/30 via-pink-500/35 to-purple-500/30 border-2 border-amber-400/60 backdrop-blur-xl shadow-[0_0_35px_rgba(245,158,11,0.5)] flex items-center gap-3 animate-pulse"
          >
            <span class="text-3xl animate-bounce">{{ milestoneBanner.emoji }}</span>
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-widest text-amber-300">Office Surge Active</span>
              <span class="text-xs sm:text-sm font-black text-white tracking-tight drop-shadow-md">
                {{ milestoneBanner.text }}
              </span>
            </div>
          </div>
        </transition>

        <!-- B. Collaborative Room Combo HUD (Visible when combo >= 2) -->
        <transition name="hud-pop">
          <div
            v-if="roomCombo >= 2"
            class="room-combo-hud pointer-events-none mb-3 px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-white/20 backdrop-blur-xl shadow-2xl flex flex-col gap-1 w-full max-w-[260px]"
            :class="currentTier.glow"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xl animate-spin-slow">{{ activeEmoji }}</span>
                <span class="text-[11px] font-black uppercase tracking-wider" :class="currentTier.color">
                  {{ currentTier.label }}
                </span>
              </div>
              <span class="text-lg font-black text-white tracking-tight font-mono tabular-nums">
                x{{ roomCombo }}
              </span>
            </div>

            <!-- Contributors Pill -->
            <div v-if="contributorsCount > 1" class="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
              <span>👥</span>
              <span>{{ contributorsCount }} Orang Ikut Hype!</span>
            </div>

            <!-- Decay Gauge Bar -->
            <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-0.5">
              <div
                class="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-75 ease-linear rounded-full"
                :style="{ width: `${decayProgress}%` }"
              ></div>
            </div>
          </div>
        </transition>

        <!-- C. Ephemeral Danmaku Shoutout Cards Stack -->
        <div class="shoutout-stack flex flex-col-reverse items-end gap-2 w-full">
          <transition-group name="danmaku">
            <div
              v-for="item in shoutouts"
              :key="item.id"
              class="shoutout-card pointer-events-auto max-w-[270px] sm:max-w-[320px] rounded-2xl p-2.5 sm:p-3 bg-slate-950/85 border border-white/15 backdrop-blur-2xl shadow-[0_12px_32px_rgba(0,0,0,0.6)] flex flex-col gap-1 transition-all"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  class="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider border shrink-0"
                  :class="{
                    'bg-amber-500/20 text-amber-300 border-amber-500/40': item.role === 'host',
                    'bg-indigo-500/20 text-indigo-300 border-indigo-500/40': item.role === 'dj',
                    'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40': item.role === 'vip',
                    'bg-slate-500/20 text-slate-300 border-slate-500/30': item.role === 'member' || item.role === 'listener',
                  }"
                >
                  {{ item.role }}
                </span>
                <span class="text-xs font-bold text-slate-200 truncate">{{ item.nickname }}</span>
                <span class="text-[10px] text-slate-400 ml-auto shrink-0">just now</span>
              </div>
              <p class="text-xs sm:text-[13px] text-slate-100 font-medium leading-snug break-words">
                {{ item.text }}
              </p>
            </div>
          </transition-group>
        </div>

        <!-- D. Spawner Stage: Main Emojis, Secondary Sparkles, and Radial Confetti -->
        <div class="particle-spawner-stage absolute bottom-0 right-3 pointer-events-none w-10 h-10 overflow-visible">
          <!-- 1. Radial Confetti Pieces -->
          <div
            v-for="c in confettiPieces"
            :key="c.id"
            class="confetti-item absolute"
            :style="{
              '--vx': `${c.vx}px`,
              '--vy': `${c.vy}px`,
              '--rot': `${c.rot}deg`,
              '--color': c.color,
              '--duration': `${c.duration}s`,
            }"
          >
            <div
              v-if="c.shape === 'rect'"
              class="w-2.5 h-1.5 rounded-[1px]"
              :style="{ backgroundColor: c.color }"
            ></div>
            <div
              v-else-if="c.shape === 'circle'"
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: c.color }"
            ></div>
            <div
              v-else
              class="w-3 h-1 rounded-full"
              :style="{ backgroundColor: c.color }"
            ></div>
          </div>

          <!-- 2. Secondary Sparkle Particles -->
          <div
            v-for="s in secondaryParticles"
            :key="s.id"
            class="secondary-particle absolute"
            :style="{
              '--x': `${s.xOffset}px`,
              '--y': `${s.yOffset}px`,
              '--rot': `${s.rotation}deg`,
              '--scale': `${s.scale}`,
              '--duration': `${s.duration}s`,
            }"
          >
            <span class="select-none text-base">{{ s.glyph }}</span>
          </div>

          <!-- 3. Primary Emoji Particle with Combo Badge -->
          <div
            v-for="p in particles"
            :key="p.id"
            class="reaction-particle absolute"
            :style="{
              '--drift-x': `${p.xOffset}px`,
              '--rotation': `${p.rotation}deg`,
              '--scale': `${p.scale}`,
              '--duration': `${p.duration}s`,
            }"
          >
            <span class="emoji-glyph select-none">{{ p.emoji }}</span>
            <span
              v-if="p.combo > 1"
              class="combo-badge absolute -top-2.5 -right-3 text-[10px] font-black px-1.5 py-0.2 rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 text-white shadow-md animate-pulse"
            >
              x{{ p.combo }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Full-Screen Edge Neon Aura Pulse */
.screen-edge-aura {
  box-shadow: inset 0 0 80px 20px var(--aura-color, rgba(245, 158, 11, 0.45));
  animation: auraPulse 650ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

@keyframes auraPulse {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
  }
}

.aura-fade-enter-active,
.aura-fade-leave-active {
  transition: opacity 200ms ease;
}

/* Subtle Screen Rumble on Milestone */
.rumble-active {
  animation: screenRumble 350ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes screenRumble {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-2px, 0, 0); }
  40%, 60% { transform: translate3d(2px, 0, 0); }
}

/* Primary Emoji Float Motion Physics */
.reaction-particle {
  bottom: 0;
  right: 0;
  font-size: 32px;
  line-height: 1;
  animation: floatParticle var(--duration, 2.2s) cubic-bezier(0.23, 1, 0.32, 1) forwards;
  will-change: transform, opacity;
}

@keyframes floatParticle {
  0% {
    transform: translate3d(0, 10px, 0) scale(0.85) rotate(0deg);
    opacity: 0;
  }
  12% {
    transform: translate3d(calc(var(--drift-x) * 0.2), -35px, 0) scale(var(--scale, 1.2)) rotate(var(--rotation));
    opacity: 1;
  }
  50% {
    transform: translate3d(calc(var(--drift-x) * 0.7), -140px, 0) scale(calc(var(--scale, 1) * 1.05)) rotate(calc(var(--rotation) * -0.5));
    opacity: 0.95;
  }
  100% {
    transform: translate3d(var(--drift-x), -260px, 0) scale(calc(var(--scale, 1) * 0.88)) rotate(var(--rotation));
    opacity: 0;
  }
}

/* Secondary Sparkle Particles */
.secondary-particle {
  bottom: 10px;
  right: 10px;
  animation: floatSecondary var(--duration, 1.6s) cubic-bezier(0.23, 1, 0.32, 1) forwards;
  will-change: transform, opacity;
}

@keyframes floatSecondary {
  0% {
    transform: translate3d(0, 0, 0) scale(0.6);
    opacity: 0;
  }
  20% {
    transform: translate3d(calc(var(--x) * 0.4), var(--y), 0) scale(var(--scale)) rotate(var(--rot));
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--x), calc(var(--y) - 130px), 0) scale(calc(var(--scale) * 0.6)) rotate(calc(var(--rot) * 1.8));
    opacity: 0;
  }
}

/* Radial Confetti Fireworks Physics */
.confetti-item {
  bottom: 15px;
  right: 15px;
  animation: confettiBurst var(--duration, 1.6s) cubic-bezier(0.25, 1, 0.5, 1) forwards;
  will-change: transform, opacity;
}

@keyframes confettiBurst {
  0% {
    transform: translate3d(0, 0, 0) scale(0.5) rotate(0deg);
    opacity: 1;
  }
  35% {
    transform: translate3d(var(--vx), var(--vy), 0) scale(1.1) rotate(var(--rot));
    opacity: 1;
  }
  100% {
    transform: translate3d(calc(var(--vx) * 1.25), calc(var(--vy) + 160px), 0) scale(0.7) rotate(calc(var(--rot) * 2.2));
    opacity: 0;
  }
}

/* Collaborative Room Combo HUD */
.room-combo-hud {
  animation: hudBounce 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes hudBounce {
  0% {
    transform: scale(0.92);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

.hud-pop-enter-active {
  transition: all 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
.hud-pop-leave-active {
  transition: all 250ms ease-out;
}
.hud-pop-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}
.hud-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.95);
}

/* Danmaku Chat Bubbles */
.danmaku-enter-active {
  transition: all 260ms cubic-bezier(0.23, 1, 0.32, 1);
}
.danmaku-leave-active {
  transition: all 350ms cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
}
.danmaku-enter-from {
  opacity: 0;
  transform: translate3d(24px, 16px, 0) scale(0.92);
}
.danmaku-leave-to {
  opacity: 0;
  transform: translate3d(0, -20px, 0) scale(0.95);
}

/* Milestone Surge Banner */
.surge-enter-active {
  transition: all 280ms cubic-bezier(0.32, 0.72, 0, 1);
}
.surge-leave-active {
  transition: all 300ms ease-out;
}
.surge-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(12px);
}
.surge-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-8px);
}
</style>

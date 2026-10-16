<script setup lang="ts">
import type { FxKind } from "../../shared/jukechan/gestures.ts";
import type { AwarenessState } from "../../shared/jukechan/params.ts";

defineProps<{
  fx: FxKind | null;
  triggerId: number;
  awareness: AwarenessState;
  primaryColor: string;
  secondaryColor: string;
}>();
</script>

<template>
  <g class="jukechan-fx pointer-events-none">
    <!-- Persistent Sleep Zzz Bubbles when Asleep or Drowsy -->
    <g v-if="awareness === 'asleep' || awareness === 'drowsy'" class="fx-zzz">
      <text
        x="292"
        y="128"
        font-family="sans-serif"
        font-weight="900"
        font-size="18"
        fill="#bae6fd"
        class="zzz-float-1"
      >
        z
      </text>
      <text
        x="312"
        y="102"
        font-family="sans-serif"
        font-weight="900"
        font-size="24"
        fill="#7dd3fc"
        class="zzz-float-2"
      >
        Z
      </text>
      <text
        v-if="awareness === 'asleep'"
        x="334"
        y="74"
        font-family="sans-serif"
        font-weight="900"
        font-size="30"
        fill="#38bdf8"
        class="zzz-float-3"
      >
        Z
      </text>
    </g>

    <!-- Triggered Burst FX -->
    <g v-if="fx" :key="triggerId" class="fx-burst">
      <!-- 1. Floating Hearts (Headpat / ❤️ Reaction) -->
      <g v-if="fx === 'hearts'">
        <path
          d="M 82 145 C 76 135, 62 138, 64 150 C 66 160, 82 168, 82 174 C 82 168, 98 160, 100 150 C 102 138, 88 135, 82 145 Z"
          fill="#ff4d7e"
          stroke="#ffffff"
          stroke-width="1.5"
          class="fx-pop-float"
        />
        <path
          d="M 320 130 C 316 122, 304 125, 306 134 C 308 142, 320 148, 320 154 C 320 148, 332 142, 334 134 C 336 125, 324 122, 320 130 Z"
          fill="#ff7597"
          stroke="#ffffff"
          stroke-width="1.5"
          class="fx-pop-float-delayed"
        />
      </g>

      <!-- 2. Musical Notes & Sparkles -->
      <g v-else-if="fx === 'notes' || fx === 'sparkles'">
        <text
          x="64"
          y="160"
          font-size="28"
          font-weight="bold"
          :fill="primaryColor"
          class="fx-pop-float"
        >
          ♪
        </text>
        <text
          x="322"
          y="142"
          font-size="24"
          font-weight="bold"
          :fill="secondaryColor"
          class="fx-pop-float-delayed"
        >
          ♫
        </text>
        <text x="86" y="108" font-size="20" fill="#ffffff" class="fx-pulse">
          ✦
        </text>
        <text x="306" y="190" font-size="18" :fill="primaryColor" class="fx-pulse">
          ✦
        </text>
      </g>

      <!-- 3. Anime Anger Vein (💢) & Huff Puff (Poke Spam / Pout) -->
      <g v-else-if="fx === 'anger'">
        <g
          transform="translate(284, 96)"
          stroke="#ff2a5f"
          stroke-width="3.4"
          fill="none"
          stroke-linecap="round"
          class="fx-pulse"
        >
          <path d="M 0 11 Q 11 11 11 0 M 17 0 Q 17 11 28 11 M 28 17 Q 17 17 17 28 M 11 28 Q 11 17 0 17" />
        </g>
        <!-- Steam huff puff near cheek -->
        <path
          d="M 74 242 C 58 238, 54 256, 70 256 C 60 266, 74 276, 84 264"
          fill="none"
          stroke="#ffffff"
          stroke-width="2.4"
          stroke-linecap="round"
          class="fx-pop-float"
        />
      </g>

      <!-- 4. Anime Sweat Drop (Pinch Cheek / Skip Track) -->
      <g v-else-if="fx === 'sweat'">
        <path
          d="M 294 134 C 294 134, 283 154, 283 163 A 11 11 0 0 0 305 163 C 305 154, 294 134, 294 134 Z"
          fill="#7dd3fc"
          stroke="#ffffff"
          stroke-width="1.8"
          class="fx-sweat-slide"
        />
        <circle cx="290" cy="160" r="2.5" fill="#ffffff" class="fx-sweat-slide" />
      </g>

      <!-- 5. Shock / Wake Exclamation Rays (Ahoge / Skull / Wake) -->
      <g v-else-if="fx === 'shock'">
        <g stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round" class="fx-pulse">
          <line x1="82" y1="115" x2="62" y2="98" />
          <line x1="74" y1="138" x2="50" y2="132" />
          <line x1="316" y1="115" x2="336" y2="98" />
          <line x1="324" y1="138" x2="348" y2="132" />
        </g>
      </g>

      <!-- 6. Confetti & Fire -->
      <g v-else-if="fx === 'confetti' || fx === 'fire'">
        <circle cx="75" cy="135" r="5" :fill="primaryColor" class="fx-pop-float" />
        <rect
          x="318"
          y="125"
          width="10"
          height="10"
          rx="2"
          :fill="secondaryColor"
          transform="rotate(25 323 130)"
          class="fx-pop-float-delayed"
        />
        <circle cx="92" cy="185" r="4" fill="#fbbf24" class="fx-pop-float-delayed" />
        <text
          v-if="fx === 'fire'"
          x="308"
          y="175"
          font-size="24"
          class="fx-pop-float"
        >
          🔥
        </text>
      </g>
    </g>
  </g>
</template>

<style scoped>
.zzz-float-1 {
  animation: zzzFloat 2.4s ease-in-out infinite;
}
.zzz-float-2 {
  animation: zzzFloat 2.4s ease-in-out 0.6s infinite;
}
.zzz-float-3 {
  animation: zzzFloat 2.4s ease-in-out 1.2s infinite;
}

@keyframes zzzFloat {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.85);
  }
  50% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
    transform: translateY(-14px) translateX(6px) scale(1.1);
  }
}

.fx-pop-float {
  transform-box: fill-box;
  transform-origin: center;
  animation: fxPopFloat 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.fx-pop-float-delayed {
  transform-box: fill-box;
  transform-origin: center;
  animation: fxPopFloat 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards;
}

@keyframes fxPopFloat {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.5);
  }
  25% {
    opacity: 1;
    transform: translateY(-4px) scale(1.12);
  }
  80% {
    opacity: 0.95;
    transform: translateY(-14px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-20px) scale(0.85);
  }
}

.fx-pulse {
  transform-box: fill-box;
  transform-origin: center;
  animation: fxPulse 0.45s ease-in-out infinite alternate;
}

@keyframes fxPulse {
  from {
    transform: scale(0.88);
  }
  to {
    transform: scale(1.14);
  }
}

.fx-sweat-slide {
  animation: sweatSlide 1.2s ease-out forwards;
}

@keyframes sweatSlide {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(12px);
  }
}
</style>

<script setup lang="ts">
import { useId } from "vue";
import { useJukeChanMood } from "../../shared/useJukeChanMood.ts";

defineProps<{
  sizeClasses: string;
}>();

const emit = defineEmits<{
  (e: "tap"): void;
}>();

const uid = useId();
const id = (name: string) => `jc-mini-${uid}-${name}`;

const {
  currentMood,
  eyesExpression,
  mouthExpression,
  emotion,
  isBouncing,
  onZoneTap,
} = useJukeChanMood();

function handleMiniTap(ev: MouseEvent) {
  ev.stopPropagation();
  onZoneTap("head");
  emit("tap");
}
</script>

<template>
  <div
    class="mini-avatar-wrap relative rounded-full overflow-hidden border border-white/20 bg-slate-900/90 shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
    :class="[sizeClasses, isBouncing ? 'animate-bounce' : '']"
    :style="{ borderColor: currentMood.primary }"
    :title="`Juke-chan (${currentMood.badge}) - Tap to say hi!`"
    @click="handleMiniTap"
  >
    <svg
      viewBox="85 52 230 230"
      class="w-full h-full transform scale-125 translate-y-1.5 pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient :id="id('skin')" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fff4ec" />
          <stop offset="100%" stop-color="#f7ccb8" />
        </linearGradient>
        <linearGradient :id="id('hairBack')" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#191130" />
          <stop offset="100%" :stop-color="currentMood.secondary" />
        </linearGradient>
        <linearGradient :id="id('hairFront')" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stop-color="#5d36a3" />
          <stop offset="55%" stop-color="#3c1f78" />
          <stop offset="100%" :stop-color="currentMood.primary" />
        </linearGradient>
        <linearGradient :id="id('iris')" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#140826" />
          <stop offset="45%" :stop-color="currentMood.secondary" />
          <stop offset="100%" :stop-color="currentMood.primary" />
        </linearGradient>
        <radialGradient :id="id('cheek')" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff4d7e" stop-opacity="0.75" />
          <stop offset="100%" stop-color="#ff7a9e" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Back Hair -->
      <path
        d="M 105 140 C 65 190, 60 270, 75 300 L 325 300 C 340 270, 335 190, 295 140 Z"
        :fill="`url(#${id('hairBack')})`"
      />

      <!-- Headphone Band -->
      <path
        d="M 98 190 C 90 78, 305 78, 298 190"
        fill="none"
        stroke="#1d1630"
        stroke-width="18"
        stroke-linecap="round"
      />
      <path
        d="M 104 172 C 98 84, 296 84, 292 172"
        fill="none"
        :stroke="currentMood.primary"
        stroke-width="4.5"
        stroke-linecap="round"
      />

      <!-- Sculpted 3/4 Face -->
      <path
        d="M 196 86 C 252 86, 284 126, 282 184 C 281 214, 276 240, 263 260 C 246 282, 216 300, 195 304 C 175 300, 144 282, 128 260 C 116 244, 112 228, 115 210 C 117 198, 114 188, 116 174 C 118 124, 144 86, 196 86 Z"
        :fill="`url(#${id('skin')})`"
        stroke="#2b142c"
        stroke-width="2.4"
      />

      <!-- Blush -->
      <ellipse cx="144" cy="236" rx="22" ry="12" :fill="`url(#${id('cheek')})`" />
      <ellipse cx="250" cy="236" rx="20" ry="11" :fill="`url(#${id('cheek')})`" />

      <!-- Eyes -->
      <g v-if="eyesExpression === 'happy' || emotion === 'happy' || emotion === 'laugh'">
        <path
          d="M 132 206 C 142 188, 168 188, 176 206"
          stroke="#1d0c2e"
          stroke-width="4.5"
          fill="none"
          stroke-linecap="round"
        />
        <path
          d="M 220 206 C 228 188, 254 188, 264 206"
          stroke="#1d0c2e"
          stroke-width="4.5"
          fill="none"
          stroke-linecap="round"
        />
      </g>
      <g v-else>
        <ellipse cx="155" cy="205" rx="13.5" ry="15.5" :fill="`url(#${id('iris')})`" />
        <ellipse cx="155" cy="205" rx="6" ry="7" fill="#120624" />
        <circle cx="147" cy="197" r="4.5" fill="#ffffff" />
        <path
          d="M 129 202 C 136 184, 170 183, 179 201"
          stroke="#190c26"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
        />

        <ellipse cx="241" cy="205" rx="13" ry="15.5" :fill="`url(#${id('iris')})`" />
        <ellipse cx="241" cy="205" rx="5.8" ry="7" fill="#120624" />
        <circle cx="233" cy="197" r="4.2" fill="#ffffff" />
        <path
          d="M 217 201 C 226 183, 260 184, 267 202"
          stroke="#190c26"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
        />
      </g>

      <!-- Mouth -->
      <path
        v-if="mouthExpression === 'normal'"
        d="M 183 260 Q 196 268 209 260"
        stroke="#8f394c"
        stroke-width="2.6"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse v-else cx="196" cy="262" rx="8" ry="6.5" fill="#7a1c30" />

      <!-- Front Bangs + Vinyl Hairclip -->
      <path
        d="M 92 166 C 88 86, 138 48, 198 48 C 258 48, 308 84, 304 164 C 292 140, 282 126, 270 120 C 276 152, 270 184, 258 204 C 260 172, 252 144, 240 130 C 242 166, 232 192, 218 208 C 224 176, 218 146, 206 132 C 204 170, 196 194, 186 206 C 186 176, 182 148, 174 134 C 168 170, 156 196, 140 208 C 150 176, 148 146, 138 130 C 132 162, 122 186, 110 198 C 116 170, 114 144, 106 124 C 98 136, 94 150, 92 166 Z"
        :fill="`url(#${id('hairFront')})`"
        stroke="#140a29"
        stroke-width="2.2"
      />
      <g transform="translate(254, 124)">
        <circle cx="0" cy="0" r="13" fill="#0d0b14" :stroke="currentMood.primary" stroke-width="1.8" />
        <circle cx="0" cy="0" r="4.5" :fill="currentMood.secondary" />
      </g>

      <!-- Earcups -->
      <rect
        x="82"
        y="176"
        width="24"
        height="52"
        rx="11"
        fill="#140c29"
        :stroke="currentMood.primary"
        stroke-width="2.5"
      />
      <rect
        x="292"
        y="176"
        width="24"
        height="52"
        rx="11"
        fill="#140c29"
        :stroke="currentMood.primary"
        stroke-width="2.5"
      />
    </svg>

    <span
      class="absolute inset-0 rounded-full border pointer-events-none opacity-80"
      :style="{
        borderColor: currentMood.primary,
        boxShadow: `inset 0 0 8px ${currentMood.primary}50`,
      }"
    ></span>
  </div>
</template>

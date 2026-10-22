<script setup lang="ts">
import type { ArmPoseKey } from "../../shared/jukechan/params.ts";

defineProps<{
  pose: ArmPoseKey;
  wavePhase: number;
  primaryColor: string;
  secondaryColor: string;
  skinUrl: string;
}>();
</script>

<template>
  <g class="jukechan-arms pointer-events-none">
    <!-- 1. DEFAULT DJ POSE: Left arm relaxed, Right arm gracefully touching DJ earcup -->
    <g v-if="pose === 'holdEarcup'">
      <!-- Left Arm: Relaxed oversized sleeve silhouette -->
      <path
        d="M 88 378 C 66 412, 58 462, 64 514 L 106 514 C 104 474, 108 434, 118 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path
        d="M 72 452 Q 88 458 104 454"
        fill="none"
        :stroke="primaryColor"
        stroke-width="2.2"
        stroke-linecap="round"
      />

      <!-- Right Arm: Raised sleeve + graceful anime hand lightly resting on right earcup -->
      <g :transform="`rotate(${(wavePhase * 1.8).toFixed(2)}, 285, 395)`">
        <!-- Oversized Sleeve curving up to wrist -->
        <path
          d="M 284 416 C 314 382, 340 322, 326 254 C 314 248, 302 250, 294 258 C 300 314, 282 365, 260 402 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <!-- Ribbed Hoodie Cuff with Neon Trim -->
        <path
          d="M 293 260 Q 310 250 327 254 L 325 244 Q 309 240 295 250 Z"
          fill="#140e26"
          stroke="#090612"
          stroke-width="2"
        />
        <path
          d="M 294 256 Q 310 247 326 251"
          fill="none"
          :stroke="secondaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <!-- Graceful tapered anime fingers lightly touching earcup edge -->
        <path
          d="M 298 246 C 295 232, 297 216, 303 204 C 306 199, 311 201, 309 209 C 313 198, 319 201, 316 212 C 321 204, 326 208, 322 220 C 325 228, 323 238, 322 246 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </g>
    </g>

    <!-- 2. RELAXED LO-FI POSE: Both oversized sleeves resting calmly -->
    <g v-else-if="pose === 'relaxed'">
      <path
        d="M 88 378 C 66 412, 58 462, 64 514 L 106 514 C 104 474, 108 434, 118 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <path
        d="M 310 380 C 332 414, 340 462, 334 514 L 292 514 C 294 474, 290 434, 280 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <path
        d="M 72 455 Q 88 461 104 457 M 294 457 Q 310 461 326 455"
        fill="none"
        :stroke="primaryColor"
        stroke-width="2.2"
        stroke-linecap="round"
      />
    </g>

    <!-- 3. PEACE / V-SIGN POSE: Cute oversized sleeve paw + delicate V fingers -->
    <g v-else-if="pose === 'peace'">
      <!-- Right arm relaxed -->
      <path
        d="M 310 380 C 332 414, 340 462, 334 514 L 292 514 C 294 474, 290 434, 280 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <!-- Left Arm raised near cheek in cheerful V-sign -->
      <g :transform="`rotate(${(wavePhase * 3.5).toFixed(2)}, 98, 390)`">
        <path
          d="M 74 442 C 58 392, 64 334, 92 288 C 104 284, 118 290, 122 300 C 102 340, 98 390, 110 436 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <!-- Cozy oversized cuff covering half the palm (Moe sleeve style) -->
        <path
          d="M 90 292 C 94 276, 118 280, 124 296 L 120 306 C 108 300, 96 298, 90 292 Z"
          fill="#140e26"
          stroke="#090612"
          stroke-width="2.2"
        />
        <path
          d="M 92 292 Q 108 286 122 296"
          fill="none"
          :stroke="primaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <!-- Delicate tapered V-fingers emerging from cuff -->
        <g transform="translate(108, 282) rotate(-10)">
          <!-- Index finger -->
          <path
            d="M -5 2 C -8 -10, -12 -22, -13 -30 C -13 -35, -6 -36, -4 -30 C -2 -22, 0 -10, 2 2 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <!-- Middle finger -->
          <path
            d="M 3 2 C 7 -10, 12 -22, 15 -29 C 17 -34, 23 -32, 20 -26 C 16 -18, 12 -8, 9 4 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <!-- Soft rounded palm & thumb tuck -->
          <path
            d="M -10 0 C -10 -7, 12 -7, 13 2 C 14 10, -9 10, -10 0 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
          />
        </g>
      </g>
    </g>

    <!-- 4. WAVE WELCOME / DANCE POSE -->
    <g v-else-if="pose === 'wave'">
      <path
        d="M 310 380 C 332 414, 340 462, 334 514 L 292 514 C 294 474, 290 434, 280 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <g :transform="`rotate(${(wavePhase * 12).toFixed(2)}, 95, 375)`">
        <path
          d="M 72 435 C 52 382, 54 320, 82 272 L 114 284 C 94 328, 92 380, 108 430 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <path
          d="M 80 274 Q 98 268 115 282"
          fill="none"
          :stroke="secondaryColor"
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <!-- Soft open waving anime hand (mitten-like graceful silhouette with thumb + 3 finger tips) -->
        <g transform="translate(98, 266) rotate(-15)">
          <path
            d="M -12 8 C -15 -4, -14 -18, -9 -24 C -6 -27, -2 -24, -2 -17 C -1 -26, 4 -28, 7 -24 C 9 -27, 14 -25, 14 -18 C 16 -22, 20 -19, 19 -12 C 18 -2, 16 6, 12 11 C 18 6, 24 6, 25 10 C 25 15, 16 18, 8 17 L -10 15 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>
      </g>
    </g>

    <!-- 5. CROSSED ARMS POUT (NGAMBEK) -->
    <g v-else-if="pose === 'crossedPout'">
      <!-- Sleek folded hoodie sleeves across chest -->
      <path
        d="M 88 432 C 122 408, 236 410, 294 438 C 298 452, 292 468, 282 476 C 224 456, 126 454, 84 472 Z"
        fill="#231b42"
        stroke="#090612"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path
        d="M 106 454 C 164 430, 254 432, 304 458 C 306 472, 298 486, 288 492 C 238 474, 154 472, 100 488 Z"
        fill="#18122e"
        stroke="#090612"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path
        d="M 138 434 Q 198 426 258 438"
        fill="none"
        :stroke="secondaryColor"
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </g>

    <!-- 6. HEART HANDS / CLASPED CHEST POSE (GALAU / ROMANCE ❤️) -->
    <g v-else-if="pose === 'heartHands' || pose === 'claspedSad'">
      <g :transform="`translate(0, ${(wavePhase * 2.5).toFixed(2)})`">
        <!-- Both sleeves converging toward center chest -->
        <path
          d="M 88 478 C 102 422, 138 384, 178 368 L 194 394 C 164 410, 138 442, 128 486 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <path
          d="M 312 478 C 298 422, 262 384, 222 368 L 206 394 C 236 410, 262 442, 272 486 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <!-- Cutefinger-heart / clasped hands silhouette at center -->
        <path
          v-if="pose === 'heartHands'"
          d="M 200 364 C 190 352, 172 358, 174 374 C 176 388, 192 396, 200 404 C 208 396, 224 388, 226 374 C 228 358, 210 352, 200 364 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2.2"
          stroke-linejoin="round"
        />
        <path
          v-if="pose === 'heartHands'"
          d="M 200 370 C 194 363, 184 366, 185 375 C 186 383, 196 388, 200 393 C 204 388, 214 383, 215 375 C 216 366, 206 363, 200 370 Z"
          :fill="secondaryColor"
          opacity="0.85"
        />
        <path
          v-else
          d="M 176 378 C 176 365, 224 365, 224 378 C 224 391, 176 391, 176 378 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2.2"
        />
      </g>
    </g>

    <!-- 7. CLAP / PARTY POSE (🎉 / High Combo) -->
    <g v-else-if="pose === 'clap'">
      <g :transform="`translate(${(wavePhase * -4).toFixed(2)}, 0)`">
        <path
          d="M 86 472 C 102 416, 138 378, 176 360 L 194 384 C 164 402, 138 436, 126 480 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
        />
        <path
          d="M 174 362 C 168 346, 184 338, 194 352 C 198 360, 196 374, 188 380 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </g>
      <g :transform="`translate(${(wavePhase * 4).toFixed(2)}, 0)`">
        <path
          d="M 314 472 C 298 416, 262 378, 224 360 L 206 384 C 236 402, 262 436, 274 480 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
        />
        <path
          d="M 226 362 C 232 346, 216 338, 206 352 C 202 360, 204 374, 212 380 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </g>
    </g>

    <!-- 8. THUMBS UP VOTE POSE -->
    <g v-else-if="pose === 'thumbsUp'">
      <path
        d="M 310 380 C 332 414, 340 462, 334 514 L 292 514 C 294 474, 290 434, 280 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <g :transform="`translate(0, ${(wavePhase * 3).toFixed(2)})`">
        <path
          d="M 76 448 C 62 400, 72 348, 104 312 L 132 328 C 110 360, 102 402, 112 444 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
        />
        <path
          d="M 102 314 Q 118 310 132 326"
          fill="none"
          :stroke="primaryColor"
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <!-- Cute anime thumbs-up hand -->
        <g transform="translate(120, 306)">
          <path
            d="M -6 0 C -6 -14, -4 -24, 2 -24 C 7 -24, 8 -14, 6 -4 C 16 -4, 18 14, 6 16 L -8 14 C -12 10, -10 2, -6 0 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>
      </g>
    </g>

    <!-- 9. KARAOKE MICROPHONE POSE -->
    <g v-else-if="pose === 'holdMic'">
      <path
        d="M 88 378 C 66 412, 58 462, 64 514 L 106 514 C 104 474, 108 434, 118 400 Z"
        fill="#191330"
        stroke="#090612"
        stroke-width="2.6"
      />
      <g :transform="`translate(0, ${(wavePhase * 2.5).toFixed(2)})`">
        <path
          d="M 296 446 C 314 398, 292 344, 244 308 L 222 328 C 258 358, 272 402, 260 444 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <!-- Microphone body & glowing neon capsule near mouth -->
        <g transform="translate(222, 296) rotate(-28)">
          <rect
            x="-5"
            y="-14"
            width="10"
            height="34"
            rx="4"
            fill="#141024"
            stroke="#ffffff"
            stroke-width="1.5"
          />
          <circle
            cx="0"
            cy="-20"
            r="11"
            fill="#2b224a"
            :stroke="primaryColor"
            stroke-width="2.2"
          />
          <path
            d="M -8 -20 L 8 -20 M -6 -25 L 6 -25 M -6 -15 L 6 -15"
            stroke="#00f5d4"
            stroke-width="1.2"
          />
          <!-- Soft hand holding mic -->
          <ellipse
            cx="0"
            cy="4"
            rx="11"
            ry="9"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
          />
        </g>
      </g>
    </g>

    <!-- 10. FANNING HOT (🔥) / SURPRISED / AIR GUITAR (🎸) -->
    <g v-else>
      <g :transform="`rotate(${(wavePhase * 9).toFixed(2)}, 105, 385)`">
        <path
          d="M 76 442 C 58 392, 66 336, 98 292 L 126 308 C 104 344, 98 392, 110 438 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
        />
        <ellipse
          cx="114"
          cy="292"
          rx="12"
          ry="15"
          transform="rotate(-18 114 292)"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </g>
      <g :transform="`rotate(${(-wavePhase * 9).toFixed(2)}, 295, 385)`">
        <path
          d="M 324 442 C 342 392, 334 336, 302 292 L 274 308 C 296 344, 302 392, 290 438 Z"
          fill="#21193d"
          stroke="#090612"
          stroke-width="2.6"
        />
        <ellipse
          cx="286"
          cy="292"
          rx="12"
          ry="15"
          transform="rotate(18 286 292)"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </g>
    </g>
  </g>
</template>

<style scoped>
.jukechan-arms g {
  transition: transform 0.08s linear;
  will-change: transform;
}
</style>

<script setup lang="ts">
import { ref } from "vue";
import type { ArmPoseKey } from "../../shared/jukechan/params.ts";

defineProps<{
  pose: ArmPoseKey;
  wavePhase: number;
  primaryColor: string;
  secondaryColor: string;
  skinUrl: string;
}>();

const armsGroup = ref<SVGGElement | null>(null);
const armLGroup = ref<SVGGElement | null>(null);
const armRGroup = ref<SVGGElement | null>(null);

defineExpose({
  armsGroup,
  armLGroup,
  armRGroup,
});
</script>

<template>
  <g ref="armsGroup" class="jukechan-arms pointer-events-none">
    <!-- =================================================================== -->
    <!-- LEFT ARM GROUP (Viewer's Left / Character's Right Arm)              -->
    <!-- Permanent ref so 60fps direct SVG transforms never drop on v-if     -->
    <!-- =================================================================== -->
    <g ref="armLGroup">
      <!-- A. RELAXED LEFT SLEEVE (Seamless with hoodie shoulder, no boxy chest cut) -->
      <template v-if="pose === 'holdEarcup' || pose === 'relaxed' || pose === 'holdMic'">
        <!-- Soft inner sleeve shading & natural fabric fold -->
        <path
          d="M 108 398 C 100 436, 98 476, 100 515 L 60 515 C 62 456, 72 412, 90 378 Z"
          fill="#17112b"
          opacity="0.65"
        />
        <!-- Inner arm seam line (open top so it blends seamlessly into hoodie torso) -->
        <path
          d="M 110 402 C 102 438, 100 476, 102 514"
          fill="none"
          stroke="#090612"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <!-- Subtle elbow crease -->
        <path
          d="M 94 434 Q 102 440 105 432"
          fill="none"
          stroke="#2d234a"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <!-- Neon cyber armband stripe on sleeve -->
        <path
          d="M 66 456 Q 84 462 101 456"
          fill="none"
          :stroke="primaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </template>

      <!-- B. PEACE / V-SIGN POSE (Shoulder -> Elbow -> Raised Forearm -> Cute V Hand) -->
      <template v-else-if="pose === 'peace'">
        <!-- Bent oversized sleeve from outer shoulder (88,368) down to elbow (58,428) and up to wrist (96,294) -->
        <path
          d="M 92 368 C 70 384, 54 416, 62 438 C 70 452, 92 446, 104 426 L 122 304 C 114 292, 94 288, 86 298 L 72 384 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- Elbow fold highlight -->
        <path
          d="M 76 392 L 96 412"
          fill="none"
          stroke="#35285c"
          stroke-width="2"
          stroke-linecap="round"
        />
        <!-- Cozy ribbed cuff with neon trim -->
        <path
          d="M 85 298 C 90 284, 116 286, 123 302 L 119 312 C 108 304, 94 302, 85 298 Z"
          fill="#130d24"
          stroke="#090612"
          stroke-width="2.2"
        />
        <path
          d="M 88 298 Q 105 291 120 302"
          fill="none"
          :stroke="primaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <!-- Proportionate Anime V-Sign Hand -->
        <g transform="translate(105, 286) rotate(-8)">
          <!-- Palm & curled ring/pinky fingers -->
          <path
            d="M -11 4 C -13 -6, 11 -7, 13 3 C 14 12, -10 13, -11 4 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
          />
          <!-- Index finger -->
          <path
            d="M -6 0 C -9 -11, -13 -22, -13 -30 C -13 -35, -6 -36, -4 -30 C -2 -21, 0 -10, 1 0 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <!-- Middle finger -->
          <path
            d="M 2 0 C 6 -11, 11 -22, 14 -29 C 16 -34, 22 -32, 20 -26 C 16 -18, 11 -8, 8 2 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <!-- Thumb tucked across palm -->
          <path
            d="M -10 4 Q -2 -1 6 5"
            fill="none"
            stroke="#d4917a"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </g>
      </template>

      <!-- C. WAVE WELCOME / DANCE POSE -->
      <template v-else-if="pose === 'wave'">
        <path
          d="M 92 368 C 66 382, 50 412, 58 434 C 66 448, 88 442, 102 420 L 114 286 C 104 274, 86 272, 78 282 L 68 378 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 78 282 Q 96 274 114 286"
          fill="none"
          :stroke="secondaryColor"
          stroke-width="3.2"
          stroke-linecap="round"
        />
        <!-- Open waving anime hand -->
        <g transform="translate(96, 268) rotate(-14)">
          <path
            d="M -11 8 C -14 -4, -13 -17, -8 -23 C -5 -26, -2 -23, -2 -16 C -1 -25, 4 -27, 7 -23 C 9 -26, 13 -24, 13 -17 C 15 -21, 19 -18, 18 -11 C 17 -2, 15 5, 11 10 C 17 5, 22 5, 23 9 C 23 14, 15 17, 7 16 L -9 14 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>
      </template>

      <!-- D. THUMBS UP VOTE POSE -->
      <template v-else-if="pose === 'thumbsUp'">
        <path
          d="M 92 368 C 68 386, 56 418, 66 440 C 76 452, 96 444, 108 422 L 130 328 C 122 316, 106 312, 98 320 L 76 388 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 98 320 Q 114 314 130 328"
          fill="none"
          :stroke="primaryColor"
          stroke-width="3.2"
          stroke-linecap="round"
        />
        <g transform="translate(118, 308)">
          <path
            d="M -6 0 C -6 -13, -4 -22, 2 -22 C 7 -22, 8 -13, 6 -4 C 15 -4, 17 13, 6 15 L -7 13 C -11 9, -9 2, -6 0 Z"
            :fill="skinUrl"
            stroke="#2b142c"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </g>
      </template>

      <!-- E. CROSSED ARMS POUT (NGAMBEK) - Left Half -->
      <template v-else-if="pose === 'crossedPout'">
        <path
          d="M 88 430 C 122 408, 232 410, 290 436 C 294 450, 288 466, 278 474 C 220 454, 126 452, 84 470 Z"
          fill="#221a40"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 134 432 Q 196 424 254 436"
          fill="none"
          :stroke="secondaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </template>

      <!-- F. HEART HANDS / CLASPED CHEST POSE - Left Sleeve + Center Clasped/Heart -->
      <template v-else-if="pose === 'heartHands' || pose === 'claspedSad'">
        <path
          d="M 84 468 C 98 416, 134 382, 176 368 L 192 392 C 160 408, 134 438, 120 476 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
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
          opacity="0.88"
        />
        <path
          v-else
          d="M 176 378 C 176 365, 224 365, 224 378 C 224 391, 176 391, 176 378 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2.2"
        />
      </template>

      <!-- G. CLAP / PARTY POSE - Left Hand -->
      <template v-else-if="pose === 'clap'">
        <path
          d="M 84 466 C 100 414, 136 378, 174 360 L 192 384 C 162 402, 136 434, 122 474 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 174 362 C 168 346, 184 338, 194 352 C 198 360, 196 374, 188 380 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </template>

      <!-- H. FANNING HOT / SURPRISED / AIR GUITAR - Left Hand -->
      <template v-else>
        <path
          d="M 90 368 C 66 386, 56 418, 66 438 C 76 450, 96 442, 108 420 L 124 310 C 114 298, 98 296, 90 304 L 74 384 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <ellipse
          cx="110"
          cy="296"
          rx="11.5"
          ry="14.5"
          transform="rotate(-16 110 296)"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </template>
    </g>

    <!-- =================================================================== -->
    <!-- RIGHT ARM GROUP (Viewer's Right / Character's Left Arm)             -->
    <!-- Permanent ref so 60fps direct SVG transforms never drop on v-if     -->
    <!-- =================================================================== -->
    <g ref="armRGroup">
      <!-- 1. DEFAULT DJ POSE: Right arm bending naturally from outer shoulder/elbow up to DJ earcup -->
      <template v-if="pose === 'holdEarcup'">
        <!-- Natural bent techwear sleeve: outer shoulder (298,366) -> elbow (336,418) -> forearm up to wrist (312,250) -->
        <path
          d="M 296 368 C 318 382, 338 408, 332 430 C 326 446, 304 442, 292 418 C 296 368, 300 310, 294 256 C 304 248, 318 248, 326 256 C 334 314, 336 372, 324 412 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- Inner elbow fold crease so forearm clearly overlaps upper arm -->
        <path
          d="M 294 378 C 304 394, 314 406, 322 412"
          fill="none"
          stroke="#35285c"
          stroke-width="2"
          stroke-linecap="round"
        />
        <!-- Ribbed Hoodie Cuff with Neon Trim at wrist -->
        <path
          d="M 293 258 Q 310 248 327 254 L 325 244 Q 309 238 295 248 Z"
          fill="#140e26"
          stroke="#090612"
          stroke-width="2"
        />
        <path
          d="M 294 254 Q 310 245 326 250"
          fill="none"
          :stroke="secondaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <!-- Graceful anime DJ hand lightly resting on right earcup rim -->
        <path
          d="M 298 245 C 294 231, 296 216, 303 205 C 306 200, 311 202, 309 210 C 313 199, 319 202, 316 212 C 321 205, 326 209, 322 220 C 325 228, 323 237, 322 245 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </template>

      <!-- 2. RELAXED RIGHT SLEEVE (Used when right arm is resting down) -->
      <template
        v-else-if="
          pose === 'relaxed' ||
          pose === 'peace' ||
          pose === 'wave' ||
          pose === 'thumbsUp'
        "
      >
        <path
          d="M 292 398 C 300 436, 302 476, 300 515 L 340 515 C 338 456, 328 412, 310 378 Z"
          fill="#17112b"
          opacity="0.65"
        />
        <path
          d="M 290 402 C 298 438, 300 476, 298 514"
          fill="none"
          stroke="#090612"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <path
          d="M 306 434 Q 298 440 295 432"
          fill="none"
          stroke="#2d234a"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <path
          d="M 299 456 Q 316 462 334 456"
          fill="none"
          :stroke="primaryColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </template>

      <!-- 3. CROSSED ARMS POUT - Lower Folded Right Forearm -->
      <template v-else-if="pose === 'crossedPout'">
        <path
          d="M 106 452 C 164 430, 252 432, 302 456 C 304 470, 296 484, 286 490 C 236 472, 154 470, 100 486 Z"
          fill="#18122e"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
      </template>

      <!-- 4. HEART HANDS / CLASPED CHEST POSE - Right Sleeve -->
      <template v-else-if="pose === 'heartHands' || pose === 'claspedSad'">
        <path
          d="M 316 468 C 302 416, 266 382, 224 368 L 208 392 C 240 408, 266 438, 280 476 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
      </template>

      <!-- 5. CLAP / PARTY POSE - Right Hand -->
      <template v-else-if="pose === 'clap'">
        <path
          d="M 316 466 C 300 414, 264 378, 226 360 L 208 384 C 238 402, 264 434, 278 474 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 226 362 C 232 346, 216 338, 206 352 C 202 360, 204 374, 212 380 Z"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </template>

      <!-- 6. KARAOKE MICROPHONE POSE -->
      <template v-else-if="pose === 'holdMic'">
        <path
          d="M 296 442 C 314 396, 292 344, 244 308 L 222 328 C 258 358, 272 400, 262 440 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
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
      </template>

      <!-- 7. FANNING HOT / SURPRISED / AIR GUITAR - Right Hand -->
      <template v-else>
        <path
          d="M 310 368 C 334 386, 344 418, 334 438 C 324 450, 304 442, 292 420 L 276 310 C 286 298, 302 296, 310 304 L 326 384 Z"
          fill="#1f1738"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <ellipse
          cx="290"
          cy="296"
          rx="11.5"
          ry="14.5"
          transform="rotate(16 290 296)"
          :fill="skinUrl"
          stroke="#2b142c"
          stroke-width="2"
        />
      </template>
    </g>
  </g>
</template>

<style scoped>
.jukechan-arms g {
  will-change: transform;
}
</style>

<script setup lang="ts">
import { ref, reactive, useId, watch } from "vue";
import { useJukeChanMood } from "../../shared/useJukeChanMood.ts";
import {
  useJukeChanAnimator,
  type RigDomRefs,
} from "../../shared/jukechan/useJukeChanAnimator.ts";
import type { HitZone } from "../../shared/jukechan/params.ts";
import JukeChanArms from "./JukeChanArms.vue";
import JukeChanFx from "./JukeChanFx.vue";

const props = withDefaults(
  defineProps<{
    interactive?: boolean;
  }>(),
  {
    interactive: true,
  }
);

const emit = defineEmits<{
  (e: "zoneTap", zone: HitZone): void;
}>();

const uid = useId();
const id = (name: string) => `jc-${uid}-${name}`;

const {
  currentMood,
  awareness,
  activeFx,
  fxTriggerId,
  onZoneTap,
} = useJukeChanMood();

// Template refs for direct 60fps SVG transform writes
const rootGroup = ref<SVGGElement | null>(null);
const bodyGroup = ref<SVGGElement | null>(null);
const headGroup = ref<SVGGElement | null>(null);
const bangsGroup = ref<SVGGElement | null>(null);
const sideLGroup = ref<SVGGElement | null>(null);
const sideRGroup = ref<SVGGElement | null>(null);
const backHairGroup = ref<SVGGElement | null>(null);
const ahogeGroup = ref<SVGGElement | null>(null);
const irisLGroup = ref<SVGGElement | null>(null);
const irisRGroup = ref<SVGGElement | null>(null);

const domRefs = reactive<RigDomRefs>({
  rootGroup: null,
  bodyGroup: null,
  headGroup: null,
  bangsGroup: null,
  sideLGroup: null,
  sideRGroup: null,
  backHairGroup: null,
  ahogeGroup: null,
  irisLGroup: null,
  irisRGroup: null,
  upperLidL: null,
  upperLidR: null,
  browL: null,
  browR: null,
});

watch(
  [
    rootGroup,
    bodyGroup,
    headGroup,
    bangsGroup,
    sideLGroup,
    sideRGroup,
    backHairGroup,
    ahogeGroup,
    irisLGroup,
    irisRGroup,
  ],
  () => {
    domRefs.rootGroup = rootGroup.value;
    domRefs.bodyGroup = bodyGroup.value;
    domRefs.headGroup = headGroup.value;
    domRefs.bangsGroup = bangsGroup.value;
    domRefs.sideLGroup = sideLGroup.value;
    domRefs.sideRGroup = sideRGroup.value;
    domRefs.backHairGroup = backHairGroup.value;
    domRefs.ahogeGroup = ahogeGroup.value;
    domRefs.irisLGroup = irisLGroup.value;
    domRefs.irisRGroup = irisRGroup.value;
  },
  { immediate: true }
);

const { params } = useJukeChanAnimator(domRefs, {
  interactive: props.interactive,
});

function handleHitZone(zone: HitZone, ev: MouseEvent) {
  if (!props.interactive) return;
  ev.stopPropagation();
  onZoneTap(zone);
  emit("zoneTap", zone);
}
</script>

<template>
  <svg
    viewBox="0 0 400 525"
    class="jukechan-rig-svg w-full h-full overflow-visible select-none filter drop-shadow-[0_14px_28px_rgba(0,0,0,0.65)]"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <!-- Cel-Shaded Skin Gradients -->
      <linearGradient :id="id('skinBase')" x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" stop-color="#fff4ec" />
        <stop offset="65%" stop-color="#ffe6d6" />
        <stop offset="100%" stop-color="#f7ccb8" />
      </linearGradient>
      <linearGradient :id="id('skinShadow')" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#e8b09b" />
        <stop offset="100%" stop-color="#d4917a" />
      </linearGradient>
      <radialGradient :id="id('blushGrad')" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff4d7e" stop-opacity="0.72" />
        <stop offset="70%" stop-color="#ff7597" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#ff7597" stop-opacity="0" />
      </radialGradient>

      <!-- Mood-Adaptive Cel-Shaded Hair Gradients -->
      <linearGradient :id="id('hairBack')" x1="0%" y1="0%" x2="10%" y2="100%">
        <stop offset="0%" stop-color="#191130" />
        <stop offset="58%" stop-color="#2c1b52" />
        <stop offset="100%" :stop-color="currentMood.secondary" />
      </linearGradient>
      <linearGradient :id="id('hairMain')" x1="15%" y1="0%" x2="85%" y2="100%">
        <stop offset="0%" stop-color="#5d36a3" />
        <stop offset="48%" stop-color="#3c1f78" />
        <stop offset="84%" stop-color="#281354" />
        <stop offset="100%" :stop-color="currentMood.primary" />
      </linearGradient>

      <!-- Multi-Layered Jewel Anime Iris -->
      <linearGradient :id="id('irisGrad')" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#140826" />
        <stop offset="30%" stop-color="#5a189a" />
        <stop offset="70%" :stop-color="currentMood.secondary" />
        <stop offset="100%" :stop-color="currentMood.primary" />
      </linearGradient>

      <!-- Streetwear Hoodie & Headphone Metal -->
      <linearGradient :id="id('hoodieBody')" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e1836" />
        <stop offset="60%" stop-color="#141026" />
        <stop offset="100%" stop-color="#0c0918" />
      </linearGradient>
      <linearGradient :id="id('headphoneMetal')" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b3154" />
        <stop offset="50%" stop-color="#1d1630" />
        <stop offset="100%" stop-color="#100b1c" />
      </linearGradient>

      <!-- Eye Sclera Clip Paths so Iris & Eyelid stay cleanly inside eye contour -->
      <clipPath :id="id('eyeClipL')">
        <path d="M 129 203 C 133 184, 173 183, 179 204 C 176 225, 136 226, 129 203 Z" />
      </clipPath>
      <clipPath :id="id('eyeClipR')">
        <path d="M 217 204 C 222 183, 261 184, 265 203 C 258 226, 220 225, 217 204 Z" />
      </clipPath>
    </defs>

    <g ref="rootGroup">
      <!-- ================================================================= -->
      <!-- 1. BACK HAIR LAYER (Secondary Spring Physics)                     -->
      <!-- ================================================================= -->
      <g ref="backHairGroup" class="pointer-events-none">
        <path
          d="M 118 135 C 68 195, 52 310, 64 475 C 88 465, 108 430, 118 390 L 290 395 C 304 435, 322 465, 344 472 C 362 340, 348 205, 294 140 Z"
          :fill="`url(#${id('hairBack')})`"
          stroke="#120924"
          stroke-width="2.8"
          stroke-linejoin="round"
        />
        <!-- Layered dark inner hair depth -->
        <path
          d="M 82 255 C 58 325, 50 405, 64 475 C 78 455, 92 420, 96 375 C 88 335, 84 295, 82 255 Z"
          fill="#180e2e"
          opacity="0.72"
        />
        <path
          d="M 312 245 C 338 315, 346 400, 344 472 C 325 450, 312 415, 304 370 Z"
          fill="#180e2e"
          opacity="0.72"
        />
        <!-- Mood Rim Light Strands -->
        <path
          d="M 68 310 C 60 365, 60 420, 66 465"
          fill="none"
          :stroke="currentMood.primary"
          stroke-width="2"
          stroke-linecap="round"
          opacity="0.65"
        />
        <path
          d="M 336 300 C 344 360, 345 415, 342 462"
          fill="none"
          :stroke="currentMood.secondary"
          stroke-width="2"
          stroke-linecap="round"
          opacity="0.65"
        />
      </g>

      <!-- ================================================================= -->
      <!-- 2. TORSO, NECK, HOODIE & ARMS LAYER (Breathing + Sway + Bounce)   -->
      <!-- ================================================================= -->
      <g ref="bodyGroup">
        <!-- Slender 3/4 Anime Neck + Clavicle + Cast Shadow -->
        <path
          d="M 176 286 C 177 315, 168 336, 142 348 L 262 352 C 238 338, 228 316, 226 286 Z"
          :fill="`url(#${id('skinBase')})`"
          stroke="#241332"
          stroke-width="2.4"
        />
        <path
          d="M 176 288 C 186 304, 214 306, 226 290 C 226 312, 212 326, 194 331 C 182 325, 176 308, 176 288 Z"
          :fill="`url(#${id('skinShadow')})`"
        />
        <path
          d="M 162 344 Q 186 353 196 349 M 210 349 Q 224 353 244 345"
          fill="none"
          stroke="#d4917a"
          stroke-width="2"
          stroke-linecap="round"
        />

        <!-- Techwear DJ Hoodie Torso (3/4 Perspective) -->
        <path
          d="M 58 515 C 64 415, 92 365, 140 346 C 168 364, 232 366, 264 348 C 312 366, 338 415, 344 515 Z"
          :fill="`url(#${id('hoodieBody')})`"
          stroke="#090612"
          stroke-width="3"
          stroke-linejoin="round"
        />

        <!-- Inner Shirt & Cyber Choker -->
        <path
          d="M 152 348 Q 200 374 252 350 Q 228 386 198 386 Q 170 385 152 348 Z"
          fill="#0d0a1a"
          stroke="#2d234a"
          stroke-width="2"
        />
        <path
          d="M 177 328 Q 201 335 225 329"
          fill="none"
          stroke="#140f24"
          stroke-width="6"
          stroke-linecap="round"
        />
        <path
          d="M 179 328 Q 201 335 223 329"
          fill="none"
          :stroke="currentMood.primary"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <circle
          cx="201"
          cy="333"
          r="4"
          :fill="currentMood.secondary"
          stroke="#ffffff"
          stroke-width="1"
        />

        <!-- Bulky Anime Hoodie Collar Flaps + Neon Piping -->
        <path
          d="M 118 356 C 128 334, 152 336, 166 368 L 198 398 L 142 406 C 122 392, 114 374, 118 356 Z"
          fill="#251d42"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 284 358 C 274 336, 250 338, 234 368 L 198 398 L 258 408 C 278 394, 288 376, 284 358 Z"
          fill="#1d1636"
          stroke="#090612"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path
          d="M 124 362 L 146 398 L 198 394 L 252 400 L 278 364"
          fill="none"
          :stroke="currentMood.secondary"
          stroke-width="2.8"
          stroke-linecap="round"
          class="neon-glow"
        />

        <!-- Hoodie Drawstrings -->
        <path
          d="M 178 392 C 174 425, 172 452, 175 475"
          fill="none"
          :stroke="currentMood.primary"
          stroke-width="2.8"
          stroke-linecap="round"
        />
        <path
          d="M 218 392 C 222 425, 224 448, 221 470"
          fill="none"
          :stroke="currentMood.primary"
          stroke-width="2.8"
          stroke-linecap="round"
        />
        <rect x="171" y="470" width="8" height="14" rx="3" :fill="currentMood.secondary" />
        <rect x="217" y="465" width="8" height="14" rx="3" :fill="currentMood.secondary" />

        <!-- Chest Equalizer Bars (3/4 Skew) -->
        <g transform="translate(154, 422) skewY(-2)">
          <rect
            class="eq-bar"
            x="0"
            y="8"
            width="11"
            height="46"
            rx="4"
            :fill="currentMood.secondary"
          />
          <rect
            class="eq-bar"
            x="16"
            y="4"
            width="11"
            height="50"
            rx="4"
            :fill="currentMood.primary"
            style="animation-delay: 0.14s"
          />
          <rect
            class="eq-bar"
            x="32"
            y="10"
            width="11"
            height="44"
            rx="4"
            :fill="currentMood.secondary"
            style="animation-delay: 0.28s"
          />
          <rect
            class="eq-bar"
            x="48"
            y="2"
            width="11"
            height="52"
            rx="4"
            :fill="currentMood.primary"
            style="animation-delay: 0.08s"
          />
          <rect
            class="eq-bar"
            x="64"
            y="12"
            width="11"
            height="42"
            rx="4"
            :fill="currentMood.secondary"
            style="animation-delay: 0.22s"
          />
          <rect
            class="eq-bar"
            x="80"
            y="16"
            width="11"
            height="38"
            rx="4"
            :fill="currentMood.primary"
            style="animation-delay: 0.34s"
          />
        </g>

        <!-- Body Hit-Zone (Torso) -->
        <path
          v-if="interactive"
          d="M 65 350 L 335 350 L 340 515 L 60 515 Z"
          fill="transparent"
          class="cursor-pointer"
          @click="(e) => handleHitZone('body', e)"
        >
          <title>Sentuh Juke-chan untuk mengobrol!</title>
        </path>
      </g>

      <!-- ================================================================= -->
      <!-- 3. SCULPTED 3/4 ANIME HEAD, FACE, EYES, MOUTH, HAIR & GEAR        -->
      <!-- ================================================================= -->
      <g ref="headGroup">
        <!-- Headphone Band Arch -->
        <path
          d="M 96 190 C 86 62, 304 58, 300 190"
          fill="none"
          :stroke="`url(#${id('headphoneMetal')})`"
          stroke-width="20"
          stroke-linecap="round"
        />
        <path
          d="M 102 172 C 96 70, 296 66, 294 172"
          fill="none"
          :stroke="currentMood.primary"
          stroke-width="4.5"
          stroke-linecap="round"
          class="neon-glow"
        />

        <!-- Right Ear (3/4 view) -->
        <path
          d="M 278 198 C 292 196, 296 218, 282 232 C 276 236, 272 230, 274 222 Z"
          :fill="`url(#${id('skinBase')})`"
          stroke="#3d1e36"
          stroke-width="2"
        />

        <!-- Sculpted 3/4 Anime Face Contour -->
        <path
          d="M 196 86 C 252 86, 284 126, 282 184 C 281 214, 276 240, 263 260 C 246 282, 216 300, 195 304 C 175 300, 144 282, 128 260 C 116 244, 112 228, 115 210 C 117 198, 114 188, 116 174 C 118 124, 144 86, 196 86 Z"
          :fill="`url(#${id('skinBase')})`"
          stroke="#2b142c"
          stroke-width="2.6"
          stroke-linejoin="round"
        />

        <!-- Puffed Out Cheek Bulge when Pouting (Ngambek) -->
        <g v-if="params.cheekPuff > 0.4">
          <path
            d="M 116 218 C 96 226, 96 258, 124 264"
            :fill="`url(#${id('skinBase')})`"
            stroke="#2b142c"
            stroke-width="2.6"
            stroke-linecap="round"
          />
          <path
            d="M 122 228 C 110 236, 110 250, 122 256"
            fill="none"
            stroke="#ff5c8a"
            stroke-width="2"
            stroke-linecap="round"
            opacity="0.78"
          />
        </g>

        <!-- Cel-Shaded Temple & Jawline Shadow -->
        <path
          d="M 272 145 C 282 185, 276 232, 260 258 C 245 280, 216 297, 195 302 C 218 292, 244 272, 256 248 C 268 222, 272 180, 264 145 Z"
          fill="#ebbaa6"
          opacity="0.65"
        />

        <!-- Cheek Blush + Anime Blush Slash Marks -->
        <g :opacity="Math.min(1, 0.35 + params.blush * 0.75)">
          <ellipse cx="144" cy="236" rx="26" ry="14" :fill="`url(#${id('blushGrad')})`" />
          <ellipse cx="250" cy="236" rx="24" ry="13" :fill="`url(#${id('blushGrad')})`" />
          <g stroke="#ff5c8a" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
            <line x1="136" y1="234" x2="140" y2="240" />
            <line x1="143" y1="233" x2="147" y2="239" />
            <line x1="150" y1="234" x2="154" y2="240" />
            <line x1="244" y1="234" x2="248" y2="240" />
            <line x1="251" y1="233" x2="255" y2="239" />
          </g>
        </g>

        <!-- =============================================================== -->
        <!-- EYES: Happy Arch (^ ^) vs Asleep Closed vs Open Multi-Layer     -->
        <!-- =============================================================== -->
        <!-- A. Happy Arched Eyes (^ ^) -->
        <g v-if="params.eyeSmile > 0.5">
          <path
            d="M 126 208 C 138 186, 168 186, 178 208"
            fill="none"
            stroke="#1d0c2e"
            stroke-width="4.8"
            stroke-linecap="round"
          />
          <path
            d="M 126 206 L 118 200 M 132 196 L 126 189"
            stroke="#1d0c2e"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <path
            d="M 218 208 C 228 186, 258 186, 270 208"
            fill="none"
            stroke="#1d0c2e"
            stroke-width="4.8"
            stroke-linecap="round"
          />
          <path
            d="M 270 206 L 278 200 M 264 196 L 270 189"
            stroke="#1d0c2e"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </g>

        <!-- B. Closed / Blinking / Asleep Eyes -->
        <g v-else-if="params.eyeOpenL < 0.14">
          <path
            d="M 127 208 Q 154 218 179 206"
            fill="none"
            stroke="#1d0c2e"
            stroke-width="4.2"
            stroke-linecap="round"
          />
          <path
            d="M 129 209 L 121 214 M 142 213 L 138 219"
            stroke="#1d0c2e"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <path
            d="M 217 206 Q 242 218 269 208"
            fill="none"
            stroke="#1d0c2e"
            stroke-width="4.2"
            stroke-linecap="round"
          />
          <path
            d="M 267 209 L 275 214 M 254 213 L 258 219"
            stroke="#1d0c2e"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </g>

        <!-- C. Open 4-Layer Jewel Anime Eyes with Dynamic Lid & Gaze -->
        <g v-else>
          <!-- Eyelid creases -->
          <path
            d="M 130 184 Q 154 175 178 186 M 218 186 Q 242 175 264 185"
            fill="none"
            stroke="#8c5363"
            stroke-width="1.8"
            stroke-linecap="round"
          />

          <!-- LEFT EYE -->
          <g :clip-path="`url(#${id('eyeClipL')})`">
            <path
              d="M 129 203 C 133 184, 173 183, 179 204 C 176 225, 136 226, 129 203 Z"
              fill="#ffffff"
            />
            <path
              d="M 129 203 C 133 184, 173 183, 179 204 C 172 194, 138 194, 129 203 Z"
              fill="#d8cce8"
            />
            <g ref="irisLGroup">
              <ellipse cx="155" cy="205" rx="15.5" ry="17.5" fill="#1a0933" />
              <ellipse cx="155" cy="206" rx="14" ry="16" :fill="`url(#${id('irisGrad')})`" />
              <path
                d="M 143 210 A 12 12 0 0 0 167 210 A 12 14 0 0 1 143 210 Z"
                :fill="currentMood.primary"
                opacity="0.65"
              />
              <ellipse cx="155" cy="205" rx="6.5" ry="8" fill="#120624" />
              <!-- Special Eye Overlays (Heart / Star / Spiral) or Signature ♪ -->
              <text
                v-if="params.eyeSpecial === 'heart'"
                x="147"
                y="211"
                font-size="14"
                fill="#ff7597"
              >
                ♥
              </text>
              <text
                v-else-if="params.eyeSpecial === 'star'"
                x="147"
                y="211"
                font-size="14"
                fill="#fde047"
              >
                ★
              </text>
              <text
                v-else-if="params.eyeSpecial === 'spiral'"
                x="147"
                y="211"
                font-size="14"
                fill="#ffffff"
              >
                ＠
              </text>
              <text
                v-else
                x="150"
                y="210"
                font-family="serif"
                font-size="13"
                font-weight="bold"
                fill="#ffffff"
                opacity="0.92"
              >
                ♪
              </text>
              <!-- Catchlights -->
              <circle cx="145" cy="195" r="5.4" fill="#ffffff" />
              <circle cx="164" cy="214" r="2.7" fill="#ffffff" />
              <circle cx="143" cy="212" r="1.5" :fill="currentMood.primary" />
            </g>
            <!-- Half-Lidded Eyelid Mask for Sleepy / Pout / Annoyed / Lo-Fi -->
            <rect
              v-if="params.eyeOpenL < 0.88"
              x="122"
              y="178"
              width="62"
              :height="Math.max(0, (1 - params.eyeOpenL) * 34)"
              :fill="`url(#${id('skinBase')})`"
            />
          </g>

          <!-- RIGHT EYE -->
          <g :clip-path="`url(#${id('eyeClipR')})`">
            <path
              d="M 217 204 C 222 183, 261 184, 265 203 C 258 226, 220 225, 217 204 Z"
              fill="#ffffff"
            />
            <path
              d="M 217 204 C 222 183, 261 184, 265 203 C 256 194, 224 194, 217 204 Z"
              fill="#d8cce8"
            />
            <g ref="irisRGroup">
              <ellipse cx="241" cy="205" rx="15" ry="17.5" fill="#1a0933" />
              <ellipse cx="241" cy="206" rx="13.5" ry="16" :fill="`url(#${id('irisGrad')})`" />
              <path
                d="M 229 210 A 12 12 0 0 0 253 210 A 12 14 0 0 1 229 210 Z"
                :fill="currentMood.primary"
                opacity="0.65"
              />
              <ellipse cx="241" cy="205" rx="6.2" ry="8" fill="#120624" />
              <text
                v-if="params.eyeSpecial === 'heart'"
                x="233"
                y="211"
                font-size="14"
                fill="#ff7597"
              >
                ♥
              </text>
              <text
                v-else-if="params.eyeSpecial === 'star'"
                x="233"
                y="211"
                font-size="14"
                fill="#fde047"
              >
                ★
              </text>
              <text
                v-else-if="params.eyeSpecial === 'spiral'"
                x="233"
                y="211"
                font-size="14"
                fill="#ffffff"
              >
                ＠
              </text>
              <text
                v-else
                x="236"
                y="210"
                font-family="serif"
                font-size="13"
                font-weight="bold"
                fill="#ffffff"
                opacity="0.92"
              >
                ♪
              </text>
              <circle cx="231" cy="195" r="5.2" fill="#ffffff" />
              <circle cx="249" cy="214" r="2.6" fill="#ffffff" />
              <circle cx="230" cy="212" r="1.5" :fill="currentMood.primary" />
            </g>
            <rect
              v-if="params.eyeOpenR < 0.88"
              x="212"
              y="178"
              width="60"
              :height="Math.max(0, (1 - params.eyeOpenR) * 34)"
              :fill="`url(#${id('skinBase')})`"
            />
          </g>

          <!-- Calligraphic Upper Eyelashes & Lower Lash Line -->
          <path
            d="M 123 204 C 130 182, 172 180, 183 201 C 180 204, 178 204, 175 201 C 166 187, 136 188, 127 205 L 122 200 Z"
            fill="#190c26"
          />
          <path
            d="M 126 196 L 119 191 M 131 190 L 126 184"
            stroke="#190c26"
            stroke-width="2.4"
            stroke-linecap="round"
          />
          <path
            d="M 213 201 C 224 180, 264 182, 271 204 L 276 200 C 272 204, 268 205, 265 203 C 258 188, 228 187, 219 201 Z"
            fill="#190c26"
          />
          <path
            d="M 268 196 L 275 191 M 263 190 L 268 184"
            stroke="#190c26"
            stroke-width="2.4"
            stroke-linecap="round"
          />
          <path
            d="M 138 222 Q 155 226 171 221 M 225 221 Q 241 226 256 222"
            fill="none"
            stroke="#5e364f"
            stroke-width="1.8"
            stroke-linecap="round"
          />

          <!-- Shimmering Waterline Tears for Galau / Sad Mood -->
          <g v-if="params.eyeSpecial === 'tears' || currentMood.key === 'galau'">
            <path
              d="M 134 219 Q 155 228 175 219 Q 176 226 168 228 Q 152 231 134 224 Z"
              fill="#7dd3fc"
              opacity="0.82"
            />
            <circle cx="171" cy="225" r="3.6" fill="#bae6fd" />
            <circle cx="170" cy="224" r="1.4" fill="#ffffff" />
            <path
              d="M 221 219 Q 241 228 261 219 Q 262 226 254 228 Q 238 231 221 224 Z"
              fill="#7dd3fc"
              opacity="0.82"
            />
            <circle cx="226" cy="225" r="3.5" fill="#bae6fd" />
            <circle cx="225" cy="224" r="1.4" fill="#ffffff" />
          </g>
        </g>

        <!-- =============================================================== -->
        <!-- EXPRESSIVE EYEBROWS (Dynamic Height & Sad/Angry Tilt)           -->
        <!-- =============================================================== -->
        <g
          :transform="`translate(0, ${(-params.browY * 6).toFixed(1)})`"
          fill="none"
          stroke="#2a143d"
          stroke-width="3.2"
          stroke-linecap="round"
        >
          <path
            :d="
              params.browAngle > 0.35
                ? 'M 132 162 L 178 174'
                : params.browAngle < -0.35
                ? 'M 130 175 Q 154 169 176 160'
                : 'M 130 168 Q 154 160 176 167'
            "
          />
          <path
            :d="
              params.browAngle > 0.35
                ? 'M 262 162 L 216 174'
                : params.browAngle < -0.35
                ? 'M 220 160 Q 242 169 264 175'
                : 'M 220 167 Q 242 160 264 168'
            "
          />
        </g>

        <!-- Delicate 3/4 Anime Nose -->
        <path d="M 193 220 L 189 233 L 197 235 Z" fill="#e09f87" opacity="0.85" />
        <path
          d="M 193 220 L 189 233 L 195 235"
          fill="none"
          stroke="#4a2030"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="192" cy="229" r="1.5" fill="#ffffff" opacity="0.9" />

        <!-- =============================================================== -->
        <!-- MOUTH & LIP-SYNC (Pout / Singing Open + Yaeba Fang / Smile)     -->
        <!-- =============================================================== -->
        <!-- A. Squiggly Pout Mouth -->
        <g v-if="params.mouthShape === 'pout'">
          <path
            d="M 177 262 Q 186 256 194 263 Q 202 268 209 261"
            fill="none"
            stroke="#7a283b"
            stroke-width="2.8"
            stroke-linecap="round"
          />
        </g>

        <!-- B. Surprised / Sleepy Small 'o' Mouth -->
        <g v-else-if="params.mouthShape === 'o' && params.mouthOpen < 0.35">
          <ellipse
            cx="196"
            cy="263"
            rx="5.5"
            ry="6.5"
            fill="#7a1c30"
            stroke="#3d0e19"
            stroke-width="2"
          />
          <ellipse cx="196" cy="266" rx="3.5" ry="2.5" fill="#ff7597" />
        </g>

        <!-- C. Lip-Sync Open Singing / Speaking Mouth (with cute Yaeba fang) -->
        <g v-else-if="params.mouthOpen > 0.14">
          <path
            :d="`M 179 256 Q 187 261 196 256 Q 205 261 213 256 C 216 ${(266 + params.mouthOpen * 16).toFixed(1)}, 176 ${(266 + params.mouthOpen * 16).toFixed(1)}, 179 256 Z`"
            fill="#7a1c30"
            stroke="#3d0e19"
            stroke-width="2.2"
            stroke-linejoin="round"
          />
          <path
            :d="`M 184 ${(263 + params.mouthOpen * 5).toFixed(1)} Q 196 ${(258 + params.mouthOpen * 4).toFixed(1)} 208 ${(263 + params.mouthOpen * 5).toFixed(1)} C 205 ${(268 + params.mouthOpen * 11).toFixed(1)}, 187 ${(268 + params.mouthOpen * 11).toFixed(1)}, 184 ${(263 + params.mouthOpen * 5).toFixed(1)} Z`"
            fill="#ff7597"
          />
          <!-- Cute anime Yaeba fang -->
          <polygon points="204,257 208,264 211,257" fill="#ffffff" />
        </g>

        <!-- D. Closed Mouth: Sad Frown vs Cat Smile (:3) vs Confident Smile -->
        <g v-else>
          <path
            v-if="params.mouthForm < -0.15"
            d="M 184 266 Q 196 259 208 266"
            fill="none"
            stroke="#8f394c"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <path
            v-else-if="params.mouthShape === 'cat'"
            d="M 180 261 Q 188 268 196 260 Q 204 268 212 261"
            fill="none"
            stroke="#8f394c"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            v-else
            d="M 183 261 Q 196 269 209 260"
            fill="none"
            stroke="#8f394c"
            stroke-width="2.6"
            stroke-linecap="round"
          />
          <path
            d="M 190 267 Q 196 270 202 267"
            fill="none"
            stroke="#f4a2b8"
            stroke-width="1.6"
            stroke-linecap="round"
            opacity="0.8"
          />
        </g>

        <!-- =============================================================== -->
        <!-- SIDE-LOCKS & FRONT BANGS (Secondary Spring Physics)             -->
        <!-- =============================================================== -->
        <g ref="sideLGroup" class="pointer-events-none">
          <path
            d="M 118 128 C 92 172, 84 242, 98 345 C 106 322, 110 296, 112 268 C 115 298, 120 322, 128 338 C 122 275, 122 205, 132 138 Z"
            :fill="`url(#${id('hairMain')})`"
            stroke="#140a29"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
        </g>

        <g ref="sideRGroup" class="pointer-events-none">
          <path
            d="M 276 128 C 302 174, 308 242, 294 342 C 284 318, 280 292, 278 265 C 275 294, 270 316, 264 332 C 270 272, 270 205, 262 138 Z"
            :fill="`url(#${id('hairMain')})`"
            stroke="#140a29"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
        </g>

        <g ref="bangsGroup" class="pointer-events-none">
          <!-- Forehead Bangs Shadow -->
          <path
            d="M 122 162 C 135 184, 152 196, 158 175 C 168 192, 184 202, 194 182 C 204 196, 218 198, 226 176 C 238 194, 254 192, 266 168 L 266 150 L 122 150 Z"
            fill="#d99b84"
            opacity="0.45"
          />
          <!-- Sculpted Multi-Lock Bangs -->
          <path
            d="M 92 166 C 88 86, 138 48, 198 48 C 258 48, 308 84, 304 164 C 292 140, 282 126, 270 120 C 276 152, 270 184, 258 204 C 260 172, 252 144, 240 130 C 242 166, 232 192, 218 208 C 224 176, 218 146, 206 132 C 204 170, 196 194, 186 206 C 186 176, 182 148, 174 134 C 168 170, 156 196, 140 208 C 150 176, 148 146, 138 130 C 132 162, 122 186, 110 198 C 116 170, 114 144, 106 124 C 98 136, 94 150, 92 166 Z"
            :fill="`url(#${id('hairMain')})`"
            stroke="#140a29"
            stroke-width="2.6"
            stroke-linejoin="round"
          />
          <!-- Anime "Angel Ring" Specular Highlights -->
          <g fill="#e0aaff" opacity="0.78">
            <path d="M 132 106 Q 146 98 156 108 L 152 122 Q 142 114 128 120 Z" />
            <path d="M 168 98 Q 192 92 214 98 L 210 112 Q 190 106 166 112 Z" />
            <path d="M 228 102 Q 246 98 260 110 L 254 122 Q 242 112 224 114 Z" />
          </g>
          <g fill="#ffffff" opacity="0.86">
            <ellipse cx="144" cy="108" rx="6" ry="2.5" transform="rotate(-12 144 108)" />
            <ellipse cx="190" cy="100" rx="10" ry="3" />
            <ellipse cx="242" cy="108" rx="6" ry="2.5" transform="rotate(14 242 108)" />
          </g>

          <!-- Signature Vinyl Record Hairclip -->
          <g transform="translate(254, 124) rotate(12)">
            <circle cx="0" cy="0" r="15.5" fill="#0d0b14" :stroke="currentMood.primary" stroke-width="2" />
            <circle cx="0" cy="0" r="11.5" fill="none" stroke="#2d2640" stroke-width="1" />
            <circle cx="0" cy="0" r="8.5" fill="none" stroke="#2d2640" stroke-width="1" />
            <path
              d="M -10 -10 L -4 -4 M 4 4 L 10 10"
              stroke="#ffffff"
              stroke-width="1.8"
              opacity="0.45"
              stroke-linecap="round"
            />
            <circle cx="0" cy="0" r="5" :fill="currentMood.secondary" />
            <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
            <rect
              x="-21"
              y="-2"
              width="9"
              height="4"
              rx="2"
              :fill="currentMood.primary"
              stroke="#0d0b14"
              stroke-width="1"
            />
          </g>
        </g>

        <!-- Pro DJ Headphone Earcups (Left & Right) -->
        <g class="pointer-events-none">
          <g transform="translate(88, 206) rotate(-6)">
            <rect x="-18" y="-36" width="34" height="72" rx="16" fill="#120d24" stroke="#090612" stroke-width="2.6" />
            <rect x="-12" y="-32" width="26" height="64" rx="13" :fill="`url(#${id('headphoneMetal')})`" stroke="#4a3e6d" stroke-width="1.5" />
            <ellipse cx="2" cy="0" rx="7" ry="21" fill="#140c29" :stroke="currentMood.primary" stroke-width="2.5" class="neon-glow" />
            <ellipse cx="2" cy="0" rx="3" ry="11" :fill="currentMood.secondary" />
            <circle cx="2" cy="-24" r="2.2" fill="#ffffff" opacity="0.8" />
          </g>
          <g transform="translate(304, 206) rotate(6)">
            <rect x="-14" y="-34" width="30" height="68" rx="14" fill="#120d24" stroke="#090612" stroke-width="2.6" />
            <rect x="-10" y="-30" width="22" height="60" rx="11" :fill="`url(#${id('headphoneMetal')})`" stroke="#4a3e6d" stroke-width="1.5" />
            <ellipse cx="0" cy="0" rx="6" ry="19" fill="#140c29" :stroke="currentMood.primary" stroke-width="2.5" class="neon-glow" />
            <ellipse cx="0" cy="0" rx="2.5" ry="10" :fill="currentMood.secondary" />
          </g>
        </g>

        <!-- Expressive Waveform Ahoge (Spring-Driven) -->
        <g ref="ahogeGroup" class="pointer-events-none">
          <path
            d="M 196 52 C 178 10, 228 -2, 248 22 C 228 16, 206 26, 204 52 Z"
            :fill="`url(#${id('hairMain')})`"
            stroke="#140a29"
            stroke-width="2.2"
            stroke-linejoin="round"
          />
          <path
            d="M 199 42 C 192 20, 218 12, 234 20"
            fill="none"
            :stroke="currentMood.primary"
            stroke-width="1.8"
            stroke-linecap="round"
            opacity="0.85"
          />
        </g>

        <!-- =============================================================== -->
        <!-- INTERACTIVE HIT-ZONES ON HEAD (Ahoge, Crown, Earcups, Cheeks)   -->
        <!-- =============================================================== -->
        <g v-if="interactive">
          <!-- Ahoge Hit-Zone -->
          <circle
            cx="215"
            cy="26"
            r="30"
            fill="transparent"
            class="cursor-pointer"
            @click="(e) => handleHitZone('ahoge', e)"
          >
            <title>Sentil antena ahoge Juke-chan!</title>
          </circle>

          <!-- Headpat Crown Hit-Zone -->
          <ellipse
            cx="198"
            cy="105"
            rx="82"
            ry="48"
            fill="transparent"
            class="cursor-pointer"
            @click="(e) => handleHitZone('head', e)"
          >
            <title>Elus kepala Juke-chan ♪</title>
          </ellipse>

          <!-- Left & Right DJ Headphone Earcup Hit-Zones -->
          <rect
            x="64"
            y="166"
            width="44"
            height="82"
            rx="16"
            fill="transparent"
            class="cursor-pointer"
            @click="(e) => handleHitZone('headphone', e)"
          >
            <title>Cek headphone DJ Juke-chan 🎧</title>
          </rect>
          <rect
            x="284"
            y="166"
            width="42"
            height="82"
            rx="16"
            fill="transparent"
            class="cursor-pointer"
            @click="(e) => handleHitZone('headphone', e)"
          >
            <title>Cek headphone DJ Juke-chan 🎧</title>
          </rect>

          <!-- Cheek Pinch Hit-Zone -->
          <ellipse
            cx="196"
            cy="236"
            rx="78"
            ry="54"
            fill="transparent"
            class="cursor-pointer"
            @click="(e) => handleHitZone('cheek', e)"
          >
            <title>Colek pipi Juke-chan ~</title>
          </ellipse>
        </g>
      </g>

      <!-- ================================================================= -->
      <!-- 4. FOREGROUND ARMS & HANDS LAYER (Layered over Torso & Earcup)    -->
      <!-- ================================================================= -->
      <JukeChanArms
        :pose="params.armPose"
        :wave-phase="params.armWavePhase"
        :primary-color="currentMood.primary"
        :secondary-color="currentMood.secondary"
        :skin-url="`url(#${id('skinBase')})`"
      />

      <!-- ================================================================= -->
      <!-- 5. ANIME FX PARTICLES LAYER (Hearts, Notes, Anger 💢, Zzz)        -->
      <!-- ================================================================= -->
      <JukeChanFx
        :fx="activeFx"
        :trigger-id="fxTriggerId"
        :awareness="awareness"
        :primary-color="currentMood.primary"
        :secondary-color="currentMood.secondary"
      />
    </g>
  </svg>
</template>

<style scoped>
.neon-glow {
  filter: drop-shadow(0 0 6px currentColor);
  transition: stroke 0.35s ease, fill 0.35s ease;
}

.eq-bar {
  transform-box: fill-box;
  transform-origin: bottom;
  animation: eqBounce var(--beat-speed, 0.8s) ease-in-out infinite alternate;
}

g[ref] {
  will-change: transform;
}

@keyframes eqBounce {
  0% {
    transform: scaleY(0.28);
  }
  100% {
    transform: scaleY(1);
  }
}
</style>

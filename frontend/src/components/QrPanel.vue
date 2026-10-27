<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import QRCode from "qrcode";
import UiIcon from "./UiIcon.vue";

const props = withDefaults(
  defineProps<{
    url: string;
    lanUrl?: string;
    publicUrl?: string | null;
    tunnelMode?: string;
  }>(),
  {
    lanUrl: "",
    publicUrl: null,
    tunnelMode: "off",
  }
);

const emit = defineEmits<{
  (e: "selectMode", mode: "lan" | "public"): void;
}>();

const selectedMode = ref<"lan" | "public">(props.publicUrl ? "public" : "lan");

watch(
  () => props.publicUrl,
  (newVal) => {
    if (newVal) {
      selectedMode.value = "public";
    }
  }
);

const activeUrl = computed(() => {
  if (selectedMode.value === "public" && props.publicUrl) {
    return props.publicUrl;
  }
  return props.lanUrl || props.url;
});

const isPublic = computed(() => selectedMode.value === "public" && !!props.publicUrl);

const badgeText = computed(() => {
  if (isPublic.value) {
    if (props.tunnelMode === "quick" || props.publicUrl?.includes("trycloudflare.com")) {
      return "⚡ QUICK TUNNEL";
    }
    return "🌐 CUSTOM DOMAIN";
  }
  return "🏢 LAN MOBILE";
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const copied = ref(false);

async function renderQr() {
  if (!canvasRef.value || !activeUrl.value) return;
  try {
    await QRCode.toCanvas(canvasRef.value, activeUrl.value, {
      width: 96,
      margin: 1,
      color: {
        dark: "#ffffff",
        light: "#00000000",
      },
    });
  } catch (err) {
    console.warn("[qr] generation error:", err);
  }
}

watch(activeUrl, renderQr);
onMounted(renderQr);

function setMode(mode: "lan" | "public") {
  selectedMode.value = mode;
  emit("selectMode", mode);
}

function copyUrl() {
  if (!activeUrl.value) return;
  navigator.clipboard.writeText(activeUrl.value).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2200);
  });
}
</script>

<template>
  <div
    class="p5-qr-card relative bg-[#0b0b14] border-2 border-white p-3.5 sm:p-4 flex items-center gap-3.5 shadow-[6px_6px_0px_#000000] select-none overflow-hidden"
    style="transform: skewX(-2deg);"
  >
    <!-- Red Accent Corner Slash -->
    <div class="pointer-events-none absolute -top-6 -right-6 w-16 h-16 bg-[#e60012] rotate-45 opacity-90"></div>

    <!-- High-Contrast QR Frame -->
    <div
      class="relative shrink-0 bg-black border-2 border-white p-1.5 flex items-center justify-center shadow-[3px_3px_0px_#e60012]"
      style="transform: skewX(2deg);"
    >
      <canvas ref="canvasRef"></canvas>
    </div>

    <!-- Info & Controls -->
    <div class="flex-1 min-w-0 flex flex-col gap-1.5" style="transform: skewX(2deg);">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 bg-[#e60012] rotate-45"></span>
          <h4 class="text-xs sm:text-sm font-black italic uppercase tracking-wider text-white">
            CONNECT COWORKERS // QR
          </h4>
        </div>

        <span
          class="px-2 py-0.5 border text-[9px] font-mono font-black uppercase tracking-wider shadow-[2px_2px_0px_#000]"
          :class="
            isPublic
              ? 'bg-[#10b981] text-black border-white'
              : 'bg-[#00e5ff] text-black border-black'
          "
          style="transform: skewX(-10deg);"
        >
          {{ badgeText }}
        </span>
      </div>

      <!-- Mode Switcher (Visible when public tunnel is active alongside LAN) -->
      <div v-if="publicUrl && lanUrl" class="flex items-center gap-1.5 my-0.5">
        <button
          type="button"
          class="flex-1 py-1 px-2 border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
          :class="
            selectedMode === 'lan'
              ? 'bg-[#e60012] text-white border-white shadow-[2px_2px_0px_#000]'
              : 'bg-black text-slate-400 border-white/30 hover:text-white'
          "
          style="transform: skewX(-10deg);"
          @click="setMode('lan')"
        >
          🏢 LAN WI-FI
        </button>
        <button
          type="button"
          class="flex-1 py-1 px-2 border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
          :class="
            selectedMode === 'public'
              ? 'bg-[#00e5ff] text-black border-white shadow-[2px_2px_0px_#000]'
              : 'bg-black text-slate-400 border-white/30 hover:text-white'
          "
          style="transform: skewX(-10deg);"
          @click="setMode('public')"
        >
          🌐 PUBLIC TUNNEL
        </button>
      </div>

      <p v-else class="text-[11px] font-medium text-slate-300 leading-tight">
        Scan QR untuk request lagu, voting, dan ikut minigame dari HP/laptop.
      </p>

      <!-- URL Copy Bar -->
      <div
        class="mt-0.5 bg-black border border-white/40 hover:border-[#00e5ff] px-2.5 py-1 flex items-center justify-between gap-2 cursor-pointer transition-colors group"
        style="transform: skewX(-6deg);"
        @click="copyUrl"
      >
        <span class="text-[11px] font-mono font-bold text-[#00e5ff] truncate select-all">
          {{ activeUrl }}
        </span>
        <button
          type="button"
          class="px-2 py-0.5 border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all cursor-pointer"
          :class="
            copied
              ? 'bg-[#10b981] text-black border-white'
              : 'bg-[#e60012] group-hover:bg-white text-white group-hover:text-black border-white'
          "
        >
          <UiIcon v-if="copied" name="check" :size="11" :strokeWidth="2.5" />
          <UiIcon v-else name="copy" :size="11" />
          <span>{{ copied ? "COPIED" : "COPY" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

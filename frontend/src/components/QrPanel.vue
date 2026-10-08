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

// Selected mode: default to public if publicUrl is provided, else lan
const selectedMode = ref<"lan" | "public">(props.publicUrl ? "public" : "lan");

// If publicUrl arrives dynamically (e.g. from quick tunnel runner), auto-switch to public
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
      return "⚡ Quick Tunnel";
    }
    return "🌐 Custom Domain";
  }
  return "🏢 LAN Mobile";
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const copied = ref(false);

async function renderQr() {
  if (!canvasRef.value || !activeUrl.value) return;
  try {
    await QRCode.toCanvas(canvasRef.value, activeUrl.value, {
      width: 120,
      margin: 1,
      color: {
        dark: "#f8fafc",
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
  <div class="qr-card glass-panel">
    <div class="qr-canvas-wrapper">
      <canvas ref="canvasRef"></canvas>
    </div>

    <div class="qr-info">
      <div class="qr-title-row">
        <h4>Connect Coworkers</h4>
        <span class="qr-badge" :class="{ 'is-public': isPublic }">{{ badgeText }}</span>
      </div>

      <!-- Mode Switcher (Visible when public tunnel is active alongside LAN) -->
      <div v-if="publicUrl && lanUrl" class="qr-mode-switch">
        <button
          type="button"
          class="mode-btn"
          :class="{ 'is-active': selectedMode === 'lan' }"
          @click="setMode('lan')"
        >
          🏢 LAN Wi-Fi
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ 'is-active': selectedMode === 'public' }"
          @click="setMode('public')"
        >
          🌐 Public Tunnel
        </button>
      </div>

      <p v-else>Scan to request, vote, and sing from any smartphone.</p>
      
      <div class="url-copy-box" @click="copyUrl">
        <span class="url-text">{{ activeUrl }}</span>
        <button class="copy-btn" :class="{ 'is-copied': copied }">
          <UiIcon v-if="copied" name="check" :size="13" :strokeWidth="2.5" />
          <UiIcon v-else name="copy" :size="13" />
          <span>{{ copied ? "Copied" : "Copy" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.15rem 1.35rem;
  background: rgba(14, 17, 26, 0.7);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.qr-canvas-wrapper {
  background: rgba(255, 255, 255, 0.04);
  padding: 0.45rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
}

.qr-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
  min-width: 0;
}

.qr-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.qr-title-row h4 {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.qr-badge {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-primary);
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: all var(--transition-fast);
}

.qr-badge.is-public {
  color: #34d399;
  background: rgba(52, 211, 153, 0.15);
  border-color: rgba(52, 211, 153, 0.4);
}

.qr-mode-switch {
  display: flex;
  gap: 0.3rem;
  margin: 0.2rem 0;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.mode-btn {
  flex: 1;
  padding: 0.25rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 6px;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.mode-btn:hover {
  color: #fff;
}

.mode-btn.is-active {
  color: #fff;
  background: rgba(99, 102, 241, 0.35);
  border: 1px solid rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
}

.qr-info p {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.url-copy-box {
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.3rem 0.45rem 0.3rem 0.85rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.url-copy-box:hover {
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(99, 102, 241, 0.4);
}

.url-text {
  font-size: 0.78rem;
  font-family: var(--font-mono);
  color: #a5b4fc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: all;
}

.copy-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.copy-btn:hover {
  background: var(--accent-primary);
  border-color: transparent;
  box-shadow: 0 0 14px -2px var(--accent-glow);
}

.copy-btn.is-copied {
  background: #10b981;
  border-color: transparent;
  color: #fff;
  box-shadow: 0 0 14px -2px rgba(16, 185, 129, 0.5);
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import QRCode from "qrcode";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  url: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const copied = ref(false);

async function renderQr() {
  if (!canvasRef.value || !props.url) return;
  try {
    await QRCode.toCanvas(canvasRef.value, props.url, {
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

watch(() => props.url, renderQr);
onMounted(renderQr);

function copyUrl() {
  if (!props.url) return;
  navigator.clipboard.writeText(props.url).then(() => {
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
        <span class="qr-badge">LAN Mobile</span>
      </div>
      <p>Scan to request, vote, and sing from any smartphone.</p>
      
      <div class="url-copy-box" @click="copyUrl">
        <span class="url-text">{{ url }}</span>
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
}

.qr-info p {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.url-copy-box {
  margin-top: 0.45rem;
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

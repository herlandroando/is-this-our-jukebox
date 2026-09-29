<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import QRCode from "qrcode";

const props = defineProps<{
  url: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const copied = ref(false);

async function renderQr() {
  if (!canvasRef.value || !props.url) return;
  try {
    await QRCode.toCanvas(canvasRef.value, props.url, {
      width: 140,
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

watch(() => props.url, renderQr);
onMounted(renderQr);

function copyUrl() {
  if (!props.url) return;
  navigator.clipboard.writeText(props.url).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>

<template>
  <div class="qr-card glass-panel">
    <div class="qr-canvas-wrapper">
      <canvas ref="canvasRef"></canvas>
    </div>

    <div class="qr-info">
      <h4>Connect Coworkers</h4>
      <p>Scan to request & upvote songs from your phone.</p>
      
      <div class="url-copy-box glass-pill" @click="copyUrl">
        <span class="url-text">{{ url }}</span>
        <button class="copy-btn">
          {{ copied ? "Copied ✓" : "Copy" }}
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
  padding: 1.1rem 1.25rem;
}

.qr-canvas-wrapper {
  background: rgba(255, 255, 255, 0.04);
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.qr-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
}

.qr-info h4 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.qr-info p {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.url-copy-box {
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem 0.35rem 0.85rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.url-copy-box:hover {
  background: rgba(255, 255, 255, 0.08);
}

.url-text {
  font-size: 0.78rem;
  font-family: "JetBrains Mono", monospace;
  color: var(--accent-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.copy-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.copy-btn:hover {
  background: var(--accent-primary);
}
</style>

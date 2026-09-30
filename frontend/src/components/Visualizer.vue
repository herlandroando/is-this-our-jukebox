<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

// Bar smoothing arrays
const barCount = 32;
const smoothedHeights = new Float32Array(barCount);

// Reusable frequency buffer and gradient
let cachedDataArray: Uint8Array<ArrayBuffer> | null = null;
let cachedGradient: CanvasGradient | null = null;

function getGradient(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
  if (!cachedGradient) {
    cachedGradient = ctx.createLinearGradient(0, height, 0, 0);
    cachedGradient.addColorStop(0, "rgba(99, 102, 241, 0.35)");
    cachedGradient.addColorStop(0.65, "rgba(139, 92, 246, 0.85)");
    cachedGradient.addColorStop(1, "rgba(217, 70, 239, 1)");
  }
  return cachedGradient;
}

function drawStaticBaseline() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const barGap = 3;
  const totalGaps = (barCount - 1) * barGap;
  const barWidth = Math.max(2, (width - totalGaps) / barCount);
  const baselineHeight = 3;

  for (let i = 0; i < barCount; i++) {
    smoothedHeights[i] = baselineHeight;
    const x = i * (barWidth + barGap);
    const y = height - baselineHeight;

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, baselineHeight, [2, 2, 0, 0]);
    ctx.fill();
  }
}

function render() {
  if (!props.isPlaying || !props.analyser) {
    stopAnimation();
    drawStaticBaseline();
    return;
  }

  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const barGap = 3;
  const totalGaps = (barCount - 1) * barGap;
  const barWidth = Math.max(2, (width - totalGaps) / barCount);

  const bufferLength = props.analyser.frequencyBinCount;
  if (!cachedDataArray || cachedDataArray.length !== bufferLength) {
    cachedDataArray = new Uint8Array(new ArrayBuffer(bufferLength));
  }
  props.analyser.getByteFrequencyData(cachedDataArray);

  const gradient = getGradient(ctx, height);

  for (let i = 0; i < barCount; i++) {
    // Sample frequency with slightly non-linear curve for punchier bass and audible mids
    const indexRatio = Math.pow(i / barCount, 1.25);
    const dataIndex = Math.min(
      bufferLength - 1,
      Math.floor(indexRatio * (bufferLength * 0.55))
    );
    const rawVal = cachedDataArray[dataIndex] || 0;
    const targetHeight = Math.max(3, (rawVal / 255) * (height - 2));

    // Smooth decay physics (rapid rise, smooth fall)
    if (targetHeight > smoothedHeights[i]) {
      smoothedHeights[i] = targetHeight;
    } else {
      smoothedHeights[i] += (targetHeight - smoothedHeights[i]) * 0.22;
    }

    const barHeight = smoothedHeights[i];
    const x = i * (barWidth + barGap);
    const y = height - barHeight;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
    ctx.fill();

    // Specular peak glow cap on energetic peaks
    if (barHeight > 10) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fillRect(x, y, barWidth, 1.5);
    }
  }

  animationFrameId = requestAnimationFrame(render);
}

function startAnimation() {
  if (animationFrameId === null && props.isPlaying && props.analyser) {
    animationFrameId = requestAnimationFrame(render);
  }
}

function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function updateAnimationState() {
  if (props.isPlaying && props.analyser) {
    startAnimation();
  } else {
    stopAnimation();
    drawStaticBaseline();
  }
}

watch(
  [() => props.isPlaying, () => props.analyser],
  () => {
    updateAnimationState();
  }
);

onMounted(() => {
  updateAnimationState();
});

onBeforeUnmount(() => {
  stopAnimation();
});
</script>

<template>
  <div class="visualizer-container">
    <canvas ref="canvasRef" width="240" height="38"></canvas>
  </div>
</template>

<style scoped>
.visualizer-container {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  opacity: 0.9;
  filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.25));
}

canvas {
  display: block;
}
</style>

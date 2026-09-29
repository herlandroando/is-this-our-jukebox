<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";

const props = defineProps<{
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const barCount = 28;
  const barWidth = Math.max(2, (width / barCount) - 3);

  if (props.isPlaying && props.analyser) {
    const bufferLength = props.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    props.analyser.getByteFrequencyData(dataArray);

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * (bufferLength / 2));
      const value = dataArray[dataIndex] || 0;
      const barHeight = Math.max(3, (value / 255) * height * 0.9);
      const x = i * (barWidth + 3);
      const y = height - barHeight;

      const gradient = ctx.createLinearGradient(0, height, 0, y);
      gradient.addColorStop(0, "rgba(99, 102, 241, 0.4)");
      gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.85)");
      gradient.addColorStop(1, "rgba(217, 70, 239, 1)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
  } else {
    // Subtle idle wave
    const time = Date.now() * 0.002;
    for (let i = 0; i < barCount; i++) {
      const wave = Math.sin(time + i * 0.3) * 0.5 + 0.5;
      const barHeight = 4 + wave * 6;
      const x = i * (barWidth + 3);
      const y = height - barHeight;

      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
  }

  animationFrameId = requestAnimationFrame(render);
}

onMounted(() => {
  render();
});

onBeforeUnmount(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <div class="visualizer-container">
    <canvas ref="canvasRef" width="220" height="42"></canvas>
  </div>
</template>

<style scoped>
.visualizer-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

canvas {
  display: block;
}
</style>

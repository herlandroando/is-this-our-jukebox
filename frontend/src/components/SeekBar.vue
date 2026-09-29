<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying?: boolean;
    canSeek?: boolean;
    compact?: boolean;
  }>(),
  {
    isPlaying: false,
    canSeek: true,
    compact: false,
  }
);

const emit = defineEmits<{
  (e: "seek", time: number): void;
  (e: "lockedClick"): void;
}>();

const trackRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragTime = ref(0);
const isHovering = ref(false);
const hoverTime = ref(0);
const hoverPercent = ref(0);

const displayTime = computed(() => {
  if (isDragging.value) return dragTime.value;
  return props.currentTime;
});

const progressPercent = computed(() => {
  const dur = props.duration;
  if (!dur || dur <= 0) return 0;
  return Math.min(100, Math.max(0, (displayTime.value / dur) * 100));
});

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTimeFromPointer(e: PointerEvent): number {
  if (!trackRef.value) return 0;
  const rect = trackRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const clampedX = Math.max(0, Math.min(rect.width, x));
  const pct = rect.width > 0 ? clampedX / rect.width : 0;
  return pct * (props.duration || 0);
}

function onPointerDown(e: PointerEvent) {
  if (!props.canSeek) {
    emit("lockedClick");
    return;
  }
  if (!trackRef.value) return;

  try {
    trackRef.value.setPointerCapture(e.pointerId);
  } catch {
    // Some browsers or test environments might not support setPointerCapture
  }

  isDragging.value = true;
  dragTime.value = getTimeFromPointer(e);
}

function onPointerMove(e: PointerEvent) {
  if (isDragging.value) {
    dragTime.value = getTimeFromPointer(e);
  } else if (props.canSeek && trackRef.value) {
    const rect = trackRef.value.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, x));
    hoverPercent.value = rect.width > 0 ? (clampedX / rect.width) * 100 : 0;
    hoverTime.value = (hoverPercent.value / 100) * (props.duration || 0);
  }
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging.value) return;
  try {
    if (trackRef.value && trackRef.value.hasPointerCapture(e.pointerId)) {
      trackRef.value.releasePointerCapture(e.pointerId);
    }
  } catch {
    // Ignore
  }

  const finalTime = getTimeFromPointer(e);
  isDragging.value = false;
  emit("seek", finalTime);
}

function onPointerCancel() {
  isDragging.value = false;
}

function onPointerEnter() {
  if (props.canSeek) {
    isHovering.value = true;
  }
}

function onPointerLeave() {
  isHovering.value = false;
}

// Keyboard arrow navigation
function onKeyDown(e: KeyboardEvent) {
  if (!props.canSeek) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    const target = Math.max(0, props.currentTime - 5);
    emit("seek", target);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    const target = Math.min(props.duration, props.currentTime + 5);
    emit("seek", target);
  }
}
</script>

<template>
  <div class="seekbar-root" :class="{ compact, seekable: canSeek }">
    <!-- Time display row -->
    <div class="time-row">
      <span class="current-time">{{ formatDuration(displayTime) }}</span>
      <span class="total-duration">{{ formatDuration(duration) }}</span>
    </div>

    <!-- Interactive Track Wrapper -->
    <div
      ref="trackRef"
      class="track-hitbox"
      role="slider"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="displayTime"
      :aria-label="'Audio seekbar'"
      :tabindex="canSeek ? 0 : -1"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @keydown="onKeyDown"
    >
      <!-- Hover time preview pill -->
      <div
        v-if="isHovering && !isDragging && canSeek && duration > 0"
        class="hover-tooltip"
        :style="{ left: `${hoverPercent}%` }"
      >
        {{ formatDuration(hoverTime) }}
      </div>

      <!-- Visible Track Background -->
      <div class="track-bg">
        <!-- Buffered/Fill Bar -->
        <div
          class="track-fill"
          :class="{ dragging: isDragging }"
          :style="{ width: `${progressPercent}%` }"
        ></div>

        <!-- Thumb Knob -->
        <div
          v-if="canSeek"
          class="track-thumb"
          :class="{ dragging: isDragging, hovering: isHovering }"
          :style="{ left: `${progressPercent}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seekbar-root {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.time-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-family: "JetBrains Mono", monospace;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.compact .time-row {
  font-size: 0.68rem;
  gap: 0.2rem;
}

.track-hitbox {
  position: relative;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: default;
  outline: none;
  touch-action: none;
}

.seekable .track-hitbox {
  cursor: pointer;
}

.track-bg {
  position: relative;
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-full);
  overflow: visible;
  transition: height 0.15s ease, background-color 0.15s ease;
}

.seekable .track-hitbox:hover .track-bg,
.seekable .track-hitbox:focus-visible .track-bg {
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
}

.track-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--accent-gradient, linear-gradient(135deg, #6366f1, #a855f7));
  border-radius: var(--radius-full);
  pointer-events: none;
  transition: width 0.05s linear;
}

.track-fill.dragging {
  transition: none;
}

.track-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5), 0 0 12px rgba(168, 85, 247, 0.4);
  transform: translate(-50%, -50%) scale(0);
  pointer-events: none;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease;
  z-index: 2;
}

.seekable .track-hitbox:hover .track-thumb,
.seekable .track-hitbox:focus-visible .track-thumb,
.track-thumb.dragging {
  transform: translate(-50%, -50%) scale(1);
}

.track-thumb.dragging {
  transform: translate(-50%, -50%) scale(1.25);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7), 0 0 18px rgba(168, 85, 247, 0.7);
}

.hover-tooltip {
  position: absolute;
  top: -22px;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  color: #fff;
  font-size: 0.68rem;
  font-family: "JetBrains Mono", monospace;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10;
}
</style>

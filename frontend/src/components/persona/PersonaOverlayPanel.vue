<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import UiIcon, { type IconName } from "../UiIcon.vue";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: IconName;
    badge?: string | number;
    color?: "red" | "cyan" | "purple";
  }>(),
  {
    subtitle: "",
    icon: undefined,
    badge: undefined,
    color: "red",
  }
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="persona-overlay-panel relative w-full h-full flex flex-col min-h-0 select-none">
    <!-- Persona 5 Slanted Header Bar -->
    <div class="relative z-20 flex items-center justify-between gap-3 mb-3 shrink-0">
      <!-- Title Trapezoid Banner -->
      <div
        class="relative bg-[#0b0b14] border-2 border-white px-4 py-2 flex items-center gap-3 overflow-hidden shadow-[5px_5px_0px_#000000]"
        style="transform: skewX(-14deg) rotate(-1.5deg);"
      >
        <!-- Accent Notch -->
        <div
          class="absolute left-0 top-0 bottom-0 w-3"
          :class="color === 'cyan' ? 'bg-[#00e5ff]' : color === 'purple' ? 'bg-[#d946ef]' : 'bg-[#e60012]'"
        ></div>

        <!-- Content -->
        <div class="relative z-10 flex items-center gap-2 pl-3" style="transform: skewX(14deg) rotate(1.5deg);">
          <UiIcon v-if="icon" :name="icon" :size="18" class="text-white shrink-0" />
          <div class="flex flex-col leading-tight">
            <span class="text-sm sm:text-base font-black italic tracking-wide text-white uppercase">
              {{ title }}
            </span>
            <span v-if="subtitle" class="text-[9px] sm:text-[10px] font-mono tracking-widest uppercase text-slate-400">
              {{ subtitle }}
            </span>
          </div>

          <span
            v-if="badge !== undefined"
            class="ml-2 px-2 py-0.5 rounded text-xs font-mono font-black bg-white/20 text-white border border-white/30 tabular-nums"
          >
            {{ badge }}
          </span>
        </div>
      </div>

      <!-- Persona 5 Controller Prompt: [O BACK] / [ESC] -->
      <button
        type="button"
        class="group relative bg-[#e60012] hover:bg-white text-white hover:text-black border-2 border-white px-3 sm:px-4 py-1.5 flex items-center gap-2 font-black text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95 shadow-[4px_4px_0px_#000000]"
        style="transform: skewX(-14deg) rotate(-1.5deg);"
        title="Tutup & Kembali ke Panggung Utama (Esc)"
        aria-label="Tutup & Kembali ke Panggung Utama (Esc)"
        @click="emit('close')"
      >
        <span class="flex items-center gap-1.5" style="transform: skewX(14deg) rotate(1.5deg);">
          <!-- Persona Controller Circle Button "O" -->
          <span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-black">
            O
          </span>
          <span>BACK</span>
          <span class="kbd-badge text-[9px] bg-black text-[#00e5ff] border-white/50 ml-1">ESC</span>
        </span>
      </button>
    </div>

    <!-- Slanted Main Content Stage -->
    <div
      class="relative z-10 flex-1 min-h-0 bg-[#0c0d16]/95 border-2 border-white p-3 sm:p-5 flex flex-col shadow-[8px_8px_0px_#000000] overflow-hidden"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.persona-overlay-panel {
  animation: p5PanelSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes p5PanelSlideIn {
  from {
    opacity: 0;
    transform: translateX(18px) skewX(-2deg);
  }
  to {
    opacity: 1;
    transform: translateX(0) skewX(0);
  }
}
</style>

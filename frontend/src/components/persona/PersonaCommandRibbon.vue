<script setup lang="ts">
import UiIcon, { type IconName } from "../UiIcon.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    sublabel?: string;
    icon?: IconName;
    color?: "red" | "cyan" | "yellow" | "white";
    active?: boolean;
    badge?: string | number;
    shortcut?: string;
    size?: "sm" | "md" | "lg";
  }>(),
  {
    sublabel: "",
    icon: undefined,
    color: "red",
    active: false,
    badge: undefined,
    shortcut: "",
    size: "md",
  }
);

const emit = defineEmits<{
  (e: "click"): void;
}>();
</script>

<template>
  <button
    type="button"
    class="p5-command-ribbon group relative text-left select-none transition-all duration-150 cursor-pointer"
    :aria-label="label"
    :aria-pressed="active"
    :class="[
      active ? 'scale-105 z-20' : 'hover:scale-[1.03] active:scale-[0.98] z-10',
      size === 'sm' ? 'h-9 px-3 text-xs' : size === 'lg' ? 'h-14 px-6 text-base' : 'h-11 sm:h-12 px-4 sm:px-5 text-sm sm:text-base',
    ]"
    @click="emit('click')"
  >
    <!-- Hard Black Shadow Shape (Angled Polygon) -->
    <div
      class="absolute inset-0 bg-black transition-transform duration-150"
      :class="[
        active ? 'translate-x-1.5 translate-y-1.5' : 'group-hover:translate-x-1.5 group-hover:translate-y-1.5 translate-x-1 translate-y-1',
      ]"
      style="transform: skewX(-14deg) rotate(-1.5deg);"
    ></div>

    <!-- Main Angled Surface -->
    <div
      class="relative h-full flex items-center justify-between gap-3 border-2 border-white transition-colors duration-150 overflow-hidden"
      :class="[
        active
          ? color === 'cyan' ? 'bg-[#00e5ff] text-black font-black' : 'bg-[#e60012] text-white font-black'
          : 'bg-[#0b0b14] text-white group-hover:bg-[#1a1828]',
      ]"
      style="transform: skewX(-14deg) rotate(-1.5deg);"
    >
      <!-- Left Accent Notch (Iconic Persona 5 sharp arrow indicator) -->
      <div
        class="absolute left-0 top-0 bottom-0 w-3 transition-colors duration-150"
        :class="[
          active
            ? 'bg-white'
            : color === 'cyan'
            ? 'bg-[#00e5ff] group-hover:w-4'
            : 'bg-[#e60012] group-hover:w-4',
        ]"
      ></div>

      <!-- Content (Counter-skewed for readability) -->
      <div
        class="relative z-10 flex items-center gap-2.5 pl-3 sm:pl-4 transition-transform duration-150 group-hover:translate-x-1"
        style="transform: skewX(14deg) rotate(1.5deg);"
      >
        <!-- Icon -->
        <UiIcon
          v-if="icon"
          :name="icon"
          :size="size === 'sm' ? 14 : size === 'lg' ? 20 : 16"
          class="shrink-0"
          :class="[active ? 'animate-pulse' : '']"
        />

        <!-- Title & Subtitle -->
        <div class="flex flex-col leading-tight min-w-0">
          <span
            class="font-black italic uppercase tracking-wider truncate"
            :class="size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'"
          >
            {{ label }}
          </span>
          <span
            v-if="sublabel"
            class="text-[9px] sm:text-[10px] font-mono tracking-widest uppercase opacity-85 truncate"
            :class="active ? 'text-white/90' : 'text-slate-400 group-hover:text-slate-200'"
          >
            {{ sublabel }}
          </span>
        </div>
      </div>

      <!-- Right Badges (Shortcut + Count) -->
      <div
        class="relative z-10 flex items-center gap-1.5 pr-2"
        style="transform: skewX(14deg) rotate(1.5deg);"
      >
        <!-- Numeric count badge -->
        <span
          v-if="badge !== undefined"
          class="px-1.5 py-0.5 rounded text-[10px] font-mono font-black tabular-nums border"
          :class="[
            active
              ? 'bg-black text-white border-white'
              : 'bg-white/10 text-white border-white/20 group-hover:bg-white/20',
          ]"
        >
          {{ badge }}
        </span>

        <!-- Controller Button Badge (Persona 5 style circle or diamond) -->
        <span
          v-if="shortcut"
          class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border shadow-sm shrink-0"
          :class="[
            active
              ? 'bg-black text-white border-white'
              : 'bg-[#e60012] text-white border-white group-hover:scale-110',
          ]"
        >
          {{ shortcut }}
        </span>
      </div>
    </div>
  </button>
</template>

<style scoped>
.p5-command-ribbon {
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.4));
}
</style>

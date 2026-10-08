<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../shared/ws.ts";
import { reactionSoundEngine } from "../shared/useReactionSound.ts";
import UiIcon from "./UiIcon.vue";

const props = withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const PRESET_EMOJIS = ["🔥", "❤️", "💃", "🎸", "💀", "🎉"];

const QUICK_CHIPS = [
  "SIKAT BRO! 🔥",
  "Nostalgia parah 🥹",
  "Volume naikin! 🔊",
  "Vibing pol 💃",
  "Lagu galau kantor 😭",
  "Gokil lagunya ⚡",
];

const currentCombo = ref(0);
const activeEmoji = ref("");
const isShoutoutOpen = ref(false);
const customShoutout = ref("");
const isSubmitting = ref(false);

let unsubscribeReaction: (() => void) | null = null;
let unsubscribeComboReset: (() => void) | null = null;

function onReactionTap(emoji: string) {
  const nextEstimatedCombo = currentCombo.value > 0 ? currentCombo.value + 1 : 1;
  reactionSoundEngine.playSound(emoji, nextEstimatedCombo);

  // Optimistic feedback
  currentCombo.value = nextEstimatedCombo;
  activeEmoji.value = emoji;

  // Send to server (shared room combo is managed on server)
  jukeboxClient.sendReaction(emoji, nextEstimatedCombo);
}

onMounted(() => {
  unsubscribeReaction = jukeboxClient.onReaction((item) => {
    currentCombo.value = item.combo;
    activeEmoji.value = item.emoji;
  });

  unsubscribeComboReset = jukeboxClient.onComboReset(() => {
    currentCombo.value = 0;
    activeEmoji.value = "";
  });
});

function sendShoutoutMessage(text: string) {
  const clean = text.trim();
  if (!clean || isSubmitting.value) return;

  isSubmitting.value = true;
  jukeboxClient.sendShoutout(clean);

  // Haptic feedback
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(15);
    } catch {}
  }

  customShoutout.value = "";
  isShoutoutOpen.value = false;
  setTimeout(() => {
    isSubmitting.value = false;
  }, 600);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendShoutoutMessage(customShoutout.value);
  }
}

onBeforeUnmount(() => {
  if (unsubscribeReaction) unsubscribeReaction();
  if (unsubscribeComboReset) unsubscribeComboReset();
});
</script>

<template>
  <div class="reaction-dock-container relative select-none">
    <!-- Main Dock Bar -->
    <div
      class="reaction-dock glass-panel px-2 sm:px-3 py-1.5 rounded-2xl flex items-center gap-1 sm:gap-1.5 shadow-xl border-white/10 backdrop-blur-xl"
    >
      <!-- Preset Emoji Buttons -->
      <div class="flex items-center gap-0.5 sm:gap-1">
        <button
          v-for="emoji in PRESET_EMOJIS"
          :key="emoji"
          type="button"
          class="reaction-btn relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-lg sm:text-xl hover:bg-white/10 active:scale-80 transition-all cursor-pointer"
          :class="{
            'bg-white/15 scale-110 shadow-[0_0_12px_rgba(255,255,255,0.2)]':
              activeEmoji === emoji && currentCombo > 1,
          }"
          :title="`React ${emoji}`"
          @click="onReactionTap(emoji)"
        >
          <span class="select-none transform transition-transform duration-75">{{ emoji }}</span>

          <!-- Active Combo Badge Indicator -->
          <span
            v-if="activeEmoji === emoji && currentCombo > 1"
            class="combo-pill absolute -top-2.5 -right-1 text-[9px] font-black px-1.5 py-0.2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-lg pointer-events-none animate-pulse"
          >
            x{{ currentCombo }}
          </span>
        </button>
      </div>

      <!-- Divider -->
      <div class="h-5 w-px bg-white/10 mx-0.5 shrink-0"></div>

      <!-- Shoutout Chat Trigger Button -->
      <button
        type="button"
        class="glass-pill px-2 sm:px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-white hover:border-white/20 active:scale-95 transition-all cursor-pointer shrink-0"
        :class="{ 'bg-indigo-600/30 border-indigo-400/40 text-indigo-200': isShoutoutOpen }"
        title="Send a quick shoutout message to the room"
        @click="isShoutoutOpen = !isShoutoutOpen"
      >
        <UiIcon name="message-square" :size="13" class="text-indigo-400" />
        <span class="hidden sm:inline">Shoutout</span>
      </button>

      <!-- Reaction Sound FX Mute Toggle -->
      <button
        type="button"
        class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 active:scale-90 transition-all cursor-pointer shrink-0"
        :title="
          reactionSoundEngine.isSoundEnabled.value
            ? 'Reaction sound FX is ON (click to mute)'
            : 'Reaction sound FX is OFF (click to unmute)'
        "
        @click="reactionSoundEngine.toggleSound()"
      >
        <UiIcon
          :name="reactionSoundEngine.isSoundEnabled.value ? 'volume-2' : 'volume-x'"
          :size="13"
          :class="{ 'text-indigo-400': reactionSoundEngine.isSoundEnabled.value }"
        />
      </button>
    </div>

    <!-- Shoutout Popover / Sheet -->
    <transition name="popover">
      <div
        v-if="isShoutoutOpen"
        class="shoutout-popover absolute bottom-full mb-2.5 right-0 z-50 w-[300px] sm:w-[360px] p-3.5 rounded-3xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.7)] flex flex-col gap-3"
      >
        <!-- Popover Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs font-black tracking-wide text-white uppercase">
            <UiIcon name="sparkles" :size="13" class="text-amber-400" />
            <span>Room Shoutout</span>
          </div>
          <button
            type="button"
            class="text-slate-400 hover:text-white text-xs p-1 cursor-pointer"
            @click="isShoutoutOpen = false"
          >
            <UiIcon name="x" :size="13" />
          </button>
        </div>

        <!-- Quick Preset Chips -->
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="chip in QUICK_CHIPS"
            :key="chip"
            type="button"
            class="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
            @click="sendShoutoutMessage(chip)"
          >
            {{ chip }}
          </button>
        </div>

        <!-- Custom Input & Send -->
        <div class="flex items-center gap-2 pt-1 border-t border-white/10">
          <input
            v-model="customShoutout"
            type="text"
            maxlength="60"
            placeholder="Ketik pesan singkat... (maks 60)"
            class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            @keydown="handleKeydown"
          />
          <button
            type="button"
            class="btn-primary px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!customShoutout.trim() || isSubmitting"
            @click="sendShoutoutMessage(customShoutout)"
          >
            <span>Kirim</span>
            <UiIcon name="send" :size="11" />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.reaction-btn {
  touch-action: manipulation;
}

.reaction-btn:active {
  transform: scale(0.86);
}

.popover-enter-active {
  transition: all 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.popover-leave-active {
  transition: all 150ms ease-out;
}

.popover-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

.popover-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}
</style>

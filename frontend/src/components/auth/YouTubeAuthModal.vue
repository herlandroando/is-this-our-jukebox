<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { jukeboxClient } from "../../shared/ws.ts";
import {
  getYouTubeAuthStatus,
  startYouTubeLogin,
  cancelYouTubeLogin,
  deleteYouTubeCookies,
} from "../../shared/api.ts";
import type { YouTubeCookieStatus } from "../../shared/types.ts";
import UiIcon from "../UiIcon.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const status = ref<YouTubeCookieStatus>({
  hasCookies: false,
  isLoggedIn: false,
  loginInProgress: false,
});

const isActionLoading = ref(false);
const errorMsg = ref("");
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Sinkronisasi status dari WebSocket real-time
const wsStatus = computed(() => jukeboxClient.youtubeAuthStatus.value);
watch(
  wsStatus,
  (newStatus) => {
    if (newStatus) {
      status.value = newStatus;
      isActionLoading.value = false;
    }
  },
  { immediate: true }
);

async function refreshStatus() {
  try {
    const res = await getYouTubeAuthStatus();
    status.value = res;
  } catch (err: any) {
    console.warn("[yt-auth] Error refreshing status:", err);
  }
}

async function handleStartLogin() {
  isActionLoading.value = true;
  errorMsg.value = "";
  try {
    const res = await startYouTubeLogin();
    if (!res.success) {
      errorMsg.value = res.message || "Gagal meluncurkan browser login.";
      isActionLoading.value = false;
    } else {
      status.value.loginInProgress = true;
      startPolling();
    }
  } catch (err: any) {
    errorMsg.value = err?.message || "Terjadi kesalahan saat memulai login.";
    isActionLoading.value = false;
  }
}

async function handleCancelLogin() {
  isActionLoading.value = true;
  try {
    await cancelYouTubeLogin();
    await refreshStatus();
  } catch (err: any) {
    console.warn("[yt-auth] Error cancelling login:", err);
  } finally {
    isActionLoading.value = false;
    stopPolling();
  }
}

async function handleDeleteCookies() {
  if (!confirm("Apakah Anda yakin ingin menghapus session cookies dan riwayat login YouTube yang tersimpan?")) {
    return;
  }
  isActionLoading.value = true;
  try {
    await deleteYouTubeCookies();
    await refreshStatus();
  } catch (err: any) {
    console.warn("[yt-auth] Error deleting cookies:", err);
  } finally {
    isActionLoading.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    await refreshStatus();
    if (!status.value.loginInProgress) {
      stopPolling();
      isActionLoading.value = false;
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      errorMsg.value = "";
      refreshStatus();
      if (status.value.loginInProgress) {
        startPolling();
      }
    } else {
      stopPolling();
    }
  }
);

onMounted(() => {
  if (props.isOpen) {
    refreshStatus();
  }
});

onBeforeUnmount(() => {
  stopPolling();
});

function formatFileSize(bytes?: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(ms?: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    @click.self="emit('close')"
  >
    <div
      class="glass-panel relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/98 to-black p-6 sm:p-7 flex flex-col gap-6"
    >
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <div
            class="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)] shrink-0"
          >
            <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path
                d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-black text-white tracking-tight leading-snug">
              YouTube Session & Anti-Bot
            </h2>
            <p class="text-xs text-slate-400 font-medium">
              Bypass verifikasi bot YouTube untuk pemutaran lagu label resmi
            </p>
          </div>
        </div>

        <button
          class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          @click="emit('close')"
        >
          <UiIcon name="x" :size="18" />
        </button>
      </div>

      <!-- Error Notification -->
      <div
        v-if="errorMsg"
        class="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5"
      >
        <svg class="w-4 h-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{{ errorMsg }}</span>
      </div>

      <!-- Status Card -->
      <div class="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Sesi:</span>

          <!-- Badge Active -->
          <span
            v-if="status.hasCookies && !status.loginInProgress"
            class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
          >
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Terhubung & Aktif</span>
          </span>

          <!-- Badge In Progress -->
          <span
            v-else-if="status.loginInProgress"
            class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          >
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>Menunggu Login...</span>
          </span>

          <!-- Badge Disconnected -->
          <span
            v-else
            class="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Belum Terhubung</span>
          </span>
        </div>

        <div v-if="status.hasCookies" class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/5">
          <div>
            <span class="text-slate-500 block">Ukuran File Cookies:</span>
            <span class="font-bold text-slate-200">{{ formatFileSize(status.fileSize) }}</span>
          </div>
          <div>
            <span class="text-slate-500 block">Terakhir Diperbarui:</span>
            <span class="font-bold text-slate-200">{{ formatDate(status.lastModified) }}</span>
          </div>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          {{ status.statusMessage || "YouTube session cookies memungkinkan pemutar langsung mengakses stream tanpa batas kuota atau blokir bot." }}
        </p>
      </div>

      <!-- Login in Progress Flow Guide -->
      <div
        v-if="status.loginInProgress"
        class="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col gap-3 text-xs text-indigo-200 leading-relaxed"
      >
        <div class="flex items-center gap-2 font-bold text-indigo-300 text-sm">
          <UiIcon name="external-link" :size="16" class="animate-bounce" />
          <span>Jendela Peramban Telah Dibuka</span>
        </div>
        <ol class="list-decimal list-inside space-y-1.5 text-slate-300">
          <li>Lihat jendela peramban (Chrome / Edge) yang muncul di layar.</li>
          <li>Login ke akun Google / YouTube Anda seperti biasa.</li>
          <li>Begitu login selesai, sistem akan <strong>otomatis mengekstrak cookies dan menutup peramban</strong>.</li>
        </ol>
        <div class="pt-2 flex justify-end">
          <button
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold active:scale-95 transition-all cursor-pointer border border-white/10"
            :disabled="isActionLoading"
            @click="handleCancelLogin"
          >
            Batalkan Sesi Login
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-else class="flex flex-col gap-3">
        <!-- Main Connect Button -->
        <button
          v-if="!status.hasCookies"
          class="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-sm tracking-wide shadow-[0_4px_20px_rgba(225,29,72,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          :disabled="isActionLoading"
          @click="handleStartLogin"
        >
          <UiIcon v-if="!isActionLoading" name="external-link" :size="18" />
          <span v-if="isActionLoading" class="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
          <span>{{ isActionLoading ? 'Membuka Browser...' : 'Buka Peramban & Login YouTube' }}</span>
        </button>

        <!-- Connected Actions -->
        <div v-else class="flex items-center gap-3">
          <button
            class="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs tracking-wide border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            :disabled="isActionLoading"
            @click="handleStartLogin"
          >
            <UiIcon name="sliders" :size="14" />
            <span>Perbarui / Ganti Akun</span>
          </button>

          <button
            class="py-3 px-4 rounded-2xl bg-red-950/40 hover:bg-red-900/50 text-red-300 font-bold text-xs tracking-wide border border-red-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            :disabled="isActionLoading"
            @click="handleDeleteCookies"
          >
            <UiIcon name="trash-2" :size="14" />
            <span>Hapus Cookies & Riwayat</span>
          </button>
        </div>

        <p class="text-[11px] text-slate-500 text-center leading-normal">
          Cookies dan riwayat sesi login disimpan secara lokal di mesin host ini dan dapat dibersihkan kapan saja.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>

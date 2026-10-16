<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { TriviaPresetItem } from "../../shared/types.ts";
import UiIcon, { type IconName } from "../UiIcon.vue";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "presetsChanged"): void;
}>();

const presets = ref<TriviaPresetItem[]>([]);
const isLoading = ref(false);
const syncingId = ref<string | null>(null);
const errorMessage = ref("");
const successMessage = ref("");

// Form state (add / edit)
const isFormOpen = ref(false);
const editingPresetId = ref<string | null>(null);
const formName = ref("");
const formDescription = ref("");
const formIcon = ref<IconName>("music");
const formPlaylistUrl = ref("");
const formIsSubmitting = ref(false);

const availableIcons: IconName[] = [
  "music",
  "flame",
  "sparkles",
  "heart",
  "disc",
  "radio",
  "crown",
  "star",
  "headphones",
  "list-music",
];

async function loadPresets() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const res = await fetch("/api/trivia/presets");
    if (res.ok) {
      presets.value = await res.json();
    } else {
      errorMessage.value = "Gagal memuat preset";
    }
  } catch (err: any) {
    errorMessage.value = err?.message || "Koneksi gagal";
  } finally {
    isLoading.value = false;
  }
}

function openAddForm() {
  editingPresetId.value = null;
  formName.value = "";
  formDescription.value = "";
  formIcon.value = "music";
  formPlaylistUrl.value = "";
  isFormOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function openEditForm(preset: TriviaPresetItem) {
  editingPresetId.value = preset.id;
  formName.value = preset.name;
  formDescription.value = preset.description;
  formIcon.value = (preset.icon as IconName) || "music";
  formPlaylistUrl.value = preset.playlistId
    ? `https://music.youtube.com/playlist?list=${preset.playlistId}`
    : "";
  isFormOpen.value = true;
  errorMessage.value = "";
  successMessage.value = "";
}

function closeForm() {
  isFormOpen.value = false;
  editingPresetId.value = null;
}

async function savePreset() {
  if (!formName.value.trim()) {
    errorMessage.value = "Nama kategori wajib diisi!";
    return;
  }

  formIsSubmitting.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const payload = {
      id: editingPresetId.value || `custom-${Date.now()}`,
      name: formName.value.trim(),
      description: formDescription.value.trim(),
      icon: formIcon.value,
      type: "playlist",
      playlistId: formPlaylistUrl.value.trim(),
    };

    const res = await fetch("/api/trivia/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      successMessage.value = "Preset berhasil disimpan!";
      closeForm();
      await loadPresets();
      emit("presetsChanged");
    } else {
      const data = await res.json().catch(() => ({}));
      errorMessage.value = data.error || "Gagal menyimpan preset.";
    }
  } catch (err: any) {
    errorMessage.value = err?.message || "Terjadi kesalahan jaringan.";
  } finally {
    formIsSubmitting.value = false;
  }
}

async function syncPreset(id: string) {
  syncingId.value = id;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    const res = await fetch(`/api/trivia/presets/${id}/sync`, { method: "POST" });
    const data = await res.json();
    if (res.ok && data.success) {
      successMessage.value = `Berhasil disinkronisasi! (${data.count} lagu sah dimuat)`;
      await loadPresets();
      emit("presetsChanged");
    } else {
      errorMessage.value = data.error || "Gagal sinkronisasi lagu dari playlist.";
    }
  } catch (err: any) {
    errorMessage.value = err?.message || "Koneksi terputus.";
  } finally {
    syncingId.value = null;
  }
}

async function deletePreset(id: string) {
  if (!confirm("Yakin ingin menghapus preset kategori ini?")) return;

  try {
    const res = await fetch(`/api/trivia/presets/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadPresets();
      emit("presetsChanged");
    }
  } catch (err) {
    console.error("deletePreset error:", err);
  }
}

function formatRelativeTime(ts?: number): string {
  if (!ts) return "Belum pernah";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return `${Math.floor(diffHour / 24)} hari lalu`;
}

onMounted(() => {
  if (props.isOpen) loadPresets();
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md"
    @click.self="emit('close')"
  >
    <div
      class="glass-panel w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden bg-obsidian-900/95 text-slate-100 animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <header class="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
            <UiIcon name="sliders" :size="20" />
          </div>
          <div>
            <h2 class="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              Kelola Preset Kategori Kuis
            </h2>
            <p class="text-xs text-slate-400">Atur link YouTube Music Playlist & kurasi lagu per-genre</p>
          </div>
        </div>
        <button
          class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition cursor-pointer text-slate-400 hover:text-white"
          @click="emit('close')"
        >
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <!-- Alert Notification -->
      <div v-if="successMessage" class="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
        <span>✨ {{ successMessage }}</span>
        <button @click="successMessage = ''" class="hover:text-white cursor-pointer"><UiIcon name="x" :size="14" /></button>
      </div>
      <div v-if="errorMessage" class="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
        <span>⚠️ {{ errorMessage }}</span>
        <button @click="errorMessage = ''" class="hover:text-white cursor-pointer"><UiIcon name="x" :size="14" /></button>
      </div>

      <!-- Scrollable Body -->
      <div class="p-5 overflow-y-auto space-y-4">
        
        <!-- Action Toolbar -->
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">
            Daftar Preset ({{ presets.length }})
          </span>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-indigo-600/30"
            @click="openAddForm"
          >
            <UiIcon name="plus" :size="14" />
            <span>Tambah Preset Baru</span>
          </button>
        </div>

        <!-- Add / Edit Form Modal Card -->
        <div v-if="isFormOpen" class="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/30 space-y-3 animate-in fade-in duration-150">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-indigo-300">
              {{ editingPresetId ? "✏️ Edit Preset Kategori" : "✨ Tambah Preset Kategori Baru" }}
            </h3>
            <button @click="closeForm" class="text-slate-400 hover:text-white cursor-pointer"><UiIcon name="x" :size="14" /></button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-400 mb-1">Nama Kategori *</label>
              <input
                v-model="formName"
                type="text"
                placeholder="Contoh: Pop Indo 2000-an"
                class="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-400 mb-1">Icon Kategori</label>
              <div class="flex items-center gap-1.5 overflow-x-auto py-1">
                <button
                  v-for="ic in availableIcons"
                  :key="ic"
                  type="button"
                  class="p-1.5 rounded border transition cursor-pointer"
                  :class="formIcon === ic ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'"
                  @click="formIcon = ic"
                >
                  <UiIcon :name="ic" :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-slate-400 mb-1">Deskripsi Singkat</label>
            <input
              v-model="formDescription"
              type="text"
              placeholder="Contoh: Hits Sheila On 7, Peterpan, Dewa 19"
              class="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-slate-400 mb-1">URL / ID YouTube Music Playlist</label>
            <input
              v-model="formPlaylistUrl"
              type="text"
              placeholder="https://music.youtube.com/playlist?list=PLxxxx atau PLxxxx"
              class="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
            <p class="text-[10px] text-slate-400 mt-1">Lagu akan diambil dari playlist publik ini dan otomatis disaring anti-album.</p>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
              @click="closeForm"
            >
              Batal
            </button>
            <button
              type="button"
              class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
              :disabled="formIsSubmitting"
              @click="savePreset"
            >
              {{ formIsSubmitting ? "Menyimpan..." : "Simpan Preset" }}
            </button>
          </div>
        </div>

        <!-- Presets List -->
        <div v-if="isLoading" class="py-8 text-center text-xs text-slate-400">
          Memuat daftar preset...
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="item in presets"
            :key="item.id"
            class="p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <!-- Left Info -->
            <div class="flex items-start gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5 sm:mt-0">
                <UiIcon :name="(item.icon as IconName) || 'music'" :size="16" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-xs sm:text-sm text-slate-100">{{ item.name }}</span>
                  <span
                    v-if="item.type === 'dynamic'"
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  >
                    Dinamis Ruangan
                  </span>
                  <span
                    v-else-if="item.songCount"
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300"
                  >
                    🎵 {{ item.songCount }} lagu siap
                  </span>
                  <span
                    v-else
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300"
                  >
                    ⏳ Belum disinkron
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{{ item.description }}</p>
                <div v-if="item.type === 'playlist'" class="flex items-center gap-2 text-[10px] text-slate-500 mt-1 font-mono">
                  <span>ID: {{ item.playlistId?.slice(0, 18) }}...</span>
                  <span>• Sync: {{ formatRelativeTime(item.lastSyncedAt) }}</span>
                </div>
              </div>
            </div>

            <!-- Right Actions -->
            <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
              <button
                v-if="item.type === 'playlist'"
                type="button"
                title="Tarik lagu terbaru dari YouTube Music sekarang"
                class="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
                :disabled="syncingId === item.id"
                @click="syncPreset(item.id)"
              >
                <span v-if="syncingId === item.id" class="inline-block animate-spin">🔄</span>
                <span v-else>🔄</span>
                <span class="text-[11px] font-semibold">Sync</span>
              </button>

              <button
                type="button"
                title="Edit preset"
                class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                @click="openEditForm(item)"
              >
                <UiIcon name="sliders" :size="14" />
              </button>

              <button
                v-if="!item.isBuiltin"
                type="button"
                title="Hapus preset kustom"
                class="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition active:scale-95 cursor-pointer"
                @click="deletePreset(item.id)"
              >
                <UiIcon name="trash-2" :size="14" />
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <footer class="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 bg-white/[0.01]">
        <span>Perubahan tersimpan otomatis di database SQLite.</span>
        <button
          type="button"
          class="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition active:scale-95 cursor-pointer"
          @click="emit('close')"
        >
          Tutup
        </button>
      </footer>
    </div>
  </div>
</template>

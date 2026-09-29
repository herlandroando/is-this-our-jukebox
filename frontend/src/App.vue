<script setup lang="ts">
import { computed } from "vue";
import { jukeboxClient } from "./shared/ws.ts";
import ToastStack from "./components/ToastStack.vue";

const toasts = computed(() => jukeboxClient.toasts.value);
</script>

<template>
  <div class="app-root">
    <router-view />
    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>

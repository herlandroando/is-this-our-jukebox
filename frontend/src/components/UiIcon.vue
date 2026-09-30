<script setup lang="ts">
import { computed } from "vue";

export type IconName =
  | "radio"
  | "crown"
  | "users"
  | "sparkles"
  | "plus"
  | "play"
  | "pause"
  | "skip-forward"
  | "mic"
  | "music"
  | "volume-2"
  | "volume-1"
  | "volume-x"
  | "copy"
  | "check"
  | "arrow-up"
  | "star"
  | "star-filled"
  | "trash-2"
  | "external-link"
  | "search"
  | "x"
  | "sliders"
  | "wifi"
  | "wifi-off"
  | "chevron-right"
  | "list-music"
  | "disc"
  | "heart"
  | "user";

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number | string;
    strokeWidth?: number | string;
  }>(),
  {
    size: 16,
    strokeWidth: 1.8,
  }
);

const pixelSize = computed(() => {
  return typeof props.size === "number" ? `${props.size}px` : props.size;
});
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ width: pixelSize, height: pixelSize, minWidth: pixelSize, minHeight: pixelSize }"
    class="ui-icon"
  >
    <!-- radio -->
    <g v-if="name === 'radio'">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </g>

    <!-- crown -->
    <g v-else-if="name === 'crown'">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.269a4 4 0 0 1-3.856 2.935H8.709a4 4 0 0 1-3.856-2.935L2.019 6.019a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
    </g>

    <!-- users -->
    <g v-else-if="name === 'users'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </g>

    <!-- sparkles -->
    <g v-else-if="name === 'sparkles'">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      <path d="M5 3v4" />
      <path d="M3 5h4" />
      <path d="M19 17v4" />
      <path d="M17 19h4" />
    </g>

    <!-- plus -->
    <g v-else-if="name === 'plus'">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </g>

    <!-- play -->
    <g v-else-if="name === 'play'">
      <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />
    </g>

    <!-- pause -->
    <g v-else-if="name === 'pause'">
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </g>

    <!-- skip-forward -->
    <g v-else-if="name === 'skip-forward'">
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" stroke-width="2.2" />
    </g>

    <!-- mic -->
    <g v-else-if="name === 'mic'">
      <path d="m12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </g>

    <!-- music -->
    <g v-else-if="name === 'music'">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </g>

    <!-- volume-2 -->
    <g v-else-if="name === 'volume-2'">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </g>

    <!-- volume-1 -->
    <g v-else-if="name === 'volume-1'">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </g>

    <!-- volume-x -->
    <g v-else-if="name === 'volume-x'">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </g>

    <!-- copy -->
    <g v-else-if="name === 'copy'">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </g>

    <!-- check -->
    <g v-else-if="name === 'check'">
      <path d="M20 6 9 17l-5-5" />
    </g>

    <!-- arrow-up -->
    <g v-else-if="name === 'arrow-up'">
      <path d="m18 15-6-6-6 6" />
    </g>

    <!-- star -->
    <g v-else-if="name === 'star'">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </g>

    <!-- star-filled -->
    <g v-else-if="name === 'star-filled'">
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        fill="currentColor"
        stroke="none"
      />
    </g>

    <!-- trash-2 -->
    <g v-else-if="name === 'trash-2'">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </g>

    <!-- external-link -->
    <g v-else-if="name === 'external-link'">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </g>

    <!-- search -->
    <g v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </g>

    <!-- x -->
    <g v-else-if="name === 'x'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </g>

    <!-- sliders -->
    <g v-else-if="name === 'sliders'">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </g>

    <!-- wifi -->
    <g v-else-if="name === 'wifi'">
      <path d="M12 20h.01" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.86a10 10 0 0 1 14 0" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
    </g>

    <!-- wifi-off -->
    <g v-else-if="name === 'wifi-off'">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.82" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.61" />
      <path d="M12 20h.01" />
    </g>

    <!-- chevron-right -->
    <g v-else-if="name === 'chevron-right'">
      <path d="m9 18 6-6-6-6" />
    </g>

    <!-- list-music -->
    <g v-else-if="name === 'list-music'">
      <path d="M21 15V6" />
      <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M12 12H3" />
      <path d="M16 6H3" />
      <path d="M12 18H3" />
    </g>

    <!-- disc -->
    <g v-else-if="name === 'disc'">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2" />
    </g>

    <!-- heart -->
    <g v-else-if="name === 'heart'">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </g>

    <!-- user -->
    <g v-else-if="name === 'user'">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </g>
  </svg>
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>

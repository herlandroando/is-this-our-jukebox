import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref } from "vue";
import { jukeboxClient } from "./ws.ts";
import type { QueueTrack } from "./types.ts";

export interface PlaybackProgressOptions {
  track: Ref<QueueTrack | null>;
  isPlaying: Ref<boolean>;
  duration?: Ref<number>;
  onSeek?: (time: number) => void;
}

export function usePlaybackProgress(options: PlaybackProgressOptions) {
  const { track, isPlaying, duration: customDuration, onSeek } = options;

  const currentTime = ref(0);
  const isScrubbing = ref(false);
  const scrubTime = ref(0);

  const duration = computed(() => {
    if (customDuration && customDuration.value > 0) return customDuration.value;
    if (jukeboxClient.duration.value > 0) return jukeboxClient.duration.value;
    return track.value?.duration || 0;
  });

  const effectiveCurrentTime = computed(() => {
    if (isScrubbing.value) return scrubTime.value;
    return currentTime.value;
  });

  const progressPercent = computed(() => {
    const dur = duration.value;
    if (!dur || dur <= 0) return 0;
    return Math.min(100, Math.max(0, (effectiveCurrentTime.value / dur) * 100));
  });

  let animFrameId: number | null = null;
  let lastSyncServerTime = 0;
  let lastSyncTimestamp = performance.now();
  let lastProgressUpdateMs = 0;
  let cleanups: Array<() => void> = [];

  function startLoop() {
    if (animFrameId === null && isPlaying.value && track.value) {
      lastSyncTimestamp = performance.now();
      lastProgressUpdateMs = 0;
      animFrameId = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function tick() {
    if (!isPlaying.value || !track.value) {
      animFrameId = null;
      return;
    }
    const now = performance.now();
    if (!isScrubbing.value) {
      // Throttle Vue reactivity updates to 10Hz (~100ms) to prevent 60fps re-rendering across whole UI tree
      if (now - lastProgressUpdateMs >= 100) {
        lastProgressUpdateMs = now;
        const elapsed = (now - lastSyncTimestamp) / 1000;
        const dur = duration.value;
        const estimated = lastSyncServerTime + elapsed;
        currentTime.value = dur > 0 ? Math.min(dur, Math.max(0, estimated)) : Math.max(0, estimated);
      }
    }
    animFrameId = requestAnimationFrame(tick);
  }

  function startScrub(targetTime: number) {
    const dur = duration.value;
    const clamped = dur > 0 ? Math.max(0, Math.min(dur, targetTime)) : Math.max(0, targetTime);
    isScrubbing.value = true;
    scrubTime.value = clamped;
  }

  function updateScrub(targetTime: number) {
    if (!isScrubbing.value) return;
    const dur = duration.value;
    const clamped = dur > 0 ? Math.max(0, Math.min(dur, targetTime)) : Math.max(0, targetTime);
    scrubTime.value = clamped;
  }

  function commitScrub() {
    if (!isScrubbing.value) return;
    const target = scrubTime.value;
    isScrubbing.value = false;
    seekTo(target);
  }

  function cancelScrub() {
    isScrubbing.value = false;
  }

  function seekTo(targetTime: number) {
    const dur = duration.value;
    const clamped = dur > 0 ? Math.max(0, Math.min(dur, targetTime)) : Math.max(0, targetTime);
    currentTime.value = clamped;
    lastSyncServerTime = clamped;
    lastSyncTimestamp = performance.now();

    if (onSeek) {
      onSeek(clamped);
    } else {
      jukeboxClient.seek(clamped);
    }
  }

  function setDirectTime(time: number, dur?: number) {
    if (isScrubbing.value) return;
    lastSyncServerTime = time;
    lastSyncTimestamp = performance.now();
    currentTime.value = time;
    if (dur && dur > 0 && customDuration) {
      customDuration.value = dur;
    }
  }

  // Handle visibility changes to re-sync immediately when tab is foregrounded
  function onVisibilityChange() {
    if (document.hidden) {
      stopLoop();
    } else if (isPlaying.value && track.value) {
      const serverTime = jukeboxClient.currentTime.value || jukeboxClient.state.value?.currentTime || currentTime.value;
      currentTime.value = serverTime;
      lastSyncServerTime = serverTime;
      lastSyncTimestamp = performance.now();
      startLoop();
    }
  }

  onMounted(() => {
    // Initialize with current store time
    const initialTime = jukeboxClient.currentTime.value || jukeboxClient.state.value?.currentTime || 0;
    currentTime.value = initialTime;
    lastSyncServerTime = initialTime;
    lastSyncTimestamp = performance.now();

    // Listen to timeUpdate broadcasts from WS
    const unsubTime = jukeboxClient.onTimeUpdate((serverTime, serverDur) => {
      if (isScrubbing.value) return;
      lastSyncServerTime = serverTime;
      lastSyncTimestamp = performance.now();

      // If drift is significant (> 1s) or paused, snap immediately
      if (!isPlaying.value || Math.abs(currentTime.value - serverTime) > 1.0) {
        currentTime.value = serverTime;
      }
    });
    cleanups.push(unsubTime);

    // Listen to seek broadcasts from WS
    const unsubSeek = jukeboxClient.onSeek((seekTime) => {
      lastSyncServerTime = seekTime;
      lastSyncTimestamp = performance.now();
      currentTime.value = seekTime;
      if (isScrubbing.value) {
        scrubTime.value = seekTime;
      }
    });
    cleanups.push(unsubSeek);

    document.addEventListener("visibilitychange", onVisibilityChange);
    startLoop();
  });

  onBeforeUnmount(() => {
    stopLoop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups = [];
  });

  // Watch track change: reset to 0
  watch(
    () => track.value?.id,
    (newId, oldId) => {
      if (oldId !== undefined && newId !== oldId) {
        currentTime.value = 0;
        lastSyncServerTime = 0;
        lastSyncTimestamp = performance.now();
        if (isScrubbing.value) {
          isScrubbing.value = false;
        }
      } else if (oldId === undefined && newId) {
        const resumeTime = jukeboxClient.currentTime.value || jukeboxClient.state.value?.currentTime || 0;
        if (resumeTime > 0) {
          currentTime.value = resumeTime;
          lastSyncServerTime = resumeTime;
          lastSyncTimestamp = performance.now();
        }
      }
      if (track.value && isPlaying.value) {
        startLoop();
      } else {
        stopLoop();
      }
    }
  );

  // Watch play/pause
  watch(
    () => isPlaying.value,
    (playing) => {
      lastSyncServerTime = currentTime.value;
      if (playing && track.value) {
        lastSyncTimestamp = performance.now();
        startLoop();
      } else {
        stopLoop();
      }
    }
  );

  return {
    currentTime: effectiveCurrentTime,
    rawCurrentTime: currentTime,
    duration,
    progressPercent,
    isScrubbing,
    scrubTime,
    startScrub,
    updateScrub,
    commitScrub,
    cancelScrub,
    seekTo,
    setDirectTime,
  };
}

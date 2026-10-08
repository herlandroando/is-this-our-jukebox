import { ref, watch, onMounted, onBeforeUnmount, type Ref } from "vue";
import type { QueueTrack } from "./types.ts";
import { getStreamUrl } from "./api.ts";
import { jukeboxClient } from "./ws.ts";

export type HeadphoneSyncStatus = "idle" | "connecting" | "synced" | "adjusting" | "paused" | "error";

export interface HeadphoneAudioOptions {
  track: Ref<QueueTrack | null>;
  isPlaying: Ref<boolean>;
}

export function useHeadphoneAudio(options: HeadphoneAudioOptions) {
  const { track, isPlaying } = options;

  const isTunedIn = ref(false);
  const isMuted = ref(false);
  const syncStatus = ref<HeadphoneSyncStatus>("idle");
  const driftMs = ref(0);

  // Restore saved personal headphone volume or default to 85%
  const savedVol = localStorage.getItem("jukebox_headphone_vol");
  const personalVolume = ref<number>(savedVol !== null ? Number(savedVol) : 85);

  let audio: HTMLAudioElement | null = null;
  let cleanups: Array<() => void> = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let currentLoadedTrackId: string | null = null;

  function initAudioElement() {
    if (audio) return audio;
    const el = new Audio();
    el.preload = "auto";
    el.autoplay = false;
    el.volume = isMuted.value ? 0 : Math.max(0, Math.min(1, personalVolume.value / 100));
    el.muted = isMuted.value;

    el.addEventListener("waiting", () => {
      if (isTunedIn.value && isPlaying.value) {
        syncStatus.value = "connecting";
      }
    });

    el.addEventListener("playing", () => {
      if (isTunedIn.value) {
        syncStatus.value = "synced";
      }
    });

    el.addEventListener("pause", () => {
      if (isTunedIn.value && !isPlaying.value) {
        syncStatus.value = "paused";
      }
    });

    el.addEventListener("error", (e) => {
      console.warn("[headphone] Audio element error:", e);
      if (isTunedIn.value) {
        syncStatus.value = "error";
        scheduleRetry();
      }
    });

    audio = el;
    return el;
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator)) return;

    if (!isTunedIn.value || !track.value) {
      navigator.mediaSession.playbackState = "none";
      return;
    }

    navigator.mediaSession.playbackState = isPlaying.value && !isMuted.value ? "playing" : "paused";

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.value.title || "Office Radio",
      artist: track.value.artist || "IsThisOurJukebox",
      album: "Office LAN Jukebox",
      artwork: track.value.thumbnail
        ? [
            { src: track.value.thumbnail, sizes: "96x96", type: "image/jpeg" },
            { src: track.value.thumbnail, sizes: "128x128", type: "image/jpeg" },
            { src: track.value.thumbnail, sizes: "192x192", type: "image/jpeg" },
            { src: track.value.thumbnail, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (isMuted.value) {
          toggleMute();
        } else if (audio && audio.paused) {
          void audio.play();
        }
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        toggleMute();
      });

      navigator.mediaSession.setActionHandler("stop", () => {
        tuneOut();
      });
    } catch (err) {
      console.warn("[headphone] MediaSession action registration:", err);
    }
  }

  function scheduleRetry() {
    if (retryTimer || !isTunedIn.value) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (isTunedIn.value && track.value) {
        loadAndPlay(track.value, true);
      }
    }, 2000);
  }

  function loadAndPlay(targetTrack: QueueTrack, forceReload = false) {
    const el = initAudioElement();
    const streamUrl = getStreamUrl(targetTrack.id, targetTrack.provider, targetTrack.permalink);

    if (currentLoadedTrackId !== targetTrack.id || forceReload || !el.src) {
      currentLoadedTrackId = targetTrack.id;
      syncStatus.value = "connecting";
      el.src = streamUrl;
      el.load();
    }

    // Determine target start time from current room playback position
    const serverTime = jukeboxClient.currentTime.value || jukeboxClient.state.value?.currentTime || 0;

    const onCanPlay = () => {
      el.removeEventListener("canplay", onCanPlay);
      if (!isTunedIn.value) return;

      if (serverTime > 0 && Math.abs(el.currentTime - serverTime) > 0.5) {
        try {
          el.currentTime = serverTime;
        } catch {
          // ignore seek bounds error during init
        }
      }

      if (isPlaying.value) {
        el.play()
          .then(() => {
            syncStatus.value = "synced";
            updateMediaSession();
          })
          .catch((err) => {
            console.warn("[headphone] play() prevented by browser policy:", err);
            syncStatus.value = "paused";
          });
      } else {
        el.pause();
        syncStatus.value = "paused";
      }
    };

    if (el.readyState >= 2) {
      onCanPlay();
    } else {
      el.addEventListener("canplay", onCanPlay, { once: true });
    }
  }

  async function tuneIn() {
    const el = initAudioElement();
    isTunedIn.value = true;
    isMuted.value = false;
    el.muted = false;
    el.volume = Math.max(0, Math.min(1, personalVolume.value / 100));

    jukeboxClient.addToast("🎧 Headphone stream connected!", "success");
    jukeboxClient.setListening(true);

    if (track.value) {
      loadAndPlay(track.value, true);
    } else {
      syncStatus.value = "idle";
    }

    updateMediaSession();
  }

  function tuneOut() {
    isTunedIn.value = false;
    syncStatus.value = "idle";
    driftMs.value = 0;
    currentLoadedTrackId = null;

    jukeboxClient.setListening(false);

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }

    jukeboxClient.addToast("🎧 Headphone stream disconnected", "info");
  }

  function toggleMute() {
    isMuted.value = !isMuted.value;
    if (audio) {
      audio.muted = isMuted.value;
      audio.volume = isMuted.value ? 0 : Math.max(0, Math.min(1, personalVolume.value / 100));
    }
    updateMediaSession();
  }

  function setPersonalVolume(vol: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(vol)));
    personalVolume.value = clamped;
    localStorage.setItem("jukebox_headphone_vol", String(clamped));
    if (audio && !isMuted.value) {
      audio.volume = clamped / 100;
    }
  }

  // Real-time micro-drift compensation
  function handleTimeUpdate(serverTime: number) {
    if (!isTunedIn.value || !audio || audio.paused || !isPlaying.value) return;

    const delta = audio.currentTime - serverTime;
    driftMs.value = Math.round(delta * 1000);

    // Hard snap if drift exceeds 1.2 seconds or after tab foregrounding
    if (Math.abs(delta) > 1.2) {
      try {
        audio.currentTime = serverTime;
        audio.playbackRate = 1.0;
        syncStatus.value = "synced";
      } catch {
        // seek error ignored
      }
    } else if (delta > 0.18) {
      // Local audio is ahead of room: gently throttle playback rate to let room catch up
      audio.playbackRate = 0.97;
      syncStatus.value = "adjusting";
    } else if (delta < -0.18) {
      // Local audio is behind room: gently boost playback rate to catch up
      audio.playbackRate = 1.03;
      syncStatus.value = "adjusting";
    } else {
      // In tight lockstep
      if (audio.playbackRate !== 1.0) {
        audio.playbackRate = 1.0;
      }
      syncStatus.value = "synced";
    }
  }

  function handleSeek(time: number) {
    if (!isTunedIn.value || !audio) return;
    try {
      audio.currentTime = time;
      audio.playbackRate = 1.0;
      syncStatus.value = "synced";
    } catch {
      // seek error ignored
    }
  }

  // Handle visibility changes when coworker returns to browser tab
  function handleVisibilityChange() {
    if (!document.hidden && isTunedIn.value && audio && isPlaying.value) {
      const serverTime = jukeboxClient.currentTime.value || jukeboxClient.state.value?.currentTime || 0;
      if (serverTime > 0 && Math.abs(audio.currentTime - serverTime) > 0.5) {
        try {
          audio.currentTime = serverTime;
        } catch {
          // ignore
        }
      }
      if (audio.paused && !isMuted.value) {
        void audio.play().catch(() => {});
      }
    }
  }

  onMounted(() => {
    const unsubTime = jukeboxClient.onTimeUpdate((time) => handleTimeUpdate(time));
    const unsubSeek = jukeboxClient.onSeek((time) => handleSeek(time));
    document.addEventListener("visibilitychange", handleVisibilityChange);

    cleanups.push(unsubTime, unsubSeek, () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  });

  onBeforeUnmount(() => {
    if (isTunedIn.value) {
      jukeboxClient.setListening(false);
    }
    for (const c of cleanups) c();
    cleanups = [];
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = null;
    }
  });

  // Watch for track changes from server
  watch(
    () => track.value?.id,
    (newId, oldId) => {
      if (!isTunedIn.value) return;
      if (newId && newId !== oldId && track.value) {
        loadAndPlay(track.value, true);
        updateMediaSession();
      } else if (!newId) {
        if (audio) {
          audio.pause();
        }
        syncStatus.value = "idle";
      }
    }
  );

  // Watch for play / pause changes from room
  watch(
    () => isPlaying.value,
    (playing) => {
      if (!isTunedIn.value || !audio) return;
      if (playing) {
        if (track.value && (!currentLoadedTrackId || currentLoadedTrackId !== track.value.id)) {
          loadAndPlay(track.value);
        } else {
          void audio.play().catch(() => {});
          syncStatus.value = "synced";
        }
      } else {
        audio.pause();
        syncStatus.value = "paused";
      }
      updateMediaSession();
    }
  );

  return {
    isTunedIn,
    isMuted,
    personalVolume,
    syncStatus,
    driftMs,
    tuneIn,
    tuneOut,
    toggleMute,
    setPersonalVolume,
  };
}

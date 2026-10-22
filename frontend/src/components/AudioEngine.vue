<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import type { QueueTrack } from "../shared/types.ts";
import { getStreamUrl } from "../shared/api.ts";
import { jukeboxClient } from "../shared/ws.ts";

const props = withDefaults(
  defineProps<{
    track: QueueTrack | null;
    isPlaying: boolean;
    volume: number;
    karaokeEnabled?: boolean;
    karaokeLevel?: number;
    crossfadeDuration?: number;
  }>(),
  {
    karaokeEnabled: false,
    karaokeLevel: 90,
    crossfadeDuration: 4,
  }
);

const emit = defineEmits<{
  (e: "analyserReady", analyser: AnalyserNode): void;
  (e: "timeUpdate", currentTime: number, duration: number): void;
}>();

// Dual-deck audio elements for seamless crossfade and play/pause fading
const audioRefA = ref<HTMLAudioElement | null>(null);
const audioRefB = ref<HTMLAudioElement | null>(null);

const activeDeck = ref<"A" | "B">("A");
let currentTrackId: string | null = null;
let hasDispatchedCrossfade = false;
let pauseTimer: number | null = null;
let crossfadeCleanupTimer: number | null = null;
let trackRetryCount = 0;
let retryTimeoutTimer: number | null = null;

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNodeA: MediaElementAudioSourceNode | null = null;
let sourceNodeB: MediaElementAudioSourceNode | null = null;
let deckGainA: GainNode | null = null;
let deckGainB: GainNode | null = null;
let deckMixer: GainNode | null = null;
let transportGain: GainNode | null = null;
let unsubSeek: (() => void) | null = null;

// DSP Nodes for Karaoke Mode
let dryGain: GainNode | null = null;
let karaokeGain: GainNode | null = null;
let crossRightToLeftGain: GainNode | null = null;
let crossLeftToRightGain: GainNode | null = null;

let lastTimeReport = 0;
const PLAY_PAUSE_FADE = 0.7; // seconds

function getDeck(deck: "A" | "B") {
  return {
    audio: deck === "A" ? audioRefA.value : audioRefB.value,
    gain: deck === "A" ? deckGainA : deckGainB,
  };
}

function setupAudioContext() {
  if (audioCtx || (!audioRefA.value && !audioRefB.value)) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;

    deckMixer = audioCtx.createGain();
    deckMixer.gain.value = 1.0;

    transportGain = audioCtx.createGain();
    transportGain.gain.value = props.isPlaying ? 1.0 : 0.0;
    deckMixer.connect(transportGain);

    if (audioRefA.value) {
      sourceNodeA = audioCtx.createMediaElementSource(audioRefA.value);
      deckGainA = audioCtx.createGain();
      deckGainA.gain.value = activeDeck.value === "A" ? 1.0 : 0.0;
      sourceNodeA.connect(deckGainA);
      deckGainA.connect(deckMixer);
    }

    if (audioRefB.value) {
      sourceNodeB = audioCtx.createMediaElementSource(audioRefB.value);
      deckGainB = audioCtx.createGain();
      deckGainB.gain.value = activeDeck.value === "B" ? 1.0 : 0.0;
      sourceNodeB.connect(deckGainB);
      deckGainB.connect(deckMixer);
    }

    // 1. Dry bypass path (Normal mode)
    dryGain = audioCtx.createGain();
    dryGain.gain.value = props.karaokeEnabled ? 0 : 1;
    transportGain.connect(dryGain);
    dryGain.connect(analyser);

    // 2. Karaoke DSP processing path
    // Crossover Filter (180 Hz) to isolate low bass (kick drum, bass guitar)
    const crossoverLow = audioCtx.createBiquadFilter();
    crossoverLow.type = "lowpass";
    crossoverLow.frequency.value = 180;
    crossoverLow.Q.value = 0.707;

    const crossoverHigh = audioCtx.createBiquadFilter();
    crossoverHigh.type = "highpass";
    crossoverHigh.frequency.value = 180;
    crossoverHigh.Q.value = 0.707;

    transportGain.connect(crossoverLow);
    transportGain.connect(crossoverHigh);

    // Low bass splitter & preservation
    const lowSplitter = audioCtx.createChannelSplitter(2);
    crossoverLow.connect(lowSplitter);

    // High/vocal band splitter
    const highSplitter = audioCtx.createChannelSplitter(2);
    crossoverHigh.connect(highSplitter);

    // Subtraction Matrix for mid/high frequencies:
    // Left = High_L - k * High_R
    // Right = High_R - k * High_L
    const k = Math.max(0, Math.min(1, props.karaokeLevel / 100));

    const leftDirectHighGain = audioCtx.createGain();
    leftDirectHighGain.gain.value = 1.0;
    const rightDirectHighGain = audioCtx.createGain();
    rightDirectHighGain.gain.value = 1.0;

    crossRightToLeftGain = audioCtx.createGain();
    crossRightToLeftGain.gain.value = -k;

    crossLeftToRightGain = audioCtx.createGain();
    crossLeftToRightGain.gain.value = -k;

    // Summing buses for Left and Right channels
    const karaokeLeftSum = audioCtx.createGain();
    const karaokeRightSum = audioCtx.createGain();

    // Route Left: Low_L + High_L - k * High_R
    lowSplitter.connect(karaokeLeftSum, 0); // Low Left
    highSplitter.connect(leftDirectHighGain, 0);
    leftDirectHighGain.connect(karaokeLeftSum);
    highSplitter.connect(crossRightToLeftGain, 1); // High Right inverted
    crossRightToLeftGain.connect(karaokeLeftSum);

    // Route Right: Low_R + High_R - k * High_L
    lowSplitter.connect(karaokeRightSum, 1); // Low Right
    highSplitter.connect(rightDirectHighGain, 1);
    rightDirectHighGain.connect(karaokeRightSum);
    highSplitter.connect(crossLeftToRightGain, 0); // High Left inverted
    crossLeftToRightGain.connect(karaokeRightSum);

    // Merge into stereo master
    const karaokeMerger = audioCtx.createChannelMerger(2);
    karaokeLeftSum.connect(karaokeMerger, 0, 0);
    karaokeRightSum.connect(karaokeMerger, 0, 1);

    // Master Karaoke Gain stage with slight makeup gain (1.15x)
    karaokeGain = audioCtx.createGain();
    karaokeGain.gain.value = props.karaokeEnabled ? 1.15 : 0;
    karaokeMerger.connect(karaokeGain);
    karaokeGain.connect(analyser);

    // Connect Analyser to audio output
    analyser.connect(audioCtx.destination);

    emit("analyserReady", analyser);
  } catch (e) {
    console.warn("[audio] Could not attach Web Audio Analyser / Karaoke DSP:", e);
  }
}

function updateKaraokeDsp(enabled: boolean, level: number) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const k = Math.max(0, Math.min(1, level / 100));

  if (crossRightToLeftGain) {
    crossRightToLeftGain.gain.setTargetAtTime(-k, now, 0.04);
  }
  if (crossLeftToRightGain) {
    crossLeftToRightGain.gain.setTargetAtTime(-k, now, 0.04);
  }

  if (dryGain && karaokeGain) {
    if (enabled) {
      dryGain.gain.setTargetAtTime(0, now, 0.04);
      karaokeGain.gain.setTargetAtTime(1.15, now, 0.04);
    } else {
      dryGain.gain.setTargetAtTime(1, now, 0.04);
      karaokeGain.gain.setTargetAtTime(0, now, 0.04);
    }
  }
}

watch(
  () => [props.karaokeEnabled, props.karaokeLevel] as const,
  ([enabled, level]) => {
    updateKaraokeDsp(!!enabled, typeof level === "number" ? level : 90);
  }
);

// Watch props.track?.id for crossfade and smooth song transitions
watch(
  () => props.track?.id,
  (newId) => {
    if (!newId || !props.track) {
      audioRefA.value?.pause();
      audioRefB.value?.pause();
      audioRefA.value?.removeAttribute("src");
      audioRefB.value?.removeAttribute("src");
      currentTrackId = null;
      hasDispatchedCrossfade = false;
      trackRetryCount = 0;
      if (retryTimeoutTimer !== null) {
        clearTimeout(retryTimeoutTimer);
        retryTimeoutTimer = null;
      }
      return;
    }

    if (newId === currentTrackId) return;
    currentTrackId = newId;
    trackRetryCount = 0;
    if (retryTimeoutTimer !== null) {
      clearTimeout(retryTimeoutTimer);
      retryTimeoutTimer = null;
    }

    const outgoingDeck = activeDeck.value;
    const incomingDeck = outgoingDeck === "A" ? "B" : "A";
    const { audio: outgoingAudio, gain: outgoingGain } = getDeck(outgoingDeck);
    const { audio: incomingAudio, gain: incomingGain } = getDeck(incomingDeck);

    if (crossfadeCleanupTimer !== null) {
      clearTimeout(crossfadeCleanupTimer);
      crossfadeCleanupTimer = null;
    }

    const streamUrl = getStreamUrl(props.track.id, props.track.provider, props.track.permalink);
    console.log(`[audio] Loading stream on Deck ${incomingDeck} for ${props.track.title}: ${streamUrl}`);

    const isOutgoingPlaying =
      outgoingAudio &&
      !outgoingAudio.paused &&
      !outgoingAudio.ended &&
      outgoingAudio.currentTime > 0;

    const xfadeDuration = props.crossfadeDuration ?? 4;

    // Crossfade if enabled, audio context ready, and outgoing track is actively playing
    if (xfadeDuration > 0 && isOutgoingPlaying && audioCtx && outgoingGain && incomingGain && incomingAudio) {
      // Natural transition uses full xfadeDuration; manual skip uses min(xfadeDuration, 2.5) for snappier skip
      const transitionTime = hasDispatchedCrossfade ? xfadeDuration : Math.min(xfadeDuration, 2.5);
      hasDispatchedCrossfade = false;

      incomingAudio.src = streamUrl;
      incomingAudio.load();

      const now = audioCtx.currentTime;

      // Ramp incoming from 0 to 1
      incomingGain.gain.cancelScheduledValues(now);
      incomingGain.gain.setValueAtTime(0, now);
      incomingGain.gain.linearRampToValueAtTime(1.0, now + transitionTime);

      // Ramp outgoing down to 0
      outgoingGain.gain.cancelScheduledValues(now);
      outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
      outgoingGain.gain.linearRampToValueAtTime(0.0001, now + transitionTime);

      // Switch active deck pointer so time updates are immediately attributed to incoming track
      activeDeck.value = incomingDeck;

      if (props.isPlaying) {
        void incomingAudio.play().catch((err) => {
          console.warn(`[audio] Autoplay prevented on Deck ${incomingDeck}:`, err);
        });
      }

      // Cleanup outgoing deck after transition finishes
      crossfadeCleanupTimer = window.setTimeout(() => {
        if (outgoingAudio && activeDeck.value !== outgoingDeck) {
          outgoingAudio.pause();
          outgoingAudio.removeAttribute("src");
          if (outgoingGain && audioCtx) {
            outgoingGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          }
        }
        crossfadeCleanupTimer = null;
      }, (transitionTime + 0.15) * 1000);
    } else {
      // Immediate switch (no crossfade or initial track load)
      hasDispatchedCrossfade = false;
      if (outgoingAudio && outgoingDeck !== incomingDeck) {
        outgoingAudio.pause();
        outgoingAudio.removeAttribute("src");
      }

      if (incomingAudio) {
        incomingAudio.src = streamUrl;
        incomingAudio.load();
      }
      activeDeck.value = incomingDeck;

      if (audioCtx) {
        const now = audioCtx.currentTime;
        if (incomingGain) {
          incomingGain.gain.cancelScheduledValues(now);
          incomingGain.gain.setValueAtTime(1.0, now);
        }
        if (outgoingGain) {
          outgoingGain.gain.cancelScheduledValues(now);
          outgoingGain.gain.setValueAtTime(0, now);
        }
      }

      if (props.isPlaying && incomingAudio) {
        void incomingAudio.play().catch((err) => {
          console.warn(`[audio] Autoplay prevented on Deck ${incomingDeck}:`, err);
        });
      }
    }
  }
);

// Watch props.isPlaying for smooth fade-in on play and fade-out on pause
watch(
  () => props.isPlaying,
  (playing) => {
    const { audio: activeAudio } = getDeck(activeDeck.value);
    if (!activeAudio || !props.track) return;

    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }

    if (pauseTimer !== null) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }

    if (playing) {
      if (transportGain && audioCtx) {
        const now = audioCtx.currentTime;
        transportGain.gain.cancelScheduledValues(now);
        transportGain.gain.setValueAtTime(transportGain.gain.value, now);
        transportGain.gain.linearRampToValueAtTime(1.0, now + PLAY_PAUSE_FADE);
      }
      void activeAudio.play().catch((e) => console.warn("[audio] Play error:", e));
    } else {
      if (transportGain && audioCtx) {
        const now = audioCtx.currentTime;
        transportGain.gain.cancelScheduledValues(now);
        transportGain.gain.setValueAtTime(transportGain.gain.value, now);
        transportGain.gain.linearRampToValueAtTime(0.0001, now + PLAY_PAUSE_FADE);
        pauseTimer = window.setTimeout(() => {
          if (!props.isPlaying) {
            audioRefA.value?.pause();
            audioRefB.value?.pause();
            if (transportGain && audioCtx) {
              transportGain.gain.setValueAtTime(0, audioCtx.currentTime);
            }
          }
          pauseTimer = null;
        }, PLAY_PAUSE_FADE * 1000);
      } else {
        audioRefA.value?.pause();
        audioRefB.value?.pause();
      }
    }
  }
);

watch(
  () => props.volume,
  (v) => {
    const vol = Math.max(0, Math.min(1, v / 100));
    if (audioRefA.value) audioRefA.value.volume = vol;
    if (audioRefB.value) audioRefB.value.volume = vol;
  }
);

function onPlay(deck: "A" | "B") {
  setupAudioContext();
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
}

function onTimeUpdate(deck: "A" | "B") {
  if (deck !== activeDeck.value) return;
  const { audio } = getDeck(deck);
  if (!audio) return;

  const cur = Math.round(audio.currentTime * 10) / 10;
  const dur = Math.round((audio.duration || props.track?.duration || 0) * 10) / 10;

  emit("timeUpdate", cur, dur);

  // Check for natural crossfade advance trigger
  const xfadeDur = props.crossfadeDuration ?? 4;
  if (
    xfadeDur > 0 &&
    dur > xfadeDur * 2 &&
    dur - cur <= xfadeDur &&
    !hasDispatchedCrossfade &&
    props.isPlaying
  ) {
    hasDispatchedCrossfade = true;
    console.log(`[audio] Triggering natural crossfade at ${cur}s / ${dur}s (${dur - cur}s remaining)`);
    jukeboxClient.send({ type: "trackEnded" });
  }

  const now = Date.now();
  if (now - lastTimeReport > 350) {
    lastTimeReport = now;
    jukeboxClient.send({
      type: "timeUpdate",
      currentTime: cur,
      duration: dur,
    });
  }
}

function onSeeked(deck: "A" | "B") {
  if (deck !== activeDeck.value) return;
  const { audio } = getDeck(deck);
  if (!audio) return;
  const cur = Math.round(audio.currentTime * 10) / 10;
  const dur = Math.round((audio.duration || props.track?.duration || 0) * 10) / 10;
  emit("timeUpdate", cur, dur);
  lastTimeReport = Date.now();
  jukeboxClient.send({
    type: "timeUpdate",
    currentTime: cur,
    duration: dur,
  });
}

function onEnded(deck: "A" | "B") {
  console.log(`[audio] Deck ${deck} track finished playing`);
  if (deck === activeDeck.value) {
    if (!hasDispatchedCrossfade) {
      hasDispatchedCrossfade = true;
      jukeboxClient.send({ type: "trackEnded" });
    }
  } else {
    const { audio } = getDeck(deck);
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
  }
}

function onError(deck: "A" | "B", e: Event) {
  if (deck !== activeDeck.value) return;
  const { audio } = getDeck(deck);
  if (!audio) return;
  const mediaError = audio.error;
  const msg = mediaError ? `Code ${mediaError.code}: ${mediaError.message}` : "Stream load error";
  console.warn(`[audio] Audio playback error on Deck ${deck} (attempt ${trackRetryCount + 1}):`, msg, e);

  // Allow up to 2 retries for transient stream/probe hiccups before declaring permanent failure
  if (trackRetryCount < 2 && props.track) {
    trackRetryCount++;
    console.log(`[audio] Retrying stream for "${props.track.title}" in 400ms (attempt ${trackRetryCount})...`);
    if (retryTimeoutTimer !== null) clearTimeout(retryTimeoutTimer);
    retryTimeoutTimer = window.setTimeout(() => {
      if (deck === activeDeck.value && props.track && audio) {
        const streamUrl = getStreamUrl(props.track.id, props.track.provider, props.track.permalink);
        const retryUrl = `${streamUrl}&retry=${trackRetryCount}_${Date.now()}`;
        audio.src = retryUrl;
        audio.load();
        if (props.isPlaying) {
          void audio.play().catch((err) => {
            console.warn("[audio] Play rejected during retry:", err);
          });
        }
      }
      retryTimeoutTimer = null;
    }, 400);
    return;
  }

  jukeboxClient.send({ type: "trackError", error: msg });
}

onMounted(() => {
  setupAudioContext();

  const vol = Math.max(0, Math.min(1, props.volume / 100));
  if (audioRefA.value) audioRefA.value.volume = vol;
  if (audioRefB.value) audioRefB.value.volume = vol;

  if (props.track) {
    currentTrackId = props.track.id;
    activeDeck.value = "A";
    const streamUrl = getStreamUrl(props.track.id, props.track.provider, props.track.permalink);
    console.log(`[audio] Initial stream load for ${props.track.title}: ${streamUrl}`);
    if (audioRefA.value) {
      audioRefA.value.src = streamUrl;
      audioRefA.value.load();
      if (props.isPlaying) {
        void audioRefA.value.play().catch((err) => {
          console.warn("[audio] Autoplay prevented, waiting for user gesture:", err);
        });
      }
    }
  }

  unsubSeek = jukeboxClient.onSeek((time) => {
    const { audio: activeAudio } = getDeck(activeDeck.value);
    if (activeAudio) {
      console.log(`[audio] Seeking active Deck ${activeDeck.value} to ${time}s`);
      activeAudio.currentTime = time;
      lastTimeReport = Date.now();
    }
    // Silence and pause any outgoing deck on seek
    const otherDeck = activeDeck.value === "A" ? "B" : "A";
    const { audio: otherAudio, gain: otherGain } = getDeck(otherDeck);
    if (otherAudio && !otherAudio.paused) {
      otherAudio.pause();
      otherAudio.removeAttribute("src");
      if (otherGain && audioCtx) {
        otherGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      }
    }
    const dur = activeAudio?.duration || props.track?.duration || 0;
    const xfadeDur = props.crossfadeDuration ?? 4;
    if (dur - time > xfadeDur + 1) {
      hasDispatchedCrossfade = false;
    }
  });
});

onBeforeUnmount(() => {
  if (unsubSeek) {
    unsubSeek();
    unsubSeek = null;
  }
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  if (crossfadeCleanupTimer !== null) {
    clearTimeout(crossfadeCleanupTimer);
    crossfadeCleanupTimer = null;
  }
  if (retryTimeoutTimer !== null) {
    clearTimeout(retryTimeoutTimer);
    retryTimeoutTimer = null;
  }
  if (audioRefA.value) {
    audioRefA.value.pause();
    audioRefA.value.removeAttribute("src");
  }
  if (audioRefB.value) {
    audioRefB.value.pause();
    audioRefB.value.removeAttribute("src");
  }
  if (audioCtx) {
    void audioCtx.close();
    audioCtx = null;
  }
});
</script>

<template>
  <div class="audio-engine-wrapper">
    <audio
      ref="audioRefA"
      crossorigin="anonymous"
      preload="auto"
      @play="() => onPlay('A')"
      @timeupdate="() => onTimeUpdate('A')"
      @seeked="() => onSeeked('A')"
      @ended="() => onEnded('A')"
      @error="(e) => onError('A', e)"
    ></audio>
    <audio
      ref="audioRefB"
      crossorigin="anonymous"
      preload="auto"
      @play="() => onPlay('B')"
      @timeupdate="() => onTimeUpdate('B')"
      @seeked="() => onSeeked('B')"
      @ended="() => onEnded('B')"
      @error="(e) => onError('B', e)"
    ></audio>
  </div>
</template>

<style scoped>
.audio-engine-wrapper {
  display: none;
}
</style>

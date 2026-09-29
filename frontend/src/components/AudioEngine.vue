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
  }>(),
  {
    karaokeEnabled: false,
    karaokeLevel: 90,
  }
);

const emit = defineEmits<{
  (e: "analyserReady", analyser: AnalyserNode): void;
  (e: "timeUpdate", currentTime: number, duration: number): void;
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let unsubSeek: (() => void) | null = null;

// DSP Nodes for Karaoke Mode
let dryGain: GainNode | null = null;
let karaokeGain: GainNode | null = null;
let crossRightToLeftGain: GainNode | null = null;
let crossLeftToRightGain: GainNode | null = null;

let lastTimeReport = 0;

function setupAudioContext() {
  if (audioCtx || !audioRef.value) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;

    sourceNode = audioCtx.createMediaElementSource(audioRef.value);

    // 1. Dry bypass path (Normal mode)
    dryGain = audioCtx.createGain();
    dryGain.gain.value = props.karaokeEnabled ? 0 : 1;
    sourceNode.connect(dryGain);
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

    sourceNode.connect(crossoverLow);
    sourceNode.connect(crossoverHigh);

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

watch(
  () => props.track?.id,
  (newId) => {
    if (!audioRef.value) return;
    if (!newId || !props.track) {
      audioRef.value.pause();
      audioRef.value.removeAttribute("src");
      audioRef.value.load();
      return;
    }

    const streamUrl = getStreamUrl(props.track.id, props.track.provider);
    console.log(`[audio] Loading stream for ${props.track.title}: ${streamUrl}`);
    audioRef.value.src = streamUrl;
    audioRef.value.load();

    if (props.isPlaying) {
      void audioRef.value.play().catch((err) => {
        console.warn("[audio] Autoplay prevented, waiting for user gesture:", err);
      });
    }
  }
);

watch(
  () => props.isPlaying,
  (playing) => {
    if (!audioRef.value || !props.track) return;
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    if (playing) {
      void audioRef.value.play().catch((e) => console.warn("[audio] Play error:", e));
    } else {
      audioRef.value.pause();
    }
  }
);

watch(
  () => props.volume,
  (v) => {
    if (audioRef.value) {
      audioRef.value.volume = Math.max(0, Math.min(1, v / 100));
    }
  }
);

function onPlay() {
  setupAudioContext();
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
}

function onTimeUpdate() {
  if (!audioRef.value) return;
  const cur = Math.round(audioRef.value.currentTime * 10) / 10;
  const dur = Math.round((audioRef.value.duration || props.track?.duration || 0) * 10) / 10;

  emit("timeUpdate", cur, dur);

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

function onSeeked() {
  if (!audioRef.value) return;
  const cur = Math.round(audioRef.value.currentTime * 10) / 10;
  const dur = Math.round((audioRef.value.duration || props.track?.duration || 0) * 10) / 10;
  emit("timeUpdate", cur, dur);
  lastTimeReport = Date.now();
  jukeboxClient.send({
    type: "timeUpdate",
    currentTime: cur,
    duration: dur,
  });
}

function onEnded() {
  console.log("[audio] Track finished playing");
  jukeboxClient.send({ type: "trackEnded" });
}

function onError(e: Event) {
  const mediaError = audioRef.value?.error;
  const msg = mediaError ? `Code ${mediaError.code}: ${mediaError.message}` : "Stream load error";
  console.warn("[audio] Audio playback error:", msg, e);
  jukeboxClient.send({ type: "trackError", error: msg });
}

onMounted(() => {
  if (audioRef.value) {
    audioRef.value.volume = Math.max(0, Math.min(1, props.volume / 100));
  }

  unsubSeek = jukeboxClient.onSeek((time) => {
    if (audioRef.value) {
      console.log(`[audio] Seeking audio to ${time}s`);
      audioRef.value.currentTime = time;
      lastTimeReport = Date.now();
    }
  });
});

onBeforeUnmount(() => {
  if (unsubSeek) {
    unsubSeek();
    unsubSeek = null;
  }
  if (audioRef.value) {
    audioRef.value.pause();
    audioRef.value.removeAttribute("src");
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
      ref="audioRef"
      crossorigin="anonymous"
      preload="auto"
      @play="onPlay"
      @timeupdate="onTimeUpdate"
      @seeked="onSeeked"
      @ended="onEnded"
      @error="onError"
    ></audio>
  </div>
</template>

<style scoped>
.audio-engine-wrapper {
  display: none;
}
</style>

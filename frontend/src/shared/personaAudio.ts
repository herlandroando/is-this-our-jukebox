import { ref } from "vue";

class PersonaSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffers = new Map<number, AudioBuffer>();
  public isSoundEnabled = ref(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("jukebox_p5_sound") !== "false"
      : true
  );

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getCachedNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const key = Math.round(durationSec * 100);
    let buf = this.noiseBuffers.get(key);
    if (!buf || buf.sampleRate !== ctx.sampleRate) {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
      buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffers.set(key, buf);
    }
    return buf;
  }

  public toggleSound() {
    this.isSoundEnabled.value = !this.isSoundEnabled.value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("jukebox_p5_sound", String(this.isSoundEnabled.value));
    }
  }

  public setSound(enabled: boolean) {
    this.isSoundEnabled.value = enabled;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("jukebox_p5_sound", String(enabled));
    }
  }

  private haptic(pattern: number | number[]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * Crisp, mechanical cursor blip (menu hover / toggle)
   */
  public playCursor() {
    this.haptic(8);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch {}
  }

  /**
   * Sharp P5 sword slash / gun cocking impact (selecting an answer)
   */
  public playSelect() {
    this.haptic(25);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. High-frequency noise slash
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this.getCachedNoiseBuffer(ctx, 0.07);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(800, now + 0.07);
      filter.Q.value = 3.0;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);

      // 2. Tonal blade cut (sawtooth sweep)
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

      oscGain.gain.setValueAtTime(0.18, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Bold P5 ready lock confirmation (heavy kick + resonant chime)
   */
  public playReady() {
    this.haptic([15, 30, 25]);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Low kick impact
      const kick = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kick.type = "triangle";
      kick.frequency.setValueAtTime(180, now);
      kick.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      kickGain.gain.setValueAtTime(0.35, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      kick.connect(kickGain);
      kickGain.connect(ctx.destination);
      kick.start(now);
      kick.stop(now + 0.13);

      // Bell chime (E5 -> B5)
      const chime1 = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime1.type = "sine";
      chime1.frequency.setValueAtTime(659.25, now + 0.03);
      chime1.frequency.setValueAtTime(987.77, now + 0.09);

      chimeGain.gain.setValueAtTime(0.001, now);
      chimeGain.gain.setValueAtTime(0.2, now + 0.03);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      chime1.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime1.start(now + 0.03);
      chime1.stop(now + 0.26);
    } catch {}
  }

  /**
   * Tense countdown clock tick (<= 5s)
   */
  public playTick() {
    this.haptic(10);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch {}
  }

  /**
   * Persona 5 Weakness / Critical Hit!
   * Bright brass acid-jazz power chord + metallic impact sweep
   */
  public playCriticalHit() {
    this.haptic([30, 40, 60, 40, 80]);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Chord frequencies: F#5 (739.99), A5 (880), C#6 (1108.73), E6 (1318.51)
      const freqs = [739.99, 880.0, 1108.73, 1318.51];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx % 2 === 0 ? "sawtooth" : "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.015);

        // Brass envelope
        gain.gain.setValueAtTime(0.001, now + idx * 0.015);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.015 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.015 + 0.35);

        // Bandpass warmth
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2800, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.35);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.015);
        osc.stop(now + idx * 0.015 + 0.38);
      });

      // Sharp cymbal / glass slash
      const noise = ctx.createBufferSource();
      noise.buffer = this.getCachedNoiseBuffer(ctx, 0.15);

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "highpass";
      noiseFilter.frequency.setValueAtTime(4500, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } catch {}
  }

  /**
   * Persona 5 Miss / Wrong Guess!
   * Heavy muffled sub-bass drop + vinyl dull thud
   */
  public playMiss() {
    this.haptic([40, 50, 40]);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Descending dissonant bass
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(196.0, now); // G3
      osc.frequency.exponentialRampToValueAtTime(65.41, now + 0.22); // C2

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(120, now + 0.22);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.24);
    } catch {}
  }

  /**
   * All-Out Attack Victory Fanfare!
   * Rapid drum roll + triumphant acid jazz brass hits
   */
  public playAllOutAttack() {
    this.haptic([50, 60, 50, 60, 100, 100, 200]);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Rapid drum rolls (4 fast snare clicks)
      for (let i = 0; i < 4; i++) {
        const hitTime = now + i * 0.06;
        const rollOsc = ctx.createOscillator();
        const rollGain = ctx.createGain();
        rollOsc.type = "triangle";
        rollOsc.frequency.setValueAtTime(140, hitTime);
        rollGain.gain.setValueAtTime(0.18, hitTime);
        rollGain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.05);

        rollOsc.connect(rollGain);
        rollGain.connect(ctx.destination);
        rollOsc.start(hitTime);
        rollOsc.stop(hitTime + 0.055);
      }

      // 2. Giant Brass Stabs (C minor 9th / Bb major triumph)
      const stabTime = now + 0.28;
      const chord = [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5]; // C4, G4, C5, E5, G5, C6
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, stabTime);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(3200, stabTime);
        filter.frequency.exponentialRampToValueAtTime(800, stabTime + 0.6);

        gain.gain.setValueAtTime(0.001, stabTime);
        gain.gain.linearRampToValueAtTime(0.12 - idx * 0.015, stabTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, stabTime + 0.65);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(stabTime);
        osc.stop(stabTime + 0.7);
      });

      // 3. Shimmering crash cymbal
      const crash = ctx.createBufferSource();
      crash.buffer = this.getCachedNoiseBuffer(ctx, 0.4);

      const crashFilter = ctx.createBiquadFilter();
      crashFilter.type = "highpass";
      crashFilter.frequency.setValueAtTime(5000, stabTime);

      const crashGain = ctx.createGain();
      crashGain.gain.setValueAtTime(0.22, stabTime);
      crashGain.gain.exponentialRampToValueAtTime(0.001, stabTime + 0.4);

      crash.connect(crashFilter);
      crashFilter.connect(crashGain);
      crashGain.connect(ctx.destination);
      crash.start(stabTime);
    } catch {}
  }
}

export const personaAudio = new PersonaSoundEngine();

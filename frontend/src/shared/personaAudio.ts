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

  /**
   * Warm up / unlock AudioContext on user gesture
   */
  public prime() {
    this.getContext();
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
  public playTick(urgent = false) {
    this.haptic(urgent ? 18 : 10);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = urgent ? "sawtooth" : "square";
      const startFreq = urgent ? 1350 : 900;
      const endFreq = urgent ? 420 : 300;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.035);

      gain.gain.setValueAtTime(urgent ? 0.2 : 0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
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
   * Epic Comic/Arcade "KABOOOM!" Bomb Detonation:
   * Multi-layered procedural explosion sound:
   * 1. Detonation Crack (sharp distorted transient & high-frequency shockwave)
   * 2. Concussive Punch (overdriven mid-low body drop: 220Hz -> 36Hz)
   * 3. Deep Sub-Bass Earthquake (sub-rumble: 95Hz -> 25Hz decaying over 1.6s)
   * 4. Fiery Noise Blast & Debris (resonant band-swept white noise with crackle)
   * 5. Metallic Ring / Shockwave resonance (ear-ringing aftermath)
   */
  public playKaboom() {
    this.haptic([80, 40, 140, 50, 320]);
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Initial Detonation Crack / Shockwave Transient (0ms - 80ms)
      const crackNoise = ctx.createBufferSource();
      crackNoise.buffer = this.getCachedNoiseBuffer(ctx, 0.12);

      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = "bandpass";
      crackFilter.frequency.setValueAtTime(3200, now);
      crackFilter.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      crackFilter.Q.setValueAtTime(2.5, now);

      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.42, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      crackNoise.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(ctx.destination);
      crackNoise.start(now);

      // 1b. Fast pitch-drop transient kick (480Hz -> 45Hz in 55ms)
      const punchTransient = ctx.createOscillator();
      const punchTransientGain = ctx.createGain();
      punchTransient.type = "sawtooth";
      punchTransient.frequency.setValueAtTime(480, now);
      punchTransient.frequency.exponentialRampToValueAtTime(45, now + 0.055);

      punchTransientGain.gain.setValueAtTime(0.45, now);
      punchTransientGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      punchTransient.connect(punchTransientGain);
      punchTransientGain.connect(ctx.destination);
      punchTransient.start(now);
      punchTransient.stop(now + 0.06);

      // 2. Heavy Concussive Mid Body ("THUD / BOOM")
      const midOsc = ctx.createOscillator();
      const midGain = ctx.createGain();
      midOsc.type = "triangle";
      midOsc.frequency.setValueAtTime(220, now);
      midOsc.frequency.exponentialRampToValueAtTime(36, now + 0.42);

      // Soft distortion via WaveShaper
      const distortion = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = Math.tanh(x * 2.8); // Warm saturation
      }
      distortion.curve = curve;
      distortion.oversample = "2x";

      midGain.gain.setValueAtTime(0.001, now);
      midGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      midGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      midOsc.connect(distortion);
      distortion.connect(midGain);
      midGain.connect(ctx.destination);
      midOsc.start(now);
      midOsc.stop(now + 0.58);

      // 3. Ground-Shaking Sub-Bass Earthquake (95Hz -> 25Hz over 1.6s)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(95, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 1.4);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.55, now + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 1.65);

      // 4. Expanding Fireball & Debris Roar (Swept Lowpass White Noise)
      const roarNoise = ctx.createBufferSource();
      roarNoise.buffer = this.getCachedNoiseBuffer(ctx, 1.5);

      const roarFilter = ctx.createBiquadFilter();
      roarFilter.type = "lowpass";
      roarFilter.frequency.setValueAtTime(3600, now);
      roarFilter.frequency.exponentialRampToValueAtTime(70, now + 1.3);
      roarFilter.Q.setValueAtTime(3.8, now);

      const roarGain = ctx.createGain();
      roarGain.gain.setValueAtTime(0.001, now);
      roarGain.gain.linearRampToValueAtTime(0.42, now + 0.02);
      roarGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);

      roarNoise.connect(roarFilter);
      roarFilter.connect(roarGain);
      roarGain.connect(ctx.destination);
      roarNoise.start(now);

      // 5. High-Frequency Shockwave Ring (Ear-ringing aftermath)
      const ringOsc = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ringOsc.type = "sine";
      ringOsc.frequency.setValueAtTime(2600, now + 0.03);
      ringOsc.frequency.exponentialRampToValueAtTime(1800, now + 0.45);

      ringGain.gain.setValueAtTime(0.001, now);
      ringGain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      ringOsc.connect(ringGain);
      ringGain.connect(ctx.destination);
      ringOsc.start(now + 0.03);
      ringOsc.stop(now + 0.52);
    } catch (e) {
      console.warn("[PersonaAudio] playKaboom error:", e);
    }
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

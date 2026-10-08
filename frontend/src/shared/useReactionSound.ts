import { ref } from "vue";

// Pentatonic scale frequencies (Hz) for musical harmony as combo ascends
const PENTATONIC_SCALE = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.0,  // A5
  1046.5, // C6
  1174.66,// D6
  1318.51,// E6
  1567.98 // G6
];

class ReactionSoundEngine {
  private ctx: AudioContext | null = null;
  public isSoundEnabled = ref(localStorage.getItem("jukebox_reaction_sound") !== "false");

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleSound() {
    this.isSoundEnabled.value = !this.isSoundEnabled.value;
    localStorage.setItem("jukebox_reaction_sound", String(this.isSoundEnabled.value));
  }

  public setSound(enabled: boolean) {
    this.isSoundEnabled.value = enabled;
    localStorage.setItem("jukebox_reaction_sound", String(enabled));
  }

  /**
   * Main entry point: plays distinct acoustic synth sound tailored to each emoji,
   * pitch-shifting up along the pentatonic scale as roomCombo ascends.
   */
  public playSound(emoji: string, combo = 1) {
    // Subtle mobile tactile vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(combo >= 10 ? [15, 30, 20] : 10);
      } catch {}
    }

    if (!this.isSoundEnabled.value) return;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const noteIdx = Math.min(Math.floor((combo - 1) / 2), PENTATONIC_SCALE.length - 1);
      const baseFreq = PENTATONIC_SCALE[noteIdx % PENTATONIC_SCALE.length];

      switch (emoji) {
        case "🔥":
          this.playFlame(ctx, baseFreq, combo);
          break;
        case "❤️":
          this.playHeart(ctx, baseFreq, combo);
          break;
        case "💃":
          this.playDance(ctx, baseFreq, combo);
          break;
        case "🎸":
          this.playGuitar(ctx, baseFreq, combo);
          break;
        case "💀":
          this.playSkull(ctx, baseFreq, combo);
          break;
        case "🎉":
          this.playParty(ctx, baseFreq, combo);
          break;
        default:
          this.playFlame(ctx, baseFreq, combo);
          break;
      }

      // Extra milestone sparkle chord if reaching combo multiple of 10 or 25
      if (combo >= 10 && (combo % 5 === 0 || combo === 25)) {
        this.playMilestoneSparkle(ctx, baseFreq);
      }
    } catch {}
  }

  /** Backward-compatible helper */
  public playPop(combo = 1) {
    this.playSound("🔥", combo);
  }

  // 1. 🔥 Flame: Rising noise sizzle + punchy fast frequency drop
  private playFlame(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.08);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200 + combo * 30, now);
    filter.Q.setValueAtTime(2.5, now);

    const peak = Math.min(0.08 + (combo > 10 ? 0.03 : 0), 0.14);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);

    // Fast crackle burst
    this.playNoiseCrackle(ctx, now, peak * 0.5);
  }

  // 2. ❤️ Heart: Warm sweet Kalimba / Marimba chord (Root + Major 3rd)
  private playHeart(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;
    const notes = [baseFreq, baseFreq * 1.2599]; // Root + Major 3rd
    const peak = 0.07;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.005);

      gain.gain.setValueAtTime(0.001, now + i * 0.005);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008 + i * 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.005);
      osc.stop(now + 0.17);
    });
  }

  // 3. 💃 Dance: Funky Disco slap bass / bouncy low-pass filter sweep
  private playDance(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(baseFreq * 0.75, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.1);

    filter.type = "lowpass";
    filter.Q.setValueAtTime(7.0, now); // Funky resonant squelch
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    const peak = 0.09;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  // 4. 🎸 Guitar: Electric rock power-chord stab (Root + 5th with bite)
  private playGuitar(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;
    const notes = [baseFreq * 0.75, baseFreq * 1.125]; // Power 5th
    const peak = 0.06;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq * (1 + (idx === 1 ? 0.008 : -0.008)), now); // Slight chorus detune

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(1.8, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  // 5. 💀 Skull: Hollow wooden bone clack + deep sub-bass thud
  private playSkull(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;

    // A. Hollow bone woodblock transient
    const clack = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clack.type = "sine";
    clack.frequency.setValueAtTime(740, now);
    clack.frequency.exponentialRampToValueAtTime(320, now + 0.04);

    clackGain.gain.setValueAtTime(0.001, now);
    clackGain.gain.linearRampToValueAtTime(0.08, now + 0.004);
    clackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    clack.connect(clackGain);
    clackGain.connect(ctx.destination);
    clack.start(now);
    clack.stop(now + 0.06);

    // B. Sub-bass comic thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.12);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.12, now + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.15);
  }

  // 6. 🎉 Party: Upward celebratory fanfare arpeggio (Root -> 3rd -> 5th)
  private playParty(ctx: AudioContext, baseFreq: number, combo: number) {
    const now = ctx.currentTime;
    const intervals = [1.0, 1.25, 1.5, 2.0];
    const peak = 0.06;

    intervals.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.025;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(baseFreq * ratio, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  // Helper: Filtered noise sizzle for flame
  private playNoiseCrackle(ctx: AudioContext, now: number, peak: number) {
    try {
      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.8;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(2400, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.05);
    } catch {}
  }

  // Milestone sparkle chords on high combos
  private playMilestoneSparkle(ctx: AudioContext, baseFreq: number) {
    const now = ctx.currentTime;
    const sparkleNotes = [baseFreq * 1.5, baseFreq * 2.0, baseFreq * 2.5];

    sparkleNotes.forEach((freq, idx) => {
      const startTime = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.05, startTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }
}

export const reactionSoundEngine = new ReactionSoundEngine();

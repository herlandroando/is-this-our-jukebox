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
  public isSoundEnabled = ref(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("jukebox_reaction_sound") !== "false"
      : true
  );

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
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("jukebox_reaction_sound", String(this.isSoundEnabled.value));
    }
  }

  public setSound(enabled: boolean) {
    this.isSoundEnabled.value = enabled;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("jukebox_reaction_sound", String(enabled));
    }
  }

  /**
   * Main entry point: plays distinct acoustic synth sound tailored to each emoji,
   * pitch-shifting up along the pentatonic scale as roomCombo ascends.
   */
  public playSound(emoji: string, combo = 1) {
    // Tactile mobile vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        if (combo >= 100) {
          navigator.vibrate([90, 60, 140, 70, 320]);
        } else {
          navigator.vibrate(combo >= 10 ? [15, 30, 20] : 10);
        }
      } catch {}
    }

    if (!this.isSoundEnabled.value) return;

    if (combo >= 100) {
      this.playSupernovaExplosion(emoji);
      return;
    }

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

  /**
   * Juke-chan Mascot Interactive Chime on Direct Tap / Interaction
   */
  public playJukeChanChime() {
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [587.33, 739.99, 880]; // D5, F#5, A5 arpeggio
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.08, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.35);
      });
    } catch {}
  }

  /**
   * Mood Transition Jingle when Mood auto-detection switches
   */
  public playMoodJingle(mood: "hype" | "lofi" | "romance" | "galau") {
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const chords: Record<string, number[]> = {
        hype: [440, 554.37, 659.25, 880], // A Major synth energy
        lofi: [329.63, 392.0, 493.88, 587.33], // E minor 7 mellow
        romance: [349.23, 440.0, 523.25, 659.25], // F Major 7 sweet
        galau: [293.66, 349.23, 440.0, 523.25], // D minor 7 acoustic
      };
      const notes = chords[mood] || chords.hype;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = mood === "hype" ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.07, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.4);
      });
    } catch {}
  }

  private lastBlipTimeMs = 0;

  /**
   * Animal-Crossing / Undertale style cute synth voice blip per character during typewriter speech.
   * Respects isSoundEnabled mute setting and throttles rapid characters.
   */
  public playVoiceBlip(
    mood: "hype" | "lofi" | "romance" | "galau",
    char: string
  ) {
    if (!this.isSoundEnabled.value) return;
    if (!char || /\s/.test(char)) return;

    const nowMs = performance.now();
    if (nowMs - this.lastBlipTimeMs < 46) return;
    this.lastBlipTimeMs = nowMs;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const basePitchMap: Record<string, number> = {
        hype: 690,
        romance: 640,
        lofi: 520,
        galau: 460,
      };
      const base = basePitchMap[mood] ?? 600;
      const code = char.charCodeAt(0);
      const semitoneOffset = ((code % 7) - 3) * 18;
      const isVowel = /[aiueoAIUEO]/.test(char);
      const freq = Math.max(320, base + semitoneOffset + (isVowel ? 28 : 0));

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = mood === "hype" || mood === "romance" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq * 0.92, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.06, now + 0.028);

      const dur = isVowel ? 0.042 : 0.03;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.032, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.005);
    } catch {}
  }

  /**
   * Distinct cute tactile audio feedback per body hit-zone
   */
  public playZoneSfx(zone: "head" | "cheek" | "headphone" | "ahoge" | "pout") {
    if (!this.isSoundEnabled.value) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (zone === "ahoge") {
        // Springy boing pitch bend
        osc.type = "sine";
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (zone === "cheek") {
        // Cute squishy pop
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.11);
      } else if (zone === "pout") {
        // Comedic low huff
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(170, now + 0.16);
        gain.gain.setValueAtTime(0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      } else {
        this.playJukeChanChime();
      }
    } catch {}
  }

  /**
   * Supernova Climax Explosion ("DUAR!"):
   * Procedural Web Audio DSP sound with deep sub-bass drop (140Hz -> 32Hz),
   * dense shaped white noise explosion, punchy kick transient, and celebratory sparkles.
   */
  public playSupernovaExplosion(emoji = "🔥") {
    if (!this.isSoundEnabled.value) return;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Massive Sub-Bass Pitch Drop ("DUUUUUMMM...")
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(160, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 1.2);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.46, now + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 1.9);

      // 2. Punchy Mid Body ("THUD / KABOOM")
      const punchOsc = ctx.createOscillator();
      const punchGain = ctx.createGain();
      punchOsc.type = "triangle";
      punchOsc.frequency.setValueAtTime(280, now);
      punchOsc.frequency.exponentialRampToValueAtTime(36, now + 0.32);

      punchGain.gain.setValueAtTime(0.001, now);
      punchGain.gain.linearRampToValueAtTime(0.32, now + 0.008);
      punchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      punchOsc.connect(punchGain);
      punchGain.connect(ctx.destination);
      punchOsc.start(now);
      punchOsc.stop(now + 0.52);

      // 3. Dense White Noise Shockwave Explosion ("TSHHHSHHH...")
      const bufferSize = Math.floor(ctx.sampleRate * 1.4);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.95;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(3800, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(90, now + 1.1);
      noiseFilter.Q.setValueAtTime(3.6, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.38, now + 0.015);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 1.45);

      // 4. Celebratory Sparkle Cascade
      this.playMilestoneSparkle(ctx, 880);
      setTimeout(() => {
        try {
          const freshCtx = this.getContext();
          if (freshCtx) this.playMilestoneSparkle(freshCtx, 1046.5);
        } catch {}
      }, 160);
    } catch {}
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
export const reactionAudio = reactionSoundEngine;

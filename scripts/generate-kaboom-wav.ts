import * as fs from "fs";
import * as path from "path";

function generateKaboomWav(outputPath: string) {
  const sampleRate = 44100;
  const duration = 2.0; // 2 seconds
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(totalSamples);

  // 1. Initial Detonation Crack & Shockwave (0 to 0.1s)
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Layer 1: Transient Crack (noise + high-speed pitch drop)
    let crack = 0;
    if (t < 0.1) {
      const crackEnv = Math.exp(-t * 45);
      const crackNoise = (Math.random() * 2 - 1) * 0.5;
      const crackFreq = 480 * Math.exp(-t * 50) + 45;
      const crackTone = Math.sin(2 * Math.PI * crackFreq * t);
      crack = (crackNoise * 0.6 + crackTone * 0.4) * crackEnv * 0.65;
    }

    // Layer 2: Concussive Mid Body Punch (t from 0 to 0.6s)
    let midPunch = 0;
    if (t < 0.6) {
      const midEnv = Math.min(1, t / 0.008) * Math.exp(-t * 6.5);
      const midFreq = 220 * Math.exp(-t * 7) + 36;
      let rawTone = Math.sin(2 * Math.PI * midFreq * t);
      // Soft saturation
      rawTone = Math.tanh(rawTone * 2.8);
      midPunch = rawTone * midEnv * 0.55;
    }

    // Layer 3: Sub-Bass Earthquake (0 to 1.8s)
    let subBass = 0;
    if (t < 1.8) {
      const subEnv = Math.min(1, t / 0.02) * Math.exp(-t * 2.5);
      const subFreq = 95 * Math.exp(-t * 1.5) + 25;
      const subTone = Math.sin(2 * Math.PI * subFreq * t);
      subBass = subTone * subEnv * 0.6;
    }

    // Layer 4: Fiery Noise Roar & Debris (swept lowpass noise)
    let roar = 0;
    if (t < 1.6) {
      const roarEnv = Math.min(1, t / 0.02) * Math.exp(-t * 3.0);
      // Dynamic noise modulated
      const rawNoise = (Math.random() * 2 - 1);
      // Simplified lowpass filter via smoothing
      roar = rawNoise * roarEnv * 0.4;
    }

    // Layer 5: High-frequency ear ring shockwave (0.03 to 0.5s)
    let ring = 0;
    if (t >= 0.03 && t < 0.5) {
      const ringT = t - 0.03;
      const ringEnv = Math.min(1, ringT / 0.01) * Math.exp(-ringT * 9.0);
      ring = Math.sin(2 * Math.PI * 2600 * t) * ringEnv * 0.07;
    }

    let sample = crack + midPunch + subBass + roar + ring;
    // Master saturation to prevent hard clipping
    sample = Math.tanh(sample * 1.15);
    buffer[i] = sample;
  }

  // 1-pole lowpass filter for roar smoothing across the buffer
  let prev = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const cutoff = Math.max(80, 3600 * Math.exp(-t * 3.5));
    const alpha = (2 * Math.PI * cutoff / sampleRate) / (1 + 2 * Math.PI * cutoff / sampleRate);
    prev = prev + alpha * (buffer[i] - prev);
    // Combine filtered signal with original body
    buffer[i] = buffer[i] * 0.65 + prev * 0.35;
  }

  // Convert Float32 buffer to 16-bit PCM WAV
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * bytesPerSample;
  const wavHeaderSize = 44;
  const totalFileSize = wavHeaderSize + dataSize;

  const wavBuffer = Buffer.alloc(totalFileSize);

  // RIFF Chunk
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(totalFileSize - 8, 4);
  wavBuffer.write("WAVE", 8);

  // fmt sub-chunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20);  // audioFormat (1 for PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(16, 34); // bitsPerSample

  // data sub-chunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(dataSize, 40);

  // Write samples
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    wavBuffer.writeInt16LE(Math.floor(int16), offset);
    offset += 2;
  }

  fs.writeFileSync(outputPath, wavBuffer);
  console.log(`Generated ${outputPath} (${(wavBuffer.length / 1024).toFixed(1)} KB)`);
}

const targetPath = path.resolve("frontend/public/sounds/kaboom.wav");
generateKaboomWav(targetPath);

import { describe, expect, test } from "bun:test";
import { DampedSpring, HairSpringChain } from "./spring.ts";
import { sampleBeatDriver, setPlaybackSync } from "./beatDriver.ts";
import { pickDialogue } from "./dialogue.ts";
import { useJukeChanMood } from "../useJukeChanMood.ts";

describe("Juke-chan Live2D-style Rig & Interaction Engine", () => {
  test("DampedSpring converges smoothly toward target without NaN", () => {
    const spring = new DampedSpring(0, { stiffness: 150, damping: 14 });
    spring.target = 10;
    spring.impulse(25);

    for (let i = 0; i < 120; i++) {
      const val = spring.step(1 / 60);
      expect(Number.isFinite(val)).toBe(true);
    }
    expect(Math.abs(spring.value - 10)).toBeLessThan(0.15);
  });

  test("HairSpringChain produces secondary motion and settles back to rest", () => {
    const chain = new HairSpringChain({ stiffness: 130, damping: 10 });
    const deflected = chain.step(1 / 60, 18);
    expect(Math.abs(deflected)).toBeGreaterThan(0);

    for (let i = 0; i < 180; i++) {
      chain.step(1 / 60, 0);
    }
    expect(Math.abs(chain.step(1 / 60, 0))).toBeLessThan(0.1);
  });

  test("pickDialogue avoids immediate repeat and substitutes variables", () => {
    const first = pickDialogue("patHead");
    const second = pickDialogue("patHead");
    expect(first.text).not.toEqual(second.text);

    const welcome = pickDialogue("memberJoin", { name: "Ando" });
    expect(welcome.text).toContain("Ando");
  });

  test("BeatDriver outputs valid phase and energy in synthetic playback mode", () => {
    setPlaybackSync(true, 12.5);
    const frame = sampleBeatDriver(1050, "hype");
    expect(frame.isPlaying).toBe(true);
    expect(frame.beatPhase).toBeGreaterThanOrEqual(0);
    expect(frame.beatPhase).toBeLessThanOrEqual(1);
    expect(frame.bassEnergy).toBeGreaterThan(0);
  });

  test("Hit-zones trigger distinct gestures and 6 rapid taps trigger 5s pout", () => {
    const mood = useJukeChanMood();

    mood.onZoneTap("ahoge");
    expect(mood.activeGesture.value).toBe("flickAhoge");
    expect(mood.emotion.value).toBe("surprised");

    // Trigger 5 more rapid taps within 3 seconds (total 6 taps) -> poutSulking
    mood.onZoneTap("cheek");
    mood.onZoneTap("head");
    mood.onZoneTap("headphone");
    mood.onZoneTap("body");
    mood.onZoneTap("cheek");

    expect(mood.activeGesture.value).toBe("poutSulking");
    expect(mood.emotion.value).toBe("pout");
  });
});

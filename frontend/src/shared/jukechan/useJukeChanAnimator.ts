import { shallowRef, triggerRef, onMounted, onBeforeUnmount, watch } from "vue";
import {
  createDefaultParams,
  EMOTION_PRESETS,
  MOOD_BASELINES,
  type RigParams,
} from "./params.ts";
import { DampedSpring, HairSpringChain } from "./spring.ts";
import { sampleBeatDriver } from "./beatDriver.ts";
import { GESTURE_SPECS } from "./gestures.ts";
import { speechMouthLevel } from "./useTypewriter.ts";
import { rigImpulseEvent, useJukeChanMood } from "../useJukeChanMood.ts";

export interface RigDomRefs {
  rootGroup: SVGGElement | null;
  bodyGroup: SVGGElement | null;
  headGroup: SVGGElement | null;
  bangsGroup: SVGGElement | null;
  sideLGroup: SVGGElement | null;
  sideRGroup: SVGGElement | null;
  backHairGroup: SVGGElement | null;
  ahogeGroup: SVGGElement | null;
  irisLGroup: SVGGElement | null;
  irisRGroup: SVGGElement | null;
  upperLidL: SVGPathElement | null;
  upperLidR: SVGPathElement | null;
  browL: SVGPathElement | null;
  browR: SVGPathElement | null;
}

export function useJukeChanAnimator(
  domRefs: RigDomRefs,
  opts: { interactive?: boolean } = {}
) {
  const {
    currentMoodKey,
    emotion,
    awareness,
    activeGesture,
    isSpeaking,
    isKaraokeActive,
  } = useJukeChanMood();

  // Discrete reactive outputs used by template v-if / morphs (shallowRef to prevent 60fps deep reactivity diffing)
  const params = shallowRef<RigParams>(createDefaultParams());
  let lastDiscreteKey = "";
  let lastTriggerMs = 0;

  // Pointer target normalized (-1..1)
  let pointerX = 0;
  let pointerY = 0;
  let lastPointerMoveMs = 0;

  // Saccade eye-micro-dart state
  let saccadeX = 0;
  let saccadeY = 0;
  let nextSaccadeMs = 0;

  // Natural Blink Scheduler (random 1.8s..5.8s + 18% double blink)
  let nextBlinkMs = performance.now() + 2200;
  let blinkStartMs = -1;
  let isDoubleBlink = false;
  let blinkFactor = 1; // 1 = open, 0 = closed

  // Physical Springs
  const headYawSpring = new DampedSpring(0, { stiffness: 110, damping: 14 });
  const headPitchSpring = new DampedSpring(0, { stiffness: 120, damping: 14 });
  const headRollSpring = new DampedSpring(0, { stiffness: 135, damping: 12 });
  const bounceSpring = new DampedSpring(0, { stiffness: 210, damping: 13 });
  const eyeOpenSpring = new DampedSpring(1, { stiffness: 240, damping: 20 });
  const mouthOpenSpring = new DampedSpring(0, { stiffness: 320, damping: 22 });

  // Secondary Hair Physics Chains
  const bangsChain = new HairSpringChain({ stiffness: 145, damping: 11 });
  const sideLChain = new HairSpringChain({ stiffness: 115, damping: 9.5 });
  const sideRChain = new HairSpringChain({ stiffness: 115, damping: 9.5 });
  const backHairChain = new HairSpringChain({ stiffness: 90, damping: 9 });
  const ahogeSpring = new DampedSpring(0, { stiffness: 195, damping: 7.5 });

  let rafId: number | null = null;
  let lastFrameMs = performance.now();
  let prevHeadRoll = 0;
  let prevBounce = 0;
  let reducedMotion = false;

  // Listen to spring impulses from tap zones / gestures
  const stopImpulseWatch = watch(
    () => rigImpulseEvent.value.id,
    () => {
      const ev = rigImpulseEvent.value;
      if (ev.headRoll) headRollSpring.impulse(ev.headRoll);
      if (ev.bounce) bounceSpring.impulse(ev.bounce);
      if (ev.ahoge) ahogeSpring.impulse(ev.ahoge);
    }
  );

  function handlePointerMove(e: MouseEvent) {
    if (opts.interactive === false) return;
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    pointerX = Math.max(-1, Math.min(1, (e.clientX - cx) / cx));
    pointerY = Math.max(-1, Math.min(1, (e.clientY - cy) / cy));
    lastPointerMoveMs = performance.now();
  }

  function stepBlink(nowMs: number): number {
    if (blinkStartMs < 0 && nowMs >= nextBlinkMs) {
      blinkStartMs = nowMs;
      isDoubleBlink = Math.random() < 0.18;
    }

    if (blinkStartMs >= 0) {
      const elapsed = nowMs - blinkStartMs;
      const closeDur = 68;
      const openDur = 112;
      const totalSingle = closeDur + openDur;

      if (elapsed <= closeDur) {
        return 1 - elapsed / closeDur;
      } else if (elapsed <= totalSingle) {
        return (elapsed - closeDur) / openDur;
      } else if (isDoubleBlink && elapsed <= totalSingle + 65 + totalSingle) {
        const secondElapsed = elapsed - (totalSingle + 65);
        if (secondElapsed < 0) return 1;
        if (secondElapsed <= closeDur) return 1 - secondElapsed / closeDur;
        return (secondElapsed - closeDur) / openDur;
      } else {
        blinkStartMs = -1;
        // Log-normal-like natural interval between 1.8s and 5.8s
        const u = Math.random();
        nextBlinkMs = nowMs + 1800 + Math.pow(u, 1.5) * 4000;
        return 1;
      }
    }
    return 1;
  }

  function tick(nowMs: number) {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

    const moodKey = currentMoodKey.value;
    const baseline = MOOD_BASELINES[moodKey];
    const gestureKey = activeGesture.value;
    const gestureSpec = gestureKey ? GESTURE_SPECS[gestureKey] : null;
    const activeEmotionKey = gestureSpec ? gestureSpec.emotion : emotion.value;
    const emo = EMOTION_PRESETS[activeEmotionKey] ?? EMOTION_PRESETS.neutral;

    // 1. Sample audio or synthetic beat
    const beat = sampleBeatDriver(nowMs, moodKey);

    // Trigger bounce & head nod impulse on real beat hit
    if (beat.beatHit && !reducedMotion && awareness.value === "awake") {
      const strength = beat.bassEnergy * baseline.bounceFactor;
      bounceSpring.impulse(-42 * strength);
      headPitchSpring.impulse(3.8 * strength);
      ahogeSpring.impulse(28 * strength);
    }

    // 2. Breathing cycle
    const breathHz =
      awareness.value === "asleep" ? 0.14 : baseline.breathHz;
    const breath = 0.5 + 0.5 * Math.sin(nowMs * 0.001 * Math.PI * 2 * breathHz);

    // 3. Saccades & Gaze tracking
    if (nowMs >= nextSaccadeMs) {
      saccadeX = (Math.random() * 2 - 1) * 0.28;
      saccadeY = (Math.random() * 2 - 1) * 0.18;
      nextSaccadeMs = nowMs + 900 + Math.random() * 1900;
      // Trigger micro-blink on large gaze shift occasionally
      if (Math.abs(saccadeX) > 0.22 && Math.random() < 0.25 && blinkStartMs < 0) {
        nextBlinkMs = nowMs;
      }
    }

    const pointerFresh = nowMs - lastPointerMoveMs < 4000;
    const targetGazeX =
      awareness.value === "asleep"
        ? 0
        : activeEmotionKey === "pout"
        ? -0.65
        : pointerFresh
        ? pointerX * 0.85 + saccadeX * 0.25
        : saccadeX;
    const targetGazeY =
      awareness.value === "asleep"
        ? 0.2
        : pointerFresh
        ? pointerY * 0.75 + saccadeY * 0.25
        : saccadeY;

    // 4. Head kinematics (spring-delayed follow of gaze + beat groove + emotion offset)
    const swayWave = reducedMotion
      ? 0
      : Math.sin(beat.subPhase * Math.PI * 2) *
        (beat.isPlaying ? 2.8 * baseline.swayFactor : 1.1);
    const grooveBounce = reducedMotion
      ? 0
      : Math.sin(beat.beatPhase * Math.PI * 2) *
        (beat.isPlaying ? -5.5 * baseline.bounceFactor : -1.5);

    headYawSpring.target =
      targetGazeX * 0.65 + (emo.headYawOffset ?? 0);
    headPitchSpring.target =
      targetGazeY * 0.5 +
      (emo.headPitchOffset ?? 0) +
      Math.sin(beat.beatPhase * Math.PI * 2) * (beat.isPlaying ? 0.18 : 0.04);
    headRollSpring.target =
      swayWave * 1.15 +
      targetGazeX * 2.8 +
      (emo.headRollOffset ?? 0);
    bounceSpring.target = grooveBounce - breath * 2.2;

    const headYaw = headYawSpring.step(dt);
    const headPitch = headPitchSpring.step(dt);
    const headRoll = headRollSpring.step(dt);
    const bounce = bounceSpring.step(dt);
    const bodySway = swayWave * 0.65;

    // 5. Secondary Hair Physics driven by head angular & vertical velocity
    const rollVel = (headRoll - prevHeadRoll) / dt;
    const bounceVel = (bounce - prevBounce) / dt;
    prevHeadRoll = headRoll;
    prevBounce = bounce;

    const hairForce = -rollVel * 0.045 - bounceVel * 0.015;
    const bangsRot = reducedMotion
      ? 0
      : Math.max(-8, Math.min(8, bangsChain.step(dt, hairForce * 0.9)));
    const sideLRot = reducedMotion
      ? 0
      : Math.max(-12, Math.min(12, sideLChain.step(dt, hairForce * 1.35 - bounce * 0.18)));
    const sideRRot = reducedMotion
      ? 0
      : Math.max(-12, Math.min(12, sideRChain.step(dt, hairForce * 1.35 + bounce * 0.18)));
    const backRot = reducedMotion
      ? 0
      : Math.max(-7, Math.min(7, backHairChain.step(dt, hairForce * 0.8)));

    ahogeSpring.target = -rollVel * 0.06 + Math.sin(nowMs * 0.005) * 4;
    const ahogeRot = reducedMotion
      ? 0
      : Math.max(-28, Math.min(28, ahogeSpring.step(dt)));

    // 6. Eyes & Blink
    blinkFactor = stepBlink(nowMs);
    const baseEyeOpen = emo.eyeOpen ?? baseline.eyeOpen;
    eyeOpenSpring.target = baseEyeOpen;
    const smoothedEyeOpen = eyeOpenSpring.step(dt);
    const finalEyeOpen =
      awareness.value === "asleep"
        ? 0
        : Math.max(0, Math.min(1.25, smoothedEyeOpen * blinkFactor));

    // 7. Lip-Sync (Typewriter voice blips OR real song vocal energy)
    let targetMouthOpen = emo.mouthOpen ?? 0;
    if (isSpeaking.value && speechMouthLevel.value > 0.05) {
      targetMouthOpen = speechMouthLevel.value;
    } else if (
      beat.isPlaying &&
      awareness.value === "awake" &&
      activeEmotionKey !== "pout" &&
      activeEmotionKey !== "annoyed"
    ) {
      // Sing along to music when karaoke is active or during energetic vocal passages
      const singFactor = isKaraokeActive.value ? 1.0 : 0.65;
      if (beat.vocalEnergy > 0.18) {
        targetMouthOpen = Math.min(0.85, beat.vocalEnergy * singFactor);
      }
    }
    mouthOpenSpring.target = targetMouthOpen;
    const mouthOpen = Math.max(0, Math.min(1, mouthOpenSpring.step(dt)));

    // 8. Arm pose & wave oscillation
    const armPose = gestureSpec
      ? gestureSpec.armPose
      : isKaraokeActive.value
      ? "holdMic"
      : awareness.value === "asleep"
      ? "relaxed"
      : baseline.defaultArm;
    const oscHz = gestureSpec?.oscillateSpeedHz ?? 2.2;
    const armWavePhase = Math.sin(nowMs * 0.001 * Math.PI * 2 * oscHz);

    // Update reactive params for template morphs
    const p = params.value;
    p.headYaw = headYaw;
    p.headPitch = headPitch;
    p.headRoll = headRoll;
    p.bodySway = bodySway;
    p.breath = breath;
    p.bounce = bounce;
    p.eyeOpenL = finalEyeOpen;
    p.eyeOpenR = finalEyeOpen;
    p.eyeSmile = emo.eyeSmile ?? 0;
    p.gazeX = targetGazeX;
    p.gazeY = targetGazeY;
    p.pupilScale =
      (emo.pupilScale ?? 1) + (beat.isPlaying ? beat.bassEnergy * 0.08 : 0);
    p.eyeSpecial = gestureSpec?.eyeSpecial ?? emo.eyeSpecial ?? "none";
    p.browY = emo.browY ?? baseline.browY;
    p.browAngle = emo.browAngle ?? baseline.browAngle;
    p.mouthOpen = mouthOpen;
    p.mouthForm = emo.mouthForm ?? baseline.mouthForm;
    p.mouthShape = emo.mouthShape ?? baseline.mouthShape;
    p.cheekPuff = emo.cheekPuff ?? 0;
    p.blush = emo.blush ?? baseline.blush;
    p.armPose = armPose;
    p.armWavePhase = armWavePhase;
    p.hair.bangsRot = bangsRot;
    p.hair.sideLRot = sideLRot;
    p.hair.sideRRot = sideRRot;
    p.hair.backRot = backRot;
    p.hair.ahogeRot = ahogeRot;

    // Direct fast SVG transform writes for smooth 60fps
    if (domRefs.bodyGroup) {
      const breathScaleY = 1 + breath * 0.016;
      const breathScaleX = 1 + breath * 0.008;
      domRefs.bodyGroup.setAttribute(
        "transform",
        `translate(0, ${bounce.toFixed(2)}) rotate(${bodySway.toFixed(2)}, 200, 460) scale(${breathScaleX.toFixed(4)}, ${breathScaleY.toFixed(4)})`
      );
    }
    if (domRefs.headGroup) {
      const tx = headYaw * 6.5;
      const ty = bounce * 1.05 + headPitch * 5.5;
      domRefs.headGroup.setAttribute(
        "transform",
        `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) rotate(${headRoll.toFixed(2)}, 198, 286)`
      );
    }
    if (domRefs.backHairGroup) {
      const tx = -headYaw * 3.5;
      const ty = bounce * 0.85;
      domRefs.backHairGroup.setAttribute(
        "transform",
        `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) rotate(${backRot.toFixed(2)}, 200, 150)`
      );
    }
    if (domRefs.bangsGroup) {
      domRefs.bangsGroup.setAttribute(
        "transform",
        `rotate(${bangsRot.toFixed(2)}, 198, 95)`
      );
    }
    if (domRefs.sideLGroup) {
      domRefs.sideLGroup.setAttribute(
        "transform",
        `rotate(${sideLRot.toFixed(2)}, 118, 138)`
      );
    }
    if (domRefs.sideRGroup) {
      domRefs.sideRGroup.setAttribute(
        "transform",
        `rotate(${sideRRot.toFixed(2)}, 276, 138)`
      );
    }
    if (domRefs.ahogeGroup) {
      domRefs.ahogeGroup.setAttribute(
        "transform",
        `rotate(${ahogeRot.toFixed(2)}, 200, 52)`
      );
    }
    if (domRefs.irisLGroup && domRefs.irisRGroup) {
      const gx = (targetGazeX * 5.2).toFixed(2);
      const gy = (targetGazeY * 3.8).toFixed(2);
      const ps = p.pupilScale.toFixed(3);
      domRefs.irisLGroup.setAttribute(
        "transform",
        `translate(${gx}, ${gy}) translate(155, 205) scale(${ps}) translate(-155, -205)`
      );
      domRefs.irisRGroup.setAttribute(
        "transform",
        `translate(${gx}, ${gy}) translate(241, 205) scale(${ps}) translate(-241, -205)`
      );
    }

    // Discrete/throttled reactivity trigger for template morphs (v-if, mouth, arm pose)
    // Avoids 60fps Vue Virtual DOM diffing of 1000+ SVG nodes while preserving full 60fps transform smoothness
    const discreteKey = `${armPose}|${p.eyeSpecial}|${p.mouthShape}|${p.cheekPuff > 0.4}|${p.eyeSmile > 0.5}|${p.blush}|${currentMoodKey.value}`;
    const needsFastSync = p.mouthOpen > 0.1 || finalEyeOpen < 0.95;
    const nowThrottleMs = needsFastSync ? 40 : 100;

    if (discreteKey !== lastDiscreteKey || nowMs - lastTriggerMs >= nowThrottleMs) {
      lastDiscreteKey = discreteKey;
      lastTriggerMs = nowMs;
      triggerRef(params);
    }

    rafId = requestAnimationFrame(tick);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  onMounted(() => {
    if (typeof window !== "undefined") {
      reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
        false;
      window.addEventListener("mousemove", handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", handleVisibilityChange);
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  });

  onBeforeUnmount(() => {
    stopImpulseWatch();
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  return {
    params,
  };
}

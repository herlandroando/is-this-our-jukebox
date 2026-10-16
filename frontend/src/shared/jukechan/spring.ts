/**
 * Lightweight damped spring solver (semi-implicit Euler with sub-stepping clamp)
 * Used for head follow-through, bounce recovery, and secondary hair motion (bangs, side-locks, ahoge).
 */
export class DampedSpring {
  public value: number;
  public velocity = 0;
  public target: number;
  private stiffness: number;
  private damping: number;
  private mass: number;

  constructor(
    initial = 0,
    opts: { stiffness?: number; damping?: number; mass?: number } = {}
  ) {
    this.value = initial;
    this.target = initial;
    this.stiffness = opts.stiffness ?? 150;
    this.damping = opts.damping ?? 14;
    this.mass = opts.mass ?? 1;
  }

  public impulse(deltaVelocity: number) {
    this.velocity += deltaVelocity;
  }

  public snap(val: number) {
    this.value = val;
    this.target = val;
    this.velocity = 0;
  }

  public step(dtSeconds: number): number {
    // Clamp dt to avoid explosion after tab backgrounding
    const dt = Math.min(Math.max(dtSeconds, 0.001), 0.05);
    const force =
      -this.stiffness * (this.value - this.target) -
      this.damping * this.velocity;
    const accel = force / this.mass;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}

/**
 * 2-stage coupled pendulum spring for anime hair locks (root + tip overlap)
 */
export class HairSpringChain {
  private root: DampedSpring;
  private tip: DampedSpring;

  constructor(opts: { stiffness?: number; damping?: number } = {}) {
    const k = opts.stiffness ?? 120;
    const d = opts.damping ?? 10;
    this.root = new DampedSpring(0, { stiffness: k, damping: d, mass: 1.0 });
    this.tip = new DampedSpring(0, {
      stiffness: k * 0.72,
      damping: d * 0.8,
      mass: 0.85,
    });
  }

  public impulse(v: number) {
    this.root.impulse(v);
    this.tip.impulse(v * 1.25);
  }

  public step(dt: number, externalForce: number, restAngle = 0): number {
    this.root.target = restAngle + externalForce;
    const r = this.root.step(dt);
    this.tip.target = r * 1.15;
    const t = this.tip.step(dt);
    return r * 0.55 + t * 0.45;
  }
}

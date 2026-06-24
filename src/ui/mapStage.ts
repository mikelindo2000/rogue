/**
 * MapStageController — drives the 3D transform of the dungeon map plane
 * (`.map-plane`, which wraps only the game canvas, not the background art or
 * HUD). It owns transient, time-based effects that perturb the plane's
 * transform and damp back to identity, composed each animation frame.
 *
 * Phase 1 ships one effect — `rumble`, a decaying screen-shake fired on heavy
 * combat blows. The controller is deliberately decoupled from the DOM and the
 * clock (both injected) so the transform math is unit-testable with no browser:
 * see src/ui/mapStage.test.ts. GameUI (src/ui.ts) wires it to `.map-plane` and
 * ticks `applyFrame()` from its existing requestAnimationFrame loop.
 *
 * Effects are purely cosmetic. No gameplay state, timing, or information lives
 * here, and everything collapses to identity under `prefers-reduced-motion`.
 *
 * Design: design/planning/map_3d_plane_plan.md.
 */

export interface RumbleOptions {
  /** 0..1, how violent the shake is. Default 0.6. */
  intensity?: number;
  /** Lifetime in ms. Default 340. */
  durationMs?: number;
}

export interface MapStageOptions {
  /** Writes the composed CSS transform to the plane element (or '' for identity). */
  apply: (transform: string) => void;
  /** Monotonic clock in ms. Defaults to performance.now(). */
  now?: () => number;
  /** RNG in [0,1). Defaults to Math.random. Injected for deterministic tests. */
  random?: () => number;
  /** When true, all effects are suppressed (collapse to identity). */
  reducedMotion?: boolean;
}

interface Rumble {
  start: number;
  life: number;
  intensity: number;
  phaseX: number;
  phaseY: number;
  phaseR: number;
}

// Peak excursions at intensity 1. Kept small: the shake must read as a jolt
// without throwing tiles far enough off to make pointer→tile mapping feel wrong
// for the ~300ms it lives (see the plan's "pointer → tile mapping" risk).
const MAX_TRANSLATE = 9; // px, in-plane shake
const MAX_ROT = 0.8; // deg, rotateZ wobble
const MAX_Z = 16; // px, translateZ punch toward the camera (needs the parent's perspective)
const DEFAULT_INTENSITY = 0.6;
const DEFAULT_DURATION = 340; // ms

// Angular frequencies (rad/ms), ~15-23Hz, intentionally incommensurate per axis
// so the shake looks organic rather than a clean oscillation.
const OMEGA_X = 0.118;
const OMEGA_Y = 0.143;
const OMEGA_R = 0.097;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round = (n: number) => Math.round(n * 1000) / 1000;

export class MapStageController {
  private rumbles: Rumble[] = [];
  private reduced: boolean;
  private wasIdentity = true;
  private readonly apply: (transform: string) => void;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(opts: MapStageOptions) {
    this.apply = opts.apply;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
    this.random = opts.random ?? Math.random;
    this.reduced = opts.reducedMotion ?? false;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.settle();
  }

  /** Queue a screen-shake. No-op under reduced motion. */
  rumble(opts: RumbleOptions = {}): void {
    if (this.reduced) return;
    const intensity = clamp01(opts.intensity ?? DEFAULT_INTENSITY);
    if (intensity <= 0) return;
    const life = Math.max(1, opts.durationMs ?? DEFAULT_DURATION);
    this.rumbles.push({
      start: this.now(),
      life,
      intensity,
      phaseX: this.random() * Math.PI * 2,
      phaseY: this.random() * Math.PI * 2,
      phaseR: this.random() * Math.PI * 2,
    });
  }

  /** True while any effect is still alive (keeps GameUI's rAF loop spinning). */
  isAnimating(): boolean {
    const t = this.now();
    return this.rumbles.some(r => t - r.start < r.life);
  }

  /** Compose all live effects into one transform and write it to the plane.
   *  Drops expired effects and settles to identity when nothing is left. */
  applyFrame(): void {
    const t = this.now();
    if (this.rumbles.length) {
      this.rumbles = this.rumbles.filter(r => t - r.start < r.life);
    }
    if (this.rumbles.length === 0) {
      this.settle();
      return;
    }

    let dx = 0;
    let dy = 0;
    let dz = 0;
    let rot = 0;
    for (const r of this.rumbles) {
      const p = clamp01((t - r.start) / r.life);
      const env = (1 - p) * (1 - p); // snappy quadratic decay
      const amp = MAX_TRANSLATE * r.intensity * env;
      dx += Math.sin(t * OMEGA_X + r.phaseX) * amp;
      dy += Math.cos(t * OMEGA_Y + r.phaseY) * amp;
      rot += Math.sin(t * OMEGA_R + r.phaseR) * MAX_ROT * r.intensity * env;
      dz += MAX_Z * r.intensity * env; // sums toward the camera at impact
    }

    this.wasIdentity = false;
    this.apply(
      `translate3d(${round(dx)}px, ${round(dy)}px, ${round(dz)}px) rotateZ(${round(rot)}deg)`,
    );
  }

  /** Force the plane back to identity. */
  settle(): void {
    this.rumbles.length = 0;
    if (!this.wasIdentity) {
      this.wasIdentity = true;
      this.apply('');
    }
  }
}

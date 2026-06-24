/**
 * Floor-change transitions for the map plane.
 *
 * A transition is an *adapter*: a pure `apply(progress, ctx)` that drives two
 * abstract layers — the outgoing "ghost" (a snapshot of the floor you're
 * leaving) and the incoming "live" canvas (the floor you're arriving on) —
 * through transform + opacity. Because an effect only talks to the ctx setters,
 * the same effect could be bound to any two layers, not just the stairs flow.
 *
 * `FloorTransitionController` binds the active effect to the real map DOM and
 * runs it off GameUI's existing rAF loop (like MapStageController). The logical
 * floor swap stays synchronous in the engine; this is purely a visual overlay,
 * so input during the ~300ms never acts on half-loaded state.
 *
 * Registry + switcher: the active effect is chosen by id (persisted in settings,
 * flipped live by FloorTransitionSwitcher). Adding an effect = one registry
 * entry. Reduced motion always resolves to the opacity-only `dissolve`.
 *
 * Design: design/active/map_3d_plane_plan.md (Phase 2).
 */

export type FloorDir = 'down' | 'up';

/** What an effect can manipulate. Deliberately layer-agnostic so effects are
 *  reusable outside the stairs flow. */
export interface FloorTransitionContext {
  /** 'down' = descending (delta +1), 'up' = ascending. Mirror your motion on it. */
  dir: FloorDir;
  reducedMotion: boolean;
  /** Incoming floor (the live canvas wrapper). */
  setLiveTransform(transform: string): void;
  setLiveOpacity(opacity: number): void;
  /** Outgoing floor (the ghost snapshot wrapper). */
  setGhostTransform(transform: string): void;
  setGhostOpacity(opacity: number): void;
}

export interface FloorTransition {
  id: string;
  /** Human label for the switcher. */
  label: string;
  /** Total duration in ms. Kept short — players change floors constantly. */
  durationMs: number;
  /** Apply the visual state for progress `p` in [0,1]. Called every frame. */
  apply(p: number, ctx: FloorTransitionContext): void;
}

// --- easing -------------------------------------------------------------
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInCubic = (p: number) => p * p * p;
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const round = (n: number) => Math.round(n * 100) / 100;

// --- effects ------------------------------------------------------------

/** Z-push + fade (the recommended default). The floor you leave lifts away and
 *  recedes into the screen while the new floor rises from depth toward you, with
 *  a small directional Y so descend vs ascend read as opposite. */
const zpush: FloorTransition = {
  id: 'zpush',
  label: 'Z-push',
  durationMs: 340,
  apply(p, ctx) {
    const s = ctx.dir === 'down' ? 1 : -1;
    // Outgoing: lift away (against travel) + recede + slight shrink, fade by ~60%.
    const out = easeInCubic(clamp01(p / 0.58));
    ctx.setGhostOpacity(round(1 - out));
    ctx.setGhostTransform(
      `translateY(${round(-s * 24 * out)}px) translateZ(${round(-220 * out)}px) scale(${round(1 - 0.04 * out)})`,
    );
    // Incoming: rise from depth + from the travel direction, fading in from ~30%.
    const inP = easeOutCubic(clamp01((p - 0.28) / 0.72));
    ctx.setLiveOpacity(round(inP));
    ctx.setLiveTransform(
      `translateY(${round(s * 34 * (1 - inP))}px) translateZ(${round(-260 * (1 - inP))}px)`,
    );
  },
};

/** Opacity-only crossfade. The reduced-motion fallback, and a calm option in
 *  its own right. No transforms, so it's the cheapest and least dizzying. */
const dissolve: FloorTransition = {
  id: 'dissolve',
  label: 'Dissolve',
  durationMs: 240,
  apply(p, ctx) {
    const e = easeInOutCubic(p);
    ctx.setGhostTransform('');
    ctx.setLiveTransform('');
    ctx.setGhostOpacity(round(1 - e));
    ctx.setLiveOpacity(round(e));
  },
};

/** Trapdoor drop. The old floor falls away (accelerating) while the new floor
 *  drops in from the opposite side and settles. More characterful, slightly
 *  bigger travel — a fun contrast in the switcher. */
const gravity: FloorTransition = {
  id: 'gravity',
  label: 'Gravity',
  durationMs: 360,
  apply(p, ctx) {
    const s = ctx.dir === 'down' ? 1 : -1;
    // Outgoing: accelerate away in the travel direction, fade out late.
    const out = easeInCubic(p);
    ctx.setGhostOpacity(round(1 - clamp01((p - 0.25) / 0.75)));
    ctx.setGhostTransform(`translateY(${round(s * 150 * out)}px)`);
    // Incoming: drop in from the opposite side with a tiny overshoot settle.
    const inP = easeOutCubic(clamp01((p - 0.15) / 0.85));
    const y = -s * 130 * (1 - inP);
    ctx.setLiveOpacity(round(clamp01(p / 0.4)));
    ctx.setLiveTransform(`translateY(${round(y)}px)`);
  },
};

/** Ordered for the switcher; `zpush` first = default. */
export const FLOOR_TRANSITION_LIST: FloorTransition[] = [zpush, dissolve, gravity];

export const FLOOR_TRANSITIONS: Record<string, FloorTransition> = Object.fromEntries(
  FLOOR_TRANSITION_LIST.map(t => [t.id, t]),
);

export const DEFAULT_FLOOR_TRANSITION = zpush.id;

/** Pick the effect for an id, honoring reduced motion (always `dissolve`) and
 *  falling back to the default for an unknown/stale stored id. */
export function resolveFloorTransition(id: string, reducedMotion: boolean): FloorTransition {
  if (reducedMotion) return dissolve;
  return FLOOR_TRANSITIONS[id] ?? FLOOR_TRANSITIONS[DEFAULT_FLOOR_TRANSITION];
}

// --- controller ---------------------------------------------------------

export interface FloorTransitionLayers {
  /** Wrapper around the live canvas (`.map-transition`). */
  liveLayer: HTMLElement | null;
  /** Wrapper around the ghost canvas (`.map-ghost`); hidden at rest. */
  ghostLayer: HTMLElement | null;
  /** The live game canvas, captured into the ghost on begin. */
  liveCanvas: HTMLCanvasElement | null;
  /** The ghost canvas the old frame is copied into. */
  ghostCanvas: HTMLCanvasElement | null;
}

export interface FloorTransitionControllerOptions extends FloorTransitionLayers {
  now?: () => number;
  reducedMotion?: boolean;
}

export class FloorTransitionController {
  private readonly layers: FloorTransitionLayers;
  private readonly now: () => number;
  private reduced: boolean;
  private active: { transition: FloorTransition; dir: FloorDir; start: number } | null = null;

  constructor(opts: FloorTransitionControllerOptions) {
    this.layers = opts;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
    this.reduced = opts.reducedMotion ?? false;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** Snapshot the current (outgoing) floor and start a transition. Call this
   *  BEFORE the engine repaints the live canvas to the new floor. No-op without
   *  the DOM layers (tests / bare canvas). */
  begin(dir: FloorDir, transition: FloorTransition): void {
    const { liveLayer, ghostLayer } = this.layers;
    if (!liveLayer || !ghostLayer) return;
    this.captureGhost();
    ghostLayer.style.display = 'flex';
    this.active = { transition, dir, start: this.now() };
    this.applyAt(0);
  }

  isAnimating(): boolean {
    if (!this.active) return false;
    return this.now() - this.active.start < this.active.transition.durationMs;
  }

  /** Advance one frame; finishes and resets when past the duration. */
  applyFrame(): void {
    if (!this.active) return;
    const p = (this.now() - this.active.start) / this.active.transition.durationMs;
    if (p >= 1) {
      this.finish();
      return;
    }
    this.applyAt(p);
  }

  private applyAt(p: number): void {
    const a = this.active;
    if (!a) return;
    const { liveLayer, ghostLayer } = this.layers;
    a.transition.apply(p, {
      dir: a.dir,
      reducedMotion: this.reduced,
      setLiveTransform: t => { if (liveLayer) liveLayer.style.transform = t; },
      setLiveOpacity: o => { if (liveLayer) liveLayer.style.opacity = String(o); },
      setGhostTransform: t => { if (ghostLayer) ghostLayer.style.transform = t; },
      setGhostOpacity: o => { if (ghostLayer) ghostLayer.style.opacity = String(o); },
    });
  }

  private finish(): void {
    const { liveLayer, ghostLayer } = this.layers;
    if (liveLayer) {
      liveLayer.style.transform = '';
      liveLayer.style.opacity = '';
    }
    if (ghostLayer) {
      ghostLayer.style.display = 'none';
      ghostLayer.style.transform = '';
      ghostLayer.style.opacity = '';
    }
    this.active = null;
  }

  /** Copy the live canvas pixels (and pan transform/size) into the ghost so the
   *  outgoing floor stays visible while the live canvas repaints underneath. */
  private captureGhost(): void {
    const { liveCanvas, ghostCanvas } = this.layers;
    if (!liveCanvas || !ghostCanvas) return;
    if (ghostCanvas.width !== liveCanvas.width) ghostCanvas.width = liveCanvas.width;
    if (ghostCanvas.height !== liveCanvas.height) ghostCanvas.height = liveCanvas.height;
    ghostCanvas.style.width = liveCanvas.style.width;
    ghostCanvas.style.height = liveCanvas.style.height;
    // Mirror the player-centering pan so the ghost overlays the live board exactly.
    ghostCanvas.style.transform = liveCanvas.style.transform;
    const gctx = ghostCanvas.getContext('2d');
    if (gctx) {
      gctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
      gctx.drawImage(liveCanvas, 0, 0);
    }
  }
}

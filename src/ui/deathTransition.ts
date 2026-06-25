import type { DeathCause } from '../runStats';

export interface DeathTransitionRequest {
  outcome: 'died' | 'won';
  runId: string;
  floorReached: number;
  deathCause?: DeathCause;
  killedByMonsterId?: string;
}

export interface DeathTransitionContext {
  reducedMotion: boolean;
  setPlaneTransform(transform: string): void;
  setPlaneFilter(filter: string): void;
  setPlaneOpacity(opacity: number): void;
  setPlaneOrigin(origin: string): void;
  setVeilOpacity(opacity: number): void;
  setVeilBackground(background: string): void;
}

export interface DeathTransition {
  id: string;
  label: string;
  durationMs: number;
  apply(p: number, ctx: DeathTransitionContext): void;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInCubic = (p: number) => p * p * p;
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const round = (n: number) => Math.round(n * 100) / 100;

const lastSpiral: DeathTransition = {
  id: 'last-spiral',
  label: 'The Last Spiral',
  durationMs: 1220,
  apply(p, ctx) {
    const e = easeInOutCubic(p);
    const drift = easeInCubic(p);
    const fade = clamp01((p - 0.56) / 0.44);
    ctx.setPlaneOrigin('50% 50%');
    ctx.setPlaneOpacity(round(1 - fade * 0.92));
    ctx.setPlaneFilter(
      `blur(${round(5.5 * e)}px) saturate(${round(1 - 0.74 * e)}) brightness(${round(1 - 0.45 * e)})`,
    );
    ctx.setPlaneTransform(
      `translateZ(${round(-620 * drift)}px) rotateX(${round(70 * e)}deg) rotateZ(${round(-540 * e)}deg) scale(${round(1 - 0.62 * drift)})`,
    );
    ctx.setVeilOpacity(round(clamp01((p - 0.12) / 0.72) * 0.92));
    ctx.setVeilBackground(
      'radial-gradient(ellipse at 50% 48%, rgba(12, 8, 16, 0) 0%, rgba(5, 4, 7, 0.42) 54%, rgba(0, 0, 0, 0.96) 100%)',
    );
  },
};

const torchOut: DeathTransition = {
  id: 'torch-out',
  label: 'Torch Goes Out',
  durationMs: 1050,
  apply(p, ctx) {
    const e = easeInOutCubic(p);
    const radius = round(86 - 84 * e);
    const edge = round(Math.min(98, radius + 12));
    ctx.setPlaneOrigin('50% 50%');
    ctx.setPlaneOpacity(round(1 - 0.22 * e));
    ctx.setPlaneTransform(`scale(${round(1 - 0.025 * e)})`);
    ctx.setPlaneFilter(
      `blur(${round(2.2 * e)}px) saturate(${round(1 - 0.64 * e)}) brightness(${round(1 - 0.82 * e)})`,
    );
    ctx.setVeilOpacity(round(clamp01(p / 0.18)));
    ctx.setVeilBackground(
      `radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) ${radius}%, rgba(0, 0, 0, 0.78) ${edge}%, rgba(0, 0, 0, 0.98) 100%)`,
    );
  },
};

const foldShut: DeathTransition = {
  id: 'fold-shut',
  label: 'Dungeon Folds Shut',
  durationMs: 1150,
  apply(p, ctx) {
    const e = easeInOutCubic(p);
    const drop = easeOutCubic(p);
    const fade = clamp01((p - 0.42) / 0.58);
    ctx.setPlaneOrigin('50% 78%');
    ctx.setPlaneOpacity(round(1 - 0.86 * fade));
    ctx.setPlaneFilter(
      `blur(${round(3.2 * e)}px) brightness(${round(1 - 0.55 * e)}) contrast(${round(1 + 0.25 * e)})`,
    );
    ctx.setPlaneTransform(
      `translateY(${round(22 * drop)}px) translateZ(${round(-210 * e)}px) rotateX(${round(82 * e)}deg) scaleY(${round(1 - 0.92 * e)})`,
    );
    ctx.setVeilOpacity(round(0.88 * e));
    ctx.setVeilBackground(
      'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.52) 46%, rgba(0, 0, 0, 0.98) 100%)',
    );
  },
};

const dissolve: DeathTransition = {
  id: 'dissolve',
  label: 'Dissolve',
  durationMs: 220,
  apply(p, ctx) {
    const e = easeInOutCubic(p);
    ctx.setPlaneOrigin('50% 50%');
    ctx.setPlaneTransform('');
    ctx.setPlaneOpacity(round(1 - 0.5 * e));
    ctx.setPlaneFilter(`blur(${round(1.4 * e)}px) brightness(${round(1 - 0.45 * e)})`);
    ctx.setVeilOpacity(round(0.72 * e));
    ctx.setVeilBackground('rgba(0, 0, 0, 0.92)');
  },
};

export const DEATH_TRANSITION_LIST: DeathTransition[] = [lastSpiral, torchOut, foldShut];

export const DEATH_TRANSITIONS: Record<string, DeathTransition> = Object.fromEntries(
  [...DEATH_TRANSITION_LIST, dissolve].map(t => [t.id, t]),
);

export const REDUCED_DEATH_TRANSITION = dissolve.id;

export function chooseDeathTransition(
  request: DeathTransitionRequest,
  reducedMotion: boolean,
  random: () => number = Math.random,
): DeathTransition | null {
  if (request.outcome !== 'died') return null;
  if (reducedMotion) return DEATH_TRANSITIONS[REDUCED_DEATH_TRANSITION];
  const idx = Math.floor(clamp01(random()) * DEATH_TRANSITION_LIST.length);
  return DEATH_TRANSITION_LIST[Math.min(DEATH_TRANSITION_LIST.length - 1, idx)];
}

export interface DeathTransitionLayers {
  plane: HTMLElement | null;
  veil: HTMLElement | null;
}

export interface DeathTransitionControllerOptions extends DeathTransitionLayers {
  now?: () => number;
  reducedMotion?: boolean;
}

export class DeathTransitionController {
  private readonly layers: DeathTransitionLayers;
  private readonly now: () => number;
  private reduced: boolean;
  private active: { transition: DeathTransition; start: number; resolve: () => void } | null = null;

  constructor(opts: DeathTransitionControllerOptions) {
    this.layers = { plane: opts.plane, veil: opts.veil };
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
    this.reduced = opts.reducedMotion ?? false;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  begin(transition: DeathTransition): Promise<void> {
    if (!this.layers.plane) return Promise.resolve();
    this.reset();
    return new Promise(resolve => {
      this.active = { transition, start: this.now(), resolve };
      this.applyAt(0);
    });
  }

  isAnimating(): boolean {
    if (!this.active) return false;
    return this.now() - this.active.start < this.active.transition.durationMs;
  }

  applyFrame(): void {
    if (!this.active) return;
    const p = (this.now() - this.active.start) / this.active.transition.durationMs;
    if (p >= 1) {
      this.skipToEnd();
      return;
    }
    this.applyAt(p);
  }

  skipToEnd(): void {
    if (!this.active) return;
    this.applyAt(1);
    const resolve = this.active.resolve;
    this.active = null;
    resolve();
  }

  reset(): void {
    const active = this.active;
    this.active = null;
    const { plane, veil } = this.layers;
    if (plane) {
      plane.style.transform = '';
      plane.style.filter = '';
      plane.style.opacity = '';
      plane.style.transformOrigin = '';
    }
    if (veil) {
      veil.style.opacity = '0';
      veil.style.background = '';
    }
    active?.resolve();
  }

  private applyAt(rawP: number): void {
    const active = this.active;
    if (!active) return;
    const { plane, veil } = this.layers;
    const p = clamp01(rawP);
    active.transition.apply(p, {
      reducedMotion: this.reduced,
      setPlaneTransform: value => { if (plane) plane.style.transform = value; },
      setPlaneFilter: value => { if (plane) plane.style.filter = value; },
      setPlaneOpacity: value => { if (plane) plane.style.opacity = String(value); },
      setPlaneOrigin: value => { if (plane) plane.style.transformOrigin = value; },
      setVeilOpacity: value => { if (veil) veil.style.opacity = String(value); },
      setVeilBackground: value => { if (veil) veil.style.background = value; },
    });
  }
}

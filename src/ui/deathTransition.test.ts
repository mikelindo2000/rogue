import { describe, it, expect } from 'vitest';
import {
  chooseDeathTransition,
  DeathTransitionController,
  DEATH_TRANSITION_LIST,
  DEATH_TRANSITIONS,
  REDUCED_DEATH_TRANSITION,
  type DeathTransition,
  type DeathTransitionContext,
} from './deathTransition';

function sample(t: DeathTransition, p: number) {
  const out = { transform: '', filter: '', opacity: 1, origin: '', veilOpacity: 0, veilBackground: '' };
  const ctx: DeathTransitionContext = {
    reducedMotion: false,
    setPlaneTransform: v => (out.transform = v),
    setPlaneFilter: v => (out.filter = v),
    setPlaneOpacity: v => (out.opacity = v),
    setPlaneOrigin: v => (out.origin = v),
    setVeilOpacity: v => (out.veilOpacity = v),
    setVeilBackground: v => (out.veilBackground = v),
  };
  t.apply(p, ctx);
  return out;
}

function request() {
  return { outcome: 'died' as const, runId: 'run-1', floorReached: 7 };
}

function stubEl() {
  return { style: {} as Record<string, string> } as unknown as HTMLElement;
}

describe('death transition registry', () => {
  it('defines the first three death variants', () => {
    expect(DEATH_TRANSITION_LIST.map(t => t.id)).toEqual(['last-spiral', 'torch-out', 'fold-shut']);
  });

  it('chooses death variants from a random slot', () => {
    expect(chooseDeathTransition(request(), false, () => 0.0)?.id).toBe('last-spiral');
    expect(chooseDeathTransition(request(), false, () => 0.4)?.id).toBe('torch-out');
    expect(chooseDeathTransition(request(), false, () => 0.8)?.id).toBe('fold-shut');
  });

  it('does not choose a death transition for victory yet', () => {
    expect(chooseDeathTransition({ outcome: 'won', runId: 'run-2', floorReached: 20 }, false, () => 0)).toBeNull();
  });

  it('uses the dissolve fallback under reduced motion', () => {
    expect(chooseDeathTransition(request(), true, () => 0)?.id).toBe(REDUCED_DEATH_TRANSITION);
  });

  it('keeps every transition brief', () => {
    for (const transition of [...DEATH_TRANSITION_LIST, DEATH_TRANSITIONS[REDUCED_DEATH_TRANSITION]]) {
      expect(transition.durationMs).toBeGreaterThan(0);
      expect(transition.durationMs).toBeLessThanOrEqual(1400);
    }
  });
});

describe('death transition choreography', () => {
  for (const transition of DEATH_TRANSITION_LIST) {
    it(`${transition.id}: darkens the board by the end`, () => {
      const start = sample(transition, 0);
      const end = sample(transition, 1);
      expect(start.opacity).toBeGreaterThan(end.opacity);
      expect(end.veilOpacity).toBeGreaterThan(start.veilOpacity);
      expect(end.filter).toContain('blur');
    });
  }

  it('last spiral rotates and recedes in 3D', () => {
    const end = sample(DEATH_TRANSITIONS['last-spiral'], 1);
    expect(end.transform).toContain('translateZ');
    expect(end.transform).toContain('rotateX');
    expect(end.transform).toContain('rotateZ');
  });

  it('torch out uses a shrinking radial veil', () => {
    const mid = sample(DEATH_TRANSITIONS['torch-out'], 0.5);
    const end = sample(DEATH_TRANSITIONS['torch-out'], 1);
    expect(mid.veilBackground).toContain('radial-gradient(circle');
    expect(end.veilBackground).toContain('2%');
  });

  it('fold shut changes transform origin and folds the plane', () => {
    const end = sample(DEATH_TRANSITIONS['fold-shut'], 1);
    expect(end.origin).toBe('50% 78%');
    expect(end.transform).toContain('rotateX');
    expect(end.transform).toContain('scaleY');
  });
});

describe('DeathTransitionController', () => {
  function harness() {
    let t = 0;
    const plane = stubEl();
    const veil = stubEl();
    const ctrl = new DeathTransitionController({ plane, veil, now: () => t });
    return { ctrl, plane, veil, advance: (ms: number) => (t += ms) };
  }

  it('applies a transition and resolves when skipped to the end', async () => {
    const h = harness();
    let resolved = false;
    const done = h.ctrl.begin(DEATH_TRANSITIONS['last-spiral']).then(() => (resolved = true));
    expect(h.ctrl.isAnimating()).toBe(true);
    expect(h.plane.style.transform).toContain('translateZ');

    h.ctrl.skipToEnd();
    await done;

    expect(resolved).toBe(true);
    expect(h.ctrl.isAnimating()).toBe(false);
    expect(h.veil.style.opacity).not.toBe('0');
  });

  it('finishes on the first frame past duration', async () => {
    const h = harness();
    const transition = DEATH_TRANSITIONS['torch-out'];
    const done = h.ctrl.begin(transition);
    h.advance(transition.durationMs + 1);
    h.ctrl.applyFrame();
    await done;

    expect(h.ctrl.isAnimating()).toBe(false);
    expect(h.plane.style.filter).toContain('blur');
  });

  it('resets inline styles and resolves the active transition', async () => {
    const h = harness();
    let resolved = false;
    const done = h.ctrl.begin(DEATH_TRANSITIONS['fold-shut']).then(() => (resolved = true));
    h.ctrl.reset();
    await done;

    expect(resolved).toBe(true);
    expect(h.plane.style.transform).toBe('');
    expect(h.plane.style.filter).toBe('');
    expect(h.plane.style.opacity).toBe('');
    expect(h.veil.style.opacity).toBe('0');
  });

  it('is a no-op without a map plane', async () => {
    const ctrl = new DeathTransitionController({ plane: null, veil: null });
    await expect(ctrl.begin(DEATH_TRANSITIONS['last-spiral'])).resolves.toBeUndefined();
    expect(ctrl.isAnimating()).toBe(false);
  });
});

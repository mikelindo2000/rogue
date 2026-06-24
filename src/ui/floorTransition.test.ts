import { describe, it, expect } from 'vitest';
import {
  FLOOR_TRANSITION_LIST,
  FLOOR_TRANSITIONS,
  resolveFloorTransition,
  FloorTransitionController,
  DEFAULT_FLOOR_TRANSITION,
  type FloorTransition,
  type FloorTransitionContext,
} from './floorTransition';

/** Collect what an effect writes at a given progress. */
function sample(t: FloorTransition, p: number, dir: 'down' | 'up' = 'down') {
  const out = { liveT: '', liveO: 1, ghostT: '', ghostO: 1 };
  const ctx: FloorTransitionContext = {
    dir,
    reducedMotion: false,
    setLiveTransform: v => (out.liveT = v),
    setLiveOpacity: v => (out.liveO = v),
    setGhostTransform: v => (out.ghostT = v),
    setGhostOpacity: v => (out.ghostO = v),
  };
  t.apply(p, ctx);
  return out;
}

describe('floor transition registry', () => {
  it('default id resolves and is first in the list', () => {
    expect(FLOOR_TRANSITION_LIST[0].id).toBe(DEFAULT_FLOOR_TRANSITION);
    expect(FLOOR_TRANSITIONS[DEFAULT_FLOOR_TRANSITION]).toBeTruthy();
  });

  it('resolves a known id', () => {
    expect(resolveFloorTransition('gravity', false).id).toBe('gravity');
  });

  it('falls back to the default for an unknown/stale id', () => {
    expect(resolveFloorTransition('nope-removed', false).id).toBe(DEFAULT_FLOOR_TRANSITION);
  });

  it('reduced motion always resolves to the opacity-only dissolve', () => {
    expect(resolveFloorTransition('zpush', true).id).toBe('dissolve');
    expect(resolveFloorTransition('gravity', true).id).toBe('dissolve');
  });

  it('every effect has a positive, snappy duration', () => {
    for (const t of FLOOR_TRANSITION_LIST) {
      expect(t.durationMs).toBeGreaterThan(0);
      expect(t.durationMs).toBeLessThanOrEqual(600);
    }
  });
});

describe('effect choreography (crossfade boundaries)', () => {
  for (const t of FLOOR_TRANSITION_LIST) {
    it(`${t.id}: starts with old visible / new hidden, ends inverted`, () => {
      const start = sample(t, 0);
      expect(start.ghostO).toBeGreaterThan(0.9);
      expect(start.liveO).toBeLessThan(0.1);

      const end = sample(t, 1);
      expect(end.ghostO).toBeLessThan(0.1);
      expect(end.liveO).toBeGreaterThan(0.9);
    });
  }

  it('dissolve never applies a transform (opacity only)', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const s = sample(FLOOR_TRANSITIONS.dissolve, p);
      expect(s.liveT).toBe('');
      expect(s.ghostT).toBe('');
    }
  });

  it('zpush mirrors direction: descend and ascend push opposite ways at mid', () => {
    const down = sample(FLOOR_TRANSITIONS.zpush, 0.5, 'down');
    const up = sample(FLOOR_TRANSITIONS.zpush, 0.5, 'up');
    const ghostY = (s: string) => Number(s.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? 0);
    expect(Math.sign(ghostY(down.ghostT))).toBe(-Math.sign(ghostY(up.ghostT)));
    expect(ghostY(down.ghostT)).not.toBe(0);
  });
});

/** Minimal element stub exposing just a mutable `style`. */
function stubEl() {
  return { style: {} as Record<string, string> } as unknown as HTMLElement;
}

describe('FloorTransitionController', () => {
  function harness() {
    let t = 0;
    const live = stubEl();
    const ghost = stubEl();
    const ctrl = new FloorTransitionController({
      liveLayer: live,
      ghostLayer: ghost,
      liveCanvas: null, // capture is a no-op without canvases; fine for logic
      ghostCanvas: null,
      now: () => t,
    });
    return { ctrl, live, ghost, advance: (ms: number) => (t += ms) };
  }

  it('shows the ghost on begin and animates for the effect duration', () => {
    const h = harness();
    h.ctrl.begin('down', FLOOR_TRANSITIONS.zpush);
    expect(h.ghost.style.display).toBe('flex');
    expect(h.ctrl.isAnimating()).toBe(true);

    h.advance(FLOOR_TRANSITIONS.zpush.durationMs - 10);
    expect(h.ctrl.isAnimating()).toBe(true);
    h.advance(20);
    expect(h.ctrl.isAnimating()).toBe(false);
  });

  it('hides the ghost and clears inline live styles when it finishes', () => {
    const h = harness();
    h.ctrl.begin('down', FLOOR_TRANSITIONS.zpush);
    h.advance(FLOOR_TRANSITIONS.zpush.durationMs + 5);
    h.ctrl.applyFrame(); // first frame past the end → finish()
    expect(h.ghost.style.display).toBe('none');
    expect(h.live.style.transform).toBe('');
    expect(h.live.style.opacity).toBe('');
    expect(h.ctrl.isAnimating()).toBe(false);
  });

  it('is a no-op without DOM layers', () => {
    const ctrl = new FloorTransitionController({
      liveLayer: null,
      ghostLayer: null,
      liveCanvas: null,
      ghostCanvas: null,
      now: () => 0,
    });
    ctrl.begin('down', FLOOR_TRANSITIONS.zpush);
    expect(ctrl.isAnimating()).toBe(false);
  });
});

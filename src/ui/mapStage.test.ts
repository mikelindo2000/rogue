import { describe, it, expect } from 'vitest';
import { MapStageController } from './mapStage';

/** Build a controller with a hand-driven clock and fixed RNG so the
 *  transform math is fully deterministic. */
function harness(reducedMotion = false) {
  let t = 0;
  const applied: string[] = [];
  const ctrl = new MapStageController({
    apply: s => applied.push(s),
    now: () => t,
    random: () => 0.5,
    reducedMotion,
  });
  return {
    ctrl,
    applied,
    last: () => applied[applied.length - 1],
    advance: (ms: number) => {
      t += ms;
    },
    setTime: (ms: number) => {
      t = ms;
    },
  };
}

describe('MapStageController', () => {
  it('is idle and writes nothing until an effect fires', () => {
    const h = harness();
    expect(h.ctrl.isAnimating()).toBe(false);
    h.ctrl.applyFrame();
    // No effects + already identity → no writes at all.
    expect(h.applied).toHaveLength(0);
  });

  it('animates while a rumble is alive, then stops', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 1, durationMs: 300 });
    expect(h.ctrl.isAnimating()).toBe(true);

    h.ctrl.applyFrame();
    expect(h.last()).toMatch(/^translate3d\(/);
    expect(h.last()).toMatch(/rotateZ\(/);

    h.advance(150);
    expect(h.ctrl.isAnimating()).toBe(true);

    h.advance(200); // total 350 > 300ms life
    expect(h.ctrl.isAnimating()).toBe(false);
  });

  it('settles back to identity exactly once after the effect expires', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 1, durationMs: 300 });
    h.ctrl.applyFrame(); // active frame
    h.advance(400);
    h.ctrl.applyFrame(); // first frame past life → identity
    expect(h.last()).toBe('');

    const count = h.applied.length;
    h.ctrl.applyFrame(); // nothing left, already identity → no further write
    expect(h.applied.length).toBe(count);
  });

  it('decays: the impact frame moves the plane more than a late frame', () => {
    const magnitude = (s: string) => {
      const m = s.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, ([-\d.]+)px\)/);
      if (!m) return 0;
      return Math.abs(+m[1]) + Math.abs(+m[2]) + Math.abs(+m[3]);
    };
    const h = harness();
    h.ctrl.rumble({ intensity: 1, durationMs: 300 });
    h.setTime(5);
    h.ctrl.applyFrame();
    const early = magnitude(h.last());
    h.setTime(270); // near end of life
    h.ctrl.applyFrame();
    const late = magnitude(h.last());
    expect(early).toBeGreaterThan(late);
  });

  it('pushes the plane toward the camera (positive Z) at impact', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 1, durationMs: 300 });
    h.setTime(1);
    h.ctrl.applyFrame();
    const z = +h.last().match(/translate3d\([-\d.]+px, [-\d.]+px, ([-\d.]+)px\)/)![1];
    expect(z).toBeGreaterThan(0);
  });

  it('is a no-op under reduced motion', () => {
    const h = harness(true);
    h.ctrl.rumble({ intensity: 1 });
    expect(h.ctrl.isAnimating()).toBe(false);
    h.ctrl.applyFrame();
    expect(h.applied).toHaveLength(0);
  });

  it('ignores zero/negative intensity', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 0 });
    expect(h.ctrl.isAnimating()).toBe(false);
  });

  it('composes concurrent rumbles and stays animating until the last expires', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 0.6, durationMs: 200 });
    h.advance(100);
    h.ctrl.rumble({ intensity: 0.6, durationMs: 300 });
    h.ctrl.applyFrame();
    expect(h.last()).toMatch(/^translate3d\(/);
    h.advance(150); // first (200) expired at 250>200; second alive until 400
    expect(h.ctrl.isAnimating()).toBe(true);
    h.advance(200); // now 300 since 2nd start > 300
    expect(h.ctrl.isAnimating()).toBe(false);
  });

  it('setReducedMotion(true) settles an in-flight shake', () => {
    const h = harness();
    h.ctrl.rumble({ intensity: 1, durationMs: 300 });
    h.ctrl.applyFrame();
    h.ctrl.setReducedMotion(true);
    expect(h.last()).toBe('');
    expect(h.ctrl.isAnimating()).toBe(false);
  });
});

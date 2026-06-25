import { describe, it, expect } from 'vitest';
import { simulateRun, simulateRuns, formatRunReport } from './run';
import { curveReport } from './balance';
import { shapeForTemplate } from './archetypes';

describe('full-run simulator', () => {
  it('produces a deterministic, monotone-ish descent for a fixed seed', () => {
    const a = simulateRun(12345);
    const b = simulateRun(12345);
    // Reproducible.
    expect(a.floors.map((f) => f.atk)).toEqual(b.floors.map((f) => f.atk));

    // Reaches some depth and accrues power.
    expect(a.floors.length).toBeGreaterThan(5);
    const first = a.floors[0];
    const deep = a.floors[a.floors.length - 1];
    expect(deep.atk).toBeGreaterThan(first.atk);
    expect(deep.def).toBeGreaterThanOrEqual(first.def);
    expect(deep.maxHp).toBeGreaterThanOrEqual(first.maxHp);
  });

  it('is reasonably calibrated to DEFAULT_CURVE (which is fit to this sim)', () => {
    const rep = simulateRuns(120);
    expect(rep.byFloor.length).toBeGreaterThan(5);
    // DEFAULT_CURVE is calibrated FROM this sim, so measured def should track the
    // assumed (linear) curve within a loose band — not the 6× gulf of the old
    // hand-guessed curve. (Real def is mildly convex, so allow generous slack.)
    const mid = rep.byFloor.find((f) => f.floor === 10)!;
    const ratio = mid.meanDef / mid.assumedDef;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.4);
  });

  it('reports resource pressure with valid ranges', () => {
    const rep = simulateRuns(120);
    for (const f of rep.byFloor) {
      expect(f.medianLowestHpFrac).toBeLessThanOrEqual(1);
      expect(f.dangerDipRate).toBeGreaterThanOrEqual(0);
      expect(f.dangerDipRate).toBeLessThanOrEqual(1);
      expect(f.deathRate).toBeGreaterThanOrEqual(0);
    }
    expect(rep.clearRate).toBeGreaterThanOrEqual(0);
    expect(rep.clearRate).toBeLessThanOrEqual(1);
  });

  it('pins the difficulty curve: smooth ramp, no cliff, hard-but-winnable', () => {
    // Teeth that guard the tuned curve — a regression that re-introduces a
    // difficulty cliff (the floor-17 wall this balance work removed) must fail
    // here, not pass silently. The two earlier "valid ranges" checks are vacuous
    // on purpose (they vet the sim plumbing); THIS one vets the balance.

    // 1. Analytic grading is deterministic (no sampling) → a stable smoothness
    //    bound. maxFloorJump was 0.371 at the cliff, ~0.08 after tuning.
    const cr = curveReport({ trials: 0, shapeFor: shapeForTemplate });
    expect(cr.maxFloorJump).toBeLessThan(0.15);

    // 2. No single floor may be a lethal wall in the (upper-bound) duel sim.
    //    Peak death is ~33% post-tuning; the old floor-17 cliff hit 71%.
    const rep = simulateRuns(300);
    const worstFloor = rep.byFloor.reduce((a, b) => (b.deathRate > a.deathRate ? b : a));
    expect(worstFloor.deathRate).toBeLessThan(0.6);

    // 3. The sim is an optimistic upper bound (greedy gear, 1v1, no hunger), so a
    //    healthy build clears a real fraction — but the game stays hard (not all
    //    runs clear). Wide band: this asserts "playable", not a precise number.
    expect(rep.clearRate).toBeGreaterThan(0.05);
    expect(rep.clearRate).toBeLessThan(0.95);
  });

  it('prints a report (visible with --reporter=verbose or on failure)', () => {
    // Not an assertion — a convenient way to eyeball the numbers via the test
    // runner. Run: npx vitest run src/ai/run.test.ts -t prints
    const out = formatRunReport(400);
    console.log('\n' + out + '\n');
    expect(out).toContain('Measured power curve');
  });
});

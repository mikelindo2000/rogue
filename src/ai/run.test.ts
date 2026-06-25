import { describe, it, expect } from 'vitest';
import { simulateRun, simulateRuns, formatRunReport } from './run';

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

  it('prints a report (visible with --reporter=verbose or on failure)', () => {
    // Not an assertion — a convenient way to eyeball the numbers via the test
    // runner. Run: npx vitest run src/ai/run.test.ts -t prints
    const out = formatRunReport(400);
    console.log('\n' + out + '\n');
    expect(out).toContain('Measured power curve');
  });
});

import { describe, expect, it } from 'vitest';
import { hungerView, survivalWarningView } from './format';

describe('hungerView', () => {
  it('maps raw hunger to label, percent, and tone', () => {
    expect(hungerView(800, 190, 425, 800)).toEqual({ status: 'Satiated', pct: 100, tone: 'ok' });
    expect(hungerView(424, 190, 425, 800)).toEqual({ status: 'Hungry', pct: 53, tone: 'warn' });
    expect(hungerView(189, 190, 425, 800)).toEqual({ status: 'Fatigued', pct: 24, tone: 'low' });
    expect(hungerView(0, 190, 425, 800)).toEqual({ status: 'Starving', pct: 0, tone: 'crit' });
  });
});

describe('survivalWarningView', () => {
  const base = { hp: 30, maxHp: 30, hunger: 800, hungerFatigued: 190, hungerHungry: 425 };

  it('stays inactive when HP and hunger are safe', () => {
    expect(survivalWarningView(base)).toEqual({ tone: 'none', intensity: 0 });
  });

  it('starts the HP warning at 25%', () => {
    expect(survivalWarningView({ ...base, hp: 8 }).tone).toBe('none');
    const warning = survivalWarningView({ ...base, hp: 7.5 });
    expect(warning.tone).toBe('health');
    expect(warning.intensity).toBeCloseTo(0.45);
  });

  it('starts hunger warning when hungry and intensifies toward starvation', () => {
    expect(survivalWarningView({ ...base, hunger: 425 }).tone).toBe('none');
    const early = survivalWarningView({ ...base, hunger: 424 });
    const starving = survivalWarningView({ ...base, hunger: 0 });
    expect(early.tone).toBe('hunger');
    expect(early.intensity).toBeGreaterThan(0.4);
    expect(starving.intensity).toBeGreaterThan(early.intensity);
  });

  it('uses a distinct combined state when HP and hunger warnings overlap', () => {
    const warning = survivalWarningView({ ...base, hp: 5, hunger: 100 });
    expect(warning.tone).toBe('both');
    expect(warning.intensity).toBeGreaterThan(0.8);
  });

  it('clamps intensity at one for extreme danger', () => {
    expect(survivalWarningView({ ...base, hp: 1, hunger: 0 }).intensity).toBe(1);
  });
});

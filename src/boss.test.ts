import { describe, it, expect } from 'vitest';
import { bossPhase, bossIntensity, bossEncounterView, type BossSighting } from './boss';

describe('bossPhase', () => {
  it('gates on remaining HP fraction (66% / 33% thresholds)', () => {
    expect(bossPhase(1)).toBe(1);
    expect(bossPhase(0.67)).toBe(1);
    expect(bossPhase(0.66)).toBe(2);
    expect(bossPhase(0.34)).toBe(2);
    expect(bossPhase(0.33)).toBe(3);
    expect(bossPhase(0)).toBe(3);
  });
});

describe('bossIntensity', () => {
  it('is always tense once engaged and ramps as the boss is worn down', () => {
    expect(bossIntensity(1)).toBeCloseTo(0.4, 5); // baseline at full HP
    expect(bossIntensity(0.5)).toBeCloseTo(0.65, 5);
    // enrage bump kicks in below 25%
    expect(bossIntensity(0.2)).toBeGreaterThan(bossIntensity(0.3));
    expect(bossIntensity(0)).toBe(1); // clamped
  });

  it('clamps out-of-range input', () => {
    expect(bossIntensity(2)).toBe(0.4);
    expect(bossIntensity(-1)).toBe(1);
  });
});

describe('bossEncounterView', () => {
  const boss = (over: Partial<BossSighting> = {}): BossSighting => ({
    key: 'dragon-king',
    name: 'Dragon King',
    hp: 1050,
    maxHp: 1050,
    ...over,
  });

  it('returns null when no boss is sighted', () => {
    expect(bossEncounterView([])).toBeNull();
  });

  it('projects the engaged boss with derived phase + intensity', () => {
    const view = bossEncounterView([boss({ hp: 525 })]);
    expect(view).toMatchObject({ name: 'Dragon King', hp: 525, maxHp: 1050, phase: 2 });
    expect(view!.hpPct).toBeCloseTo(0.5, 5);
    expect(view!.intensity).toBeCloseTo(0.65, 5);
  });

  it('picks the most-wounded boss when several are on screen', () => {
    const view = bossEncounterView([
      boss({ key: 'a', name: 'A', hp: 900 }),
      boss({ key: 'b', name: 'B', hp: 100 }),
    ]);
    expect(view!.name).toBe('B');
  });

  it('tolerates a zero/absent maxHp without dividing by zero', () => {
    const view = bossEncounterView([boss({ hp: 10, maxHp: 0 })]);
    expect(view!.hpPct).toBe(1);
  });
});

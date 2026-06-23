import { describe, it, expect } from 'vitest';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';

const cyclops = MONSTER_DATABASE.find((m) => m.name === 'Cyclops')!;
const colossal = MONSTER_DATABASE.find((m) => m.name === 'Colossal Cyclops')!;

describe('Cyclops', () => {
  it('resolves to the brute archetype with a telegraphed heavy slam', () => {
    const b = resolveBehavior({ name: 'Cyclops' });
    expect(b.id).toBe('brute');
    expect(archetypeOf({ name: 'Cyclops' })).toBe('brute');

    const slam = b.attacks[0];
    expect(slam.id).toBe('slam');
    // Heavily telegraphed: a windup the player can step out of.
    expect(slam.windupTurns).toBeGreaterThan(0);
    // Hits harder than a plain swing.
    expect(slam.damageMultiplier).toBeGreaterThan(1);
    // The brute has no evasion — it eats hits, it just dishes out big ones.
    expect(b.defense.dodgeChance ?? 0).toBe(0);
  });

  it('elite Colossal Cyclops resolves to the brute archetype too', () => {
    const b = resolveBehavior({ name: 'Colossal Cyclops' });
    expect(b.id).toBe('brute');
    expect(archetypeOf({ name: 'Colossal Cyclops' })).toBe('brute');
    expect(b.attacks[0].windupTurns).toBeGreaterThan(0);
  });

  it('is balanced in the fair band at floor 17 (harness)', () => {
    const report = analyzeMonster(cyclops, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(17);
    expect(report.difficulty).toBe('fair');
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
  });

  it('elite Colossal Cyclops is balanced in the fair band at floor 17 (harness)', () => {
    const report = analyzeMonster(colossal, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(17);
    expect(report.difficulty).toBe('fair');
    // The elite sits a touch higher in the band than the base Cyclops.
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
    expect(report.analysis.threat).toBeGreaterThan(
      analyzeMonster(cyclops, { shapeFor: shapeForTemplate }).analysis.threat,
    );
  });
});

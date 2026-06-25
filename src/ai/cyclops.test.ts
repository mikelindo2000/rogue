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

  it('sits at the floor-17 ramp peak (harness; band tuned via run.ts)', () => {
    // The Cyclops pair WAS the floor-17 difficulty cliff (threat 0.42/0.58 vs the
    // recalibrated curve). The June 2026 pass filed it down to the top of a gentle
    // floors-9→17 ramp (~0.27), so it now reads "easy" by duel threat — but it's
    // still the deepest, hardest regular content, and real runs stack multi-monster
    // + hunger on top. The exact band is owned by the full-run harness (src/ai/run.ts).
    const report = analyzeMonster(cyclops, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(17);
    expect(report.analysis.threat).toBeGreaterThan(0.15);
    expect(['easy', 'fair']).toContain(report.difficulty);
  });

  it('elite Colossal Cyclops sits a touch above the base Cyclops at floor 17', () => {
    const report = analyzeMonster(colossal, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(17);
    expect(report.analysis.threat).toBeGreaterThanOrEqual(
      analyzeMonster(cyclops, { shapeFor: shapeForTemplate }).analysis.threat,
    );
  });
});

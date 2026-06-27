import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { applyOnHitAbilities } from '../monster';

const zombieTemplate = MONSTER_DATABASE.find((m) => m.name === 'Zombie')!;
const zacharyTemplate = MONSTER_DATABASE.find((m) => m.name === 'Zachary the Zombie')!;

function zombie(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: zombieTemplate.symbol,
    name: 'Zombie',
    hp: zombieTemplate.hp,
    maxHp: zombieTemplate.hp,
    atk: zombieTemplate.atk,
    color: zombieTemplate.color,
    minFloor: zombieTemplate.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

describe('Zombie', () => {
  it('resolves to the leech archetype: hunt movement, plain melee, leechHeal on hit', () => {
    const b = resolveBehavior({ name: 'Zombie' });
    expect(b.id).toBe('leech');
    expect(archetypeOf({ name: 'Zombie' })).toBe('leech');

    // Hunt movement + plain melee (no windup, multiplier 1) — direct damage is
    // identical to the default archetype, so it stays balance-neutral.
    expect(b.movement.style).toBe('hunt');
    expect(b.attacks).toHaveLength(1);
    expect(b.attacks[0].range).toBe(1);
    expect(b.attacks[0].damageMultiplier).toBe(1);
    expect(b.attacks[0].windupTurns).toBe(0);

    const leech = b.abilities.find((a) => a.id === 'leechHeal');
    expect(leech).toBeDefined();
    expect(leech!.trigger).toBe('onHit');
    expect(leech!.magnitude).toBeGreaterThan(0);
    // Conservative knob: a small fraction of the Zombie's HP/hit, not a heal wall.
    expect(leech!.magnitude!).toBeLessThan(zombieTemplate.atk);
    // No flee — the zombie just keeps grinding you down.
    expect(leech!.thenFlee).toBeUndefined();
  });

  it('Zachary the Zombie (elite) also resolves to the leech archetype', () => {
    const b = resolveBehavior({ name: 'Zachary the Zombie' });
    expect(b.id).toBe('leech');
    expect(archetypeOf({ name: 'Zachary the Zombie' })).toBe('leech');
    expect(b.abilities.some((a) => a.id === 'leechHeal')).toBe(true);
  });

  it('heals a wounded Zombie when it lands a bite (capped at maxHp)', () => {
    const b = resolveBehavior({ name: 'Zombie' });
    const magnitude = b.abilities.find((a) => a.id === 'leechHeal')!.magnitude!;

    // Wounded: plenty of headroom, so a landed hit heals by exactly the magnitude.
    const wounded = zombie({ hp: 100, maxHp: 275 });
    // activeEffects: [] — the Zombie now also carries a Putrid Bite silence whose
    // applyEffect path reads player.activeEffects; an empty list keeps this leech
    // test focused on the heal while tolerating a silence proc.
    const player = { gold: 0, activeEffects: [] } as unknown as Player;
    const logs = applyOnHitAbilities(b, wounded, player, makeRng(1));
    expect(wounded.hp).toBe(100 + magnitude);
    expect(logs.join(' ')).toMatch(/drains your vitality/);

    // Near max: the heal is clamped so HP never exceeds maxHp.
    const nearMax = zombie({ hp: 274, maxHp: 275 });
    applyOnHitAbilities(b, nearMax, player, makeRng(1));
    expect(nearMax.hp).toBe(275);
    expect(nearMax.hp).toBeLessThanOrEqual(nearMax.maxHp!);
  });

  it('produces a valid direct-damage harness reading at floor 19 (heal not modeled)', () => {
    // The harness has no healing term, so this vets ONLY the Zombie's direct melee
    // (its atk). Plain-melee shape == default, so assigning leech is balance-neutral.
    // The exact band is no longer pinned here — DEFAULT_CURVE is calibrated to the
    // full-run sim (src/ai/run.ts), which owns the difficulty verdict.
    for (const t of [zombieTemplate, zacharyTemplate]) {
      const report = analyzeMonster(t, { trials: 1500, shapeFor: shapeForTemplate });
      expect(report.floor).toBe(19);
      expect(report.analysis.threat).toBeGreaterThan(0);
      expect(['trivial', 'easy', 'fair', 'hard', 'lethal']).toContain(report.difficulty);
    }
  });
});

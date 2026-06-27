import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { applyOnHitAbilities } from '../monster';
import { tickPlayerEffects, hasEffect } from '../effects';

const template = MONSTER_DATABASE.find((m) => m.name === 'Brown Bat')!;

function bat(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: template.symbol,
    name: 'Brown Bat',
    hp: template.hp,
    maxHp: template.hp,
    atk: template.atk,
    color: template.color,
    minFloor: template.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

// A bare player carrying only the fields the poison path touches.
function player(over: Partial<Player> = {}): Player {
  return { hp: 20, maxHp: 20, gold: 0, activeEffects: [], ...over } as unknown as Player;
}

// Forces the poison ability's single chance() roll (its only RNG draw). The
// poison case consumes nothing else, so an always-true / always-false chance
// stub deterministically procs or skips it.
function chanceRng(fire: boolean): RNG {
  return {
    seed: 0,
    next: () => 0,
    int: () => 0,
    range: (min) => min,
    chance: () => fire,
    pick: <T>(a: readonly T[]) => a[0],
    getState: () => 0,
  };
}

describe('Brown Bat', () => {
  it('resolves to the bat archetype with a poison on-hit ability (sheet 3% / 1 dmg / 3 turns)', () => {
    const b = resolveBehavior({ name: 'Brown Bat' });
    expect(b.id).toBe('bat');
    expect(archetypeOf({ name: 'Brown Bat' })).toBe('bat');

    const poison = b.abilities.find((a) => a.id === 'poison');
    expect(poison).toBeDefined();
    expect(poison!.trigger).toBe('onHit');
    // Sheet "Poisonous Puke" values, verbatim.
    expect(poison!.chance).toBe(0.03);
    expect(poison!.magnitude).toBe(1);
    expect(poison!.duration).toBe(3);
    expect(poison!.damageType).toBe('poison');
  });

  it('inflicts a poison DoT on a hit whose chance roll passes, which then ticks deterministically', () => {
    const b = resolveBehavior({ name: 'Brown Bat' });
    const m = bat();
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'dot')).toBe(true);
    expect(p.activeEffects[0]).toMatchObject({ kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });
    expect(logs.join(' ')).toMatch(/Brown Bat pukes poison on you/);

    // 1 dmg/turn for 3 turns, then it expires.
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(p.hp).toBe(17);
    expect(hasEffect(p, 'dot')).toBe(false);
  });

  it('does not poison (or touch the player) on a hit whose chance roll fails', () => {
    const b = resolveBehavior({ name: 'Brown Bat' });
    const m = bat();
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'dot')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(p.hp).toBe(20);
    expect(logs).toHaveLength(0);
  });

  it('produces a valid harness reading at floor 1 (on-hit DoT sits outside the balance model)', () => {
    // The harness models only the primary attack's DPS, so the poison ability is
    // balance-neutral by construction — the swoop shape is unchanged.
    const report = analyzeMonster(template, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(template.minFloor);
    expect(report.analysis.threat).toBeGreaterThan(0);
    expect(['trivial', 'easy', 'fair', 'hard', 'lethal']).toContain(report.difficulty);
  });
});

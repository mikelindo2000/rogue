import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, tickPlayerEffects } from '../effects';

/**
 * The stun ability: a NEW effect kind wired into the spine once (Cyclops
 * "Intimidating Stare", Xelhua "Stomp"). Both inflict a 1-turn stun, assigned
 * per-monster in MONSTER_ABILITIES so siblings sharing an archetype are
 * unaffected. Values are the sheet's verbatim (3% on hit, 1 turn).
 *
 * Mirrors bat.test.ts: force the proc with a stubbed RNG and assert the effect
 * applied + ticks/expires; a no-proc case asserts the player is untouched
 * (parity). The engine-level proof that a stunned player actually loses a turn
 * lives in engine.test.ts — effects.test.ts / this file can't drive the turn
 * gate.
 */

// A bare monster carrying only the fields the stun path touches.
function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'C',
    name,
    hp: 100,
    maxHp: 100,
    atk: 50,
    color: '#fff',
    minFloor: 17,
    frozenTurns: 0,
    ...over,
  };
}

function player(over: Partial<Player> = {}): Player {
  return { hp: 20, maxHp: 20, gold: 0, activeEffects: [], ...over } as unknown as Player;
}

// Forces the ability's single chance() roll (its only RNG draw). The stun case
// consumes nothing else, so an always-true / always-false chance stub
// deterministically procs or skips it.
function chanceRng(fire: boolean): RNG {
  return {
    seed: 0,
    next: () => 0,
    int: () => 0,
    range: (min: number) => min,
    chance: () => fire,
    pick: <T>(a: readonly T[]) => a[0],
    getState: () => 0,
  } as unknown as RNG;
}

describe('stun abilities (Cyclops / Xelhua)', () => {
  it('Cyclops resolves with an Intimidating Stare stun (3% / 1 turn) on top of its Munch DoT', () => {
    const b = resolveBehavior({ name: 'Cyclops' });
    expect(archetypeOf({ name: 'Cyclops' })).toBe('brute');
    const stun = b.abilities.find((a) => a.id === 'stun');
    expect(stun).toBeDefined();
    expect(stun!.trigger).toBe('onHit');
    expect(stun!.chance).toBe(0.03);
    expect(stun!.duration).toBe(1);
    // It keeps its Munch DoT too — abilities merge additively.
    expect(b.abilities.find((a) => a.id === 'poison')).toBeDefined();
  });

  it('Xelhua resolves with a Stomp stun (3% / 1 turn) as pure data on the default archetype', () => {
    const b = resolveBehavior({ name: 'Xelhua' });
    expect(archetypeOf({ name: 'Xelhua' })).toBe('default');
    const stun = b.abilities.find((a) => a.id === 'stun');
    expect(stun).toBeDefined();
    expect(stun!.chance).toBe(0.03);
    expect(stun!.duration).toBe(1);
    // Stomp is the only thing Xelhua adds — no DoT.
    expect(b.abilities).toHaveLength(1);
  });

  it('inflicts a stun on a hit whose chance roll passes, which then ticks away', () => {
    const b = resolveBehavior({ name: 'Xelhua' });
    const m = monster('Xelhua');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'stun')).toBe(true);
    expect(p.activeEffects[0]).toMatchObject({ kind: 'stun', turns: 1, source: 'Xelhua' });
    expect(logs.join(' ')).toMatch(/Xelhua makes you cower in fear/);
    // No HP cost on application.
    expect(p.hp).toBe(20);

    // One tick expires the 1-turn stun.
    tickPlayerEffects(p);
    expect(hasEffect(p, 'stun')).toBe(false);
    expect(p.hp).toBe(20);
  });

  it('does not stun (or touch the player) on a hit whose chance roll fails (parity)', () => {
    const b = resolveBehavior({ name: 'Xelhua' });
    const m = monster('Xelhua');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'stun')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(p.hp).toBe(20);
    expect(logs).toHaveLength(0);
  });

  it.each([
    { name: 'Yeti', chance: 0.01, duration: 1 },
    { name: 'Michael the Minotaur', chance: 0.01, duration: 1 },
    { name: 'Gary the Golem', chance: 0.03, duration: 2 },
  ])('$name resolves with its stun (pure data: $chance / $duration turn)', ({ name, chance, duration }) => {
    const stun = resolveBehavior({ name }).abilities.find((a) => a.id === 'stun');
    expect(stun, `${name} should have a stun`).toBeDefined();
    expect(stun!.chance).toBe(chance);
    expect(stun!.duration).toBe(duration);
  });

  it('does not leak the stun to siblings sharing an archetype', () => {
    // Colossal Cyclops shares 'brute' with Cyclops but has its own sheet abilities —
    // it must NOT inherit Cyclops's Intimidating Stare.
    expect(resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.id === 'stun')).toBeUndefined();
    // A plain `default` monster (Orc) stays ability-free — Xelhua's Stomp keyed by
    // id must not leak to every default monster.
    expect(resolveBehavior({ name: 'Orc' }).abilities.find((a) => a.id === 'stun')).toBeUndefined();
    expect(resolveBehavior({ name: 'Orc' }).abilities).toHaveLength(0);
  });
});

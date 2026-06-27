import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, tickPlayerEffects } from '../effects';

/**
 * The fear ability: a NEW effect kind whose read site randomizes the player's
 * MOVE intent (Xelhua "Giantfolk Growl", Agitated Apperation "Ingest Spirit
 * Dust"). Assigned per-monster in MONSTER_ABILITIES so siblings sharing an
 * archetype are unaffected. Values verbatim from the sheet (1% on hit).
 *
 * Mirrors stun-abilities.test.ts: force the proc with a stubbed RNG and assert
 * the effect applied + ticks/expires; a no-proc case asserts the player is
 * untouched (parity). The engine-level proof that a feared player's move goes
 * random lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'V',
    name,
    hp: 100,
    maxHp: 100,
    atk: 90,
    color: '#fff',
    minFloor: 19,
    frozenTurns: 0,
    ...over,
  };
}

function player(over: Partial<Player> = {}): Player {
  return { hp: 20, maxHp: 20, gold: 0, activeEffects: [], ...over } as unknown as Player;
}

// Forces the ability's single chance() roll (its only RNG draw). The fear case
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

describe('fear abilities (Xelhua / Agitated Apperation)', () => {
  it('Xelhua resolves with a Giantfolk Growl fear (1% / 3 turns) on top of its Stomp stun', () => {
    const b = resolveBehavior({ name: 'Xelhua' });
    expect(archetypeOf({ name: 'Xelhua' })).toBe('default');
    const fear = b.abilities.find((a) => a.id === 'fear');
    expect(fear).toBeDefined();
    expect(fear!.label).toBe('Giantfolk Growl');
    expect(fear!.chance).toBe(0.01);
    expect(fear!.duration).toBe(3);
    // It keeps its Stomp stun too — abilities merge additively.
    expect(b.abilities.find((a) => a.id === 'stun')).toBeDefined();
  });

  it('Agitated Apperation resolves with an Ingest Spirit Dust fear (1% / 2 turns)', () => {
    const b = resolveBehavior({ name: 'Agitated Apperation' });
    const fear = b.abilities.find((a) => a.id === 'fear');
    expect(fear).toBeDefined();
    expect(fear!.label).toBe('Ingest Spirit Dust');
    expect(fear!.chance).toBe(0.01);
    expect(fear!.duration).toBe(2);
    // Agitated also carries its Hysteria bonus-damage hit (A1); the fear is A2.
    expect(b.abilities).toHaveLength(2);
    expect(b.abilities.find((a) => a.id === 'bonusDamage')?.label).toBe('Hysteria');
  });

  it('inflicts fear on a hit whose chance roll passes, which then ticks away', () => {
    // Isolate the fear ability (Agitated also has a bonus-damage hit that would
    // otherwise add HP loss under chance=1) so this asserts fear's no-HP-cost.
    const fear = resolveBehavior({ name: 'Agitated Apperation' }).abilities.find((a) => a.id === 'fear')!;
    const b = { abilities: [fear] } as unknown as ReturnType<typeof resolveBehavior>;
    const m = monster('Agitated Apperation');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'fear')).toBe(true);
    expect(p.activeEffects[0]).toMatchObject({ kind: 'fear', turns: 2, source: 'Agitated Apperation' });
    expect(logs.join(' ')).toMatch(/Agitated Apperation fills you with terror/);
    // No HP cost on application.
    expect(p.hp).toBe(20);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'fear')).toBe(false);
    expect(p.hp).toBe(20);
  });

  it('does not fear (or touch the player) on a hit whose chance roll fails (parity)', () => {
    const b = resolveBehavior({ name: 'Agitated Apperation' });
    const m = monster('Agitated Apperation');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'fear')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(p.hp).toBe(20);
    expect(logs).toHaveLength(0);
  });

  it('does not leak fear to siblings sharing an archetype', () => {
    // The base Apperation shares 'default' with Agitated but has no sheet ability —
    // it must NOT inherit Ingest Spirit Dust.
    expect(resolveBehavior({ name: 'Apperation' }).abilities.find((a) => a.id === 'fear')).toBeUndefined();
    // A plain default monster (Orc) stays fear-free.
    expect(resolveBehavior({ name: 'Orc' }).abilities.find((a) => a.id === 'fear')).toBeUndefined();
  });
});

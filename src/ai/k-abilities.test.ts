import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior } from './archetypes';
import { applyOnHitAbilities, applyExtraHits } from '../monster';
import { ensureRuntime } from './brain';

/**
 * Category K — monster self-buff (Second Head), multi-hit (Furious Fangs), and
 * extra-attack (Laser Focus). selfBuff is a RUNTIME mutation on the generic
 * applyOnHitAbilities/fireAbility path; extraHits is resolved in the ATTACK path
 * (applyExtraHits) because it needs totalDef + computeMonsterDamage.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return { x: 0, y: 0, symbol: 'K', name, hp: 50, maxHp: 50, atk: 7, color: '#fff', minFloor: 1, frozenTurns: 0, ...over };
}
function player(over: Partial<Player> = {}): Player {
  return { x: 0, y: 0, hp: 200, maxHp: 200, gold: 0, activeEffects: [], ...over } as unknown as Player;
}
// A forced-chance RNG. `fire` gates every chance() roll; int() returns a fixed
// value so the hit-count roll is deterministic. range annotated to satisfy
// svelte-check's no-implicit-any (per the skill's RNG-stub note).
function chanceRng(fire: boolean, intVal = 0): RNG {
  return {
    seed: 0,
    next: () => 0,
    int: () => intVal,
    range: (min: number) => min,
    chance: () => fire,
    pick: <T>(a: readonly T[]) => a[0],
    getState: () => 0,
  } as unknown as RNG;
}

describe('K: selfBuff (Second Head)', () => {
  it('Kalius resolves with Second Head (selfBuff, 1%, +50%/2t)', () => {
    const sb = resolveBehavior({ name: 'Kalius King Cobra' }).abilities.find((a) => a.id === 'selfBuff');
    expect(sb).toMatchObject({ label: 'Second Head', chance: 0.01, buffMagnitude: 0.5, duration: 2 });
  });

  it('a proc sets the monster runtime atk buff (turns + mult) and logs', () => {
    const b = resolveBehavior({ name: 'Kalius King Cobra' });
    const m = monster('Kalius King Cobra');
    const logs = applyOnHitAbilities(b, m, player(), chanceRng(true));
    const rt = ensureRuntime(m);
    expect(rt.atkBuffTurns).toBe(2);
    expect(rt.atkBuffMult).toBeCloseTo(1.5);
    expect(logs.join(' ')).toMatch(/grows a second head/);
  });

  it('no proc leaves the runtime buff untouched (parity)', () => {
    const b = resolveBehavior({ name: 'Kalius King Cobra' });
    const m = monster('Kalius King Cobra');
    applyOnHitAbilities(b, m, player(), chanceRng(false));
    const rt = ensureRuntime(m);
    expect(rt.atkBuffTurns ?? 0).toBe(0);
  });
});

describe('K: extraHits (Furious Fangs / Laser Focus)', () => {
  it('Kalius resolves with Furious Fangs (extraHits, 1%, 2-5 bites, +5)', () => {
    const eh = resolveBehavior({ name: 'Kalius King Cobra' }).abilities.find((a) => a.id === 'extraHits');
    expect(eh).toMatchObject({ label: 'Furious Fangs', chance: 0.01, minHits: 2, maxHits: 5, perHitBonus: 5 });
  });

  it('Colossal Cyclops resolves with Laser Focus (extraHits, 3%, exactly 1 hit, +0)', () => {
    const eh = resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.id === 'extraHits');
    expect(eh).toMatchObject({ label: 'Laser Focus', chance: 0.03, minHits: 1, maxHits: 1, perHitBonus: 0 });
  });

  it('deals (count) extra computeMonsterDamage hits, each + perHitBonus', () => {
    // scaledAtk=0 + monsterHitBonus makes the base hit deterministic; with totalDef=0
    // and int()=0 the base per-hit damage is a fixed minimum, so the only variable is
    // count × perHitBonus. intVal=0 → count = minHits = 2 (rng.int(range)+min).
    const b = resolveBehavior({ name: 'Kalius King Cobra' });
    const p = player({ hp: 200 });
    const logs = applyExtraHits(b, monster('Kalius King Cobra'), p, /*totalDef*/ 0, /*scaledAtk*/ 1, chanceRng(true, 0));
    const dealt = 200 - p.hp;
    // 2 bites, each ≥ (1 base + 5 bonus); assert the volley landed multiple hits.
    expect(dealt).toBeGreaterThanOrEqual(2 * (1 + 5));
    expect(logs.join(' ')).toMatch(/Furious Fangs lands 2 extra hits/);
  });

  it('rolls the count uniformly in [minHits..maxHits]', () => {
    const b = resolveBehavior({ name: 'Kalius King Cobra' });
    // intVal=3 → count = min(2) + 3 = 5 (the max).
    const logs = applyExtraHits(b, monster('Kalius King Cobra'), player(), 0, 1, chanceRng(true, 3));
    expect(logs.join(' ')).toMatch(/lands 5 extra hits/);
  });

  it('Laser Focus deals exactly one extra full hit (no per-hit bonus)', () => {
    const b = resolveBehavior({ name: 'Colossal Cyclops' });
    const logs = applyExtraHits(b, monster('Colossal Cyclops'), player(), 0, 1, chanceRng(true, 0));
    expect(logs.join(' ')).toMatch(/Laser Focus lands 1 extra hit\b/);
  });

  it('no proc deals no extra hits and draws nothing (parity)', () => {
    const b = resolveBehavior({ name: 'Kalius King Cobra' });
    const p = player({ hp: 200 });
    const logs = applyExtraHits(b, monster('Kalius King Cobra'), p, 0, 1, chanceRng(false));
    expect(p.hp).toBe(200);
    expect(logs).toHaveLength(0);
  });
});

describe('K: no sibling leak', () => {
  it('base Cyclops does not inherit Colossal Cyclops Laser Focus', () => {
    const cyc = resolveBehavior({ name: 'Cyclops' }).abilities;
    expect(cyc.find((a) => a.id === 'extraHits')).toBeUndefined();
    expect(cyc.find((a) => a.label === 'Laser Focus')).toBeUndefined();
  });

  it('base King Cobra does not inherit Kalius selfBuff/extraHits', () => {
    const kc = resolveBehavior({ name: 'King Cobra' }).abilities;
    expect(kc.find((a) => a.id === 'selfBuff')).toBeUndefined();
    expect(kc.find((a) => a.id === 'extraHits')).toBeUndefined();
  });

  it('Colossal Cyclops does not gain base Cyclops Munch/Intimidating Stare', () => {
    const cc = resolveBehavior({ name: 'Colossal Cyclops' }).abilities;
    expect(cc.find((a) => a.label === 'Munch')).toBeUndefined();
    expect(cc.find((a) => a.label === 'Intimidating Stare')).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { applyOnHitAbilities } from '../monster';
import { resolveBehavior } from './archetypes';

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: name[0] ?? '?',
    name,
    hp: 100,
    maxHp: 100,
    atk: 1,
    color: '#fff',
    minFloor: 1,
    frozenTurns: 0,
    ...over,
  };
}

function player(over: Partial<Player> = {}): Player {
  return { x: 2, y: 2, hp: 100, maxHp: 100, gold: 100, activeEffects: [], ...over } as unknown as Player;
}

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

describe('one-off monster abilities (summon / teleportPlayer)', () => {
  it('assigns the sheet one-offs as per-monster data', () => {
    const ostrich = resolveBehavior({ name: 'Rabid Ostrich' }).abilities.find((a) => a.label === 'Reverse Kick');
    expect(ostrich).toMatchObject({ id: 'teleportPlayer', chance: 0.03, teleportTarget: 'previousFloor' });

    const unicorn = resolveBehavior({ name: 'Unicorn' }).abilities.find((a) => a.label === 'Rainbow Lash');
    expect(unicorn).toMatchObject({ id: 'summon', chance: 0.03, summonFloor: 6 });

    const chase = resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.label === 'Chase');
    expect(chase).toMatchObject({ id: 'teleportPlayer', chance: 0.01, teleportTarget: 'stairsDown', goldDropPct: 0.15 });
    expect(resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.label === 'Laser Focus')).toBeDefined();
  });

  it('fires summon through the world mutation callback', () => {
    const b = resolveBehavior({ name: 'Unicorn' });
    const calls: string[] = [];

    const logs = applyOnHitAbilities(b, monster('Unicorn'), player(), chanceRng(true), 12, undefined, {
      summonMonster: (_source, ability) => {
        calls.push(`${ability.label}:${ability.summonFloor}`);
        return true;
      },
    });

    expect(calls).toEqual(['Rainbow Lash:6']);
    expect(logs.join(' ')).toContain("Unicorn's Rainbow Lash calls another monster");
  });

  it('fires teleportPlayer through the world mutation callback and keeps callback detail logs', () => {
    const b = resolveBehavior({ name: 'Colossal Cyclops' });
    const calls: string[] = [];

    const logs = applyOnHitAbilities(b, monster('Colossal Cyclops'), player(), chanceRng(true), 17, undefined, {
      teleportPlayer: (_source, ability) => {
        calls.push(`${ability.label}:${ability.teleportTarget}:${ability.goldDropPct}`);
        return { moved: true, logs: ['You drop 15 gold!'] };
      },
    });

    expect(calls).toEqual(['Chase:stairsDown:0.15']);
    expect(logs.join(' ')).toContain("Colossal Cyclops's Chase sends you reeling");
    expect(logs.join(' ')).toContain('You drop 15 gold!');
  });
});

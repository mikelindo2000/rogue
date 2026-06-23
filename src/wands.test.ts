import { describe, it, expect } from 'vitest';
import { wandCooldown, wandHungerCost, isSelfTargetWand, isBeamWand, spawnWand, pickWandForFloor } from './wands';
import { WAND_POOL, BALANCE } from './config';
import { defaultBehavior, effectiveBehavior, resolveBehavior } from './ai/archetypes';
import type { RNG } from './rng';
import type { WandItem } from './types';

const wand = (over: Partial<WandItem>): WandItem => ({
  name: 'Test Wand', wandType: 'striking', tier: 'wand', rarity: 'common', ...over,
});

const fakeRng = (nextVal: number): RNG => ({
  seed: 1,
  next: () => nextVal,
  int: (m: number) => Math.floor(nextVal * m),
  range: (a: number) => a,
  chance: (p: number) => nextVal < p,
  pick: <T>(arr: T[]) => arr[0],
  getState: () => 0,
});

describe('wand cooldown / hunger gating', () => {
  it('uses the per-type cooldown for a wand-tier item', () => {
    expect(wandCooldown(wand({ wandType: 'striking', tier: 'wand' }))).toBe(BALANCE.wands.cooldown.striking);
  });

  it('shaves the staff reduction off a staff-tier item (min 1)', () => {
    const w = wand({ wandType: 'lightning', tier: 'staff' });
    expect(wandCooldown(w)).toBe(BALANCE.wands.cooldown.lightning - BALANCE.wands.staffCooldownReduction);
  });

  it('falls back to the default cooldown/hunger for an unknown type', () => {
    const w = wand({ wandType: 'striking' });
    expect(wandHungerCost(w)).toBe(BALANCE.wands.hungerCost.striking);
  });
});

describe('wand target-mode classification', () => {
  it('flags self-targeted wands', () => {
    expect(isSelfTargetWand('light')).toBe(true);
    expect(isSelfTargetWand('invisibility')).toBe(true);
    expect(isSelfTargetWand('nothing')).toBe(true);
    expect(isSelfTargetWand('striking')).toBe(false);
    expect(isSelfTargetWand('cold')).toBe(false);
  });

  it('flags lightning as the only beam', () => {
    expect(isBeamWand('lightning')).toBe(true);
    expect(isBeamWand('fire')).toBe(false);
    expect(isBeamWand('striking')).toBe(false);
  });
});

describe('spawnWand', () => {
  it('returns a ready, identified copy of a catalog template', () => {
    const template = WAND_POOL.find(w => w.wandType === 'polymorph')!;
    const fresh = spawnWand(template);
    expect(fresh).not.toBe(template);
    expect(fresh.wandType).toBe('polymorph');
    expect(fresh.cooldownRemaining).toBe(0);
    expect(fresh.identified).toBe(true);
  });
});

describe('pickWandForFloor rarity gating', () => {
  it('only yields common wands on a shallow floor (high rarity roll)', () => {
    // rng.next() high => rollLootRarity returns 'common'.
    const picked = pickWandForFloor(1, fakeRng(0.99));
    expect(picked.rarity).toBe('common');
    expect(picked.cooldownRemaining).toBe(0);
    expect(picked.identified).toBe(true);
  });

  it('can yield rare wands on a deep floor (low rarity roll)', () => {
    // rng.next() 0 + deep floor => 'legendary' cap, so the whole pool is eligible.
    const picked = pickWandForFloor(20, fakeRng(0));
    expect(WAND_POOL.some(w => w.wandType === picked.wandType)).toBe(true);
  });
});

describe('effectiveBehavior (Wand of Cancellation core)', () => {
  it('returns the resolved archetype when not cancelled', () => {
    expect(effectiveBehavior({ name: 'Orc' })).toBe(resolveBehavior({ name: 'Orc' }));
  });

  it('collapses to the plain default behavior while cancelled', () => {
    expect(effectiveBehavior({ name: 'Flying Serpent', canceledTurns: 2 })).toBe(defaultBehavior());
    expect(defaultBehavior().id).toBe('default');
  });
});

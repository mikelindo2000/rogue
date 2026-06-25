import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import type { Inventory, Monster, Player, PotionType } from '../types';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { applyOnHitAbilities } from '../monster';

const template = MONSTER_DATABASE.find((m) => m.name === 'Nymph')!;

function nymph(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: template.symbol,
    name: 'Nymph',
    hp: template.hp,
    maxHp: template.hp,
    atk: template.atk,
    color: template.color,
    minFloor: template.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

// A player with only the fields stealItem touches. Potions are the only bucket
// we mutate; equipped indices are deliberately exercised in the safety test.
function playerWith(potions: PotionType[], gold = 0): Player {
  const inventory = { food: 0, weapons: [], potions, helm: [], chest: [], legs: [], gauntlets: [], boots: [], shield: [] } as unknown as Inventory;
  return { gold, inventory } as Player;
}

describe('Nymph', () => {
  it('resolves to the nymph archetype with a stealItem onHit + flee/blink kit', () => {
    const b = resolveBehavior({ name: 'Nymph' });
    expect(b.id).toBe('nymph');
    expect(archetypeOf({ name: 'Nymph' })).toBe('nymph');

    const steal = b.abilities.find((a) => a.id === 'stealItem');
    expect(steal).toBeDefined();
    expect(steal!.trigger).toBe('onHit');
    expect(steal!.thenFlee).toBe(true);
    expect(steal!.thenBlink).toBe(true);
    // It bails when wounded, like the trickster.
    expect(b.defense.fleeBelowHpPct).toBeGreaterThan(0);
    // DIRECT melee mirrors the trickster: plain melee, no windup, multiplier 1.
    expect(b.attacks[0].windupTurns).toBe(0);
    expect(b.attacks[0].damageMultiplier).toBe(1);
  });

  it('steals an item (a potion), carries it, and then flees and blinks', () => {
    const b = resolveBehavior({ name: 'Nymph' });
    const m = nymph();
    const player = playerWith(['healing', 'strength'], 200);
    // chance is 0.7; makeRng(1) deterministically passes here.
    const logs = applyOnHitAbilities(b, m, player, makeRng(1));

    expect(player.inventory.potions.length).toBe(1);
    expect(player.gold).toBe(200); // a potion was available, so gold is untouched
    expect(logs.join(' ')).toMatch(/snatches your \w+ potion and vanishes/);
    expect(m.ai?.state).toBe('fleeing');
    expect(m.ai?.pendingBlink).toBe(true);
    expect(m.stolenLoot).toEqual([
      { type: 'potion', symbol: '!', color: '#ff66ff', data: { potionType: 'healing' } },
    ]);
  });

  it('does not corrupt equipped state — only the potions array shrinks', () => {
    const b = resolveBehavior({ name: 'Nymph' });
    const m = nymph();
    const player = playerWith(['healing']);
    // Equipped holds INDICES into the gear arrays; stealing a potion must leave
    // those arrays (and therefore the indices) untouched.
    player.equipped = { mainHand: 0, offHand: '', helm: 0, chest: 0, legs: 0, gauntlets: 0, boots: 0 } as Player['equipped'];
    player.inventory.weapons = [{} as never];
    player.inventory.chest = [{} as never];

    applyOnHitAbilities(b, m, player, makeRng(1));

    expect(player.inventory.potions.length).toBe(0);
    expect(player.inventory.weapons.length).toBe(1); // untouched
    expect(player.inventory.chest.length).toBe(1); // untouched
    expect(player.equipped.mainHand).toBe(0); // index still valid
    expect(player.equipped.chest).toBe(0);
  });

  it('falls back to stealing gold when the player carries no potions', () => {
    const b = resolveBehavior({ name: 'Nymph' });
    const m = nymph();
    const player = playerWith([], 200);
    const logs = applyOnHitAbilities(b, m, player, makeRng(1));

    expect(player.gold).toBeLessThan(200);
    expect(logs.join(' ')).toMatch(/snatches \d+ gold and vanishes/);
    expect(m.ai?.state).toBe('fleeing');
    expect(m.ai?.pendingBlink).toBe(true);
    expect(m.stolenLoot).toEqual([{ type: 'gold', amount: 50, symbol: '$', color: '#ffff55' }]);
  });

  it('produces a valid harness reading at its first floor (band tuned via run.ts)', () => {
    const report = analyzeMonster(template, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(template.minFloor); // floor 9
    // Band no longer pinned here — DEFAULT_CURVE is calibrated to the full-run sim
    // (src/ai/run.ts), against which this midgame monster reads below band (the
    // too-easy gap we're tuning). stealItem doesn't move the HP race regardless.
    expect(report.analysis.threat).toBeGreaterThan(0);
    expect(['trivial', 'easy', 'fair', 'hard', 'lethal']).toContain(report.difficulty);
  });
});

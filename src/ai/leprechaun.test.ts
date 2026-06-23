import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { applyOnHitAbilities } from '../monster';

const template = MONSTER_DATABASE.find((m) => m.name === 'Leprechaun')!;

function leprechaun(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: template.symbol,
    name: 'Leprechaun',
    hp: template.hp,
    maxHp: template.hp,
    atk: template.atk,
    color: template.color,
    minFloor: template.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

describe('Leprechaun', () => {
  it('resolves to the trickster archetype with a steal-gold-then-flee kit', () => {
    const b = resolveBehavior({ name: 'Leprechaun' });
    expect(b.id).toBe('trickster');
    expect(archetypeOf({ name: 'Leprechaun' })).toBe('trickster');

    const steal = b.abilities.find((a) => a.id === 'stealGold');
    expect(steal).toBeDefined();
    expect(steal!.trigger).toBe('onHit');
    expect(steal!.thenFlee).toBe(true);
    expect(steal!.magnitude).toBeGreaterThan(0);
    // It bails when wounded.
    expect(b.defense.fleeBelowHpPct).toBeGreaterThan(0);
  });

  it('steals gold on hit and then flees', () => {
    const b = resolveBehavior({ name: 'Leprechaun' });
    const m = leprechaun();
    const player = { gold: 200 } as Player;
    // chance is 0.7; makeRng(1) deterministically passes here.
    const logs = applyOnHitAbilities(b, m, player, makeRng(1));
    expect(player.gold).toBeLessThan(200);
    expect(logs.join(' ')).toMatch(/steals \d+ gold/);
    expect(m.ai?.state).toBe('fleeing');
  });

  it('is balanced in the fair band at its first floor (harness)', () => {
    const report = analyzeMonster(template, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(template.minFloor);
    expect(report.difficulty).toBe('fair');
    // Fleeing lowers real uptime, so the harness (which never models the monster
    // leaving) slightly overstates threat — leaning to the high side of fair is fine.
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
  });
});

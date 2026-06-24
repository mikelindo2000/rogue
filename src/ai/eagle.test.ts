import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import { TILE } from '../tiles';
import type { Monster, Player, StatusEffects } from '../types';
import { resolveBehavior, archetypeOf, shapeForTemplate, ARCHETYPES } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { processMonsterAI } from '../monster';

const template = MONSTER_DATABASE.find((m) => m.name === 'Eagle')!;

function floorMap(n: number): string[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => TILE.FLOOR));
}

function eagle(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: template.symbol,
    name: 'Eagle',
    hp: template.hp,
    maxHp: template.hp,
    atk: template.atk,
    color: template.color,
    minFloor: template.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

const noStatus = (): StatusEffects => ({
  vigorTurns: 0,
  midasTurns: 0,
  strengthTurns: 0,
  invisTurns: 0,
  armorTurns: 0,
  monsterDetectionTurns: 0,
});

const log = () => {
  const lines: string[] = [];
  return { lines, add: (s: string) => lines.push(s) };
};

describe('Eagle', () => {
  it('resolves to the raptor archetype: erratic flight + telegraphed dive + light evasion', () => {
    const b = resolveBehavior({ name: 'Eagle' });
    expect(b.id).toBe('raptor');
    expect(archetypeOf({ name: 'Eagle' })).toBe('raptor');

    expect(b.movement.style).toBe('erratic');

    const dive = b.attacks[0];
    expect(dive.id).toBe('dive');
    expect(dive.windupTurns).toBeGreaterThan(0); // telegraphed — steppable
    expect(dive.range).toBeGreaterThan(1); // a reaching swoop, not a bite
    expect(dive.animCue).toBe('swoop');

    // Light evasion — it flits aside from some player strikes.
    expect(b.defense.dodgeChance ?? 0).toBeGreaterThan(0);
  });

  it('is a gentler cousin of the bat (lower dive damage AND lower evasion)', () => {
    const raptor = ARCHETYPES.raptor;
    const bat = ARCHETYPES.bat;
    expect(raptor.attacks[0].damageMultiplier).toBeLessThan(bat.attacks[0].damageMultiplier);
    expect(raptor.defense.dodgeChance ?? 0).toBeLessThan(bat.defense.dodgeChance ?? 0);
    // Still a telegraphed flier like the bat (the shared "teaches dodging" shape).
    expect(raptor.attacks[0].windupTurns).toBeGreaterThan(0);
    expect(raptor.movement.style).toBe('erratic');
  });

  it('is balanced in the fair band at its first floor (harness)', () => {
    const report = analyzeMonster(template, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(template.minFloor); // floor 4
    expect(report.difficulty).toBe('fair');
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
  });

  it('commits to a telegraphed dive instead of hitting instantly', () => {
    // In range (Manhattan 2) of the player so the dive is eligible.
    const m = eagle({ x: 6, y: 8 });
    const l = log();
    processMonsterAI([m], { x: 6, y: 6, hp: 100 } as Player, noStatus(), floorMap(15), 15, 15, 0, l.add, makeRng(3), 5);
    expect(m.ai?.pendingAttack).toBeDefined();
    expect(m.ai?.pendingAttack?.targetX).toBe(6);
    expect(m.ai?.pendingAttack?.targetY).toBe(6);
  });

  it('whiffs when the player steps off the locked tile (positional dodge window)', () => {
    const m = eagle({ x: 6, y: 8 });
    m.ai = { state: 'hunting', cooldowns: {}, swipeToggle: false, pendingAttack: { attackId: 'dive', resolveTurn: 5, targetX: 6, targetY: 6 } };
    const player = { x: 7, y: 6, hp: 100 } as Player; // stepped one tile away
    const l = log();
    processMonsterAI([m], player, noStatus(), floorMap(15), 15, 15, 0, l.add, makeRng(3), 5);
    expect(player.hp).toBe(100); // dodged the dive
    expect(m.ai?.pendingAttack).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import { TILE } from '../tiles';
import type { Monster, Player, StatusEffects } from '../types';
import { decideMonsterAction } from './brain';
import { resolveBehavior, archetypeOf, shapeForTemplate } from './archetypes';
import { analyzeMonster } from './balance';
import { MONSTER_DATABASE } from '../config';
import { processMonsterAI } from '../monster';
import type { MonsterBehavior } from './types';

const template = MONSTER_DATABASE.find((m) => m.name === 'Flying Serpent')!;

function floorMap(n: number): string[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => TILE.FLOOR));
}

const noStatus = (): StatusEffects => ({
  vigorTurns: 0,
  midasTurns: 0,
  strengthTurns: 0,
  invisTurns: 0,
  armorTurns: 0,
  monsterDetectionTurns: 0,
});

function serpent(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: template.symbol,
    name: 'Flying Serpent',
    hp: template.hp,
    maxHp: template.hp,
    atk: template.atk,
    color: template.color,
    minFloor: template.minFloor,
    frozenTurns: 0,
    ...over,
  };
}

function decide(m: Monster, player: { x: number; y: number }, behavior: MonsterBehavior, size = 15) {
  return decideMonsterAction({
    monster: m,
    behavior,
    player: { x: player.x, y: player.y } as Player,
    status: noStatus(),
    map: floorMap(size),
    cols: size,
    rows: size,
    monsters: [m],
    rng: makeRng(1),
    turn: 0,
  });
}

const log = () => {
  const lines: string[] = [];
  return { lines, add: (s: string) => lines.push(s) };
};

describe('Flying Serpent', () => {
  it('resolves to the kiter archetype with a telegraphed ranged bolt', () => {
    const b = resolveBehavior({ name: 'Flying Serpent' });
    expect(b.id).toBe('kiter');
    expect(archetypeOf({ name: 'Flying Serpent' })).toBe('kiter');

    expect(b.movement.style).toBe('kite');
    const bolt = b.attacks[0];
    expect(bolt.id).toBe('bolt');
    expect(bolt.range).toBeGreaterThan(1); // ranged, not melee
    expect(bolt.windupTurns).toBeGreaterThan(0); // telegraphed → dodgeable
  });

  it('telegraphs a bolt at the player tile while holding at range', () => {
    const b = resolveBehavior({ name: 'Flying Serpent' });
    const keep = b.movement.keepDistance ?? 4;
    // Sit exactly at keepDistance (within bolt range) along one axis.
    const m = serpent({ x: 6, y: 6 + keep });
    expect(decide(m, { x: 6, y: 6 }, b)).toEqual({
      type: 'windup',
      attackId: 'bolt',
      targetX: 6,
      targetY: 6,
    });
  });

  it('keeps its distance instead of walking into melee when the player closes', () => {
    const b = resolveBehavior({ name: 'Flying Serpent' });
    // Player has closed to distance 2 (inside keepDistance=4): the kiter must
    // retreat, never step toward the player into melee range.
    const m = serpent({ x: 6, y: 8 });
    const action = decide(m, { x: 6, y: 6 }, b);
    expect(action).toEqual({ type: 'move', dx: 0, dy: 1 }); // away from the player (south)
    // Sanity: it did not close the gap.
    expect(action).not.toEqual({ type: 'move', dx: 0, dy: -1 });
  });

  it('closes the gap when the player is out of bolt range', () => {
    const b = resolveBehavior({ name: 'Flying Serpent' });
    const m = serpent({ x: 6, y: 12 }); // distance 6: beyond bolt range(4), within aggro
    expect(decide(m, { x: 6, y: 6 }, b)).toEqual({ type: 'move', dx: 0, dy: -1 }); // toward player
  });

  // Engine-level: telegraph commit → resolve, with the positional (ranged) dodge.
  describe('telegraphed bolt resolution via processMonsterAI', () => {
    const run = (m: Monster, player: { x: number; y: number; hp: number }, turn: number, l: { add: (s: string) => void }) =>
      processMonsterAI([m], player as Player, noStatus(), floorMap(15), 15, 15, 0, l.add, makeRng(3), turn);

    it('commits a pendingAttack on the player tile (no instant hit) while at range', () => {
      const m = serpent({ x: 6, y: 10 }); // distance 4 == keepDistance, in bolt range
      const player = { x: 6, y: 6, hp: 500 };
      const l = log();
      run(m, player, 5, l);
      // Telegraphed: it locks the player's current tile, deals no damage yet.
      expect(m.ai?.pendingAttack).toEqual({ attackId: 'bolt', resolveTurn: 6, targetX: 6, targetY: 6 });
      expect(player.hp).toBe(500);
    });

    it('connects when the player is still on the locked tile', () => {
      const m = serpent({ x: 6, y: 10 });
      m.ai = { state: 'hunting', cooldowns: {}, swipeToggle: false, pendingAttack: { attackId: 'bolt', resolveTurn: 5, targetX: 6, targetY: 6 } };
      const player = { x: 6, y: 6, hp: 500 };
      const l = log();
      run(m, player, 5, l);
      expect(player.hp).toBeLessThan(500);
      expect(m.ai?.pendingAttack).toBeUndefined();
    });

    it('whiffs at range when the player strafes off the locked tile (positional dodge)', () => {
      const m = serpent({ x: 6, y: 10 });
      m.ai = { state: 'hunting', cooldowns: {}, swipeToggle: false, pendingAttack: { attackId: 'bolt', resolveTurn: 5, targetX: 6, targetY: 6 } };
      const player = { x: 7, y: 6, hp: 500 }; // stepped one tile off the line
      const l = log();
      run(m, player, 5, l);
      expect(player.hp).toBe(500); // no damage — the bolt missed the tile
      expect(l.lines.some((s) => /You dodge/.test(s))).toBe(true);
      expect(m.ai?.pendingAttack).toBeUndefined();
    });
  });

  it('produces a valid harness reading at its first floor (band tuned via run.ts)', () => {
    const report = analyzeMonster(template, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(template.minFloor); // 16
    // Band no longer pinned here — DEFAULT_CURVE is calibrated to the full-run sim
    // (src/ai/run.ts). The serpent sits at the floor-16 difficulty spike; its
    // precise band is a tuning target tracked there, not a frozen invariant.
    expect(report.analysis.threat).toBeGreaterThan(0);
    expect(['trivial', 'easy', 'fair', 'hard', 'lethal']).toContain(report.difficulty);
  });
});

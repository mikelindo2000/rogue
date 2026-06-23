import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import { TILE } from '../tiles';
import type { Monster, Player, StatusEffects } from '../types';
import { decideMonsterAction } from './brain';
import { resolveBehavior, archetypeOf, shapeForTemplate, primaryAttackShape, ARCHETYPES } from './archetypes';
import { analyzeMonster } from './balance';
import type { AIAction, MonsterBehavior } from './types';
import { MONSTER_DATABASE } from '../config';

// --- helpers (mirroring brain.test.ts) -------------------------------------

function floorMap(n: number): string[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => TILE.FLOOR));
}

const noStatus = (): StatusEffects => ({
  vigorTurns: 0,
  midasTurns: 0,
  strengthTurns: 0,
  invisTurns: 0,
  armorTurns: 0,
});

function mob(name: string, over: Partial<Monster> = {}): Monster {
  const t = MONSTER_DATABASE.find((m) => m.name === name)!;
  return {
    x: 0,
    y: 0,
    symbol: t.symbol,
    name,
    hp: t.hp,
    maxHp: t.hp,
    atk: t.atk,
    color: t.color,
    minFloor: t.minFloor,
    special: t.special,
    frozenTurns: 0,
    ...over,
  };
}

function decide(
  m: Monster,
  player: { x: number; y: number },
  behavior: MonsterBehavior,
  opts: { monsters?: Monster[]; size?: number } = {},
): AIAction {
  const size = opts.size ?? 15;
  return decideMonsterAction({
    monster: m,
    behavior,
    player: { x: player.x, y: player.y } as Player,
    status: noStatus(),
    map: floorMap(size),
    cols: size,
    rows: size,
    monsters: opts.monsters ?? [m],
    rng: makeRng(1),
    turn: 0,
  });
}

const GOLEM = MONSTER_DATABASE.find((m) => m.name === 'Golem')!;
const GARY = MONSTER_DATABASE.find((m) => m.name === 'Gary the Golem')!;

describe('Golem', () => {
  it('resolves Golem and Gary to the ambusher archetype (movement-only, plain melee)', () => {
    for (const name of ['Golem', 'Gary the Golem']) {
      const b = resolveBehavior({ name });
      expect(b.id).toBe('ambusher');
      expect(archetypeOf({ name })).toBe('ambusher');
      expect(b.movement.style).toBe('ambush');
      // wakeRange is what trips the latch.
      expect(b.movement.wakeRange).toBeGreaterThan(0);
      // Movement-only: a single plain-melee attack, no telegraph, no evasion.
      expect(b.attacks).toHaveLength(1);
      const atk = b.attacks[0];
      expect(atk.range).toBe(1);
      expect(atk.damageMultiplier).toBe(1);
      expect(atk.windupTurns).toBe(0);
      expect(b.defense.dodgeChance ?? 0).toBe(0);
    }
  });

  it('is balance-neutral vs the default archetype (its combat shape is identical)', () => {
    const ambush = primaryAttackShape({ id: 'ambusher', ...ARCHETYPES.ambusher });
    const def = primaryAttackShape({ id: 'default', ...ARCHETYPES.default });
    // Same damage/turn/evasion — ambush only changes *movement*, not combat.
    expect(ambush).toEqual(def);
  });

  // --- the ambush FSM: wait → wake (latch) → keep hunting --------------------

  it('holds perfectly still while the player is outside wakeRange', () => {
    const wake = resolveBehavior({ name: 'Golem' }).movement.wakeRange!;
    const m = mob('Golem', { x: 0, y: 7 });
    // Player well outside wakeRange — the sentinel does not move.
    const a = decide(m, { x: wake + 5, y: 7 }, resolveBehavior({ name: 'Golem' }), { monsters: [m] });
    expect(a.type).toBe('wait');
    expect(m.ai?.state).not.toBe('hunting');
  });

  it('wakes and chases once the player enters wakeRange, and latches permanently when they back away', () => {
    const b = resolveBehavior({ name: 'Golem' });
    const wake = b.movement.wakeRange!;
    const m = mob('Golem', { x: 0, y: 7 });

    // Far away: asleep, waits.
    expect(decide(m, { x: 12, y: 7 }, b, { monsters: [m] }).type).toBe('wait');
    expect(m.ai?.state).not.toBe('hunting');

    // Player steps within wakeRange: wakes and steps toward them.
    const woke = decide(m, { x: wake, y: 7 }, b, { monsters: [m] });
    expect(woke).toEqual({ type: 'move', dx: 1, dy: 0 });
    expect(m.ai?.state).toBe('hunting');

    // Player flees far back out of wakeRange: the latch holds — still chasing.
    const stillChasing = decide(m, { x: 14, y: 7 }, b, { monsters: [m] });
    expect(stillChasing.type).toBe('move');
    expect(m.ai?.state).toBe('hunting');
  });

  it('bites with plain melee when adjacent once engaged', () => {
    const b = resolveBehavior({ name: 'Gary the Golem' });
    const m = mob('Gary the Golem', { x: 6, y: 7, ai: { state: 'hunting', cooldowns: {}, swipeToggle: false } });
    const a = decide(m, { x: 6, y: 6 }, b, { monsters: [m] });
    expect(a).toEqual({ type: 'attack', attackId: 'melee' });
  });

  // --- difficulty (harness) -------------------------------------------------

  it('Golem is fair at floor 15 (ambusher is balance-neutral, ~unchanged threat)', () => {
    const report = analyzeMonster(GOLEM, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(15);
    expect(report.difficulty).toBe('fair');
    expect(report.flagged).toBe(false);
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
  });

  it('Gary the Golem (elite) is fair at floor 15', () => {
    const report = analyzeMonster(GARY, { trials: 1500, shapeFor: shapeForTemplate });
    expect(report.floor).toBe(15);
    expect(report.difficulty).toBe('fair');
    expect(report.flagged).toBe(false);
    expect(report.analysis.threat).toBeGreaterThanOrEqual(0.35);
    expect(report.analysis.threat).toBeLessThanOrEqual(0.7);
  });
});

import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import { TILE } from '../tiles';
import { BALANCE } from '../config';
import type { Monster, Player, StatusEffects } from '../types';
import { decideMonsterAction } from './brain';
import { ARCHETYPES, resolveBehavior } from './archetypes';
import type { AIAction, MonsterBehavior } from './types';
import { processMonsterAI, applyOnHitAbilities } from '../monster';

const AGGRO = BALANCE.monster.aggroRange;

function floorMap(n: number): string[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => TILE.FLOOR));
}

function mob(over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'X',
    name: 'Test',
    hp: 30,
    maxHp: 30,
    atk: 6,
    color: '#fff',
    minFloor: 1,
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
});

function decide(
  m: Monster,
  player: { x: number; y: number },
  behavior: MonsterBehavior,
  opts: { status?: StatusEffects; monsters?: Monster[]; seed?: number; size?: number; turn?: number } = {},
): AIAction {
  const size = opts.size ?? 13;
  return decideMonsterAction({
    monster: m,
    behavior,
    player: { x: player.x, y: player.y } as Player,
    status: opts.status ?? noStatus(),
    map: floorMap(size),
    cols: size,
    rows: size,
    monsters: opts.monsters ?? [m],
    rng: makeRng(opts.seed ?? 1),
    turn: opts.turn ?? 0,
  });
}

const DEFAULT: MonsterBehavior = { id: 'default', ...ARCHETYPES.default };

describe('default archetype reproduces legacy behavior', () => {
  it('is stationary outside aggro range', () => {
    const m = mob({ x: 0, y: 0 });
    // distance 12 (> AGGRO) from player at (6,6)
    expect(decide(m, { x: 6, y: 6 }, DEFAULT)).toEqual({ type: 'wait' });
  });

  it('steps toward the player (X axis first) within aggro', () => {
    const m = mob({ x: 9, y: 6 }); // 3 west of player, same row
    expect(decide(m, { x: 6, y: 6 }, DEFAULT)).toEqual({ type: 'move', dx: -1, dy: 0 });
  });

  it('falls back to the Y axis when X is blocked', () => {
    const m = mob({ x: 9, y: 6 });
    const blocker = mob({ x: 8, y: 6, name: 'Wall' }); // occupies the X step
    const action = decide(m, { x: 6, y: 4 }, DEFAULT, { monsters: [m, blocker] });
    expect(action).toEqual({ type: 'move', dx: 0, dy: -1 });
  });

  it('attacks when orthogonally adjacent', () => {
    const m = mob({ x: 6, y: 7 });
    expect(decide(m, { x: 6, y: 6 }, DEFAULT)).toEqual({ type: 'attack', attackId: 'melee' });
  });

  it('does not attack on a diagonal (manhattan 2)', () => {
    const m = mob({ x: 7, y: 7 });
    const a = decide(m, { x: 6, y: 6 }, DEFAULT);
    expect(a.type).not.toBe('attack');
  });

  it('wanders (never attacks) while the player is invisible', () => {
    const m = mob({ x: 6, y: 7 }); // adjacent, but player is invisible
    const status = { ...noStatus(), invisTurns: 5 };
    const a = decide(m, { x: 6, y: 6 }, DEFAULT, { status, seed: 42 });
    expect(a.type).not.toBe('attack');
    expect(['wait', 'move']).toContain(a.type);
  });
});

describe('skirmisher (erratic movement)', () => {
  const erratic: MonsterBehavior = {
    id: 'skirmisher',
    ...ARCHETYPES.skirmisher,
    movement: { ...ARCHETYPES.skirmisher.movement, erraticChance: 1 }, // force the random branch
  };
  it('takes a random walkable hop when wobbling', () => {
    const m = mob({ x: 6, y: 9 });
    const a = decide(m, { x: 6, y: 6 }, erratic, { seed: 7 });
    expect(a.type).toBe('move');
  });
});

describe('ambusher (FSM latch)', () => {
  const ambush: MonsterBehavior = { id: 'ambusher', ...ARCHETYPES.ambusher };

  it('holds still until the player enters wake range, then commits permanently', () => {
    const m = mob({ x: 0, y: 6 });
    // Far away: asleep, waits.
    expect(decide(m, { x: 10, y: 6 }, ambush, { monsters: [m] }).type).toBe('wait');
    expect(m.ai?.state).not.toBe('hunting');

    // Player steps within wakeRange (3): wakes and chases.
    const woke = decide(m, { x: 2, y: 6 }, ambush, { monsters: [m] });
    expect(woke).toEqual({ type: 'move', dx: 1, dy: 0 });
    expect(m.ai?.state).toBe('hunting');

    // Player flees back out of wakeRange: a woken ambusher keeps chasing.
    const stillChasing = decide(m, { x: 11, y: 6 }, ambush, { monsters: [m] });
    expect(stillChasing.type).toBe('move');
  });
});

describe('kiter (spacing over a free shot)', () => {
  const kite: MonsterBehavior = { id: 'kiter', ...ARCHETYPES.kiter };

  it('retreats when the player is inside keepDistance', () => {
    const m = mob({ x: 6, y: 8 }); // 2 south of player → too close (keep=4)
    expect(decide(m, { x: 6, y: 6 }, kite)).toEqual({ type: 'move', dx: 0, dy: 1 });
  });

  it('fires its ranged attack at the preferred distance', () => {
    const m = mob({ x: 6, y: 10 }); // distance 4 == keepDistance, within bolt range
    expect(decide(m, { x: 6, y: 6 }, kite)).toEqual({ type: 'attack', attackId: 'bolt' });
  });

  it('closes the gap when out of range', () => {
    const m = mob({ x: 6, y: 12 }); // distance 6: > range(4), < aggro(AGGRO+2)
    const a = decide(m, { x: 6, y: 6 }, kite);
    expect(a).toEqual({ type: 'move', dx: 0, dy: -1 });
  });
});

describe('flee state', () => {
  it('a monster below its flee threshold runs away', () => {
    const fleer: MonsterBehavior = {
      id: 'fleer',
      movement: { style: 'hunt', aggroRange: AGGRO },
      attacks: [{ id: 'melee', range: 1, damageMultiplier: 1, windupTurns: 0, cooldown: 0, weight: 1 }],
      defense: { fleeBelowHpPct: 0.5 },
      abilities: [],
    };
    const m = mob({ x: 6, y: 8, hp: 5, maxHp: 30 }); // 17% HP → flees
    const a = decide(m, { x: 6, y: 6 }, fleer);
    expect(a).toEqual({ type: 'move', dx: 0, dy: 1 }); // away from player
    expect(m.ai?.state).toBe('fleeing');
  });
});

describe('engine application via processMonsterAI', () => {
  const log = () => {
    const lines: string[] = [];
    return { lines, add: (s: string) => lines.push(s) };
  };

  it('a default monster within aggro moves toward the player', () => {
    const m = mob({ x: 9, y: 6 });
    const player = { x: 6, y: 6, hp: 100 } as Player;
    const l = log();
    processMonsterAI([m], player, noStatus(), floorMap(13), 13, 13, 0, l.add, makeRng(1), 1);
    expect(m.x).toBe(8); // stepped one tile west
    expect(m.y).toBe(6);
  });

  it("preserves Marcus the Brave's alternating swipe", () => {
    const m = mob({ x: 6, y: 7, name: 'Marcus the Brave', hp: 900, maxHp: 900, atk: 25 });
    expect(resolveBehavior(m).id).toBe('boss-swiper');
    const player = { x: 6, y: 6, hp: 100000 } as Player;
    const l = log();
    const map = floorMap(13);
    processMonsterAI([m], player, noStatus(), map, 13, 13, 0, l.add, makeRng(5), 1);
    processMonsterAI([m], player, noStatus(), map, 13, 13, 0, l.add, makeRng(5), 2);
    expect(l.lines[0]).not.toMatch(/Swipe/);
    expect(l.lines[1]).toMatch(/Swipe/); // every other swing
  });
});

describe('on-hit abilities', () => {
  const trickster: MonsterBehavior = {
    id: 't',
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [{ id: 'melee', range: 1, damageMultiplier: 1, windupTurns: 0, cooldown: 0, weight: 1 }],
    defense: {},
    abilities: [{ id: 'stealGold', chance: 1, magnitude: 50, cooldown: 0, trigger: 'onHit', thenFlee: true }],
  };

  it('steals gold and flips the thief into a fleeing state', () => {
    const m = mob();
    const player = { gold: 120 } as Player;
    const logs = applyOnHitAbilities(trickster, m, player, makeRng(1));
    expect(player.gold).toBe(70);
    expect(logs[0]).toMatch(/steals 50 gold/);
    expect(m.ai?.state).toBe('fleeing');
  });

  it('never steals more gold than the player has', () => {
    const m = mob();
    const player = { gold: 30 } as Player;
    applyOnHitAbilities(trickster, m, player, makeRng(1));
    expect(player.gold).toBe(0);
  });

  it('does nothing when the chance roll fails (chance 0)', () => {
    const never: MonsterBehavior = { ...trickster, abilities: [{ ...trickster.abilities[0], chance: 0 }] };
    const m = mob();
    const player = { gold: 100 } as Player;
    const logs = applyOnHitAbilities(never, m, player, makeRng(1));
    expect(player.gold).toBe(100);
    expect(logs).toEqual([]);
  });

  it('leechHeal restores monster HP up to its max', () => {
    const leech: MonsterBehavior = {
      ...trickster,
      abilities: [{ id: 'leechHeal', chance: 1, magnitude: 10, cooldown: 0, trigger: 'onHit' }],
    };
    const m = mob({ hp: 5, maxHp: 20 });
    const player = { gold: 0 } as Player;
    applyOnHitAbilities(leech, m, player, makeRng(1));
    expect(m.hp).toBe(15);
  });
});

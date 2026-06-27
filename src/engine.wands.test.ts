import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './engine';
import { BALANCE, WAND_POOL } from './config';
import { spawnWand } from './wands';
import { TILE } from './tiles';
import type { Monster, WandItem, WandType } from './types';
import type { RNG } from './rng';
import { createTestPresenter } from './testPresenter';

const makePresenter = createTestPresenter;

// Deterministic RNG with a mutable `next` value and arr[0] picks.
let rngNext = 0.5;
const makeRng = (): RNG => ({
  seed: 1,
  next: () => rngNext,
  int: (m: number) => Math.floor(rngNext * m),
  range: (a: number) => a,
  chance: (p: number) => rngNext < p,
  pick: <T>(arr: T[]) => arr[0],
  getState: () => 0,
});

const blank = (e: GameEngine) => new Array(e.ROWS).fill(0).map(() => new Array(e.COLS).fill(false));

/** A straight east-west corridor on row 2, player at (2,2), floor 5. */
const setup = (floor = 5) => {
  rngNext = 0.5;
  const engine = new GameEngine(makePresenter());
  engine.map = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(TILE.VOID));
  for (let x = 1; x <= 25; x++) engine.map[2][x] = TILE.FLOOR;
  engine.explored = blank(engine);
  engine.visible = blank(engine);
  engine.dark = blank(engine);
  engine.items = [];
  engine.monsters = [];
  engine.traps = [];
  engine.trapEffects = { bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0, confusedTurns: 0 };
  engine.player.x = 2;
  engine.player.y = 2;
  engine.player.hunger = 500;
  engine.player.hp = 100;
  engine.player.maxHp = 100;
  engine.dungeonFloor = floor;
  (engine as any).rng = makeRng();
  return engine;
};

const give = (engine: GameEngine, type: WandType): WandItem => {
  const wand = spawnWand(WAND_POOL.find(w => w.wandType === type)!);
  engine.player.inventory.wands = [wand];
  return wand;
};

const mkMonster = (x: number, y: number, over: Partial<Monster> = {}): Monster => ({
  x, y, symbol: 'O', name: 'Orc', hp: 200, maxHp: 200, atk: 5, color: '#556b2f', minFloor: 1, frozenTurns: 0, ...over,
});

describe('wand damage effects', () => {
  it('striking damages the first monster in line', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'striking');

    const ok = engine.zapWand(0, 1, 0);
    expect(ok).toBe(true);
    expect(orc.hp).toBeLessThan(200);
  });

  it('magic missile is deterministic (no variance, never varies with the RNG)', () => {
    const a = setup();
    const orcA = mkMonster(5, 2);
    a.monsters = [orcA];
    const wA = give(a, 'magic_missile');
    rngNext = 0.05;
    a.zapWand(0, 1, 0);
    const dmgA = 200 - orcA.hp;

    const b = setup();
    const orcB = mkMonster(5, 2);
    b.monsters = [orcB];
    give(b, 'magic_missile');
    rngNext = 0.95; // very different roll
    b.zapWand(0, 1, 0);
    const dmgB = 200 - orcB.hp;

    expect(dmgA).toBe(dmgB);
    expect(wA.cooldownRemaining).toBeGreaterThan(0);
  });

  it('only hits the first monster on the path for a single-target bolt', () => {
    const engine = setup();
    const near = mkMonster(5, 2);
    const far = mkMonster(7, 2);
    engine.monsters = [near, far];
    give(engine, 'striking');

    engine.zapWand(0, 1, 0);
    expect(near.hp).toBeLessThan(200);
    expect(far.hp).toBe(200);
  });

  it('cold damages and freezes the first monster', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'cold');

    engine.zapWand(0, 1, 0);
    expect(orc.hp).toBeLessThan(200);
    // The freeze is applied, then processTurn ticks every timer once this turn
    // (same as melee freeze / potion durations), so it reads one below the set.
    expect(orc.frozenTurns).toBe(BALANCE.wands.coldFreezeTurns - 1);
  });

  it('lightning is a beam: every monster in line takes damage', () => {
    const engine = setup();
    const a = mkMonster(5, 2);
    const b = mkMonster(7, 2);
    const c = mkMonster(9, 2);
    engine.monsters = [a, b, c];
    give(engine, 'lightning');

    engine.zapWand(0, 1, 0);
    expect(a.hp).toBeLessThan(200);
    expect(b.hp).toBeLessThan(200);
    expect(c.hp).toBeLessThan(200);
  });

  it('drain life damages the monster and nets the player health, never self-killing', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    engine.player.hp = 50;
    give(engine, 'drain_life');

    engine.zapWand(0, 1, 0);
    expect(orc.hp).toBeLessThan(200);
    expect(engine.player.hp).toBeGreaterThan(50); // heal exceeds the self-cost

    // Cannot self-kill: at 1 HP the up-front cost is clamped.
    const e2 = setup();
    const orc2 = mkMonster(5, 2);
    e2.monsters = [orc2];
    e2.player.hp = 1;
    give(e2, 'drain_life');
    e2.zapWand(0, 1, 0);
    expect(e2.player.hp).toBeGreaterThanOrEqual(1);
    expect(e2.gameOver).toBe(false);
  });

  it('awards XP and removes the monster when a zap is lethal', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { hp: 1, maxHp: 1 });
    engine.monsters = [orc];
    engine.player.level = 1;
    give(engine, 'striking');

    engine.zapWand(0, 1, 0);
    expect(engine.monsters).toHaveLength(0);
  });
});

describe('wand control effects', () => {
  it('sleep freezes for the long duration without damage', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'sleep');

    engine.zapWand(0, 1, 0);
    expect(orc.hp).toBe(200);
    expect(orc.frozenTurns).toBe(BALANCE.wands.sleepFreezeTurns - 1);
  });

  it('teleport relocates the monster to a non-adjacent floor tile', () => {
    const engine = setup();
    // Frozen so it cannot wander on the post-zap monster turn — isolates the
    // teleport placement invariant from the monster's own move.
    const orc = mkMonster(5, 2, { frozenTurns: 50 });
    engine.monsters = [orc];
    give(engine, 'teleport_away');

    engine.zapWand(0, 1, 0);
    const moved = orc.x !== 5 || orc.y !== 2;
    expect(moved).toBe(true);
    expect(engine.map[orc.y][orc.x]).toBe(TILE.FLOOR);
    const cheb = Math.max(Math.abs(orc.x - engine.player.x), Math.abs(orc.y - engine.player.y));
    expect(cheb).toBeGreaterThan(1);
  });

  it('polymorph turns the monster into another species and resets its HP', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'polymorph');

    engine.zapWand(0, 1, 0);
    expect(engine.monsters).toHaveLength(1);
    const m = engine.monsters[0];
    expect(m.name).not.toBe('Orc');
    expect(m.hp).toBe(m.maxHp);
    expect(m.frozenTurns).toBe(0);
  });

  it('cancellation marks the monster with canceled turns', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'cancellation');

    engine.zapWand(0, 1, 0);
    // processTurn (run inside the zap) ticks one canceled turn off.
    expect(orc.canceledTurns).toBe(BALANCE.wands.cancellationTurns - 1);
  });
});

describe('self-targeted wands', () => {
  it('light clears darkness in the current room', () => {
    const engine = setup();
    for (let x = 1; x <= 25; x++) engine.dark[2][x] = true;
    give(engine, 'light');

    engine.zapWand(0, 0, 0);
    expect(engine.dark[2][2]).toBe(false);
  });

  it('invisibility grants the invis status', () => {
    const engine = setup();
    give(engine, 'invisibility');
    engine.zapWand(0, 0, 0);
    // Set to the full duration, then ticked once by the zap's processTurn —
    // identical to drinking a Potion of Invisibility.
    expect(engine.statusEffects.invisTurns).toBe(BALANCE.status.invisTurns - 1);
  });

  it('nothing is a logged no-op that still spends a turn and sets cooldown', () => {
    const engine = setup();
    const wand = give(engine, 'nothing');
    const turnBefore = engine.turn;
    const ok = engine.zapWand(0, 0, 0);
    expect(ok).toBe(true);
    expect(engine.turn).toBe(turnBefore + 1);
    // cooldown of 'nothing' is 1, decremented once in the zap turn -> 0.
    expect(wand.cooldownRemaining).toBe(0);
  });
});

describe('cooldown gate', () => {
  it('blocks an immediate re-zap, spends no turn, then recharges to ready', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { hp: 9999, maxHp: 9999 });
    engine.monsters = [orc];
    const wand = give(engine, 'striking');

    expect(engine.zapWand(0, 1, 0)).toBe(true);
    expect(wand.cooldownRemaining).toBeGreaterThan(0);
    const turnAfterZap = engine.turn;

    // Re-zap while recharging: no-op, no turn spent.
    expect(engine.zapWand(0, 1, 0)).toBe(false);
    expect(engine.turn).toBe(turnAfterZap);

    // Tick until ready.
    while ((wand.cooldownRemaining ?? 0) > 0) engine.processTurn();
    expect(engine.zapWand(0, 1, 0)).toBe(true);
  });
});

describe('hunger gate', () => {
  it('subtracts the wand hunger cost on top of the per-turn drain', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'striking');
    engine.player.hunger = 500;

    engine.zapWand(0, 1, 0);
    expect(engine.player.hunger).toBe(500 - BALANCE.wands.hungerCost.striking - 1);
  });

  it('clamps hunger at zero when zapping near starvation', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'striking');
    engine.player.hunger = 3;

    engine.zapWand(0, 1, 0);
    expect(engine.player.hunger).toBe(0);
  });
});

describe('aiming flow', () => {
  it('directional wand: beginZap enters aiming, zapInDirection fires and clears it', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'cold');

    expect(engine.beginZap({ kind: 'wand', index: 0 })).toBe(true);
    expect(engine.aiming).not.toBeNull();

    expect(engine.zapInDirection(1, 0)).toBe(true);
    expect(engine.aiming).toBeNull();
    expect(orc.frozenTurns).toBeGreaterThan(0);
  });

  it('self-targeted wand: beginZap fires immediately without entering aiming', () => {
    const engine = setup();
    for (let x = 1; x <= 25; x++) engine.dark[2][x] = true;
    give(engine, 'light');

    expect(engine.beginZap({ kind: 'wand', index: 0 })).toBe(true);
    expect(engine.aiming).toBeNull();
    expect(engine.dark[2][2]).toBe(false);
  });

  it('cancelZap aborts aiming without spending a turn', () => {
    const engine = setup();
    give(engine, 'cold');
    const turnBefore = engine.turn;

    engine.beginZap({ kind: 'wand', index: 0 });
    expect(engine.aiming).not.toBeNull();
    engine.cancelZap();
    expect(engine.aiming).toBeNull();
    expect(engine.turn).toBe(turnBefore);
  });

  it('drawFirstWand prefers a ready wand over one on cooldown', () => {
    const engine = setup();
    const onCd = spawnWand(WAND_POOL.find(w => w.wandType === 'fire')!);
    onCd.cooldownRemaining = 3;
    const ready = spawnWand(WAND_POOL.find(w => w.wandType === 'cold')!);
    engine.player.inventory.wands = [onCd, ready];

    expect(engine.drawFirstWand()).toBe(true);
    expect(engine.aiming?.ref.index).toBe(1);
  });
});

describe('wand pickup', () => {
  it('picks a floor wand into the wands bucket and clears it from the floor', () => {
    const engine = setup();
    const data = spawnWand(WAND_POOL.find(w => w.wandType === 'fire')!);
    engine.items = [{ type: 'wand', x: 2, y: 2, symbol: '/', color: '#fff', data } as any];

    engine.checkItems();
    expect(engine.player.inventory.wands).toHaveLength(1);
    expect(engine.player.inventory.wands[0].wandType).toBe('fire');
    expect(engine.items).toHaveLength(0);
  });
});

describe('bolt targeting (traceBolt)', () => {
  it('a wall stops the bolt before a monster behind it', () => {
    const engine = setup();
    engine.map[2][6] = TILE.VOID; // wall gap in the corridor
    const behind = mkMonster(8, 2);
    engine.monsters = [behind];
    give(engine, 'striking');

    engine.zapWand(0, 1, 0);
    expect(behind.hp).toBe(200); // bolt stopped at the wall
  });

  it('aims vertically as well as horizontally', () => {
    const engine = setup();
    for (let y = 2; y <= 10; y++) engine.map[y][2] = TILE.FLOOR; // carve a column
    const below = mkMonster(2, 6);
    engine.monsters = [below];
    give(engine, 'striking');

    engine.zapWand(0, 0, 1);
    expect(below.hp).toBeLessThan(200);
  });

  it('a zap into empty space hits nothing but still spends the turn and sets cooldown', () => {
    const engine = setup();
    const offLine = mkMonster(5, 5); // not on row 2
    engine.monsters = [offLine];
    const wand = give(engine, 'striking');
    const turnBefore = engine.turn;

    const ok = engine.zapWand(0, 1, 0);
    expect(ok).toBe(true);
    expect(offLine.hp).toBe(200);
    expect(engine.turn).toBe(turnBefore + 1);
    expect(wand.cooldownRemaining).toBeGreaterThan(0);
  });

  it('refuses to zap a directional wand with no direction', () => {
    const engine = setup();
    engine.monsters = [mkMonster(5, 2)];
    give(engine, 'striking');
    expect(engine.zapWand(0, 0, 0)).toBe(false);
  });

  it('does not zap once the run has ended', () => {
    const engine = setup();
    engine.monsters = [mkMonster(5, 2)];
    give(engine, 'striking');
    engine.gameOver = true;
    expect(engine.zapWand(0, 1, 0)).toBe(false);
    expect(engine.drawFirstWand()).toBe(false);
  });
});

describe('bolt targeting — range, directions, miss log', () => {
  it('respects maxRange (a monster beyond it is untouched)', () => {
    const engine = setup();
    const distant = mkMonster(2 + BALANCE.wands.maxRange + 3, 2);
    engine.monsters = [distant];
    give(engine, 'striking');
    engine.zapWand(0, 1, 0);
    expect(distant.hp).toBe(200);
  });

  it('hits a monster two tiles away in all eight directions', () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const engine = setup();
      engine.map = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(TILE.FLOOR));
      engine.player.x = 20;
      engine.player.y = 14;
      const m = mkMonster(20 + dx * 2, 14 + dy * 2);
      engine.monsters = [m];
      give(engine, 'striking');
      engine.zapWand(0, dx, dy);
      expect(m.hp, `direction ${dx},${dy}`).toBeLessThan(200);
    }
  });

  it('logs "strikes nothing" on an empty-line zap', () => {
    const engine = setup();
    engine.monsters = [];
    give(engine, 'striking');
    engine.zapWand(0, 1, 0);
    expect(engine.logs.some(l => /strikes nothing/.test(l))).toBe(true);
  });
});

describe('damage variance and staff tier', () => {
  it('damage bolts vary with the RNG roll (variance is real)', () => {
    const damages = new Set<number>();
    for (const roll of [0.02, 0.5, 0.98]) {
      const engine = setup();
      const m = mkMonster(5, 2, { hp: 100000, maxHp: 100000 });
      engine.monsters = [m];
      give(engine, 'fire');
      rngNext = roll;
      engine.zapWand(0, 1, 0);
      damages.add(100000 - m.hp);
    }
    expect(damages.size).toBeGreaterThan(1);
  });

  it('fire deals damage to the first monster in line', () => {
    const engine = setup();
    const orc = mkMonster(5, 2);
    engine.monsters = [orc];
    give(engine, 'fire');
    engine.zapWand(0, 1, 0);
    expect(orc.hp).toBeLessThan(200);
  });

  it('a staff-tier wand out-damages its wand-tier twin (flat staff bonus)', () => {
    const zapTier = (tier: 'wand' | 'staff') => {
      const engine = setup();
      const m = mkMonster(5, 2, { hp: 100000, maxHp: 100000 });
      engine.monsters = [m];
      // Same type/floor, no variance (rngNext=0.5) — only `tier` differs.
      engine.player.inventory.wands = [{ name: 'X', wandType: 'fire', tier, cooldownRemaining: 0, identified: true }];
      engine.zapWand(0, 1, 0);
      return 100000 - m.hp;
    };
    expect(zapTier('staff')).toBe(zapTier('wand') + BALANCE.wands.staffDamageBonus);
  });
});

describe('control-effect completeness', () => {
  it('a frozen monster is skipped by processMonsterAI (does not move/attack)', () => {
    const engine = setup();
    const orc = mkMonster(4, 2, { hp: 9999, maxHp: 9999 }); // would otherwise close in
    engine.monsters = [orc];
    give(engine, 'cold');
    engine.zapWand(0, 1, 0); // freezes (frozenTurns -> coldFreezeTurns-1, still > 0)
    const xBefore = orc.x;
    const hpBefore = engine.player.hp;
    engine.processTurn();
    expect(orc.x).toBe(xBefore); // skipped this turn
    expect(engine.player.hp).toBe(hpBefore); // did not attack
  });

  it('polymorph clears ai runtime, freeze, cancellation, and carried loot state', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { hp: 40, maxHp: 200, frozenTurns: 4, canceledTurns: 3 });
    orc.ai = { state: 'hunting', cooldowns: {}, swipeToggle: false };
    orc.gold = 50;
    orc.stolenLoot = [{ type: 'potion', symbol: '!', color: '#ff66ff', data: { potionType: 'healing' } }];
    engine.monsters = [orc];
    give(engine, 'polymorph');
    engine.zapWand(0, 1, 0);
    const m = engine.monsters[0];
    // respawnMonster nulls the ai runtime; the post-zap monster turn re-attaches
    // a FRESH one, so the old 'hunting' state is gone (back to default 'asleep').
    expect(m.ai?.state).not.toBe('hunting');
    expect(m.frozenTurns).toBe(0);
    expect(m.canceledTurns ?? 0).toBe(0);
    expect(m.gold).toBeUndefined();
    expect(m.stolenLoot).toBeUndefined();
    expect(m.hp).toBe(m.maxHp);
  });

  it('lightning is blocked by a wall partway down the line', () => {
    const engine = setup();
    const a = mkMonster(5, 2);
    const b = mkMonster(7, 2);
    const beyond = mkMonster(12, 2);
    engine.map[2][10] = TILE.VOID; // wall between b and beyond
    engine.monsters = [a, b, beyond];
    give(engine, 'lightning');
    engine.zapWand(0, 1, 0);
    expect(a.hp).toBeLessThan(200);
    expect(b.hp).toBeLessThan(200);
    expect(beyond.hp).toBe(200); // wall stopped the beam
  });

  it('teleport never lands a monster on an armed trap', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { frozenTurns: 50 }); // frozen so it won't wander after
    engine.monsters = [orc];
    // Arm every row-2 floor tile except (10,2); adjacency to the player is
    // already excluded by teleportMonsterSafely, so (10,2) is the only safe spot.
    for (let x = 4; x <= 25; x++) {
      if (x === 10) continue;
      engine.traps.push({ id: `t${x}`, kind: 'bear', x, y: 2, revealed: false, armed: true });
    }
    give(engine, 'teleport_away');
    engine.zapWand(0, 1, 0);
    expect(orc.x).toBe(10);
    expect(orc.y).toBe(2);
  });
});

describe('cooldown decrements cleanly to zero', () => {
  it('reaches exactly 0 and never goes negative', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { hp: 9999, maxHp: 9999 });
    engine.monsters = [orc];
    const wand = give(engine, 'striking');
    engine.zapWand(0, 1, 0);
    while ((wand.cooldownRemaining ?? 0) > 0) engine.processTurn();
    expect(wand.cooldownRemaining).toBe(0);
    engine.processTurn(); // extra tick
    expect(wand.cooldownRemaining).toBe(0); // stays clamped
  });
});

describe('recharge no-op never strands a real wand', () => {
  beforeEach(() => { rngNext = 0.5; });
  it('keeps the wand carried after a blocked zap', () => {
    const engine = setup();
    const orc = mkMonster(5, 2, { hp: 9999, maxHp: 9999 });
    engine.monsters = [orc];
    give(engine, 'striking');
    engine.zapWand(0, 1, 0);
    engine.zapWand(0, 1, 0); // blocked
    expect(engine.player.inventory.wands).toHaveLength(1);
  });
});

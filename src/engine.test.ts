import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { Monster } from './types';
import { TILE, isWalkable } from './tiles';
import type { RNG } from './rng';
import { RecordingSink } from './audio/events';

const makeUi = () => ({
  renderLogs: () => {},
  resetLog: () => {},
  updateDropdowns: () => {},
  updateStats: () => {},
  syncDiscovery: () => {},
  render: () => {},
  fxPlayerRun: () => {},
  fxStrike: () => {},
  fxHit: () => {},
  fxFreeze: () => {},
  fxDeath: () => {},
  fxPlayerHit: () => {},
  fxDive: () => {},
  fxWhiff: () => {},
  fxMonsterDodge: () => {},
});

const makeBoss = (name = 'Marcus the Brave'): Monster => ({
  x: 0,
  y: 0,
  symbol: 'M*',
  name,
  hp: 1,
  atk: 1,
  color: '#ffd700',
  minFloor: 20,
  special: 'boss',
  frozenTurns: 0,
});

const makeBossKiller = (floor: number) => {
  const engine = new GameEngine(makeUi() as any);
  engine.dungeonFloor = floor;
  engine.player.baseAtk = 100;
  engine.player.inventory.weapons[0] = { name: 'Test Blade', dmg: 100 };
  engine.player.equipped.mainHand = 0;
  engine.player.equipped.offHand = 'none:0';
  return engine;
};

describe('GameEngine startup logs', () => {
  it('uses the actual stair glyphs in the welcome message', () => {
    const engine = new GameEngine(makeUi() as any);

    engine.initGame(123);

    expect(engine.logs[0]).toBe(
      `Welcome to the Dungeon! Move onto stairs (${TILE.STAIRS_UP} or ${TILE.STAIRS_DOWN}) to travel between floors.`
    );
  });
});

const makeEmptyMap = (engine: GameEngine) =>
  new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(TILE.VOID));

const makeRunner = (sound?: RecordingSink) => {
  const engine = new GameEngine(makeUi() as any, sound);
  engine.map = makeEmptyMap(engine);
  engine.explored = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.visible = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.dark = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.items = [];
  engine.monsters = [];
  engine.traps = [];
  engine.trapEffects = { bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0 };
  engine.player.hunger = 100;
  engine.player.x = 2;
  engine.player.y = 2;
  return engine;
};

const carveRow = (engine: GameEngine, y: number, x1: number, x2: number, tile: string = TILE.FLOOR) => {
  for (let x = x1; x <= x2; x++) engine.map[y][x] = tile;
};

const findTile = (engine: GameEngine, tile: string) => {
  for (let y = 0; y < engine.ROWS; y++) {
    for (let x = 0; x < engine.COLS; x++) {
      if (engine.map[y]?.[x] === tile) return { x, y };
    }
  }
  throw new Error(`Missing tile ${tile}`);
};

const stepOffAndBackOnto = (engine: GameEngine, tile: string) => {
  const origin = findTile(engine, tile);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (isWalkableForTest(engine, x, y) && engine.map[y][x] !== tile) {
      engine.player.x = origin.x;
      engine.player.y = origin.y;
      engine.handlePlayerMove(dx, dy);
      engine.handlePlayerMove(-dx, -dy);
      return;
    }
  }
  throw new Error(`No adjacent walkable tile next to ${tile}`);
};

const isWalkableForTest = (engine: GameEngine, x: number, y: number) =>
  x >= 0 &&
  x < engine.COLS &&
  y >= 0 &&
  y < engine.ROWS &&
  isWalkable(engine.map[y]?.[x]);

const setChanceRoll = (engine: GameEngine, roll: number) => {
  const rng: RNG = {
    seed: 1,
    next: () => roll,
    int: max => Math.min(max - 1, Math.floor(roll * max)),
    range: (min, max) => Math.min(max, min + Math.floor(roll * (max - min + 1))),
    chance: p => roll < p,
    pick: arr => arr[0],
    getState: () => 0,
  };
  (engine as any).rng = rng;
};

describe('GameEngine boss victory conditions', () => {
  it('does not win the game when a boss-tagged Marcus dies before floor 20', () => {
    const engine = makeBossKiller(1);
    const marcus = makeBoss();
    engine.monsters = [marcus];

    engine.playerAttack(marcus);

    expect(engine.gameWon).toBe(false);
    expect(engine.monsters).toHaveLength(0);
  });

  it('wins only after the last floor-20 boss dies', () => {
    const engine = makeBossKiller(20);
    const dragon = makeBoss('Dragon King');
    const marcus = makeBoss('Marcus the Brave');
    engine.monsters = [dragon, marcus];

    engine.playerAttack(dragon);
    expect(engine.gameWon).toBe(false);

    engine.playerAttack(marcus);
    expect(engine.gameWon).toBe(true);
  });

  it('does not let an unrelated floor-20 boss tag satisfy the finale', () => {
    const engine = makeBossKiller(20);
    const impostor = makeBoss('Training Boss');
    engine.monsters = [impostor];

    engine.playerAttack(impostor);

    expect(engine.gameWon).toBe(false);
  });

  it('creates a victory summary only for the real final boss condition', () => {
    const early = makeBossKiller(1);
    early.playerAttack(makeBoss());
    expect(early.gameWon).toBe(false);
    expect(early.finalRunSummary).toBeNull();

    const finale = makeBossKiller(20);
    const dragon = makeBoss('Dragon King');
    const marcus = makeBoss('Marcus the Brave');
    finale.monsters = [dragon, marcus];
    finale.playerAttack(dragon);
    expect(finale.finalRunSummary).toBeNull();

    finale.playerAttack(marcus);
    expect(finale.finalRunSummary?.outcome).toBe('won');
    expect(finale.finalRunSummary?.bossesDefeated).toBe(2);
    expect(finale.finalRunSummary?.turns).toBe(1);
  });
});

describe('GameEngine terminal run summaries', () => {
  it('finalizes a starvation death once and ignores later processTurn calls', () => {
    const engine = makeRunner();
    engine.player.hp = 1;
    engine.player.hunger = 0;

    engine.processTurn();
    const summary = engine.finalRunSummary;

    expect(engine.gameOver).toBe(true);
    expect(summary?.outcome).toBe('died');
    expect(summary?.deathCause).toBe('starvation');
    expect(summary?.turns).toBe(1);

    engine.processTurn();
    expect(engine.turn).toBe(1);
    expect(engine.finalRunSummary).toBe(summary);
  });

});

describe('GameEngine vital warning sounds', () => {
  it('uses Vigor-adjusted max HP for critical and dual survival warnings', () => {
    const sink = new RecordingSink();
    const engine = makeRunner(sink);
    engine.player.maxHp = 30;
    engine.player.hp = 15;
    engine.player.hunger = 220;
    engine.statusEffects.vigorTurns = 2;

    engine.processTurn();

    expect(sink.types()).toEqual(expect.arrayContaining([
      'survival.dualWarning',
      'player.criticalHealth',
      'hunger.nearStarved',
    ]));
  });
});

describe('GameEngine stair travel', () => {
  it('lets the player descend and then return to the saved previous floor', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4);
    engine.map[2][3] = TILE.STAIRS_DOWN;
    engine.items = [{ type: 'food', symbol: '%', color: '#ff9900', x: 4, y: 2 }];

    engine.handlePlayerMove(1, 0);

    expect(engine.dungeonFloor).toBe(2);
    expect(engine.map[engine.player.y][engine.player.x]).toBe(TILE.STAIRS_UP);

    engine.monsters = [];
    stepOffAndBackOnto(engine, TILE.STAIRS_UP);

    expect(engine.dungeonFloor).toBe(1);
    expect(engine.player.x).toBe(3);
    expect(engine.player.y).toBe(2);
    expect(engine.map[2][3]).toBe(TILE.STAIRS_DOWN);
    expect(engine.items).toEqual([{ type: 'food', symbol: '%', color: '#ff9900', x: 4, y: 2 }]);
  });

  it('keeps revealed secret doors revealed after leaving and returning to a floor', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4, TILE.CORRIDOR);
    engine.map[2][3] = TILE.SECRET_DOOR;
    engine.map[2][4] = TILE.STAIRS_DOWN;
    setChanceRoll(engine, 0);

    engine.search();
    engine.handlePlayerMove(1, 0);
    expect(engine.map[2][3]).toBe(TILE.DOOR);
    engine.handlePlayerMove(1, 0);

    expect(engine.dungeonFloor).toBe(2);
    engine.monsters = [];
    stepOffAndBackOnto(engine, TILE.STAIRS_UP);

    expect(engine.dungeonFloor).toBe(1);
    expect(engine.map[2][3]).toBe(TILE.DOOR);
  });
});

describe('GameEngine secret-door search', () => {
  it('reveals an adjacent secret door when explicit search succeeds', () => {
    const engine = makeRunner();
    engine.map[2][2] = TILE.CORRIDOR;
    engine.map[2][3] = TILE.SECRET_DOOR;
    setChanceRoll(engine, 0);

    const found = engine.search();

    expect(found).toBe(true);
    expect(engine.map[2][3]).toBe(TILE.DOOR);
    expect(engine.turn).toBe(1);
    expect(engine.logs).toContain('You found a hidden door.');
  });

  it('spends a turn on failed explicit search without changing the map', () => {
    const engine = makeRunner();
    engine.map[2][2] = TILE.CORRIDOR;
    engine.map[2][3] = TILE.SECRET_DOOR;
    setChanceRoll(engine, 0.99);

    const found = engine.search();

    expect(found).toBe(false);
    expect(engine.map[2][3]).toBe(TILE.SECRET_DOOR);
    expect(engine.turn).toBe(1);
    expect(engine.logs).toContain('You search carefully.');
  });

  it('can reveal a secret door by bumping into it from a corridor', () => {
    const engine = makeRunner();
    engine.map[2][2] = TILE.CORRIDOR;
    engine.map[2][3] = TILE.SECRET_DOOR;
    setChanceRoll(engine, 0);

    engine.handlePlayerMove(1, 0);

    expect(engine.player.x).toBe(2);
    expect(engine.player.y).toBe(2);
    expect(engine.map[2][3]).toBe(TILE.DOOR);
    expect(engine.turn).toBe(1);
  });

  it('does not search when the run has ended', () => {
    const engine = makeRunner();
    engine.gameOver = true;
    engine.map[2][3] = TILE.SECRET_DOOR;

    const found = engine.search();

    expect(found).toBe(false);
    expect(engine.turn).toBe(0);
    expect(engine.map[2][3]).toBe(TILE.SECRET_DOOR);
  });
});

describe('GameEngine hidden traps', () => {
  it('reveals a nearby trap before a nearby secret door', () => {
    const engine = makeRunner();
    engine.map[2][2] = TILE.CORRIDOR;
    engine.map[2][3] = TILE.SECRET_DOOR;
    engine.traps = [{ id: 't1', kind: 'bear', x: 2, y: 1, revealed: false, armed: true }];
    setChanceRoll(engine, 0);

    const found = engine.search();

    expect(found).toBe(true);
    expect(engine.traps[0].revealed).toBe(true);
    expect(engine.map[2][3]).toBe(TILE.SECRET_DOOR);
    expect(engine.turn).toBe(1);
    expect(engine.logs).toContain('You notice a bear trap.');
  });

  it('does not reveal a nearby secret door when a nearby trap search fails', () => {
    const engine = makeRunner();
    engine.map[2][2] = TILE.CORRIDOR;
    engine.map[2][3] = TILE.SECRET_DOOR;
    engine.traps = [{ id: 't1', kind: 'bear', x: 2, y: 1, revealed: false, armed: true }];
    setChanceRoll(engine, 0.99);

    const found = engine.search();

    expect(found).toBe(false);
    expect(engine.traps[0].revealed).toBe(false);
    expect(engine.map[2][3]).toBe(TILE.SECRET_DOOR);
    expect(engine.turn).toBe(1);
    expect(engine.logs).toContain('You search carefully.');
  });

  it('triggers a hidden bear trap when stepped on and leaves it spent', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4);
    engine.traps = [{ id: 't1', kind: 'bear', x: 3, y: 2, revealed: false, armed: true }];
    setChanceRoll(engine, 0);

    engine.handlePlayerMove(1, 0);

    expect(engine.player.x).toBe(3);
    expect(engine.traps[0].revealed).toBe(true);
    expect(engine.traps[0].armed).toBe(false);
    expect(engine.trapEffects.bearTrapTurns).toBe(2);
    expect(engine.turn).toBe(1);
    expect(engine.logs).toContain('A bear trap snaps shut!');
  });

  it('repair scroll is carried on pickup and mends gear only when read', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 3);
    engine.player.inventory.chest[1] = { name: 'Chainmail', def: 1, maxDef: 4, health: { current: 1, max: 4 }, rarity: 'common' };
    engine.player.inventory.shield.push({ name: 'Buckler', def: 0, maxDef: 3, health: { current: 0, max: 3 }, rarity: 'common' });
    engine.items = [{ x: 3, y: 2, type: 'scroll', symbol: '?', color: '#fff', data: { scrollType: 'repair' } }];

    // Pickup must NOT apply the effect — the scroll is carried, gear still damaged.
    engine.handlePlayerMove(1, 0);
    expect(engine.player.inventory.scrolls).toContain('repair');
    expect(engine.player.inventory.chest[1].health).toEqual({ current: 1, max: 4 });

    // Reading it repairs all defensive gear and consumes the scroll.
    engine.useScroll(engine.player.inventory.scrolls.indexOf('repair'));
    expect(engine.player.inventory.chest[1].health).toEqual({ current: 4, max: 4 });
    expect(engine.player.inventory.chest[1].def).toBe(4);
    expect(engine.player.inventory.shield[1].health).toEqual({ current: 3, max: 3 });
    expect(engine.player.inventory.shield[1].def).toBe(3);
    expect(engine.player.inventory.scrolls).not.toContain('repair');
  });

  it('revealed armed traps still trigger, but spent traps do not', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4);
    engine.traps = [{ id: 't1', kind: 'sleep_gas', x: 3, y: 2, revealed: true, armed: true }];

    engine.handlePlayerMove(1, 0);
    expect(engine.trapEffects.sleepTurns).toBe(2);
    expect(engine.traps[0].armed).toBe(false);

    engine.trapEffects.sleepTurns = 0;
    engine.handlePlayerMove(-1, 0);
    engine.handlePlayerMove(1, 0);
    expect(engine.trapEffects.sleepTurns).toBe(0);
  });

  it('sleep gas ignores consumable and inventory commands while spending sleep turns', () => {
    const engine = makeRunner();
    engine.player.inventory.potions = ['healing'];
    engine.player.inventory.food = 1;
    engine.player.inventory.scrolls = ['light'];
    engine.player.hp = 10;
    engine.player.hunger = 10;

    engine.trapEffects.sleepTurns = 1;
    engine.usePotion(0);
    expect(engine.player.inventory.potions).toEqual(['healing']);
    expect(engine.player.hp).toBe(10);
    expect(engine.trapEffects.sleepTurns).toBe(0);
    expect(engine.turn).toBe(1);

    engine.trapEffects.sleepTurns = 1;
    engine.player.hunger = 10;
    engine.consumeFood();
    expect(engine.player.inventory.food).toBe(1);
    expect(engine.player.hunger).toBe(9);
    expect(engine.trapEffects.sleepTurns).toBe(0);
    expect(engine.turn).toBe(2);

    engine.trapEffects.sleepTurns = 1;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toEqual(['light']);
    expect(engine.trapEffects.sleepTurns).toBe(0);
    expect(engine.turn).toBe(3);

    engine.trapEffects.sleepTurns = 1;
    const acted = engine.performInventoryAction({ kind: 'potion', potionType: 'healing' }, 'use');
    expect(acted).toBe(false);
    expect(engine.player.inventory.potions).toEqual(['healing']);
    expect(engine.trapEffects.sleepTurns).toBe(0);
    expect(engine.turn).toBe(4);
  });

  it('bear trap hold blocks later movement and spends a turn', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 5);
    engine.trapEffects.bearTrapTurns = 2;

    engine.handlePlayerMove(1, 0);

    expect(engine.player.x).toBe(2);
    expect(engine.turn).toBe(1);
    expect(engine.trapEffects.bearTrapTurns).toBe(1);
    expect(engine.logs).toContain('The bear trap holds you fast.');
  });

  it('dart trap drains strength and Potion of Strength clears the drain', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4);
    engine.traps = [{ id: 't1', kind: 'dart', x: 3, y: 2, revealed: false, armed: true }];
    engine.player.inventory.potions = ['strength'];
    setChanceRoll(engine, 0);

    engine.handlePlayerMove(1, 0);
    expect(engine.trapEffects.strengthDrained).toBe(1);

    engine.usePotion(0);
    expect(engine.trapEffects.strengthDrained).toBe(0);
    expect(engine.statusEffects.strengthTurns).toBeGreaterThan(0);
  });

  it('teleport trap moves the player away from monsters and armed traps', () => {
    const engine = makeRunner();
    engine.map = makeEmptyMap(engine);
    for (let y = 1; y <= 6; y++) {
      for (let x = 1; x <= 8; x++) engine.map[y][x] = TILE.FLOOR;
    }
    engine.player.x = 2;
    engine.player.y = 2;
    const monster = makeBoss('Hall Guard');
    monster.x = 8;
    monster.y = 6;
    engine.monsters = [monster];
    engine.traps = [
      { id: 'tele', kind: 'teleport', x: 3, y: 2, revealed: false, armed: true },
      { id: 'bear', kind: 'bear', x: 4, y: 2, revealed: true, armed: true },
    ];
    setChanceRoll(engine, 0);

    engine.handlePlayerMove(1, 0);

    expect(`${engine.player.x},${engine.player.y}`).not.toBe('3,2');
    expect(engine.traps.some(t => t.armed && t.x === engine.player.x && t.y === engine.player.y)).toBe(false);
    expect(engine.monsters.some(m => Math.max(Math.abs(m.x - engine.player.x), Math.abs(m.y - engine.player.y)) <= 1)).toBe(false);
  });

  it('trapdoor drops the player to the next floor without an extra old-floor monster turn', () => {
    const engine = makeRunner();
    engine.dungeonFloor = 8;
    carveRow(engine, 2, 2, 4);
    engine.traps = [{ id: 'drop', kind: 'trapdoor', x: 3, y: 2, revealed: false, armed: true }];
    setChanceRoll(engine, 0);

    engine.handlePlayerMove(1, 0);

    expect(engine.dungeonFloor).toBe(9);
    expect(engine.map[engine.player.y][engine.player.x]).toBe(TILE.STAIRS_UP);
    expect(engine.turn).toBe(0);
  });
});

describe('GameEngine run movement', () => {
  it('moves in a straight line until the next tile is blocked', () => {
    const sink = new RecordingSink();
    const engine = makeRunner(sink);
    carveRow(engine, 2, 2, 6);

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(6);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(4);
    expect(sink.ofType('movement.run')[0]).toMatchObject({ steps: 4 });
  });

  it('stops at the doorway when running down a corridor into a room', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 5, TILE.CORRIDOR);
    engine.map[2][6] = TILE.DOOR;
    carveRow(engine, 2, 7, 10, TILE.FLOOR);

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(6);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(4);
  });

  it('stops before a monster instead of auto-attacking it', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 6);
    const monster = makeBoss('Hall Guard');
    monster.x = 5;
    monster.y = 2;
    monster.hp = 10;
    monster.frozenTurns = 10;
    engine.monsters = [monster];

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(4);
    expect(engine.player.y).toBe(2);
    expect(monster.hp).toBe(10);
    expect(engine.turn).toBe(2);
  });

  const carveCol = (engine: GameEngine, x: number, y1: number, y2: number, tile: string = TILE.CORRIDOR) => {
    for (let y = y1; y <= y2; y++) engine.map[y][x] = tile;
  };

  it('follows a corridor around a bend instead of stopping at the wall', () => {
    const engine = makeRunner();
    // L-shaped corridor: east along y=2 to x=5, then south down x=5 to y=6.
    carveRow(engine, 2, 2, 5, TILE.CORRIDOR);
    carveCol(engine, 5, 2, 6);

    engine.handlePlayerRun(1, 0);

    // Turned the corner at (5,2) and ran to the dead end at (5,6): 7 tiles.
    expect(engine.player.x).toBe(5);
    expect(engine.player.y).toBe(6);
    expect(engine.turn).toBe(7);
  });

  it('stops at a corridor junction so the player chooses the branch', () => {
    const engine = makeRunner();
    // T-junction at (5,2): horizontal hall crossed by a vertical branch.
    carveRow(engine, 2, 2, 8, TILE.CORRIDOR);
    carveCol(engine, 5, 1, 4);

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(5);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(3);
  });

  it('runs out of a room, through the doorway, and follows the corridor', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 4, TILE.FLOOR); // room floor
    engine.map[2][5] = TILE.DOOR;
    carveRow(engine, 2, 6, 9, TILE.CORRIDOR); // corridor beyond the door

    engine.handlePlayerRun(1, 0);

    // Straight through the room and door, then down the corridor to its end.
    expect(engine.player.x).toBe(9);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(7);
  });

  it('honours the pressed direction for the first step when starting on a junction', () => {
    const engine = makeRunner();
    // Player begins ON a junction: corridors run east and south from (2,2).
    carveRow(engine, 2, 2, 6, TILE.CORRIDOR);
    carveCol(engine, 2, 2, 5);

    engine.handlePlayerRun(1, 0);

    // Moves east as pressed (not south), then follows the hall to the dead end.
    expect(engine.player.x).toBe(6);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(4);
  });

  it('terminates in a closed loop corridor instead of circling until maxSteps', () => {
    const engine = makeRunner();
    // A square loop of corridor; the player starts at the top-left corner.
    carveRow(engine, 2, 2, 6, TILE.CORRIDOR);
    carveRow(engine, 6, 2, 6, TILE.CORRIDOR);
    carveCol(engine, 2, 2, 6);
    carveCol(engine, 6, 2, 6);

    engine.handlePlayerRun(1, 0);

    // One lap around the loop is 16 tiles; without the visited guard the run
    // would burn maxSteps (COLS+ROWS = 75) turns. It must stop at/under one lap.
    expect(engine.turn).toBeLessThanOrEqual(16);
    expect(engine.turn).toBeGreaterThan(0);
  });

  it('stops at a 4-way junction (three onward options)', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 8, TILE.CORRIDOR); // east-west hall through (5,2)
    carveCol(engine, 5, 0, 4); // full vertical cross at x=5

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(5);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(3);
  });

  it('stops at a corridor dead end reached around a bend', () => {
    const engine = makeRunner();
    // East to (4,2), then the only continuation is a short south stub ending at (4,4).
    carveRow(engine, 2, 2, 4, TILE.CORRIDOR);
    carveCol(engine, 4, 2, 4);

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(4);
    expect(engine.player.y).toBe(4);
    expect(engine.turn).toBe(4);
  });

  it('stops one tile short of a monster waiting around a blind corner', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 5, TILE.CORRIDOR);
    carveCol(engine, 5, 2, 6); // corridor turns south at (5,2)
    const monster = makeBoss('Lurker');
    monster.x = 5;
    monster.y = 5;
    monster.hp = 10;
    monster.frozenTurns = 10;
    engine.monsters = [monster];

    engine.handlePlayerRun(1, 0);

    // Follows the bend south, then halts adjacent to the monster at (5,5).
    expect(engine.player.x).toBe(5);
    expect(engine.player.y).toBe(4);
    expect(monster.hp).toBe(10);
  });
});

describe('GameEngine board size', () => {
  it('defaults to the classic 46x29 board', () => {
    const engine = new GameEngine(makeUi() as any);
    expect(engine.COLS).toBe(46);
    expect(engine.ROWS).toBe(29);
    expect(engine.boardSizeId).toBe('classic');
  });

  it('resizes the board and generates a matching map for a new game', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.setBoardSize('huge');
    expect(engine.COLS).toBe(80);
    expect(engine.ROWS).toBe(42);

    engine.initGame(123);
    expect(engine.map.length).toBe(42);
    expect(engine.map[0].length).toBe(80);
    // Player starts in-bounds and walkable on the larger board.
    expect(isWalkable(engine.map[engine.player.y][engine.player.x])).toBe(true);
  });

  it('round-trips board size through snapshot/restore and adopts the saved dimensions', () => {
    const a = new GameEngine(makeUi() as any);
    a.setBoardSize('large');
    a.initGame(7);
    const save = a.snapshot();
    expect(save.boardSize).toBe('large');

    // A fresh engine (defaulting to classic) must adopt the saved size on restore.
    const b = new GameEngine(makeUi() as any);
    expect(b.COLS).toBe(46);
    b.restore(save);
    expect(b.boardSizeId).toBe('large');
    expect(b.COLS).toBe(64);
    expect(b.ROWS).toBe(36);
    expect(b.map.length).toBe(36);
    expect(b.map[0].length).toBe(64);
  });

  it('keeps the run board size on every floor when descending', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.setBoardSize('huge');
    engine.initGame(5);
    // Each new floor regenerates at the run's size, not the default.
    for (let f = 2; f <= 8; f++) {
      engine.dungeonFloor = f;
      engine.generateFloor();
      expect(engine.map.length, `floor ${f} rows`).toBe(42);
      expect(engine.map[0].length, `floor ${f} cols`).toBe(80);
      expect(isWalkable(engine.map[engine.player.y][engine.player.x]), `floor ${f} player`).toBe(true);
    }
  });

  it('restores an old save without a board size as classic', () => {
    const a = new GameEngine(makeUi() as any);
    a.initGame(9);
    const save = a.snapshot();
    delete (save as { boardSize?: unknown }).boardSize; // pre-feature save shape

    const b = new GameEngine(makeUi() as any);
    b.setBoardSize('huge'); // even if the engine was nudged to another size
    b.restore(save);
    expect(b.boardSizeId).toBe('classic');
    expect(b.COLS).toBe(46);
    expect(b.ROWS).toBe(29);
  });
});

describe('GameEngine inventory commands', () => {
  it('does not let use actions equip gear', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.player.inventory.weapons.push({ name: 'Steel Dagger', type: 'dagger', dmg: 3, rarity: 'common' });

    const used = engine.performInventoryAction({ kind: 'weapon', index: 1 }, 'use');

    expect(used).toBe(false);
    expect(engine.player.equipped.mainHand).toBe(0);
    expect(engine.logs).toContain('That item cannot be used.');
  });

  it('does not let equip actions consume potions', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.player.inventory.potions = ['healing'];

    const equipped = engine.performInventoryAction({ kind: 'potion', potionType: 'healing' }, 'equip');

    expect(equipped).toBe(false);
    expect(engine.player.inventory.potions).toEqual(['healing']);
    expect(engine.logs).toContain('That item cannot be equipped.');
  });

  it('reports stale food refs as failed use actions', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.player.inventory.food = 0;

    const used = engine.performInventoryAction({ kind: 'food' }, 'use');

    expect(used).toBe(false);
    expect(engine.logs).toContain('You have no food to eat!');
  });

  it('can equip an inventory dagger into off-hand through explicit action', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.player.inventory.weapons.push({ name: 'Steel Dagger', type: 'dagger', dmg: 3, rarity: 'common' });

    const equipped = engine.performInventoryAction({ kind: 'weapon', index: 1 }, 'equipOffHand');

    expect(equipped).toBe(true);
    expect(engine.player.equipped.offHand).toBe('weapon:1');
  });
});

describe('dark-room FOV', () => {
  // A rectangular room with walls + corners. Interior is (l+1..r-1, t+1..b-1).
  const carveRoom = (engine: GameEngine, l: number, t: number, r: number, b: number) => {
    for (let x = l + 1; x < r; x++) { engine.map[t][x] = TILE.WALL_H; engine.map[b][x] = TILE.WALL_H; }
    for (let y = t + 1; y < b; y++) {
      engine.map[y][l] = TILE.WALL_V; engine.map[y][r] = TILE.WALL_V;
      for (let x = l + 1; x < r; x++) engine.map[y][x] = TILE.FLOOR;
    }
    engine.map[t][l] = TILE.CORNER_TL; engine.map[t][r] = TILE.CORNER_TR;
    engine.map[b][l] = TILE.CORNER_BL; engine.map[b][r] = TILE.CORNER_BR;
  };

  const makeFovEngine = () => {
    const engine = new GameEngine(makeUi() as any);
    engine.map = makeEmptyMap(engine);
    engine.explored = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.visible = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.dark = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.items = [];
    engine.monsters = [];
    return engine;
  };

  // Room l=1,t=1,r=9,b=7 → interior x 2..8, y 2..6.
  const ROOM = { l: 1, t: 1, r: 9, b: 7 };
  const markInteriorDark = (engine: GameEngine) => {
    for (let y = ROOM.t + 1; y < ROOM.b; y++)
      for (let x = ROOM.l + 1; x < ROOM.r; x++) engine.dark[y][x] = true;
  };

  it('lit room reveals its whole interior at once', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    engine.player.x = 5; engine.player.y = 4;
    engine.updateFOV();
    for (let y = ROOM.t + 1; y < ROOM.b; y++)
      for (let x = ROOM.l + 1; x < ROOM.r; x++)
        expect(engine.visible[y][x], `lit (${x},${y})`).toBe(true);
  });

  it('dark room reveals only the immediate 3x3', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.player.x = 5; engine.player.y = 4;
    engine.updateFOV();
    for (let y = ROOM.t + 1; y < ROOM.b; y++) {
      for (let x = ROOM.l + 1; x < ROOM.r; x++) {
        const within = Math.max(Math.abs(x - 5), Math.abs(y - 4)) <= 1;
        expect(engine.visible[y][x], `dark (${x},${y}) within=${within}`).toBe(within);
      }
    }
  });

  it('moving in the dark reveals a new 3x3 but remembers (explored) the old', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.player.x = 4; engine.player.y = 4;
    engine.updateFOV();
    expect(engine.visible[4][3]).toBe(true);
    // Step right; the far-left tile drops out of view but stays explored.
    engine.player.x = 6;
    engine.updateFOV();
    expect(engine.visible[4][7]).toBe(true); // new frontier
    expect(engine.visible[4][3]).toBe(false); // out of the 3x3 now
    expect(engine.explored[4][3]).toBe(true); // but remembered
  });

  it('standing on a dark stairs tile still shows only the 3x3', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.map[4][5] = TILE.STAIRS_DOWN; // a stairs tile inside the dark room
    engine.player.x = 5; engine.player.y = 4;
    engine.updateFOV();
    expect(engine.visible[4][8]).toBe(false); // far interior stays dark
    expect(engine.visible[4][5]).toBe(true);  // the stairs tile itself
  });

  it('peeking into a dark room from a doorway reveals nothing beyond Chebyshev 1', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.map[ROOM.b][5] = TILE.DOOR;       // door in the bottom wall at (5,7)
    engine.map[ROOM.b + 1][5] = TILE.FLOOR;  // corridor cell just outside
    engine.player.x = 5; engine.player.y = ROOM.b; // stand on the door
    engine.updateFOV();
    // No dark interior tile more than 1 away from the door is visible.
    for (let y = ROOM.t + 1; y < ROOM.b; y++)
      for (let x = ROOM.l + 1; x < ROOM.r; x++)
        if (Math.max(Math.abs(x - 5), Math.abs(y - ROOM.b)) > 1)
          expect(engine.visible[y][x], `leak (${x},${y})`).toBe(false);
  });

  it('corridors still reveal up to the vision radius (regression)', () => {
    const engine = makeFovEngine();
    for (let x = 2; x < engine.COLS - 1; x++) engine.map[4][x] = TILE.CORRIDOR;
    engine.player.x = 4; engine.player.y = 4;
    engine.updateFOV();
    expect(engine.visible[4][9]).toBe(true);  // 5 tiles away, within radius 6
    expect(engine.visible[4][14]).toBe(false); // 10 tiles away, beyond radius
  });

  it('persists the dark grid across snapshot → restore', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.player.x = 5; engine.player.y = 4;
    engine.dungeonFloor = 5;

    const snap = engine.snapshot();
    expect(snap.dark?.[4][8]).toBe(true);

    const restored = new GameEngine(makeUi() as any);
    expect(restored.restore(snap)).toBe(true);
    expect(restored.dark[4][8]).toBe(true);
    // And the restored dark grid still drives FOV: far interior stays unseen.
    restored.player.x = 5; restored.player.y = 4;
    restored.updateFOV();
    expect(restored.visible[4][8]).toBe(false);
    expect(restored.visible[4][5]).toBe(true);
  });

  it('restores an old save with no dark grid as all-lit', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    engine.player.x = 5; engine.player.y = 4;
    const snap = engine.snapshot();
    delete snap.dark; // simulate a pre-dark-rooms save
    const restored = new GameEngine(makeUi() as any);
    expect(restored.restore(snap)).toBe(true);
    expect(restored.dark.every(row => row.every(v => v === false))).toBe(true);
  });

  it('keeps a room lit across descend/return (floor cache preserves cleared dark)', () => {
    const engine = makeFovEngine();
    carveRoom(engine, ROOM.l, ROOM.t, ROOM.r, ROOM.b);
    markInteriorDark(engine);
    engine.dungeonFloor = 1;
    engine.player.x = 5; engine.player.y = 4;
    engine.player.hunger = 100;

    // Light the room, clearing its dark bits.
    engine.player.inventory.scrolls = ['light'];
    engine.useScroll(0);
    expect(engine.dark[4][5]).toBe(false);

    // Descend (caches floor 1 with the cleared dark), then return from the cache.
    (engine as any).travelStairs(1);
    expect(engine.dungeonFloor).toBe(2);
    (engine as any).travelStairs(-1);
    expect(engine.dungeonFloor).toBe(1);

    // The room must still be lit — the [R-A2] "re-darkens after backtrack" bug.
    expect(engine.dark[4][5]).toBe(false);
    expect(engine.dark[4][8]).toBe(false);
  });
});

describe('scroll system', () => {
  // Small room l=3,t=3,r=7,b=7 → interior x 4..6, y 4..6.
  const setup = (dark = false) => {
    const engine = new GameEngine(makeUi() as any);
    engine.map = makeEmptyMap(engine);
    engine.explored = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.visible = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.dark = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
    engine.items = [];
    engine.monsters = [];
    engine.player.hunger = 100;
    // carve the room
    for (let x = 4; x <= 6; x++) { engine.map[3][x] = TILE.WALL_H; engine.map[7][x] = TILE.WALL_H; }
    for (let y = 4; y <= 6; y++) {
      engine.map[y][3] = TILE.WALL_V; engine.map[y][7] = TILE.WALL_V;
      for (let x = 4; x <= 6; x++) engine.map[y][x] = TILE.FLOOR;
    }
    if (dark) for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) engine.dark[y][x] = true;
    engine.player.x = 5; engine.player.y = 5;
    return engine;
  };

  it('picks a typed Scroll of Light up into inventory (not consumed on pickup)', () => {
    const engine = setup();
    engine.items = [{ type: 'scroll', x: 5, y: 5, symbol: '?', color: '#ffd86b', data: { scrollType: 'light' } }];
    engine.checkItems();
    expect(engine.player.inventory.scrolls).toEqual(['light']);
    expect(engine.items.length).toBe(0);
  });

  it('reading Scroll of Light in a dark room lights it, consumes, and costs a turn', () => {
    const engine = setup(true);
    engine.player.inventory.scrolls = ['light'];
    const turnBefore = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls.length).toBe(0);
    expect(engine.dark[5][5]).toBe(false);
    expect(engine.dark[4][4]).toBe(false); // whole room cleared, not just the tile
    expect(engine.turn).toBe(turnBefore + 1);
  });

  it('reading in an already-lit room is a no-op: scroll kept, no turn spent', () => {
    const engine = setup(false);
    engine.player.inventory.scrolls = ['light'];
    const turnBefore = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toEqual(['light']);
    expect(engine.turn).toBe(turnBefore);
  });

  it('readScroll() reads the first carried scroll, and reports none when empty', () => {
    const engine = setup(true);
    expect(engine.readScroll()).toBe(false); // none yet
    engine.player.inventory.scrolls = ['light'];
    expect(engine.readScroll()).toBe(true);
    expect(engine.player.inventory.scrolls.length).toBe(0);
  });

  it('refuses to equip a scroll', () => {
    const engine = setup();
    engine.player.inventory.scrolls = ['light'];
    expect(engine.equipInventoryItem({ kind: 'scroll', scrollType: 'light' })).toBe(false);
  });
});

describe('monster gold drops', () => {
  // makeRunner gives a 1-damage player; computeStrike clamps to min 1, so a
  // 1-HP monster always dies in one swing. setChanceRoll(0) makes int()/range()
  // deterministic (int → 0, range → min), so dropped amounts are exact.
  const kill = (engine: GameEngine, m: Monster) => {
    engine.monsters = [m];
    engine.playerAttack(m);
  };

  it('a slain leprechaun drops its stolen purse plus a GOLDCALC hoard', () => {
    const engine = makeRunner();
    engine.dungeonFloor = 5;
    setChanceRoll(engine, 0); // GOLDCALC base = 2 + int(100) = 2
    const lep: Monster = {
      x: 3, y: 2, symbol: 'L', name: 'Leprechaun', hp: 1, maxHp: 1, atk: 1,
      color: '#00ff00', minFloor: 5, frozenTurns: 0, gold: 100, // 100 already stolen
    };

    kill(engine, lep);

    const pile = engine.items.find((i) => i.type === 'gold');
    expect(pile).toMatchObject({ type: 'gold', amount: 102, x: 3, y: 2 });
  });

  it('a slain guardian dragon drops a large floor-scaled hoard', () => {
    const engine = makeRunner();
    engine.dungeonFloor = 20;
    setChanceRoll(engine, 0); // range() returns its min
    const dragon: Monster = {
      x: 3, y: 2, symbol: 'D', name: 'Dragon', hp: 1, maxHp: 1, atk: 1,
      color: '#00ff00', minFloor: 20, frozenTurns: 0,
    };

    kill(engine, dragon);

    // CHEST_GOLD_TABLE[20] (1200) × hoardMultiplier (5) = 6000, min of ±10% = 5400.
    const pile = engine.items.find((i) => i.type === 'gold');
    expect(pile).toMatchObject({ type: 'gold', amount: 5400 });
  });

  it('a plain monster drops no gold', () => {
    const engine = makeRunner();
    engine.dungeonFloor = 1;
    setChanceRoll(engine, 0);
    const orc: Monster = {
      x: 3, y: 2, symbol: 'O', name: 'Orc', hp: 1, maxHp: 1, atk: 1,
      color: '#556b2f', minFloor: 1, frozenTurns: 0,
    };

    kill(engine, orc);

    expect(engine.items.some((i) => i.type === 'gold')).toBe(false);
  });

  it('the Dragon King boss drops no hoard (only the plain guardian Dragon does)', () => {
    // Guards against a one-slug typo turning the endgame boss into a gold piñata:
    // 'Dragon King' resolves to the default archetype, not 'guardian'.
    const engine = makeRunner();
    engine.dungeonFloor = 20;
    setChanceRoll(engine, 0);
    const king: Monster = {
      x: 3, y: 2, symbol: 'D↑', name: 'Dragon King', hp: 1, maxHp: 1, atk: 1,
      color: '#00ff00', minFloor: 20, special: 'boss', frozenTurns: 0,
    };

    kill(engine, king);

    expect(engine.items.some((i) => i.type === 'gold')).toBe(false);
  });

  it('the guardian hoard stays within ±variance of chests × hoardMultiplier', () => {
    // roll 0 → range() min, roll 1 → range() max. Bounds: 1200×5 = 6000 ±10%.
    const dragonAt = (roll: number) => {
      const engine = makeRunner();
      engine.dungeonFloor = 20;
      setChanceRoll(engine, roll);
      kill(engine, {
        x: 3, y: 2, symbol: 'D', name: 'Dragon', hp: 1, maxHp: 1, atk: 1,
        color: '#00ff00', minFloor: 20, frozenTurns: 0,
      });
      const pile = engine.items.find((i) => i.type === 'gold');
      return pile && pile.type === 'gold' ? pile.amount : undefined;
    };

    expect(dragonAt(0)).toBe(5400); // 6000 × 0.9
    expect(dragonAt(1)).toBe(6600); // 6000 × 1.1
  });

  it('collecting a dropped pile credits its exact amount with no chest re-roll', () => {
    const engine = makeRunner();
    engine.dungeonFloor = 5;
    setChanceRoll(engine, 0);
    const goldBefore = engine.player.gold;
    engine.items = [{ type: 'gold', amount: 250, symbol: '$', color: '#ffff55', x: 2, y: 2 }];

    engine.checkItems(); // player is standing on (2,2)

    expect(engine.player.gold).toBe(goldBefore + 250);
    expect(engine.items.some((i) => i.type === 'gold')).toBe(false);
  });
});

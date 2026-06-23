import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { Monster } from './types';
import { TILE, isWalkable } from './tiles';
import type { RNG } from './rng';

const makeUi = () => ({
  renderLogs: () => {},
  resetLog: () => {},
  updateDropdowns: () => {},
  updateStats: () => {},
  syncDiscovery: () => {},
  render: () => {},
  fxStrike: () => {},
  fxHit: () => {},
  fxFreeze: () => {},
  fxDeath: () => {},
  fxPlayerHit: () => {},
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

const makeEmptyMap = (engine: GameEngine) =>
  new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(TILE.VOID));

const makeRunner = () => {
  const engine = new GameEngine(makeUi() as any);
  engine.map = makeEmptyMap(engine);
  engine.explored = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.visible = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.items = [];
  engine.monsters = [];
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

describe('GameEngine run movement', () => {
  it('moves in a straight line until the next tile is blocked', () => {
    const engine = makeRunner();
    carveRow(engine, 2, 2, 6);

    engine.handlePlayerRun(1, 0);

    expect(engine.player.x).toBe(6);
    expect(engine.player.y).toBe(2);
    expect(engine.turn).toBe(4);
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
});

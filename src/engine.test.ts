import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { Monster } from './types';
import { TILE } from './tiles';

const makeUi = () => ({
  renderLogs: () => {},
  updateDropdowns: () => {},
  updateStats: () => {},
  render: () => {},
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

import { describe, it, expect } from 'vitest';
import { generateLevel } from './map';
import { makeRng } from './rng';
import { TILE, isWalkable } from './tiles';

// Engine dimensions (see Engine.COLS / Engine.ROWS in src/engine.ts).
const COLS = 46;
const ROWS = 29;

type Level = ReturnType<typeof generateLevel>;

function gen(floor: number, seed: number, playerLevel = 5): Level {
  return generateLevel(floor, playerLevel, COLS, ROWS, makeRng(seed));
}

/** BFS over walkable tiles from (sx, sy); returns true if (tx, ty) is reached. */
function reachable(map: string[][], sx: number, sy: number, tx: number, ty: number): boolean {
  const seen = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const queue: Array<[number, number]> = [[sx, sy]];
  seen.add(key(sx, sy));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (x === tx && y === ty) return true;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
      if (!isWalkable(map[ny][nx])) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return false;
}

describe('generateLevel', () => {
  it('is deterministic for a given seed and args', () => {
    const a = gen(3, 1234);
    const b = gen(3, 1234);
    expect(a.map).toEqual(b.map);
    expect(a.playerX).toEqual(b.playerX);
    expect(a.playerY).toEqual(b.playerY);
    expect(a.stairsX).toEqual(b.stairsX);
    expect(a.stairsY).toEqual(b.stairsY);
  });

  it('produces different maps for different seeds', () => {
    const a = gen(3, 1);
    const b = gen(3, 2);
    expect(a.map).not.toEqual(b.map);
  });

  it('always starts the player on a walkable, in-bounds tile (seeds 1..30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(3, seed);
      expect(lvl.playerX).toBeGreaterThanOrEqual(0);
      expect(lvl.playerX).toBeLessThan(COLS);
      expect(lvl.playerY).toBeGreaterThanOrEqual(0);
      expect(lvl.playerY).toBeLessThan(ROWS);
      expect(isWalkable(lvl.map[lvl.playerY][lvl.playerX])).toBe(true);
    }
  });

  it('places walkable stairs on floors 1-19 (seeds 1..30)', () => {
    for (let floor = 1; floor < 20; floor += 6) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        expect(lvl.stairsX).toBeGreaterThanOrEqual(0);
        expect(lvl.stairsY).toBeGreaterThanOrEqual(0);
        expect(lvl.map[lvl.stairsY][lvl.stairsX]).toBe(TILE.STAIRS);
        expect(isWalkable(lvl.map[lvl.stairsY][lvl.stairsX])).toBe(true);
      }
    }
  });

  it('places no stairs but at least one boss on floor 20 (seeds 1..30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(20, seed);
      expect(lvl.stairsX).toBe(-1);
      expect(lvl.stairsY).toBe(-1);
      const bosses = lvl.monsters.filter(m => m.special === 'boss');
      expect(bosses.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('spawns Marcus the Brave on floor 1 with nerfed stats', () => {
    const lvl = gen(1, 7);
    expect(lvl.monsters.length).toBeGreaterThanOrEqual(1);
    const marcus = lvl.monsters.find(m => m.name === 'Marcus the Brave');
    expect(marcus).toBeDefined();
    expect(marcus?.hp).toBe(15);
    expect(marcus?.atk).toBe(1);
  });

  it('spawns Marcus the Brave on floor 20 as a boss with original stats', () => {
    const lvl = gen(20, 7);
    const marcus = lvl.monsters.find(m => m.name === 'Marcus the Brave');
    expect(marcus).toBeDefined();
    expect(marcus?.hp).toBe(900);
    expect(marcus?.atk).toBe(25);
  });

  it('encloses rooms: no floor tile is orthogonally adjacent to raw void (seeds 1..30)', () => {
    const allowed = new Set<string>([
      TILE.FLOOR,
      TILE.WALL_H,
      TILE.WALL_V,
      TILE.DOOR,
      TILE.CORRIDOR,
      TILE.STAIRS,
    ]);
    for (let seed = 1; seed <= 30; seed++) {
      const { map } = gen(3, seed);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (map[r][c] !== TILE.FLOOR) continue;
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = c + dx;
            const ny = r + dy;
            // In-bounds neighbors of a floor tile must be enclosing terrain,
            // never raw void. (Floor never sits on the map border here.)
            if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) continue;
            const neighbor = map[ny][nx];
            expect(
              allowed.has(neighbor),
              `seed ${seed}: floor at (${c},${r}) has void/illegal neighbor '${neighbor}' at (${nx},${ny})`
            ).toBe(true);
          }
        }
      }
    }
  });

  it('connects player to stairs via walkable tiles on floors 1-19 (seeds 1..30)', () => {
    for (let floor = 1; floor < 20; floor += 6) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        const ok = reachable(lvl.map, lvl.playerX, lvl.playerY, lvl.stairsX, lvl.stairsY);
        expect(
          ok,
          `floor ${floor}, seed ${seed}: stairs (${lvl.stairsX},${lvl.stairsY}) not reachable from player (${lvl.playerX},${lvl.playerY})`
        ).toBe(true);
      }
    }
  });

  it('spawns all items on walkable, in-bounds tiles (seeds 1..30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(5, seed);
      for (const it of lvl.items) {
        expect(it.x).toBeGreaterThanOrEqual(0);
        expect(it.x).toBeLessThan(COLS);
        expect(it.y).toBeGreaterThanOrEqual(0);
        expect(it.y).toBeLessThan(ROWS);
        expect(
          isWalkable(lvl.map[it.y][it.x]),
          `seed ${seed}: item at (${it.x},${it.y}) on non-walkable '${lvl.map[it.y][it.x]}'`
        ).toBe(true);
      }
    }
  });

  it('spawns all monsters on walkable, in-bounds tiles (seeds 1..30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(5, seed);
      for (const m of lvl.monsters) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThan(COLS);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeLessThan(ROWS);
        expect(
          isWalkable(lvl.map[m.y][m.x]),
          `seed ${seed}: monster '${m.name}' at (${m.x},${m.y}) on non-walkable '${lvl.map[m.y][m.x]}'`
        ).toBe(true);
      }
    }
  });
});

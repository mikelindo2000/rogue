import { describe, it, expect } from 'vitest';
import { FINAL_BOSS_ENCOUNTERS, HERO_ENCOUNTERS } from './encounters';
import { generateLevel, darkRoomChance, mazeRoomChance } from './map';
import { makeRng } from './rng';
import { TILE, isWalkable, STAIR_TILES } from './tiles';
import { allowedTrapKindsForFloor, trapBudgetForFloor, trapCost } from './traps';
import { SCROLLS, isScrollImplemented } from './scrolls';
import type { ScrollType } from './types';

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
    expect(a.stairsUpX).toEqual(b.stairsUpX);
    expect(a.stairsUpY).toEqual(b.stairsUpY);
    expect(a.stairsDownX).toEqual(b.stairsDownX);
    expect(a.stairsDownY).toEqual(b.stairsDownY);
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

  it('places walkable down stairs on floors 1-19 (seeds 1..30)', () => {
    for (let floor = 1; floor < 20; floor += 6) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        expect(lvl.stairsDownX).toBeGreaterThanOrEqual(0);
        expect(lvl.stairsDownY).toBeGreaterThanOrEqual(0);
        expect(lvl.map[lvl.stairsDownY][lvl.stairsDownX]).toBe(TILE.STAIRS_DOWN);
        expect(isWalkable(lvl.map[lvl.stairsDownY][lvl.stairsDownX])).toBe(true);
      }
    }
  });

  it('places walkable up stairs on floors 2-20 (seeds 1..30)', () => {
    for (let floor = 2; floor <= 20; floor += 6) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        expect(lvl.stairsUpX).toBeGreaterThanOrEqual(0);
        expect(lvl.stairsUpY).toBeGreaterThanOrEqual(0);
        expect(lvl.map[lvl.stairsUpY][lvl.stairsUpX]).toBe(TILE.STAIRS_UP);
        expect(isWalkable(lvl.map[lvl.stairsUpY][lvl.stairsUpX])).toBe(true);
      }
    }
  });

  it('places no down stairs but at least one boss on floor 20 (seeds 1..30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(20, seed);
      expect(lvl.stairsDownX).toBe(-1);
      expect(lvl.stairsDownY).toBe(-1);
      const bosses = lvl.monsters.filter(m => m.special === 'boss');
      expect(bosses.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not spawn the final Marcus encounter on floor 1', () => {
    const lvl = gen(1, 7);
    const marcus = lvl.monsters.find(m => m.name === 'Marcus the Brave');
    expect(marcus).toBeUndefined();
  });

  it('spawns Marcus the Brave on floor 20 as a boss with original stats', () => {
    const lvl = gen(20, 7);
    const marcus = lvl.monsters.find(m => m.name === 'Marcus the Brave');
    expect(marcus).toBeDefined();
    expect(marcus?.hp).toBe(900);
    expect(marcus?.atk).toBe(25);
  });

  it('spawns every configured final boss on floor 20', () => {
    const lvl = gen(20, 7);
    for (const encounter of FINAL_BOSS_ENCOUNTERS) {
      const boss = lvl.monsters.find(m => m.name === encounter.monsterName);
      expect(boss, `missing final boss ${encounter.monsterName}`).toBeDefined();
      expect(boss?.special).toBe('boss');
    }
  });

  it('places hero encounters near the down stairs instead of in the start room', () => {
    for (const encounter of HERO_ENCOUNTERS) {
      const lvl = gen(encounter.floor, 7, 20);
      const hero = lvl.monsters.find(m => m.name === encounter.monsterName);
      expect(hero, `floor ${encounter.floor}: missing ${encounter.monsterName}`).toBeDefined();
      expect(hero?.special).toBe('hero');
      expect(`${hero?.x},${hero?.y}`).not.toBe(`${lvl.playerX},${lvl.playerY}`);
      const distanceToExit = Math.abs((hero?.x ?? 0) - lvl.stairsDownX) + Math.abs((hero?.y ?? 0) - lvl.stairsDownY);
      expect(distanceToExit).toBeLessThanOrEqual(1);
    }
  });

  it('keeps hero and boss templates out of normal random spawns, including hero floors', () => {
    const specialNames = new Set([...FINAL_BOSS_ENCOUNTERS.map(e => e.monsterName), ...HERO_ENCOUNTERS.map(e => e.monsterName)]);
    for (let floor = 1; floor < 20; floor++) {
      const expectedHero = HERO_ENCOUNTERS.find(e => e.floor === floor)?.monsterName;
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed, 20);
        const specialSpawns = lvl.monsters.filter(m => specialNames.has(m.name)).map(m => m.name);
        expect(specialSpawns).toEqual(expectedHero ? [expectedHero] : []);
      }
    }
  });

  it('encloses rooms: no floor tile is orthogonally adjacent to raw void (seeds 1..30)', () => {
    const allowed = new Set<string>([
      TILE.FLOOR,
      TILE.WALL_H,
      TILE.WALL_V,
      TILE.DOOR,
      TILE.SECRET_DOOR,
      TILE.CORRIDOR,
      TILE.STAIRS_UP,
      TILE.STAIRS_DOWN,
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

  it('connects player to down stairs via walkable tiles on floors 1-19 (seeds 1..30)', () => {
    for (let floor = 1; floor < 20; floor += 6) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        const ok = reachable(lvl.map, lvl.playerX, lvl.playerY, lvl.stairsDownX, lvl.stairsDownY);
        expect(
          ok,
          `floor ${floor}, seed ${seed}: down stairs (${lvl.stairsDownX},${lvl.stairsDownY}) not reachable from player (${lvl.playerX},${lvl.playerY})`
        ).toBe(true);
      }
    }
  });

  it('does not place secret doors on the first two floors (seeds 1..30)', () => {
    for (const floor of [1, 2]) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        expect(lvl.map.flat().filter(tile => tile === TILE.SECRET_DOOR)).toHaveLength(0);
      }
    }
  });

  it('keeps down stairs reachable without discovering secrets (seeds 1..30)', () => {
    for (let floor = 3; floor < 20; floor += 4) {
      for (let seed = 1; seed <= 30; seed++) {
        const lvl = gen(floor, seed);
        expect(
          reachable(lvl.map, lvl.playerX, lvl.playerY, lvl.stairsDownX, lvl.stairsDownY),
          `floor ${floor}, seed ${seed}: down stairs require a secret door`
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

  // ---- Classic-Rogue room structure -----------------------------------------

  interface ParsedRoom {
    l: number;
    t: number;
    r: number;
    b: number;
  }

  /**
   * Recover each room rectangle from its corner glyphs: find a top-left corner,
   * walk right to the top-right and down to the bottom-left, and confirm the
   * fourth corner closes the box. Throws on any malformed rectangle so the
   * tests double as a structural sanity check on generation.
   */
  function parseRooms(map: string[][]): ParsedRoom[] {
    const rooms: ParsedRoom[] = [];
    for (let t = 0; t < map.length; t++) {
      for (let l = 0; l < map[t].length; l++) {
        if (map[t][l] !== TILE.CORNER_TL) continue;

        // A wall run may be pierced by a single `+` door, so accept doors while
        // scanning toward the next corner.
        let r = l + 1;
        while (r < map[t].length && (map[t][r] === TILE.WALL_H || map[t][r] === TILE.DOOR || map[t][r] === TILE.SECRET_DOOR)) r++;
        expect(map[t][r], `top-right corner missing for TL (${l},${t})`).toBe(TILE.CORNER_TR);

        let b = t + 1;
        while (b < map.length && (map[b][l] === TILE.WALL_V || map[b][l] === TILE.DOOR || map[b][l] === TILE.SECRET_DOOR)) b++;
        expect(map[b][l], `bottom-left corner missing for TL (${l},${t})`).toBe(TILE.CORNER_BL);

        expect(map[b][r], `bottom-right corner missing for TL (${l},${t})`).toBe(TILE.CORNER_BR);
        rooms.push({ l, t, r, b });
      }
    }
    return rooms;
  }

  function rectsOverlap(a: ParsedRoom, b: ParsedRoom): boolean {
    return a.l <= b.r && b.l <= a.r && a.t <= b.b && b.t <= a.b;
  }

  it('builds rooms with four distinct corner glyphs (seeds 1..40)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { map } = gen(4, seed);
      const rooms = parseRooms(map);
      // The 3x3 grid keeps at least four real rooms on every floor.
      expect(rooms.length, `seed ${seed}: too few rooms`).toBeGreaterThanOrEqual(4);
    }
  });

  it('never overlaps two rooms (seeds 1..40, floors 1/8/15)', () => {
    for (const floor of [1, 8, 15]) {
      for (let seed = 1; seed <= 40; seed++) {
        const rooms = parseRooms(gen(floor, seed).map);
        for (let i = 0; i < rooms.length; i++) {
          for (let j = i + 1; j < rooms.length; j++) {
            expect(
              rectsOverlap(rooms[i], rooms[j]),
              `floor ${floor}, seed ${seed}: rooms ${JSON.stringify(rooms[i])} and ${JSON.stringify(rooms[j])} overlap`
            ).toBe(false);
          }
        }
      }
    }
  });

  it('opens at most one door (hall) per room wall (seeds 1..40)', () => {
    const countDoors = (cells: string[]) => cells.filter(c => c === TILE.DOOR || c === TILE.SECRET_DOOR).length;
    for (let seed = 1; seed <= 40; seed++) {
      const { map } = gen(6, seed);
      for (const { l, t, r, b } of parseRooms(map)) {
        const top: string[] = [];
        const bottom: string[] = [];
        for (let c = l + 1; c < r; c++) {
          top.push(map[t][c]);
          bottom.push(map[b][c]);
        }
        const left: string[] = [];
        const right: string[] = [];
        for (let row = t + 1; row < b; row++) {
          left.push(map[row][l]);
          right.push(map[row][r]);
        }
        for (const [side, cells] of [['top', top], ['bottom', bottom], ['left', left], ['right', right]] as const) {
          expect(
            countDoors(cells),
            `seed ${seed}: room (${l},${t})-(${r},${b}) ${side} wall has multiple doors`
          ).toBeLessThanOrEqual(1);
          // Every non-door wall cell is a real wall glyph — never raw void.
          for (const cell of cells) {
            expect(cell === TILE.DOOR || cell === TILE.SECRET_DOOR || cell === TILE.WALL_H || cell === TILE.WALL_V).toBe(true);
          }
        }
      }
    }
  });

  it('places no traps on floors 1-3 or 20', () => {
    for (const floor of [1, 2, 3, 20]) {
      for (let seed = 1; seed <= 40; seed++) {
        expect(gen(floor, seed).traps, `floor ${floor} seed ${seed}`).toHaveLength(0);
      }
    }
  });

  it('keeps trap hazard cost within the floor budget', () => {
    for (let floor = 4; floor < 20; floor++) {
      for (let seed = 1; seed <= 40; seed++) {
        const traps = gen(floor, seed).traps;
        const cost = traps.reduce((sum, trap) => sum + trapCost(trap.kind), 0);
        expect(cost, `floor ${floor} seed ${seed}`).toBeLessThanOrEqual(trapBudgetForFloor(floor));
      }
    }
  });

  it('places traps only on safe optional room floor tiles', () => {
    for (let floor = 4; floor < 20; floor++) {
      for (let seed = 1; seed <= 40; seed++) {
        const lvl = gen(floor, seed);
        const rooms = parseRooms(lvl.map);
        const roomFor = (x: number, y: number) => rooms.find(room => x >= room.l && x <= room.r && y >= room.t && y <= room.b);
        const startRoom = roomFor(lvl.playerX, lvl.playerY);
        const stairRooms = rooms.filter(room => {
          for (let y = room.t + 1; y < room.b; y++) {
            for (let x = room.l + 1; x < room.r; x++) {
              if (STAIR_TILES.has(lvl.map[y][x])) return true;
            }
          }
          return false;
        });
        const specialRooms = rooms.filter(room => lvl.monsters.some(mon =>
          mon.special && mon.x >= room.l && mon.x <= room.r && mon.y >= room.t && mon.y <= room.b
        ));

        for (const trap of lvl.traps) {
          expect(lvl.map[trap.y][trap.x], `floor ${floor} seed ${seed} trap ${trap.id}`).toBe(TILE.FLOOR);
          expect(lvl.dark[trap.y][trap.x], `floor ${floor} seed ${seed} trap ${trap.id} in dark room`).toBe(false);
          expect(lvl.items.some(it => it.x === trap.x && it.y === trap.y)).toBe(false);
          expect(lvl.monsters.some(mon => mon.x === trap.x && mon.y === trap.y)).toBe(false);
          expect(startRoom && trap.x >= startRoom.l && trap.x <= startRoom.r && trap.y >= startRoom.t && trap.y <= startRoom.b).toBe(false);
          expect(stairRooms.some(room => trap.x >= room.l && trap.x <= room.r && trap.y >= room.t && trap.y <= room.b)).toBe(false);
          expect(specialRooms.some(room => trap.x >= room.l && trap.x <= room.r && trap.y >= room.t && trap.y <= room.b)).toBe(false);
          const passageTiles = new Set<string>([TILE.DOOR, TILE.CORRIDOR]);
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            expect(passageTiles.has(lvl.map[trap.y + dy]?.[trap.x + dx])).toBe(false);
          }
          expect(lvl.traps.filter(other => Math.max(Math.abs(other.x - trap.x), Math.abs(other.y - trap.y)) <= 1)).toHaveLength(1);
        }
      }
    }
  });

  it('does not place trapdoors on floors 18-20', () => {
    for (const floor of [18, 19, 20]) {
      for (let seed = 1; seed <= 40; seed++) {
        expect(gen(floor, seed).traps.some(trap => trap.kind === 'trapdoor')).toBe(false);
      }
    }
  });

  it('keeps first trap floor to bear traps only', () => {
    expect(allowedTrapKindsForFloor(4)).toEqual(['bear']);
  });
});

describe('dark rooms', () => {
  const anyDark = (lvl: Level) => lvl.dark.some(row => row.some(Boolean));

  it('produces no dark tiles on floors 1-2 (any seed)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(anyDark(gen(1, seed)), `floor 1 seed ${seed}`).toBe(false);
      expect(anyDark(gen(2, seed)), `floor 2 seed ${seed}`).toBe(false);
    }
  });

  it('never darkens floor 20 (the finale stays lit)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(anyDark(gen(20, seed)), `floor 20 seed ${seed}`).toBe(false);
    }
  });

  it('can produce dark rooms from floor 3 onward', () => {
    let sawDark = false;
    for (let seed = 1; seed <= 40 && !sawDark; seed++) sawDark = anyDark(gen(3, seed));
    expect(sawDark).toBe(true);
  });

  it('darkRoomChance is 0 on floors 1-2 and 20, positive and non-decreasing 3..19', () => {
    expect(darkRoomChance(1)).toBe(0);
    expect(darkRoomChance(2)).toBe(0);
    expect(darkRoomChance(20)).toBe(0);
    for (let f = 3; f < 19; f++) {
      expect(darkRoomChance(f)).toBeGreaterThan(0);
      expect(darkRoomChance(f + 1) >= darkRoomChance(f) || darkRoomChance(f + 1) === 0).toBe(true);
    }
  });

  it('never marks the player start tile dark', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const lvl = gen(8, seed);
      expect(lvl.dark[lvl.playerY][lvl.playerX], `seed ${seed}`).toBe(false);
    }
  });

  it('only marks interior floor/stair tiles dark, never walls/doors/corridors/void', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = gen(12, seed);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!lvl.dark[y][x]) continue;
          const ch = lvl.map[y][x];
          expect(ch === TILE.FLOOR || STAIR_TILES.has(ch), `seed ${seed} (${x},${y})='${ch}'`).toBe(true);
        }
      }
    }
  });

  it('returns real-room rects covering the player start', () => {
    const lvl = gen(5, 7);
    expect(lvl.rooms.length).toBeGreaterThanOrEqual(2);
    const inStart = lvl.rooms.some(
      r => lvl.playerX >= r.l && lvl.playerX <= r.r && lvl.playerY >= r.t && lvl.playerY <= r.b
    );
    expect(inStart).toBe(true);
  });

  const scrollTypesOn = (lvl: Level): ScrollType[] =>
    lvl.items.filter(it => it.type === 'scroll').map(it => (it as any).data?.scrollType as ScrollType);

  it('every spawned scroll carries an implemented catalog type (no anonymous scrolls)', () => {
    for (let floor = 1; floor <= 12; floor++) {
      for (let seed = 1; seed <= 30; seed++) {
        for (const t of scrollTypesOn(gen(floor, seed))) {
          expect(t, `floor ${floor} seed ${seed}`).toBeDefined();
          expect(isScrollImplemented(t), `floor ${floor} seed ${seed}: ${t}`).toBe(true);
        }
      }
    }
  });

  it('never spawns a scroll below its catalog min floor', () => {
    for (const floor of [1, 2, 3, 5]) {
      for (let seed = 1; seed <= 60; seed++) {
        for (const t of scrollTypesOn(gen(floor, seed))) {
          expect(SCROLLS[t].minFloor, `floor ${floor} seed ${seed}: ${t}`).toBeLessThanOrEqual(floor);
        }
      }
    }
  });

  it('can spawn a Scroll of Light from floor 1 onward', () => {
    let saw = false;
    for (let seed = 1; seed <= 200 && !saw; seed++) saw = scrollTypesOn(gen(1, seed)).includes('light');
    expect(saw).toBe(true);
  });
});

// ---- Map variety: monster scatter, room size modes, maze cells -------------
describe('less predictable monster placement', () => {
  const roomFor = (rooms: { l: number; t: number; r: number; b: number }[], x: number, y: number) =>
    rooms.find(r => x >= r.l && x <= r.r && y >= r.t && y <= r.b);

  it('does not pin every normal monster to its room top-left corner (seeds 1..40)', () => {
    let topLeft = 0;
    let offset = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const lvl = gen(8, seed, 20);
      for (const m of lvl.monsters) {
        if (m.special) continue; // encounters keep their centred placement
        const room = roomFor(lvl.rooms, m.x, m.y);
        if (!room) continue;
        if (m.x === room.l + 1 && m.y === room.t + 1) topLeft++;
        else offset++;
      }
    }
    // The old generator put 100% of normal monsters at (l+1, t+1). The scatter
    // should make the off-corner tiles the overwhelming majority.
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeGreaterThan(topLeft);
  });

  it('never scatters a normal monster onto an item, the player, or another monster (seeds 1..40)', () => {
    // Change 1 governs the random monster pool only; centred encounter spawns are
    // a separate system (and predate this change), so they are excluded here.
    for (let floor = 4; floor <= 16; floor += 4) {
      for (let seed = 1; seed <= 40; seed++) {
        const lvl = gen(floor, seed, 20);
        const occupied = new Set<string>();
        for (const m of lvl.monsters) occupied.add(`${m.x},${m.y}`);
        const normals = lvl.monsters.filter(m => !m.special);
        const seen = new Set<string>();
        for (const m of normals) {
          const key = `${m.x},${m.y}`;
          // No two normal monsters share a tile, and a normal never lands on the
          // player or an item.
          expect(seen.has(key), `floor ${floor} seed ${seed}: two normal monsters on (${key})`).toBe(false);
          seen.add(key);
          expect(key, `floor ${floor} seed ${seed}: monster on player`).not.toBe(`${lvl.playerX},${lvl.playerY}`);
          expect(
            lvl.items.some(it => it.x === m.x && it.y === m.y),
            `floor ${floor} seed ${seed}: monster shares tile with item at (${key})`
          ).toBe(false);
        }
      }
    }
  });
});

describe('room size modes', () => {
  const ROOM_MAX_IW = 11; // BALANCE.map.roomMaxW
  const ROOM_MIN_IW = 4; // BALANCE.map.roomMinW

  function parseRoomRects(map: string[][]) {
    const rects: Array<{ l: number; t: number; r: number; b: number }> = [];
    for (let t = 0; t < map.length; t++) {
      for (let l = 0; l < map[t].length; l++) {
        if (map[t][l] !== TILE.CORNER_TL) continue;
        let r = l + 1;
        while (r < map[t].length && map[t][r] !== TILE.CORNER_TR) r++;
        let b = t + 1;
        while (b < map.length && map[b][l] !== TILE.CORNER_BL) b++;
        rects.push({ l, t, r, b });
      }
    }
    return rects;
  }

  it('produces both near-minimum and near-maximum rooms across a seed sweep', () => {
    let sawLarge = false;
    let sawSmall = false;
    for (let seed = 1; seed <= 60 && !(sawLarge && sawSmall); seed++) {
      for (const { l, r } of parseRoomRects(gen(10, seed).map)) {
        const interiorW = r - l - 1;
        if (interiorW >= ROOM_MAX_IW - 1) sawLarge = true;
        if (interiorW <= ROOM_MIN_IW) sawSmall = true;
      }
    }
    expect(sawLarge, 'expected at least one near-max-width room across seeds').toBe(true);
    expect(sawSmall, 'expected at least one minimum-width room across seeds').toBe(true);
  });

  it('never exceeds the configured interior bounds (seeds 1..40, floors 3/10/17)', () => {
    for (const floor of [3, 10, 17]) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const { l, t, r, b } of parseRoomRects(gen(floor, seed).map)) {
          const interiorW = r - l - 1;
          const interiorH = b - t - 1;
          expect(interiorW, `floor ${floor} seed ${seed}`).toBeLessThanOrEqual(ROOM_MAX_IW);
          expect(interiorW, `floor ${floor} seed ${seed}`).toBeGreaterThanOrEqual(ROOM_MIN_IW);
          expect(interiorH, `floor ${floor} seed ${seed}`).toBeGreaterThanOrEqual(3);
          expect(interiorH, `floor ${floor} seed ${seed}`).toBeLessThanOrEqual(6);
        }
      }
    }
  });
});

describe('maze cells', () => {
  it('mazeRoomChance is 0 below the min floor and on floor 20, positive in between', () => {
    expect(mazeRoomChance(1)).toBe(0);
    expect(mazeRoomChance(3)).toBe(0);
    expect(mazeRoomChance(4)).toBeGreaterThan(0);
    expect(mazeRoomChance(19)).toBeGreaterThan(0);
    expect(mazeRoomChance(20)).toBe(0);
  });

  it('carves no maze on floors 1-3 or floor 20 (seeds 1..60)', () => {
    for (const floor of [1, 2, 3, 20]) {
      for (let seed = 1; seed <= 60; seed++) {
        expect(gen(floor, seed).mazeRects, `floor ${floor} seed ${seed}`).toHaveLength(0);
      }
    }
  });

  it('carves at most one maze per floor (seeds 1..60, floors 4..19)', () => {
    for (let floor = 4; floor < 20; floor++) {
      for (let seed = 1; seed <= 60; seed++) {
        expect(gen(floor, seed).mazeRects.length, `floor ${floor} seed ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does carve mazes on deeper floors across a seed sweep', () => {
    let count = 0;
    for (let floor = 4; floor < 20 && count < 5; floor++) {
      for (let seed = 1; seed <= 60 && count < 5; seed++) {
        count += gen(floor, seed).mazeRects.length;
      }
    }
    expect(count, 'expected several mazes across a deep-floor seed sweep').toBeGreaterThan(0);
  });

  it('every carved maze is corridor-filled and walkable-reachable from the player (full sweep)', () => {
    // No early-out: an earlier version of this test stopped after 10 mazes and
    // missed that a secret door could seal a maze off (~3.4% of mazes). Sweep
    // ALL mazes across floors 4..19 x seeds 1..400 so the orphan case can't hide.
    let checked = 0;
    for (let floor = 4; floor < 20; floor++) {
      for (let seed = 1; seed <= 400; seed++) {
        const lvl = gen(floor, seed);
        for (const rect of lvl.mazeRects) {
          checked++;
          // The lattice corners are always carved corridors.
          for (const [x, y] of [[rect.l, rect.t], [rect.r, rect.b]] as const) {
            expect(lvl.map[y][x], `floor ${floor} seed ${seed}: maze corner (${x},${y}) not corridor`).toBe(TILE.CORRIDOR);
          }
          // No rectangular room corner glyph lies inside a maze rect.
          for (let y = rect.t; y <= rect.b; y++) {
            for (let x = rect.l; x <= rect.r; x++) {
              const ch = lvl.map[y][x];
              expect([TILE.CORNER_TL, TILE.CORNER_TR, TILE.CORNER_BL, TILE.CORNER_BR].includes(ch as never), `floor ${floor} seed ${seed}: room corner inside maze at (${x},${y})`).toBe(false);
            }
          }
          // The maze connects into the rest of the floor by WALKING — no secret
          // search required (secret-door placement must not seal the maze off).
          expect(
            reachable(lvl.map, lvl.playerX, lvl.playerY, rect.l, rect.t),
            `floor ${floor} seed ${seed}: maze at (${rect.l},${rect.t}) unreachable from player`
          ).toBe(true);
        }
      }
    }
    expect(checked, 'expected to validate many mazes').toBeGreaterThan(50);
  });

  it('never fully orphans a real room on a maze floor (reachable with secret search)', () => {
    // A real room MAY legitimately sit behind a secret door (classic Rogue
    // optional rooms), so walkable-only reachability is not guaranteed. What must
    // always hold is that the maze never seals a room off entirely — every room
    // is reachable once secret doors are allowed.
    const reachableThroughSecrets = (map: string[][], sx: number, sy: number, tx: number, ty: number): boolean => {
      const seen = new Set<string>([`${sx},${sy}`]);
      const queue: Array<[number, number]> = [[sx, sy]];
      while (queue.length) {
        const [x, y] = queue.shift()!;
        if (x === tx && y === ty) return true;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
          const ch = map[ny][nx];
          if (!isWalkable(ch) && ch !== TILE.SECRET_DOOR) continue;
          const k = `${nx},${ny}`;
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push([nx, ny]);
        }
      }
      return false;
    };
    for (let floor = 4; floor < 20; floor++) {
      for (let seed = 1; seed <= 120; seed++) {
        const lvl = gen(floor, seed);
        if (lvl.mazeRects.length === 0) continue;
        for (const room of lvl.rooms) {
          expect(
            reachableThroughSecrets(lvl.map, lvl.playerX, lvl.playerY, room.cx, room.cy),
            `floor ${floor} seed ${seed}: room (${room.cx},${room.cy}) fully orphaned on a maze floor`
          ).toBe(true);
        }
      }
    }
  });

  it('spawns no items or monsters inside a maze region (seeds 1..80, floors 6..19)', () => {
    const inRect = (r: { l: number; t: number; r: number; b: number }, x: number, y: number) =>
      x >= r.l && x <= r.r && y >= r.t && y <= r.b;
    for (let floor = 6; floor < 20; floor++) {
      for (let seed = 1; seed <= 80; seed++) {
        const lvl = gen(floor, seed);
        if (lvl.mazeRects.length === 0) continue;
        for (const rect of lvl.mazeRects) {
          expect(lvl.items.some(it => inRect(rect, it.x, it.y)), `floor ${floor} seed ${seed}: item in maze`).toBe(false);
          expect(lvl.monsters.some(m => inRect(rect, m.x, m.y)), `floor ${floor} seed ${seed}: monster in maze`).toBe(false);
        }
      }
    }
  });
});

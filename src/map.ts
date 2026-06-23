import { Item, ItemSpawn, Monster, MonsterTemplate } from './types';
import { MONSTER_DATABASE, BALANCE } from './config';
import { encountersForFloor, type EncounterDefinition } from './encounters';
import { rollLootRarity, generateGearItem } from './items';
import { POTION_TYPES, potionVisual } from './itemVisuals';
import { TILE, isWalkable } from './tiles';
import { RNG } from './rng';
import { assert, devAssert } from './assert';

/** Flood fill over walkable tiles: is (tx,ty) reachable from (sx,sy)? */
function isReachable(
  map: string[][],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  cols: number,
  rows: number
): boolean {
  const seen = new Set<number>([sy * cols + sx]);
  const stack: [number, number][] = [[sx, sy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x === tx && y === ty) return true;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const key = ny * cols + nx;
      if (seen.has(key) || !isWalkable(map[ny][nx])) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return false;
}

/**
 * One occupant of a 3x3 grid cell. A real room records its outer-wall bounds
 * (inclusive) — the corner glyphs live at (l,t)/(r,t)/(l,b)/(r,b), edges
 * between them, floor inside. A "gone" room is a single corridor junction the
 * passages thread through, matching Rogue's gone rooms.
 */
interface Room {
  gx: number;
  gy: number;
  gone: boolean;
  /** Outer-wall bounds, inclusive (real rooms only). */
  l: number;
  t: number;
  r: number;
  b: number;
  /** A walkable anchor: room centre for real rooms, the junction for gone. */
  cx: number;
  cy: number;
}

interface DoorCandidate {
  x: number;
  y: number;
}

type Dir = 'h' | 'v';
interface Edge {
  a: number; // index of the west (h) or north (v) cell
  b: number; // index of the east (h) or south (v) cell
  dir: Dir;
}

/** Minimal union-find for building a spanning tree over grid cells. */
class DisjointSet {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/** Carve a real room's floor, edge walls, and the four distinct corner glyphs. */
function carveRoom(map: string[][], room: Room) {
  const { l, t, r, b } = room;
  for (let c = l + 1; c < r; c++) {
    map[t][c] = TILE.WALL_H;
    map[b][c] = TILE.WALL_H;
  }
  for (let row = t + 1; row < b; row++) {
    map[row][l] = TILE.WALL_V;
    map[row][r] = TILE.WALL_V;
    for (let c = l + 1; c < r; c++) {
      map[row][c] = TILE.FLOOR;
    }
  }
  map[t][l] = TILE.CORNER_TL;
  map[t][r] = TILE.CORNER_TR;
  map[b][l] = TILE.CORNER_BL;
  map[b][r] = TILE.CORNER_BR;
}

/** Lay a corridor tile, but never paint over a room's floor, wall, or door. */
function dig(map: string[][], x: number, y: number) {
  if (map[y][x] === TILE.VOID) map[y][x] = TILE.CORRIDOR;
}

function digRow(map: string[][], y: number, x1: number, x2: number) {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (let x = lo; x <= hi; x++) dig(map, x, y);
}

function digCol(map: string[][], x: number, y1: number, y2: number) {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  for (let y = lo; y <= hi; y++) dig(map, x, y);
}

/**
 * Pick where a passage pierces a room and the corridor cell just outside it.
 * Real rooms get a `+` door stamped on the chosen wall (never on a corner);
 * gone rooms hand back their junction point unchanged.
 */
function makeExit(
  map: string[][],
  room: Room,
  side: 'N' | 'S' | 'E' | 'W',
  rng: RNG
): { x: number; y: number } {
  if (room.gone) return { x: room.cx, y: room.cy };
  if (side === 'E') {
    const dy = rng.range(room.t + 1, room.b - 1);
    map[dy][room.r] = TILE.DOOR;
    return { x: room.r + 1, y: dy };
  }
  if (side === 'W') {
    const dy = rng.range(room.t + 1, room.b - 1);
    map[dy][room.l] = TILE.DOOR;
    return { x: room.l - 1, y: dy };
  }
  if (side === 'S') {
    const dx = rng.range(room.l + 1, room.r - 1);
    map[room.b][dx] = TILE.DOOR;
    return { x: dx, y: room.b + 1 };
  }
  // 'N'
  const dx = rng.range(room.l + 1, room.r - 1);
  map[room.t][dx] = TILE.DOOR;
  return { x: dx, y: room.t - 1 };
}

/** Join two grid-adjacent rooms with an L-shaped corridor between their exits. */
function connect(map: string[][], a: Room, b: Room, dir: Dir, rng: RNG) {
  if (dir === 'h') {
    const ax = makeExit(map, a, 'E', rng);
    const bx = makeExit(map, b, 'W', rng);
    const turn = rng.range(Math.min(ax.x, bx.x), Math.max(ax.x, bx.x));
    digRow(map, ax.y, ax.x, turn);
    digCol(map, turn, ax.y, bx.y);
    digRow(map, bx.y, turn, bx.x);
  } else {
    const ax = makeExit(map, a, 'S', rng);
    const bx = makeExit(map, b, 'N', rng);
    const turn = rng.range(Math.min(ax.y, bx.y), Math.max(ax.y, bx.y));
    digCol(map, ax.x, ax.y, turn);
    digRow(map, turn, ax.x, bx.x);
    digCol(map, bx.x, turn, bx.y);
  }
}

function doorTouchesRoom(door: DoorCandidate, room: Room): boolean {
  return door.x >= room.l && door.x <= room.r && door.y >= room.t && door.y <= room.b;
}

function collectSecretDoorCandidates(
  map: string[][],
  realRooms: Room[],
  protectedRooms: Room[]
): DoorCandidate[] {
  const candidates: DoorCandidate[] = [];
  for (let y = 1; y < map.length - 1; y++) {
    for (let x = 1; x < map[y].length - 1; x++) {
      if (map[y][x] !== TILE.DOOR) continue;
      if (protectedRooms.some(room => doorTouchesRoom({ x, y }, room))) continue;

      const touchesRealRoom = realRooms.some(room => doorTouchesRoom({ x, y }, room));
      if (!touchesRealRoom) continue;

      candidates.push({ x, y });
    }
  }
  return candidates;
}

function tryPlaceSecretDoors(
  map: string[][],
  realRooms: Room[],
  startRoom: Room,
  endRoom: Room,
  dungeonFloor: number,
  playerX: number,
  playerY: number,
  stairsDownX: number,
  stairsDownY: number,
  rng: RNG,
  cols: number,
  rows: number
) {
  if (dungeonFloor < 3 || dungeonFloor >= 20 || stairsDownX < 0 || stairsDownY < 0) return;

  const desired = dungeonFloor === 3 ? 1 : rng.chance(0.45) ? 1 : 0;
  if (desired === 0) return;

  const protectedRooms = [startRoom, endRoom].filter((room, index, arr) => arr.indexOf(room) === index);
  const candidates = collectSecretDoorCandidates(map, realRooms, protectedRooms);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let placed = 0;
  for (const candidate of candidates) {
    const original = map[candidate.y][candidate.x];
    map[candidate.y][candidate.x] = TILE.SECRET_DOOR;
    if (isReachable(map, playerX, playerY, stairsDownX, stairsDownY, cols, rows)) {
      placed++;
      if (placed >= desired) break;
    } else {
      map[candidate.y][candidate.x] = original;
    }
  }
}

function encounterSpawnTiles(room: Room): Array<{ x: number; y: number }> {
  const cx = room.cx;
  const cy = room.cy;
  return [
    { x: Math.min(room.r - 1, cx + 1), y: cy },
    { x: Math.max(room.l + 1, cx - 1), y: cy },
    { x: cx, y: Math.min(room.b - 1, cy + 1) },
    { x: cx, y: Math.max(room.t + 1, cy - 1) },
    { x: cx, y: cy },
  ];
}

function spawnEncounter(
  encounter: EncounterDefinition,
  room: Room,
  monsters: Monster[],
  map: string[][]
) {
  const template = MONSTER_DATABASE.find(m => m.name === encounter.monsterName);
  if (!template) return;

  const tile = encounterSpawnTiles(room).find(candidate =>
    isWalkable(map[candidate.y]?.[candidate.x]) &&
    !monsters.some(m => m.x === candidate.x && m.y === candidate.y)
  );
  if (!tile) return;

  monsters.push({
    ...template,
    special: encounter.role,
    x: tile.x,
    y: tile.y,
    frozenTurns: 0,
  });
}

function roomForEncounter(encounter: EncounterDefinition, endRoom: Room): Room {
  switch (encounter.placement) {
    case 'endRoom':
    case 'finalRoom':
      return endRoom;
    default: {
      // Exhaustiveness guard: a new placement value must declare where it spawns
      // here. Without this, an unhandled case fell through to `undefined` and
      // crashed later in spawnEncounter's `encounterSpawnTiles(room)` deref.
      const _exhaustive: never = encounter.placement;
      throw new Error(`Unhandled encounter placement: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Pick a random regular monster appropriate for `floor`, original-Rogue style:
 * depth-banded (a monster is eligible from its `minFloor` to `spawnDepthBand`
 * floors deeper, so shallow monsters phase out) and weighted toward the current
 * depth (a floor-native monster is the most common; the oldest still-eligible
 * one is the rarest). Bosses and `hero` elites are excluded — the encounter
 * system places those, not the random pool. Returns null only if the pool is
 * empty (never happens in practice: floor 1 always has Orc/Bat).
 */
function pickDepthMonster(floor: number, rng: RNG): MonsterTemplate | null {
  const floorFrom = floor - BALANCE.monster.spawnDepthBand;
  const pool = MONSTER_DATABASE.filter(
    (m) => m.special === undefined && m.minFloor <= floor && m.minFloor >= floorFrom,
  );
  if (pool.length === 0) return null;

  const weightOf = (m: MonsterTemplate) => m.minFloor - floorFrom + 1; // 1..band+1
  const total = pool.reduce((s, m) => s + weightOf(m), 0);
  let r = rng.next() * total;
  for (const m of pool) {
    r -= weightOf(m);
    if (r < 0) return m;
  }
  return pool[pool.length - 1];
}

export function generateLevel(
  dungeonFloor: number,
  // Kept for signature stability; monster variety is now gated on dungeon depth
  // (see pickDepthMonster), not player level.
  _playerLevel: number,
  cols: number,
  rows: number,
  rng: RNG
): {
  map: string[][];
  playerX: number;
  playerY: number;
  monsters: Monster[];
  items: Item[];
  stairsUpX: number;
  stairsUpY: number;
  stairsDownX: number;
  stairsDownY: number;
} {
  const map: string[][] = new Array(rows).fill(0).map(() => new Array(cols).fill(TILE.VOID));
  const monsters: Monster[] = [];
  const items: Item[] = [];

  const { map: M } = BALANCE;
  const GCOLS = M.gridCols;
  const GROWS = M.gridRows;
  const cellCount = GCOLS * GROWS;

  // Boundaries that tile the whole board into GCOLS x GROWS cells. The trailing
  // cell absorbs any remainder so no column or row is left uncovered.
  const colEdges = Array.from({ length: GCOLS + 1 }, (_, i) =>
    i === GCOLS ? cols : i * Math.floor(cols / GCOLS)
  );
  const rowEdges = Array.from({ length: GROWS + 1 }, (_, i) =>
    i === GROWS ? rows : i * Math.floor(rows / GROWS)
  );

  // Each cell must hold its smallest possible room plus a one-tile gutter on
  // every side; surface a bad BALANCE/grid combo here, not as a carving glitch.
  const minCellW = Math.min(...Array.from({ length: GCOLS }, (_, i) => colEdges[i + 1] - colEdges[i]));
  const minCellH = Math.min(...Array.from({ length: GROWS }, (_, i) => rowEdges[i + 1] - rowEdges[i]));
  assert(
    minCellW - 2 >= M.roomMinW + 2 && minCellH - 2 >= M.roomMinH + 2,
    `grid cell ${minCellW}x${minCellH} too small for min room ${M.roomMinW}x${M.roomMinH}`
  );

  // Boss floors stay fully roomed so the finale never hides behind gone cells.
  const goneChance = dungeonFloor === 20 ? 0 : M.goneRoomChance;
  const maxGone = Math.max(0, cellCount - 4);

  const rooms: (Room | null)[] = new Array(cellCount).fill(null);
  let goneSoFar = 0;
  for (let gy = 0; gy < GROWS; gy++) {
    for (let gx = 0; gx < GCOLS; gx++) {
      const idx = gy * GCOLS + gx;
      // Placement region: cell bounds pulled in one tile so neighbouring rooms
      // never touch and passages always have a gutter to run through.
      const rxa = colEdges[gx] + 1;
      const rxb = colEdges[gx + 1] - 2;
      const rya = rowEdges[gy] + 1;
      const ryb = rowEdges[gy + 1] - 2;
      const regionW = rxb - rxa + 1;
      const regionH = ryb - rya + 1;

      if (goneSoFar < maxGone && rng.chance(goneChance)) {
        goneSoFar++;
        const px = rng.range(rxa + 1, rxb - 1);
        const py = rng.range(rya + 1, ryb - 1);
        map[py][px] = TILE.CORRIDOR;
        rooms[idx] = { gx, gy, gone: true, l: px, t: py, r: px, b: py, cx: px, cy: py };
        continue;
      }

      // Interior (floor) dimensions, capped to the region after walls.
      const maxIW = Math.min(M.roomMaxW, regionW - 2);
      const maxIH = Math.min(M.roomMaxH, regionH - 2);
      const iw = rng.range(M.roomMinW, maxIW);
      const ih = rng.range(M.roomMinH, maxIH);
      const ow = iw + 2;
      const oh = ih + 2;
      const l = rng.range(rxa, rxb - ow + 1);
      const t = rng.range(rya, ryb - oh + 1);
      const r = l + ow - 1;
      const b = t + oh - 1;
      const room: Room = {
        gx,
        gy,
        gone: false,
        l,
        t,
        r,
        b,
        cx: Math.floor((l + r) / 2),
        cy: Math.floor((t + b) / 2),
      };
      carveRoom(map, room);
      rooms[idx] = room;
    }
  }

  // Build the adjacency graph, then a randomized spanning tree (every cell
  // reachable) plus a sprinkle of extra loops — the classic Rogue connectivity.
  const edges: Edge[] = [];
  for (let gy = 0; gy < GROWS; gy++) {
    for (let gx = 0; gx < GCOLS; gx++) {
      const idx = gy * GCOLS + gx;
      if (gx + 1 < GCOLS) edges.push({ a: idx, b: idx + 1, dir: 'h' });
      if (gy + 1 < GROWS) edges.push({ a: idx, b: idx + GCOLS, dir: 'v' });
    }
  }
  // Fisher–Yates over the edge list so the spanning tree shape varies by seed.
  for (let i = edges.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }

  const dsu = new DisjointSet(cellCount);
  const used: Edge[] = [];
  for (const e of edges) {
    if (dsu.union(e.a, e.b)) used.push(e);
  }
  for (const e of edges) {
    if (used.includes(e)) continue;
    if (rng.chance(M.extraConnChance)) used.push(e);
  }
  for (const e of used) {
    connect(map, rooms[e.a]!, rooms[e.b]!, e.dir, rng);
  }

  // Player and stairs always land in real rooms, kept far apart by taking the
  // first and last real cell in reading order.
  const realRooms = rooms.filter((rm): rm is Room => rm !== null && !rm.gone);
  assert(realRooms.length >= 2, `floor ${dungeonFloor}: need >=2 real rooms, got ${realRooms.length}`);

  const startRoom = realRooms[0];
  const endRoom = realRooms[realRooms.length - 1];
  const playerX = startRoom.cx;
  const playerY = startRoom.cy;
  assert(isWalkable(map[playerY]?.[playerX]), `player start (${playerX},${playerY}) not walkable on floor ${dungeonFloor}`);

  let stairsUpX = -1;
  let stairsUpY = -1;
  let stairsDownX = -1;
  let stairsDownY = -1;
  if (dungeonFloor > 1) {
    stairsUpX = startRoom.cx;
    stairsUpY = startRoom.cy;
    map[stairsUpY][stairsUpX] = TILE.STAIRS_UP;
    assert(isWalkable(map[stairsUpY][stairsUpX]), `up stairs (${stairsUpX},${stairsUpY}) not walkable on floor ${dungeonFloor}`);
  }
  if (dungeonFloor < 20) {
    stairsDownX = endRoom.cx;
    stairsDownY = endRoom.cy;
    map[stairsDownY][stairsDownX] = TILE.STAIRS_DOWN;
    assert(isWalkable(map[stairsDownY][stairsDownX]), `down stairs (${stairsDownX},${stairsDownY}) not walkable on floor ${dungeonFloor}`);
    devAssert(
      () => isReachable(map, playerX, playerY, stairsDownX, stairsDownY, cols, rows),
      `down stairs unreachable from start on floor ${dungeonFloor} (seed ${rng.seed})`
    );
  }

  tryPlaceSecretDoors(
    map,
    realRooms,
    startRoom,
    endRoom,
    dungeonFloor,
    playerX,
    playerY,
    stairsDownX,
    stairsDownY,
    rng,
    cols,
    rows
  );

  for (const encounter of encountersForFloor(dungeonFloor)) {
    const encounterRoom = roomForEncounter(encounter, endRoom);
    spawnEncounter(encounter, encounterRoom, monsters, map);
  }

  if (dungeonFloor !== 20) {
    // Normal floor item and monster spawns. Every real room except the player's
    // start is fair game; spawns land on interior floor only.
    const spawn = BALANCE.map.spawn;
    const spawnAt = (room: Room, item: ItemSpawn) => {
      const rx = rng.range(room.l + 1, room.r - 1);
      const ry = rng.range(room.t + 1, room.b - 1);
      if (!items.some(it => it.x === rx && it.y === ry)) {
        items.push({ ...item, x: rx, y: ry } as Item);
      }
    };

    for (const room of realRooms) {
      if (room === startRoom) continue;

      // Spawn food
      if (rng.chance(spawn.foodChance)) {
        spawnAt(room, { type: 'food', symbol: '%', color: '#ff9900' });
      }

      // Spawn miscellaneous consumables
      if (rng.chance(spawn.consumableChance)) {
        const rand = rng.next();
        if (rand < spawn.goldCut) {
          spawnAt(room, { type: 'gold', symbol: '$', color: '#ffff55' });
        } else if (rand < spawn.potionCut) {
          const chosenP = rng.pick(POTION_TYPES);
          spawnAt(room, {
            type: 'potion',
            symbol: '!',
            color: potionVisual(chosenP).mapColor,
            data: { potionType: chosenP },
          });
        } else if (rand < spawn.scrollCut) {
          spawnAt(room, { type: 'scroll', symbol: '?', color: '#cc66ff' });
        } else {
          spawnAt(room, { type: 'repair_scroll', symbol: '?', color: '#ff00ff' });
        }
      }

      // Spawn gear
      if (rng.chance(spawn.gearChance)) {
        const rarity = rollLootRarity(dungeonFloor, rng);
        const gear = generateGearItem(dungeonFloor, rarity, rng);
        if (gear) {
          const cat = gear.category;
          const isWeapon = cat.includes('sword') || cat.includes('mace') || cat === 'dagger' || cat === 'staff';
          spawnAt(room, { type: 'gear', symbol: isWeapon ? ')' : '[', color: gear.color || '#ffffff', data: gear });
        }
      }

      // Spawn monsters. Variety is gated on dungeon DEPTH, not player level —
      // a monster joins the pool at its `minFloor` and ages out `spawnDepthBand`
      // floors later, weighted toward the current depth so floor-appropriate
      // monsters dominate and each floor feels distinct (original-Rogue style).
      if (rng.chance(spawn.monsterChance)) {
        const tmpl = pickDepthMonster(dungeonFloor, rng);
        if (tmpl) {
          const mx = room.l + 1;
          const my = room.t + 1;
          // Avoid spawning directly on top of another monster
          if (!monsters.some(m => m.x === mx && m.y === my)) {
            monsters.push({ ...tmpl, x: mx, y: my, frozenTurns: 0 });
          }
        }
      }
    }
  }

  return {
    map,
    playerX,
    playerY,
    monsters,
    items,
    stairsUpX,
    stairsUpY,
    stairsDownX,
    stairsDownY
  };
}

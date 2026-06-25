import { Item, ItemSpawn, Monster, MonsterTemplate, TrapState } from './types';
import { MONSTER_DATABASE, BALANCE } from './config';
import { encountersForFloor, type EncounterDefinition } from './encounters';
import { rollLootRarity, generateGearItem } from './items';
import { pickWandForFloor } from './wands';
import { pickScrollForFloor } from './scrolls';
import { POTION_TYPES, potionVisual, scrollVisual, wandVisual } from './itemVisuals';
import { TILE, isWalkable, STAIR_TILES } from './tiles';
import { RNG } from './rng';
import { assert, devAssert } from './assert';
import { placeTraps } from './traps';

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
  /**
   * A maze cell: the cell is filled with a connected lattice of corridors
   * instead of a rectangular room. Like a gone cell it is not a "real" room
   * (no player/stairs/items/monsters spawn in it), but it threads passages and
   * participates in the connectivity graph. For maze rooms l/t/r/b are the
   * lattice bounding box (corridor extents), not wall bounds.
   */
  maze?: boolean;
  /** Outer-wall bounds, inclusive (real rooms only). */
  l: number;
  t: number;
  r: number;
  b: number;
  /** A walkable anchor: room centre for real rooms, the junction for gone. */
  cx: number;
  cy: number;
}

/** Public, serialization-free room bounds surfaced to the engine (E1). Real
 *  rooms only; `cx/cy` is the walkable centre. Generation builds the full `Room`
 *  internally — this is the slice runtime code is allowed to see. */
export interface RoomRect {
  l: number;
  t: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}

export type MazeContentSiteKind = 'deadEnd' | 'branch' | 'deepPath';

export interface MazeContentSite {
  x: number;
  y: number;
  kind: MazeContentSiteKind;
  distanceFromEntry: number;
  degree: number;
}

export interface MazeContentSiteOptions {
  items?: ReadonlyArray<Pick<Item, 'x' | 'y'>>;
  monsters?: ReadonlyArray<Pick<Monster, 'x' | 'y'>>;
  blockedPositions?: ReadonlyArray<{ x: number; y: number }>;
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

const ORTHOGONAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const posKey = (x: number, y: number) => `${x},${y}`;

function isReachableAvoiding(
  map: string[][],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  cols: number,
  rows: number,
  blocked: ReadonlySet<string>
): boolean {
  if (blocked.has(posKey(sx, sy)) || blocked.has(posKey(tx, ty))) return false;
  const seen = new Set<number>([sy * cols + sx]);
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x === tx && y === ty) return true;
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (blocked.has(posKey(nx, ny))) continue;
      const seenKey = ny * cols + nx;
      if (seen.has(seenKey) || !isWalkable(map[ny][nx])) continue;
      seen.add(seenKey);
      stack.push([nx, ny]);
    }
  }
  return false;
}

const inRect = (rect: RoomRect, x: number, y: number) =>
  x >= rect.l && x <= rect.r && y >= rect.t && y <= rect.b;

const isRectBoundary = (rect: RoomRect, x: number, y: number) =>
  x === rect.l || x === rect.r || y === rect.t || y === rect.b;

const isMazeCorridor = (map: string[][], rect: RoomRect, x: number, y: number) =>
  inRect(rect, x, y) && map[y]?.[x] === TILE.CORRIDOR;

function mazeEntryTiles(map: string[][], rect: RoomRect): Array<{ x: number; y: number }> {
  const entries: Array<{ x: number; y: number }> = [];
  for (let y = rect.t; y <= rect.b; y++) {
    for (let x = rect.l; x <= rect.r; x++) {
      if (!isMazeCorridor(map, rect, x, y) || !isRectBoundary(rect, x, y)) continue;
      const hasOutsideCorridor = ORTHOGONAL_DIRS.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return !inRect(rect, nx, ny) && map[ny]?.[nx] === TILE.CORRIDOR;
      });
      if (hasOutsideCorridor) entries.push({ x, y });
    }
  }
  return entries;
}

function mazeDistancesFrom(
  map: string[][],
  rect: RoomRect,
  start: { x: number; y: number },
  blocked: ReadonlySet<string> = new Set()
): Map<string, number> {
  const distances = new Map<string, number>();
  if (!isMazeCorridor(map, rect, start.x, start.y) || blocked.has(posKey(start.x, start.y))) return distances;
  const queue = [start];
  distances.set(posKey(start.x, start.y), 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextDistance = distances.get(posKey(current.x, current.y))! + 1;
    for (const [dx, dy] of ORTHOGONAL_DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nextKey = posKey(nx, ny);
      if (distances.has(nextKey) || blocked.has(nextKey) || !isMazeCorridor(map, rect, nx, ny)) continue;
      distances.set(nextKey, nextDistance);
      queue.push({ x: nx, y: ny });
    }
  }
  return distances;
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

/**
 * Carve a connected maze of corridor tiles inside a cell region, returning the
 * lattice bounding box (the extreme corridor cells). Corridors sit on an even
 * lattice (rxa, rxa+2, …); the void between them is the maze's walls — exactly
 * how the rest of the map already separates corridors from rock, so no new tile
 * is needed. A randomized depth-first backtracker visits every lattice cell, so
 * the maze is a single connected component and every boundary lattice cell is a
 * corridor (which makeExit relies on to hand neighbours a valid junction).
 */
function carveMaze(
  map: string[][],
  rxa: number,
  rya: number,
  rxb: number,
  ryb: number,
  rng: RNG
): { l: number; t: number; r: number; b: number } {
  // Lattice extents: largest even offset from the origin that fits the region.
  const cols = Math.floor((rxb - rxa) / 2) + 1;
  const rowsN = Math.floor((ryb - rya) / 2) + 1;
  const lastCol = rxa + (cols - 1) * 2;
  const lastRow = rya + (rowsN - 1) * 2;

  const visited = new Set<number>();
  const key = (cx: number, cy: number) => cy * cols + cx;
  // Iterative DFS over lattice coordinates (cx,cy), mapping to map tiles
  // (rxa+2*cx, rya+2*cy). Carve the cell, then a random unvisited neighbour,
  // knocking out the wall tile between them.
  const stack: Array<{ cx: number; cy: number }> = [{ cx: 0, cy: 0 }];
  visited.add(key(0, 0));
  map[rya][rxa] = TILE.CORRIDOR;
  while (stack.length) {
    const { cx, cy } = stack[stack.length - 1];
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    // Fisher–Yates the four directions so the maze shape varies by seed.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let advanced = false;
    for (const { dx, dy } of dirs) {
      const ncx = cx + dx;
      const ncy = cy + dy;
      if (ncx < 0 || ncy < 0 || ncx >= cols || ncy >= rowsN) continue;
      if (visited.has(key(ncx, ncy))) continue;
      visited.add(key(ncx, ncy));
      // Knock out the wall tile between this cell and the neighbour, then the
      // neighbour itself.
      map[rya + cy * 2 + dy][rxa + cx * 2 + dx] = TILE.CORRIDOR;
      map[rya + ncy * 2][rxa + ncx * 2] = TILE.CORRIDOR;
      stack.push({ cx: ncx, cy: ncy });
      advanced = true;
      break;
    }
    if (!advanced) stack.pop();
  }

  return { l: rxa, t: rya, r: lastCol, b: lastRow };
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
  if (room.maze) {
    // Hand back a boundary lattice corridor on the requested side. Every lattice
    // cell is a carved corridor and the maze is one connected component, so a
    // passage joined here reaches the whole maze. No door is stamped — the maze
    // has corridor walls (void), not room walls.
    const latticeRow = (y: number) => {
      const steps = Math.max(0, Math.min((room.b - room.t) / 2, Math.round((y - room.t) / 2)));
      return room.t + steps * 2;
    };
    const latticeCol = (x: number) => {
      const steps = Math.max(0, Math.min((room.r - room.l) / 2, Math.round((x - room.l) / 2)));
      return room.l + steps * 2;
    };
    if (side === 'E') return { x: room.r, y: latticeRow(room.cy) };
    if (side === 'W') return { x: room.l, y: latticeRow(room.cy) };
    if (side === 'S') return { x: latticeCol(room.cx), y: room.b };
    return { x: latticeCol(room.cx), y: room.t }; // 'N'
  }
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
  rows: number,
  // Extra tiles that must stay reachable without searching. Maze cells link to
  // the floor through a neighbouring real room's door, which is a legitimate
  // secret-door candidate; sealing that door would orphan the maze (it holds no
  // mandatory progression, but the design promises maze contents are reachable
  // by walking, not only by searching). Each anchor is a known-walkable tile.
  mustReach: Array<{ x: number; y: number }> = []
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
    const keepsReachable =
      isReachable(map, playerX, playerY, stairsDownX, stairsDownY, cols, rows) &&
      mustReach.every(t => isReachable(map, playerX, playerY, t.x, t.y, cols, rows));
    if (keepsReachable) {
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

/**
 * Per-room chance of being dark on `floor`. Zero on floors 1-2 (teach the game
 * with everything lit) and floor 20 (the boss finale stays lit); otherwise it
 * climbs with depth, capped. See design/implemented/dark_rooms_and_light_plan.md.
 */
export function darkRoomChance(floor: number): number {
  const M = BALANCE.map;
  if (floor < 3 || floor >= 20) return 0;
  return Math.min(M.darkRoomMaxChance, M.darkRoomBase + (floor - 3) * M.darkRoomFloorScale);
}

/**
 * Per-cell chance the floor's one allowed maze cell lands here. Zero below
 * `mazeRoomMinFloor` and on floor 20 (the finale stays a clean roomed arena);
 * otherwise a flat chance — at most one maze is carved per floor regardless, so
 * the maze stays a rare structural surprise rather than a recurring motif.
 */
export function mazeRoomChance(floor: number): number {
  const M = BALANCE.map;
  if (floor < M.mazeRoomMinFloor || floor >= 20) return 0;
  return M.mazeRoomChance;
}

export function collectMazeContentSites(
  map: string[][],
  mazeRects: ReadonlyArray<RoomRect>,
  options: MazeContentSiteOptions = {}
): MazeContentSite[] {
  const sites: MazeContentSite[] = [];
  const blocked = new Set<string>();
  for (const position of [
    ...(options.items ?? []),
    ...(options.monsters ?? []),
    ...(options.blockedPositions ?? []),
  ]) {
    blocked.add(posKey(position.x, position.y));
  }

  const isForbiddenNeighbour = (x: number, y: number) =>
    map[y]?.[x] === TILE.DOOR ||
    map[y]?.[x] === TILE.SECRET_DOOR ||
    STAIR_TILES.has(map[y]?.[x]) ||
    blocked.has(posKey(x, y));
  const isExcludedByAdjacency = (x: number, y: number) => {
    if (blocked.has(posKey(x, y))) return true;
    return ORTHOGONAL_DIRS.some(([dx, dy]) => isForbiddenNeighbour(x + dx, y + dy));
  };

  for (const rect of mazeRects) {
    const entries = mazeEntryTiles(map, rect);
    if (entries.length === 0) continue;

    const distance = new Map<string, number>();
    const queue = [...entries];
    for (const entry of entries) distance.set(posKey(entry.x, entry.y), 0);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextDistance = distance.get(posKey(current.x, current.y))! + 1;
      for (const [dx, dy] of ORTHOGONAL_DIRS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nextKey = posKey(nx, ny);
        if (distance.has(nextKey) || !isMazeCorridor(map, rect, nx, ny)) continue;
        distance.set(nextKey, nextDistance);
        queue.push({ x: nx, y: ny });
      }
    }

    for (let y = rect.t; y <= rect.b; y++) {
      for (let x = rect.l; x <= rect.r; x++) {
        if (!isMazeCorridor(map, rect, x, y) || isRectBoundary(rect, x, y)) continue;
        const distanceFromEntry = distance.get(posKey(x, y));
        if (distanceFromEntry === undefined || distanceFromEntry <= 1) continue;
        if (isExcludedByAdjacency(x, y)) continue;

        const degree = ORTHOGONAL_DIRS.filter(([dx, dy]) => isWalkable(map[y + dy]?.[x + dx])).length;
        const kind: MazeContentSiteKind = degree <= 1 ? 'deadEnd' : degree >= 3 ? 'branch' : 'deepPath';
        sites.push({ x, y, kind, distanceFromEntry, degree });
      }
    }
  }

  return sites;
}

function makeScrollSpawn(floor: number, rng: RNG): ItemSpawn {
  const scrollType = pickScrollForFloor(floor, rng);
  return {
    type: 'scroll',
    symbol: '?',
    color: scrollVisual(scrollType).mapColor,
    data: { scrollType },
  };
}

function makePotionSpawn(rng: RNG): ItemSpawn {
  const chosenP = rng.pick(POTION_TYPES);
  return {
    type: 'potion',
    symbol: '!',
    color: potionVisual(chosenP).mapColor,
    data: { potionType: chosenP },
  };
}

function makeWandSpawn(floor: number, rng: RNG): ItemSpawn {
  const wand = pickWandForFloor(floor, rng);
  return {
    type: 'wand',
    symbol: '/',
    color: wandVisual(wand.wandType).mapColor,
    data: wand,
  };
}

function makeGearSpawn(floor: number, rng: RNG): ItemSpawn | null {
  const rarity = rollLootRarity(floor, rng);
  const gear = generateGearItem(floor, rarity, rng);
  if (!gear) return null;
  const cat = gear.category;
  const isWeapon = cat.includes('sword') || cat.includes('mace') || cat === 'dagger' || cat === 'staff';
  return { type: 'gear', symbol: isWeapon ? ')' : '[', color: gear.color || '#ffffff', data: gear };
}

function makeMazeCacheSpawn(floor: number, rng: RNG): ItemSpawn {
  const cache = BALANCE.map.mazeContent;
  const roll = rng.next();
  if (roll < cache.cacheGoldCut) return { type: 'gold', symbol: '$', color: '#ffff55' };
  if (roll < cache.cachePotionScrollCut) {
    return rng.chance(cache.potionChance) ? makePotionSpawn(rng) : makeScrollSpawn(floor, rng);
  }
  if (roll < cache.cacheFoodCut) return { type: 'food', symbol: '%', color: '#ff9900' };
  if (roll < cache.cacheWandCut) {
    return floor >= BALANCE.wands.spawnMinFloor ? makeWandSpawn(floor, rng) : makeScrollSpawn(floor, rng);
  }
  return makeGearSpawn(floor, rng) ?? makeScrollSpawn(floor, rng);
}

function selectMazeCacheSite(sites: ReadonlyArray<MazeContentSite>): MazeContentSite | null {
  const deepest = (candidates: MazeContentSite[]) =>
    candidates.sort((a, b) => b.distanceFromEntry - a.distanceFromEntry || b.degree - a.degree)[0] ?? null;
  return (
    deepest(sites.filter(site => site.kind === 'deadEnd')) ??
    deepest(sites.filter(site => site.kind === 'branch')) ??
    deepest([...sites])
  );
}

function spawnMazeCaches(
  map: string[][],
  mazeRects: ReadonlyArray<RoomRect>,
  dungeonFloor: number,
  items: Item[],
  monsters: Monster[],
  blockedPositions: ReadonlyArray<{ x: number; y: number }>,
  rng: RNG
): void {
  const cache = BALANCE.map.mazeContent;
  if (dungeonFloor < cache.cacheMinFloor || dungeonFloor >= 20) return;

  for (const rect of mazeRects) {
    if (!rng.chance(cache.cacheChance)) continue;
    const site = selectMazeCacheSite(collectMazeContentSites(map, [rect], {
      items,
      monsters,
      blockedPositions,
    }));
    if (!site) continue;
    items.push({ ...makeMazeCacheSpawn(dungeonFloor, rng), x: site.x, y: site.y } as Item);
  }
}

function isOnMazeEntryShortestPath(
  map: string[][],
  rect: RoomRect,
  site: MazeContentSite,
  entries: ReadonlyArray<{ x: number; y: number }>
): boolean {
  if (entries.length < 2) return false;
  const distances = entries.map(entry => mazeDistancesFrom(map, rect, entry));
  const siteKey = posKey(site.x, site.y);
  for (let a = 0; a < entries.length; a++) {
    const throughA = distances[a].get(siteKey);
    if (throughA === undefined) continue;
    for (let b = a + 1; b < entries.length; b++) {
      const shortest = distances[a].get(posKey(entries[b].x, entries[b].y));
      const throughB = distances[b].get(siteKey);
      if (shortest !== undefined && throughB !== undefined && throughA + throughB === shortest) {
        return true;
      }
    }
  }
  return false;
}

function blocksMazeEntryConnectivity(
  map: string[][],
  rect: RoomRect,
  site: MazeContentSite,
  entries: ReadonlyArray<{ x: number; y: number }>
): boolean {
  if (entries.length < 2) return false;
  const blocked = new Set([posKey(site.x, site.y)]);
  const reachableEntries = mazeDistancesFrom(map, rect, entries[0], blocked);
  return entries.some(entry => !reachableEntries.has(posKey(entry.x, entry.y)));
}

function selectMazeMonsterSite(
  map: string[][],
  rect: RoomRect,
  sites: ReadonlyArray<MazeContentSite>,
  items: ReadonlyArray<Item>,
  playerX: number,
  playerY: number,
  stairsDownX: number,
  stairsDownY: number,
  cols: number,
  rows: number
): MazeContentSite | null {
  const entries = mazeEntryTiles(map, rect);
  const cache = items.find(item => inRect(rect, item.x, item.y)) ?? null;
  const distanceFromCache = cache ? mazeDistancesFrom(map, rect, cache) : null;
  const safeSites = sites.filter(site => {
    if (site.kind !== 'branch' && site.kind !== 'deepPath') return false;
    if (cache && site.x === cache.x && site.y === cache.y) return false;
    if (isOnMazeEntryShortestPath(map, rect, site, entries)) return false;
    if (blocksMazeEntryConnectivity(map, rect, site, entries)) return false;
    if (stairsDownX >= 0 && stairsDownY >= 0) {
      const blocked = new Set([posKey(site.x, site.y)]);
      if (!isReachableAvoiding(map, playerX, playerY, stairsDownX, stairsDownY, cols, rows, blocked)) return false;
    }
    return true;
  });
  if (safeSites.length === 0) return null;

  const cacheNear = distanceFromCache
    ? safeSites.filter(site => {
      const distance = distanceFromCache.get(posKey(site.x, site.y));
      return distance !== undefined && distance >= 2 && distance <= 4;
    })
    : [];
  const candidates = cacheNear.length > 0 ? cacheNear : safeSites;
  return [...candidates].sort((a, b) => {
    const aCacheDistance = distanceFromCache?.get(posKey(a.x, a.y)) ?? Number.POSITIVE_INFINITY;
    const bCacheDistance = distanceFromCache?.get(posKey(b.x, b.y)) ?? Number.POSITIVE_INFINITY;
    const aCacheScore = aCacheDistance >= 2 && aCacheDistance <= 4 ? 0 : Math.abs(aCacheDistance - 3);
    const bCacheScore = bCacheDistance >= 2 && bCacheDistance <= 4 ? 0 : Math.abs(bCacheDistance - 3);
    return (
      aCacheScore - bCacheScore ||
      (a.kind === 'branch' ? 0 : 1) - (b.kind === 'branch' ? 0 : 1) ||
      b.distanceFromEntry - a.distanceFromEntry ||
      b.degree - a.degree
    );
  })[0] ?? null;
}

function spawnMazeDenizens(
  map: string[][],
  mazeRects: ReadonlyArray<RoomRect>,
  dungeonFloor: number,
  items: Item[],
  monsters: Monster[],
  blockedPositions: ReadonlyArray<{ x: number; y: number }>,
  playerX: number,
  playerY: number,
  stairsDownX: number,
  stairsDownY: number,
  cols: number,
  rows: number,
  rng: RNG
): void {
  const content = BALANCE.map.mazeContent;
  if (dungeonFloor < content.mazeMonsterMinFloor || dungeonFloor >= 20) return;

  for (const rect of mazeRects) {
    if (!rng.chance(content.mazeMonsterChance)) continue;
    const tmpl = pickDepthMonster(dungeonFloor, rng);
    if (!tmpl) continue;
    const site = selectMazeMonsterSite(
      map,
      rect,
      collectMazeContentSites(map, [rect], { items, monsters, blockedPositions }),
      items,
      playerX,
      playerY,
      stairsDownX,
      stairsDownY,
      cols,
      rows
    );
    if (!site) continue;
    monsters.push({ ...tmpl, x: site.x, y: site.y, frozenTurns: 0 });
  }
}

export function generateLevel(
  dungeonFloor: number,
  // Kept for signature stability; monster variety is now gated on dungeon depth
  // (see pickDepthMonster), not player level.
  _playerLevel: number,
  cols: number,
  rows: number,
  rng: RNG,
  opts: {
    trapdoorAllowed?: boolean;
    // Board-size overrides (see boards.ts). Default to the classic BALANCE.map
    // values, so existing callers/tests are unaffected.
    gridCols?: number;
    gridRows?: number;
    roomMaxW?: number;
    roomMaxH?: number;
  } = {}
): {
  map: string[][];
  dark: boolean[][];
  rooms: RoomRect[];
  playerX: number;
  playerY: number;
  monsters: Monster[];
  items: Item[];
  traps: TrapState[];
  stairsUpX: number;
  stairsUpY: number;
  stairsDownX: number;
  stairsDownY: number;
  /**
   * Serialization-free generation debug: the lattice bounding box of each maze
   * cell carved this floor (0 or 1 in v1). The engine ignores this; it exists so
   * tests can assert maze structure without re-deriving it from raw tiles.
   */
  mazeRects: RoomRect[];
} {
  const map: string[][] = new Array(rows).fill(0).map(() => new Array(cols).fill(TILE.VOID));
  // Parallel to the engine's explored/visible grids: true on a dark room's
  // interior tiles (floor + stairs). Filled after stairs are placed, below.
  const dark: boolean[][] = new Array(rows).fill(0).map(() => new Array(cols).fill(false));
  const monsters: Monster[] = [];
  const items: Item[] = [];

  const { map: M } = BALANCE;
  const GCOLS = opts.gridCols ?? M.gridCols;
  const GROWS = opts.gridRows ?? M.gridRows;
  const roomMaxW = opts.roomMaxW ?? M.roomMaxW;
  const roomMaxH = opts.roomMaxH ?? M.roomMaxH;
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
  // Gone cells AND the (at most one) maze cell both draw from this budget, so
  // the floor always keeps at least four real rooms — the safety floor the
  // start/stairs/encounter systems assume.
  const maxGone = Math.max(0, cellCount - 4);
  const mChance = mazeRoomChance(dungeonFloor);

  const rooms: (Room | null)[] = new Array(cellCount).fill(null);
  let goneSoFar = 0;
  let mazeCarved = false;
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

      // At most one maze cell per floor, drawn from the same non-room budget so
      // real-room count stays safe. Needs at least a 3x3 lattice to be a maze.
      if (
        !mazeCarved &&
        goneSoFar < maxGone &&
        regionW >= 3 &&
        regionH >= 3 &&
        rng.chance(mChance)
      ) {
        goneSoFar++;
        mazeCarved = true;
        const box = carveMaze(map, rxa, rya, rxb, ryb, rng);
        rooms[idx] = {
          gx,
          gy,
          gone: false,
          maze: true,
          ...box,
          cx: Math.floor((box.l + box.r) / 2),
          cy: Math.floor((box.t + box.b) / 2),
        };
        continue;
      }

      // Interior (floor) dimensions, capped to the region after walls. A size
      // mode biases the roll: large rooms hug the cell's max interior, small
      // rooms hug the minimum, both staying within [roomMin, cell max].
      const maxIW = Math.min(roomMaxW, regionW - 2);
      const maxIH = Math.min(roomMaxH, regionH - 2);
      let loW: number = M.roomMinW;
      let hiW: number = maxIW;
      let loH: number = M.roomMinH;
      let hiH: number = maxIH;
      const sizeRoll = rng.next();
      if (sizeRoll < M.largeRoomChance) {
        loW = Math.max(M.roomMinW, maxIW - 2);
        loH = Math.max(M.roomMinH, maxIH - 1);
      } else if (sizeRoll < M.largeRoomChance + M.smallRoomChance) {
        hiW = Math.max(M.roomMinW, Math.min(maxIW, M.roomMinW + 1));
        hiH = Math.max(M.roomMinH, Math.min(maxIH, M.roomMinH + 1));
      }
      const iw = rng.range(loW, hiW);
      const ih = rng.range(loH, hiH);
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
  const realRooms = rooms.filter((rm): rm is Room => rm !== null && !rm.gone && !rm.maze);
  // Maze cells are off the real-room list but must stay reachable; (l,t) is the
  // DFS origin, always a carved corridor.
  const mazeRooms = rooms.filter((rm): rm is Room => rm !== null && rm.maze === true);
  const mazeRects: RoomRect[] = mazeRooms.map(({ l, t, r, b, cx, cy }) => ({ l, t, r, b, cx, cy }));
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
  // Every floor gets up-stairs at the start-room center (where the player
  // arrives, or spawns on Floor 1). On Floor 1 they double as the dungeon
  // entrance and the surface exit: climbing them with the Amulet of Ballard
  // wins the run, so the floor must carry the tile for the escape to be possible.
  stairsUpX = startRoom.cx;
  stairsUpY = startRoom.cy;
  map[stairsUpY][stairsUpX] = TILE.STAIRS_UP;
  assert(isWalkable(map[stairsUpY][stairsUpX]), `up stairs (${stairsUpX},${stairsUpY}) not walkable on floor ${dungeonFloor}`);
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
    rows,
    mazeRooms.map(m => ({ x: m.l, y: m.t }))
  );

  // Mark dark rooms. Runs AFTER start/stairs are fixed so we can spare the start
  // room (never blind the player on arrival) and honour the darkStairRooms knob.
  // Interior includes the stairs tile (matches the engine's room predicate), so
  // standing on the stairs in a dark room still shows only the 3x3.
  const dchance = darkRoomChance(dungeonFloor);
  if (dchance > 0) {
    for (const room of realRooms) {
      if (room === startRoom) continue;
      if (!BALANCE.map.darkStairRooms && room === endRoom) continue;
      if (!rng.chance(dchance)) continue;
      for (let y = room.t + 1; y < room.b; y++) {
        for (let x = room.l + 1; x < room.r; x++) {
          const ch = map[y][x];
          if (ch === TILE.FLOOR || STAIR_TILES.has(ch)) dark[y][x] = true;
        }
      }
    }
  }

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
          spawnAt(room, makePotionSpawn(rng));
        } else if (rand < spawn.scrollCut) {
          // Every scroll is now a named, carryable scroll picked from the
          // floor-gated catalog (repair included). Read on demand, never on
          // pickup. See design/planning/scrolls_overhaul_plan.md.
          spawnAt(room, makeScrollSpawn(dungeonFloor, rng));
        } else if (dungeonFloor >= BALANCE.wands.spawnMinFloor && rand < spawn.wandCut) {
          // A small slice of the consumable roll, gated to deeper floors, is a
          // zappable wand/staff. Rarer wands are gated further by floor inside
          // pickWandForFloor (it rolls the gear rarity curve).
          spawnAt(room, makeWandSpawn(dungeonFloor, rng));
        } else {
          // Leftover slice (the old repair-scroll fallback, plus the wand slice on
          // shallow floors where wands are gated out) is another catalog scroll.
          spawnAt(room, makeScrollSpawn(dungeonFloor, rng));
        }
      }

      // Spawn gear
      if (rng.chance(spawn.gearChance)) {
        const gearSpawn = makeGearSpawn(dungeonFloor, rng);
        if (gearSpawn) spawnAt(room, gearSpawn);
      }

      // Spawn monsters. Variety is gated on dungeon DEPTH, not player level —
      // a monster joins the pool at its `minFloor` and ages out `spawnDepthBand`
      // floors later, weighted toward the current depth so floor-appropriate
      // monsters dominate and each floor feels distinct (original-Rogue style).
      if (rng.chance(spawn.monsterChance)) {
        const tmpl = pickDepthMonster(dungeonFloor, rng);
        if (tmpl) {
          // Scatter to a random interior tile (matching item spawns) instead of
          // always the top-left corner, which produced a visible per-floor
          // pattern. Reject the player's tile, occupied tiles, and item tiles;
          // skip the spawn rather than force an overlap if no tile is free.
          let placed: { x: number; y: number } | null = null;
          for (let tries = 0; tries < 8 && !placed; tries++) {
            const mx = rng.range(room.l + 1, room.r - 1);
            const my = rng.range(room.t + 1, room.b - 1);
            if (mx === playerX && my === playerY) continue;
            if (monsters.some(m => m.x === mx && m.y === my)) continue;
            if (items.some(it => it.x === mx && it.y === my)) continue;
            placed = { x: mx, y: my };
          }
          if (placed) {
            monsters.push({ ...tmpl, x: placed.x, y: placed.y, frozenTurns: 0 });
          }
        }
      }
    }
  }

  spawnMazeCaches(map, mazeRects, dungeonFloor, items, monsters, [
    { x: playerX, y: playerY },
    { x: stairsUpX, y: stairsUpY },
    { x: stairsDownX, y: stairsDownY },
  ], rng);
  spawnMazeDenizens(map, mazeRects, dungeonFloor, items, monsters, [
    { x: playerX, y: playerY },
    { x: stairsUpX, y: stairsUpY },
    { x: stairsDownX, y: stairsDownY },
  ], playerX, playerY, stairsDownX, stairsDownY, cols, rows, rng);

  const traps = placeTraps({
    map,
    dark,
    rooms: realRooms,
    startRoom,
    dungeonFloor,
    monsters,
    items,
    rng,
    trapdoorAllowed: opts.trapdoorAllowed,
  });

  return {
    map,
    dark,
    rooms: realRooms.map(({ l, t, r, b, cx, cy }) => ({ l, t, r, b, cx, cy })),
    playerX,
    playerY,
    monsters,
    items,
    traps,
    stairsUpX,
    stairsUpY,
    stairsDownX,
    stairsDownY,
    mazeRects,
  };
}

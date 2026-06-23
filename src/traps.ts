import { BALANCE } from './config';
import type { Item, Monster, TrapKind, TrapState } from './types';
import { RNG } from './rng';
import { TILE, STAIR_TILES } from './tiles';

export const TRAP_KINDS: readonly TrapKind[] = ['bear', 'sleep_gas', 'dart', 'teleport', 'trapdoor'];

export const TRAP_LABELS: Record<TrapKind, string> = {
  bear: 'Bear Trap',
  sleep_gas: 'Sleep Gas',
  dart: 'Dart Trap',
  teleport: 'Teleport Trap',
  trapdoor: 'Trapdoor',
};

export const TRAP_REVEAL_MESSAGES: Record<TrapKind, string> = {
  bear: 'You notice a bear trap.',
  sleep_gas: 'You smell sleep gas venting from the floor.',
  dart: 'You spot a dart hole in the wall.',
  teleport: 'You notice a strange rune in the floor.',
  trapdoor: 'You find a hidden trapdoor.',
};

export const TRAP_TRIGGER_MESSAGES: Record<TrapKind, string> = {
  bear: 'A bear trap snaps shut!',
  sleep_gas: 'Sleep gas hisses from the floor!',
  dart: 'A dart trap fires!',
  teleport: 'A teleport trap twists the room away.',
  trapdoor: 'A trapdoor opens beneath you!',
};

export function trapCost(kind: TrapKind): number {
  return BALANCE.map.traps.cost[kind];
}

export function trapBudgetForFloor(floor: number): number {
  if (floor < 4 || floor >= 20) return 0;
  if (floor <= 7) return 1;
  if (floor <= 15) return 2;
  if (floor <= 17) return 3;
  return 2;
}

export function allowedTrapKindsForFloor(floor: number): TrapKind[] {
  if (floor < 4 || floor >= 20) return [];
  if (floor === 4) return ['bear'];
  if (floor <= 5) return ['bear', 'sleep_gas'];
  if (floor <= 7) return ['bear', 'sleep_gas', 'dart'];
  if (floor <= 17) return [...TRAP_KINDS];
  return ['bear', 'sleep_gas', 'dart', 'teleport'];
}

export function shouldSpendTrapBudget(floor: number, spent: number, rng: RNG): boolean {
  const budget = trapBudgetForFloor(floor);
  if (budget <= spent) return false;
  if (floor === 4) return spent === 0 && rng.chance(BALANCE.map.traps.floor4Chance);
  if (floor <= 7) return spent === 0 && rng.chance(BALANCE.map.traps.midEarlyChance);
  if (floor <= 15) return spent === 0 || rng.chance(BALANCE.map.traps.extraBudgetChance);
  return spent === 0 || rng.chance(BALANCE.map.traps.lateExtraBudgetChance);
}

export function maxDartDrainStacks(floor: number): number {
  if (floor <= 10) return 1;
  if (floor <= 15) return 2;
  return 3;
}

export function bearTrapTurns(floor: number): number {
  return floor >= 10 ? 3 : 2;
}

export function trapDirectDamage(kind: TrapKind, rng: RNG): number {
  if (kind === 'bear' || kind === 'trapdoor') return rng.int(4); // 0..3, capped by caller.
  if (kind === 'dart') return rng.range(1, 3);
  return 0;
}

interface RoomLike {
  l: number;
  t: number;
  r: number;
  b: number;
}

function roomKey(room: RoomLike): string {
  return `${room.l},${room.t},${room.r},${room.b}`;
}

function contains(room: RoomLike, x: number, y: number): boolean {
  return x >= room.l && x <= room.r && y >= room.t && y <= room.b;
}

function shuffle<T>(items: T[], rng: RNG): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function adjacentToAny(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  return points.some(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1);
}

function hasAdjacentTerrain(map: string[][], x: number, y: number, terrain: Set<string>): boolean {
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    if (terrain.has(map[y + dy]?.[x + dx])) return true;
  }
  return false;
}

export interface PlaceTrapsInput {
  map: string[][];
  dark: boolean[][];
  rooms: RoomLike[];
  startRoom: RoomLike;
  dungeonFloor: number;
  monsters: Monster[];
  items: Item[];
  rng: RNG;
  trapdoorAllowed?: boolean;
}

export function placeTraps(input: PlaceTrapsInput): TrapState[] {
  const budget = trapBudgetForFloor(input.dungeonFloor);
  if (budget <= 0) return [];

  const stairs = new Set(input.rooms.filter(room => {
    for (let y = room.t + 1; y < room.b; y++) {
      for (let x = room.l + 1; x < room.r; x++) {
        if (STAIR_TILES.has(input.map[y]?.[x])) return true;
      }
    }
    return false;
  }).map(roomKey));

  const specialRooms = new Set(input.rooms.filter(room =>
    input.monsters.some(mon => mon.special && contains(room, mon.x, mon.y))
  ).map(roomKey));

  const occupied = new Set<string>([
    ...input.items.map(it => `${it.x},${it.y}`),
    ...input.monsters.map(mon => `${mon.x},${mon.y}`),
  ]);
  const stairPoints: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < input.map.length; y++) {
    for (let x = 0; x < input.map[y].length; x++) {
      if (STAIR_TILES.has(input.map[y][x])) stairPoints.push({ x, y });
    }
  }

  const candidates: Array<{ x: number; y: number; room: RoomLike }> = [];
  const startKey = roomKey(input.startRoom);
  const nearPassage = new Set([TILE.DOOR, TILE.CORRIDOR]);
  for (const room of input.rooms) {
    const key = roomKey(room);
    if (key === startKey || stairs.has(key) || specialRooms.has(key)) continue;
    for (let y = room.t + 1; y < room.b; y++) {
      for (let x = room.l + 1; x < room.r; x++) {
        if (input.map[y]?.[x] !== TILE.FLOOR) continue;
        if (input.dark[y]?.[x]) continue;
        if (occupied.has(`${x},${y}`)) continue;
        if (adjacentToAny(x, y, stairPoints)) continue;
        if (hasAdjacentTerrain(input.map, x, y, nearPassage)) continue;
        candidates.push({ x, y, room });
      }
    }
  }

  shuffle(candidates, input.rng);
  const traps: TrapState[] = [];
  const trappedRooms = new Set<string>();
  let spent = 0;

  while (shouldSpendTrapBudget(input.dungeonFloor, spent, input.rng)) {
    const candidate = candidates.find(c =>
      !trappedRooms.has(roomKey(c.room)) &&
      !traps.some(t => Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) <= 1)
    );
    if (!candidate) break;

    const allowed = allowedTrapKindsForFloor(input.dungeonFloor)
      .filter(kind => trapCost(kind) <= budget - spent)
      .filter(kind => kind !== 'trapdoor' || input.trapdoorAllowed !== false)
      .filter(kind => kind !== 'trapdoor' || input.dungeonFloor < BALANCE.map.traps.trapdoorLastFloor);
    if (allowed.length === 0) break;

    const kind = input.rng.pick(allowed);
    traps.push({
      id: `f${input.dungeonFloor}-${kind}-${candidate.x}-${candidate.y}`,
      kind,
      x: candidate.x,
      y: candidate.y,
      revealed: false,
      armed: true,
    });
    trappedRooms.add(roomKey(candidate.room));
    spent += trapCost(kind);
  }

  return traps;
}

export interface TrapBalanceFloor {
  floor: number;
  generated: number;
  byKind: Record<TrapKind, number>;
  hazardBudgetUsed: number;
}

export interface TrapBalanceSummary {
  floors: TrapBalanceFloor[];
  runTotals: {
    generated: number;
    expectedTriggersNoSearch: number;
    expectedTriggersCautiousSearch: number;
    expectedDirectDamage: number;
    trapdoors: number;
    dartDrainStacks: number;
  };
}

export function summarizeTrapBalance(levels: Array<{ floor: number; traps: TrapState[] }>): TrapBalanceSummary {
  const floors = levels.map(({ floor, traps }) => {
    const byKind = Object.fromEntries(TRAP_KINDS.map(kind => [kind, 0])) as Record<TrapKind, number>;
    for (const trap of traps) byKind[trap.kind]++;
    return {
      floor,
      generated: traps.length,
      byKind,
      hazardBudgetUsed: traps.reduce((sum, trap) => sum + trapCost(trap.kind), 0),
    };
  });

  const all = levels.flatMap(l => l.traps);
  const dartDrainStacks = all.filter(t => t.kind === 'dart').length;
  return {
    floors,
    runTotals: {
      generated: all.length,
      expectedTriggersNoSearch: Math.round(all.length * 0.42 * 10) / 10,
      expectedTriggersCautiousSearch: Math.round(all.length * 0.18 * 10) / 10,
      expectedDirectDamage: Math.round(all.reduce((sum, trap) => {
        if (trap.kind === 'bear' || trap.kind === 'trapdoor') return sum + 1.5;
        if (trap.kind === 'dart') return sum + 2;
        return sum;
      }, 0) * 10) / 10,
      trapdoors: all.filter(t => t.kind === 'trapdoor').length,
      dartDrainStacks,
    },
  };
}

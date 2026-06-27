import { TILE } from '../tiles';
import type { RoomRect } from '../map';
import type { Item, Monster, Player, TrapState } from '../types';

export type MapSnapshotScope =
  | { readonly type: 'full-floor' }
  | { readonly type: 'room'; readonly rect: { readonly l: number; readonly t: number; readonly r: number; readonly b: number } };

export interface MapTileView {
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly explored: boolean;
  readonly visible: boolean;
  readonly inScope: boolean;
}

export interface PlayerView {
  readonly x: number;
  readonly y: number;
  readonly inScope: boolean;
}

export interface MonsterView {
  readonly key: string;
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly visible: boolean;
  readonly detected: boolean;
  readonly hp: number;
  readonly maxHp?: number;
  readonly atk: number;
  readonly minFloor: number;
  readonly special?: Monster['special'];
  readonly frozenTurns: number;
  readonly ai?: Monster['ai'];
  readonly inScope: boolean;
}

export interface ItemView {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly type: Item['type'];
  readonly amount?: number;
  readonly glyph: string;
  readonly color: string;
  readonly explored: boolean;
  readonly visible: boolean;
  readonly data?: unknown;
  readonly inScope: boolean;
}

export interface TrapView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: TrapState['kind'];
  readonly revealed: boolean;
  readonly armed: boolean;
  readonly explored: boolean;
  readonly visible: boolean;
  readonly inScope: boolean;
}

export interface MapSnapshot {
  readonly cols: number;
  readonly rows: number;
  readonly floor: number;
  readonly scope: MapSnapshotScope;
  readonly gameOver: boolean;
  readonly gameWon: boolean;
  readonly monsterDetectionActive: boolean;
  readonly tiles: readonly (readonly MapTileView[])[];
  readonly player: PlayerView;
  readonly monsters: readonly MonsterView[];
  readonly items: readonly ItemView[];
  readonly traps: readonly TrapView[];
}

export interface CreateMapSnapshotInput {
  readonly map: readonly (readonly string[])[];
  readonly explored: readonly (readonly boolean[])[];
  readonly visible: readonly (readonly boolean[])[];
  readonly player: Player;
  readonly monsters: readonly Monster[];
  readonly items: readonly Item[];
  readonly traps: readonly TrapState[];
  readonly cols: number;
  readonly rows: number;
  readonly floor: number;
  readonly gameOver: boolean;
  readonly gameWon: boolean;
  readonly monsterDetectionActive: boolean;
  readonly scope?: MapSnapshotScope;
}

const monsterKeys = new WeakMap<Monster, string>();
let nextMonsterKey = 1;

export function monsterRenderKey(monster: Monster): string {
  const existing = monsterKeys.get(monster);
  if (existing) return existing;

  const key = `monster-${nextMonsterKey++}`;
  monsterKeys.set(monster, key);
  return key;
}

export function createMapSnapshot(input: CreateMapSnapshotInput): MapSnapshot {
  const scope = copyScope(input.scope ?? { type: 'full-floor' });
  const tiles = Array.from({ length: input.rows }, (_, y) =>
    Array.from({ length: input.cols }, (_, x): MapTileView => {
      const inScope = isInScope(scope, x, y);
      return {
        x,
        y,
        kind: inScope ? input.map[y]?.[x] ?? TILE.VOID : TILE.VOID,
        explored: inScope && Boolean(input.explored[y]?.[x]),
        visible: inScope && Boolean(input.visible[y]?.[x]),
        inScope,
      };
    })
  );

  const snapshot: MapSnapshot = {
    cols: input.cols,
    rows: input.rows,
    floor: input.floor,
    scope,
    gameOver: input.gameOver,
    gameWon: input.gameWon,
    monsterDetectionActive: input.monsterDetectionActive,
    tiles,
    player: {
      x: input.player.x,
      y: input.player.y,
      inScope: isInScope(scope, input.player.x, input.player.y),
    },
    monsters: input.monsters.filter(monster => isInScope(scope, monster.x, monster.y)).map((monster): MonsterView => {
      const visible = Boolean(input.visible[monster.y]?.[monster.x]);
      return {
        key: monsterRenderKey(monster),
        id: monster.id,
        x: monster.x,
        y: monster.y,
        name: monster.name,
        glyph: monster.symbol,
        color: monster.color,
        visible,
        detected: input.monsterDetectionActive && !visible,
        hp: monster.hp,
        maxHp: monster.maxHp,
        atk: monster.atk,
        minFloor: monster.minFloor,
        special: monster.special,
        frozenTurns: monster.frozenTurns,
        ai: cloneValue(monster.ai),
        inScope: true,
      };
    }),
    items: input.items.map((item, index) => ({ item, index }))
      .filter(({ item }) => isInScope(scope, item.x, item.y))
      .map(({ item, index }): ItemView => ({
        key: `item-${index}-${item.type}-${item.x}-${item.y}`,
        x: item.x,
        y: item.y,
        type: item.type,
        amount: 'amount' in item ? item.amount : undefined,
        glyph: item.symbol,
        color: item.color,
        explored: Boolean(input.explored[item.y]?.[item.x]),
        visible: Boolean(input.visible[item.y]?.[item.x]),
        data: 'data' in item ? cloneValue(item.data) : undefined,
        inScope: true,
      })),
    traps: input.traps.filter(trap => isInScope(scope, trap.x, trap.y)).map((trap): TrapView => ({
      id: trap.id,
      x: trap.x,
      y: trap.y,
      kind: trap.kind,
      revealed: trap.revealed,
      armed: trap.armed,
      explored: Boolean(input.explored[trap.y]?.[trap.x]),
      visible: Boolean(input.visible[trap.y]?.[trap.x]),
      inScope: true,
    })),
  };

  return deepFreeze(snapshot);
}

function copyScope(scope: MapSnapshotScope): MapSnapshotScope {
  if (scope.type === 'full-floor') return { type: 'full-floor' };
  return {
    type: 'room',
    rect: {
      l: scope.rect.l,
      t: scope.rect.t,
      r: scope.rect.r,
      b: scope.rect.b,
    },
  };
}

function isInScope(scope: MapSnapshotScope, x: number, y: number): boolean {
  if (scope.type === 'full-floor') return true;
  return pointInRect(scope.rect, x, y);
}

export function pointInRect(rect: Pick<RoomRect, 'l' | 't' | 'r' | 'b'>, x: number, y: number): boolean {
  return x >= rect.l && x <= rect.r && y >= rect.t && y <= rect.b;
}

export interface DeriveRoomScopeInput {
  readonly rooms: readonly RoomRect[];
  readonly player: { readonly x: number; readonly y: number };
  readonly boss?: { readonly x: number; readonly y: number } | null;
}

export function deriveCurrentRoomScope(input: DeriveRoomScopeInput): MapSnapshotScope | null {
  const playerRoom = input.rooms.find(room => pointInRect(room, input.player.x, input.player.y));
  if (!playerRoom) return null;

  if (input.boss && !pointInRect(playerRoom, input.boss.x, input.boss.y)) {
    return null;
  }

  return {
    type: 'room',
    rect: {
      l: playerRoom.l,
      t: playerRoom.t,
      r: playerRoom.r,
      b: playerRoom.b,
    },
  };
}

export function cloneValue<T>(value: T): T {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

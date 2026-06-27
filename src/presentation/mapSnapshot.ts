import type { Item, Monster, Player, TrapState } from '../types';

export type MapSnapshotScope =
  | { type: 'full-floor' }
  | { type: 'room'; rect: { l: number; t: number; r: number; b: number } };

export interface MapTileView {
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly explored: boolean;
  readonly visible: boolean;
}

export interface PlayerView {
  readonly x: number;
  readonly y: number;
}

export interface MonsterView {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
  readonly visible: boolean;
}

export interface ItemView {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly color: string;
  readonly visible: boolean;
}

export interface TrapView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly revealed: boolean;
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

export interface LegacyMapRenderSnapshot {
  readonly map: string[][];
  readonly explored: boolean[][];
  readonly visible: boolean[][];
  readonly player: Player;
  readonly monsters: Monster[];
  readonly items: Item[];
  readonly traps: TrapState[];
  readonly tileSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly dungeonFloor: number;
  readonly gameOver: boolean;
  readonly gameWon: boolean;
  readonly monsterDetectionActive: boolean;
}

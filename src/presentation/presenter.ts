import type { DiscoveryState } from '../discovery';
import type { StatusEffects, Monster, Player, TrapEffects } from '../types';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';

export interface EncounterScope {
  readonly kind: 'room';
  readonly rect: { readonly l: number; readonly t: number; readonly r: number; readonly b: number };
  readonly entryDir?: 'up' | 'down' | 'left' | 'right';
}

export type PresentationMode =
  | { readonly type: 'dungeon-map' }
  | { readonly type: 'boss-encounter'; readonly bossKey: string; readonly scope: EncounterScope }
  | { readonly type: 'end-run-transition'; readonly runId: string };

export const DEFAULT_PRESENTATION_MODE: PresentationMode = { type: 'dungeon-map' };

export interface HudSnapshot {
  readonly player: Player;
  readonly dungeonFloor: number;
  readonly statusEffects: StatusEffects;
  readonly totalDef: number;
  readonly turn: number;
  readonly trapEffects: TrapEffects;
  readonly hasAmulet: boolean;
}

export interface InventorySnapshot {
  readonly player: Player;
}

export interface DiscoverySnapshot {
  readonly state: DiscoveryState;
}

export interface GamePresenter {
  setMode(mode: PresentationMode): void;
  publishStats(snapshot: HudSnapshot): void;
  publishInventory(snapshot: InventorySnapshot): void;
  publishMap(snapshot: MapSnapshot): void;
  publishLogs(logs: readonly string[]): void;
  publishDiscovery(snapshot: DiscoverySnapshot): void;
  publishEvent(event: PresentationEvent): void;

  updateStats(
    player: Player,
    dungeonFloor: number,
    statusEffects: StatusEffects,
    totalDef: number,
    turn: number,
    trapEffects: TrapEffects,
    hasAmulet: boolean,
  ): void;
  updateDropdowns(player: Player): void;
  resetLog(): void;
  renderLogs(logs: readonly string[]): void;
  syncDiscovery(state: DiscoveryState): void;
  fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[]): void;
  fxStrike(fromX: number, fromY: number, toX: number, toY: number): void;
  fxHit(x: number, y: number, damage: number, crit?: boolean): void;
  fxFreeze(x: number, y: number): void;
  fxDeath(x: number, y: number, glyph: string, color: string): void;
  fxPlayerHit(): void;
  fxDive(fromX: number, fromY: number, toX: number, toY: number, color: string): void;
  fxWhiff(x: number, y: number): void;
  fxFloat(x: number, y: number, text: string, color?: string): void;
  fxMonsterDodge(monster: Monster, fromX: number, fromY: number): void;
  mapRumble(strength?: number): void;
  beginFloorTransition(dir: 'down' | 'up'): void;
  setAiming(aiming: { wandName: string } | null): void;
  focusCombatMonster(monster: Monster): void;
  clearCombatFocusMonster(monster: Monster): void;
}

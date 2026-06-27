import type { DiscoveryState } from '../discovery';
import type { StatusEffects, Player, TrapEffects } from '../types';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent } from './presentationEvents';

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

export function copyPresentationMode(mode: PresentationMode): PresentationMode {
  switch (mode.type) {
    case 'dungeon-map':
      return { type: 'dungeon-map' };
    case 'boss-encounter':
      return {
        type: 'boss-encounter',
        bossKey: mode.bossKey,
        scope: {
          kind: mode.scope.kind,
          rect: {
            l: mode.scope.rect.l,
            t: mode.scope.rect.t,
            r: mode.scope.rect.r,
            b: mode.scope.rect.b,
          },
          entryDir: mode.scope.entryDir,
        },
      };
    case 'end-run-transition':
      return { type: 'end-run-transition', runId: mode.runId };
  }
}

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
}

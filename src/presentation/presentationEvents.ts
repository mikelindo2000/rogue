import type { PresentationMode } from './presenter';

export interface RunPathStep {
  readonly x: number;
  readonly y: number;
}

export interface RunGhostItem {
  readonly x: number;
  readonly y: number;
  readonly symbol: string;
  readonly color: string;
  readonly pathIndex: number;
}

export type PresentationEvent =
  | { type: 'combat.strike'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'combat.hit'; x: number; y: number; damage: number; crit: boolean }
  | { type: 'combat.freeze'; x: number; y: number }
  | { type: 'combat.death'; x: number; y: number; glyph: string; color: string }
  | { type: 'combat.playerHit' }
  | { type: 'combat.dive'; fromX: number; fromY: number; toX: number; toY: number; color: string }
  | { type: 'combat.whiff'; x: number; y: number }
  | { type: 'combat.float'; x: number; y: number; text: string; color?: string }
  | { type: 'combat.monsterDodge'; monsterKey: string; fromX: number; fromY: number }
  | { type: 'combat.focusMonster'; monsterKey: string }
  | { type: 'combat.clearFocusMonster'; monsterKey: string }
  | { type: 'map.rumble'; strength: number }
  | { type: 'map.floorTransition'; dir: 'down' | 'up' }
  | { type: 'presentation.modeChanged'; mode: PresentationMode }
  | { type: 'player.run'; path: readonly RunPathStep[]; ghosts: readonly RunGhostItem[] }
  | { type: 'aiming.changed'; wandName: string | null };

export const PLAYER_RUN_ANIMATION = {
  msPerTile: 32,
  maxDurationMs: 480,
  trailCount: 5,
  trailSpacingMs: 28,
} as const;

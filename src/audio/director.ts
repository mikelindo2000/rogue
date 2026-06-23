/**
 * Pure mapping from coarse game state to a music bed. Kept separate from main.ts
 * so the selection ladder is unit-testable without the engine or Web Audio.
 */
import type { MusicContextId } from './manifest';

export interface MusicState {
  gameOver: boolean;
  gameWon: boolean;
  /** Only the `special` tag matters here. */
  monsters: ReadonlyArray<{ special?: 'hero' | 'boss' }>;
  dungeonFloor: number;
}

/**
 * Priority ladder: run-end > boss present > floor cleared (respite) > depth band.
 * Returns the bed id; the music service ignores repeats and crossfades changes.
 */
export function selectMusicContext(state: MusicState): MusicContextId {
  if (state.gameOver || state.gameWon) return 'gameover';
  if (state.monsters.some((m) => m.special === 'boss')) return 'boss';
  if (state.monsters.length === 0) return 'safe';
  return state.dungeonFloor <= 3 ? 'explore-shallow' : 'explore-deep';
}

import { TILE } from './tiles';

/**
 * Canvas palette for the dungeon view. These are the colors that can't live in
 * CSS because the map is painted to a <canvas>. They echo the look of the
 * original Rogue running on an amber/green phosphor terminal: dim stone walls,
 * faint floor dots, glowing doors and stairs.
 */
export const TILE_COLORS: Record<string, string> = {
  [TILE.WALL_H]: '#8a7f6a',   // weathered stone
  [TILE.WALL_V]: '#8a7f6a',
  [TILE.FLOOR]: '#4b5563',    // faint floor dots
  [TILE.CORRIDOR]: '#717561', // lit passage
  [TILE.DOOR]: '#c9a227',     // amber doorway
  [TILE.STAIRS]: '#facc15',   // bright descent
};

/** Fallback color for any tile not explicitly themed. */
export const TILE_DEFAULT_COLOR = '#3f3f46';

/** Opacity for tiles that have been explored but are currently out of sight. */
export const DIM_ALPHA = 0.32;

/** Player glyph colors keyed by game state. */
export const PLAYER_COLORS = {
  alive: '#f4f4f5',
  dead: '#ef4444',
  won: '#4ade80',
};

/**
 * Board-size presets. The dungeon is a `gridCols x gridRows` grid of cells, each
 * holding one room (see generateLevel in map.ts), drawn on a `cols x rows` tile
 * board. Bigger boards use both a larger grid (more rooms, less predictable
 * layouts) and roomier cells with higher room-size caps (bigger rooms, closer to
 * original Rogue's wide halls). There is no scrolling camera, so a larger board
 * renders zoomed out — more world on screen at smaller tiles, which is also how
 * the original showed its full map.
 *
 * `classic` is byte-for-byte the historical default (46x29, 3x3, 11x6 rooms), so
 * existing saves and the established feel are untouched.
 *
 * Board size is chosen per NEW game and then travels with the run: it is written
 * into the save so loading restores the same dimensions regardless of the
 * current setting. Old saves (no boardSize) resolve to `classic`, which matches
 * their stored 46x29 grids.
 */
export type BoardSizeId = 'classic' | 'large' | 'huge';

export interface BoardConfig {
  id: BoardSizeId;
  /** Human label for the settings UI. */
  label: string;
  /** One-line description for the settings UI. */
  hint: string;
  cols: number;
  rows: number;
  gridCols: number;
  gridRows: number;
  /** Room interior caps; the cell geometry caps further on smaller cells. */
  roomMaxW: number;
  roomMaxH: number;
}

export const BOARD_SIZES: Record<BoardSizeId, BoardConfig> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    hint: 'The original 46×29 dungeon, 3×3 rooms.',
    cols: 46,
    rows: 29,
    gridCols: 3,
    gridRows: 3,
    roomMaxW: 11,
    roomMaxH: 6,
  },
  large: {
    id: 'large',
    label: 'Large',
    hint: 'Roomier 64×36 floors, 4×3 rooms. Tiles render a touch smaller.',
    cols: 64,
    rows: 36,
    gridCols: 4,
    gridRows: 3,
    roomMaxW: 12,
    roomMaxH: 8,
  },
  huge: {
    id: 'huge',
    label: 'Huge',
    hint: 'Sprawling 80×42 floors, 4×4 rooms — original-Rogue width. Smaller tiles.',
    cols: 80,
    rows: 42,
    gridCols: 4,
    gridRows: 4,
    roomMaxW: 16,
    roomMaxH: 8,
  },
};

export const DEFAULT_BOARD_SIZE: BoardSizeId = 'classic';

/** Resolve any value (e.g. a stored setting/save field) to a known board. */
export function resolveBoardSize(id: unknown): BoardConfig {
  return (typeof id === 'string' && id in BOARD_SIZES)
    ? BOARD_SIZES[id as BoardSizeId]
    : BOARD_SIZES[DEFAULT_BOARD_SIZE];
}

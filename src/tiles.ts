/**
 * Dungeon tile vocabulary, modeled on the original Rogue (1980).
 *
 * Rooms are bounded by ASCII walls (`-` horizontal, `|` vertical) with distinct
 * corner glyphs joining them. Their interiors are floor (`.`), and they are
 * linked by dark corridors (`#`). Where a corridor breaches a room wall it
 * becomes a door (`+`). Everything that has never been carved is solid
 * rock / void (a space).
 *
 * The corner glyphs use box-drawing characters as internal tokens. They are
 * never shown literally — the canvas renderer draws an L-shaped join for each —
 * but keeping them as their own tiles lets generation, FOV, and the renderer
 * all reason about corners explicitly.
 */
export const TILE = {
  VOID: ' ',
  FLOOR: '.',
  CORRIDOR: '#',
  WALL_H: '-',
  WALL_V: '|',
  CORNER_TL: '┌',
  CORNER_TR: '┐',
  CORNER_BL: '└',
  CORNER_BR: '┘',
  DOOR: '+',
  STAIRS_UP: '<',
  STAIRS_DOWN: '>',
} as const;

export const STAIR_TILES: ReadonlySet<string> = new Set([TILE.STAIRS_UP, TILE.STAIRS_DOWN]);

/** Every glyph that forms part of a room's bounding wall (edges + corners). */
const WALL_CHARS: ReadonlySet<string> = new Set([
  TILE.WALL_H,
  TILE.WALL_V,
  TILE.CORNER_TL,
  TILE.CORNER_TR,
  TILE.CORNER_BL,
  TILE.CORNER_BR,
]);

const CORNER_CHARS: ReadonlySet<string> = new Set([
  TILE.CORNER_TL,
  TILE.CORNER_TR,
  TILE.CORNER_BL,
  TILE.CORNER_BR,
]);

/** Tiles the player and monsters may stand on. */
export function isWalkable(ch: string | undefined): boolean {
  return ch === TILE.FLOOR || ch === TILE.CORRIDOR || ch === TILE.DOOR || (ch !== undefined && STAIR_TILES.has(ch));
}

/** Tiles that stop line-of-sight (walls, corners, and unexcavated rock). */
export function blocksSight(ch: string | undefined): boolean {
  return ch === undefined || ch === TILE.VOID || WALL_CHARS.has(ch);
}

/** True for any room-bounding wall glyph, including the four corners. */
export function isWall(ch: string | undefined): boolean {
  return ch !== undefined && WALL_CHARS.has(ch);
}

/** True for the four corner glyphs only. */
export function isCorner(ch: string | undefined): boolean {
  return ch !== undefined && CORNER_CHARS.has(ch);
}

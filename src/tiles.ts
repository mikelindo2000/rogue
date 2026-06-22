/**
 * Dungeon tile vocabulary, modeled on the original Rogue (1980).
 *
 * Rooms are bounded by ASCII walls (`-` horizontal, `|` vertical), their
 * interiors are floor (`.`), and they are linked by dark corridors (`#`).
 * Where a corridor breaches a room wall it becomes a door (`+`). Everything
 * that has never been carved is solid rock / void (a space).
 */
export const TILE = {
  VOID: ' ',
  FLOOR: '.',
  CORRIDOR: '#',
  WALL_H: '-',
  WALL_V: '|',
  DOOR: '+',
  STAIRS: '>',
} as const;

/** Tiles the player and monsters may stand on. */
export function isWalkable(ch: string | undefined): boolean {
  return ch === TILE.FLOOR || ch === TILE.CORRIDOR || ch === TILE.DOOR || ch === TILE.STAIRS;
}

/** Tiles that stop line-of-sight (walls and unexcavated rock). */
export function blocksSight(ch: string | undefined): boolean {
  return ch === TILE.WALL_H || ch === TILE.WALL_V || ch === TILE.VOID || ch === undefined;
}

/** True for the room-bounding wall glyphs. */
export function isWall(ch: string): boolean {
  return ch === TILE.WALL_H || ch === TILE.WALL_V;
}

import { describe, it, expect } from 'vitest';
import { portraitSizePx, pickPortraitCorner, portraitsEqual } from './combatPortrait';
import type { CombatPortrait } from './store.svelte';
import { TILE } from '../tiles';

/** Build a cols×rows grid of VOID with `explored` all true, so only tiles we
 *  explicitly paint count as "drawn map". */
function blankBoard(cols: number, rows: number) {
  const map = Array.from({ length: rows }, () => Array.from({ length: cols }, () => TILE.VOID));
  const explored = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true));
  return { map, explored };
}

/** Paint an inclusive rectangle of floor tiles ("drawn map"). */
function paintRoom(map: string[][], l: number, t: number, r: number, b: number) {
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) map[y][x] = TILE.FLOOR;
}

const TILE_SIZE = 16;

function pick(
  cols: number,
  rows: number,
  map: string[][],
  explored: boolean[][],
  playerX: number,
  playerY: number,
  blockedTiles = new Set<number>()
) {
  const sizePx = portraitSizePx(cols, rows, TILE_SIZE);
  return pickPortraitCorner({
    map,
    explored,
    blockedTiles,
    playerX,
    playerY,
    cols,
    rows,
    tileSize: TILE_SIZE,
    sizePx,
  });
}

describe('portraitSizePx', () => {
  it('clamps to the legible 96..200 px range', () => {
    expect(portraitSizePx(4, 4, 16)).toBe(96); // tiny board floors at 96
    expect(portraitSizePx(200, 200, 40)).toBe(200); // huge board caps at 200
  });

  it('scales with the smaller board dimension', () => {
    const px = portraitSizePx(46, 29, 16);
    expect(px).toBeGreaterThan(96);
    expect(px).toBeLessThanOrEqual(200);
  });
});

describe('pickPortraitCorner', () => {
  it('returns a clear corner on an empty board', () => {
    const { map, explored } = blankBoard(46, 29);
    expect(pick(46, 29, map, explored, 23, 14)).not.toBeNull();
  });

  it('avoids a corner occupied by a drawn room (relocates)', () => {
    const { map, explored } = blankBoard(46, 29);
    // Fill the entire top-left quadrant with a room.
    paintRoom(map, 0, 0, 22, 14);
    const corner = pick(46, 29, map, explored, 23, 14);
    expect(corner).not.toBe('tl');
    expect(corner).not.toBeNull();
  });

  it('hides (null) when every corner overlaps drawn map', () => {
    const { map, explored } = blankBoard(20, 20);
    paintRoom(map, 0, 0, 19, 19); // whole board is room
    expect(pick(20, 20, map, explored, 10, 10)).toBeNull();
  });

  it('prefers a corner at the maximum distance from the player', () => {
    // Chebyshev distance ties two corners on the far edge, so assert the chosen
    // corner is one of the maximally-distant ones rather than a single id.
    const { map, explored } = blankBoard(46, 29);
    const anchors = { tl: [0, 0], tr: [45, 0], bl: [0, 28], br: [45, 28] } as const;
    for (const [px, py] of [[1, 1], [44, 27], [1, 27], [44, 1]] as const) {
      const corner = pick(46, 29, map, explored, px, py)!;
      const dist = (a: readonly [number, number]) =>
        Math.max(Math.abs(a[0] - px), Math.abs(a[1] - py));
      const maxDist = Math.max(...Object.values(anchors).map(dist));
      expect(dist(anchors[corner])).toBe(maxDist);
    }
  });

  it('treats a visible monster/item tile as blocking', () => {
    const { map, explored } = blankBoard(46, 29);
    // Player centered => top-left is the first corner tried. Block a tile deep
    // inside its oval footprint and it must relocate off 'tl'.
    const blocked = new Set<number>([4 * 46 + 4]);
    const corner = pick(46, 29, map, explored, 23, 14, blocked);
    expect(corner).not.toBe('tl');
    expect(corner).not.toBeNull();
  });

  it('does not block on unexplored (remembered-dark) tiles', () => {
    const { map } = blankBoard(46, 29);
    // Paint a room in every corner, but mark the board entirely UNexplored:
    // unexplored tiles are not "drawn", so placement should still succeed.
    paintRoom(map, 0, 0, 10, 10);
    paintRoom(map, 35, 0, 45, 10);
    paintRoom(map, 0, 18, 10, 28);
    paintRoom(map, 35, 18, 45, 28);
    const explored = Array.from({ length: 29 }, () => Array.from({ length: 46 }, () => false));
    expect(pick(46, 29, map, explored, 23, 14)).not.toBeNull();
  });
});

describe('portraitsEqual', () => {
  const base: CombatPortrait = {
    id: 'brown-bat',
    name: 'Brown Bat',
    color: '#a36b3d',
    hp: 10,
    maxHp: 22,
    corner: 'bl',
    sizePx: 130,
  };

  it('is true for identical snapshots and the same reference', () => {
    expect(portraitsEqual(base, { ...base })).toBe(true);
    expect(portraitsEqual(base, base)).toBe(true);
    expect(portraitsEqual(null, null)).toBe(true);
  });

  it('is false when any field differs', () => {
    expect(portraitsEqual(base, { ...base, hp: 9 })).toBe(false);
    expect(portraitsEqual(base, { ...base, corner: 'br' })).toBe(false);
    expect(portraitsEqual(base, { ...base, id: 'orc' })).toBe(false);
    expect(portraitsEqual(base, { ...base, name: 'Vampire Bat' })).toBe(false);
    expect(portraitsEqual(base, { ...base, color: '#fff' })).toBe(false);
    expect(portraitsEqual(base, { ...base, sizePx: 131 })).toBe(false);
  });

  it('is false when exactly one side is null', () => {
    expect(portraitsEqual(base, null)).toBe(false);
    expect(portraitsEqual(null, base)).toBe(false);
  });
});

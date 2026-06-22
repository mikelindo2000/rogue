import { describe, it, expect } from 'vitest';
import { isWalkable, blocksSight, isWall, isCorner, TILE } from './tiles';

const CORNERS = [TILE.CORNER_TL, TILE.CORNER_TR, TILE.CORNER_BL, TILE.CORNER_BR];

describe('isWalkable', () => {
  const walkable = [TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS_UP, TILE.STAIRS_DOWN]; // '.', '#', '+', '<', '>'
  const blocked = [TILE.WALL_H, TILE.WALL_V, ...CORNERS, TILE.SECRET_DOOR, TILE.VOID, undefined];

  it.each(walkable)('is walkable for %j', (ch) => {
    expect(isWalkable(ch)).toBe(true);
  });

  it.each(blocked)('is not walkable for %j', (ch) => {
    expect(isWalkable(ch)).toBe(false);
  });
});

describe('blocksSight', () => {
  const blocks = [TILE.WALL_H, TILE.WALL_V, ...CORNERS, TILE.SECRET_DOOR, TILE.VOID, undefined];
  const transparent = [TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS_UP, TILE.STAIRS_DOWN]; // '.', '#', '+', '<', '>'

  it.each(blocks)('blocks sight for %j', (ch) => {
    expect(blocksSight(ch)).toBe(true);
  });

  it.each(transparent)('does not block sight for %j', (ch) => {
    expect(blocksSight(ch)).toBe(false);
  });
});

describe('isWall', () => {
  const walls = [TILE.WALL_H, TILE.WALL_V, ...CORNERS, TILE.SECRET_DOOR];
  const notWalls = [TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS_UP, TILE.STAIRS_DOWN, TILE.VOID, undefined];

  it.each(walls)('treats %j as a wall', (ch) => {
    expect(isWall(ch)).toBe(true);
  });

  it.each(notWalls)('does not treat %j as a wall', (ch) => {
    expect(isWall(ch)).toBe(false);
  });
});

describe('isCorner', () => {
  it.each(CORNERS)('treats %j as a corner', (ch) => {
    expect(isCorner(ch)).toBe(true);
  });

  it.each([TILE.WALL_H, TILE.WALL_V, TILE.FLOOR, TILE.DOOR, undefined])(
    'does not treat %j as a corner',
    (ch) => {
      expect(isCorner(ch)).toBe(false);
    }
  );
});

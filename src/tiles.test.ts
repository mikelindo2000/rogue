import { describe, it, expect } from 'vitest';
import { isWalkable, blocksSight, TILE } from './tiles';

describe('isWalkable', () => {
  const walkable = [TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS]; // '.', '#', '+', '>'
  const blocked = [TILE.WALL_H, TILE.WALL_V, TILE.VOID, undefined]; // '-', '|', ' ', undefined

  it.each(walkable)('is walkable for %j', (ch) => {
    expect(isWalkable(ch)).toBe(true);
  });

  it.each(blocked)('is not walkable for %j', (ch) => {
    expect(isWalkable(ch)).toBe(false);
  });
});

describe('blocksSight', () => {
  const blocks = [TILE.WALL_H, TILE.WALL_V, TILE.VOID, undefined]; // '-', '|', ' ', undefined
  const transparent = [TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS]; // '.', '#', '+', '>'

  it.each(blocks)('blocks sight for %j', (ch) => {
    expect(blocksSight(ch)).toBe(true);
  });

  it.each(transparent)('does not block sight for %j', (ch) => {
    expect(blocksSight(ch)).toBe(false);
  });
});

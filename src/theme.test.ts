import { describe, expect, it } from 'vitest';
import { DUNGEON_STYLES, getDungeonStyle } from './theme';

describe('getDungeonStyle', () => {
  it('keeps style bands sorted by minimum floor', () => {
    const floors = DUNGEON_STYLES.map(style => style.minFloor);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
  });

  it('selects the deepest matching style band', () => {
    expect(getDungeonStyle(1).name).toBe('Amber Keep');
    expect(getDungeonStyle(5).name).toBe('Amber Keep');
    expect(getDungeonStyle(6).name).toBe('Verdigris Ruins');
    expect(getDungeonStyle(11).name).toBe('Violet Vaults');
    expect(getDungeonStyle(20).name).toBe('Dragon Depths');
  });
});

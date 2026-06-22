import { TILE } from './tiles';

/**
 * Canvas style for the dungeon view. These values live in TypeScript because
 * the map is painted to a <canvas>, and keeping them data-driven lets deeper
 * dungeon bands swap palettes without touching renderer logic.
 */
export interface DungeonStyle {
  name: string;
  minFloor: number;
  background: string;
  wall: string;
  wallShadow: string;
  wallHighlight: string;
  corridor: string;
  corridorDark: string;
  floorDot: string;
  floorDotDim: string;
  door: string;
  stairs: string;
  playerHead: string;
  playerFace: string;
  playerBody: string;
  playerDead: string;
  playerWon: string;
}

export const DUNGEON_STYLES: DungeonStyle[] = [
  {
    name: 'Amber Keep',
    minFloor: 1,
    background: '#000000',
    wall: '#b76300',
    wallShadow: '#6d3700',
    wallHighlight: '#f2a01e',
    corridor: '#979797',
    corridorDark: '#5b5b5b',
    floorDot: '#22e14a',
    floorDotDim: '#126b2b',
    door: '#22c7a9',
    stairs: '#e9e62a',
    playerHead: '#d7db25',
    playerFace: '#050505',
    playerBody: '#05b81f',
    playerDead: '#ef4444',
    playerWon: '#4ade80',
  },
  {
    name: 'Verdigris Ruins',
    minFloor: 6,
    background: '#000403',
    wall: '#178f78',
    wallShadow: '#0a443a',
    wallHighlight: '#5be0c5',
    corridor: '#84918f',
    corridorDark: '#43504e',
    floorDot: '#8af05f',
    floorDotDim: '#326d28',
    door: '#f2cf67',
    stairs: '#ecf87a',
    playerHead: '#d8f451',
    playerFace: '#00110c',
    playerBody: '#2fd36d',
    playerDead: '#ff5555',
    playerWon: '#7af5b0',
  },
  {
    name: 'Violet Vaults',
    minFloor: 11,
    background: '#020006',
    wall: '#9b5cff',
    wallShadow: '#4b238d',
    wallHighlight: '#cdb2ff',
    corridor: '#8d8aa0',
    corridorDark: '#4d4a60',
    floorDot: '#42f0ff',
    floorDotDim: '#1b6570',
    door: '#ffc857',
    stairs: '#f7f56f',
    playerHead: '#fff26a',
    playerFace: '#050012',
    playerBody: '#20d7a7',
    playerDead: '#ff4d8d',
    playerWon: '#80ffd5',
  },
  {
    name: 'Dragon Depths',
    minFloor: 16,
    background: '#050000',
    wall: '#d23b21',
    wallShadow: '#6d1208',
    wallHighlight: '#ff8a42',
    corridor: '#a19591',
    corridorDark: '#5b4640',
    floorDot: '#f4c531',
    floorDotDim: '#725912',
    door: '#ffe066',
    stairs: '#ffff76',
    playerHead: '#f8ff3b',
    playerFace: '#150000',
    playerBody: '#3df25c',
    playerDead: '#ff2d2d',
    playerWon: '#fff27d',
  },
];

export function getDungeonStyle(dungeonFloor: number): DungeonStyle {
  let style = DUNGEON_STYLES[0];
  for (const candidate of DUNGEON_STYLES) {
    if (dungeonFloor >= candidate.minFloor) {
      style = candidate;
    }
  }
  return style;
}

/** Compatibility palette for glyph-style callers and tests. */
export const TILE_COLORS: Record<string, string> = {
  [TILE.WALL_H]: DUNGEON_STYLES[0].wall,
  [TILE.WALL_V]: DUNGEON_STYLES[0].wall,
  [TILE.CORNER_TL]: DUNGEON_STYLES[0].wall,
  [TILE.CORNER_TR]: DUNGEON_STYLES[0].wall,
  [TILE.CORNER_BL]: DUNGEON_STYLES[0].wall,
  [TILE.CORNER_BR]: DUNGEON_STYLES[0].wall,
  [TILE.FLOOR]: DUNGEON_STYLES[0].floorDot,
  [TILE.CORRIDOR]: DUNGEON_STYLES[0].corridor,
  [TILE.DOOR]: DUNGEON_STYLES[0].door,
  [TILE.STAIRS_UP]: DUNGEON_STYLES[0].stairs,
  [TILE.STAIRS_DOWN]: DUNGEON_STYLES[0].stairs,
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

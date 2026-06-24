import { FLOOR_MAX, FLOOR_MIN } from './backgrounds';

export interface ChromeOverlayTexture {
  /** Stable prompt/candidate id from scripts/gen-chrome-overlay-textures.mjs. */
  id: number;
  key: string;
  label: string;
  band: 'stone' | 'overgrowth' | 'cave' | 'metal' | 'wood' | 'elemental';
  file: string;
}

export interface ChromeOverlayLayer {
  textureKey: string;
  /** Final CSS opacity for this decorative chrome layer. */
  opacity: number;
  /** Repeated tile size in CSS pixels. */
  tileSize: number;
}

export interface ChromeOverlayFloorAssignment {
  floor: number;
  layers: ChromeOverlayLayer[];
}

export const CHROME_OVERLAY_TEXTURES: ChromeOverlayTexture[] = [
  texture(1, 'old-ashlar', 'Old Ashlar', 'stone'),
  texture(3, 'black-basalt', 'Black Basalt', 'stone'),
  texture(4, 'granite-rubble', 'Granite Rubble', 'stone'),
  texture(6, 'sandstone-crypt', 'Sandstone Crypt', 'stone'),
  texture(7, 'salt-crust', 'Salt Crust', 'stone'),
  texture(8, 'moss-mortar', 'Moss Mortar', 'overgrowth'),
  texture(9, 'root-veined-rock', 'Root Veined Rock', 'overgrowth'),
  texture(10, 'lichen-bricks', 'Lichen Bricks', 'overgrowth'),
  texture(11, 'fungal-stone', 'Fungal Stone', 'overgrowth'),
  texture(12, 'ivy-shadow', 'Ivy Shadow', 'overgrowth'),
  texture(13, 'clay-cave', 'Clay Cave', 'cave'),
  texture(15, 'shale-strata', 'Shale Strata', 'cave'),
  texture(16, 'lava-cooled', 'Lava Cooled', 'cave'),
  texture(17, 'crystal-dust', 'Crystal Dust', 'cave'),
  texture(19, 'iron-banded', 'Iron Banded', 'metal'),
  texture(20, 'verdigris-copper', 'Verdigris Copper', 'metal'),
  texture(22, 'chainmail-shadow', 'Chainmail Shadow', 'metal'),
  texture(23, 'rust-patina', 'Rust Patina', 'metal'),
  texture(24, 'charred-plank', 'Charred Plank', 'wood'),
  texture(26, 'root-wattle', 'Root Wattle', 'wood'),
  texture(27, 'coffin-wood', 'Coffin Wood', 'wood'),
  texture(33, 'ice-rimed-brick', 'Ice Rimed Brick', 'elemental'),
  texture(34, 'ember-mortar', 'Ember Mortar', 'elemental'),
];

export const CHROME_OVERLAY_FLOOR_ASSIGNMENTS: ChromeOverlayFloorAssignment[] = [
  floor(1, layer('old-ashlar')),
  floor(2, layer('granite-rubble')),
  floor(3, layer('salt-crust')),
  floor(4, layer('moss-mortar'), layer('root-wattle', 0.07, 176)),
  floor(5, layer('sandstone-crypt'), layer('coffin-wood', 0.07, 192)),
  floor(6, layer('root-veined-rock')),
  floor(7, layer('lichen-bricks')),
  floor(8, layer('fungal-stone')),
  floor(9, layer('clay-cave')),
  floor(10, layer('shale-strata')),
  floor(11, layer('crystal-dust')),
  floor(12, layer('ivy-shadow'), layer('ice-rimed-brick', 0.07, 160)),
  floor(13, layer('verdigris-copper')),
  floor(14, layer('chainmail-shadow')),
  floor(15, layer('black-basalt')),
  floor(16, layer('rust-patina')),
  floor(17, layer('charred-plank')),
  floor(18, layer('iron-banded')),
  floor(19, layer('lava-cooled')),
  floor(20, layer('ember-mortar')),
];

const TEXTURES_BY_KEY = new Map(CHROME_OVERLAY_TEXTURES.map(texture => [texture.key, texture]));
const ASSIGNMENTS_BY_FLOOR = new Map(CHROME_OVERLAY_FLOOR_ASSIGNMENTS.map(rule => [rule.floor, rule]));

export function chromeOverlayUrl(file: string): string {
  return `/chrome-overlays/${file}`;
}

export function chromeOverlayTextureByKey(key: string): ChromeOverlayTexture | undefined {
  return TEXTURES_BY_KEY.get(key);
}

export function chromeOverlaysForFloor(floorNumber: number): ChromeOverlayLayer[] {
  return ASSIGNMENTS_BY_FLOOR.get(clampFloor(floorNumber))?.layers ?? [];
}

function texture(
  id: number,
  key: string,
  label: string,
  band: ChromeOverlayTexture['band'],
): ChromeOverlayTexture {
  return {
    id,
    key,
    label,
    band,
    file: `texture-${String(id).padStart(2, '0')}-${key}.png`,
  };
}

function floor(floorNumber: number, ...layers: ChromeOverlayLayer[]): ChromeOverlayFloorAssignment {
  return { floor: floorNumber, layers };
}

function layer(textureKey: string, opacity = 0.18, tileSize = 144): ChromeOverlayLayer {
  return { textureKey, opacity, tileSize };
}

function clampFloor(floorNumber: number): number {
  if (!Number.isFinite(floorNumber)) return FLOOR_MIN;
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Math.trunc(floorNumber)));
}

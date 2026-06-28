import { FLOOR_MAX, FLOOR_MIN, backgroundUrl } from '../ui/backgrounds';
import {
  chromeOverlayTextureByKey,
  chromeOverlayUrl,
  chromeOverlaysForFloor,
} from '../ui/chromeOverlays';

export const FLOOR_BACKGROUND_READY_WAIT_MS = 180;

interface ArtUrlView {
  artUrl?: string;
}

interface PortraitSlugView {
  id?: string;
}

export interface FloorStageImagePlanInput {
  floor: number;
  stairsNearby: boolean;
  hasAmulet?: boolean;
  maxFloor?: number;
  pickBackground: (floor: number) => string;
}

export interface FloorStageImageTarget {
  floor: number;
  backgroundUrl: string;
  chromeOverlayUrls: string[];
}

export interface FloorStageImagePlan {
  current: FloorStageImageTarget;
  neighbor: FloorStageImageTarget | null;
}

export function floorStageImagePlan(input: FloorStageImagePlanInput): FloorStageImagePlan {
  const floor = clampFloor(input.floor, input.maxFloor);
  const current = floorStageImageTarget(floor, input.pickBackground);
  const neighborFloor = input.stairsNearby
    ? likelyNeighborFloor(floor, {
        hasAmulet: input.hasAmulet,
        maxFloor: input.maxFloor,
      })
    : null;

  return {
    current,
    neighbor: neighborFloor === null ? null : floorStageImageTarget(neighborFloor, input.pickBackground),
  };
}

export function likelyNeighborFloor(
  floor: number,
  options: { hasAmulet?: boolean; maxFloor?: number } = {},
): number | null {
  const maxFloor = validMaxFloor(options.maxFloor);
  const current = clampFloor(floor, maxFloor);

  if (options.hasAmulet) {
    return current > FLOOR_MIN ? current - 1 : null;
  }
  if (current < maxFloor) return current + 1;
  return current > FLOOR_MIN ? current - 1 : null;
}

export function chromeOverlayTextureUrlsForFloor(floor: number): string[] {
  return chromeOverlaysForFloor(floor)
    .map(layer => chromeOverlayTextureByKey(layer.textureKey))
    .filter(texture => texture !== undefined)
    .map(texture => chromeOverlayUrl(texture.file));
}

export function inventoryArtUrlsForReadiness(
  inventoryItems: readonly ArtUrlView[],
  equipment: readonly ArtUrlView[] = [],
): string[] {
  return uniqueImageUrls([
    ...inventoryItems.map(item => item.artUrl),
    ...equipment.map(item => item.artUrl),
  ]);
}

export function combatPortraitArtUrlForReadiness(portrait: PortraitSlugView | null | undefined): string | null {
  const id = cleanUrlPart(portrait?.id);
  return id ? `/bestiary/${id}.png` : null;
}

export function uniqueImageUrls(urls: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = cleanUrlPart(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function floorStageImageTarget(
  floor: number,
  pickBackground: (floor: number) => string,
): FloorStageImageTarget {
  return {
    floor,
    backgroundUrl: backgroundUrl(pickBackground(floor)),
    chromeOverlayUrls: chromeOverlayTextureUrlsForFloor(floor),
  };
}

function clampFloor(floor: number, maxFloor?: number): number {
  const max = validMaxFloor(maxFloor);
  if (!Number.isFinite(floor)) return FLOOR_MIN;
  return Math.min(max, Math.max(FLOOR_MIN, Math.trunc(floor)));
}

function validMaxFloor(maxFloor?: number): number {
  if (typeof maxFloor !== 'number' || !Number.isFinite(maxFloor)) return FLOOR_MAX;
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Math.trunc(maxFloor)));
}

function cleanUrlPart(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

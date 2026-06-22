import { slugify } from '../discovery';
import type { GearItem, PotionType } from '../types';

export function inventoryArtUrl(name: string): string {
  return `/inventory/${slugify(name)}.png`;
}

export function foodArtUrl(): string {
  return inventoryArtUrl('Rations');
}

export function potionArtUrl(type: PotionType): string {
  return inventoryArtUrl(`Potion of ${type}`);
}

export function gearArtUrl(item: GearItem): string {
  return inventoryArtUrl(item.name);
}

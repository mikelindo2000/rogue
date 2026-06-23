import { slugify } from '../discovery';
import type { GearItem, PotionType, ScrollType, WandItem } from '../types';

export function inventoryArtUrl(name: string): string {
  return `/inventory/${slugify(name)}.png`;
}

export function inventoryArtName(name: string): string {
  return name.replace(/ \+\d+$/, '');
}

export function foodArtUrl(): string {
  return inventoryArtUrl('Rations');
}

export function potionArtUrl(type: PotionType): string {
  return inventoryArtUrl(`Potion of ${type}`);
}

export function scrollArtUrl(type: ScrollType): string {
  return inventoryArtUrl(`Scroll of ${type}`);
}

export function gearArtUrl(item: GearItem): string {
  return inventoryArtUrl(inventoryArtName(item.name));
}

export function wandArtUrl(wand: WandItem): string {
  return inventoryArtUrl(wand.name);
}

import type { ArmorSlot, GearItem, Player } from './types';
import { ARMOR_SLOTS } from './types';
import type { RNG } from './rng';
import { BALANCE } from './config';

export type GearHealthTone = 'none' | 'good' | 'worn' | 'bad' | 'broken';

export interface GearDamageResult {
  item: GearItem;
  slot: ArmorSlot | 'shield';
  before: number;
  after: number;
  max: number;
  broken: boolean;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function isDefensiveGear(item: GearItem | undefined): item is GearItem {
  if (!item || item.name === 'None') return false;
  return item.def !== undefined || item.maxDef !== undefined || item.health !== undefined;
}

export function normalizeGearHealth(item: GearItem): GearItem {
  if (!isDefensiveGear(item)) return item;

  const rawMax = item.health?.max ?? item.maxDef ?? item.def ?? 0;
  const max = Math.max(0, Math.round(rawMax));
  const rawCurrent = item.health?.current ?? item.def ?? max;
  const current = clampInt(rawCurrent, 0, max);

  item.health = { current, max };
  item.def = current;
  item.maxDef = max;
  return item;
}

export function normalizeAllGearHealth(player: Player): Player {
  player.inventory.shield.forEach(normalizeGearHealth);
  for (const slot of ARMOR_SLOTS) {
    player.inventory[slot].forEach(normalizeGearHealth);
  }
  return player;
}

export function effectiveDefense(item: GearItem | undefined): number {
  if (!isDefensiveGear(item)) return 0;
  normalizeGearHealth(item);
  return item.health?.current ?? item.def ?? 0;
}

export function gearHealthRatio(item: GearItem | undefined): number | null {
  if (!isDefensiveGear(item)) return null;
  normalizeGearHealth(item);
  const max = item.health?.max ?? 0;
  if (max <= 0) return null;
  return (item.health?.current ?? 0) / max;
}

export function gearHealthTone(item: GearItem | undefined): GearHealthTone {
  const ratio = gearHealthRatio(item);
  if (ratio === null) return 'none';
  if (ratio <= 0) return 'broken';
  if (ratio <= BALANCE.gearHealth.badRatio) return 'bad';
  if (ratio <= BALANCE.gearHealth.wornRatio) return 'worn';
  return 'good';
}

export function gearHealthLabel(item: GearItem | undefined): string | null {
  if (!isDefensiveGear(item)) return null;
  normalizeGearHealth(item);
  const max = item.health?.max ?? 0;
  if (max <= 0) return null;
  return `${item.health?.current ?? 0}/${max}`;
}

function equippedDefensiveGear(player: Player): Array<{ item: GearItem; slot: ArmorSlot | 'shield' }> {
  const items: Array<{ item: GearItem; slot: ArmorSlot | 'shield' }> = [];

  for (const slot of ARMOR_SLOTS) {
    const item = player.inventory[slot][player.equipped[slot]];
    if (effectiveDefense(item) > 0) items.push({ item, slot });
  }

  if (player.equipped.offHand.startsWith('shield:')) {
    const shieldIdx = Number(player.equipped.offHand.split(':')[1]);
    const item = player.inventory.shield[shieldIdx];
    if (effectiveDefense(item) > 0) items.push({ item, slot: 'shield' });
  }

  return items;
}

export function damageEquippedGear(player: Player, rng: RNG, damageTaken: number): GearDamageResult | null {
  if (damageTaken <= 0) return null;
  const candidates = equippedDefensiveGear(player);
  if (candidates.length === 0) return null;

  const chance = Math.max(
    BALANCE.gearHealth.minWearChance,
    Math.min(
      BALANCE.gearHealth.maxWearChance,
      BALANCE.gearHealth.baseWearChance + damageTaken * BALANCE.gearHealth.damageWearScale
    )
  );
  if (!rng.chance(chance)) return null;

  const target = rng.pick(candidates);
  normalizeGearHealth(target.item);
  const before = target.item.health?.current ?? 0;
  const max = target.item.health?.max ?? 0;
  const after = Math.max(0, before - 1);
  target.item.health = { current: after, max };
  target.item.def = after;
  target.item.maxDef = max;

  return {
    item: target.item,
    slot: target.slot,
    before,
    after,
    max,
    broken: before > 0 && after === 0,
  };
}

export function repairGear(item: GearItem): boolean {
  if (!isDefensiveGear(item)) return false;
  normalizeGearHealth(item);
  const max = item.health?.max ?? 0;
  const current = item.health?.current ?? 0;
  if (max <= 0 || current >= max) return false;
  item.health = { current: max, max };
  item.def = max;
  item.maxDef = max;
  return true;
}

export function repairAllDefensiveGear(player: Player): number {
  let repaired = 0;
  player.inventory.shield.forEach(item => {
    if (repairGear(item)) repaired++;
  });
  for (const slot of ARMOR_SLOTS) {
    player.inventory[slot].forEach(item => {
      if (repairGear(item)) repaired++;
    });
  }
  return repaired;
}

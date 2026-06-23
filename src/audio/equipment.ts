/**
 * Equipment-change detection by snapshot diff. The engine snapshots the
 * equipped set before and after a command, then diffs to decide which equip /
 * unequip cues to emit. This stays out of src/player.ts (pure mutation logic)
 * and works regardless of which equip path was taken, since they all funnel
 * through equipValidated.
 */
import type { Player, GearItem } from '../types';
import { ARMOR_SLOTS } from '../types';
import type { SoundEvent } from './events';

/** A per-slot token: 'none' when the slot holds nothing/a "None" item, else a
 *  stable identity so swapping one real item for another reads as a change. */
export interface EquipSnapshot {
  mainHand: string;
  offHand: string;
  helm: string;
  chest: string;
  legs: string;
  gauntlets: string;
  boots: string;
}

function gearToken(item: GearItem | undefined): string {
  if (!item || item.name === 'None') return 'none';
  return `${item.name}:${item.def ?? item.dmg ?? ''}`;
}

/** Resolve the offHand string ("none:0" | "weapon:N" | "shield:N") to a token
 *  that records both its kind (so we can classify the cue) and its identity. */
function offHandToken(player: Player): string {
  const oh = player.equipped.offHand;
  if (oh.startsWith('weapon:')) {
    const idx = parseInt(oh.split(':')[1] ?? '', 10);
    return `weapon:${gearToken(player.inventory.weapons[idx])}`;
  }
  if (oh.startsWith('shield:')) {
    const idx = parseInt(oh.split(':')[1] ?? '', 10);
    return `shield:${gearToken(player.inventory.shield[idx])}`;
  }
  return 'none';
}

export function snapshotEquipped(player: Player): EquipSnapshot {
  const snap = {
    mainHand: gearToken(player.inventory.weapons[player.equipped.mainHand]),
    offHand: offHandToken(player),
  } as EquipSnapshot;
  for (const slot of ARMOR_SLOTS) {
    snap[slot] = gearToken(player.inventory[slot][player.equipped[slot]]);
  }
  return snap;
}

/**
 * Diff two snapshots into equip/unequip cues. A two-handed weapon that
 * auto-clears the off-hand yields both an equipWeapon and (if a shield was
 * there) an unequipArmor — the audio service de-dupes with a short cooldown.
 */
export function diffEquipped(before: EquipSnapshot, after: EquipSnapshot): SoundEvent[] {
  const out: SoundEvent[] = [];

  if (before.mainHand !== after.mainHand && after.mainHand !== 'none') {
    out.push({ type: 'equipment.equipWeapon' });
  }

  if (before.offHand !== after.offHand) {
    if (after.offHand.startsWith('weapon:')) {
      out.push({ type: 'equipment.equipWeapon' });
    } else if (after.offHand.startsWith('shield:')) {
      out.push({ type: 'equipment.equipArmor' });
    } else if (before.offHand.startsWith('shield:')) {
      // shield removed (weapon→none is covered by the mainHand equip cue)
      out.push({ type: 'equipment.unequipArmor' });
    }
  }

  for (const slot of ARMOR_SLOTS) {
    if (before[slot] === after[slot]) continue;
    out.push({ type: after[slot] === 'none' ? 'equipment.unequipArmor' : 'equipment.equipArmor' });
  }

  return out;
}

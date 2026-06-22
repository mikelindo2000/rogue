import { Player, StatusEffects, ARMOR_SLOTS, EquipSlot, EquipTarget, InventoryRef } from './types';
import { getConfig, getScaledXpRequirements, BALANCE } from './config';

export function createPlayer(): Player {
  const tunables = getConfig();
  return {
    x: 0,
    y: 0,
    hp: tunables.playerStartingHp,
    maxHp: tunables.playerStartingHp,
    gold: 0,
    hunger: tunables.hungerMax, // default 800
    baseAtk: tunables.playerBaseAtk,
    regenTurns: 0,
    disarmedHits: 0,
    undeadFoods: 0,
    level: 1,
    xp: 0,
    inventory: {
      food: 0,
      weapons: [{ name: "Iron Dagger", type: "dagger", dmg: 2, rarity: "common" }],
      shield: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }],
      helm: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }],
      chest: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }, { name: "Tattered Rags", def: 1, maxDef: 1, rarity: "common" }],
      legs: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }],
      gauntlets: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }],
      boots: [{ name: "None", def: 0, maxDef: 0, rarity: "common" }],
      potions: []
    },
    equipped: {
      mainHand: 0,
      offHand: "none:0",
      helm: 0,
      chest: 1,
      legs: 0,
      gauntlets: 0,
      boots: 0
    }
  };
}

export function getTotalDef(player: Player, statusEffects: StatusEffects): number {
  let def = 0;

  ARMOR_SLOTS.forEach(slot => {
    const gear = player.inventory[slot][player.equipped[slot]];
    if (gear && gear.def !== undefined) {
      def += gear.def;
    }
  });

  if (player.equipped.offHand.startsWith('shield:')) {
    const shieldIdx = parseInt(player.equipped.offHand.split(':')[1]);
    const shield = player.inventory.shield[shieldIdx];
    if (shield && shield.def !== undefined) {
      def += shield.def;
    }
  }

  if (statusEffects.armorTurns > 0) {
    def += BALANCE.status.armorDefBonus;
  }

  return def;
}

export function gainXp(player: Player, amount: number, addLog: (msg: string) => void, statusEffects: StatusEffects): boolean {
  if (player.level >= 20 || amount <= 0) return false;
  player.xp += amount;

  const xpReqs = getScaledXpRequirements();
  let req = xpReqs[player.level] || 209800;
  let leveledUp = false;

  while (player.xp >= req && player.level < 20) {
    player.xp -= req;
    player.level++;
    player.maxHp = Math.floor(player.maxHp * BALANCE.player.levelUpHpMultiplier);
    player.hp = statusEffects.vigorTurns > 0 ? player.maxHp * BALANCE.status.vigorHpMultiplier : player.maxHp;
    addLog(`LEVEL UP! You are now Level ${player.level}! Max HP increased!`);
    req = xpReqs[player.level] || 209800;
    leveledUp = true;
  }

  return leveledUp;
}

export function handleEquipItem(
  player: Player,
  slot: EquipSlot,
  value: string,
  addLog: (msg: string) => void
): boolean {
  const target = equipTargetFromSlotValue(slot, value);
  if (!target) {
    addLog("Cannot equip that item.");
    return false;
  }
  return equipValidated(player, target, addLog);
}

function isTwoHanded(player: Player): boolean {
  const mainWep = player.inventory.weapons[player.equipped.mainHand];
  return mainWep?.type?.startsWith('2h_') || mainWep?.type === 'staff';
}

function normalizeOffHand(player: Player, addLog: (msg: string) => void) {
  if (isTwoHanded(player) && player.equipped.offHand !== "none:0") {
    player.equipped.offHand = "none:0";
    addLog("Off-hand unequipped (2-Handed weapon requirement).");
    return;
  }

  if (!player.equipped.offHand.startsWith('weapon:')) return;
  const offIdx = Number(player.equipped.offHand.split(':')[1]);
  const main = player.inventory.weapons[player.equipped.mainHand];
  const off = player.inventory.weapons[offIdx];
  if (!main || !off || main.type !== 'dagger' || off.type !== 'dagger' || offIdx === player.equipped.mainHand) {
    player.equipped.offHand = "none:0";
    addLog("Off-hand weapon unequipped.");
  }
}

function equipTargetFromSlotValue(slot: EquipSlot, value: string): EquipTarget | null {
  if (slot === 'offHand') return { slot, value };
  const index = Number(value);
  if (!Number.isInteger(index)) return null;
  return { slot, index };
}

export function inventoryRefToEquipTarget(player: Player, ref: InventoryRef): EquipTarget | null {
  if (ref.kind === 'weapon') {
    if (!player.inventory.weapons[ref.index]) return null;
    return { slot: 'mainHand', index: ref.index };
  }
  if (ref.kind === 'armor') {
    if (!player.inventory[ref.slot][ref.index]) return null;
    return { slot: ref.slot, index: ref.index };
  }
  if (ref.kind === 'shield') {
    if (!player.inventory.shield[ref.index]) return null;
    return { slot: 'offHand', value: `shield:${ref.index}` };
  }
  return null;
}

export function canEquip(player: Player, target: EquipTarget): { ok: true } | { ok: false; reason: string } {
  if (target.slot === 'mainHand') {
    const weapon = player.inventory.weapons[target.index];
    if (!weapon) return { ok: false, reason: 'That weapon is no longer in your pack.' };
    return { ok: true };
  }

  if (target.slot === 'offHand') {
    if (target.value === 'none:0') return { ok: true };
    if (isTwoHanded(player)) return { ok: false, reason: 'Two-handed weapons require an empty off-hand.' };

    if (target.value.startsWith('shield:')) {
      const index = Number(target.value.split(':')[1]);
      if (!Number.isInteger(index) || index <= 0 || !player.inventory.shield[index]) {
        return { ok: false, reason: 'That shield is no longer in your pack.' };
      }
      return { ok: true };
    }

    if (target.value.startsWith('weapon:')) {
      const index = Number(target.value.split(':')[1]);
      const main = player.inventory.weapons[player.equipped.mainHand];
      const off = player.inventory.weapons[index];
      if (!Number.isInteger(index) || !off) return { ok: false, reason: 'That weapon is no longer in your pack.' };
      if (index === player.equipped.mainHand) return { ok: false, reason: 'You cannot hold the same weapon in both hands.' };
      if (main?.type !== 'dagger' || off.type !== 'dagger') return { ok: false, reason: 'Dual wielding requires a dagger in each hand.' };
      return { ok: true };
    }

    return { ok: false, reason: 'That off-hand item cannot be equipped.' };
  }

  const armor = player.inventory[target.slot][target.index];
  if (!armor) return { ok: false, reason: 'That armor is no longer in your pack.' };
  return { ok: true };
}

export function equipValidated(
  player: Player,
  target: EquipTarget,
  addLog: (msg: string) => void
): boolean {
  const result = canEquip(player, target);
  if (!result.ok) {
    addLog(result.reason);
    return false;
  }

  if (target.slot === 'mainHand') {
    player.equipped.mainHand = target.index;
    normalizeOffHand(player, addLog);
    return true;
  }

  if (target.slot === 'offHand') {
    player.equipped.offHand = target.value;
    normalizeOffHand(player, addLog);
    return true;
  }

  player.equipped[target.slot] = target.index;
  return true;
}

import { Player, StatusEffects, GearItem } from './types';
import { getConfig, getScaledXpRequirements } from './config';

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
  const armorSlots = ['helm', 'chest', 'legs', 'gauntlets', 'boots'];
  
  armorSlots.forEach(slot => {
    const gearList = player.inventory[slot] as GearItem[];
    const equippedIdx = player.equipped[slot] as number;
    const gear = gearList[equippedIdx];
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
    def += 100;
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
    player.maxHp = Math.floor(player.maxHp * 1.15);
    player.hp = statusEffects.vigorTurns > 0 ? player.maxHp * 2 : player.maxHp;
    addLog(`LEVEL UP! You are now Level ${player.level}! Max HP increased!`);
    req = xpReqs[player.level] || 209800;
    leveledUp = true;
  }

  return leveledUp;
}

export function handleEquipItem(
  player: Player,
  slot: string,
  value: string,
  addLog: (msg: string) => void
) {
  if (slot === 'offHand') {
    player.equipped.offHand = value;
  } else {
    player.equipped[slot] = parseInt(value);
  }

  const mainWep = player.inventory.weapons[player.equipped.mainHand];
  const is2H = mainWep?.type?.startsWith('2h_') || mainWep?.type === 'staff';

  if (is2H && player.equipped.offHand !== "none:0") {
    player.equipped.offHand = "none:0";
    addLog("Off-hand unequipped (2-Handed weapon requirement).");
  }
}

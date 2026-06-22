/* Reactive UI state bridge.

   The engine stays the imperative source of truth; GameUI (src/ui.ts) writes a
   plain snapshot into `ui` after each turn, and the Svelte chrome renders from
   it. Mutating `ui`'s properties is reactive (Svelte 5 deep proxy), so no manual
   subscriptions are needed. `actions` is wired by main.ts to call engine methods. */

import type { EquipSlot } from '../types';
import type { IconName } from './icons';
import type { HungerTone } from './format';

/** One selectable option in an equipment slot's picker. */
export interface EquipOption {
  value: string; // engine equip value (index or "shield:2" etc.)
  label: string;
  rarityColor: string; // var(--rarity-…)
  selected: boolean;
  disabled?: boolean;
}

/** A single equipment slot row in the left rail. */
export interface EquipSlotView {
  slot: EquipSlot;
  label: string; // "Main hand"
  icon: IconName;
  itemName: string; // "" when empty
  rarityColor: string;
  empty: boolean;
  options: EquipOption[];
}

/** One cell in the right-rail inventory grid. */
export interface InventoryCell {
  icon: IconName;
  rarityColor: string;
  count?: number; // shown as a badge when > 1
  label: string; // accessible name / tooltip
}

export interface PotionOption {
  idx: number;
  label: string;
}

export interface LogLineView {
  n: number; // gutter sequence number
  html: string; // pre-styled message markup (from getStyledItemName etc.)
  highlight?: boolean; // loot / notable lines get the accent treatment
}

export interface NearbyMonster {
  name: string;
  hp: number;
  maxHp: number;
  glyph: string;
  color: string; // raw monster color (game palette) for the glyph chip
  hostile: boolean;
  subtitle?: string;
}

export interface UIState {
  // top bar
  floor: number;
  floorMax: number;
  floorName: string;
  gold: number;
  def: number;
  turn: number;
  // character
  charName: string;
  charClass: string;
  glyph: string;
  level: number;
  // vitals
  hp: number;
  maxHp: number;
  xp: number;
  xpReq: number;
  atMaxLevel: boolean;
  hungerStatus: string;
  hungerPct: number;
  hungerTone: HungerTone;
  // consumables
  food: number;
  foodMax: number;
  // panels
  equipment: EquipSlotView[];
  inventory: InventoryCell[];
  inventoryCount: number;
  inventoryMax: number;
  potions: PotionOption[];
  logs: LogLineView[];
  // center-stage overlays
  stairsNearby: boolean;
  nearbyMonster: NearbyMonster | null;
  // run state
  gameOver: boolean;
  gameWon: boolean;
  // overlays
  compendiumOpen: boolean;
}

export const ui = $state<UIState>({
  floor: 1,
  floorMax: 20,
  floorName: '',
  gold: 0,
  def: 0,
  turn: 0,
  charName: 'The Wretch',
  charClass: 'Rogue',
  glyph: '@',
  level: 1,
  hp: 0,
  maxHp: 0,
  xp: 0,
  xpReq: 1,
  atMaxLevel: false,
  hungerStatus: 'Satiated',
  hungerPct: 100,
  hungerTone: 'ok',
  food: 0,
  foodMax: 4,
  equipment: [],
  inventory: [],
  inventoryCount: 0,
  inventoryMax: 20,
  potions: [],
  logs: [],
  stairsNearby: false,
  nearbyMonster: null,
  gameOver: false,
  gameWon: false,
  compendiumOpen: false,
});

/** Action hooks the chrome calls; main.ts points these at the live engine. */
export interface UIActions {
  equip(slot: EquipSlot, value: string): void;
  usePotion(idx: number): void;
  eat(): void;
  restart(): void;
  setCompendiumOpen(open: boolean): void;
}

export const actions: UIActions = {
  equip: () => {},
  usePotion: () => {},
  eat: () => {},
  restart: () => {},
  setCompendiumOpen: () => {},
};

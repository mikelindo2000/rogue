/* Reactive UI state bridge.

   The engine stays the imperative source of truth; GameUI (src/ui.ts) writes a
   plain snapshot into `ui` after each turn, and the Svelte chrome renders from
   it. Mutating `ui`'s properties is reactive (Svelte 5 deep proxy), so no manual
   subscriptions are needed. `actions` is wired by main.ts to call engine methods. */

import type { EquipSlot, InventoryAction, InventoryRef } from '../types';
import type { IconName } from './icons';
import type { HungerTone } from './format';
import { emptyDiscovery, type DiscoveryState } from '../discovery';
import { DEFAULT_PLAYER_SPRITE, type PlayerSprite } from '../render/avatar';

/** One selectable option in an equipment slot's picker. */
export interface EquipOption {
  value: string; // engine equip value (index or "shield:2" etc.)
  label: string;
  meta?: string;
  rarityColor: string; // var(--rarity-…)
  selected: boolean;
  disabled?: boolean;
  reason?: string;
}

/** A single equipment slot row in the left rail. */
export interface EquipSlotView {
  slot: EquipSlot;
  label: string; // "Main hand"
  icon: IconName;
  itemName: string; // "" when empty
  emptyLabel?: string;
  statLabel: string;
  rarityColor: string;
  empty: boolean;
  availableCount: number;
  availableLabel: string;
  hasUpgrade: boolean;
  options: EquipOption[];
}

/** One cell in the right-rail inventory grid. */
export interface InventoryCell {
  icon: IconName;
  artUrl: string;
  rarityColor: string;
  count?: number; // shown as a badge when > 1
  label: string; // accessible name / tooltip
  detail: string;
  ref: InventoryRef;
  equipped?: boolean;
  actions: InventoryActionView[];
}

export interface InventoryActionView {
  action: InventoryAction;
  label: string;
  disabled?: boolean;
  reason?: string;
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
  /** Current player avatar — drives the bestiary cinematic's hero. */
  playerSprite: PlayerSprite;
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
  inventoryItems: InventoryCell[];
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
  inventoryOpen: boolean;
  selectedInventoryRef: InventoryRef | null;
  /** Dev-only balance report overlay (⌘/Ctrl+B). */
  balancePanelOpen: boolean;
  // meta-progression: which monsters the player has discovered
  discovery: DiscoveryState;
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
  playerSprite: DEFAULT_PLAYER_SPRITE,
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
  inventoryItems: [],
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
  inventoryOpen: false,
  selectedInventoryRef: null,
  balancePanelOpen: false,
  discovery: emptyDiscovery(),
});

/** Action hooks the chrome calls; main.ts points these at the live engine. */
export interface UIActions {
  equip(slot: EquipSlot, value: string): void;
  usePotion(idx: number): void;
  eat(): void;
  restart(): void;
  setCompendiumOpen(open: boolean): void;
  setInventoryOpen(open: boolean): void;
  setBalancePanelOpen(open: boolean): void;
  selectInventoryItem(ref: InventoryRef | null): void;
  inventoryAction(ref: InventoryRef, action: InventoryAction): void;
}

export const actions: UIActions = {
  equip: () => {},
  usePotion: () => {},
  eat: () => {},
  restart: () => {},
  setCompendiumOpen: () => {},
  setInventoryOpen: () => {},
  setBalancePanelOpen: () => {},
  selectInventoryItem: () => {},
  inventoryAction: () => {},
};

/* Reactive UI state bridge.

   The engine stays the imperative source of truth; GameUI (src/ui.ts) writes a
   plain snapshot into `ui` after each turn, and the Svelte chrome renders from
   it. Mutating `ui`'s properties is reactive (Svelte 5 deep proxy), so no manual
   subscriptions are needed. `actions` is wired by main.ts to call engine methods. */

import type { EquipSlot, InventoryAction, InventoryRef } from '../types';
import type { IconName } from './icons';
import type { HungerTone, SurvivalWarningTone } from './format';
import { emptyDiscovery, type DiscoveryState } from '../discovery';
import { DEFAULT_PLAYER_SPRITE, type PlayerSprite } from '../render/avatar';
import type { RunSummaryV1 } from '../runStats';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';

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

export interface GearHealthView {
  label: string;
  ratio: number;
  tone: 'good' | 'worn' | 'bad' | 'broken';
  color: string;
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
  health?: GearHealthView;
}

/** One cell in the right-rail inventory grid. */
export interface InventoryCell {
  icon: IconName;
  artUrl: string;
  rarityColor: string;
  count?: number; // shown as a badge when > 1
  label: string; // accessible name / tooltip
  detail: string;
  statLabel?: string;
  tooltipStats?: InventoryTooltipStat[];
  comparisons?: InventoryComparisonView[];
  ref: InventoryRef;
  equipped?: boolean;
  actions: InventoryActionView[];
  health?: GearHealthView;
}

export interface InventoryTooltipStat {
  label: string;
  value: string;
  tone?: 'better' | 'worse' | 'neutral';
}

export interface InventoryComparisonView {
  slot: EquipSlot;
  slotLabel: string;
  icon: IconName;
  currentName: string;
  currentStatLabel: string;
  candidateName?: string;
  candidateStatLabel: string;
  deltaLabel: string;
  tone: 'better' | 'same' | 'worse' | 'blocked';
  note?: string;
}

export interface InventoryActionView {
  action: InventoryAction;
  label: string;
  disabled?: boolean;
  reason?: string;
}

export type InventoryFilterKind = 'all' | 'scroll';

export interface PotionOption {
  idx: number;
  label: string;
  icon: IconName;
  color: string;
}

export interface LogLineView {
  n: number; // gutter sequence number
  html: string; // pre-styled message markup (from getStyledItemName etc.)
  count?: number; // consecutive duplicate count
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
  strengthDrain: number;
  // vitals
  hp: number;
  maxHp: number;
  xp: number;
  xpReq: number;
  atMaxLevel: boolean;
  hungerStatus: string;
  hungerPct: number;
  hungerTone: HungerTone;
  survivalWarningTone: SurvivalWarningTone;
  survivalWarningIntensity: number;
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
  /** Non-null while a wand is drawn and awaiting an aim direction. Drives the
   *  transient aiming prompt overlay. */
  aiming: { wandName: string } | null;
  playerX: number;
  playerY: number;
  mapCols: number;
  mapRows: number;
  // run state
  gameOver: boolean;
  gameWon: boolean;
  // overlays
  compendiumOpen: boolean;
  inventoryOpen: boolean;
  inventoryFilterKind: InventoryFilterKind;
  selectedInventoryRef: InventoryRef | null;
  potionMenuOpen: boolean;
  /** Dev-only balance report overlay (⌘/Ctrl+B). */
  balancePanelOpen: boolean;
  settingsOpen: boolean;
  // audio settings (mirrors persisted settings.audio; bound by the settings modal)
  audioMuted: boolean;
  audioVolume: number; // 0..1
  musicMuted: boolean;
  musicVolume: number; // 0..1
  // meta-progression: which monsters the player has discovered
  discovery: DiscoveryState;
  // end-run stats and browser-local records
  endRunSummary: RunSummaryV1 | null;
  endRunRecords: BrowserRecords | null;
  endRunComparison: RunRecordComparison | null;
  endRunHistory: RunSummaryV1[];
  endRunCopyStatus: string;
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
  strengthDrain: 0,
  hp: 0,
  maxHp: 0,
  xp: 0,
  xpReq: 1,
  atMaxLevel: false,
  hungerStatus: 'Satiated',
  hungerPct: 100,
  hungerTone: 'ok',
  survivalWarningTone: 'none',
  survivalWarningIntensity: 0,
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
  aiming: null,
  playerX: 0,
  playerY: 0,
  mapCols: 46,
  mapRows: 29,
  gameOver: false,
  gameWon: false,
  compendiumOpen: false,
  inventoryOpen: false,
  inventoryFilterKind: 'all',
  selectedInventoryRef: null,
  potionMenuOpen: false,
  balancePanelOpen: false,
  settingsOpen: false,
  audioMuted: false,
  audioVolume: 1,
  musicMuted: false,
  musicVolume: 0.4,
  discovery: emptyDiscovery(),
  endRunSummary: null,
  endRunRecords: null,
  endRunComparison: null,
  endRunHistory: [],
  endRunCopyStatus: '',
});

/** Action hooks the chrome calls; main.ts points these at the live engine. */
export interface UIActions {
  moveOrAim(dx: number, dy: number): void;
  run(dx: number, dy: number): void;
  search(): void;
  readScroll(): void;
  drawFirstWand(): void;
  equip(slot: EquipSlot, value: string): void;
  usePotion(idx: number): void;
  eat(): void;
  restart(): void;
  setCompendiumOpen(open: boolean): void;
  setInventoryOpen(open: boolean): void;
  setInventoryFilterKind(kind: InventoryFilterKind): void;
  setPotionMenuOpen(open: boolean): void;
  setBalancePanelOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setAudioMuted(muted: boolean): void;
  setAudioVolume(volume: number): void;
  setMusicMuted(muted: boolean): void;
  setMusicVolume(volume: number): void;
  testSound(): void;
  copyEndRunSummary(): void;
  clearRunHistory(): void;
  selectInventoryItem(ref: InventoryRef | null): void;
  inventoryAction(ref: InventoryRef, action: InventoryAction): void;
  /** Draw a wand for aiming (or fire it immediately if self-targeted). */
  beginZap(ref: InventoryRef & { kind: 'wand' }): void;
  /** Fire the drawn wand in a unit direction. */
  zapInDirection(dx: number, dy: number): void;
  /** Abort aiming without spending a turn. */
  cancelZap(): void;
}

export const actions: UIActions = {
  moveOrAim: () => {},
  run: () => {},
  search: () => {},
  readScroll: () => {},
  drawFirstWand: () => {},
  equip: () => {},
  usePotion: () => {},
  eat: () => {},
  restart: () => {},
  setCompendiumOpen: () => {},
  setInventoryOpen: () => {},
  setInventoryFilterKind: () => {},
  setPotionMenuOpen: () => {},
  setBalancePanelOpen: () => {},
  setSettingsOpen: () => {},
  setAudioMuted: () => {},
  setAudioVolume: () => {},
  setMusicMuted: () => {},
  setMusicVolume: () => {},
  testSound: () => {},
  copyEndRunSummary: () => {},
  clearRunHistory: () => {},
  selectInventoryItem: () => {},
  inventoryAction: () => {},
  beginZap: () => {},
  zapInDirection: () => {},
  cancelZap: () => {},
};

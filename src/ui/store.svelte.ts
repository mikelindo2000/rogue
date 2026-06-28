/* Reactive UI state bridge.

   The engine stays the imperative source of truth; GameUI (src/ui.ts) writes a
   plain snapshot into `ui` after each turn, and the Svelte chrome renders from
   it. Mutating `ui`'s properties is reactive (Svelte 5 deep proxy), so no manual
   subscriptions are needed. `actions` is wired by main.ts to call engine methods. */

import type { EquipSlot, InventoryAction, InventoryRef } from '../types';
import type { GearVerdict } from './gearCompare';
import type { IconName } from './icons';
import type { HungerTone, SurvivalWarningTone } from './format';
import type { VisualEffectInstance } from './visualEffects';
import { emptyDiscovery, type DiscoveryState } from '../discovery';
import type { BoardSizeId } from '../boards';
import { DEFAULT_PLAYER_SPRITE, type PlayerSprite } from '../render/avatar';
import type { RunSummaryV1 } from '../runStats';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';
import type { ShortcutInfo } from '../keyboard';
import { copyPresentationMode, DEFAULT_PRESENTATION_MODE, type PresentationMode } from '../presentation/presenter';

/** One selectable option in an equipment slot's picker. */
export interface EquipOption {
  value: string; // engine equip value (index or "shield:2" etc.)
  label: string;
  meta?: string;
  rarityColor: string; // var(--rarity-…)
  selected: boolean;
  disabled?: boolean;
  reason?: string;
  /** How this option compares to what's equipped in the slot (undefined for the
   *  equipped option itself and for non-comparable empties). */
  verdict?: GearVerdict;
  /** Candidate dominates the equipped item on every axis ("clearly better"). */
  strictlyBetter?: boolean;
  /** This is the single strongest option for the slot. */
  isBest?: boolean;
  /** Durability bar for defensive options. */
  health?: GearHealthView;
}

/** A glanceable "better gear is in your pack" hint for a HUD slot. */
export interface SlotUpgradeHint {
  /** The best pack candidate is strictly better than what's worn. */
  strict: boolean;
  bestName: string;
  bestStat: string;
}

export interface GearHealthView {
  label: string;
  ratio: number;
  /** Durability points remaining / total — drives the segmented bar. */
  current: number;
  max: number;
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
  /** Custom generated art for the equipped item (empty string when none). */
  artUrl: string;
  availableCount: number;
  availableLabel: string;
  hasUpgrade: boolean;
  /** Populated when a strictly-/generally-better item sits in the pack. */
  upgrade?: SlotUpgradeHint;
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
  /** Gear-only: how this item compares to what's equipped in its slot. */
  verdict?: GearVerdict;
  strictlyBetter?: boolean;
  /** This is the single strongest option for its slot. */
  isBest?: boolean;
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
  count: number;
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

/** The combat portrait shown over the board while the player is in melee with a
 *  monster. Positioned in a board corner whose footprint is clear of drawn map,
 *  so it never covers a room/corridor. Null when not fighting (drives fade-out). */
export interface CombatPortrait {
  id: string; // bestiary slug -> /bestiary/${id}.png
  name: string;
  color: string; // monster palette color, tints the frame accent
  hp: number;
  maxHp: number;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  sizePx: number; // oval diameter in CSS px
}

export interface DebugMessage {
  id: string;
  text: string;
  timestamp: number;
  count?: number;
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
  /** Active declarative visual-effect layers for this frame (see
   *  src/ui/visualEffects.ts). Rendered by EffectLayerHost on each target. */
  visualEffects: VisualEffectInstance[];
  // consumables
  food: number;
  foodMax: number;
  // panels
  equipment: EquipSlotView[];
  inventoryItems: InventoryCell[];
  inventoryCount: number;
  /** Baseline slot count drawn in the HUD grid; the grid grows past this when
   *  the pack holds more items (the inventory itself is uncapped). */
  inventoryMax: number;
  potions: PotionOption[];
  logs: LogLineView[];
  // center-stage overlays
  stairsNearby: boolean;
  nearbyMonster: NearbyMonster | null;
  /** The framed portrait of the monster currently being fought (null = idle). */
  combatPortrait: CombatPortrait | null;
  /** Non-null while a wand is drawn and awaiting an aim direction. Drives the
   *  transient aiming prompt overlay. */
  aiming: { wandName: string } | null;
  // run state
  gameOver: boolean;
  gameWon: boolean;
  /** True once the Amulet of Ballard is claimed — drives the HUD objective badge
   *  reminding the player to escape to Floor 1. */
  hasAmulet: boolean;
  // overlays
  compendiumOpen: boolean;
  inventoryOpen: boolean;
  inventoryFilterKind: InventoryFilterKind;
  selectedInventoryRef: InventoryRef | null;
  /** Which equipment slot the loadout hub is focused on (null = the pack/grid
   *  view). Set when the hub is opened from a HUD slot. */
  selectedEquipSlot: EquipSlot | null;
  potionMenuOpen: boolean;
  /** Dev-only balance report overlay (⌘/Ctrl+B). */
  balancePanelOpen: boolean;
  settingsOpen: boolean;
  /** Keyboard-shortcuts help modal (opened with `?` or the footer affordance). */
  shortcutsOpen: boolean;
  /** First-run How-to-Play gate, shown over the board on a brand-new visit. */
  introOpen: boolean;
  /** Published once at startup from the KeyboardManager — the single source of
   *  truth the shortcuts modal and How-to-Play guide render from. */
  shortcuts: ShortcutInfo[];
  // audio settings (mirrors persisted settings.audio; bound by the settings modal)
  audioMuted: boolean;
  audioVolume: number; // 0..1
  musicMuted: boolean;
  musicVolume: number; // 0..1
  // board size for the next new game (mirrors persisted settings.boardSize)
  boardSize: BoardSizeId;
  // active floor-change transition effect id (mirrors persisted settings.floorTransition)
  floorTransition: string;
  /** Presentation framing mode published by the browser presenter. Components do
   *  not consume this yet; Phase 4 exposes it as chrome state only. */
  presentationMode: PresentationMode;
  // meta-progression: which monsters the player has discovered
  discovery: DiscoveryState;
  // end-run stats and browser-local records
  endRunSummary: RunSummaryV1 | null;
  /** False while a pre-ending transition is delaying the art/stat screen. */
  endRunPresentationReady: boolean;
  /** True only during the short map-plane death handoff animation. */
  endRunTransitionActive: boolean;
  endRunRecords: BrowserRecords | null;
  endRunComparison: RunRecordComparison | null;
  endRunHistory: RunSummaryV1[];
  endRunCopyStatus: string;
  showSoundDebug: boolean;
  debugMessages: DebugMessage[];
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
  visualEffects: [],
  food: 0,
  foodMax: 4,
  equipment: [],
  inventoryItems: [],
  inventoryCount: 0,
  inventoryMax: 20,
  potions: [],
  logs: [],
  stairsNearby: false,
  nearbyMonster: null,
  combatPortrait: null,
  aiming: null,
  gameOver: false,
  gameWon: false,
  hasAmulet: false,
  compendiumOpen: false,
  inventoryOpen: false,
  inventoryFilterKind: 'all',
  selectedInventoryRef: null,
  selectedEquipSlot: null,
  potionMenuOpen: false,
  balancePanelOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  introOpen: false,
  shortcuts: [],
  audioMuted: false,
  audioVolume: 1,
  musicMuted: false,
  musicVolume: 0.4,
  boardSize: 'classic',
  floorTransition: 'zpush',
  presentationMode: copyPresentationMode(DEFAULT_PRESENTATION_MODE),
  discovery: emptyDiscovery(),
  endRunSummary: null,
  endRunPresentationReady: true,
  endRunTransitionActive: false,
  endRunRecords: null,
  endRunComparison: null,
  endRunHistory: [],
  endRunCopyStatus: '',
  showSoundDebug: false,
  debugMessages: [],
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
  /** Abandon the current run and start a fresh game (applies the board size). */
  startNewGame(): void;
  setCompendiumOpen(open: boolean): void;
  setInventoryOpen(open: boolean): void;
  setInventoryFilterKind(kind: InventoryFilterKind): void;
  setPotionMenuOpen(open: boolean): void;
  setBalancePanelOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  /** Dismiss the first-run intro gate: hides it, persists the seen flag, and
   *  resumes game input. Wired in main.ts. */
  dismissIntro(): void;
  setAudioMuted(muted: boolean): void;
  setAudioVolume(volume: number): void;
  setMusicMuted(muted: boolean): void;
  setMusicVolume(volume: number): void;
  setBoardSize(id: BoardSizeId): void;
  /** Choose the active floor-change transition effect (persisted). */
  setFloorTransition(id: string): void;
  testSound(): void;
  copyEndRunSummary(): void;
  clearRunHistory(): void;
  selectInventoryItem(ref: InventoryRef | null): void;
  /** Open the loadout hub focused on an equipment slot (or null for the pack). */
  selectEquipSlot(slot: EquipSlot | null): void;
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
  startNewGame: () => {},
  setCompendiumOpen: () => {},
  setInventoryOpen: () => {},
  setInventoryFilterKind: () => {},
  setPotionMenuOpen: () => {},
  setBalancePanelOpen: () => {},
  setSettingsOpen: () => {},
  setShortcutsOpen: () => {},
  dismissIntro: () => {},
  setAudioMuted: () => {},
  setAudioVolume: () => {},
  setMusicMuted: () => {},
  setMusicVolume: () => {},
  setBoardSize: () => {},
  setFloorTransition: () => {},
  testSound: () => {},
  copyEndRunSummary: () => {},
  clearRunHistory: () => {},
  selectInventoryItem: () => {},
  selectEquipSlot: () => {},
  inventoryAction: () => {},
  beginZap: () => {},
  zapInDirection: () => {},
  cancelZap: () => {},
};

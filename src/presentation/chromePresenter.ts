import { BALANCE, getConfig, getScaledXpRequirements } from '../config';
import { snapshotDiscovery, monsterId, type DiscoveryState } from '../discovery';
import { potionVisual, scrollVisual } from '../itemVisuals';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';
import type { RunSummaryV1 } from '../runStats';
import { SCROLLS, scrollDisplayName } from '../scrolls';
import { STAIR_TILES } from '../tiles';
import { isWeaponCategory } from '../weapons';
import {
  type Item,
  type Monster,
  type Player,
  type StatusEffects,
  type TrapEffects,
} from '../types';
import {
  portraitSizePx,
  pickPortraitCorner,
  portraitsEqual,
  itemPickupsEqual,
} from '../ui/combatPortrait';
import { floorName, hungerView, rarityVar, survivalWarningView } from '../ui/format';
import { foodArtUrl, gearArtUrl, potionArtUrl, scrollArtUrl, wandArtUrl } from '../ui/inventoryArt';
import { shortGearStatText } from '../ui/inventoryStats';
import { appendLogLine } from '../ui/logHistory';
import { enrichLogMessageHtml } from '../ui/logMessage';
import { potionLabel } from '../ui/potionView';
import {
  ui,
  type CombatPortrait,
  type ItemPickupOverlay,
  type LogLineView,
} from '../ui/store.svelte';
import { bossTensionEffect, levelUpBloomEffect, visualEffectLayers, type VisualEffectInstance } from '../ui/visualEffects';
import { bossEncounterView, type BossSighting } from '../boss';
import { cloneValue, type ItemView, type MapSnapshot, type MonsterView } from './mapSnapshot';
import { formatStyledItemName } from './itemNameFormatter';
import { projectInventory } from './chrome/inventoryProjection';

export interface ChromePresenterOptions {
  readonly measureTileSize?: (cols: number, rows: number) => number;
  readonly setDisorientation?: (intensity: number) => void;
  /** Drives the map-plane boss-fight sway (composed with disorientation). */
  readonly setBossIntensity?: (intensity: number) => void;
}

export interface EndRunChromeState {
  readonly summary?: RunSummaryV1 | null;
  readonly records?: BrowserRecords | null;
  readonly comparison?: RunRecordComparison | null;
  readonly history?: readonly RunSummaryV1[];
  readonly presentationReady?: boolean;
  readonly transitionActive?: boolean;
  readonly copyStatus?: string;
}

/** Item-pickup card lifetime: it lingers at least `PICKUP_MIN_MS` and at least
 *  `PICKUP_MIN_TURNS` player actions before the syncOverlays heartbeat retires
 *  it. Both gates must clear, so a flurry of fast actions can't blink it away and
 *  an idle player isn't stuck staring at a stale card. */
const PICKUP_MIN_MS = 3000;
const PICKUP_MIN_TURNS = 5;

/** How long the level-up bloom stays on the layer list — a touch longer than the
 *  CSS animation (620ms, see .fx-levelup-bloom) so it fully fades before the
 *  element is dropped. */
const LEVELUP_BLOOM_MS = 720;

/** A pending item pickup the presenter is projecting. The display fields are
 *  resolved on intake (showItemPickup); the lifetime stamps drive dismissal in
 *  syncOverlays. `corner` is re-picked each heartbeat so it can yield to the
 *  combat portrait. */
interface PendingItemPickup {
  token: number;
  kind: ItemPickupOverlay['kind'];
  name: string;
  artUrl: string;
  rarityColor: string;
  statLabel?: string;
  pickedAtMs: number;
  pickedTurn: number;
}

export class ChromePresenter {
  private logSeq = 0;
  private combatFocusMonsterKey: string | null = null;
  private lastPortrait: CombatPortrait | null = null;
  private pickupToken = 0;
  private pendingPickup: PendingItemPickup | null = null;
  private lastPickup: ItemPickupOverlay | null = null;
  /** Visual-effect halves merged into ui.visualEffects: the survival/floor stack
   *  (rebuilt in publishStats) and the boss vignette (rebuilt in publishMap, the
   *  only place the boss state — derived from the map — is known). Kept apart so
   *  neither call wipes the other's layer. */
  private statsEffects: VisualEffectInstance[] = [];
  private bossEffect: VisualEffectInstance | null = null;
  /** Transient golden level-up bloom, held on the layer list for its animation's
   *  lifetime then dropped. A counter ids each flash so back-to-back level-ups
   *  restart the CSS animation. */
  private levelUpEffect: VisualEffectInstance | null = null;
  private levelUpToken = 0;
  private levelUpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ChromePresenterOptions = {}) {}

  public publishStats(
    player: Player,
    dungeonFloor: number,
    statusEffects: StatusEffects,
    totalDef: number,
    turn = 0,
    trapEffects?: TrapEffects,
    hasAmulet = false,
  ): void {
    ui.hasAmulet = hasAmulet;
    ui.floor = dungeonFloor;
    ui.floorName = floorName(dungeonFloor);
    ui.gold = player.gold;
    ui.def = totalDef;
    ui.turn = turn;
    ui.level = player.level;
    ui.strengthDrain = trapEffects?.strengthDrained ?? 0;
    const confusedTurns = trapEffects?.confusedTurns ?? 0;
    this.options.setDisorientation?.(confusedTurns > 0 ? Math.min(1, 0.45 + confusedTurns * 0.05) : 0);

    ui.hp = Math.max(0, player.hp);
    ui.maxHp = Math.round(
      statusEffects.vigorTurns > 0
        ? player.maxHp * BALANCE.status.vigorHpMultiplier
        : player.maxHp
    );

    const cfg = getConfig();
    const { hungerFatigued, hungerHungry } = BALANCE.player;
    const hv = hungerView(player.hunger, hungerFatigued, hungerHungry, cfg.hungerMax);
    ui.hungerStatus = hv.status;
    ui.hungerPct = hv.pct;
    ui.hungerTone = hv.tone;
    const survival = survivalWarningView({
      hp: ui.hp,
      maxHp: ui.maxHp,
      hunger: player.hunger,
      hungerFatigued,
      hungerHungry,
    });
    ui.survivalWarningTone = survival.tone;
    ui.survivalWarningIntensity = survival.intensity;
    this.statsEffects = visualEffectLayers({
      floor: dungeonFloor,
      hp: ui.hp,
      maxHp: ui.maxHp,
      hunger: player.hunger,
      hungerFatigued,
      hungerHungry,
    });
    this.republishVisualEffects();

    ui.food = player.inventory.food;
    ui.foodMax = cfg.playerMaxFood;

    const xpReqs = getScaledXpRequirements();
    ui.xp = player.xp;
    ui.xpReq = xpReqs[player.level] || 209800;
    ui.atMaxLevel = player.level >= 20;
  }

  public syncDiscovery(state: DiscoveryState): void {
    ui.discovery = snapshotDiscovery(state);
  }

  public publishInventory(player: Player): void {
    const inventory = projectInventory(player);
    ui.equipment = inventory.equipment;
    ui.readiedWand = inventory.readiedWand;
    ui.inventoryItems = inventory.cells;
    ui.inventoryCount = inventory.count;
    ui.potions = inventory.potions;
  }

  public publishMap(snapshot: MapSnapshot, combatFocusMonsterKey: string | null = this.combatFocusMonsterKey): void {
    this.combatFocusMonsterKey = combatFocusMonsterKey;
    this.syncOverlaysFromSnapshot(snapshot);
    this.syncBossEncounter(snapshot);
  }

  /** Derive the engaged boss from the map snapshot (the only seam carrying
   *  per-monster HP + visibility), and project it to the boss bar, the crimson
   *  tension vignette, and the map-plane sway. Cleared when no boss is on-screen
   *  or the run has ended. */
  private syncBossEncounter(snapshot: MapSnapshot): void {
    const ended = snapshot.gameOver || snapshot.gameWon;
    const sightings: BossSighting[] = ended
      ? []
      : snapshot.monsters
          .filter(m => m.special === 'boss' && m.visible)
          .map(m => ({
            key: m.id ?? m.name,
            name: m.name,
            hp: m.hp,
            maxHp: m.maxHp ?? m.hp,
          }));
    const view = bossEncounterView(sightings);
    ui.bossEncounter = view;
    this.bossEffect = bossTensionEffect(view?.intensity ?? 0);
    this.republishVisualEffects();
    this.options.setBossIntensity?.(view?.intensity ?? 0);
  }

  /** Flash the golden level-up bloom over the whole stage. Held on the layer
   *  list (so a mid-bloom stats/boss republish can't wipe it) and dropped by a
   *  timer once the animation has played. */
  public flashLevelUp(): void {
    this.levelUpToken += 1;
    this.levelUpEffect = levelUpBloomEffect(this.levelUpToken);
    this.republishVisualEffects();
    if (this.levelUpTimer) clearTimeout(this.levelUpTimer);
    this.levelUpTimer = setTimeout(() => {
      this.levelUpEffect = null;
      this.levelUpTimer = null;
      this.republishVisualEffects();
    }, LEVELUP_BLOOM_MS);
  }

  /** Merge the effect halves — survival/floor stack, boss vignette, and the
   *  transient level-up bloom — into the rendered layer list. Each is kept apart
   *  so neither republish call wipes another's layer. */
  private republishVisualEffects(): void {
    const layers = [...this.statsEffects];
    if (this.bossEffect) layers.push(this.bossEffect);
    if (this.levelUpEffect) layers.push(this.levelUpEffect);
    ui.visualEffects = layers;
  }

  public setAiming(aiming: { wandName: string } | null): void {
    ui.aiming = aiming;
  }

  /** Record an item the player just collected so the next syncOverlays heartbeat
   *  projects a pickup card. Gold has no inventory art / card, so it is skipped.
   *  Display fields reuse the same builders as the inventory panel; the lifetime
   *  is stamped here and evaluated (event-driven) in syncOverlays — there is no
   *  render loop. The current turn is read from ui.turn, which publishStats has
   *  already set this action (updateUI runs before the pickup). */
  public showItemPickup(item: Item): void {
    if (item.type === 'gold') return;

    const projected = projectItemPickup(item);
    this.pendingPickup = {
      ...projected,
      token: ++this.pickupToken,
      pickedAtMs: performance.now(),
      pickedTurn: ui.turn,
    };
  }

  /** Drop any pending pickup card immediately — used on a floor transition so a
   *  card collected on the previous floor doesn't linger onto the next one
   *  (spec rule (d)). Death is already covered by the gameOver/gameWon gate in
   *  syncOverlays. */
  public clearItemPickup(): void {
    this.pendingPickup = null;
    this.lastPickup = null;
    ui.itemPickup = null;
  }

  public publishEndRunState(state: EndRunChromeState): void {
    if ('summary' in state) ui.endRunSummary = state.summary ?? null;
    if ('records' in state) ui.endRunRecords = state.records ?? null;
    if ('comparison' in state) ui.endRunComparison = state.comparison ?? null;
    if (state.history) ui.endRunHistory = [...state.history];
    if (state.presentationReady !== undefined) ui.endRunPresentationReady = state.presentationReady;
    if (state.transitionActive !== undefined) ui.endRunTransitionActive = state.transitionActive;
    if (state.copyStatus !== undefined) ui.endRunCopyStatus = state.copyStatus;
  }

  public resetEndRunState(): void {
    this.publishEndRunState({
      summary: null,
      comparison: null,
      presentationReady: true,
      transitionActive: false,
      copyStatus: '',
    });
  }

  public focusCombatMonster(monsterKey: string): void {
    this.combatFocusMonsterKey = monsterKey;
  }

  public clearCombatFocusMonster(monsterKey: string): void {
    if (this.combatFocusMonsterKey === monsterKey) {
      this.combatFocusMonsterKey = null;
    }
  }

  public resetLog(): void {
    ui.logs = [];
    this.logSeq = 0;
    this.combatFocusMonsterKey = null;
    this.lastPortrait = null;
    ui.combatPortrait = null;
    this.pendingPickup = null;
    this.lastPickup = null;
    ui.itemPickup = null;
    this.bossEffect = null;
    ui.bossEncounter = null;
    if (this.levelUpTimer) {
      clearTimeout(this.levelUpTimer);
      this.levelUpTimer = null;
    }
    this.levelUpEffect = null;
    // Drop the cleared transients (boss vignette, level-up bloom) from the
    // rendered list now rather than waiting for the next publishStats.
    this.republishVisualEffects();
  }

  public renderLogs(logs: readonly string[]): void {
    if (logs.length === 0) return;

    const raw = logs[logs.length - 1];
    const msg = enrichLogMessageHtml(raw);
    const nextSeq = this.logSeq + 1;
    const line: LogLineView = { n: nextSeq, html: msg, highlight: /loot/i.test(msg) };
    const result = appendLogLine(ui.logs, line);
    ui.logs = result.lines;
    if (result.appended) this.logSeq = nextSeq;
  }

  public formatStyledItemName(name: string, rarity: string): string {
    return formatStyledItemName(name, rarity);
  }

  private syncOverlaysFromSnapshot(snapshot: MapSnapshot): void {
    const map = snapshot.tiles.map(row => row.map(tile => tile.kind));
    const explored = snapshot.tiles.map(row => row.map(tile => tile.explored));
    const visible = snapshot.tiles.map(row => row.map(tile => tile.visible));
    const monsters = snapshot.monsters.map(monsterViewToChromeMonster);
    const items = snapshot.items.map(itemViewToChromeItem);
    const focusMonster = this.combatFocusMonsterKey
      ? monsters[snapshot.monsters.findIndex(monster => monster.key === this.combatFocusMonsterKey)] ?? null
      : null;

    this.syncOverlays(
      map,
      explored,
      visible,
      { x: snapshot.player.x, y: snapshot.player.y } as Player,
      monsters,
      items,
      snapshot.cols,
      snapshot.rows,
      snapshot.gameOver,
      snapshot.gameWon,
      focusMonster,
    );
  }

  private syncOverlays(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    cols: number,
    rows: number,
    gameOver: boolean,
    gameWon: boolean,
    focusMonster: Monster | null = null,
  ): void {
    let stairs = false;
    for (let r = 0; r < rows && !stairs; r++) {
      for (let c = 0; c < cols; c++) {
        if (visible[r]?.[c] && STAIR_TILES.has(map[r][c])) {
          stairs = true;
          break;
        }
      }
    }
    ui.stairsNearby = stairs;

    let best: Monster | null = null;
    let bestDist = Infinity;
    for (const m of monsters) {
      if (visible[m.y]?.[m.x]) {
        const d = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y));
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
    }
    ui.nearbyMonster = best
      ? {
          name: best.name,
          hp: Math.max(0, best.hp),
          maxHp: best.maxHp ?? best.hp,
          glyph: best.symbol,
          color: best.color,
          hostile: true,
          subtitle: best.special === 'boss' ? 'Boss' : undefined,
        }
      : null;

    const ended = gameOver || gameWon;

    // Compute the combat portrait first (unchanged behaviour), but keep the live
    // item card off its corner so the monster can't slide onto the card.
    const portrait = ended
      ? null
      : this.computeCombatPortrait(
          map, explored, visible, player, monsters, items, cols, rows, focusMonster,
          this.lastPickup?.corner,
        );
    if (!portraitsEqual(portrait, this.lastPortrait)) {
      this.lastPortrait = portrait;
      ui.combatPortrait = portrait;
    }

    // Then evaluate the item-pickup overlay's lifetime and (if it survives) its
    // corner, excluding the portrait's corner so the two never overlap.
    const pickup = ended ? null : this.computeItemPickup(map, explored, visible, player, monsters, items, cols, rows, portrait?.corner);
    if (!itemPickupsEqual(pickup, this.lastPickup)) {
      this.lastPickup = pickup;
      ui.itemPickup = pickup;
    }

    ui.gameOver = gameOver;
    ui.gameWon = gameWon;
  }

  /** Resolve the pending item pickup into a card for this heartbeat, or null when
   *  it should be retired. Dismissal rules (event-driven; no render loop):
   *   (a) a newer pickup has already replaced the pending one (token swap is
   *       handled implicitly — we always project the latest pending);
   *   (b) it has lingered long enough — both PICKUP_MIN_TURNS actions AND
   *       PICKUP_MIN_MS elapsed — so it retires;
   *   (c) no clear corner fits alongside the combat portrait, so it yields;
   *   (d) floor change / death clears it (handled by the `ended` gate in
   *       syncOverlays and by resetLog on a new run / floor reset). */
  private computeItemPickup(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    cols: number,
    rows: number,
    portraitCorner?: CombatPortrait['corner'],
  ): ItemPickupOverlay | null {
    const pending = this.pendingPickup;
    if (!pending) return null;

    // (b) Retire once it has lingered long enough by both gates.
    const turnsSince = ui.turn - pending.pickedTurn;
    const elapsedMs = performance.now() - pending.pickedAtMs;
    if (turnsSince >= PICKUP_MIN_TURNS && elapsedMs >= PICKUP_MIN_MS) {
      this.pendingPickup = null;
      return null;
    }

    const tileSize = this.measureTileSize(cols, rows);
    const sizePx = portraitSizePx(cols, rows, tileSize);

    const blockedTiles = new Set<number>();
    for (const m of monsters) {
      if (visible[m.y]?.[m.x]) blockedTiles.add(m.y * cols + m.x);
    }
    for (const it of items) {
      if (explored[it.y]?.[it.x]) blockedTiles.add(it.y * cols + it.x);
    }

    // (c) Yield when no clear corner fits alongside the combat portrait. The card
    // stays pending (not cleared) so it can reappear once a corner frees up.
    const corner = pickPortraitCorner({
      map,
      explored,
      blockedTiles,
      playerX: player.x,
      playerY: player.y,
      cols,
      rows,
      tileSize,
      sizePx,
      excludeCorner: portraitCorner,
    });
    if (!corner) return null;

    return {
      token: pending.token,
      kind: pending.kind,
      name: pending.name,
      artUrl: pending.artUrl,
      rarityColor: pending.rarityColor,
      statLabel: pending.statLabel,
      corner,
      sizePx,
    };
  }

  private computeCombatPortrait(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    cols: number,
    rows: number,
    focusMonster: Monster | null,
    excludeCorner?: CombatPortrait['corner'],
  ): CombatPortrait | null {
    const adjacent = monsters.filter(
      m =>
        Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y)) <= 1 &&
        visible[m.y]?.[m.x]
    );
    if (adjacent.length === 0) return null;

    let focus =
      (focusMonster && adjacent.includes(focusMonster) && focusMonster) || null;
    if (!focus) {
      let bestDist = Infinity;
      for (const m of adjacent) {
        const d = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y));
        if (d < bestDist) {
          bestDist = d;
          focus = m;
        }
      }
    }
    if (!focus) return null;

    const tileSize = this.measureTileSize(cols, rows);
    const sizePx = portraitSizePx(cols, rows, tileSize);

    const blockedTiles = new Set<number>();
    for (const m of monsters) {
      if (visible[m.y]?.[m.x]) blockedTiles.add(m.y * cols + m.x);
    }
    for (const it of items) {
      if (explored[it.y]?.[it.x]) blockedTiles.add(it.y * cols + it.x);
    }

    const corner = pickPortraitCorner({
      map,
      explored,
      blockedTiles,
      playerX: player.x,
      playerY: player.y,
      cols,
      rows,
      tileSize,
      sizePx,
      excludeCorner,
    });
    if (!corner) return null;

    return {
      id: monsterId(focus),
      name: focus.name,
      color: focus.color,
      hp: Math.max(0, focus.hp),
      maxHp: focus.maxHp ?? focus.hp,
      corner,
      sizePx,
    };
  }

  private measureTileSize(cols: number, rows: number): number {
    return this.options.measureTileSize?.(cols, rows) ?? 20;
  }

}

/** Project a freshly-picked item into the pickup card's display fields, reusing
 *  the same art/rarity/stat builders the inventory panel uses. Gold is filtered
 *  out before this is reached (showItemPickup). */
function projectItemPickup(item: Exclude<Item, { type: 'gold' }>): Omit<PendingItemPickup, 'token' | 'pickedAtMs' | 'pickedTurn'> {
  switch (item.type) {
    case 'food':
      return {
        kind: 'food',
        name: 'Rations',
        artUrl: foodArtUrl(),
        rarityColor: rarityVar('common'),
      };
    case 'potion': {
      const type = item.data.potionType;
      return {
        kind: 'potion',
        name: potionLabel(type),
        artUrl: potionArtUrl(type),
        rarityColor: potionVisual(type).uiColor,
      };
    }
    case 'scroll': {
      const type = item.data.scrollType;
      return {
        kind: 'scroll',
        name: scrollDisplayName(type),
        artUrl: scrollArtUrl(type),
        rarityColor: scrollVisual(type).uiColor,
        statLabel: SCROLLS[type].harmful ? 'Risky' : undefined,
      };
    }
    case 'wand': {
      const wand = item.data;
      return {
        kind: 'wand',
        name: wand.name,
        artUrl: wandArtUrl(wand),
        rarityColor: rarityVar(wand.rarity),
      };
    }
    case 'gear': {
      const gear = item.data;
      const weapon = isWeaponCategory(gear.category);
      return {
        kind: 'gear',
        name: gear.name,
        artUrl: gearArtUrl(gear),
        rarityColor: rarityVar(gear.rarity),
        statLabel: shortGearStatText(gear, weapon ? 'attack' : 'defense'),
      };
    }
  }
}

function monsterViewToChromeMonster(view: MonsterView): Monster {
  return {
    x: view.x,
    y: view.y,
    id: view.id,
    symbol: view.glyph,
    name: view.name,
    hp: view.hp,
    maxHp: view.maxHp,
    atk: view.atk,
    color: view.color,
    minFloor: view.minFloor,
    special: view.special,
    frozenTurns: view.frozenTurns,
    ai: cloneValue(view.ai),
  } as Monster;
}

function itemViewToChromeItem(view: ItemView): Item {
  const item = {
    x: view.x,
    y: view.y,
    symbol: view.glyph,
    color: view.color,
    type: view.type,
  } as Item;
  if (view.amount !== undefined) (item as Extract<Item, { type: 'gold' }>).amount = view.amount;
  if (view.data !== undefined) (item as Item & { data: unknown }).data = cloneValue(view.data);
  return item;
}

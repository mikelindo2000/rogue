import { BALANCE, getConfig, getScaledXpRequirements } from '../config';
import { snapshotDiscovery, monsterId, type DiscoveryState } from '../discovery';
import { potionVisual, scrollVisual, wandVisual } from '../itemVisuals';
import { canEquip } from '../player';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';
import type { RunSummaryV1 } from '../runStats';
import { SCROLLS, scrollDisplayName } from '../scrolls';
import { STAIR_TILES } from '../tiles';
import { isWeaponCategory } from '../weapons';
import {
  ARMOR_SLOTS,
  type InventoryRef,
  type Item,
  type Monster,
  type Player,
  type PotionType,
  type ScrollType,
  type StatusEffects,
  type TrapEffects,
} from '../types';
import {
  portraitSizePx,
  pickPortraitCorner,
  portraitsEqual,
  itemPickupsEqual,
} from '../ui/combatPortrait';
import { gearHealthView } from '../ui/equipmentStats';
import { buildEquipmentView } from '../ui/equipmentView';
import { buildReadiedWandView } from '../ui/readiedWandView';
import { floorName, hungerView, rarityVar, survivalWarningView, titleCase } from '../ui/format';
import { bestIndex, compareGear } from '../ui/gearCompare';
import { SLOT_ICON } from '../ui/icons';
import { foodArtUrl, gearArtUrl, potionArtUrl, scrollArtUrl, wandArtUrl } from '../ui/inventoryArt';
import {
  buildInventoryComparisons,
  gearTooltipStats,
  shortGearStatText,
  weaponTypeLabel,
} from '../ui/inventoryStats';
import { appendLogLine } from '../ui/logHistory';
import { enrichLogMessageHtml } from '../ui/logMessage';
import { buildPotionOptions, potionDetail, potionLabel, potionTooltipStats } from '../ui/potionView';
import {
  ui,
  type CombatPortrait,
  type InventoryActionView,
  type InventoryCell,
  type ItemPickupOverlay,
  type LogLineView,
} from '../ui/store.svelte';
import { bossTensionEffect, visualEffectLayers, type VisualEffectInstance } from '../ui/visualEffects';
import { bossEncounterView, type BossSighting } from '../boss';
import { wandDetail, wandLabel, wandTooltipStats } from '../ui/wandView';
import { cloneValue, type ItemView, type MapSnapshot, type MonsterView } from './mapSnapshot';
import { formatStyledItemName } from './itemNameFormatter';

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
    ui.equipment = buildEquipmentView(player);
    ui.readiedWand = buildReadiedWandView(player);
    const inv = this.buildInventory(player);
    ui.inventoryItems = inv.cells;
    ui.inventoryCount = inv.count;
    ui.potions = buildPotionOptions(player.inventory.potions);
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

  /** Merge the two effect halves into the rendered layer list. */
  private republishVisualEffects(): void {
    ui.visualEffects = this.bossEffect
      ? [...this.statsEffects, this.bossEffect]
      : this.statsEffects;
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

  private buildInventory(player: Player): { cells: InventoryCell[]; count: number } {
    const cells: InventoryCell[] = [];

    if (player.inventory.food > 0) {
      const ref: InventoryRef = { kind: 'food' };
      cells.push({
        icon: 'leaf',
        artUrl: foodArtUrl(),
        rarityColor: rarityVar('common'),
        count: player.inventory.food > 1 ? player.inventory.food : undefined,
        label: `Rations ×${player.inventory.food}`,
        detail: `Restores hunger. You can carry ${player.inventory.food}/${getConfig().playerMaxFood}.`,
        ref,
        actions: this.inventoryActions(player, ref),
      });
    }

    const potCounts = new Map<PotionType, number>();
    player.inventory.potions.forEach(p => potCounts.set(p, (potCounts.get(p) ?? 0) + 1));
    for (const [type, n] of potCounts) {
      const ref: InventoryRef = { kind: 'potion', potionType: type };
      const visual = potionVisual(type);
      cells.push({
        icon: visual.icon,
        artUrl: potionArtUrl(type),
        rarityColor: visual.uiColor,
        count: n > 1 ? n : undefined,
        label: potionLabel(type, n),
        detail: potionDetail(type),
        tooltipStats: potionTooltipStats(type),
        ref,
        actions: this.inventoryActions(player, ref),
      });
    }

    const scrollCounts = new Map<ScrollType, number>();
    player.inventory.scrolls.forEach(s => scrollCounts.set(s, (scrollCounts.get(s) ?? 0) + 1));
    for (const [type, n] of scrollCounts) {
      const ref: InventoryRef = { kind: 'scroll', scrollType: type };
      const visual = scrollVisual(type);
      const def = SCROLLS[type];
      const name = scrollDisplayName(type);
      cells.push({
        icon: visual.icon,
        artUrl: scrollArtUrl(type),
        rarityColor: visual.uiColor,
        count: n > 1 ? n : undefined,
        label: n > 1 ? `${name} ×${n}` : name,
        detail: def.detail,
        statLabel: def.harmful ? 'Risky' : undefined,
        ref,
        actions: this.inventoryActions(player, ref),
      });
    }

    player.inventory.wands.forEach((wand, i) => {
      const ref: InventoryRef = { kind: 'wand', index: i };
      const visual = wandVisual(wand.wandType);
      const cd = wand.cooldownRemaining ?? 0;
      cells.push({
        icon: visual.icon,
        artUrl: wandArtUrl(wand),
        rarityColor: rarityVar(wand.rarity),
        count: cd > 0 ? cd : undefined,
        label: wandLabel(wand),
        detail: wandDetail(wand),
        tooltipStats: wandTooltipStats(wand),
        ref,
        actions: this.inventoryActions(player, ref),
      });
    });

    const mainWeapon = player.inventory.weapons[player.equipped.mainHand];
    const weaponBest = bestIndex(player.inventory.weapons, 'attack');
    player.inventory.weapons.forEach((w, i) => {
      if (i !== player.equipped.mainHand && player.equipped.offHand !== 'weapon:' + i) {
        const ref: InventoryRef = { kind: 'weapon', index: i };
        const cmp = compareGear(mainWeapon, w, 'attack');
        cells.push({
          icon: 'sword',
          artUrl: gearArtUrl(w),
          rarityColor: rarityVar(w.rarity),
          label: w.name,
          detail: `${weaponTypeLabel(w.type)} weapon. ${w.dmg ?? 0} damage.`,
          statLabel: shortGearStatText(w, 'attack'),
          tooltipStats: gearTooltipStats(w, 'attack'),
          comparisons: buildInventoryComparisons(player, ref, w),
          verdict: cmp.verdict,
          strictlyBetter: cmp.strictlyBetter,
          isBest: i === weaponBest,
          ref,
          actions: this.inventoryActions(player, ref),
        });
      }
    });

    for (const slot of ARMOR_SLOTS) {
      const wornArmor = player.inventory[slot][player.equipped[slot]];
      const armorBest = bestIndex(player.inventory[slot], 'defense');
      player.inventory[slot].forEach((a, i) => {
        if (i !== player.equipped[slot] && a.name !== 'None') {
          const ref: InventoryRef = { kind: 'armor', slot, index: i };
          const cmp = compareGear(wornArmor, a, 'defense');
          cells.push({
            icon: SLOT_ICON[slot],
            artUrl: gearArtUrl(a),
            rarityColor: rarityVar(a.rarity),
            label: a.name,
            detail: `${titleCase(slot)} armor. ${a.def ?? 0}/${a.maxDef ?? a.def ?? 0} defense.`,
            statLabel: shortGearStatText(a, 'defense'),
            health: gearHealthView(a, rarityVar(a.rarity)),
            tooltipStats: [
              { label: 'Slot', value: titleCase(slot) },
              ...gearTooltipStats(a, 'defense'),
            ],
            comparisons: buildInventoryComparisons(player, ref, a),
            verdict: cmp.verdict,
            strictlyBetter: cmp.strictlyBetter,
            isBest: i === armorBest,
            ref,
            actions: this.inventoryActions(player, ref),
          });
        }
      });
    }

    const wornShield = player.equipped.offHand.startsWith('shield:')
      ? player.inventory.shield[Number(player.equipped.offHand.split(':')[1])]
      : undefined;
    const shieldBest = bestIndex(player.inventory.shield, 'defense');
    player.inventory.shield.forEach((s, i) => {
      if (i !== 0 && player.equipped.offHand !== 'shield:' + i) {
        const ref: InventoryRef = { kind: 'shield', index: i };
        const cmp = compareGear(wornShield, s, 'defense');
        cells.push({
          icon: 'shield-dome',
          artUrl: gearArtUrl(s),
          rarityColor: rarityVar(s.rarity),
          label: s.name,
          detail: `Off-hand shield. ${s.def ?? 0}/${s.maxDef ?? s.def ?? 0} defense.`,
          statLabel: shortGearStatText(s, 'defense'),
          health: gearHealthView(s, rarityVar(s.rarity)),
          tooltipStats: [
            { label: 'Slot', value: 'Off-hand' },
            ...gearTooltipStats(s, 'defense'),
          ],
          comparisons: buildInventoryComparisons(player, ref, s),
          verdict: cmp.verdict,
          strictlyBetter: cmp.strictlyBetter,
          isBest: i === shieldBest,
          ref,
          actions: this.inventoryActions(player, ref),
        });
      }
    });

    return { cells, count: cells.length };
  }

  private inventoryActions(player: Player, ref: InventoryRef): InventoryActionView[] {
    const drop: InventoryActionView = { action: 'drop', label: 'Drop' };

    if (ref.kind === 'food') {
      return [{ action: 'use', label: 'Eat' }, drop];
    }
    if (ref.kind === 'potion') {
      return [{ action: 'use', label: 'Drink' }, drop];
    }
    if (ref.kind === 'scroll') {
      return [{ action: 'use', label: 'Read' }, drop];
    }
    if (ref.kind === 'wand') {
      const wand = player.inventory.wands[ref.index];
      const recharging = (wand?.cooldownRemaining ?? 0) > 0;
      return [{
        action: 'zap',
        label: 'Zap',
        disabled: recharging,
        reason: recharging ? `Recharging (${wand?.cooldownRemaining})` : undefined,
      }, drop];
    }

    if (ref.kind === 'weapon') {
      const main = canEquip(player, { slot: 'mainHand', index: ref.index });
      const actions: InventoryActionView[] = [
        {
          action: 'equip',
          label: 'Equip main',
          disabled: !main.ok,
          reason: main.ok ? undefined : main.reason,
        },
      ];
      const off = canEquip(player, { slot: 'offHand', value: `weapon:${ref.index}` });
      actions.push({
        action: 'equipOffHand',
        label: 'Equip off-hand',
        disabled: !off.ok,
        reason: off.ok ? undefined : off.reason,
      });
      actions.push(drop);
      return actions;
    }

    if (ref.kind === 'armor') {
      const result = canEquip(player, { slot: ref.slot, index: ref.index });
      return [{
        action: 'equip',
        label: `Equip ${titleCase(ref.slot)}`,
        disabled: !result.ok,
        reason: result.ok ? undefined : result.reason,
      }, drop];
    }

    const result = canEquip(player, { slot: 'offHand', value: `shield:${ref.index}` });
    return [{
      action: 'equip',
      label: 'Equip shield',
      disabled: !result.ok,
      reason: result.ok ? undefined : result.reason,
    }, drop];
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

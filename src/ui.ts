import { Player, Monster, Item, StatusEffects, ARMOR_SLOTS, InventoryRef, PotionType, ScrollType, TrapEffects } from './types';
import { BALANCE, getScaledXpRequirements, getConfig } from './config';
import { canEquip } from './player';
import { STAIR_TILES } from './tiles';
import { formatStyledItemName } from './presentation/itemNameFormatter';
import {
  ui,
  type InventoryActionView,
  type InventoryCell,
  type LogLineView,
  type CombatPortrait,
} from './ui/store.svelte';
import { rarityVar, hungerView, survivalWarningView, floorName, titleCase } from './ui/format';
import { visualEffectLayers } from './ui/visualEffects';
import type { FloorDir } from './ui/floorTransition';
import type { DeathTransitionRequest } from './ui/deathTransition';
import { buildEquipmentView } from './ui/equipmentView';
import {
  buildInventoryComparisons,
  gearTooltipStats,
  shortGearStatText,
  weaponTypeLabel,
} from './ui/inventoryStats';
import { gearHealthView } from './ui/equipmentStats';
import { bestIndex, compareGear } from './ui/gearCompare';
import { SLOT_ICON } from './ui/icons';
import { foodArtUrl, gearArtUrl, potionArtUrl, scrollArtUrl, wandArtUrl } from './ui/inventoryArt';
import { buildPotionOptions, potionDetail, potionLabel, potionTooltipStats } from './ui/potionView';
import { wandDetail, wandLabel, wandTooltipStats } from './ui/wandView';
import { potionVisual, scrollVisual, wandVisual } from './itemVisuals';
import { SCROLLS, scrollDisplayName } from './scrolls';
import { snapshotDiscovery, monsterId, type DiscoveryState } from './discovery';
import { portraitSizePx, pickPortraitCorner, portraitsEqual } from './ui/combatPortrait';
import { enrichLogMessageHtml } from './ui/logMessage';
import { appendLogLine } from './ui/logHistory';
import { MapViewController } from './presentation/mapViewController';
import { cloneValue, type ItemView, type MapSnapshot, type MonsterView } from './presentation/mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentation/presentationEvents';
import {
  DEFAULT_PLAYER_SPRITE,
  type PlayerSprite,
} from './render/avatar';

// Player-avatar rendering now lives in src/render/avatar.ts so the cinematic
// stage can draw the same hero. Re-exported here to keep the public surface.
export {
  PLAYER_SPRITE_OPTIONS,
  DEFAULT_PLAYER_SPRITE,
  type PlayerSprite,
  type PlayerSpriteOption,
} from './render/avatar';

export class GameUI {
  private readonly canvas: HTMLCanvasElement;
  /** Monotonic gutter number for the accumulating UI log history. Reset by
   *  resetLog() when a new run starts. */
  private logSeq = 0;
  private readonly mapView: MapViewController;
  private combatFocusMonsterKey: string | null = null;
  /** Last portrait pushed to the store, for change-detection so the rAF repaint
   *  path doesn't thrash store reactivity every frame. */
  private lastPortrait: CombatPortrait | null = null;
  /** Which avatar the player draws as. Settable in code today; a character-
   *  select UI will drive it later via setPlayerSprite(). */
  private playerSprite: PlayerSprite = DEFAULT_PLAYER_SPRITE;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${canvasId}`);
    this.canvas = canvas;
    this.mapView = new MapViewController({
      host: canvas,
      getFloorTransitionId: () => ui.floorTransition,
    });
  }

  public setMapSnapshot(snapshot: MapSnapshot, combatFocusMonsterKey: string | null = this.combatFocusMonsterKey): void {
    this.combatFocusMonsterKey = combatFocusMonsterKey;
    this.mapView.setSnapshot(snapshot);
    this.syncOverlaysFromSnapshot(snapshot);
  }

  public publishMapEvent(event: PresentationEvent): void {
    if (event.type === 'combat.focusMonster') this.combatFocusMonsterKey = event.monsterKey;
    else if (event.type === 'combat.clearFocusMonster' && this.combatFocusMonsterKey === event.monsterKey) {
      this.combatFocusMonsterKey = null;
    } else if (event.type === 'aiming.changed') {
      this.setAiming(event.wandName ? { wandName: event.wandName } : null);
    }
    this.mapView.dispatch(event);
  }

  /** Shake the map plane on a heavy blow (cosmetic; the engine decides what's heavy). */
  public mapRumble(strength = 0.6): void {
    this.publishMapEvent({ type: 'map.rumble', strength });
  }

  /** Start a floor-change transition before the live canvas repaints to the new floor. */
  public beginFloorTransition(dir: FloorDir): void {
    this.publishMapEvent({ type: 'map.floorTransition', dir });
  }

  /** Start the death presentation transition and resolve when the screen may open. */
  public beginDeathTransition(request: DeathTransitionRequest): Promise<void> {
    return this.mapView.beginDeathTransition(request);
  }

  /** Clear any persisted death-transition inline styles when a new live run begins. */
  public resetDeathTransition(): void {
    this.mapView.resetDeathTransition();
  }

  /** Dev/proof helper: play a specific transition id against the live map plane. */
  public previewDeathTransition(id: string): Promise<void> {
    return this.mapView.previewDeathTransition(id);
  }

  public fxStrike(fromX: number, fromY: number, toX: number, toY: number): void {
    this.publishMapEvent({ type: 'combat.strike', fromX, fromY, toX, toY });
  }

  public fxHit(x: number, y: number, damage: number, crit = false): void {
    this.publishMapEvent({ type: 'combat.hit', x, y, damage, crit });
  }

  public fxFreeze(x: number, y: number): void {
    this.publishMapEvent({ type: 'combat.freeze', x, y });
  }

  public fxDeath(x: number, y: number, glyph: string, color: string): void {
    this.publishMapEvent({ type: 'combat.death', x, y, glyph, color });
  }

  public fxPlayerHit(): void {
    this.publishMapEvent({ type: 'combat.playerHit' });
  }

  public fxDive(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    this.publishMapEvent({ type: 'combat.dive', fromX, fromY, toX, toY, color });
  }

  public fxWhiff(x: number, y: number): void {
    this.publishMapEvent({ type: 'combat.whiff', x, y });
  }

  public fxFloat(x: number, y: number, text: string, color = '#9fb4c8'): void {
    this.publishMapEvent({ type: 'combat.float', x, y, text, color });
  }

  public fxMonsterDodge(monsterKey: string, fromX: number, fromY: number): void {
    this.publishMapEvent({ type: 'combat.monsterDodge', monsterKey, fromX, fromY });
  }

  public fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[] = []): void {
    this.mapView.dispatchPlayerRun(path, ghosts);
  }

  /** Toggle the transient wand-aiming prompt overlay. */
  public setAiming(aiming: { wandName: string } | null): void {
    ui.aiming = aiming;
  }

  /** Choose the player's avatar style and repaint. */
  public setPlayerSprite(sprite: PlayerSprite): void {
    this.playerSprite = sprite;
    ui.playerSprite = sprite;
    this.mapView.setPlayerSprite(sprite);
  }

  public getPlayerSprite(): PlayerSprite {
    return this.mapView.getPlayerSprite() ?? this.playerSprite;
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

  public updateStats(
    player: Player,
    dungeonFloor: number,
    statusEffects: StatusEffects,
    totalDef: number,
    turn = 0,
    trapEffects?: TrapEffects,
    hasAmulet = false
  ) {
    ui.hasAmulet = hasAmulet;
    ui.floor = dungeonFloor;
    ui.floorName = floorName(dungeonFloor);
    ui.gold = player.gold;
    ui.def = totalDef;
    ui.turn = turn;
    ui.level = player.level;
    ui.strengthDrain = trapEffects?.strengthDrained ?? 0;
    const confusedTurns = trapEffects?.confusedTurns ?? 0;
    this.mapView.setDisorientation(confusedTurns > 0 ? Math.min(1, 0.45 + confusedTurns * 0.05) : 0);

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
    // Declarative layer list for the effect hosts. The survival warning fields
    // above stay populated for Vitals' localized pulse during the migration.
    ui.visualEffects = visualEffectLayers({
      floor: dungeonFloor,
      hp: ui.hp,
      maxHp: ui.maxHp,
      hunger: player.hunger,
      hungerFatigued,
      hungerHungry,
    });

    ui.food = player.inventory.food;
    ui.foodMax = cfg.playerMaxFood;

    const xpReqs = getScaledXpRequirements();
    ui.xp = player.xp;
    ui.xpReq = xpReqs[player.level] || 209800;
    ui.atMaxLevel = player.level >= 20;
  }

  /** Push a fresh discovery snapshot into the reactive store so the bestiary
   *  re-renders when a monster is first sighted or first defeated. */
  public syncDiscovery(state: DiscoveryState) {
    ui.discovery = snapshotDiscovery(state);
  }

  /** Rebuild the equipment, inventory, and potion views in the store. */
  public updateDropdowns(player: Player) {
    ui.equipment = buildEquipmentView(player);
    const inv = this.buildInventory(player);
    ui.inventoryItems = inv.cells;
    ui.inventoryCount = inv.count;
    ui.potions = buildPotionOptions(player.inventory.potions);
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
        // A cooldown badge reuses the count slot (shows the recharge timer).
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
    // Every carried item the pack can show is droppable (equipped gear is never
    // listed). Drop is always last so the primary verb stays the default action.
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

  /** Clear the accumulated UI log history and gutter numbering. Called by the
   *  engine when a new run starts (initGame). */
  public resetLog() {
    ui.logs = [];
    this.logSeq = 0;
    // Don't let a focus/portrait from the finished run leak into the next one.
    this.combatFocusMonsterKey = null;
    this.lastPortrait = null;
    ui.combatPortrait = null;
  }

  /** Turn the engine's rolling log buffer into an accumulating, numbered UI
   *  history. Each engine `addLog` calls this with exactly one new tail line. */
  public renderLogs(logs: string[]) {
    if (logs.length === 0) return;

    const raw = logs[logs.length - 1];
    const msg = enrichLogMessageHtml(raw);
    const nextSeq = this.logSeq + 1;
    const line: LogLineView = { n: nextSeq, html: msg, highlight: /loot/i.test(msg) };
    const result = appendLogLine(ui.logs, line);
    ui.logs = result.lines;
    if (result.appended) this.logSeq = nextSeq;
  }

  public getStyledItemName(name: string, rarity: string): string {
    return formatStyledItemName(name, rarity);
  }

  /** Push board-derived overlay state (stairs proximity, nearest visible
   *  monster, run state) into the store for the center-stage chrome. */
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
    focusMonster: Monster | null = null
  ) {
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

    const portrait = (gameOver || gameWon)
      ? null
      : this.computeCombatPortrait(map, explored, visible, player, monsters, items, cols, rows, focusMonster);
    if (!portraitsEqual(portrait, this.lastPortrait)) {
      this.lastPortrait = portrait;
      ui.combatPortrait = portrait;
    }

    ui.gameOver = gameOver;
    ui.gameWon = gameWon;
  }

  /** Build the combat portrait for this turn, or null when not in melee or no
   *  board corner is clear of drawn map. "Fighting" = a hostile monster is
   *  adjacent to the player; focus prefers the last-attacked render key, else
   *  the nearest adjacent one. The chosen corner's oval footprint is guaranteed
   *  not to overlap any drawn room/corridor tile, monster, or item. */
  private computeCombatPortrait(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    cols: number,
    rows: number,
    focusMonster: Monster | null
  ): CombatPortrait | null {
    // 1. Adjacent, visible hostiles only.
    const adjacent = monsters.filter(
      m =>
        Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y)) <= 1 &&
        visible[m.y]?.[m.x]
    );
    if (adjacent.length === 0) return null;

    // 2. Focus: the exact last-attacked monster if it's still adjacent, else the
    //    nearest adjacent one (reference identity keeps same-type foes distinct).
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

    // 3. Size the oval off the rendered tile size so it scales with the board,
    //    then pick a corner whose footprint is clear of drawn map / entities.
    const tileSize = this.computeTileSize(cols, rows);
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

  private computeTileSize(cols: number, rows: number): number {
    const PAD = 16;
    const MIN_TILE = 16;
    const MAX_TILE = 40;
    const stage = this.canvas.closest('.stage') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    const w = rect?.width ?? 0;
    const h = rect?.height ?? 0;
    if (w <= 0 || h <= 0 || cols <= 0 || rows <= 0) return 20;
    const availW = Math.max(1, w - PAD * 2);
    const availH = Math.max(1, h - PAD * 2);
    const fit = Math.floor(Math.min(availW / cols, availH / rows));
    return Math.max(MIN_TILE, Math.min(MAX_TILE, fit));
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

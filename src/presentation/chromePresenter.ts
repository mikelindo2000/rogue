import { BALANCE, getConfig, getScaledXpRequirements } from '../config';
import { snapshotDiscovery, monsterId, type DiscoveryState } from '../discovery';
import { potionVisual, scrollVisual, wandVisual } from '../itemVisuals';
import { canEquip } from '../player';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';
import type { RunSummaryV1 } from '../runStats';
import { SCROLLS, scrollDisplayName } from '../scrolls';
import { STAIR_TILES } from '../tiles';
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
import { portraitSizePx, pickPortraitCorner, portraitsEqual } from '../ui/combatPortrait';
import { gearHealthView } from '../ui/equipmentStats';
import { buildEquipmentView } from '../ui/equipmentView';
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
  type LogLineView,
} from '../ui/store.svelte';
import { visualEffectLayers } from '../ui/visualEffects';
import { wandDetail, wandLabel, wandTooltipStats } from '../ui/wandView';
import { cloneValue, type ItemView, type MapSnapshot, type MonsterView } from './mapSnapshot';
import { formatStyledItemName } from './itemNameFormatter';

export interface ChromePresenterOptions {
  readonly measureTileSize?: (cols: number, rows: number) => number;
  readonly setDisorientation?: (intensity: number) => void;
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

export class ChromePresenter {
  private logSeq = 0;
  private combatFocusMonsterKey: string | null = null;
  private lastPortrait: CombatPortrait | null = null;

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

  public syncDiscovery(state: DiscoveryState): void {
    ui.discovery = snapshotDiscovery(state);
  }

  public publishInventory(player: Player): void {
    ui.equipment = buildEquipmentView(player);
    const inv = this.buildInventory(player);
    ui.inventoryItems = inv.cells;
    ui.inventoryCount = inv.count;
    ui.potions = buildPotionOptions(player.inventory.potions);
  }

  public publishMap(snapshot: MapSnapshot, combatFocusMonsterKey: string | null = this.combatFocusMonsterKey): void {
    this.combatFocusMonsterKey = combatFocusMonsterKey;
    this.syncOverlaysFromSnapshot(snapshot);
  }

  public setAiming(aiming: { wandName: string } | null): void {
    ui.aiming = aiming;
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

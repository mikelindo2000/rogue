import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiscovery, markSeen } from '../discovery';
import { createPlayer } from '../player';
import { TILE } from '../tiles';
import type { Monster, StatusEffects, TrapEffects } from '../types';
import type { RunSummaryV1 } from '../runStats';
import { ui } from '../ui/store.svelte';
import { createMapSnapshot } from './mapSnapshot';
import { ChromePresenter } from './chromePresenter';

const STATUS: StatusEffects = {
  vigorTurns: 0,
  midasTurns: 0,
  strengthTurns: 0,
  invisTurns: 0,
  armorTurns: 0,
  monsterDetectionTurns: 0,
};

const TRAPS: TrapEffects = {
  bearTrapTurns: 0,
  sleepTurns: 0,
  strengthDrained: 0,
  confusedTurns: 0,
};

describe('ChromePresenter', () => {
  beforeEach(() => {
    ui.floor = 1;
    ui.gold = 0;
    ui.def = 0;
    ui.turn = 0;
    ui.level = 1;
    ui.hp = 0;
    ui.maxHp = 0;
    ui.food = 0;
    ui.equipment = [];
    ui.inventoryItems = [];
    ui.inventoryCount = 0;
    ui.potions = [];
    ui.logs = [];
    ui.discovery = emptyDiscovery();
    ui.stairsNearby = false;
    ui.nearbyMonster = null;
    ui.combatPortrait = null;
    ui.aiming = null;
    ui.gameOver = false;
    ui.gameWon = false;
    ui.hasAmulet = false;
    ui.endRunSummary = null;
    ui.endRunRecords = null;
    ui.endRunComparison = null;
    ui.endRunHistory = [];
    ui.endRunPresentationReady = true;
    ui.endRunTransitionActive = false;
    ui.endRunCopyStatus = '';
  });

  it('projects top-bar, vitals, food, effects, and disorientation state', () => {
    const player = createPlayer();
    player.gold = 27;
    player.hp = 8;
    player.maxHp = 12;
    player.hunger = 120;
    player.inventory.food = 3;
    player.level = 4;
    player.xp = 13;
    const setDisorientation = vi.fn();
    const presenter = new ChromePresenter({ setDisorientation });

    presenter.publishStats(
      player,
      6,
      { ...STATUS, vigorTurns: 2 },
      5,
      99,
      { ...TRAPS, strengthDrained: 2, confusedTurns: 3 },
      true,
    );

    expect(ui.floor).toBe(6);
    expect(ui.floorName).toBeTruthy();
    expect(ui.gold).toBe(27);
    expect(ui.def).toBe(5);
    expect(ui.turn).toBe(99);
    expect(ui.level).toBe(4);
    expect(ui.hp).toBe(8);
    expect(ui.maxHp).toBeGreaterThan(player.maxHp);
    expect(ui.food).toBe(3);
    expect(ui.hasAmulet).toBe(true);
    expect(ui.strengthDrain).toBe(2);
    expect(ui.visualEffects.length).toBeGreaterThan(0);
    expect(setDisorientation).toHaveBeenCalledWith(expect.closeTo(0.6));
  });

  it('builds equipment, inventory, potion, action, and wand views', () => {
    const player = createPlayer();
    player.inventory.food = 2;
    player.inventory.potions.push('healing', 'healing');
    player.inventory.scrolls.push('light', 'light');
    player.inventory.wands.push({
      name: 'Wand of Cold',
      wandType: 'cold',
      tier: 'wand',
      rarity: 'rare',
      cooldownRemaining: 3,
    });
    player.inventory.weapons.push({
      name: 'Jeweled Sword',
      type: '1h_sword',
      dmg: 8,
      rarity: 'rare',
    });
    player.inventory.shield.push({
      name: 'Kite Shield',
      def: 4,
      maxDef: 4,
      rarity: 'uncommon',
    });

    new ChromePresenter().publishInventory(player);

    expect(ui.equipment.map(slot => slot.slot)).toContain('mainHand');
    expect(ui.potions).toEqual([expect.objectContaining({ idx: 0, label: 'Healing', count: 2 })]);
    expect(ui.inventoryCount).toBe(ui.inventoryItems.length);
    expect(ui.inventoryItems.map(item => item.label)).toEqual(expect.arrayContaining([
      'Rations ×2',
      'Potion of Healing ×2',
      'Scroll of Light ×2',
      'Wand of Cold (recharging 3)',
      'Jeweled Sword',
      'Kite Shield',
    ]));
    expect(ui.inventoryItems.find(item => item.ref.kind === 'food')?.actions.map(action => action.label)).toEqual([
      'Eat',
      'Drop',
    ]);
    expect(ui.inventoryItems.find(item => item.ref.kind === 'wand')?.actions[0]).toMatchObject({
      action: 'zap',
      disabled: true,
      reason: 'Recharging (3)',
    });
  });

  it('accumulates enriched logs and preserves pure styled item names', () => {
    const presenter = new ChromePresenter();
    const styled = presenter.formatStyledItemName('Leather <Shoes>', 'rare');

    expect(styled).toContain('var(--rarity-rare)');
    expect(styled).toContain('Leather &lt;Shoes&gt;');

    presenter.renderLogs([`Looted: ${styled}.`]);
    presenter.renderLogs([`Looted: ${styled}.`]);

    expect(ui.logs).toHaveLength(1);
    expect(ui.logs[0]).toMatchObject({ n: 1, count: 2, highlight: true });
    expect(ui.logs[0].html).toContain(styled);
    expect(ui.logs[0].html).not.toContain('&lt;span');
  });

  it('publishes discovery as a snapshot copy', () => {
    const discovery = emptyDiscovery();
    markSeen(discovery, 'orc', 3);

    new ChromePresenter().syncDiscovery(discovery);
    discovery.seen.troll = true;

    expect(ui.discovery.seen).toEqual({ orc: true });
    expect(ui.discovery.firstSeenFloor.orc).toBe(3);
  });

  it('projects map-derived overlays without renderer decisions', () => {
    const player = createPlayer();
    player.x = 2;
    player.y = 2;
    const map: string[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => TILE.FLOOR));
    map[4][4] = TILE.STAIRS_DOWN;
    const explored = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    const visible = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    const monsters: Monster[] = [
      monster({ x: 0, y: 0, name: 'Far Orc', hp: 6 }),
      monster({ x: 3, y: 2, name: 'The Warden', hp: 12, special: 'boss' }),
    ];
    const snapshot = createMapSnapshot({
      map,
      explored,
      visible,
      player,
      monsters,
      items: [],
      traps: [],
      cols: 5,
      rows: 5,
      floor: 4,
      gameOver: false,
      gameWon: false,
      monsterDetectionActive: false,
    });

    new ChromePresenter({ measureTileSize: () => 20 }).publishMap(snapshot);

    expect(ui.stairsNearby).toBe(true);
    expect(ui.nearbyMonster).toMatchObject({
      name: 'The Warden',
      hp: 12,
      maxHp: 12,
      glyph: 'O',
      hostile: true,
      subtitle: 'Boss',
    });
    expect(ui.gameOver).toBe(false);
    expect(ui.gameWon).toBe(false);
  });

  it('projects wand aiming chrome state', () => {
    const presenter = new ChromePresenter();

    presenter.setAiming({ wandName: 'Wand of Cold' });
    expect(ui.aiming).toEqual({ wandName: 'Wand of Cold' });

    presenter.setAiming(null);
    expect(ui.aiming).toBeNull();
  });

  it('projects and resets end-run chrome state', () => {
    const presenter = new ChromePresenter();
    const summary = { runId: 'run-1', outcome: 'died', title: 'Fell on Floor 4' } as RunSummaryV1;
    const records = { totalRuns: 1, totalVictories: 0, firstVictoryAt: null, records: {} };
    const comparison = { isFirstRecordedRun: true, badges: [] };
    const history = [summary];

    presenter.publishEndRunState({
      summary,
      records,
      comparison,
      history,
      presentationReady: false,
      transitionActive: true,
      copyStatus: 'Copied summary',
    });

    expect(ui.endRunSummary).toBe(summary);
    expect(ui.endRunRecords).toBe(records);
    expect(ui.endRunComparison).toBe(comparison);
    expect(ui.endRunHistory).toEqual([summary]);
    expect(ui.endRunHistory).not.toBe(history);
    expect(ui.endRunPresentationReady).toBe(false);
    expect(ui.endRunTransitionActive).toBe(true);
    expect(ui.endRunCopyStatus).toBe('Copied summary');

    presenter.resetEndRunState();

    expect(ui.endRunSummary).toBeNull();
    expect(ui.endRunComparison).toBeNull();
    expect(ui.endRunPresentationReady).toBe(true);
    expect(ui.endRunTransitionActive).toBe(false);
    expect(ui.endRunCopyStatus).toBe('');
    expect(ui.endRunRecords).toBe(records);
  });
});

function monster(overrides: Partial<Monster>): Monster {
  return {
    x: 1,
    y: 1,
    symbol: 'O',
    name: 'Orc',
    hp: 5,
    maxHp: overrides.hp ?? 5,
    atk: 2,
    color: '#f00',
    minFloor: 1,
    frozenTurns: 0,
    ...overrides,
  };
}

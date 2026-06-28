import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiscovery, markSeen } from '../discovery';
import { createPlayer } from '../player';
import { TILE } from '../tiles';
import type { FloorGear, Item, Monster, StatusEffects, TrapEffects } from '../types';
import type { RunSummaryV1 } from '../runStats';
import { ui } from '../ui/store.svelte';
import { createMapSnapshot } from './mapSnapshot';
import { ChromePresenter } from './chromePresenter';

/** A blank board snapshot the syncOverlays heartbeat runs over: a wide VOID
 *  floor with the player centered, so all four corners are clear "empty" tiles
 *  (the pickup/portrait corner test treats explored-VOID as not drawn map). The
 *  player has a single FLOOR tile under them just so the board isn't entirely
 *  void. Monsters/items can be layered in via overrides. */
const COLS = 20;
const ROWS = 20;
function blankSnapshot(overrides: Partial<Parameters<typeof createMapSnapshot>[0]> = {}) {
  const player = createPlayer();
  player.x = 10;
  player.y = 10;
  const map: string[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => TILE.VOID));
  map[player.y][player.x] = TILE.FLOOR;
  const explored = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
  const visible = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
  return createMapSnapshot({
    map,
    explored,
    visible,
    player,
    monsters: [],
    items: [],
    traps: [],
    cols: COLS,
    rows: ROWS,
    floor: 1,
    gameOver: false,
    gameWon: false,
    monsterDetectionActive: false,
    ...overrides,
  });
}

const gearItem = (overrides: Partial<FloorGear> = {}): Extract<Item, { type: 'gear' }> => ({
  x: 1,
  y: 1,
  symbol: ')',
  color: '#fff',
  type: 'gear',
  data: { name: 'Jeweled Sword', category: '1h_sword', dmg: 8, rarity: 'rare', ...overrides },
});

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
    ui.itemPickup = null;
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('item pickup overlay', () => {
    it('skips gold (no card)', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      presenter.showItemPickup({ x: 1, y: 1, symbol: '$', color: '#ff0', type: 'gold', amount: 5 });
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).toBeNull();
    });

    it('projects a gear pickup (art, rarity color, stat label, corner)', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      presenter.showItemPickup(gearItem());
      presenter.publishMap(blankSnapshot());

      expect(ui.itemPickup).toMatchObject({
        kind: 'gear',
        name: 'Jeweled Sword',
        artUrl: '/inventory/jeweled-sword.png',
        rarityColor: 'var(--rarity-rare)',
        statLabel: 'ATK 8',
      });
      expect(ui.itemPickup?.corner).toBeTruthy();
      expect(ui.itemPickup?.sizePx).toBeGreaterThan(0);
    });

    it('projects a potion pickup', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      presenter.showItemPickup({
        x: 1, y: 1, symbol: '!', color: '#0ff', type: 'potion', data: { potionType: 'healing' },
      });
      presenter.publishMap(blankSnapshot());

      expect(ui.itemPickup).toMatchObject({
        kind: 'potion',
        name: 'Potion of Healing',
        artUrl: '/inventory/potion-of-healing.png',
      });
    });

    it('bumps the token when a newer pickup replaces the pending one', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      presenter.showItemPickup(gearItem({ name: 'Rusty Sword', dmg: 2 }));
      presenter.publishMap(blankSnapshot());
      const first = ui.itemPickup?.token;

      presenter.showItemPickup(gearItem({ name: 'Jeweled Sword', dmg: 8 }));
      presenter.publishMap(blankSnapshot());

      expect(ui.itemPickup?.name).toBe('Jeweled Sword');
      expect(ui.itemPickup?.token).toBeGreaterThan(first!);
    });

    it('dismisses once both the turn and elapsed-ms gates clear', () => {
      const now = vi.spyOn(performance, 'now').mockReturnValue(0);
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });

      ui.turn = 10;
      presenter.showItemPickup(gearItem());
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).not.toBeNull();

      // Enough turns, but not enough time → still showing.
      ui.turn = 20;
      now.mockReturnValue(1000);
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).not.toBeNull();

      // Both gates cleared → dismissed.
      now.mockReturnValue(4000);
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).toBeNull();
    });

    it('yields its corner to the combat portrait (never overlaps)', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      // A monster adjacent to the player forces a combat portrait; the pickup
      // card must take a different corner.
      const adjacent = monster({ x: 11, y: 10, name: 'Orc', hp: 5 });
      const snapshot = blankSnapshot({ monsters: [adjacent] });

      presenter.showItemPickup(gearItem());
      presenter.publishMap(snapshot, monsterKeyOf(snapshot));

      expect(ui.combatPortrait).not.toBeNull();
      expect(ui.itemPickup).not.toBeNull();
      expect(ui.itemPickup?.corner).not.toBe(ui.combatPortrait?.corner);
    });

    it('clears the card on a floor transition (does not linger onto the next floor)', () => {
      const presenter = new ChromePresenter({ measureTileSize: () => 20 });
      presenter.showItemPickup(gearItem());
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).not.toBeNull();

      // The engine calls this at the floor-transition point (travelStairs /
      // travelTrapdoor). The card must drop and stay gone on the next heartbeat.
      presenter.clearItemPickup();
      expect(ui.itemPickup).toBeNull();
      presenter.publishMap(blankSnapshot());
      expect(ui.itemPickup).toBeNull();
    });
  });
});

describe('ChromePresenter — level-up bloom', () => {
  const blooms = () => ui.visualEffects.filter(e => e.kind === 'levelup-bloom');

  beforeEach(() => {
    ui.visualEffects = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flashes one full-stage bloom that the timer then drops', () => {
    const presenter = new ChromePresenter();
    presenter.flashLevelUp();
    expect(blooms()).toHaveLength(1);
    expect(blooms()[0]?.target).toBe('stage-overlay');

    vi.advanceTimersByTime(1000);
    expect(blooms()).toHaveLength(0);
  });

  it('keeps exactly one bloom on rapid re-fire, with a bumped id', () => {
    const presenter = new ChromePresenter();
    presenter.flashLevelUp();
    const firstId = blooms()[0]?.id;
    presenter.flashLevelUp();
    expect(blooms()).toHaveLength(1);
    expect(blooms()[0]?.id).not.toBe(firstId);
  });

  it('clears the bloom and its timer on resetLog', () => {
    const presenter = new ChromePresenter();
    presenter.flashLevelUp();
    presenter.resetLog();
    expect(blooms()).toHaveLength(0);
    // The pending timer must not resurrect or re-clear anything after reset.
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(blooms()).toHaveLength(0);
  });
});

/** Pull the render key of the (single) monster in a snapshot, for combat focus. */
function monsterKeyOf(snapshot: ReturnType<typeof createMapSnapshot>): string {
  return snapshot.monsters[0].key;
}

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

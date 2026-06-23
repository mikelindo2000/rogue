import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../engine';
import { Monster } from '../types';
import { TILE } from '../tiles';
import {
  loadSaveGame,
  saveSaveGame,
  clearSaveGame,
  validateSaveGame,
} from './savegame';

const SEED = 12345;

const makeUi = () => ({
  renderLogs: vi.fn(),
  updateDropdowns: vi.fn(),
  updateStats: vi.fn(),
  syncDiscovery: vi.fn(),
  render: vi.fn(),
  resetLog: vi.fn(),
  fxStrike: vi.fn(),
  fxHit: vi.fn(),
  fxFreeze: vi.fn(),
  fxDeath: vi.fn(),
  fxPlayerHit: vi.fn(),
  fxDive: vi.fn(),
  fxWhiff: vi.fn(),
  fxMonsterDodge: vi.fn(),
  getStyledItemName: (n: string) => n,
});

/** Minimal in-memory Storage for the node test env (no jsdom). */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const newEngine = () => new GameEngine(makeUi() as any);

/**
 * Plant a controlled fight: an open floor with the player wedged against a
 * near-immortal monster. Each `attack()` lands a strike, which draws from the
 * RNG (`computeStrike` rolls `rng.int(...)` for damage). Idle `processTurn()`
 * alone draws nothing until a monster aggros, which is exactly why the earlier
 * "play 25 idle turns" test was vacuous — it never advanced the RNG, so a
 * dropped `rngState` would have gone undetected.
 */
const planFight = (engine: GameEngine) => {
  engine.map = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(TILE.FLOOR));
  engine.explored = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.visible = new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(false));
  engine.items = [];
  engine.player.x = 5;
  engine.player.y = 5;
  engine.player.hp = 1_000_000;
  engine.player.maxHp = 1_000_000;
  engine.player.hunger = 1_000_000;
  engine.player.baseAtk = 1;
  engine.player.inventory.weapons[0] = { name: 'Test Blade', dmg: 20 };
  engine.player.equipped.mainHand = 0;
  engine.player.equipped.offHand = 'none:0';
  const orc: Monster = {
    x: 6,
    y: 5,
    symbol: 'O',
    name: 'Orc',
    hp: 1_000_000,
    maxHp: 1_000_000,
    atk: 5,
    color: '#556b2f',
    minFloor: 1,
    frozenTurns: 0,
  };
  engine.monsters = [orc];
};

// Walk east into the adjacent monster — resolves as an attack, never a move.
const attack = (engine: GameEngine) => engine.handlePlayerMove(1, 0);

describe('savegame snapshot/restore determinism', () => {
  it('preserves the RNG position so the continued stream matches exactly', () => {
    // A fresh run seeded the same way, with no draws beyond floor gen, is the
    // baseline — proving the fight below actually advances the RNG.
    const baseline = (() => {
      const e = newEngine();
      e.initGame(SEED);
      return e.snapshot().rngState;
    })();

    const engineA = newEngine();
    engineA.initGame(SEED);
    planFight(engineA);
    for (let i = 0; i < 8; i++) attack(engineA);

    const snap = engineA.snapshot();
    expect(snap.rngState).not.toBe(baseline); // the strikes drew from the RNG

    const engineB = newEngine();
    expect(engineB.restore(snap)).toBe(true);
    // restore() must rebuild the RNG at the exact captured position.
    expect(engineB.snapshot().rngState).toBe(snap.rngState);

    // Identical further strikes on both must stay byte-for-byte in lockstep —
    // damage rolls, monster HP, player HP, and the RNG position all match.
    for (let i = 0; i < 8; i++) {
      attack(engineA);
      attack(engineB);
    }

    const a = engineA.snapshot();
    const b = engineB.snapshot();
    expect(b.rngState).toBe(a.rngState);
    expect(b.monsters).toEqual(a.monsters);
    expect(b.player).toEqual(a.player);
    expect(b.statusEffects).toEqual(a.statusEffects);
    expect(b.turn).toEqual(a.turn);
  });

  it('diverges if the restored RNG position is wrong (guards against vacuity)', () => {
    const engineA = newEngine();
    engineA.initGame(SEED);
    planFight(engineA);
    for (let i = 0; i < 8; i++) attack(engineA);
    const snap = engineA.snapshot();

    // Continue the genuine run.
    for (let i = 0; i < 8; i++) attack(engineA);

    // Restore from a corrupted RNG position and replay the same strikes.
    const engineC = newEngine();
    expect(engineC.restore({ ...snap, rngState: (snap.rngState ^ 0x9e3779b9) >>> 0 })).toBe(true);
    for (let i = 0; i < 8; i++) attack(engineC);

    // A wrong position rolls different damage, so monster HP must NOT match.
    expect(engineC.snapshot().monsters[0].hp).not.toBe(engineA.snapshot().monsters[0].hp);
  });
});

describe('savegame floorStates survival', () => {
  it('preserves the cached previous-floor entry through a storage round trip', () => {
    const mem = new MemoryStorage();
    const engineA = newEngine();
    engineA.initGame(SEED);

    // Descend to populate floorStates with the floor-1 cache.
    (engineA as any).travelStairs(1);
    expect(engineA.dungeonFloor).toBe(2);

    const snap = engineA.snapshot();
    expect(snap.floorStates.length).toBeGreaterThan(0);
    const [floor, fs] = snap.floorStates[0];
    expect(floor).toBe(1);

    saveSaveGame(snap, mem);
    const loaded = loadSaveGame(mem);
    expect(loaded).not.toBeNull();
    expect(loaded!.floorStates).toHaveLength(snap.floorStates.length);
    const [lFloor, lFs] = loaded!.floorStates[0];
    expect(lFloor).toBe(1);
    expect(lFs.map).toEqual(fs.map);
    expect(lFs.explored).toEqual(fs.explored);
    expect(lFs.dark).toEqual(fs.dark);
    expect(lFs.monsters).toEqual(fs.monsters);
    expect(lFs.items).toEqual(fs.items);
    expect(lFs.traps).toEqual(fs.traps ?? []);
  });
});

describe('savegame storage round trip', () => {
  it('loadSaveGame deep-equals the saved snapshot', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    for (let i = 0; i < 10; i++) engine.processTurn();
    engine.stats.stepsWalked = 3;

    const snap = engine.snapshot();
    saveSaveGame(snap, mem);
    const loaded = loadSaveGame(mem);

    expect(loaded).toEqual(snap);
    expect(loaded?.stats.stepsWalked).toBe(3);
  });
});

describe('savegame validation', () => {
  const KEY = 'rogue_savegame';

  it('returns null when stored under a wrong version', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot();
    mem.setItem(KEY, JSON.stringify({ v: 99, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('discards old V1 save wrappers instead of migrating them', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot();
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const mem = new MemoryStorage();
    mem.setItem(KEY, '{not valid json');

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null for a malformed save (missing required field)', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    delete snap.turn;
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null for a wrong-typed map', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.map = 'not a grid';
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null for a malformed player (missing required fields)', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.player = {};
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null for a malformed item entry', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.items = [{ nope: true }];
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null when explored dimensions do not match the map', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.explored = snap.explored.map((row: boolean[]) => row.slice(0, -1)); // narrower rows
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('returns null when dark dimensions do not match the map', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.dark = snap.dark.map((row: boolean[]) => row.slice(0, -1)); // narrower rows
    mem.setItem(KEY, JSON.stringify({ v: 1, data: snap }));

    expect(loadSaveGame(mem)).toBeNull();
  });

  it('accepts a save with no dark grid (pre-dark-rooms save)', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    delete snap.dark;
    expect(validateSaveGame(snap)).not.toBeNull();
  });

  it('accepts a save with no trap fields and backfills safe defaults', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    delete snap.traps;
    delete snap.trapEffects;

    const parsed = validateSaveGame(snap);

    expect(parsed).not.toBeNull();
    expect(parsed?.traps).toEqual([]);
    expect(parsed?.trapEffects).toEqual({ bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0 });
  });

  it('normalizes legacy damaged gear during validation', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.player.inventory.chest[1] = { name: 'Old Chainmail', def: 2, maxDef: 5, rarity: 'common' };

    const parsed = validateSaveGame(snap);

    expect(parsed).not.toBeNull();
    expect(parsed?.player.inventory.chest[1]).toMatchObject({
      def: 2,
      maxDef: 5,
      health: { current: 2, max: 5 },
    });
  });

  it('rejects malformed defensive gear buckets without throwing', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    delete snap.player.inventory.shield;

    expect(() => validateSaveGame(snap)).not.toThrow();
    expect(validateSaveGame(snap)).toBeNull();

    const snap2 = engine.snapshot() as any;
    snap2.player.inventory.chest = {};
    expect(() => validateSaveGame(snap2)).not.toThrow();
    expect(validateSaveGame(snap2)).toBeNull();
  });

  it('rejects malformed trap entries and trap effects', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.traps = [{ x: 1, y: 1, kind: 'bear' }];
    expect(validateSaveGame(snap)).toBeNull();

    const snap2 = engine.snapshot() as any;
    snap2.trapEffects = { bearTrapTurns: 1, sleepTurns: 'bad', strengthDrained: 0 };
    expect(validateSaveGame(snap2)).toBeNull();

    const snap3 = engine.snapshot() as any;
    snap3.traps = [{ id: 't1', x: 1, y: 1, kind: 'fake', revealed: false, armed: true }];
    expect(validateSaveGame(snap3)).toBeNull();

    const snap4 = engine.snapshot() as any;
    snap4.floorStates.push([2, {
      map: snap4.map,
      explored: snap4.explored,
      dark: snap4.dark,
      monsters: [],
      items: [],
      traps: [{ id: 'bad-cache', x: 1, y: 1, kind: 'fake', revealed: false, armed: true }],
    }]);
    expect(validateSaveGame(snap4)).toBeNull();
  });

  it('rejects a typed scroll item with an unknown scrollType', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.items = [{ x: 1, y: 1, type: 'scroll', symbol: '?', color: '#fff', data: { scrollType: 'bogus' } }];
    expect(validateSaveGame(snap)).toBeNull();
  });

  it('accepts a typed scroll item with a known scrollType', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.items = [{ x: 1, y: 1, type: 'scroll', symbol: '?', color: '#fff', data: { scrollType: 'light' } }];
    expect(validateSaveGame(snap)).not.toBeNull();
  });

  it('migrates a V2 save (no wands) by backfilling an empty wands bucket', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    delete snap.player.inventory.wands; // a save written before wands existed
    mem.setItem(KEY, JSON.stringify({ v: 2, data: snap }));

    const loaded = loadSaveGame(mem);
    expect(loaded).not.toBeNull();
    expect(loaded?.player.inventory.wands).toEqual([]);
  });

  it('round-trips a carried wand including its cooldown timer', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    engine.player.inventory.wands = [
      { name: 'Wand of Cold', wandType: 'cold', tier: 'wand', rarity: 'uncommon', cooldownRemaining: 2, identified: true },
    ];
    const snap = engine.snapshot();
    saveSaveGame(snap, mem);
    const loaded = loadSaveGame(mem);
    expect(loaded?.player.inventory.wands).toEqual(snap.player.inventory.wands);
  });

  it('backfills wand runtime state (clamps negative cooldown, defaults identified)', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.player.inventory.wands = [{ name: 'Wand of Fire', wandType: 'fire', tier: 'wand', cooldownRemaining: -5 }];
    const parsed = validateSaveGame(snap);
    expect(parsed).not.toBeNull();
    expect(parsed?.player.inventory.wands[0].cooldownRemaining).toBe(0);
    expect(parsed?.player.inventory.wands[0].identified).toBe(true);
  });

  it('rejects an inventory wand with an unknown wandType', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const snap = engine.snapshot() as any;
    snap.player.inventory.wands = [{ name: 'Bogus', wandType: 'bogus', tier: 'wand' }];
    expect(validateSaveGame(snap)).toBeNull();
  });

  it('rejects a floor wand item with an unknown wandType, accepts a known one', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    const bad = engine.snapshot() as any;
    bad.items = [{ x: 1, y: 1, type: 'wand', symbol: '/', color: '#fff', data: { wandType: 'bogus' } }];
    expect(validateSaveGame(bad)).toBeNull();

    const good = engine.snapshot() as any;
    good.items = [{ x: 1, y: 1, type: 'wand', symbol: '/', color: '#fff', data: { name: 'Wand of Fire', wandType: 'fire', tier: 'wand' } }];
    expect(validateSaveGame(good)).not.toBeNull();
  });

  it('validateSaveGame rejects non-objects and accepts a valid snapshot', () => {
    const engine = newEngine();
    engine.initGame(SEED);
    expect(validateSaveGame(null)).toBeNull();
    expect(validateSaveGame(42)).toBeNull();
    expect(validateSaveGame(engine.snapshot())).not.toBeNull();
  });

  it('clearSaveGame removes a stored save', () => {
    const mem = new MemoryStorage();
    const engine = newEngine();
    engine.initGame(SEED);
    saveSaveGame(engine.snapshot(), mem);
    expect(loadSaveGame(mem)).not.toBeNull();
    clearSaveGame(mem);
    expect(loadSaveGame(mem)).toBeNull();
  });
});

describe('savegame restore refreshes UI and recomputes visible', () => {
  it('calls UI refresh hooks and lights at least one cell', () => {
    const engineA = newEngine();
    engineA.initGame(SEED);
    for (let i = 0; i < 5; i++) engineA.processTurn();
    const snap = engineA.snapshot();

    const ui = makeUi();
    const engineB = new GameEngine(ui as any);
    expect(engineB.restore(snap)).toBe(true);

    expect(ui.updateDropdowns).toHaveBeenCalled();
    expect(ui.updateStats).toHaveBeenCalled();
    expect(ui.renderLogs).toHaveBeenCalled();
    expect(ui.resetLog).toHaveBeenCalled();

    const anyVisible = engineB.visible.some(row => row.some(cell => cell === true));
    expect(anyVisible).toBe(true);
  });
});

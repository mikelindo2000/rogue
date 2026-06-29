import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { TILE } from './tiles';
import { BALANCE } from './config';
import type { Monster } from './types';
import { monsterId, tierOf } from './discovery';
import { createTestPresenter } from './testPresenter';
import type { GamePresenter } from './presentation/presenter';

const makePresenter = createTestPresenter;

const grid = <T,>(engine: GameEngine, fill: T) =>
  new Array(engine.ROWS).fill(0).map(() => new Array(engine.COLS).fill(fill));

function makeRunner(floor = 1, presenter: GamePresenter = makePresenter()) {
  const engine = new GameEngine(presenter);
  engine.dungeonFloor = floor;
  engine.map = grid(engine, TILE.VOID);
  engine.explored = grid(engine, false);
  engine.visible = grid(engine, false);
  engine.dark = grid(engine, false);
  engine.items = [];
  engine.monsters = [];
  engine.traps = [];
  engine.trapEffects = { bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0, confusedTurns: 0 };
  engine.player.hunger = 100;
  engine.player.x = 2;
  engine.player.y = 2;
  return engine;
}

const carve = (engine: GameEngine, y: number, x1: number, x2: number, tile = TILE.FLOOR) => {
  for (let x = x1; x <= x2; x++) engine.map[y][x] = tile;
};

const monster = (over: Partial<Monster> = {}): Monster => ({
  x: 3, y: 2, symbol: 'r', name: 'Rat', hp: 5, maxHp: 5, atk: 1, color: '#fff', minFloor: 1, frozenTurns: 0, ...over,
});

describe('scroll Phase 1 effects', () => {
  it('Light: lights a dark room (consumes) but is kept in a lit room', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    engine.dark[2][1] = engine.dark[2][2] = engine.dark[2][3] = engine.dark[2][4] = true;
    engine.player.inventory.scrolls = ['light'];
    const turn0 = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).not.toContain('light');
    expect(engine.turn).toBe(turn0 + 1);

    // Reading again in a now-lit room is a no-op: kept, no turn.
    engine.player.inventory.scrolls = ['light'];
    const turn1 = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toContain('light');
    expect(engine.turn).toBe(turn1);
  });

  it('Sleep: puts the player to sleep and consumes the scroll', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    engine.player.inventory.scrolls = ['sleep'];
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).not.toContain('sleep');
    // The read spends a turn; sleep then ticks down on subsequent actions.
    expect(engine.trapEffects.sleepTurns).toBeGreaterThanOrEqual(BALANCE.scrolls.sleepTurns - 1);
  });

  it('Teleportation: relocates the player and consumes the scroll', () => {
    const engine = makeRunner();
    // Only the far row is FLOOR: the player's start tile (2,2) stays VOID so it is
    // not a teleport candidate, making the relocation deterministic (the
    // destination picker would otherwise be free to re-pick the current tile).
    carve(engine, 10, 6, 12);
    engine.player.inventory.scrolls = ['teleportation'];
    const before = { x: engine.player.x, y: engine.player.y };
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).not.toContain('teleportation');
    expect(engine.player.y).toBe(10);
    expect({ x: engine.player.x, y: engine.player.y }).not.toEqual(before);
  });

  it('Magic Mapping: reveals the layout, then is a no-op once fully explored', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 6);
    engine.player.inventory.scrolls = ['magic_mapping'];
    engine.useScroll(0);
    expect(engine.explored[2][6]).toBe(true);
    expect(engine.player.inventory.scrolls).not.toContain('magic_mapping');

    // Now everything is explored: a second mapping read is kept and free.
    engine.player.inventory.scrolls = ['magic_mapping'];
    const turn = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toContain('magic_mapping');
    expect(engine.turn).toBe(turn);
  });

  it('Monster Detection: senses off-screen monsters without changing FOV or terrain memory', () => {
    const engine = makeRunner(5);
    carve(engine, 2, 1, 4);
    carve(engine, 8, 14, 16);
    const sensed = monster({ x: 15, y: 8, frozenTurns: 99 });
    engine.monsters = [sensed];
    engine.player.inventory.scrolls = ['monster_detection'];
    const turn = engine.turn;

    engine.useScroll(0);

    expect(engine.player.inventory.scrolls).not.toContain('monster_detection');
    expect(engine.turn).toBe(turn + 1);
    expect(engine.statusEffects.monsterDetectionTurns).toBe(BALANCE.scrolls.monsterDetectionTurns - 1);
    expect(engine.visible[8][15]).toBe(false);
    expect(engine.explored[8][15]).toBe(false);
    expect(tierOf(engine.discovery, monsterId(sensed))).toBe('seen');
    expect(engine.discovery.defeated[monsterId(sensed)]).toBeUndefined();
  });

  it('Monster Detection: still consumes on an empty floor', () => {
    const engine = makeRunner(5);
    carve(engine, 2, 1, 4);
    engine.player.inventory.scrolls = ['monster_detection'];

    engine.useScroll(0);

    expect(engine.player.inventory.scrolls).not.toContain('monster_detection');
    expect(engine.statusEffects.monsterDetectionTurns).toBe(BALANCE.scrolls.monsterDetectionTurns - 1);
    expect(engine.logs.some(line => line.includes('sense no monsters'))).toBe(true);
  });

  it('Hold Monster: freezes monsters in sight', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    const m = monster({ x: 3, y: 2 });
    engine.monsters = [m];
    engine.visible[2][3] = true;
    engine.player.inventory.scrolls = ['hold_monster'];
    engine.useScroll(0);
    expect(m.frozenTurns).toBeGreaterThan(0);
    expect(engine.player.inventory.scrolls).not.toContain('hold_monster');
  });

  it('Create Monster: spawns a monster on an adjacent tile', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    carve(engine, 1, 1, 4);
    carve(engine, 3, 1, 4);
    engine.player.inventory.scrolls = ['create_monster'];
    engine.useScroll(0);
    expect(engine.monsters.length).toBe(1);
    const m = engine.monsters[0];
    expect(Math.max(Math.abs(m.x - engine.player.x), Math.abs(m.y - engine.player.y))).toBe(1);
    expect(engine.player.inventory.scrolls).not.toContain('create_monster');
  });

  it('Aggravate Monsters: wakes every monster to hunting', () => {
    const engine = makeRunner(7);
    carve(engine, 2, 1, 4);
    const sleeper = monster({ x: 20, y: 5, ai: { state: 'asleep', cooldowns: {}, swipeToggle: false } });
    engine.monsters = [sleeper];
    engine.player.inventory.scrolls = ['aggravate_monsters'];
    engine.useScroll(0);
    expect(sleeper.ai?.state).toBe('hunting');
  });

  it('Detection: marks matching floor items as explored and consumes', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    engine.items = [{ type: 'gold', symbol: '$', color: '#ff0', x: 15, y: 8 }];
    engine.player.inventory.scrolls = ['gold_detection'];
    engine.useScroll(0);
    expect(engine.explored[8][15]).toBe(true);
    expect(engine.player.inventory.scrolls).not.toContain('gold_detection');
  });

  it('Food Detection: highlights detected food in the map snapshot', () => {
    const snapshots: Parameters<GamePresenter['publishMap']>[0][] = [];
    const engine = makeRunner(1, makePresenter({
      publishMap: snapshot => snapshots.push(snapshot),
    }));
    carve(engine, 2, 1, 4);
    engine.items = [
      { type: 'food', symbol: '%', color: '#ff9900', x: 15, y: 8 },
      { type: 'gold', symbol: '$', color: '#ff0', x: 16, y: 8 },
    ];
    engine.player.inventory.scrolls = ['food_detection'];

    engine.useScroll(0);

    const latest = snapshots.at(-1);
    expect(latest?.items.find(item => item.type === 'food')).toMatchObject({
      explored: true,
      foodDetectionHighlighted: true,
    });
    expect(latest?.items.find(item => item.type === 'gold')?.foodDetectionHighlighted).toBe(false);
    expect(engine.explored[8][15]).toBe(true);
    expect(engine.explored[8][16]).toBe(false);
  });

  it('Blank Paper: consumes with no effect', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    engine.player.inventory.scrolls = ['blank_paper'];
    const turn = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).not.toContain('blank_paper');
    expect(engine.turn).toBe(turn + 1);
  });

  it('Enchant Weapon: adds damage to the equipped weapon and consumes', () => {
    const engine = makeRunner(7);
    carve(engine, 2, 1, 4);
    engine.player.inventory.weapons = [{ name: 'Dagger', dmg: 3, type: 'dagger' }];
    engine.player.equipped.mainHand = 0;
    engine.player.inventory.scrolls = ['enchant_weapon'];
    engine.useScroll(0);
    expect(engine.player.inventory.weapons[0].dmg).toBe(3 + BALANCE.scrolls.enchantWeaponBonus);
    expect(engine.player.inventory.scrolls).not.toContain('enchant_weapon');
  });

  it('Enchant Armor (undamaged): adds exactly +bonus to def and maxDef', () => {
    const engine = makeRunner(7);
    carve(engine, 2, 1, 4);
    engine.player.inventory.chest = [{ name: 'Plate', def: 4, maxDef: 4, health: { current: 4, max: 4 } }];
    engine.player.equipped.chest = 0;
    engine.player.inventory.scrolls = ['enchant_armor'];
    engine.useScroll(0);
    const b = BALANCE.scrolls.enchantArmorBonus;
    const armor = engine.player.inventory.chest[0];
    expect(armor.health).toEqual({ current: 4 + b, max: 4 + b });
    expect(armor.def).toBe(4 + b);
    expect(armor.maxDef).toBe(4 + b);
    expect(engine.player.inventory.scrolls).not.toContain('enchant_armor');
  });

  it('Enchant Armor (damaged): adds +bonus without repairing the damage gap', () => {
    const engine = makeRunner(7);
    carve(engine, 2, 1, 4);
    engine.player.inventory.chest = [{ name: 'Plate', def: 2, maxDef: 4, health: { current: 2, max: 4 } }];
    engine.player.equipped.chest = 0;
    engine.player.inventory.scrolls = ['enchant_armor'];
    engine.useScroll(0);
    const b = BALANCE.scrolls.enchantArmorBonus;
    const armor = engine.player.inventory.chest[0];
    // Effective defense (current) rises by exactly +bonus; the 2-point damage gap
    // is preserved — enchant does not double as a free repair.
    expect(armor.health).toEqual({ current: 2 + b, max: 4 + b });
    expect((armor.health!.max) - (armor.health!.current)).toBe(2);
    expect(engine.player.inventory.scrolls).not.toContain('enchant_armor');
  });

  it('Enchant Weapon with no weapon at all is kept and spends no turn', () => {
    const engine = makeRunner(7);
    carve(engine, 2, 1, 4);
    engine.player.inventory.weapons = [];
    engine.player.inventory.scrolls = ['enchant_weapon'];
    const turn = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toContain('enchant_weapon');
    expect(engine.turn).toBe(turn);
  });

  it('Unimplemented catalog scrolls are kept and spend no turn', () => {
    const engine = makeRunner();
    carve(engine, 2, 1, 4);
    engine.player.inventory.scrolls = ['identify'];
    const turn = engine.turn;
    engine.useScroll(0);
    expect(engine.player.inventory.scrolls).toContain('identify');
    expect(engine.turn).toBe(turn);
  });
});

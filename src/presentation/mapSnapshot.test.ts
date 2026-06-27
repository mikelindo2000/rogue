import { describe, expect, it } from 'vitest';
import { createPlayer } from '../player';
import { TILE } from '../tiles';
import type { RoomRect } from '../map';
import type { Item, Monster, TrapState } from '../types';
import { createMapSnapshot, deriveCurrentRoomScope } from './mapSnapshot';

const monster = (overrides: Partial<Monster> = {}): Monster => ({
  x: 1,
  y: 1,
  id: 'orc',
  symbol: 'O',
  name: 'Orc',
  hp: 8,
  maxHp: 10,
  atk: 3,
  color: '#55aa55',
  minFloor: 1,
  frozenTurns: 0,
  ...overrides,
});

const baseInput = (overrides: Partial<Parameters<typeof createMapSnapshot>[0]> = {}) => {
  const player = createPlayer();
  player.x = 1;
  player.y = 0;

  return {
    map: [
      [TILE.FLOOR, TILE.DOOR, TILE.WALL_H],
      [TILE.CORRIDOR, TILE.FLOOR, TILE.STAIRS_DOWN],
    ],
    explored: [
      [true, true, false],
      [true, false, true],
    ],
    visible: [
      [true, false, false],
      [false, false, true],
    ],
    player,
    monsters: [] as Monster[],
    items: [] as Item[],
    traps: [] as TrapState[],
    cols: 3,
    rows: 2,
    floor: 4,
    gameOver: false,
    gameWon: false,
    monsterDetectionActive: false,
    ...overrides,
  };
};

describe('createMapSnapshot', () => {
  it('copies tile grids with the current TILE vocabulary and visibility flags', () => {
    const snapshot = createMapSnapshot(baseInput());

    expect(snapshot.cols).toBe(3);
    expect(snapshot.rows).toBe(2);
    expect(snapshot.floor).toBe(4);
    expect(snapshot.scope).toEqual({ type: 'full-floor' });
    expect(snapshot.tiles[0][0]).toEqual({ x: 0, y: 0, kind: TILE.FLOOR, explored: true, visible: true, inScope: true });
    expect(snapshot.tiles[0][1]).toEqual({ x: 1, y: 0, kind: TILE.DOOR, explored: true, visible: false, inScope: true });
    expect(snapshot.tiles[1][2]).toEqual({ x: 2, y: 1, kind: TILE.STAIRS_DOWN, explored: true, visible: true, inScope: true });
    expect(snapshot.player).toEqual({ x: 1, y: 0, inScope: true });
  });

  it('breaks aliases to engine grids and entity objects', () => {
    const player = createPlayer();
    player.x = 1;
    player.y = 1;
    const sourceMonster = monster({
      ai: {
        state: 'hunting',
        cooldowns: { swipe: 2 },
        swipeToggle: false,
        pendingAttack: { attackId: 'club', resolveTurn: 12, targetX: 2, targetY: 1 },
      },
    });
    const sourceItem: Item = {
      type: 'gear',
      x: 0,
      y: 1,
      symbol: ')',
      color: '#ccc',
      data: { name: 'Short Sword', category: 'weapon', dmg: 2 },
    };
    const sourceTrap: TrapState = {
      id: 'trap-1',
      kind: 'dart',
      x: 2,
      y: 1,
      revealed: true,
      armed: true,
    };
    const map: string[][] = [[TILE.FLOOR, TILE.FLOOR, TILE.FLOOR], [TILE.FLOOR, TILE.FLOOR, TILE.FLOOR]];
    const snapshot = createMapSnapshot(baseInput({
      map,
      player,
      monsters: [sourceMonster],
      items: [sourceItem],
      traps: [sourceTrap],
    }));

    map[1][1] = TILE.WALL_H;
    player.x = 99;
    sourceMonster.x = 99;
    sourceMonster.ai!.pendingAttack!.targetX = 99;
    sourceItem.data.name = 'Long Sword';
    sourceTrap.armed = false;

    expect(snapshot.tiles[1][1].kind).toBe(TILE.FLOOR);
    expect(snapshot.player.x).toBe(1);
    expect(snapshot.monsters[0].x).toBe(1);
    expect(snapshot.monsters[0].ai?.pendingAttack?.targetX).toBe(2);
    expect((snapshot.items[0].data as { name: string }).name).toBe('Short Sword');
    expect(snapshot.traps[0].armed).toBe(true);

    try {
      (snapshot.monsters[0] as { x: number }).x = 7;
      (snapshot.items[0].data as { name: string }).name = 'Mace';
    } catch {
      // Runtime freezing is an implementation detail; aliasing is the contract.
    }

    expect(sourceMonster.x).toBe(99);
    expect(sourceItem.data.name).toBe('Long Sword');
  });

  it('builds player, monster, and item views with stable monster render keys', () => {
    const sourceMonster = monster({ x: 1, y: 0, special: 'boss', frozenTurns: 2 });
    const secondMonster = monster({ x: 2, y: 1, name: 'Other Orc' });
    const sourceItem: Item = {
      type: 'gold',
      x: 0,
      y: 0,
      symbol: '$',
      color: '#ffd84d',
      amount: 42,
    };

    const first = createMapSnapshot(baseInput({ monsters: [sourceMonster, secondMonster], items: [sourceItem] }));
    sourceMonster.x = 2;
    const second = createMapSnapshot(baseInput({ monsters: [sourceMonster, secondMonster], items: [sourceItem] }));

    expect(first.player).toEqual({ x: 1, y: 0, inScope: true });
    expect(second.monsters[0].key).toBe(first.monsters[0].key);
    expect(first.monsters[0].key).not.toBe(first.monsters[1].key);
    expect(first.monsters[0]).toMatchObject({
      id: 'orc',
      x: 1,
      y: 0,
      name: 'Orc',
      glyph: 'O',
      color: '#55aa55',
      hp: 8,
      maxHp: 10,
      atk: 3,
      minFloor: 1,
      special: 'boss',
      frozenTurns: 2,
      visible: false,
      inScope: true,
    });
    expect(first.items[0]).toMatchObject({
      x: 0,
      y: 0,
      type: 'gold',
      amount: 42,
      glyph: '$',
      color: '#ffd84d',
      explored: true,
      visible: true,
      inScope: true,
    });
  });

  it('marks detected monsters separately from visible monsters', () => {
    const visibleMonster = monster({ x: 0, y: 0 });
    const hiddenMonster = monster({ x: 1, y: 1, name: 'Hidden Orc' });
    const snapshot = createMapSnapshot(baseInput({
      monsters: [visibleMonster, hiddenMonster],
      monsterDetectionActive: true,
    }));

    expect(snapshot.monsterDetectionActive).toBe(true);
    expect(snapshot.monsters[0]).toMatchObject({ visible: true, detected: false });
    expect(snapshot.monsters[1]).toMatchObject({ visible: false, detected: true });
  });

  it('copies trap and run-end fields', () => {
    const snapshot = createMapSnapshot(baseInput({
      gameOver: true,
      gameWon: true,
      traps: [
        { id: 'bear-1', kind: 'bear', x: 0, y: 0, revealed: true, armed: false },
        { id: 'gas-1', kind: 'sleep_gas', x: 2, y: 1, revealed: false, armed: true },
      ],
    }));

    expect(snapshot.gameOver).toBe(true);
    expect(snapshot.gameWon).toBe(true);
    expect(snapshot.traps).toEqual([
      { id: 'bear-1', kind: 'bear', x: 0, y: 0, revealed: true, armed: false, explored: true, visible: true, inScope: true },
      { id: 'gas-1', kind: 'sleep_gas', x: 2, y: 1, revealed: false, armed: true, explored: true, visible: true, inScope: true },
    ]);
  });

  it('builds room-scoped snapshots from the authoritative full-floor state', () => {
    const insideMonster = monster({ x: 1, y: 1, name: 'Inside Orc' });
    const outsideMonster = monster({ x: 0, y: 0, name: 'Outside Orc' });
    const insideItem: Item = { type: 'gold', x: 2, y: 1, symbol: '$', color: '#ffd84d', amount: 7 };
    const outsideItem: Item = { type: 'food', x: 0, y: 0, symbol: '%', color: '#ff9900' };
    const insideTrap: TrapState = { id: 'inside-trap', kind: 'bear', x: 1, y: 0, revealed: true, armed: true };
    const outsideTrap: TrapState = { id: 'outside-trap', kind: 'dart', x: 0, y: 1, revealed: true, armed: true };

    const snapshot = createMapSnapshot(baseInput({
      monsters: [outsideMonster, insideMonster],
      items: [outsideItem, insideItem],
      traps: [outsideTrap, insideTrap],
      monsterDetectionActive: true,
      scope: { type: 'room', rect: { l: 1, t: 0, r: 2, b: 1 } },
    }));

    expect(snapshot.cols).toBe(3);
    expect(snapshot.rows).toBe(2);
    expect(snapshot.scope).toEqual({ type: 'room', rect: { l: 1, t: 0, r: 2, b: 1 } });
    expect(snapshot.tiles[0][0]).toEqual({ x: 0, y: 0, kind: TILE.VOID, explored: false, visible: false, inScope: false });
    expect(snapshot.tiles[0][1]).toEqual({ x: 1, y: 0, kind: TILE.DOOR, explored: true, visible: false, inScope: true });
    expect(snapshot.tiles[1][2]).toEqual({ x: 2, y: 1, kind: TILE.STAIRS_DOWN, explored: true, visible: true, inScope: true });
    expect(snapshot.monsters.map(mon => mon.name)).toEqual(['Inside Orc']);
    expect(snapshot.monsters[0]).toMatchObject({ x: 1, y: 1, visible: false, detected: true, inScope: true });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({ key: 'item-1-gold-2-1', x: 2, y: 1, visible: true, explored: true, inScope: true });
    expect(snapshot.traps).toEqual([
      { id: 'inside-trap', kind: 'bear', x: 1, y: 0, revealed: true, armed: true, explored: true, visible: false, inScope: true },
    ]);
  });

  it('returns to a full-floor snapshot after a scoped room snapshot', () => {
    createMapSnapshot(baseInput({ scope: { type: 'room', rect: { l: 1, t: 0, r: 2, b: 1 } } }));

    const fullFloor = createMapSnapshot(baseInput());

    expect(fullFloor.scope).toEqual({ type: 'full-floor' });
    expect(fullFloor.tiles[0][0]).toEqual({ x: 0, y: 0, kind: TILE.FLOOR, explored: true, visible: true, inScope: true });
  });
});

describe('deriveCurrentRoomScope', () => {
  const rooms: RoomRect[] = [
    { l: 1, t: 1, r: 4, b: 4, cx: 2, cy: 2 },
    { l: 8, t: 2, r: 12, b: 6, cx: 10, cy: 4 },
  ];

  it('returns the room containing the player when no boss position is supplied', () => {
    expect(deriveCurrentRoomScope({ rooms, player: { x: 3, y: 2 } })).toEqual({
      type: 'room',
      rect: { l: 1, t: 1, r: 4, b: 4 },
    });
  });

  it('returns the player room when player and boss share it', () => {
    expect(deriveCurrentRoomScope({ rooms, player: { x: 3, y: 2 }, boss: { x: 1, y: 4 } })).toEqual({
      type: 'room',
      rect: { l: 1, t: 1, r: 4, b: 4 },
    });
  });

  it('returns null when the player is not in a known room', () => {
    expect(deriveCurrentRoomScope({ rooms, player: { x: 6, y: 2 }, boss: { x: 3, y: 2 } })).toBeNull();
  });

  it('returns null when a boss position is outside the player room', () => {
    expect(deriveCurrentRoomScope({ rooms, player: { x: 3, y: 2 }, boss: { x: 10, y: 4 } })).toBeNull();
  });
});

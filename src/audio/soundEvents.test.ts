import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { RecordingSink } from './events';
import type { Monster } from '../types';

// A UI stub: every method is a no-op. The engine only needs the calls not to throw.
const makeUi = () => new Proxy({}, { get: () => () => {} });

const makeMonster = (over: Partial<Monster> = {}): Monster => ({
  x: 1, y: 1, symbol: 'L', name: 'Leprechaun', hp: 1, atk: 1,
  color: '#fff', minFloor: 1, frozenTurns: 0, ...over,
});

const armedEngine = () => {
  const sink = new RecordingSink();
  const engine = new GameEngine(makeUi() as any, sink);
  // one-shot kill setup
  engine.player.baseAtk = 100;
  engine.player.inventory.weapons[0] = { name: 'Test Blade', dmg: 100 };
  engine.player.equipped.mainHand = 0;
  engine.player.equipped.offHand = 'none:0';
  return { engine, sink };
};

describe('engine sound emission', () => {
  it('emits combat.hit then combat.death with resolved monster identity', () => {
    const { engine, sink } = armedEngine();
    const lep = makeMonster();
    engine.monsters = [lep];

    engine.playerAttack(lep);

    expect(sink.types()).toContain('combat.hit');
    const deaths = sink.ofType('combat.death');
    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toMatchObject({ monsterId: 'leprechaun', archetype: 'trickster' });
  });

  it('tags a boss death via the special payload (drives the bySpecial cue)', () => {
    const { engine, sink } = armedEngine();
    const boss = makeMonster({ name: 'Dragon King', special: 'boss' });
    engine.monsters = [boss];

    engine.playerAttack(boss);

    expect(sink.ofType('combat.death')[0]).toMatchObject({ special: 'boss' });
  });

  it('works with the default no-op sink (no sink injected)', () => {
    const engine = new GameEngine(makeUi() as any);
    engine.player.baseAtk = 100;
    engine.player.inventory.weapons[0] = { name: 'Test Blade', dmg: 100 };
    engine.player.equipped.mainHand = 0;
    const m = makeMonster();
    engine.monsters = [m];
    expect(() => engine.playerAttack(m)).not.toThrow();
    expect(engine.monsters).toHaveLength(0);
  });

  it('emits equipment.rejected when a non-equippable item is equipped', () => {
    const { engine, sink } = armedEngine();
    engine.equipInventoryItem({ kind: 'potion', potionType: 'healing' } as any);
    expect(sink.types()).toContain('equipment.rejected');
  });
});

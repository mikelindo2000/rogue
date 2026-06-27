import { describe, it, expect } from 'vitest';
import { MONSTER_DROPS, describeDrop, monsterDrops, type MonsterDrop } from './drops';
import { ARMOR_SLOTS } from './types';

describe('MONSTER_DROPS table (Phase-1 assignments)', () => {
  it('assigns the orc a 2h_mace named "Giant Thighbone" at 12%', () => {
    const drops = MONSTER_DROPS['orc'];
    expect(drops).toEqual([
      { chance: 0.12, name: 'Giant Thighbone', kind: { type: 'gear', category: '2h_mace' } },
    ]);
  });

  it('gives the Quinotaur two drops (armor + dagger)', () => {
    const drops = MONSTER_DROPS['quinotaur'] ?? [];
    expect(drops.map((d) => d.name)).toEqual(['Cow Hide Armor', 'Splintered Horn']);
  });

  it('maps consumable-flavored drops onto existing kinds', () => {
    expect(MONSTER_DROPS['hobgoblin']?.[0]?.kind.type).toBe('potion'); // Black Powder Bomb
    expect(MONSTER_DROPS['king-cobra']?.[0]?.kind.type).toBe('food'); // Cobra Flesh
    expect(MONSTER_DROPS['agitated-apperation']?.every((d) => d.kind.type === 'scroll')).toBe(true);
  });

  it("pins the Dragon King's uniques to legendary at a guaranteed 1.0", () => {
    const drops = MONSTER_DROPS['dragon-king'] ?? [];
    expect(drops).toHaveLength(2);
    for (const d of drops) {
      expect(d.chance).toBe(1.0);
      expect(d.kind.type).toBe('gear');
      if (d.kind.type === 'gear') expect(d.kind.rarity).toBe('legendary');
    }
  });

  it('rates: normal 0.12, hero/rare 0.25', () => {
    expect(MONSTER_DROPS['eagle']?.[0]?.chance).toBe(0.12);
    expect(MONSTER_DROPS['kalius-king-cobra']?.[0]?.chance).toBe(0.25);
    expect(MONSTER_DROPS['colossal-cyclops']?.every((d) => d.chance === 0.25)).toBe(true);
  });

  it('SKIPS accessory-only monsters and the leprechaun (no double gold)', () => {
    for (const id of [
      'cyclops',
      'snake',
      'pygmy',
      'yeti',
      'zombie',
      'trogdor-the-troll',
      'zachary-the-zombie',
      'leprechaun',
    ]) {
      expect(MONSTER_DROPS[id]).toBeUndefined();
    }
  });

  it('every gear category is a real GEAR_POOL key or randomArmor', () => {
    const valid = new Set([
      'helm', 'chest', 'legs', 'gauntlets', 'boots', 'shield',
      'dagger', '1h_sword', '2h_sword', '1h_mace', '2h_mace', 'staff',
      'randomArmor',
    ]);
    for (const drops of Object.values(MONSTER_DROPS)) {
      for (const d of drops) {
        if (d.kind.type === 'gear') expect(valid.has(d.kind.category)).toBe(true);
      }
    }
  });

  it('randomArmor maps only onto the five armor slots', () => {
    // Sanity: ARMOR_SLOTS is the resolution target for randomArmor at spawn.
    expect([...ARMOR_SLOTS]).toEqual(['helm', 'chest', 'legs', 'gauntlets', 'boots']);
  });
});

describe('describeDrop (bestiary)', () => {
  it('uses the flavor name and a percent chance', () => {
    const drop: MonsterDrop = { chance: 0.12, name: 'Talon Dagger', kind: { type: 'gear', category: 'dagger' } };
    expect(describeDrop(drop)).toEqual({ name: 'Talon Dagger', chance: '12%' });
  });

  it('falls back to a generic kind label when unnamed (gold)', () => {
    const drop: MonsterDrop = { chance: 0.25, kind: { type: 'gold', min: 150, max: 200 } };
    expect(describeDrop(drop)).toEqual({ name: 'Gold', chance: '25%' });
  });

  it('labels an unnamed randomArmor drop as Armor and gear as Gear', () => {
    expect(describeDrop({ chance: 0.1, kind: { type: 'gear', category: 'randomArmor' } }).name).toBe('Armor');
    expect(describeDrop({ chance: 0.1, kind: { type: 'gear', category: 'dagger' } }).name).toBe('Gear');
  });

  it('rounds the chance to a whole percent', () => {
    expect(describeDrop({ chance: 1.0, name: 'X', kind: { type: 'food' } }).chance).toBe('100%');
  });

  it('monsterDrops resolves a monster id to its described drops, [] when none', () => {
    expect(monsterDrops('orc')).toEqual([{ name: 'Giant Thighbone', chance: '12%' }]);
    expect(monsterDrops('cyclops')).toEqual([]);
  });
});

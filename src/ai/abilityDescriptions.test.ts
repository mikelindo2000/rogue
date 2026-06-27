import { describe, it, expect } from 'vitest';
import { describeAbility, monsterAbilities } from './abilityDescriptions';
import type { AbilitySpec } from './types';

describe('ability descriptions (bestiary)', () => {
  it('describes a DoT from its spec, using the sheet label when present', () => {
    const spec: AbilitySpec = {
      id: 'poison', label: 'Poisonous Puke', chance: 0.03, magnitude: 1, duration: 3,
      damageType: 'poison', cooldown: 0, trigger: 'onHit',
    };
    const d = describeAbility(spec);
    expect(d.name).toBe('Poisonous Puke');
    expect(d.chance).toBe('3%');
    expect(d.trigger).toBe('on hit');
    expect(d.effect).toBe('1 poison damage per turn for 3 turns');
  });

  it('generates a name when no label is given, and pluralizes correctly', () => {
    const stun: AbilitySpec = { id: 'stun', chance: 0.03, magnitude: 1, duration: 1, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(stun);
    expect(d.name).toBe('Stun');
    expect(d.effect).toBe('you lose 1 turn'); // singular
  });

  it('describes fear with its sheet label and duration', () => {
    const fear: AbilitySpec = { id: 'fear', label: 'Giantfolk Growl', chance: 0.01, duration: 3, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(fear);
    expect(d.name).toBe('Giantfolk Growl');
    expect(d.chance).toBe('1%');
    expect(d.effect).toBe('you flee in fear for 3 turns');
  });

  it('describes armorDebuff with its magnitude and duration', () => {
    const deb: AbilitySpec = { id: 'armorDebuff', label: 'Shrink', chance: 0.03, magnitude: 3, duration: 3, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(deb);
    expect(d.name).toBe('Shrink');
    expect(d.effect).toBe('your armor drops by 3 for 3 turns');
  });

  it('describes atkDebuff with its magnitude and duration', () => {
    const deb: AbilitySpec = { id: 'atkDebuff', label: 'Oxidize', chance: 0.03, magnitude: 3, duration: 3, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(deb);
    expect(d.name).toBe('Oxidize');
    expect(d.effect).toBe('your attacks weaken by 3 for 3 turns');
  });

  it('describes weaponDebuff with its duration', () => {
    const deb: AbilitySpec = { id: 'weaponDebuff', label: 'Disarm', chance: 0.01, duration: 2, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(deb);
    expect(d.name).toBe('Disarm');
    expect(d.effect).toBe('you fight disarmed for 2 turns');
  });

  it('describes missChance as a percent-to-miss for a duration', () => {
    const miss: AbilitySpec = { id: 'missChance', label: 'Spit', chance: 0.01, magnitude: 0.25, duration: 3, cooldown: 0, trigger: 'onHit' };
    const d = describeAbility(miss);
    expect(d.name).toBe('Spit');
    expect(d.effect).toBe('25% chance to miss for 3 turns');
  });

  it('falls back gracefully for an id it does not know', () => {
    const d = describeAbility({ id: 'summon', chance: 0.05, duration: 4, cooldown: 0, trigger: 'onHit' });
    expect(d.name).toBe('Summon');
    expect(d.effect).toBe('calls another monster to its aid');
  });

  it('surfaces a monster\'s resolved abilities (Brown Bat has its poison)', () => {
    const bat = { symbol: 'B', name: 'Brown Bat', hp: 22, atk: 8, color: '#8b4513', minFloor: 1 };
    const abilities = monsterAbilities(bat);
    expect(abilities.length).toBeGreaterThan(0);
    expect(abilities.some((a) => a.effect.includes('poison damage per turn'))).toBe(true);
  });

  it('returns an empty list for a monster with no abilities (Orc)', () => {
    const orc = { symbol: 'O', name: 'Orc', hp: 24, atk: 7, color: '#8f9b2e', minFloor: 1 };
    expect(monsterAbilities(orc)).toEqual([]);
  });
});

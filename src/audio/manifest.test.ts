import { describe, expect, it } from 'vitest';
import { resolveClipId, resolveCue, SOUND_ASSETS } from './manifest';
import type { SoundEvent } from './events';

const death = (over: Partial<Extract<SoundEvent, { type: 'combat.death' }>>): SoundEvent => ({
  type: 'combat.death', monsterId: 'x', archetype: 'default', ...over,
});

describe('death cue cascade', () => {
  it('resolves a per-archetype clip', () => {
    expect(resolveClipId(death({ archetype: 'trickster' }))).toBe('death-trickster');
    expect(resolveClipId(death({ archetype: 'brute' }))).toBe('death-brute');
    expect(resolveClipId(death({ archetype: 'bat' }))).toBe('death-bat');
  });

  it('falls through to the boss clip via special when archetype has no clip', () => {
    expect(resolveClipId(death({ archetype: 'boss-swiper', special: 'boss' }))).toBe('death-boss');
    expect(resolveClipId(death({ archetype: 'default', special: 'hero' }))).toBe('death-boss');
  });

  it('falls through to the generic default for plain monsters', () => {
    expect(resolveClipId(death({ archetype: 'default' }))).toBe('death-default');
    expect(resolveClipId(death({ archetype: 'unknown-archetype' }))).toBe('death-default');
  });
});

describe('payload-based routing', () => {
  it('routes combat.hit by who is hit', () => {
    expect(resolveClipId({ type: 'combat.hit', actor: 'player', target: 'monster' })).toBe('combat-hit');
    expect(resolveClipId({ type: 'combat.hit', actor: 'monster', target: 'player' })).toBe('player-hit');
  });

  it('routes item pickups and consumption by kind', () => {
    expect(resolveClipId({ type: 'item.pickup', kind: 'gold' })).toBe('item-gold');
    expect(resolveClipId({ type: 'item.pickup', kind: 'gear' })).toBe('item-pickup');
    expect(resolveClipId({ type: 'item.consume', kind: 'potion' })).toBe('consume-potion');
    expect(resolveClipId({ type: 'item.consume', kind: 'food' })).toBe('consume-food');
  });

  it('routes stairs by direction', () => {
    expect(resolveClipId({ type: 'map.stairs', dir: 'down' })).toBe('stairs-down');
    expect(resolveClipId({ type: 'map.stairs', dir: 'up' })).toBe('stairs-up');
  });
});

describe('manifest integrity', () => {
  it('resolveCue returns an asset whose id matches its key', () => {
    const cue = resolveCue({ type: 'map.secretReveal' });
    expect(cue?.id).toBe('secret-reveal');
    expect(cue?.variants.length).toBeGreaterThan(0);
  });

  it('every resolvable clip id exists in SOUND_ASSETS', () => {
    const ids = [
      'combat-hit', 'player-hit', 'combat-miss', 'death-default', 'death-boss',
      'player-levelup', 'player-lowhealth', 'player-criticalhealth', 'player-death',
      'hunger-hungry', 'hunger-fatigued', 'hunger-starving', 'hunger-starvetick',
      'equip-weapon', 'equip-armor', 'equip-unequip', 'equip-rejected',
      'item-pickup', 'item-gold', 'consume-potion', 'consume-food',
      'stairs-down', 'stairs-up', 'secret-reveal',
    ];
    for (const id of ids) expect(SOUND_ASSETS[id], id).toBeDefined();
  });
});

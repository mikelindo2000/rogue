import { describe, it, expect } from 'vitest';
import { resolveBehavior } from './archetypes';

/**
 * The DoT-ability backfill: monsters whose GM-sheet ability is a damage-over-time
 * effect get a `poison`-dispatch ability (the `damageType` carries the flavor),
 * assigned per-monster in MONSTER_ABILITIES so siblings sharing an archetype are
 * unaffected. Values are the sheet's verbatim.
 */
describe('DoT ability backfill', () => {
  const cases = [
    { name: 'Brown Bat', chance: 0.03, magnitude: 1, duration: 3, damageType: 'poison' },
    { name: 'Snake', chance: 0.03, magnitude: 2, duration: 3, damageType: 'poison' },
    { name: 'King Cobra', chance: 0.03, magnitude: 5, duration: 3, damageType: 'poison' },
    { name: 'Cyclops', chance: 0.01, magnitude: 5, duration: 3, damageType: 'bacterial' },
    { name: 'Dragon', chance: 0.03, magnitude: 10, duration: 5, damageType: 'fire' },
    { name: 'Zachary the Zombie', chance: 0.01, magnitude: 25, duration: 2, damageType: 'bacterial' },
    { name: 'Dragon King', chance: 0.03, magnitude: 20, duration: 3, damageType: 'acid' },
  ] as const;

  for (const c of cases) {
    it(`${c.name} resolves with its sheet DoT (${c.magnitude}/turn ${c.damageType} x${c.duration} @${c.chance})`, () => {
      const dot = resolveBehavior({ name: c.name }).abilities.find((a) => a.id === 'poison');
      expect(dot, `${c.name} should have a DoT ability`).toBeDefined();
      expect(dot!.trigger).toBe('onHit');
      expect(dot!.chance).toBe(c.chance);
      expect(dot!.magnitude).toBe(c.magnitude);
      expect(dot!.duration).toBe(c.duration);
      expect(dot!.damageType).toBe(c.damageType);
    });
  }

  it('does not leak abilities to siblings sharing an archetype', () => {
    // A monster with no assignment at all resolves to a clean, empty ability list,
    // and the DoT does not leak to it.
    expect(resolveBehavior({ name: 'Practice Dummy' }).abilities.find((a) => a.id === 'poison')).toBeUndefined();
    expect(resolveBehavior({ name: 'Practice Dummy' }).abilities).toHaveLength(0);
    // Colossal Cyclops shares 'brute' with Cyclops but has its own sheet abilities —
    // it must NOT inherit Cyclops's Munch DoT.
    expect(resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.id === 'poison')).toBeUndefined();
    // Golem shares 'guardian' with the Dragon — no Molten Breath leak.
    expect(resolveBehavior({ name: 'Golem' }).abilities.find((a) => a.id === 'poison')).toBeUndefined();
  });

  it('merges per-monster abilities on top of archetype abilities', () => {
    // Zachary keeps the leech archetype's heal AND gains Graveyard Grab.
    const abilities = resolveBehavior({ name: 'Zachary the Zombie' }).abilities;
    expect(abilities.find((a) => a.id === 'leechHeal')).toBeDefined();
    expect(abilities.find((a) => a.id === 'poison')).toBeDefined();
  });
});

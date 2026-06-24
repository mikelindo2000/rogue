import { describe, it, expect } from 'vitest';
import { playerSpriteName } from './avatar';
import { MonsterStage, lifecycleHp, STAGE_LOOP, type StageBehavior } from './stage';

// A no-op 2D context: every method is a stub, measureText returns plausible
// metrics, and property assignments (fillStyle, font, …) are swallowed. Lets us
// drive the whole cinematic headlessly and assert it never throws.
function stubContext(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'measureText') {
          return () => ({ width: 10, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 });
        }
        return () => {};
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function stubCanvas(): HTMLCanvasElement {
  const ctx = stubContext();
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 200 }),
  } as unknown as HTMLCanvasElement;
}

const COMBOS: StageBehavior[] = [
  { attackKind: 'melee', hasEvasion: false, erratic: false },
  { attackKind: 'telegraph', hasEvasion: true, erratic: true }, // the bat
  { attackKind: 'telegraph', hasEvasion: false, erratic: false },
  { attackKind: 'melee', hasEvasion: true, erratic: true },
];

describe('lifecycleHp', () => {
  it('starts full, ends dead, and respawns full', () => {
    expect(lifecycleHp(0, false)).toBe(1);
    expect(lifecycleHp(0, true)).toBe(1);
    expect(lifecycleHp(5000, false)).toBe(0); // in the death segment
    expect(lifecycleHp(STAGE_LOOP - 10, false)).toBe(1); // respawned
  });

  it('is monotonically non-increasing from encounter through death', () => {
    for (const evasive of [false, true]) {
      let prev = Infinity;
      for (let e = 0; e <= 4600; e += 50) {
        const hp = lifecycleHp(e, evasive);
        expect(hp).toBeLessThanOrEqual(prev + 1e-9);
        prev = hp;
      }
    }
  });

  it('an evasive monster keeps full HP through the first (dodged) strike', () => {
    // Evasive: first strike is dodged, so HP is still 1 just after hero1's
    // impact; non-evasive has already dropped below 1 there.
    const justAfterHero1 = 2900;
    expect(lifecycleHp(justAfterHero1, true)).toBe(1);
    expect(lifecycleHp(justAfterHero1, false)).toBeLessThan(1);
  });
});

describe('MonsterStage.renderFrame', () => {
  it('paints every lifecycle beat without throwing, for all behavior combos', () => {
    const mon = { symbol: 'B', color: '#8b4513', boss: false };
    for (const behavior of COMBOS) {
      const stage = new MonsterStage(stubCanvas(), mon, { sprite: 'knight' }, behavior);
      expect(() => {
        for (let e = 0; e <= STAGE_LOOP; e += 73) stage.renderFrame(e);
      }).not.toThrow();
    }
  });

  it('renders each avatar sprite without throwing', () => {
    const mon = { symbol: 'D', color: '#00ff00', boss: true };
    for (const sprite of ['rogue', 'knight', 'adventurer', 'mage'] as const) {
      const stage = new MonsterStage(stubCanvas(), mon, { sprite }, COMBOS[0]);
      expect(() => stage.renderFrame(1700)).not.toThrow();
    }
  });
});

describe('playerSpriteName', () => {
  it('returns display names for playable character sprites', () => {
    expect(playerSpriteName('rogue')).toBe('Rogue');
    expect(playerSpriteName('knight')).toBe('Knight');
    expect(playerSpriteName('adventurer')).toBe('Adventurer');
    expect(playerSpriteName('mage')).toBe('Mage');
  });
});

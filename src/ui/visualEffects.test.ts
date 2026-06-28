import { describe, expect, it } from 'vitest';
import { levelUpBloomEffect, visualEffectLayers, visualEffectStyle } from './visualEffects';

// Mirrors format.test.ts's survival baseline so the two stay in lockstep.
// Floor 2 has only the baseline chrome texture, no fog/glow/survival effects.
const base = { floor: 2, hp: 30, maxHp: 30, hunger: 800, hungerFatigued: 190, hungerHungry: 425 };

describe('visualEffectLayers — survival migration', () => {
  it('produces no survival effects in a safe state', () => {
    expect(visualEffectLayers(base).some(e => e.kind.startsWith('survival'))).toBe(false);
  });

  it('emits a hunger overlay when hunger is low', () => {
    const effects = visualEffectLayers({ ...base, hunger: 100 });
    const fx = effects.find(e => e.kind === 'survival-hunger');
    expect(fx).toBeTruthy();
    expect(fx!.target).toBe('stage-overlay');
    expect(fx!.className).toBe('fx-survival-hunger');
    expect(fx!.intensity).toBeGreaterThan(0.4);
    expect(fx!.vars?.['--fx-intensity']).toBe(fx!.intensity);
  });

  it('emits a health overlay when HP is low', () => {
    const fx = visualEffectLayers({ ...base, hp: 5 }).find(e => e.kind === 'survival-health');
    expect(fx).toBeTruthy();
    expect(fx!.className).toBe('fx-survival-health');
  });

  it('uses the distinct combined effect when both warnings overlap', () => {
    const fx = visualEffectLayers({ ...base, hp: 5, hunger: 100 }).find(
      e => e.kind === 'survival-both',
    );
    expect(fx).toBeTruthy();
    expect(fx!.intensity).toBeGreaterThan(0.8);
  });
});

describe('visualEffectLayers — chrome textures', () => {
  it('adds a low chrome texture on every floor', () => {
    for (let floor = 1; floor <= 20; floor += 1) {
      const texture = visualEffectLayers({ ...base, floor }).filter(
        e => e.kind === 'floor-chrome-texture',
      );
      expect(texture.length, `floor ${floor}`).toBeGreaterThanOrEqual(1);
      expect(texture.every(e => e.target === 'chrome')).toBe(true);
      expect(texture.every(e => e.className === 'fx-chrome-texture')).toBe(true);
      expect(
        texture.every(e => String(e.vars?.['--fx-texture-url']).startsWith('url("/chrome-overlays/')),
      ).toBe(true);
    }
  });

  it('uses stable texture ids that change between assigned floors for crossfade', () => {
    const floor1 = visualEffectLayers({ ...base, floor: 1 }).find(
      e => e.kind === 'floor-chrome-texture',
    );
    const floor2 = visualEffectLayers({ ...base, floor: 2 }).find(
      e => e.kind === 'floor-chrome-texture',
    );

    expect(floor1?.id).toBe('chrome-texture-old-ashlar-0');
    expect(floor2?.id).toBe('chrome-texture-granite-rubble-0');
    expect(floor1?.id).not.toBe(floor2?.id);
  });
});

describe('visualEffectLayers — survival migration details', () => {
  it('keeps hunger overlay properties grounded in the survival registry', () => {
    const fx = visualEffectLayers({ ...base, hunger: 100 }).find(e => e.kind === 'survival-hunger')!;
    expect(fx.kind).toBe('survival-hunger');
    expect(fx.target).toBe('stage-overlay');
    expect(fx.className).toBe('fx-survival-hunger');
    expect(fx.intensity).toBeGreaterThan(0.4);
    expect(fx.vars?.['--fx-intensity']).toBe(fx.intensity);
  });
});

describe('visualEffectLayers — floor fog', () => {
  it('adds green fog on the mire and warren floors, on backdrop and chrome', () => {
    const effects = visualEffectLayers({ ...base, floor: 11 });
    const fog = effects.filter((e) => e.kind === 'floor-green-fog');
    expect(fog.map((e) => e.target).sort()).toEqual(['chrome', 'stage-backdrop']);
    expect(fog.every((e) => e.className === 'fx-green-fog')).toBe(true);
    // Stage fog reads stronger than the faint chrome tint.
    const stage = fog.find((e) => e.target === 'stage-backdrop');
    const chrome = fog.find((e) => e.target === 'chrome');
    expect(Number(stage?.vars?.['--fx-opacity'])).toBeGreaterThan(
      Number(chrome?.vars?.['--fx-opacity'])
    );
    // Fog (floor) layers paint above the base chrome texture and below survival.
    expect(visualEffectLayers({ ...base, floor: 13 }).filter(e => e.kind === 'floor-green-fog')).toHaveLength(2);
  });

  it('does not add fog on non-fog floors', () => {
    expect(visualEffectLayers({ ...base, floor: 12 }).some((e) => e.kind === 'floor-green-fog')).toBe(
      false
    );
  });

  it('layers floor fog beneath the survival warning when both are active', () => {
    const effects = visualEffectLayers({ ...base, floor: 11, hp: 5 });
    const fog = effects.find((e) => e.kind === 'floor-green-fog');
    const survival = effects.find((e) => e.kind === 'survival-health');
    expect(fog).toBeTruthy();
    expect(survival).toBeTruthy();
    expect(fog!.layer).toBeLessThan(survival!.layer);
  });

  it('gives every active effect a unique id', () => {
    const ids = visualEffectLayers({ ...base, floor: 11, hp: 5, hunger: 100 }).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('visualEffectLayers — floor 1 airy glow', () => {
  it('adds a light, airy effect on the chrome only on floor 1', () => {
    const effects = visualEffectLayers({ ...base, floor: 1 });
    const fx = effects.find(e => e.kind === 'floor-airy-light');
    expect(fx).toBeTruthy();
    expect(fx!.kind).toBe('floor-airy-light');
    expect(fx!.target).toBe('chrome');
    expect(fx!.className).toBe('fx-airy-light');
    // Chrome-only: nothing lands on the stage.
    expect(effects.some((e) => e.target.startsWith('stage'))).toBe(false);
  });

  it('still layers the survival overlay above the airy glow when both are active', () => {
    const effects = visualEffectLayers({ ...base, floor: 1, hp: 5 });
    const airy = effects.find((e) => e.kind === 'floor-airy-light');
    const survival = effects.find((e) => e.kind === 'survival-health');
    expect(airy).toBeTruthy();
    expect(survival).toBeTruthy();
    expect(airy!.layer).toBeLessThan(survival!.layer);
  });
});

describe('levelUpBloomEffect', () => {
  it('builds a full-stage overlay layer above the survival/boss washes', () => {
    const fx = levelUpBloomEffect(1);
    expect(fx.kind).toBe('levelup-bloom');
    // Renders over the whole stage like the other washes — never the map canvas.
    expect(fx.target).toBe('stage-overlay');
    expect(fx.className).toBe('fx-levelup-bloom');
    expect(fx.vars?.['--fx-intensity']).toBe(1);
  });

  it('encodes the token in the id so a new flash restarts the CSS animation', () => {
    // The keyed `{#each}` keys on id; a changed id remounts the node, replaying
    // the one-shot animation on back-to-back level-ups.
    expect(levelUpBloomEffect(1).id).toBe('levelup-bloom-1');
    expect(levelUpBloomEffect(2).id).not.toBe(levelUpBloomEffect(1).id);
  });
});

describe('visualEffectStyle', () => {
  it('serializes only custom properties into a style string', () => {
    const style = visualEffectStyle({
      id: 'x',
      kind: 'floor-green-fog',
      target: 'chrome',
      layer: 10,
      intensity: 1,
      className: 'fx-green-fog',
      vars: { '--fx-intensity': 0.5, '--fx-opacity': 0.12 },
    });
    expect(style).toBe('--fx-intensity: 0.5; --fx-opacity: 0.12');
  });

  it('returns an empty string when there are no vars', () => {
    expect(
      visualEffectStyle({
        id: 'x',
        kind: 'survival-health',
        target: 'stage-overlay',
        layer: 20,
        intensity: 1,
        className: 'fx-survival-health',
      })
    ).toBe('');
  });
});

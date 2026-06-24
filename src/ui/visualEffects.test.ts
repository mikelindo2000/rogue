import { describe, expect, it } from 'vitest';
import { visualEffectLayers, visualEffectStyle } from './visualEffects';

// Mirrors format.test.ts's survival baseline so the two stay in lockstep.
const base = { floor: 1, hp: 30, maxHp: 30, hunger: 800, hungerFatigued: 190 };

describe('visualEffectLayers — survival migration', () => {
  it('produces no effects in a safe state', () => {
    expect(visualEffectLayers(base)).toEqual([]);
  });

  it('emits a hunger overlay when hunger is low', () => {
    const effects = visualEffectLayers({ ...base, hunger: 100 });
    expect(effects).toHaveLength(1);
    const fx = effects[0];
    expect(fx.kind).toBe('survival-hunger');
    expect(fx.target).toBe('stage-overlay');
    expect(fx.className).toBe('fx-survival-hunger');
    expect(fx.intensity).toBeGreaterThan(0.4);
    expect(fx.vars?.['--fx-intensity']).toBe(fx.intensity);
  });

  it('emits a health overlay when HP is low', () => {
    const fx = visualEffectLayers({ ...base, hp: 5 })[0];
    expect(fx.kind).toBe('survival-health');
    expect(fx.className).toBe('fx-survival-health');
  });

  it('uses the distinct combined effect when both warnings overlap', () => {
    const effects = visualEffectLayers({ ...base, hp: 5, hunger: 100 });
    expect(effects).toHaveLength(1);
    expect(effects[0].kind).toBe('survival-both');
    expect(effects[0].intensity).toBeGreaterThan(0.8);
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
    // Fog (floor) layers paint below the survival overlay.
    expect(visualEffectLayers({ ...base, floor: 13 }).length).toBe(2);
  });

  it('does not add fog on non-fog floors', () => {
    expect(visualEffectLayers({ ...base, floor: 12 }).some((e) => e.kind === 'floor-green-fog')).toBe(
      false
    );
    expect(visualEffectLayers({ ...base, floor: 1 })).toEqual([]);
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

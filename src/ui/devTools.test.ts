import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDevControls,
  getProcMultiplier,
  setProcMultiplier,
  PROC_BOOST_MULTIPLIER,
  PROC_PRESETS,
  type DevToggleControl,
} from './devTools';
import { resetConfig, getConfig } from '../config';

beforeEach(() => {
  // Each test starts from default tunables (abilityProcMultiplier = 1).
  resetConfig();
});

describe('devTools registry', () => {
  it('builds with no context (config-only controls)', () => {
    const controls = buildDevControls();
    expect(controls.length).toBeGreaterThan(0);
    // Every control has the discriminated-union shape the panel renders.
    for (const c of controls) {
      expect(['toggle', 'action']).toContain(c.kind);
      expect(typeof c.id).toBe('string');
      expect(typeof c.label).toBe('string');
    }
  });

  it('also builds when handed an engine/ui context (future seam)', () => {
    const controls = buildDevControls({ engine: {}, ui: {} });
    expect(controls.length).toBeGreaterThan(0);
  });

  it('exposes a unique id per control', () => {
    const ids = buildDevControls().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('proc-rate multiplier helpers', () => {
  it('defaults to sheet rates (1×)', () => {
    expect(getProcMultiplier()).toBe(1);
  });

  it('round-trips through config', () => {
    setProcMultiplier(10);
    expect(getProcMultiplier()).toBe(10);
    expect(getConfig().abilityProcMultiplier).toBe(10);
    setProcMultiplier(1);
    expect(getProcMultiplier()).toBe(1);
  });

  it('PROC_PRESETS include 1× and are all positive', () => {
    expect(PROC_PRESETS).toContain(1);
    for (const p of PROC_PRESETS) expect(p).toBeGreaterThan(0);
  });
});

describe('proc-boost toggle control', () => {
  const procToggle = () =>
    buildDevControls().find(
      (c): c is DevToggleControl => c.kind === 'toggle' && c.id === 'proc-boost',
    )!;

  it('is registered as a toggle', () => {
    expect(procToggle()).toBeDefined();
  });

  it('isActive reflects the persisted config', () => {
    expect(procToggle().isActive()).toBe(false); // default 1×
    setProcMultiplier(PROC_BOOST_MULTIPLIER);
    expect(procToggle().isActive()).toBe(true);
  });

  it('setActive(true) boosts and setActive(false) restores sheet rates', () => {
    const t = procToggle();
    t.setActive(true);
    expect(getProcMultiplier()).toBe(PROC_BOOST_MULTIPLIER);
    expect(t.isActive()).toBe(true);

    t.setActive(false);
    expect(getProcMultiplier()).toBe(1);
    expect(t.isActive()).toBe(false);
  });

  it('isActive/setActive round-trip is idempotent across rebuilds', () => {
    procToggle().setActive(true);
    // A freshly built registry sees the same persisted state.
    expect(procToggle().isActive()).toBe(true);
    procToggle().setActive(false);
    expect(procToggle().isActive()).toBe(false);
  });
});

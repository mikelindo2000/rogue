import { describe, expect, it } from 'vitest';
import { VitalsSoundTracker } from './vitals';
import type { SoundEventType } from './events';

// BALANCE.player thresholds: hungry < 425, fatigued < 190.
const HUNGRY = 425;
const FATIGUED = 190;

const tracker = () => new VitalsSoundTracker(HUNGRY, FATIGUED);
const types = (events: { type: SoundEventType }[]) => events.map(e => e.type);

const FULL = { maxHp: 30 };

describe('VitalsSoundTracker — HP thresholds', () => {
  it('fires lowHealth once on a downward crossing of 50%', () => {
    const t = tracker();
    expect(types(t.update({ hp: 20, hunger: 999, ...FULL }))).toEqual([]); // 67%
    expect(types(t.update({ hp: 14, hunger: 999, ...FULL }))).toEqual(['player.lowHealth']); // 47%
    expect(types(t.update({ hp: 13, hunger: 999, ...FULL }))).toEqual([]); // still low, no repeat
  });

  it('fires criticalHealth and suppresses lowHealth on a shared crossing', () => {
    const t = tracker();
    // jump straight from full to 20% — critical outranks low
    expect(types(t.update({ hp: 6, hunger: 999, ...FULL }))).toEqual(['player.criticalHealth']);
  });

  it('re-arms lowHealth only after recovering above 60%', () => {
    const t = tracker();
    t.update({ hp: 14, hunger: 999, ...FULL }); // low fires (47%)
    expect(types(t.update({ hp: 17, hunger: 999, ...FULL }))).toEqual([]); // 57% — not re-armed yet
    t.update({ hp: 19, hunger: 999, ...FULL }); // 63% — re-arm
    expect(types(t.update({ hp: 14, hunger: 999, ...FULL }))).toEqual(['player.lowHealth']); // fires again
  });

  it('never fires HP cues at 0 hp (that is death, handled elsewhere)', () => {
    const t = tracker();
    expect(types(t.update({ hp: 0, hunger: 999, ...FULL }))).toEqual([]);
  });
});

describe('VitalsSoundTracker — hunger thresholds', () => {
  it('fires hungry then fatigued on successive downward crossings', () => {
    const t = tracker();
    expect(types(t.update({ hp: 30, hunger: 500, ...FULL }))).toEqual([]);
    expect(types(t.update({ hp: 30, hunger: 400, ...FULL }))).toEqual(['hunger.hungry']);
    expect(types(t.update({ hp: 30, hunger: 300, ...FULL }))).toEqual([]); // still hungry band
    expect(types(t.update({ hp: 30, hunger: 150, ...FULL }))).toEqual(['hunger.fatigued']);
  });

  it('fatigued suppresses hungry on a shared crossing', () => {
    const t = tracker();
    expect(types(t.update({ hp: 30, hunger: 100, ...FULL }))).toEqual(['hunger.fatigued']);
  });

  it('fires starving once, then starveTick while at zero', () => {
    const t = tracker();
    t.update({ hp: 30, hunger: 150, ...FULL }); // fatigued
    expect(types(t.update({ hp: 30, hunger: 0, ...FULL }))).toEqual(['hunger.starving']);
    expect(types(t.update({ hp: 29, hunger: 0, ...FULL }))).toEqual(['hunger.starveTick']);
    expect(types(t.update({ hp: 28, hunger: 0, ...FULL }))).toEqual(['hunger.starveTick']);
  });

  it('re-arms hunger cues after eating back above the thresholds', () => {
    const t = tracker();
    t.update({ hp: 30, hunger: 400, ...FULL }); // hungry
    t.update({ hp: 30, hunger: 500, ...FULL }); // recovered (eat) — re-arm
    expect(types(t.update({ hp: 30, hunger: 400, ...FULL }))).toEqual(['hunger.hungry']);
  });

  it('reset() re-arms every gate', () => {
    const t = tracker();
    t.update({ hp: 14, hunger: 400, ...FULL }); // low + hungry fire
    t.reset();
    expect(types(t.update({ hp: 14, hunger: 400, ...FULL }))).toEqual(
      expect.arrayContaining(['player.lowHealth', 'hunger.hungry']),
    );
  });
});

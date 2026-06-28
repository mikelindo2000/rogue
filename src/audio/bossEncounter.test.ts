import { describe, it, expect } from 'vitest';
import { BossEncounterTracker, type BossTurnInput } from './bossEncounter';

const boss = (over: Partial<BossTurnInput> = {}): BossTurnInput => ({
  key: 'dragon-king',
  name: 'Dragon King',
  hp: 1050,
  maxHp: 1050,
  visible: true,
  ...over,
});

const types = (u: { sounds: { type: string }[] }) => u.sounds.map(s => s.type);

describe('BossEncounterTracker', () => {
  it('is idle and silent with no boss present', () => {
    const t = new BossEncounterTracker();
    expect(t.idle).toBe(true);
    expect(t.update([])).toEqual({ sounds: [], rumble: 0 });
  });

  it('fires the encounter stinger once on first sighting', () => {
    const t = new BossEncounterTracker();
    expect(types(t.update([boss()]))).toContain('boss.encounter');
    expect(t.idle).toBe(false);
    // No second encounter cue on the next turn.
    expect(types(t.update([boss()]))).not.toContain('boss.encounter');
  });

  it('stays engaged but silent while the boss is out of sight', () => {
    const t = new BossEncounterTracker();
    t.update([boss()]);
    const u = t.update([boss({ visible: false })]);
    expect(u.sounds).toEqual([]);
    expect(t.idle).toBe(false);
  });

  it('fires a phase-change roar + rumble when HP crosses a threshold downward', () => {
    const t = new BossEncounterTracker();
    t.update([boss({ hp: 1050 })]); // phase 1
    const u = t.update([boss({ hp: 500 })]); // -> phase 2
    expect(types(u)).toContain('boss.phaseChange');
    expect(u.rumble).toBeGreaterThan(0);
  });

  it('does not walk the phase back when the boss heals', () => {
    const t = new BossEncounterTracker();
    t.update([boss({ hp: 300 })]); // engages at phase 3
    const u = t.update([boss({ hp: 1050 })]); // healed to full
    expect(types(u)).not.toContain('boss.phaseChange');
  });

  it('emits the heartbeat throb only once the fight has teeth', () => {
    const t = new BossEncounterTracker();
    // Full HP -> intensity 0.4, below the heartbeat gate.
    expect(types(t.update([boss({ hp: 1050 })]))).not.toContain('boss.heartbeat');
    // Wounded -> intensity climbs past the gate.
    expect(types(t.update([boss({ hp: 200 })]))).toContain('boss.heartbeat');
  });

  it('fires the defeat boom + rumble when the engaged boss vanishes', () => {
    const t = new BossEncounterTracker();
    t.update([boss()]);
    const u = t.update([]); // boss gone (slain)
    expect(types(u)).toContain('boss.defeated');
    expect(u.rumble).toBeGreaterThan(0);
    expect(t.idle).toBe(true);
  });

  it('reset() clears engagement so re-entry re-engages cleanly', () => {
    const t = new BossEncounterTracker();
    t.update([boss()]);
    t.reset();
    expect(t.idle).toBe(true);
    expect(types(t.update([boss()]))).toContain('boss.encounter');
  });
});

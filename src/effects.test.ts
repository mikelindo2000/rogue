import { describe, it, expect } from 'vitest';
import type { Player } from './types';
import { applyEffect, tickPlayerEffects, hasEffect, effectMagnitude } from './effects';

// A bare player carrying only the fields the effect spine touches (HP + the
// effect list). Cast through unknown — the spine never reads anything else.
function player(over: Partial<Player> = {}): Player {
  return { hp: 20, maxHp: 20, activeEffects: [], ...over } as unknown as Player;
}

describe('effects spine', () => {
  it('applies an effect onto the player and exposes it via the read helpers', () => {
    const p = player();
    applyEffect(p, { kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });

    expect(p.activeEffects).toHaveLength(1);
    expect(hasEffect(p, 'dot')).toBe(true);
    expect(effectMagnitude(p, 'dot')).toBe(1);
    // A kind that isn't active reads as absent / 0.
    expect(hasEffect(p, 'stun')).toBe(false);
    expect(effectMagnitude(p, 'stun')).toBe(0);
  });

  it('ticks a DoT: subtracts magnitude HP/turn and logs each tick', () => {
    const p = player({ hp: 20 });
    applyEffect(p, { kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });

    const t1 = tickPlayerEffects(p);
    expect(p.hp).toBe(19);
    expect(t1.damage).toBe(1);
    // Tick line shows the damage and a live countdown of remaining turns.
    expect(t1.logs.join(' ')).toMatch(/Brown Bat's poison courses through you \(-1, 2 turns left\)/);
    // Still active with one fewer turn.
    expect(hasEffect(p, 'dot')).toBe(true);
    expect(p.activeEffects[0].turns).toBe(2);
  });

  it('counts down to the singular and drops the suffix on the expiring tick', () => {
    const p = player({ hp: 20 });
    applyEffect(p, { kind: 'dot', turns: 2, magnitude: 1, source: 'Snake', damageType: 'poison' });

    const t1 = tickPlayerEffects(p); // 2 -> 1
    expect(t1.logs.join(' ')).toMatch(/\(-1, 1 turn left\)/);

    const t2 = tickPlayerEffects(p); // 1 -> 0, expiring tick has no "turns left" suffix
    expect(t2.logs.join(' ')).toMatch(/\(-1\)/);
    expect(t2.logs.join(' ')).not.toMatch(/turn left/);
  });

  it('expires after its duration, removing it and logging an expiry line', () => {
    const p = player({ hp: 20 });
    applyEffect(p, { kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });

    tickPlayerEffects(p); // 3 -> 2
    tickPlayerEffects(p); // 2 -> 1
    const last = tickPlayerEffects(p); // 1 -> 0, expires

    expect(p.hp).toBe(17); // 1 dmg × 3 ticks
    expect(hasEffect(p, 'dot')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(last.logs.join(' ')).toMatch(/poison works its way out of your system/);
    // No tick after it's gone.
    const after = tickPlayerEffects(p);
    expect(after.damage).toBe(0);
    expect(p.hp).toBe(17);
  });

  it('refreshes duration on re-apply instead of stacking magnitude', () => {
    const p = player({ hp: 20 });
    applyEffect(p, { kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });

    tickPlayerEffects(p); // 3 -> 2
    // Re-poisoned: clock resets to 3, magnitude does NOT stack to 2, and only one
    // DoT instance exists.
    applyEffect(p, { kind: 'dot', turns: 3, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });
    expect(p.activeEffects).toHaveLength(1);
    expect(p.activeEffects[0].turns).toBe(3);

    const t = tickPlayerEffects(p);
    expect(t.damage).toBe(1); // refreshed, not doubled
    expect(p.activeEffects[0].turns).toBe(2);
  });

  it('a DoT can kill: HP is driven to 0 or below for the engine death path to catch', () => {
    const p = player({ hp: 2 });
    applyEffect(p, { kind: 'dot', turns: 5, magnitude: 1, source: 'Brown Bat', damageType: 'poison' });

    tickPlayerEffects(p); // 2 -> 1
    const lethal = tickPlayerEffects(p); // 1 -> 0
    expect(p.hp).toBe(0);
    expect(lethal.damage).toBe(1);
    // The effect is still ticking (5-turn duration) — it doesn't self-cancel on a
    // kill; the engine's hp<=0 check ends the run.
    expect(hasEffect(p, 'dot')).toBe(true);
  });
});

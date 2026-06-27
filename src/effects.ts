/* The player status-effect spine — the persistent, monster-inflicted effects a
 * monster ability can lay on the player (poison DoT is the driving slice). This
 * is deliberately generic data machinery, not a poison-specific path: future
 * kinds (stun, fear, armorDebuff, …) reuse `applyEffect` and read through
 * `hasEffect` / `effectMagnitude`. See
 * design/planning/monster_abilities_framework_plan.md.
 *
 * The math stays pure where it can. `applyEffect` and the read helpers are pure
 * over `player.activeEffects`; only `tickPlayerEffects` mutates (player HP) and
 * it returns the log lines for the engine to emit, so the turn loop stays the
 * single owner of logging and death routing.
 */

import type { ActiveEffect, EffectKind, Player } from './types';

/** Damage-type → log verb for a DoT tick. Kept small and data-driven so new
 *  flavors are one row, not a new code path. */
const DOT_FLAVOR: Record<NonNullable<ActiveEffect['damageType']>, string> = {
  poison: 'poison courses through you',
  fire: 'flames sear you',
  acid: 'acid eats at you',
  bacterial: 'infection festers in you',
};

/**
 * Apply an effect to the player, centralizing the stacking policy.
 *
 * Policy (locked): re-applying an effect of the same kind REFRESHES its duration
 * rather than stacking magnitude — a fresh poison resets the clock to the new
 * effect's `turns` and adopts its magnitude/source/damageType, it does not add a
 * second independent DoT. Mutates `player.activeEffects` in place.
 */
export function applyEffect(player: Player, effect: ActiveEffect): void {
  const existing = player.activeEffects.find((e) => e.kind === effect.kind);
  if (existing) {
    // Refresh in place — keep the same list slot, adopt the new instance's
    // duration/magnitude/source so the clock restarts and logs name the latest
    // attacker.
    existing.turns = effect.turns;
    existing.magnitude = effect.magnitude;
    existing.source = effect.source;
    existing.damageType = effect.damageType;
    return;
  }
  player.activeEffects.push({ ...effect });
}

/** Whether the player currently has an active effect of the given kind. A pure
 *  read for the future read sites (e.g. "skip the turn if stunned"). */
export function hasEffect(player: Player, kind: EffectKind): boolean {
  return player.activeEffects.some((e) => e.kind === kind);
}

/** The magnitude of the player's active effect of the given kind, or 0 if none.
 *  Pure read for the read sites (armor/atk debuff, miss chance, …). */
export function effectMagnitude(player: Player, kind: EffectKind): number {
  return player.activeEffects.find((e) => e.kind === kind)?.magnitude ?? 0;
}

/** What one `tickPlayerEffects` call produced: the total HP lost to DoTs this
 *  turn (so the engine can attribute death) and the log lines to emit. */
export interface EffectTickResult {
  damage: number;
  logs: string[];
}

/**
 * Advance every active effect one player turn: apply the per-turn consequence
 * (only `dot` deals damage today — the rest are passive reads honored at their
 * own read sites), decrement the duration, and drop any that expired, logging an
 * expiry line. Mutates player HP for DoTs; returns the total damage dealt and the
 * log lines for the engine to emit and to route a death-by-DoT through its normal
 * death path.
 *
 * Tolerates a missing `activeEffects` (old saves) by treating it as empty.
 */
export function tickPlayerEffects(player: Player): EffectTickResult {
  const logs: string[] = [];
  let damage = 0;
  const effects = player.activeEffects ?? (player.activeEffects = []);

  // Iterate a snapshot; mutate the list as we expire entries.
  for (const effect of [...effects]) {
    // Decrement first so the tick line can report the turns that REMAIN after
    // this one — a live countdown the player can watch in the log ("…(-1, 2 turns
    // left)" → "1 turn left" → expiry). That countdown is the main effect-
    // visibility cue during play/testing, so every persistent kind should log here.
    effect.turns--;
    const expired = effect.turns <= 0;

    if (effect.kind === 'dot') {
      player.hp -= effect.magnitude;
      damage += effect.magnitude;
      const flavor = DOT_FLAVOR[effect.damageType ?? 'poison'];
      logs.push(`The ${effect.source}'s ${flavor} (-${effect.magnitude}${remainingSuffix(effect.turns)}).`);
    }

    if (expired) {
      const idx = effects.indexOf(effect);
      if (idx >= 0) effects.splice(idx, 1);
      logs.push(expiryLine(effect));
    }
  }

  return { damage, logs };
}

/** ", N turns left" suffix for a tick line, or "" when the effect expires this
 *  turn (the expiry line covers that case). Pluralized for readability. */
function remainingSuffix(turnsLeft: number): string {
  if (turnsLeft <= 0) return '';
  return `, ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`;
}

/** Flavor for an effect dropping off. Kept here so the tick reads cleanly. */
function expiryLine(effect: ActiveEffect): string {
  if (effect.kind === 'dot') {
    const type = effect.damageType ?? 'poison';
    return `The ${type} works its way out of your system.`;
  }
  return `The ${effect.kind} wears off.`;
}

/**
 * Boss-encounter pure logic — phase, intensity, and the engaged-boss selector.
 * No DOM, no audio, no engine state: a single source of truth shared by the
 * audio layer (BossEncounterTracker emits cues) and the presentation layer
 * (ChromePresenter projects the boss bar + crimson tension vignette). Mirrors
 * the pure-data style of format.ts / visualEffects.ts so it is trivially tested.
 *
 * A "boss" is any monster tagged special === 'boss'. Today that is the two
 * floor-20 final bosses (see FINAL_BOSS_ENCOUNTERS), but nothing here assumes a
 * count or a floor — it works for any boss the roster grows to carry.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Coarse fight stage, gated on the boss's remaining HP fraction. The thresholds
 *  are the same ones the audio tracker uses to fire a one-shot phase-change roar,
 *  so the roar and the visual ramp stay in lockstep. */
export type BossPhase = 1 | 2 | 3;

export function bossPhase(hpPct: number): BossPhase {
  if (hpPct > 0.66) return 1;
  if (hpPct > 0.33) return 2;
  return 3;
}

/**
 * Map a boss's remaining HP fraction to a 0–1 tension intensity. Always tense
 * once engaged (0.4 baseline — it's a boss), ramping as the boss is worn down,
 * with an extra enrage bump in the final quarter. Drives the vignette pulse, the
 * map sway, and the heartbeat-cue gate.
 */
export function bossIntensity(hpPct: number): number {
  const p = clamp01(hpPct);
  return clamp01(0.4 + (1 - p) * 0.5 + (p < 0.25 ? 0.2 : 0));
}

/** A boss as seen this turn. `key` is a stable identity (monster id/name) so the
 *  stateful tracker can tell engage / same-fight / defeated apart. */
export interface BossSighting {
  readonly key: string;
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
}

/** Projected boss-encounter state for the HUD + effect layers, or null when no
 *  boss is currently engaged. */
export interface BossEncounterView {
  readonly key: string;
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly hpPct: number;
  readonly phase: BossPhase;
  /** 0–1 tension, drives the vignette/map-sway strength. */
  readonly intensity: number;
}

/**
 * Pick the engaged boss from the bosses visible this turn and project its view.
 * When more than one boss is on screen, the most-wounded (lowest HP fraction)
 * wins — that's the one the fight is centered on. Returns null when nothing is
 * engaged.
 */
export function bossEncounterView(visibleBosses: readonly BossSighting[]): BossEncounterView | null {
  let engaged: BossSighting | null = null;
  let engagedPct = Infinity;
  for (const b of visibleBosses) {
    const maxHp = b.maxHp > 0 ? b.maxHp : b.hp > 0 ? b.hp : 1;
    const pct = clamp01(b.hp / maxHp);
    if (pct < engagedPct) {
      engagedPct = pct;
      engaged = b;
    }
  }
  if (!engaged) return null;

  const maxHp = engaged.maxHp > 0 ? engaged.maxHp : engaged.hp > 0 ? engaged.hp : 1;
  const hpPct = clamp01(engaged.hp / maxHp);
  return {
    key: engaged.key,
    name: engaged.name,
    hp: Math.max(0, engaged.hp),
    maxHp,
    hpPct,
    phase: bossPhase(hpPct),
    intensity: bossIntensity(hpPct),
  };
}

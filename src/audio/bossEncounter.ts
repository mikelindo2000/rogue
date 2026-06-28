/**
 * Stateful boss-encounter detection for the audio + map-shake layer. Fed the
 * bosses present (and whether each is on-screen) once per turn, it emits the
 * encounter lifecycle cues — engage stinger, phase-change roar, defeat boom, and
 * a dread heartbeat throb — plus a screen-shake strength on phase changes.
 *
 * Pure and engine-agnostic (no browser audio, no DOM); the phase/intensity math
 * is shared with the presentation layer via src/boss.ts so the audio ramp and
 * the visual ramp stay in lockstep. Unit-tested without a browser.
 */
import type { SoundEvent } from './events';
import { bossPhase, bossIntensity, type BossSighting } from '../boss';

/** A boss as the engine sees it this turn: identity, HP, and on-screen flag. */
export interface BossTurnInput extends BossSighting {
  /** True when the boss is within the player's current field of view. */
  visible: boolean;
}

export interface BossEncounterUpdate {
  /** Cues to emit this turn (engine forwards to the sound sink). */
  sounds: SoundEvent[];
  /** Screen-shake strength (0 = none) for a phase-change jolt. */
  rumble: number;
}

const NONE: BossEncounterUpdate = { sounds: [], rumble: 0 };

/** Emit the heartbeat throb only once the fight has real teeth. */
const HEARTBEAT_MIN_INTENSITY = 0.55;
/** Screen-shake strength for a phase-transition jolt. */
const PHASE_RUMBLE = 0.85;

export class BossEncounterTracker {
  /** Identity of the boss currently engaged, or null when none is. */
  private engagedKey: string | null = null;
  private engagedPhase = 1;

  /** True when no boss is engaged — lets callers skip the per-turn update when
   *  there's no boss on the floor and nothing to wind down. */
  get idle(): boolean {
    return this.engagedKey === null;
  }

  /** Clear all state (call on new game / restart / floor change). */
  reset(): void {
    this.engagedKey = null;
    this.engagedPhase = 1;
  }

  /**
   * Feed the bosses present this turn (after all mutations). The engaged boss is
   * the most-wounded visible one. Returns the cues + rumble for this turn.
   */
  update(bosses: readonly BossTurnInput[]): BossEncounterUpdate {
    // Was the engaged boss still on the board this turn? If it vanished (only
    // possible by dying — bosses don't flee the final floor), it's defeated.
    if (this.engagedKey !== null && !bosses.some(b => b.key === this.engagedKey)) {
      this.reset();
      return { sounds: [{ type: 'boss.defeated' }], rumble: PHASE_RUMBLE };
    }

    const engaged = pickEngaged(bosses);

    // Nothing engaged and nothing visible to engage → silence.
    if (!engaged) {
      // Boss still present but out of sight: stay engaged, idle quietly.
      return NONE;
    }

    const hpPct = engaged.maxHp > 0 ? clamp01(engaged.hp / engaged.maxHp) : 0;
    const phase = bossPhase(hpPct);
    const intensity = bossIntensity(hpPct);
    const sounds: SoundEvent[] = [];
    let rumble = 0;

    if (this.engagedKey !== engaged.key) {
      // First sighting of this boss — the encounter begins.
      this.engagedKey = engaged.key;
      this.engagedPhase = phase;
      sounds.push({ type: 'boss.encounter' });
    } else if (phase > this.engagedPhase) {
      // Crossed an HP threshold downward — enrage. (Healing never walks it back:
      // the gate only advances, matching the one-way fight escalation.)
      this.engagedPhase = phase;
      sounds.push({ type: 'boss.phaseChange', phase });
      rumble = PHASE_RUMBLE;
    }

    // The throb: emitted on actions while the fight rages; the manifest cooldown
    // (maxVoices 1 + long cooldownMs) gates it down to a slow pulse.
    if (intensity >= HEARTBEAT_MIN_INTENSITY) {
      sounds.push({ type: 'boss.heartbeat' });
    }

    return { sounds, rumble };
  }
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** The most-wounded visible boss this turn (the one the fight centers on). */
function pickEngaged(bosses: readonly BossTurnInput[]): BossTurnInput | null {
  let best: BossTurnInput | null = null;
  let bestPct = Infinity;
  for (const b of bosses) {
    if (!b.visible) continue;
    const pct = b.maxHp > 0 ? b.hp / b.maxHp : 0;
    if (pct < bestPct) {
      bestPct = pct;
      best = b;
    }
  }
  return best;
}

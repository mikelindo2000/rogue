/**
 * Stateful crossing detection for player vitals, so threshold cues fire only on
 * downward crossings and do not chatter every turn. Hysteresis re-arms a gate
 * only after the value recovers past a higher boundary (healing, eating, Vigor).
 *
 * Pure and engine-agnostic — unit-tested without any browser audio.
 */
import type { SoundEvent } from './events';

export interface VitalsSnapshot {
  hp: number;
  maxHp: number;
  hunger: number;
}

export class VitalsSoundTracker {
  private static readonly HUNGER_REARM_BUFFER = 25;

  private lowArmed = true;
  private critArmed = true;
  private hungryArmed = true;
  private nearStarvedArmed = true;
  private fatiguedArmed = true;
  private dualWarningArmed = true;
  private starvingFired = false;

  /**
   * @param hungerHungry   BALANCE.player.hungerHungry (raw hunger threshold)
   * @param hungerFatigued BALANCE.player.hungerFatigued (raw, lower than hungry)
   * @param hungerNearStarved raw hunger threshold for the ambient pre-fatigued warning
   */
  constructor(
    private readonly hungerHungry: number,
    private readonly hungerFatigued: number,
    private readonly hungerNearStarved = hungerFatigued + 50,
  ) {}

  /** Re-arm every gate (call on new game / restart). */
  reset(): void {
    this.lowArmed = true;
    this.critArmed = true;
    this.hungryArmed = true;
    this.nearStarvedArmed = true;
    this.fatiguedArmed = true;
    this.dualWarningArmed = true;
    this.starvingFired = false;
  }

  /**
   * Feed the current vitals once per turn (after all mutations). Returns the
   * crossing events to emit, most-severe-first. The more severe cue in a pair
   * suppresses the milder one on a shared crossing.
   */
  update(v: VitalsSnapshot): SoundEvent[] {
    const out: SoundEvent[] = [];
    const pct = v.maxHp > 0 ? v.hp / v.maxHp : 0;
    const hpWarningActive = v.hp > 0 && pct <= 0.25;
    const hungerWarningActive = v.hunger <= 0 || (v.hunger > 0 && v.hunger < this.hungerNearStarved);

    // --- HP: critical (<=25%) outranks low (<=50%) on a shared crossing. ---
    // Critical firing also disarms the low gate so it doesn't chirp on the next
    // turn while HP sits in the critical band. By design (hysteresis), a partial
    // recovery into the 50–60% band does NOT re-arm low — the player was just
    // warned; only a recovery past 60% re-arms it. Same idea for critical at 35%.
    if (v.hp > 0) {
      if (this.critArmed && pct <= 0.25) {
        out.push({ type: 'player.criticalHealth' });
        this.critArmed = false;
        this.lowArmed = false;
      } else if (this.lowArmed && pct <= 0.5) {
        out.push({ type: 'player.lowHealth' });
        this.lowArmed = false;
      }
    }
    // Re-arm on recovery past the higher hysteresis boundary.
    if (pct > 0.35) this.critArmed = true;
    if (pct > 0.6) this.lowArmed = true;

    // --- Hunger: starving (0) > fatigued (<F) > hungry (<H). ---
    if (v.hunger <= 0) {
      if (!this.starvingFired) {
        out.push({ type: 'hunger.starving' });
        this.starvingFired = true;
      } else {
        out.push({ type: 'hunger.starveTick' });
      }
      this.nearStarvedArmed = false;
      this.fatiguedArmed = false;
      this.hungryArmed = false;
    } else {
      this.starvingFired = false;
      if (this.fatiguedArmed && v.hunger < this.hungerFatigued) {
        out.push({ type: 'hunger.fatigued' });
        this.fatiguedArmed = false;
        this.nearStarvedArmed = false;
        this.hungryArmed = false; // already past hungry
      } else if (this.nearStarvedArmed && v.hunger < this.hungerNearStarved) {
        out.push({ type: 'hunger.nearStarved' });
        this.nearStarvedArmed = false;
        this.hungryArmed = false; // already past hungry
      } else if (this.hungryArmed && v.hunger < this.hungerHungry) {
        out.push({ type: 'hunger.hungry' });
        this.hungryArmed = false;
      }
      // Re-arm once hunger recovers to/above each threshold (e.g. after eating).
      if (v.hunger >= this.hungerNearStarved + VitalsSoundTracker.HUNGER_REARM_BUFFER) this.nearStarvedArmed = true;
      if (v.hunger >= this.hungerFatigued) this.fatiguedArmed = true;
      if (v.hunger >= this.hungerHungry) this.hungryArmed = true;
    }

    if (this.dualWarningArmed && hpWarningActive && hungerWarningActive) {
      out.unshift({ type: 'survival.dualWarning' });
      this.dualWarningArmed = false;
    }
    if (pct > 0.35 || v.hunger >= this.hungerNearStarved + VitalsSoundTracker.HUNGER_REARM_BUFFER) {
      this.dualWarningArmed = true;
    }

    return out;
  }
}

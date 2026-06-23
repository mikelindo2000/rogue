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
  private lowArmed = true;
  private critArmed = true;
  private hungryArmed = true;
  private fatiguedArmed = true;
  private starvingFired = false;

  /**
   * @param hungerHungry   BALANCE.player.hungerHungry (raw hunger threshold)
   * @param hungerFatigued BALANCE.player.hungerFatigued (raw, lower than hungry)
   */
  constructor(
    private readonly hungerHungry: number,
    private readonly hungerFatigued: number,
  ) {}

  /** Re-arm every gate (call on new game / restart). */
  reset(): void {
    this.lowArmed = true;
    this.critArmed = true;
    this.hungryArmed = true;
    this.fatiguedArmed = true;
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

    // --- HP: critical (<=25%) outranks low (<=50%) on a shared crossing. ---
    if (v.hp > 0) {
      if (this.critArmed && pct <= 0.25) {
        out.push({ type: 'player.criticalHealth' });
        this.critArmed = false;
        this.lowArmed = false; // already past low; don't also chirp it
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
      this.fatiguedArmed = false;
      this.hungryArmed = false;
    } else {
      this.starvingFired = false;
      if (this.fatiguedArmed && v.hunger < this.hungerFatigued) {
        out.push({ type: 'hunger.fatigued' });
        this.fatiguedArmed = false;
        this.hungryArmed = false; // already past hungry
      } else if (this.hungryArmed && v.hunger < this.hungerHungry) {
        out.push({ type: 'hunger.hungry' });
        this.hungryArmed = false;
      }
      // Re-arm once hunger recovers to/above each threshold (e.g. after eating).
      if (v.hunger >= this.hungerFatigued) this.fatiguedArmed = true;
      if (v.hunger >= this.hungerHungry) this.hungryArmed = true;
    }

    return out;
  }
}

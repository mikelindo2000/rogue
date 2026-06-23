/**
 * Typed sound events emitted by gameplay. The engine emits these domain-level
 * events; the audio layer (service + manifest) resolves them to assets. Engine
 * code never names a filename or touches a browser audio API.
 *
 * See design/implemented/sound_effects_system_plan.md for the architecture and
 * design/implemented/sound_effect_asset_prompts.md for the asset catalogue.
 */

export type SoundEvent =
  // combat
  | { type: 'combat.swing'; actor: 'player' | 'monster' }
  | { type: 'combat.hit'; actor: 'player' | 'monster'; target: 'player' | 'monster'; damage?: number }
  | { type: 'combat.miss'; actor: 'player' | 'monster' }
  // monster death carries identity so the manifest can resolve a most-specific
  // clip via the cascade: monsterId -> archetype -> special -> generic.
  | { type: 'combat.death'; monsterId: string; archetype: string; special?: 'hero' | 'boss' }
  // player vitals & progression
  | { type: 'player.levelUp' }
  | { type: 'player.lowHealth' }
  | { type: 'player.criticalHealth' }
  | { type: 'player.death' }
  // hunger / survival
  | { type: 'hunger.hungry' }
  | { type: 'hunger.fatigued' }
  | { type: 'hunger.starving' }
  | { type: 'hunger.starveTick' }
  // equipment
  | { type: 'equipment.equipWeapon' }
  | { type: 'equipment.equipArmor' }
  | { type: 'equipment.unequipArmor' }
  | { type: 'equipment.rejected' }
  // items
  | { type: 'item.pickup'; kind: 'gold' | 'food' | 'potion' | 'scroll' | 'gear' }
  | { type: 'item.consume'; kind: 'food' | 'potion' | 'scroll' }
  // map / navigation
  | { type: 'map.stairs'; dir: 'up' | 'down' }
  | { type: 'map.secretReveal' };

export type SoundEventType = SoundEvent['type'];

/** The dependency the engine receives. Default is a no-op so tests and
 *  non-browser contexts pay nothing and import no audio APIs. */
export interface SoundSink {
  emit(event: SoundEvent): void;
}

/** Default sink: does nothing. `new GameEngine(ui)` uses this. */
export const noopSink: SoundSink = { emit() {} };

/** Test sink that records emitted events for assertions. */
export class RecordingSink implements SoundSink {
  readonly events: SoundEvent[] = [];
  emit(event: SoundEvent): void {
    this.events.push(event);
  }
  /** The `type` of each event in order — convenient for assertions. */
  types(): SoundEventType[] {
    return this.events.map(e => e.type);
  }
  /** Events of a given type. */
  ofType<T extends SoundEventType>(type: T): Extract<SoundEvent, { type: T }>[] {
    return this.events.filter(e => e.type === type) as Extract<SoundEvent, { type: T }>[];
  }
  clear(): void {
    this.events.length = 0;
  }
}

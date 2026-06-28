/**
 * Typed sound events emitted by gameplay. The engine emits these domain-level
 * events; the audio layer (service + manifest) resolves them to assets. Engine
 * code never names a filename or touches a browser audio API.
 *
 * See design/implemented/sound_effects_system_plan.md for the architecture and
 * design/implemented/sound_effect_asset_prompts.md for the asset catalogue.
 */

import type { ScrollType, WandType } from '../types';

export type SoundEvent = (
  // combat
  | { type: 'combat.swing'; actor: 'player' | 'monster' }
  | { type: 'combat.hit'; actor: 'player' | 'monster'; target: 'player' | 'monster'; damage?: number }
  // a heavy blow — pairs with the map screen-shake (rumble). Plays in addition
  // to the normal combat.hit cue. See `isHeavyHit` in src/combat.ts.
  | { type: 'combat.heavyHit'; damage: number }
  | { type: 'combat.miss'; actor: 'player' | 'monster' }
  // monster death carries identity so the manifest can resolve a most-specific
  // clip via the cascade: monsterId -> archetype -> special -> generic.
  | { type: 'combat.death'; monsterId: string; archetype: string; special?: 'hero' | 'boss' }
  // boss encounter lifecycle — stingers layered OVER the 'boss' music bed.
  // `encounter` fires once when a boss is first sighted; `phaseChange` on each
  // HP-threshold crossing (66% / 33%); `defeated` when the boss dies; `heartbeat`
  // is a low tense pulse emitted on actions while a boss fight rages (cooldown in
  // the manifest gates it to a slow throb). See src/audio/bossEncounter.ts.
  | { type: 'boss.encounter' }
  | { type: 'boss.phaseChange'; phase: number }
  | { type: 'boss.defeated' }
  | { type: 'boss.heartbeat' }
  // player vitals & progression
  | { type: 'player.levelUp' }
  | { type: 'player.lowHealth' }
  | { type: 'player.criticalHealth' }
  | { type: 'player.death' }
  // the Amulet of Ballard is seized from the final boss hoard — a triumphant
  // discovery stinger, distinct from game.victory (which fires on the escape).
  | { type: 'game.amuletFound' }
  | { type: 'game.victory' }
  // hunger / survival
  | { type: 'hunger.hungry' }
  | { type: 'hunger.nearStarved' }
  | { type: 'hunger.fatigued' }
  | { type: 'hunger.starving' }
  | { type: 'hunger.starveTick' }
  | { type: 'survival.dualWarning' }
  // equipment
  | { type: 'equipment.equipWeapon' }
  | { type: 'equipment.equipArmor' }
  | { type: 'equipment.unequipArmor' }
  | { type: 'equipment.rejected' }
  // items
  | { type: 'item.pickup'; kind: 'gold' | 'food' | 'potion' | 'scroll' | 'gear' | 'wand' }
  // `scrollType` lets the manifest resolve a per-effect read cue (falls back to
  // the generic scroll-consume clip when no per-type asset exists yet).
  | { type: 'item.consume'; kind: 'food' | 'potion' | 'scroll'; scrollType?: ScrollType }
  // a wand is zapped; wandType lets the manifest resolve a per-effect cue.
  | { type: 'item.zap'; wandType: WandType }
  // map / navigation
  | { type: 'map.stairs'; dir: 'up' | 'down' }
  | { type: 'map.secretReveal' }
  | { type: 'movement.run'; steps: number }
) & { delayMs?: number };

export type SoundEventType = SoundEvent['type'];

/**
 * One representative event per type, for coverage tooling that needs a runtime
 * list of every event (the union is erased at compile time). The mapped-type
 * `satisfies` makes this exhaustive AND key-correct: adding a new event type to
 * `SoundEvent` fails the build until a matching sample is added here, so the
 * sound audit's silent-event check can never silently miss a new event.
 *
 * Pick a payload that exercises the cue path where one exists (e.g.
 * `movement.run` with steps > 1), so a type only reads as "silent" when it
 * genuinely has no clip for any payload.
 */
export const SAMPLE_SOUND_EVENTS = {
  'combat.swing': { type: 'combat.swing', actor: 'player' },
  'combat.hit': { type: 'combat.hit', actor: 'monster', target: 'player' },
  'combat.heavyHit': { type: 'combat.heavyHit', damage: 20 },
  'combat.miss': { type: 'combat.miss', actor: 'player' },
  'combat.death': { type: 'combat.death', monsterId: 'orc', archetype: 'brute' },
  'boss.encounter': { type: 'boss.encounter' },
  'boss.phaseChange': { type: 'boss.phaseChange', phase: 2 },
  'boss.defeated': { type: 'boss.defeated' },
  'boss.heartbeat': { type: 'boss.heartbeat' },
  'player.levelUp': { type: 'player.levelUp' },
  'player.lowHealth': { type: 'player.lowHealth' },
  'player.criticalHealth': { type: 'player.criticalHealth' },
  'player.death': { type: 'player.death' },
  'game.amuletFound': { type: 'game.amuletFound' },
  'game.victory': { type: 'game.victory' },
  'hunger.hungry': { type: 'hunger.hungry' },
  'hunger.nearStarved': { type: 'hunger.nearStarved' },
  'hunger.fatigued': { type: 'hunger.fatigued' },
  'hunger.starving': { type: 'hunger.starving' },
  'hunger.starveTick': { type: 'hunger.starveTick' },
  'survival.dualWarning': { type: 'survival.dualWarning' },
  'equipment.equipWeapon': { type: 'equipment.equipWeapon' },
  'equipment.equipArmor': { type: 'equipment.equipArmor' },
  'equipment.unequipArmor': { type: 'equipment.unequipArmor' },
  'equipment.rejected': { type: 'equipment.rejected' },
  'item.pickup': { type: 'item.pickup', kind: 'gold' },
  'item.consume': { type: 'item.consume', kind: 'potion' },
  'item.zap': { type: 'item.zap', wandType: 'fire' },
  'map.stairs': { type: 'map.stairs', dir: 'down' },
  'map.secretReveal': { type: 'map.secretReveal' },
  'movement.run': { type: 'movement.run', steps: 2 },
} as const satisfies { [K in SoundEventType]: Extract<SoundEvent, { type: K }> };

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

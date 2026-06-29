/* Monster behavior schema — the data an agent (or a future balancer/tool) edits
 * to design how a monster acts. Everything here is JSON-serializable: no
 * functions, no class instances. The interpreter (brain.ts) reads a resolved
 * `MonsterBehavior` and emits an `AIAction`; the engine applies the action.
 *
 * Design goals: composable (archetypes + overrides), fully parameterized (every
 * lever is a named number/enum so the balancer can sweep them), and faithful to
 * the original — the `default` archetype reproduces the legacy chase-and-bite.
 */

import type { Monster, Player, StatusEffects } from '../types';
import type { RNG } from '../rng';

/** How a monster moves when it isn't attacking. */
export type MovementStyle =
  /** Stationary out of aggro; beelines toward the player within it (legacy). */
  | 'hunt'
  /** Wanders randomly even when it can see the player (bats). */
  | 'erratic'
  /** Holds still until the player enters wakeRange, then hunts (ambusher). */
  | 'ambush'
  /** Tries to keep `keepDistance` tiles between it and the player (kiter). */
  | 'kite'
  /** Always flees the player (used by the `fleeing` FSM state). */
  | 'flee'
  /** Dormant on its lair until the player nears (wakeRange), chases only within
   *  `leashRange` of home, and returns to guard its hoard otherwise (guardian). */
  | 'guard'
  /** Never moves. */
  | 'stationary';

export interface MovementSpec {
  style: MovementStyle;
  /** Distance at which a hunting monster starts chasing. */
  aggroRange: number;
  /** Distance at which an ambusher wakes (defaults to aggroRange). */
  wakeRange?: number;
  /** Chance per turn an erratic mover steps randomly instead of optimally. */
  erraticChance?: number;
  /** Target spacing for kiters (they back off when closer than this). */
  keepDistance?: number;
  /** Max distance a `guard` mover will stray from its lair to chase before
   *  turning back to its hoard. */
  leashRange?: number;
}

export interface AttackSpec {
  id: string;
  /** Manhattan range at which this attack can land (1 = melee). */
  range: number;
  /** Scales the monster's attack roll for this attack. */
  damageMultiplier: number;
  /** Telegraph turns before it lands (0 = instant). Reduces effective DPS and
   *  is the hook for a future dodge window. */
  windupTurns: number;
  /** Turns the attack must rest after firing. */
  cooldown: number;
  /** Selection weight when several attacks are eligible. */
  weight: number;
  /** Doubles damage on alternating uses (Marcus the Brave's signature swipe). */
  swipeAlternates?: boolean;
  /** Visual cue the renderer plays when this attack resolves. 'swoop' = a dive
   *  streak; default melee uses the existing hit Fx. */
  animCue?: 'melee' | 'swoop';
}

/** Generalized "special" effects — the Rogue specials, parameterized. Only a
 *  representative subset is wired into the engine today; the rest are schema
 *  the interpreter/engine can grow into without a redesign. */
export type AbilityId =
  | 'stealGold'
  | 'stealItem'
  | 'freeze'
  | 'drainStrength'
  | 'summon'
  | 'teleportPlayer'
  | 'leechHeal'
  | 'poison'
  | 'stun'
  | 'fear'
  | 'armorDebuff'
  | 'atkDebuff'
  | 'weaponDebuff'
  | 'missChance'
  | 'silenceMagic'
  | 'bonusDamage'
  /** Monster self-buff: raises the monster's own damage for a few turns (category
   *  K). Mutates runtime state only (atkBuffTurns/atkBuffMult), so it rides the
   *  generic applyOnHitAbilities/fireAbility path. */
  | 'selfBuff'
  /** Monster multi-hit / extra-attack: deals N additional melee hits on a proc
   *  (category K). Resolved in the ATTACK path (applyAttack) because it needs
   *  totalDef + computeMonsterDamage, NOT fireAbility. */
  | 'extraHits';

export interface AbilitySpec {
  id: AbilityId;
  /** GM-sheet ability NAME ("Poisonous Puke"), shown in the bestiary. Optional —
   *  the bestiary generates a name from the effect when absent. */
  label?: string;
  /** Probability the ability fires when its trigger occurs. */
  chance: number;
  /** Magnitude (gold stolen, turns frozen, dmg/turn, …) — meaning depends on the ability. */
  magnitude?: number;
  /** Turns the inflicted player effect lasts (DoT and other persistent kinds). */
  duration?: number;
  /** DoT flavor for effect-inflicting abilities (poison/fire/acid/bacterial). */
  damageType?: 'poison' | 'fire' | 'acid' | 'bacterial';
  /** Flat extra damage dealt to the player when the ability procs, applied on
   *  top of any status effect. A pure-damage ability uses id 'bonusDamage' and
   *  carries the amount here; a mixed ability (e.g. stun + extra hit) sets it
   *  alongside its effect id. */
  bonusDamage?: number;
  /** selfBuff (category K): the bonus damage FRACTION the monster gains while the
   *  buff is active (0.5 → +50%, applied as a ×1.5 multiplier). Reuses `duration`
   *  for the number of turns the buff lasts. */
  buffMagnitude?: number;
  /** extraHits (category K): minimum number of EXTRA melee hits dealt on a proc. */
  minHits?: number;
  /** extraHits (category K): maximum number of EXTRA melee hits dealt on a proc.
   *  The count is rolled uniformly in [minHits..maxHits]. */
  maxHits?: number;
  /** extraHits (category K): flat damage added to each extra hit (e.g. +5 per
   *  bite for Furious Fangs). */
  perHitBonus?: number;
  /** summon: the depth/minFloor pool to pull an assisting monster from. */
  summonFloor?: number;
  /** teleportPlayer: where the player is moved by the instant world mutation. */
  teleportTarget?: 'safeTile' | 'previousFloor' | 'stairsDown';
  /** teleportPlayer/steal hybrids: fraction of carried gold dropped on proc. */
  goldDropPct?: number;
  /** Turns before it can fire again. */
  cooldown: number;
  trigger: 'onHit' | 'onEngage';
  /** Whether firing the ability makes the monster flee afterward (nymph). */
  thenFlee?: boolean;
  /** Whether a successful firing makes the monster blink to a random floor tile
   *  afterward — the canonical Rogue leprechaun vanish. Gated on the ability
   *  actually doing something (e.g. it stole gold), unlike `thenFlee`. */
  thenBlink?: boolean;
}

export interface DefenseSpec {
  /** Chance to dodge a player strike entirely. */
  dodgeChance?: number;
  /** HP fraction (0..1) below which the monster switches to fleeing. */
  fleeBelowHpPct?: number;
}

export interface MonsterBehavior {
  id: string;
  movement: MovementSpec;
  attacks: AttackSpec[];
  defense: DefenseSpec;
  abilities: AbilitySpec[];
}

/** Per-monster runtime AI state, attached lazily to a `Monster`. */
export type AIState = 'asleep' | 'hunting' | 'fleeing';

export interface MonsterAIRuntime {
  state: AIState;
  /** attackId → turn index when it may fire again. */
  cooldowns: Record<string, number>;
  /** Toggle for swipeAlternates attacks. */
  swipeToggle: boolean;
  /** A telegraphed attack mid-windup. While set, the monster is committed: it
   *  shows a telegraph on the target tile and resolves on `resolveTurn`, dealing
   *  damage only if the player is still on (targetX,targetY) — else it whiffs
   *  (positional dodge). */
  pendingAttack?: PendingAttack;
  /** Set by an on-hit ability (leprechaun steal) to request a blink-away this
   *  turn. processMonsterAI consumes it after the attack and calls `onBlink`. */
  pendingBlink?: boolean;
  /** A `guard` mover's lair, captured the first time it acts. It leashes its
   *  pursuit to this tile and returns here to keep watch over its hoard. */
  homeX?: number;
  homeY?: number;
  /** Monster self-buff (category K, e.g. Kalius's Second Head): turns remaining on
   *  an active damage buff. Decremented once per monster turn in processMonsterAI
   *  (mirroring frozenTurns). While > 0, applyAttack folds `atkBuffMult` into the
   *  scaled attack. */
  atkBuffTurns?: number;
  /** The damage multiplier applied while `atkBuffTurns > 0` (e.g. 1.5 for +50%). */
  atkBuffMult?: number;
}

export interface PendingAttack {
  attackId: string;
  resolveTurn: number;
  targetX: number;
  targetY: number;
}

/** The decision the interpreter returns. Pure data — the engine resolves it.
 *  Abilities (steal, leech, …) fire as on-hit side effects of an attack rather
 *  than as standalone actions, so they aren't part of this union. */
export type AIAction =
  | { type: 'wait' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'attack'; attackId: string }
  /** Begin a telegraphed attack: commit to a target tile now, resolve later. */
  | { type: 'windup'; attackId: string; targetX: number; targetY: number };

/** Everything the interpreter needs to decide one monster's action. Read-only
 *  except `rng`, which it may draw from (deterministically). */
export interface BrainContext {
  monster: Monster;
  behavior: MonsterBehavior;
  player: Player;
  status: StatusEffects;
  map: string[][];
  cols: number;
  rows: number;
  monsters: Monster[];
  rng: RNG;
  /** Current engine turn (for cooldown bookkeeping). */
  turn: number;
  /** Per-tile darkness grid (optional). A monster on a dark tile acquires the
   *  player only within BALANCE.monster.darkAggroRange. Absent (headless sim,
   *  tests) ⇒ all-lit ⇒ legacy behavior. */
  dark?: boolean[][];
}

/* Archetype registry — reusable behavior presets a monster references by name.
 *
 * Authoring a monster's AI is "pick an archetype (+ optional overrides)", never
 * "write engine code". The `default` archetype reproduces the legacy
 * chase-and-bite exactly, so any monster left unassigned plays as it always has.
 *
 * Live assignments are intentionally conservative right now: only movement-only
 * archetypes are wired to real monsters (zero combat/balance change). The
 * combat-affecting archetypes (brute/kiter/trickster) are defined and unit-
 * tested, ready to enable once their balance impact is reviewed via the harness.
 */

import { BALANCE } from '../config';
import { monsterId } from '../discovery';
import type { MonsterTemplate } from '../types';
import type { AbilitySpec, AttackSpec, MonsterBehavior } from './types';
import type { AttackShape } from './balance';

const AGGRO = BALANCE.monster.aggroRange;

const melee = (over: Partial<AttackSpec> = {}): AttackSpec => ({
  id: 'melee',
  range: 1,
  damageMultiplier: 1,
  windupTurns: 0,
  cooldown: 0,
  weight: 1,
  ...over,
});

export type ArchetypeId =
  | 'default'
  | 'skirmisher'
  | 'ambusher'
  | 'brute'
  | 'kiter'
  | 'trickster'
  | 'guardian'
  | 'boss-swiper'
  | 'bat'
  | 'raptor'
  | 'leech'
  | 'nymph';

export const ARCHETYPES: Record<ArchetypeId, Omit<MonsterBehavior, 'id'>> = {
  // Stationary until the player is within aggro, then beeline + bite. Legacy.
  default: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Erratic flight — wobbles toward the player rather than tracking perfectly.
  // Movement-only: once adjacent it bites every turn like anything else, so it
  // does not shift combat balance.
  skirmisher: {
    movement: { style: 'erratic', aggroRange: AGGRO + 1, erraticChance: 0.5 },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Holds perfectly still until you stumble close, then commits.
  ambusher: {
    movement: { style: 'ambush', aggroRange: AGGRO, wakeRange: 3 },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Slow, telegraphed heavy hitter — more damage per swing, fewer swings.
  brute: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee({ id: 'slam', damageMultiplier: 1.6, windupTurns: 1 })],
    defense: {},
    abilities: [],
  },
  // Keeps its distance and pelts telegraphed bolts from range — the ranged
  // poker. Spacing takes priority over a free shot (kite movement), and each
  // bolt commits to your tile for a turn (windupTurns:1) so you strafe off the
  // line to dodge. Tuned as frequent chip rather than a heavy nuke: cooldown 0
  // so it pokes whenever it's at range (still gated by the windup downtime), and
  // a modest 1.2 multiplier so a single bolt stays light. The previous params
  // (damageMultiplier 0.8, cooldown 1) stacked telegraph downtime × low
  // multiplier × cooldown and read *trivial* in the harness — the bolt connected
  // a tiny fraction of each turn (see the §3 telegraph-gating note in the
  // monster-authoring guide). Only the Flying Serpent uses this archetype today,
  // so this retune is effectively local to it; its base atk was raised to land
  // the FAIR band (see MONSTER_DATABASE / MONSTER_ARCHETYPE notes).
  kiter: {
    movement: { style: 'kite', aggroRange: AGGRO + 2, keepDistance: 4 },
    attacks: [melee({ id: 'bolt', range: 4, damageMultiplier: 1.2, windupTurns: 1, cooldown: 0 })],
    defense: {},
    abilities: [],
  },
  // The Leprechaun: hunts you, and on a hit steals a depth-scaled pile of gold
  // (GOLDCALC, see fireAbility) then VANISHES — blinks to a random floor tile,
  // the canonical Rogue behavior. The stolen gold isn't destroyed: it rides in
  // the leprechaun's purse (`m.gold`) and spills back onto the floor when you
  // kill it, so hunting one down to reclaim your gold is the whole game. It also
  // walk-flees once wounded below half HP. (`magnitude` is unused for the steal
  // amount now — GOLDCALC scales by floor — but kept as a harmless floor.)
  trickster: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: { fleeBelowHpPct: 0.5 },
    abilities: [{ id: 'stealGold', chance: 0.7, magnitude: 50, cooldown: 0, trigger: 'onHit', thenBlink: true }],
  },
  // The hoard guardian — a dragon on its gold, a golem watching a vault. Dormant
  // on its lair until you come within wakeRange, then it engages, but it leashes
  // to the hoard: it chases only within `leashRange` of home and trudges back to
  // guard the gold when you flee, never abandoning the lair. Plain melee, so it's
  // balance-neutral vs `default` (movement-only). The reward is the hoard itself:
  // a large floor-scaled pile (plus any gold it carries) drops on death — see
  // dropMonsterGold. Pairs the leprechaun's gold-drop system with a stationary
  // treasure-defender fantasy.
  guardian: {
    movement: { style: 'guard', aggroRange: AGGRO, wakeRange: 3, leashRange: 5 },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // The modern Brown Bat: erratic flier that telegraphs a heavy dive you can
  // step out of, and flits aside from your own blows. Its danger is the swoop
  // landing when you DON'T dodge — so the dive hits hard but is fully avoidable.
  // (damageMultiplier tuned via the harness to keep it floor-1 fair.)
  //
  // The Brown Bat's Poisonous Puke is a per-monster on-hit ability, kept in
  // MONSTER_ABILITIES below (not here) so the assignment lives in one place
  // alongside monsters that share an archetype. The archetype itself is just the
  // erratic-flier movement + telegraphed swoop.
  bat: {
    movement: { style: 'erratic', aggroRange: AGGRO + 1, erraticChance: 0.5 },
    attacks: [melee({ id: 'swoop', range: 2, damageMultiplier: 3.5, windupTurns: 1, cooldown: 1, animCue: 'swoop' })],
    defense: { dodgeChance: 0.25 },
    abilities: [],
  },
  // The Eagle: a faster, less-punishing cousin of the bat. Erratic flight with a
  // telegraphed dive you can step out of and light evasion — it teaches dodging
  // again mid-early game without the bat's bite. Deliberately gentler than the
  // bat on both knobs: dive damageMultiplier 3.0 (< bat's 3.5) and dodgeChance
  // 0.15 (< bat's 0.25). It also flies a touch wider (aggroRange +2, more random
  // hops via erraticChance 0.4) so it reads as a swift, erratic flier. Harness-
  // tuned to the FAIR band at floor 4 (threat ~0.375); the Eagle's base atk was
  // nudged 12 → 17 in MONSTER_DATABASE so the gentle multiplier still lands fair
  // at floor 4 (a low-atk floor-4 monster otherwise reads "easy" — see note).
  raptor: {
    movement: { style: 'erratic', aggroRange: AGGRO + 2, erraticChance: 0.4 },
    attacks: [melee({ id: 'dive', range: 2, damageMultiplier: 3.0, windupTurns: 1, cooldown: 1, animCue: 'swoop' })],
    defense: { dodgeChance: 0.15 },
    abilities: [],
  },
  // The Zombie: a plain chase-and-bite hunter whose bite drains your vitality —
  // every landed hit heals it a little (leechHeal on-hit), turning a fight into a
  // war of attrition. Its DIRECT melee is identical to `default` (hunt movement,
  // melee, damageMultiplier 1, no windup), so its base atk stays balance-neutral
  // and reads FAIR for direct damage with no atk change. The only added pressure
  // is the heal, which the balance harness does NOT model (the combat sim has no
  // healing term), so its magnitude is a *playtest* knob, not a harness one.
  //
  // magnitude: 3 HP per landed bite. Deliberately conservative — that's ~1% of the
  // Zombie's 275 HP and a small fraction of its ~49-atk hit, so a competent player
  // still out-damages the heal and the leech reads as attrition *flavor* rather
  // than an unwinnable heal wall. (Heal is capped at maxHp in fireAbility.)
  leech: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: {},
    abilities: [{ id: 'leechHeal', chance: 1, magnitude: 3, cooldown: 0, trigger: 'onHit' }],
  },
  // The Nymph: a trickster that steals an ITEM and vanishes — the canonical Rogue
  // nymph. Mirrors `trickster` (hunt movement + plain melee + fleeBelowHpPct) but
  // swaps the on-hit ability from stealGold to `stealItem` (steals a potion, or
  // falls back to gold if you carry none — see fireAbility), then blinks away.
  // Like stealGold, the steal doesn't change the HP-damage race, so the DIRECT
  // melee stays balance-neutral and reads FAIR at floor 9 with NO base-atk
  // change (harness-confirmed). The `magnitude` only matters for the gold
  // fallback amount.
  nymph: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: { fleeBelowHpPct: 0.5 },
    abilities: [{ id: 'stealItem', chance: 0.7, magnitude: 50, cooldown: 0, trigger: 'onHit', thenFlee: true, thenBlink: true }],
  },
  // Marcus the Brave: chase-and-bite, but every other swing is a double-damage
  // swipe. Reproduces the old name-special as data.
  'boss-swiper': {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee({ id: 'swipe', swipeAlternates: true })],
    defense: {},
    abilities: [],
  },
};

/**
 * Live archetype assignments by monster id. Empty = everything plays as legacy.
 * Only movement-only archetypes here so this change is balance-neutral; add
 * combat-affecting ones after checking the balance report.
 */
export const MONSTER_ARCHETYPE: Record<string, ArchetypeId> = {
  'brown-bat': 'bat', // modern erratic flier with a telegraphed swoop + evasion
  'eagle': 'raptor', // erratic flier with a telegraphed dive + light evasion (gentler bat cousin)
  // Cyclops & elite: slow, heavily telegraphed slam — dodge it or eat a big hit.
  // The brute slam is windupTurns:1 (telegraphed) so it only connects ~0.3×/turn
  // in the harness; the base atk had to be raised well above the plain-melee
  // value to reach the FAIR band at floor 17. Tuned via the harness: Cyclops atk
  // 43 → 75 (threat ~0.48, mid-fair); Colossal Cyclops atk 45 → 85 (threat ~0.61,
  // upper-fair, fitting for an elite). The displayed atk isn't comparable to a
  // plain-melee monster's — a telegraphed slammer needs more base atk to land the
  // same threat. See MONSTER_DATABASE for the bumped rows.
  'cyclops': 'brute',
  'colossal-cyclops': 'brute',
  // Golem & elite: a stone sentinel guarding a hoard. Dormant on its lair until
  // you stumble within wakeRange, then it engages — but it leashes to its gold,
  // chasing only within leashRange and returning to guard the pile when you flee
  // (guard FSM). Movement-only plain melee, so balance-neutral vs default (still
  // fair at floor 15). On death it spills a large floor-scaled hoard.
  'golem': 'guardian',
  'gary-the-golem': 'guardian',
  // The Dragon: the canonical Rogue gold-greedy monster (the ISGREED flag), here
  // realized as a hoard guardian sleeping on a massive pile it drops when slain.
  'dragon': 'guardian',
  // Flying Serpent: a ranged poker (kiter) — holds its distance and spits
  // telegraphed bolts; you close the gap or strafe off its line to dodge. The
  // bolt is BOTH telegraphed (windupTurns:1) AND low-multiplier chip, so it
  // connects only a fraction of each turn and reads very *easy* at the base atk
  // (see §3 telegraph-gating gotcha). Landed in the FAIR band by (a) retuning the
  // shared kiter bolt to poke every turn (cooldown 0) at a modest 1.2 multiplier,
  // and (b) bumping the Flying Serpent's base atk 42 → 85 in MONSTER_DATABASE.
  // Harness: threat ~0.42 at floor 16 (mid-fair). Only the Flying Serpent uses
  // the kiter archetype today, so the bolt retune is effectively local to it.
  'flying-serpent': 'kiter',
  // Zombie & elite Zachary: plain hunt-and-bite, but each bite leeches HP
  // (leechHeal on-hit) — a war of attrition. DIRECT melee is identical to default
  // (melee, multiplier 1, no windup), so this is balance-neutral for direct damage
  // and stays FAIR at floor 19 with NO base-atk change (harness: Zombie threat
  // ~0.54, Zachary ~0.62, both mid/upper-fair). The extra attrition from the heal
  // is NOT modeled by the harness (no healing term in the sim), so the leechHeal
  // magnitude (3 HP/hit) is tuned by playtest, not by the harness — see the leech
  // archetype comment.
  'zombie': 'leech',
  'zachary-the-zombie': 'leech',
  'leprechaun': 'trickster', // steals depth-scaled gold then blinks away; drops its purse on death (canonical Rogue)
  // Nymph: steals an ITEM (a potion, or gold if you carry none) on a hit, then
  // vanishes (stealItem on-hit + thenBlink). DIRECT melee mirrors the trickster
  // (plain melee, multiplier 1, no windup), so the steal doesn't move the HP-damage
  // race — balance-neutral, FAIR at floor 9 with NO base-atk change (harness-confirmed).
  'nymph': 'nymph',
  // Preserve Marcus the Brave's signature swipe (was a name-special in the engine).
  'marcus-the-brave': 'boss-swiper',
};

/**
 * Per-monster on-hit abilities, keyed by monster id, merged on top of the
 * monster's archetype abilities in `resolveBehavior`. This is the canonical home
 * for a monster's GM-sheet "Ability 1/2" — keep abilities here, not on the
 * archetype, because most monsters SHARE an archetype (default/brute/guardian/
 * leech): putting an ability on the archetype would leak it to every sibling, and
 * per-monster magnitudes (Snake +2 vs King Cobra +5) can't live on a shared
 * preset. Keying by monster id keeps each assignment isolated and the values
 * verbatim from the sheet. Merged additively, so a monster keeps any archetype
 * ability too (e.g. Zachary keeps the leech heal AND gains Graveyard Grab).
 *
 * All values are the sheet's verbatim — chance = the "3% / 1% on hit" column,
 * magnitude/duration from the ability text. Balance-harness-neutral (the sim
 * models only the primary attack's DPS, so on-hit effects sit outside it).
 */
export const MONSTER_ABILITIES: Record<string, AbilitySpec[]> = {
  // Brown Bat — Poisonous Puke: +1 poison/turn for 3 turns, 3% on hit.
  'brown-bat': [{ id: 'poison', label: 'Poisonous Puke', chance: 0.03, magnitude: 1, duration: 3, damageType: 'poison', cooldown: 0, trigger: 'onHit' }],
  // Snake — Venomous Fangs: +2 poison/turn for 3 turns, 3% on hit.
  'snake': [{ id: 'poison', label: 'Venomous Fangs', chance: 0.03, magnitude: 2, duration: 3, damageType: 'poison', cooldown: 0, trigger: 'onHit' }],
  // King Cobra — Venom Spit: +5 poison/turn for 3 turns, 3% on hit.
  'king-cobra': [{ id: 'poison', label: 'Venom Spit', chance: 0.03, magnitude: 5, duration: 3, damageType: 'poison', cooldown: 0, trigger: 'onHit' }],
  // Kalius King Cobra — category K (monster self-buff / multi-hit):
  //  • Second Head (A1, 1%): grows a second head, +50% monster damage for 2 turns
  //    (a runtime self-buff via the fireAbility path).
  //  • Furious Fangs (A2, 1%): 2-5 bites, each base damage + 5 (resolved in the
  //    ATTACK path because it needs totalDef + computeMonsterDamage).
  'kalius-king-cobra': [
    { id: 'selfBuff', label: 'Second Head', chance: 0.01, buffMagnitude: 0.5, duration: 2, cooldown: 0, trigger: 'onHit' },
    { id: 'extraHits', label: 'Furious Fangs', chance: 0.01, minHits: 2, maxHits: 5, perHitBonus: 5, cooldown: 0, trigger: 'onHit' },
  ],
  // Cyclops — Munch (A2, 1%): "25 damage plus 5 bacterial damage for 3 turns".
  // Only the DoT portion is modeled here; the +25 instant is a bonusDamage effect
  // (its own category/task), not a status effect. Keyed to base Cyclops so the
  // Colossal Cyclops (same 'brute' archetype, different sheet abilities) is unaffected.
  // Cyclops also carries Intimidating Stare (A1, 3%): "causes player to cower in
  // fear for one turn" — a 1-turn stun (the player loses their next action).
  // Both rows are keyed to base Cyclops so the Colossal Cyclops (same 'brute'
  // archetype, different sheet abilities) is unaffected.
  'cyclops': [
    { id: 'poison', label: 'Munch', chance: 0.01, magnitude: 5, duration: 3, damageType: 'bacterial', bonusDamage: 25, cooldown: 0, trigger: 'onHit' },
    { id: 'stun', label: 'Intimidating Stare', chance: 0.03, magnitude: 1, duration: 1, cooldown: 0, trigger: 'onHit' },
  ],
  // Colossal Cyclops — Laser Focus (A1, 3%): one extra full attack (category K
  // extra-attack). Same extraHits mechanism with minHits=maxHits=1 and no per-hit
  // bonus. Chase (A2, 1%) drives the player to the next staircase and drops 15%
  // gold. Keyed per-id so the base Cyclops (shared 'brute' archetype) is unaffected.
  'colossal-cyclops': [
    { id: 'extraHits', label: 'Laser Focus', chance: 0.03, minHits: 1, maxHits: 1, perHitBonus: 0, cooldown: 0, trigger: 'onHit' },
    { id: 'teleportPlayer', label: 'Chase', chance: 0.01, teleportTarget: 'stairsDown', goldDropPct: 0.15, cooldown: 0, trigger: 'onHit' },
  ],
  // Xelhua — Stomp (A1, 3%): "player loses footing and falls to the ground for
  // one turn" — a 1-turn stun. Pure data on top of the 'default' archetype; the
  // stun read site (engine takeStunTurn) makes it cost the player an action.
  // Xelhua also carries Giantfolk Growl (1%): a fear that sends the player
  // fleeing in random directions for 3 turns. Appended to its Stomp stun row.
  'xelhua': [
    { id: 'stun', label: 'Stomp', chance: 0.03, magnitude: 1, duration: 1, cooldown: 0, trigger: 'onHit' },
    { id: 'fear', label: 'Giantfolk Growl', chance: 0.01, duration: 3, cooldown: 0, trigger: 'onHit' },
  ],
  // Agitated Apperation — Ingest Spirit Dust (1%): a 2-turn fear. The sheet's
  // ability also turns the apperation invisible — that self-buff portion is out of
  // scope (a separate monster-self-buff category), so only the fear is modeled here.
  // Agitated Apperation also has hysteria (A1, 3%): +25 surrounding-objects damage.
  'agitated-apperation': [
    { id: 'bonusDamage', label: 'Hysteria', chance: 0.03, bonusDamage: 25, cooldown: 0, trigger: 'onHit' },
    { id: 'fear', label: 'Ingest Spirit Dust', chance: 0.01, duration: 2, cooldown: 0, trigger: 'onHit' },
  ],
  // Yeti — Ice Spear (A1, 3%): +6 damage; and Freeze Frame (A2, 1%): a 1-turn
  // stun that also deals +5 (bonusDamage rider on the stun).
  'yeti': [
    { id: 'bonusDamage', label: 'Ice Spear', chance: 0.03, bonusDamage: 6, cooldown: 0, trigger: 'onHit' },
    { id: 'stun', label: 'Freeze Frame', chance: 0.01, magnitude: 1, duration: 1, bonusDamage: 5, cooldown: 0, trigger: 'onHit' },
  ],
  // Michael the Minotaur — Buck (A1, 3%): +10 damage; and Head Butt (A2, 1%): a
  // 1-turn stun that also deals +10 (bonusDamage rider on the stun).
  'michael-the-minotaur': [
    { id: 'bonusDamage', label: 'Buck', chance: 0.03, bonusDamage: 10, cooldown: 0, trigger: 'onHit' },
    { id: 'stun', label: 'Head Butt', chance: 0.01, magnitude: 1, duration: 1, bonusDamage: 10, cooldown: 0, trigger: 'onHit' },
  ],
  // Gary the Golem — Iron Curse (A1, 3%): "slows attacks resulting in two lost
  // turns" — a 2-turn stun. Keyed to Gary so the other 'guardian' monsters are unaffected.
  'gary-the-golem': [{ id: 'stun', label: 'Iron Curse', chance: 0.03, magnitude: 1, duration: 2, cooldown: 0, trigger: 'onHit' }],
  // Dragon — Molten Breath (A1, 3%): "+10 fire damage per turn until the fight is
  // over". We have no "until combat ends" duration yet, so this is approximated as
  // a sustained 5-turn fire DoT (flagged for a follow-up duration mode). Magnitude
  // verbatim. Keyed to Dragon so the other 'guardian' monsters (Golem/Gary) are unaffected.
  // Dragon keeps its Molten Breath fire DoT (above) AND gains Smoke Show (1%): a
  // 50% miss chance for 3 turns (magnitude is the miss probability).
  'dragon': [
    { id: 'poison', label: 'Molten Breath', chance: 0.03, magnitude: 10, duration: 5, damageType: 'fire', cooldown: 0, trigger: 'onHit' },
    { id: 'missChance', label: 'Smoke Show', chance: 0.01, magnitude: 0.5, duration: 3, cooldown: 0, trigger: 'onHit' },
  ],
  // Zachary the Zombie — Graveyard Grab (A2, 1%): "infection that causes 25 damage
  // for two turns". Modeled as a 25/turn bacterial DoT for 2 turns. Merges with the
  // leech archetype's heal — Zachary keeps both.
  // Zachary keeps its Graveyard Grab DoT (above) AND its leech-archetype heal;
  // Maggot Infestation (3%) appends an attack debuff (-10 base atk for 3 turns).
  'zachary-the-zombie': [
    { id: 'poison', label: 'Graveyard Grab', chance: 0.01, magnitude: 25, duration: 2, damageType: 'bacterial', cooldown: 0, trigger: 'onHit' },
    { id: 'atkDebuff', label: 'Maggot Infestation', chance: 0.03, magnitude: 10, duration: 3, cooldown: 0, trigger: 'onHit' },
  ],
  // Golem — Oxidize (3%): sheet "-3 weapon damage". Modeled as a flat attack
  // reduction of 3 for 3 turns (subtracted from base atk at the computeStrike
  // caller). Keyed to base Golem so the other 'guardian' monsters are unaffected.
  'golem': [{ id: 'atkDebuff', label: 'Oxidize', chance: 0.03, magnitude: 3, duration: 3, cooldown: 0, trigger: 'onHit' }],
  // Troll — Disarm (1%): the player fights disarmed (halved weapon damage) for 2
  // turns, reusing computeStrike's existing disarm halving at the strike read site.
  'troll': [{ id: 'weaponDebuff', label: 'Disarm', chance: 0.01, duration: 2, cooldown: 0, trigger: 'onHit' }],
  // Trogdor the Troll — Bone Break (1%): same disarmed-fighting effect for 2 turns.
  // Trogdor also has Skull Crush (A1, 3%): +8 damage.
  'trogdor-the-troll': [
    { id: 'bonusDamage', label: 'Skull Crush', chance: 0.03, bonusDamage: 8, cooldown: 0, trigger: 'onHit' },
    { id: 'weaponDebuff', label: 'Bone Break', chance: 0.01, duration: 2, cooldown: 0, trigger: 'onHit' },
  ],
  // Quinotaur — Horn Twist (A1, 3%): +10 damage; and Spit (A2, 1%): a 25% miss
  // chance for 3 turns (magnitude is the miss probability, rolled at the
  // player-attack read site).
  'quinotaur': [
    { id: 'bonusDamage', label: 'Horn Twist', chance: 0.03, bonusDamage: 10, cooldown: 0, trigger: 'onHit' },
    { id: 'missChance', label: 'Spit', chance: 0.01, magnitude: 0.25, duration: 3, cooldown: 0, trigger: 'onHit' },
  ],
  // Dragon King — Acidic Molten Breath (A1, 3%): "fire damage plus 20 acid damage
  // for 3 turns". The acid DoT portion is modeled here; the base fire damage is the
  // attack itself (bonusDamage), and the A2 Black Death combo is a separate effect.
  'dragon-king': [{ id: 'poison', label: 'Acidic Molten Breath', chance: 0.03, magnitude: 20, duration: 3, damageType: 'acid', cooldown: 0, trigger: 'onHit' }],
  // Pygmy — Shrink (3%): sheet "helm -3 for 3 turns". We have no per-slot armor
  // debuff, so this is approximated as a flat TOTAL-defense reduction of 3 for 3
  // turns (honored at getTotalDef, clamped to >= 0).
  'pygmy': [{ id: 'armorDebuff', label: 'Shrink', chance: 0.03, magnitude: 3, duration: 3, cooldown: 0, trigger: 'onHit' }],
  // Pantier Pygmy King — Miniaturize (3%): sheet "-100% armor for 2 turns".
  // Approximated as a large flat reduction (99) that effectively zeroes the
  // player's defense for the duration (getTotalDef clamps the result to >= 0).
  // Pantier Pygmy King also has Gulliver's Attack (A2, 1%): +12 damage from a
  // volley of tiny spears.
  'pantier-pygmy-king': [
    { id: 'armorDebuff', label: 'Miniaturize', chance: 0.03, magnitude: 99, duration: 2, cooldown: 0, trigger: 'onHit' },
    { id: 'bonusDamage', label: "Gulliver's Attack", chance: 0.01, bonusDamage: 12, cooldown: 0, trigger: 'onHit' },
  ],
  // Zombie — Putrid Bite (3%): seals the player's magic (cannot zap wands) for 3
  // turns. Merges with the leech archetype's heal — the Zombie keeps both. (The
  // sheet's "staff-equipped fights disarmed" portion is out of scope — a separate
  // equip-conditional combat modifier, not a status effect.)
  // Zombie also has Bury Alive (A2, 1%): +75 damage from being crammed into the
  // ground. (Big hit, but rare; sheet-verbatim — flag for playtest.)
  'zombie': [
    { id: 'silenceMagic', label: 'Putrid Bite', chance: 0.03, duration: 3, cooldown: 0, trigger: 'onHit' },
    { id: 'bonusDamage', label: 'Bury Alive', chance: 0.01, bonusDamage: 75, cooldown: 0, trigger: 'onHit' },
  ],
  // Rabid Ostrich — Reverse Kick (A1, 3%): kicks the player to the previous
  // dungeon level/map. The engine callback handles the floor transition.
  'rabid-ostrich': [{ id: 'teleportPlayer', label: 'Reverse Kick', chance: 0.03, teleportTarget: 'previousFloor', cooldown: 0, trigger: 'onHit' }],
  // Unicorn — Rainbow Lash (A1, 3%): calls a level-6 monster to assist.
  'unicorn': [{ id: 'summon', label: 'Rainbow Lash', chance: 0.03, summonFloor: 6, cooldown: 0, trigger: 'onHit' }],

  // --- Pure bonusDamage abilities (flat extra hit on proc; the sheet's many
  // "+N damage" specials). Big magnitudes (50/75) are sheet-verbatim and rare —
  // flag for playtest. ---
  // Orc — Hammer Smash (A1, 3%): +2.
  'orc': [{ id: 'bonusDamage', label: 'Hammer Smash', chance: 0.03, bonusDamage: 2, cooldown: 0, trigger: 'onHit' }],
  // Hobgoblin — Black Powder Bomb (A1, 3%): +2.
  'hobgoblin': [{ id: 'bonusDamage', label: 'Black Powder Bomb', chance: 0.03, bonusDamage: 2, cooldown: 0, trigger: 'onHit' }],
  // Indus Worm — Strangulate (A1, 3%): +3.
  'indus-worm': [{ id: 'bonusDamage', label: 'Strangulate', chance: 0.03, bonusDamage: 3, cooldown: 0, trigger: 'onHit' }],
  // Jungle Flesheater — Pinch (A1, 3%): +3.
  'jungle-flesheater': [{ id: 'bonusDamage', label: 'Pinch', chance: 0.03, bonusDamage: 3, cooldown: 0, trigger: 'onHit' }],
  // Minotaur — Buck (A1, 3%): +5.
  'minotaur': [{ id: 'bonusDamage', label: 'Buck', chance: 0.03, bonusDamage: 5, cooldown: 0, trigger: 'onHit' }],
  // Eagle — Swooping Strike (A1, 3%): +4. (Appended over its raptor dive archetype.)
  'eagle': [{ id: 'bonusDamage', label: 'Swooping Strike', chance: 0.03, bonusDamage: 4, cooldown: 0, trigger: 'onHit' }],
  // Flying Serpent — Tail Lash (A1, 3%): +3. (Appended over its kiter archetype.)
  'flying-serpent': [{ id: 'bonusDamage', label: 'Tail Lash', chance: 0.03, bonusDamage: 3, cooldown: 0, trigger: 'onHit' }],
  // Apperation — Poltergeist (A1, 3%): saps 50 health; Haunt (A2, 1%): +75 self-harm.
  'apperation': [
    { id: 'bonusDamage', label: 'Poltergeist', chance: 0.03, bonusDamage: 50, cooldown: 0, trigger: 'onHit' },
    { id: 'bonusDamage', label: 'Haunt', chance: 0.01, bonusDamage: 75, cooldown: 0, trigger: 'onHit' },
  ],
};

const resolved = new Map<string, MonsterBehavior>();

/** The resolved behavior for a monster template (memoized). Falls back to the
 *  `default` archetype, which reproduces legacy behavior. Per-monster abilities
 *  from MONSTER_ABILITIES are merged on top of the archetype's own abilities. */
export function resolveBehavior(template: { id?: string; name: string }): MonsterBehavior {
  const id = monsterId(template);
  let b = resolved.get(id);
  if (!b) {
    const archetype = MONSTER_ARCHETYPE[id] ?? 'default';
    b = { id: archetype, ...ARCHETYPES[archetype] };
    const extra = MONSTER_ABILITIES[id];
    // New abilities array (don't mutate the shared archetype preset's array).
    if (extra) b.abilities = [...b.abilities, ...extra];
    resolved.set(id, b);
  }
  return b;
}

/** The archetype id a monster would resolve to (for tooling/reports). */
export function archetypeOf(template: { id?: string; name: string }): ArchetypeId {
  return MONSTER_ARCHETYPE[monsterId(template)] ?? 'default';
}

let defaultResolved: MonsterBehavior | undefined;

/** The plain melee `default` behavior — what a cancelled monster falls back to:
 *  no telegraphed specials, on-hit abilities, or dodge, just chase-and-hit. */
export function defaultBehavior(): MonsterBehavior {
  if (!defaultResolved) defaultResolved = { id: 'default', ...ARCHETYPES['default'] };
  return defaultResolved;
}

/** Behavior accounting for a live Wand of Cancellation effect: while
 *  `canceledTurns > 0` the monster is reduced to the `default` archetype. */
export function effectiveBehavior(m: { id?: string; name: string; canceledTurns?: number }): MonsterBehavior {
  if ((m.canceledTurns ?? 0) > 0) return defaultBehavior();
  return resolveBehavior(m);
}

/**
 * Reduce a behavior to the combat "shape" the balance harness consumes: the
 * primary attack's damage multiplier and its effective swings-per-turn after
 * windup + cooldown. This is the bridge that lets the balancer see a brute as
 * hard-hitting-but-slow and a kiter as chip damage.
 */
/** Assumed fraction of telegraphed swoops that connect — i.e. the player
 *  positionally dodges ~40%. A modeling assumption; tune against playtests. */
const TELEGRAPH_CONNECT = 0.6;

export function primaryAttackShape(behavior: MonsterBehavior): AttackShape {
  const a = behavior.attacks[0];
  if (!a) return { damageMultiplier: 1, hitsPerTurn: 1, dodgeChance: behavior.defense.dodgeChance ?? 0 };
  // A swipe-alternating attack averages a normal hit and a 2× hit, so its
  // effective per-swing damage is 1.5× — otherwise the harness would undercount
  // a swiper's DPS by ~33% (matters only when bosses are included in a report).
  const swipeFactor = a.swipeAlternates ? 1.5 : 1;
  // Telegraphed attacks both fire less often (windup downtime) and get dodged
  // out of position part of the time.
  const telegraphFactor = a.windupTurns > 0 ? TELEGRAPH_CONNECT : 1;
  return {
    damageMultiplier: a.damageMultiplier * swipeFactor,
    hitsPerTurn: (1 / (1 + a.windupTurns + a.cooldown)) * telegraphFactor,
    dodgeChance: behavior.defense.dodgeChance ?? 0,
  };
}

/** Convenience for the balance report: shape derived from a template's archetype. */
export function shapeForTemplate(t: MonsterTemplate): AttackShape {
  return primaryAttackShape(resolveBehavior(t));
}

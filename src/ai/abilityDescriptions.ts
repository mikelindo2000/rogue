/* Player-facing descriptions of monster abilities, for the bestiary.
 *
 * Data-driven: every ability becomes readable text from its `AbilitySpec`
 * (id/magnitude/duration/damageType/chance/trigger) with no per-ability UI code,
 * so a newly assigned ability surfaces in the compendium automatically. The
 * optional `label` carries the GM-sheet ability NAME ("Poisonous Puke"); without
 * one we fall back to a generated name from the effect.
 *
 * This is the data layer the bestiary reads today and that future enhancements
 * (per-ability discovery tracking, icons, animated previews) can build on.
 */

import type { AbilitySpec } from './types';
import { resolveBehavior } from './archetypes';
import type { MonsterTemplate } from '../types';

export interface AbilityDescription {
  /** Display name — the sheet ability name if provided, else generated. */
  name: string;
  /** One-line effect summary, e.g. "1 poison damage per turn for 3 turns". */
  effect: string;
  /** Trigger phrase, e.g. "on hit". */
  trigger: string;
  /** Proc chance as a percent string, e.g. "3%". */
  chance: string;
}

const DOT_NOUN: Record<string, string> = {
  poison: 'poison',
  fire: 'fire',
  acid: 'acid',
  bacterial: 'infection',
};

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** A generated fallback name when an ability carries no sheet `label`. Switches
 *  on the id as a string so ids not yet in the AbilityId union (kinds added
 *  later) still resolve here rather than breaking the type. */
function generatedName(spec: AbilitySpec): string {
  switch (spec.id as string) {
    case 'poison':
      return spec.damageType ? `${cap(DOT_NOUN[spec.damageType] ?? spec.damageType)} attack` : 'Poison';
    case 'stun':
      return 'Stun';
    case 'fear':
      return 'Fear';
    case 'armorDebuff':
      return 'Sunder';
    case 'atkDebuff':
    case 'drainStrength':
      return 'Weaken';
    case 'weaponDebuff':
      return 'Disarm';
    case 'missChance':
      return 'Blind';
    case 'silenceMagic':
      return 'Silence';
    case 'bonusDamage':
      return 'Heavy Blow';
    case 'leechHeal':
      return 'Life drain';
    case 'stealGold':
      return 'Pickpocket';
    case 'stealItem':
      return 'Snatch';
    case 'summon':
      return 'Summon';
    default:
      return cap(spec.id);
  }
}

/** The effect clause — what the ability does, in plain language. A flat
 *  `bonusDamage` rider is appended to whatever status clause the id produces (or
 *  stands alone for a pure 'bonusDamage' ability). */
function effectText(spec: AbilitySpec): string {
  const base = statusClause(spec);
  const bonus = spec.bonusDamage && spec.bonusDamage > 0 ? `${spec.bonusDamage} extra damage` : '';
  if (spec.id === 'bonusDamage') return bonus || 'a heavy blow';
  if (base && bonus) return `${base}, plus ${bonus}`;
  return base || bonus || 'a special effect';
}

/** The status-effect portion of an ability's description (no bonus-damage rider). */
function statusClause(spec: AbilitySpec): string {
  const dur = spec.duration ?? 1;
  const mag = spec.magnitude ?? 0;
  switch (spec.id as string) {
    case 'poison': {
      const noun = DOT_NOUN[spec.damageType ?? 'poison'] ?? 'damage';
      return `${mag} ${noun} damage per turn for ${plural(dur, 'turn')}`;
    }
    case 'stun':
      return `you lose ${plural(dur, 'turn')}`;
    case 'fear':
      return `you flee in fear for ${plural(dur, 'turn')}`;
    case 'armorDebuff':
      return `your armor drops by ${mag} for ${plural(dur, 'turn')}`;
    case 'atkDebuff':
    case 'drainStrength':
      return `your attacks weaken by ${mag} for ${plural(dur, 'turn')}`;
    case 'weaponDebuff':
      return `you fight disarmed for ${plural(dur, 'turn')}`;
    case 'missChance':
      return `${Math.round(mag * 100)}% chance to miss for ${plural(dur, 'turn')}`;
    case 'silenceMagic':
      return `your magic is sealed for ${plural(dur, 'turn')}`;
    case 'leechHeal':
      return `heals itself for ${mag} when it hits you`;
    case 'stealGold':
      return 'steals your gold and may vanish';
    case 'stealItem':
      return 'steals an item and vanishes';
    case 'summon':
      return 'calls another monster to its aid';
    default:
      // Unknown id — describe what we can from the spec (effectText supplies the
      // final fallback / appends any bonus-damage rider).
      return dur > 1 ? `lasts ${plural(dur, 'turn')}` : '';
  }
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Turn one `AbilitySpec` into a player-facing description. */
export function describeAbility(spec: AbilitySpec): AbilityDescription {
  return {
    name: spec.label ?? generatedName(spec),
    effect: effectText(spec),
    trigger: spec.trigger === 'onHit' ? 'on hit' : 'on engage',
    chance: `${Math.round(spec.chance * 100)}%`,
  };
}

/** All described abilities for a monster (resolved archetype + per-monster
 *  abilities). Empty array when the monster has none — the bestiary then omits
 *  the section. */
export function monsterAbilities(template: MonsterTemplate): AbilityDescription[] {
  return resolveBehavior(template).abilities.map(describeAbility);
}

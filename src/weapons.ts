import type { WeaponType } from './types';

/**
 * The single source of truth for weapon-vs-armor classification and
 * two-handedness. Before this module these checks were scattered ad-hoc
 * (`category.includes('sword') || category.includes('mace') || === 'dagger' ||
 * === 'staff'`), which silently misclassified any new weapon category as armor.
 * Every weapon-detection site routes through here so adding a WeaponType only
 * requires touching this list.
 *
 * `WEAPON_CATEGORIES` mirrors the GEAR_POOL weapon categories and the
 * `WeaponType` union exactly. Keep them in lockstep.
 */
export const WEAPON_CATEGORIES = [
  'dagger',
  '1h_sword',
  '2h_sword',
  '1h_mace',
  '2h_mace',
  '1h_axe',
  '2h_axe',
  'polearm',
  'bow',
  'blunderbuss',
  'staff',
] as const satisfies readonly WeaponType[];

const WEAPON_CATEGORY_SET: ReadonlySet<string> = new Set(WEAPON_CATEGORIES);

/** True when a gear category/type is a weapon (vs armor/shield). The one place
 *  weapon-vs-armor is decided — floor glyph, inventory bucket, drop spawn. */
export function isWeaponCategory(cat: string | undefined): boolean {
  return cat !== undefined && WEAPON_CATEGORY_SET.has(cat);
}

/**
 * Two-handed weapon types: occupying a 2H weapon clears/locks the off-hand.
 * `bow`, `polearm`, `blunderbuss` are conceptually ranged/long and join the
 * `2h_*` family + `staff` here, so a string `startsWith('2h_')` check no longer
 * suffices — membership in this set is authoritative.
 */
export const TWO_HANDED: ReadonlySet<WeaponType> = new Set<WeaponType>([
  '2h_sword',
  '2h_mace',
  '2h_axe',
  'polearm',
  'bow',
  'blunderbuss',
  'staff',
]);

/** True when a weapon type occupies both hands (locks the off-hand). */
export function isTwoHandedType(type: WeaponType | undefined): boolean {
  return type !== undefined && TWO_HANDED.has(type);
}

/** Floor/inventory glyph for a gear category: weapons share ')' , armor '['. */
export function weaponSymbol(cat: string | undefined): ')' | '[' {
  return isWeaponCategory(cat) ? ')' : '[';
}

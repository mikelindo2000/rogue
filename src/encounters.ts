export type EncounterRole = 'hero' | 'boss';
export type EncounterPlacement = 'endRoom' | 'finalRoom';

export interface EncounterDefinition {
  monsterName: string;
  floor: number;
  role: EncounterRole;
  placement: EncounterPlacement;
  /** Final encounters gate victory only when every required boss is slain. */
  requiredForWin?: boolean;
}

export const HERO_ENCOUNTERS: EncounterDefinition[] = [
  { monsterName: 'Kalius King Cobra', floor: 6, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Pantier Pygmy King', floor: 8, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Michael the Minotaur', floor: 11, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Trogdor the Troll', floor: 14, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Gary the Golem', floor: 15, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Colossal Cyclops', floor: 17, role: 'hero', placement: 'endRoom' },
  { monsterName: 'Zachary the Zombie', floor: 19, role: 'hero', placement: 'endRoom' },
];

export const FINAL_BOSS_ENCOUNTERS: EncounterDefinition[] = [
  { monsterName: 'Dragon King', floor: 20, role: 'boss', placement: 'finalRoom', requiredForWin: true },
  { monsterName: 'Marcus the Brave', floor: 20, role: 'boss', placement: 'finalRoom', requiredForWin: true },
];

export const ENCOUNTERS: EncounterDefinition[] = [...HERO_ENCOUNTERS, ...FINAL_BOSS_ENCOUNTERS];

export function encountersForFloor(floor: number): EncounterDefinition[] {
  return ENCOUNTERS.filter(encounter => encounter.floor === floor);
}

export function requiredBossNamesForFloor(floor: number): Set<string> {
  return new Set(
    ENCOUNTERS
      .filter(encounter => encounter.floor === floor && encounter.role === 'boss' && encounter.requiredForWin)
      .map(encounter => encounter.monsterName)
  );
}

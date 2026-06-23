import type { GearItem, Monster, Player, PotionType, Rarity, ScrollType } from './types';
import { monsterId } from './discovery';

export type RunOutcome = 'won' | 'died';
export type DeathCause = 'starvation' | 'monster' | 'trap_scroll' | 'unknown';

export const SCORE_VERSION = 2;

export interface RunStatsV1 {
  version: 1;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  elapsedMs: number;
  deepestFloor: number;
  floorsVisited: Record<string, true>;
  stepsWalked: number;
  runCommandSteps: number;
  attacksMade: number;
  searchesAttempted: number;
  successfulSecretReveals: number;
  stairDescents: number;
  stairAscents: number;
  turnsSpentStarving: number;
  monstersKilled: number;
  killsByMonsterId: Record<string, number>;
  killsByArchetype: Record<string, number>;
  bossesDefeated: number;
  heroesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  biggestHitDealt: number;
  biggestHitTaken: number;
  monsterDodges: number;
  levelsGained: number;
  xpFromCombat: number;
  xpFromChests: number;
  tilesExplored: number;
  goldCollected: number;
  chestsOpened: number;
  foodPickedUp: number;
  foodEaten: number;
  potionsPickedUp: Record<PotionType, number>;
  potionsDrunk: Record<PotionType, number>;
  scrollsTriggered: Record<string, number>;
  gearPickedUpByRarity: Record<Rarity | 'unknown', number>;
  equipmentChanges: number;
  lowestHpSurvived: number | null;
  lowestHungerSurvived: number | null;
  lowHealthWarnings: number;
  criticalHealthWarnings: number;
  statusTurns: {
    vigor: number;
    midas: number;
    strength: number;
    invisible: number;
    armored: number;
  };
  deathCause?: DeathCause;
  killedByMonsterId?: string;
}

export interface RunSummaryV1 {
  runId: string;
  completedAt: string;
  outcome: RunOutcome;
  scoreVersion: number;
  score: number;
  seed: number;
  turns: number;
  elapsedMs: number;
  floorReached: number;
  deepestFloor: number;
  playerLevel: number;
  xp: number;
  hp: number;
  maxHp: number;
  goldHeld: number;
  goldCollected: number;
  finalDefense: number;
  hunger: number;
  inventory: {
    food: number;
    potions: Record<PotionType, number>;
    scrolls: Record<ScrollType, number>;
    weapons: number;
    armor: number;
    shields: number;
  };
  equipped: {
    mainHand?: string;
    offHand?: string;
    helm?: string;
    chest?: string;
    legs?: string;
    gauntlets?: string;
    boots?: string;
  };
  monstersKilled: number;
  killsByMonsterId: Record<string, number>;
  killsByArchetype: Record<string, number>;
  bossesDefeated: number;
  heroesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  biggestHitDealt: number;
  biggestHitTaken: number;
  attacksMade: number;
  searchesAttempted: number;
  secretsFound: number;
  tilesExplored: number;
  chestsOpened: number;
  foodEaten: number;
  potionsDrunk: Record<PotionType, number>;
  gearPickedUpByRarity: Record<Rarity | 'unknown', number>;
  stairDescents: number;
  stairAscents: number;
  deathCause?: DeathCause;
  killedByMonsterId?: string;
  title: string;
  awards: string[];
  finalLogs: string[];
}

export interface BuildRunSummaryParams {
  outcome: RunOutcome;
  seed: number;
  turns: number;
  floorReached: number;
  player: Player;
  finalDefense: number;
  stats: RunStatsV1;
  finalLogs: string[];
  completedAt?: string;
  nowMs?: number;
  deathCause?: DeathCause;
  killedByMonsterId?: string;
}

const POTION_TYPES = ['healing', 'strength', 'invisibility', 'armor'] as const satisfies readonly PotionType[];
const SCROLL_TYPES = ['light'] as const satisfies readonly ScrollType[];
const GEAR_SLOTS = ['helm', 'chest', 'legs', 'gauntlets', 'boots'] as const;

function emptyPotionCounts(): Record<PotionType, number> {
  return { healing: 0, strength: 0, invisibility: 0, armor: 0 };
}

function emptyScrollCounts(): Record<ScrollType, number> {
  return { light: 0 };
}

function emptyRarityCounts(): Record<Rarity | 'unknown', number> {
  return { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, unknown: 0 };
}

function isoNow(): string {
  return new Date().toISOString();
}

function makeRunId(seed: number, startedAt: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `run-${seed}-${Date.parse(startedAt) || Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function createRunStats(seed = 0, now: string = isoNow()): RunStatsV1 {
  return {
    version: 1,
    runId: makeRunId(seed, now),
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    deepestFloor: 1,
    floorsVisited: { '1': true },
    stepsWalked: 0,
    runCommandSteps: 0,
    attacksMade: 0,
    searchesAttempted: 0,
    successfulSecretReveals: 0,
    stairDescents: 0,
    stairAscents: 0,
    turnsSpentStarving: 0,
    monstersKilled: 0,
    killsByMonsterId: {},
    killsByArchetype: {},
    bossesDefeated: 0,
    heroesDefeated: 0,
    damageDealt: 0,
    damageTaken: 0,
    biggestHitDealt: 0,
    biggestHitTaken: 0,
    monsterDodges: 0,
    levelsGained: 0,
    xpFromCombat: 0,
    xpFromChests: 0,
    tilesExplored: 0,
    goldCollected: 0,
    chestsOpened: 0,
    foodPickedUp: 0,
    foodEaten: 0,
    potionsPickedUp: emptyPotionCounts(),
    potionsDrunk: emptyPotionCounts(),
    scrollsTriggered: {},
    gearPickedUpByRarity: emptyRarityCounts(),
    equipmentChanges: 0,
    lowestHpSurvived: null,
    lowestHungerSurvived: null,
    lowHealthWarnings: 0,
    criticalHealthWarnings: 0,
    statusTurns: { vigor: 0, midas: 0, strength: 0, invisible: 0, armored: 0 },
  };
}

export function normalizeRunStats(raw: unknown, seed = 0): RunStatsV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<RunStatsV1>;
  if (s.version !== 1 || typeof s.runId !== 'string' || typeof s.startedAt !== 'string') return null;
  return {
    ...createRunStats(seed, s.startedAt),
    ...s,
    floorsVisited: { ...(s.floorsVisited ?? {}) },
    killsByMonsterId: { ...(s.killsByMonsterId ?? {}) },
    killsByArchetype: { ...(s.killsByArchetype ?? {}) },
    potionsPickedUp: { ...emptyPotionCounts(), ...(s.potionsPickedUp ?? {}) },
    potionsDrunk: { ...emptyPotionCounts(), ...(s.potionsDrunk ?? {}) },
    scrollsTriggered: { ...(s.scrollsTriggered ?? {}) },
    gearPickedUpByRarity: { ...emptyRarityCounts(), ...(s.gearPickedUpByRarity ?? {}) },
    statusTurns: { ...createRunStats(seed).statusTurns, ...(s.statusTurns ?? {}) },
  };
}

export function recordStep(stats: RunStatsV1, runCommand = false): void {
  stats.stepsWalked++;
  if (runCommand) stats.runCommandSteps++;
}

export function recordSearch(stats: RunStatsV1): void {
  stats.searchesAttempted++;
}

export function recordSecretReveal(stats: RunStatsV1): void {
  stats.successfulSecretReveals++;
}

export function recordStairs(stats: RunStatsV1, floor: number, dir: 1 | -1): void {
  if (dir > 0) stats.stairDescents++;
  else stats.stairAscents++;
  stats.deepestFloor = Math.max(stats.deepestFloor, floor);
  stats.floorsVisited[String(floor)] = true;
}

export function recordAttack(stats: RunStatsV1): void {
  stats.attacksMade++;
}

export function recordDamageDealt(stats: RunStatsV1, damage: number): void {
  const d = Math.max(0, Math.floor(damage));
  stats.damageDealt += d;
  stats.biggestHitDealt = Math.max(stats.biggestHitDealt, d);
}

export function recordDamageTaken(stats: RunStatsV1, damage: number): void {
  const d = Math.max(0, Math.floor(damage));
  stats.damageTaken += d;
  stats.biggestHitTaken = Math.max(stats.biggestHitTaken, d);
}

export function recordMonsterDodge(stats: RunStatsV1): void {
  stats.monsterDodges++;
}

export function recordMonsterKilled(
  stats: RunStatsV1,
  monster: Monster,
  opts: { archetype?: string; xpGained?: number } = {},
): void {
  const id = monsterId(monster);
  stats.monstersKilled++;
  stats.killsByMonsterId[id] = (stats.killsByMonsterId[id] ?? 0) + 1;
  if (opts.archetype) {
    stats.killsByArchetype[opts.archetype] = (stats.killsByArchetype[opts.archetype] ?? 0) + 1;
  }
  if (monster.special === 'boss') stats.bossesDefeated++;
  if (monster.special === 'hero') stats.heroesDefeated++;
  if (opts.xpGained) stats.xpFromCombat += opts.xpGained;
}

export function recordLevelGain(stats: RunStatsV1, amount = 1): void {
  stats.levelsGained += Math.max(0, amount);
}

export function recordChest(stats: RunStatsV1, gold: number): void {
  stats.chestsOpened++;
  stats.goldCollected += Math.max(0, Math.floor(gold));
  stats.xpFromChests += Math.max(0, Math.floor(gold));
}

export function recordFoodPickedUp(stats: RunStatsV1): void {
  stats.foodPickedUp++;
}

export function recordFoodEaten(stats: RunStatsV1): void {
  stats.foodEaten++;
}

export function recordPotionPickedUp(stats: RunStatsV1, potion: PotionType): void {
  stats.potionsPickedUp[potion] = (stats.potionsPickedUp[potion] ?? 0) + 1;
}

export function recordPotionDrunk(stats: RunStatsV1, potion: PotionType): void {
  stats.potionsDrunk[potion] = (stats.potionsDrunk[potion] ?? 0) + 1;
}

export function recordScrollTriggered(stats: RunStatsV1, effect: string): void {
  stats.scrollsTriggered[effect] = (stats.scrollsTriggered[effect] ?? 0) + 1;
}

export function recordGearPickedUp(stats: RunStatsV1, gear: GearItem): void {
  const rarity = gear.rarity ?? 'unknown';
  stats.gearPickedUpByRarity[rarity] = (stats.gearPickedUpByRarity[rarity] ?? 0) + 1;
}

export function recordEquipmentChange(stats: RunStatsV1): void {
  stats.equipmentChanges++;
}

export function recordVitals(stats: RunStatsV1, hp: number, hunger: number): void {
  if (hp > 0) stats.lowestHpSurvived = stats.lowestHpSurvived === null ? hp : Math.min(stats.lowestHpSurvived, hp);
  if (hunger >= 0) {
    stats.lowestHungerSurvived = stats.lowestHungerSurvived === null ? hunger : Math.min(stats.lowestHungerSurvived, hunger);
  }
  if (hunger === 0) stats.turnsSpentStarving++;
}

export function recordExploredTiles(stats: RunStatsV1, explored: boolean[][]): void {
  let count = 0;
  for (const row of explored) {
    for (const cell of row) if (cell) count++;
  }
  stats.tilesExplored = Math.max(stats.tilesExplored, count);
}

export function recordStatusTurn(
  stats: RunStatsV1,
  active: Partial<Record<keyof RunStatsV1['statusTurns'], boolean>>,
): void {
  for (const key of Object.keys(stats.statusTurns) as Array<keyof RunStatsV1['statusTurns']>) {
    if (active[key]) stats.statusTurns[key]++;
  }
}

export function finalizeRunStats(
  stats: RunStatsV1,
  outcome: RunOutcome,
  opts: { completedAt?: string; nowMs?: number; deathCause?: DeathCause; killedByMonsterId?: string } = {},
): RunStatsV1 {
  const completedAt = opts.completedAt ?? isoNow();
  stats.endedAt = completedAt;
  const started = Date.parse(stats.startedAt);
  const ended = opts.nowMs ?? Date.parse(completedAt);
  stats.elapsedMs = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : stats.elapsedMs;
  if (outcome === 'died') {
    stats.deathCause = opts.deathCause ?? stats.deathCause ?? 'unknown';
    if (opts.killedByMonsterId) stats.killedByMonsterId = opts.killedByMonsterId;
  }
  return stats;
}

export function calculateScore(summary: Pick<RunSummaryV1,
  'outcome' | 'turns' | 'deepestFloor' | 'playerLevel' | 'goldCollected' | 'monstersKilled' | 'bossesDefeated' | 'secretsFound' | 'damageTaken'
>): number {
  const victoryBonus = summary.outcome === 'won' ? 16_000 : 0;
  const victorySpeedBonus = summary.outcome === 'won' ? Math.max(0, 8_000 - summary.turns * 3) : 0;
  const raw =
    summary.deepestFloor * 1200 +
    summary.playerLevel * 650 +
    Math.round(summary.goldCollected * 0.75) +
    summary.monstersKilled * 90 +
    summary.bossesDefeated * 1600 +
    summary.secretsFound * 350 +
    victoryBonus +
    victorySpeedBonus -
    Math.floor(summary.turns / 6) -
    Math.floor(summary.damageTaken / 12);
  return Math.max(0, raw);
}

export function chooseRunTitle(summary: Pick<RunSummaryV1,
  'outcome' | 'turns' | 'hp' | 'floorReached' | 'secretsFound' | 'monstersKilled' | 'goldCollected' | 'deathCause'
>): string {
  if (summary.outcome === 'won' && summary.turns < 1200) return 'Fastest blade in the dungeon';
  if (summary.outcome === 'won' && summary.hp <= 3) return 'Won by a heartbeat';
  if (summary.outcome === 'died' && summary.floorReached >= 20) return 'So close to daylight';
  if (summary.outcome === 'died' && summary.deathCause === 'starvation') return 'The pantry was the real boss';
  if (summary.secretsFound >= 3) return 'Wall whisperer';
  if (summary.monstersKilled >= 40) return 'Dungeon cleaner';
  if (summary.goldCollected >= 1500) return 'Chest enthusiast';
  return summary.outcome === 'won' ? 'Escaped the dungeon' : 'The dungeon claims another';
}

export function chooseAwards(summary: RunSummaryV1): string[] {
  const awards: string[] = [];
  if (summary.deepestFloor >= 20) awards.push('Deepest dive');
  if (summary.goldCollected >= 1000) awards.push('Gold fever');
  if (summary.tilesExplored >= 600) awards.push('Cartographer');
  if (summary.monstersKilled >= 25) awards.push('Brawler');
  if (summary.hp === 1 || summary.biggestHitTaken >= Math.max(8, Math.floor(summary.maxHp * 0.35))) awards.push('Barely breathing');
  if (summary.secretsFound >= 2) awards.push('Secret keeper');
  if (summary.stairAscents + summary.stairDescents >= 8) awards.push('Stair master');
  if (Object.values(summary.potionsDrunk).reduce((a, b) => a + b, 0) >= 4) awards.push('Potion sommelier');
  if (summary.outcome === 'won' && summary.inventory.food > 0) awards.push('Ration discipline');
  if (awards.length === 0) awards.push(summary.outcome === 'won' ? 'Dungeon breaker' : 'Brave attempt');
  return awards.slice(0, 6);
}

function countValues<T extends string>(values: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function equippedName(items: GearItem[], index: number): string | undefined {
  return items[index]?.name;
}

function offHandName(player: Player): string | undefined {
  if (player.equipped.offHand === 'none:0') return undefined;
  const [kind, rawIndex] = player.equipped.offHand.split(':');
  const index = Number(rawIndex);
  if (kind === 'shield') return player.inventory.shield[index]?.name;
  if (kind === 'weapon') return player.inventory.weapons[index]?.name;
  return undefined;
}

export function buildRunSummary(params: BuildRunSummaryParams): RunSummaryV1 {
  const { outcome, seed, turns, floorReached, player, finalDefense, finalLogs } = params;
  const completedAt = params.completedAt ?? params.stats.endedAt ?? isoNow();
  const stats = finalizeRunStats(params.stats, outcome, {
    completedAt,
    nowMs: params.nowMs,
    deathCause: params.deathCause,
    killedByMonsterId: params.killedByMonsterId,
  });
  const armorCount = GEAR_SLOTS.reduce((sum, slot) => sum + player.inventory[slot].length, 0);
  const summaryBase = {
    runId: stats.runId,
    completedAt,
    outcome,
    scoreVersion: SCORE_VERSION,
    score: 0,
    seed,
    turns,
    elapsedMs: stats.elapsedMs,
    floorReached,
    deepestFloor: Math.max(stats.deepestFloor, floorReached),
    playerLevel: player.level,
    xp: player.xp,
    hp: player.hp,
    maxHp: player.maxHp,
    goldHeld: player.gold,
    goldCollected: stats.goldCollected,
    finalDefense,
    hunger: player.hunger,
    inventory: {
      food: player.inventory.food,
      potions: { ...emptyPotionCounts(), ...countValues(POTION_TYPES.flatMap(type => new Array(player.inventory.potions.filter(p => p === type).length).fill(type))) },
      scrolls: { ...emptyScrollCounts(), ...countValues(SCROLL_TYPES.flatMap(type => new Array(player.inventory.scrolls.filter(s => s === type).length).fill(type))) },
      weapons: player.inventory.weapons.length,
      armor: armorCount,
      shields: player.inventory.shield.length,
    },
    equipped: {
      mainHand: equippedName(player.inventory.weapons, player.equipped.mainHand),
      offHand: offHandName(player),
      helm: equippedName(player.inventory.helm, player.equipped.helm),
      chest: equippedName(player.inventory.chest, player.equipped.chest),
      legs: equippedName(player.inventory.legs, player.equipped.legs),
      gauntlets: equippedName(player.inventory.gauntlets, player.equipped.gauntlets),
      boots: equippedName(player.inventory.boots, player.equipped.boots),
    },
    monstersKilled: stats.monstersKilled,
    killsByMonsterId: { ...stats.killsByMonsterId },
    killsByArchetype: { ...stats.killsByArchetype },
    bossesDefeated: stats.bossesDefeated,
    heroesDefeated: stats.heroesDefeated,
    damageDealt: stats.damageDealt,
    damageTaken: stats.damageTaken,
    biggestHitDealt: stats.biggestHitDealt,
    biggestHitTaken: stats.biggestHitTaken,
    attacksMade: stats.attacksMade,
    searchesAttempted: stats.searchesAttempted,
    secretsFound: stats.successfulSecretReveals,
    tilesExplored: stats.tilesExplored,
    chestsOpened: stats.chestsOpened,
    foodEaten: stats.foodEaten,
    potionsDrunk: { ...emptyPotionCounts(), ...stats.potionsDrunk },
    gearPickedUpByRarity: { ...emptyRarityCounts(), ...stats.gearPickedUpByRarity },
    stairDescents: stats.stairDescents,
    stairAscents: stats.stairAscents,
    deathCause: stats.deathCause,
    killedByMonsterId: stats.killedByMonsterId,
    title: '',
    awards: [],
    finalLogs: [...finalLogs],
  } satisfies RunSummaryV1;

  const score = calculateScore(summaryBase);
  const title = chooseRunTitle(summaryBase);
  const summary: RunSummaryV1 = { ...summaryBase, score, title, awards: [] };
  summary.awards = chooseAwards(summary);
  return summary;
}

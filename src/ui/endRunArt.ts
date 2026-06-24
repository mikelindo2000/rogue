import type { RunSummaryV1 } from '../runStats';
import { MONSTER_DATABASE } from '../config';
import { monsterId } from '../discovery';

export type EndRunArtScenario =
  | 'victory-fast'
  | 'victory-heartbeat'
  | 'victory-default'
  | 'death-floor20'
  | 'death-starvation'
  | 'wall-whisperer'
  | 'dungeon-cleaner'
  | 'chest-enthusiast'
  | 'death-default';

export interface EndRunArt {
  scenario: EndRunArtScenario | 'victory-finale' | 'monster-death';
  file: string;
  url: string;
  monsterId?: string;
}

const VARIANTS_PER_SCENARIO = 6;
const MONSTER_DEATH_VARIANTS_PER_MONSTER = 3;
export const VICTORY_FINALE_ART_FILE = 'victory-amulet-escape-1.png';

const SCENARIOS: EndRunArtScenario[] = [
  'victory-fast',
  'victory-heartbeat',
  'victory-default',
  'death-floor20',
  'death-starvation',
  'wall-whisperer',
  'dungeon-cleaner',
  'chest-enthusiast',
  'death-default',
];

export const END_RUN_ART_FILES = SCENARIOS.flatMap(scenario =>
  Array.from({ length: VARIANTS_PER_SCENARIO }, (_, i) => `${scenario}-${i + 1}.png`)
);

export const MONSTER_DEATH_ART_FILES = MONSTER_DATABASE.flatMap(monster =>
  Array.from({ length: MONSTER_DEATH_VARIANTS_PER_MONSTER }, (_, i) => monsterDeathArtFile(monsterId(monster), i + 1))
);

export const ALL_END_RUN_ART_FILES = [
  ...END_RUN_ART_FILES,
  VICTORY_FINALE_ART_FILE,
  ...MONSTER_DEATH_ART_FILES,
];

const VALID_MONSTER_DEATH_IDS = new Set(MONSTER_DATABASE.map(monsterId));

export function endRunArtUrl(file: string): string {
  return `/endings/${file}`;
}

export function monsterDeathArtFile(id: string, variant: number): string {
  return `monster-${id}-${variant}.png`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectEndRunArtScenario(summary: RunSummaryV1): EndRunArtScenario {
  if (summary.outcome === 'won' && summary.turns < 1200) return 'victory-fast';
  if (summary.outcome === 'won' && summary.hp <= 3) return 'victory-heartbeat';
  if (summary.outcome === 'died' && summary.floorReached >= 20) return 'death-floor20';
  if (summary.outcome === 'died' && summary.deathCause === 'starvation') return 'death-starvation';
  if (summary.secretsFound >= 3) return 'wall-whisperer';
  if (summary.monstersKilled >= 40) return 'dungeon-cleaner';
  if (summary.goldCollected >= 1500) return 'chest-enthusiast';
  return summary.outcome === 'won' ? 'victory-default' : 'death-default';
}

export function selectMonsterDeathArtId(summary: RunSummaryV1): string | null {
  if (summary.outcome !== 'died') return null;
  if (summary.deathCause !== 'monster') return null;
  if (!summary.killedByMonsterId) return null;
  if (!VALID_MONSTER_DEATH_IDS.has(summary.killedByMonsterId)) return null;
  if (summary.floorReached >= 20) return null;
  if (summary.secretsFound >= 3) return null;
  if (summary.monstersKilled >= 40) return null;
  if (summary.goldCollected >= 1500) return null;
  return summary.killedByMonsterId;
}

function variantFor(summary: RunSummaryV1, variants: number): number {
  return (hashString(`${summary.runId}:${summary.seed}:${summary.turns}:${summary.score}`) % variants) + 1;
}

function pickScenarioEndRunArt(summary: RunSummaryV1, scenario: EndRunArtScenario): EndRunArt {
  const variant = variantFor(summary, VARIANTS_PER_SCENARIO);
  const file = `${scenario}-${variant}.png`;
  return { scenario, file, url: endRunArtUrl(file) };
}

export function pickEndRunArt(summary: RunSummaryV1): EndRunArt {
  const deathMonsterId = selectMonsterDeathArtId(summary);
  if (deathMonsterId) {
    const variant = variantFor(summary, MONSTER_DEATH_VARIANTS_PER_MONSTER);
    const file = monsterDeathArtFile(deathMonsterId, variant);
    return { scenario: 'monster-death', monsterId: deathMonsterId, file, url: endRunArtUrl(file) };
  }
  return pickScenarioEndRunArt(summary, selectEndRunArtScenario(summary));
}

export function pickFallbackEndRunArt(summary: RunSummaryV1): EndRunArt {
  return pickScenarioEndRunArt(summary, summary.outcome === 'won' ? 'victory-default' : 'death-default');
}

export function pickOpeningEndRunArt(summary: RunSummaryV1): EndRunArt {
  if (summary.outcome === 'won') {
    return {
      scenario: 'victory-finale',
      file: VICTORY_FINALE_ART_FILE,
      url: endRunArtUrl(VICTORY_FINALE_ART_FILE),
    };
  }
  return pickEndRunArt(summary);
}

import type { RunSummaryV1 } from '../runStats';

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
  scenario: EndRunArtScenario;
  file: string;
  url: string;
}

const VARIANTS_PER_SCENARIO = 6;

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

export function endRunArtUrl(file: string): string {
  return `/endings/${file}`;
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

export function pickEndRunArt(summary: RunSummaryV1): EndRunArt {
  const scenario = selectEndRunArtScenario(summary);
  const variant = (hashString(`${summary.runId}:${summary.seed}:${summary.turns}:${summary.score}`) % VARIANTS_PER_SCENARIO) + 1;
  const file = `${scenario}-${variant}.png`;
  return { scenario, file, url: endRunArtUrl(file) };
}

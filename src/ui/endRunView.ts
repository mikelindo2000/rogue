import type { RunSummaryV1 } from '../runStats';
import type { BrowserRecords, RunRecordComparison } from '../persistence/runHistory';

export interface EndRunStat {
  label: string;
  value: string;
  detail?: string;
}

export interface EndRunView {
  outcomeLabel: string;
  title: string;
  subtitle: string;
  completedAt: string;
  duration: string;
  headline: EndRunStat[];
  story: EndRunStat[];
  combat: EndRunStat[];
  loot: EndRunStat[];
  exploration: EndRunStat[];
  legend: string[];
  recordBadges: string[];
  recordStats: EndRunStat[];
  history: Array<{
    runId: string;
    result: string;
    score: string;
    floor: string;
    turns: string;
    when: string;
  }>;
}

const nf = new Intl.NumberFormat('en-US');

export function formatNumber(n: number): string {
  return nf.format(Math.round(n));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, v) => sum + v, 0);
}

function recordStat(label: string, value: number | null | undefined, suffix = ''): EndRunStat | null {
  if (value === null || value === undefined) return null;
  return { label, value: `${formatNumber(value)}${suffix}` };
}

function finalLoadout(summary: RunSummaryV1): string {
  const equipped = [
    summary.equipped.mainHand,
    summary.equipped.offHand,
    summary.equipped.helm,
    summary.equipped.chest,
    summary.equipped.legs,
    summary.equipped.gauntlets,
    summary.equipped.boots,
  ].filter((item): item is string => !!item);
  if (equipped.length === 0) return 'No notable gear made it to the ending.';
  return equipped.slice(0, 4).join(', ');
}

function buildLegendLines(summary: RunSummaryV1): string[] {
  const lines = [
    summary.outcome === 'won'
      ? `The Amulet of Ballard reached daylight after ${formatNumber(summary.turns)} turns.`
      : summary.deathCause === 'monster' && summary.killedByMonsterId
        ? `Final troublemaker: ${summary.killedByMonsterId}.`
        : 'The dungeon kept the receipt.',
    `Final kit: ${finalLoadout(summary)}`,
    `${formatNumber(summary.monstersKilled)} foes down, ${formatNumber(summary.goldCollected)} gold collected, ${formatNumber(summary.secretsFound)} secrets uncovered.`,
  ];
  if (summary.finalLogs.length > 0) {
    lines.push(`Last report: ${summary.finalLogs[summary.finalLogs.length - 1]}`);
  }
  return lines;
}

export function buildCopySummary(summary: RunSummaryV1, comparison: RunRecordComparison | null): string {
  const records = comparison?.badges.filter(b => b.status === 'new').map(b => b.label).join(', ') || 'no new records';
  return [
    `${summary.title} (${summary.outcome === 'won' ? 'Victory' : 'Defeat'})`,
    `Score: ${formatNumber(summary.score)} on floor ${summary.floorReached} after ${formatNumber(summary.turns)} turns`,
    `Level ${summary.playerLevel}, ${formatNumber(summary.goldCollected)} gold collected, ${formatNumber(summary.monstersKilled)} monsters defeated`,
    `Seed: ${summary.seed}`,
    `Browser records: ${records}`,
  ].join('\n');
}

export function buildEndRunView(
  summary: RunSummaryV1,
  records: BrowserRecords | null,
  comparison: RunRecordComparison | null,
  history: RunSummaryV1[],
): EndRunView {
  const outcomeLabel = summary.outcome === 'won' ? 'Victory' : 'Run ended';
  const subtitle = summary.outcome === 'won'
    ? 'You escaped the dungeon with a story worth retelling.'
    : summary.deathCause === 'starvation'
      ? 'The dungeon did not kill you quickly. Hunger finished the work.'
      : 'The dungeon claims another name for its walls.';
  const recordBadges = comparison?.badges
    .filter(b => b.status === 'new' || b.status === 'tied')
    .slice(0, 6)
    .map(b => `${b.label}: ${b.text}`) ?? [];
  if (comparison?.isFirstRecordedRun && recordBadges.length === 0) recordBadges.push('First recorded run');

  const story = [
    { label: 'Seed', value: String(summary.seed) },
    { label: 'Completed', value: formatDate(summary.completedAt) },
    { label: 'Duration', value: formatDuration(summary.elapsedMs) },
    { label: 'Final HP', value: `${formatNumber(summary.hp)} / ${formatNumber(summary.maxHp)}` },
    { label: 'Hunger left', value: formatNumber(summary.hunger) },
    { label: 'Final defense', value: formatNumber(summary.finalDefense) },
  ];

  const recordStats = [
    recordStat('Total runs', records?.totalRuns),
    recordStat('Victories', records?.totalVictories),
    recordStat('Highest score', records?.records.highestScore?.value),
    recordStat('Deepest floor', records?.records.deepestFloor?.value),
    recordStat('Fastest victory', records?.records.fastestVictoryTurns?.value, records?.records.fastestVictoryTurns ? ' turns' : ''),
    recordStat('First victory', records?.firstVictoryAt ? 1 : null, records?.firstVictoryAt ? ` (${formatDate(records.firstVictoryAt)})` : ''),
  ].filter((s): s is EndRunStat => !!s);

  return {
    outcomeLabel,
    title: summary.title,
    subtitle,
    completedAt: formatDate(summary.completedAt),
    duration: formatDuration(summary.elapsedMs),
    headline: [
      { label: 'Score', value: formatNumber(summary.score) },
      { label: 'Deepest floor', value: `${formatNumber(summary.deepestFloor)} / 20` },
      { label: 'Turns', value: formatNumber(summary.turns) },
      { label: 'Gold', value: formatNumber(summary.goldCollected) },
      { label: 'Level', value: formatNumber(summary.playerLevel) },
      { label: 'Kills', value: formatNumber(summary.monstersKilled) },
    ],
    story,
    combat: [
      { label: 'Monsters defeated', value: formatNumber(summary.monstersKilled) },
      { label: 'Bosses defeated', value: formatNumber(summary.bossesDefeated) },
      { label: 'Heroes defeated', value: formatNumber(summary.heroesDefeated) },
      { label: 'Attacks made', value: formatNumber(summary.attacksMade) },
      { label: 'Damage dealt', value: formatNumber(summary.damageDealt) },
      { label: 'Damage taken', value: formatNumber(summary.damageTaken) },
      { label: 'Biggest hit dealt', value: formatNumber(summary.biggestHitDealt) },
      { label: 'Biggest hit taken', value: formatNumber(summary.biggestHitTaken) },
    ],
    loot: [
      { label: 'Gold collected', value: formatNumber(summary.goldCollected) },
      { label: 'Gold held', value: formatNumber(summary.goldHeld) },
      { label: 'Chests opened', value: formatNumber(summary.chestsOpened) },
      { label: 'Food eaten', value: formatNumber(summary.foodEaten) },
      { label: 'Potions drunk', value: formatNumber(sumValues(summary.potionsDrunk)) },
      { label: 'Gear found', value: formatNumber(sumValues(summary.gearPickedUpByRarity)) },
      { label: 'Food carried', value: formatNumber(summary.inventory.food) },
      { label: 'Potions carried', value: formatNumber(sumValues(summary.inventory.potions)) },
    ],
    exploration: [
      { label: 'Floor reached', value: formatNumber(summary.floorReached) },
      { label: 'Deepest floor', value: formatNumber(summary.deepestFloor) },
      { label: 'Tiles explored', value: formatNumber(summary.tilesExplored) },
      { label: 'Secrets found', value: formatNumber(summary.secretsFound) },
      { label: 'Searches', value: formatNumber(summary.searchesAttempted) },
      { label: 'Descents', value: formatNumber(summary.stairDescents) },
      { label: 'Ascents', value: formatNumber(summary.stairAscents) },
    ],
    legend: buildLegendLines(summary),
    recordBadges,
    recordStats,
    history: history.slice(0, 12).map(run => ({
      runId: run.runId,
      result: run.outcome === 'won' ? 'Won' : 'Died',
      score: formatNumber(run.score),
      floor: `${run.deepestFloor}/20`,
      turns: formatNumber(run.turns),
      when: formatDate(run.completedAt),
    })),
  };
}

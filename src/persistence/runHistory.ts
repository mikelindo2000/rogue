import { defineStore, resolveBackend } from './store';
import type { RunOutcome, RunSummaryV1 } from '../runStats';

export interface RunHistoryV1 {
  runs: RunSummaryV1[];
}

export type RecordKey =
  | 'highestScore'
  | 'deepestFloor'
  | 'mostGoldCollected'
  | 'mostMonstersKilled'
  | 'mostSecretsFound'
  | 'highestLevel'
  | 'longestSurvivalTurns'
  | 'fastestVictoryTurns'
  | 'fastestVictoryElapsedMs'
  | 'fewestVictoryDamageTaken';

export interface BrowserRecord {
  key: RecordKey;
  label: string;
  value: number;
  runId: string;
  lowerBetter: boolean;
  outcome?: RunOutcome;
}

export interface BrowserRecords {
  totalRuns: number;
  totalVictories: number;
  firstVictoryAt: string | null;
  records: Partial<Record<RecordKey, BrowserRecord>>;
}

export interface RunRecordComparison {
  isFirstRecordedRun: boolean;
  badges: Array<{
    key: RecordKey;
    label: string;
    value: number;
    status: 'new' | 'tied' | 'behind';
    text: string;
  }>;
}

const STORAGE_KEY = 'rogue_run_history';
const VERSION = 1;
const HISTORY_LIMIT = 250;

const RECORD_DEFS: Array<{
  key: RecordKey;
  label: string;
  lowerBetter: boolean;
  victoryOnly?: boolean;
  value: (run: RunSummaryV1) => number;
}> = [
  { key: 'highestScore', label: 'Highest score', lowerBetter: false, value: r => r.score },
  { key: 'deepestFloor', label: 'Deepest floor', lowerBetter: false, value: r => r.deepestFloor },
  { key: 'mostGoldCollected', label: 'Most gold', lowerBetter: false, value: r => r.goldCollected },
  { key: 'mostMonstersKilled', label: 'Most kills', lowerBetter: false, value: r => r.monstersKilled },
  { key: 'mostSecretsFound', label: 'Most secrets', lowerBetter: false, value: r => r.secretsFound },
  { key: 'highestLevel', label: 'Highest level', lowerBetter: false, value: r => r.playerLevel },
  { key: 'longestSurvivalTurns', label: 'Longest survival', lowerBetter: false, value: r => r.turns },
  { key: 'fastestVictoryTurns', label: 'Fastest victory', lowerBetter: true, victoryOnly: true, value: r => r.turns },
  { key: 'fastestVictoryElapsedMs', label: 'Fastest real-time victory', lowerBetter: true, victoryOnly: true, value: r => r.elapsedMs },
  { key: 'fewestVictoryDamageTaken', label: 'Cleanest victory', lowerBetter: true, victoryOnly: true, value: r => r.damageTaken },
];

function defaultHistory(): RunHistoryV1 {
  return { runs: [] };
}

function store(backend?: Storage | null) {
  return defineStore<RunHistoryV1>({
    key: STORAGE_KEY,
    version: VERSION,
    defaults: defaultHistory(),
    fallback: defaultHistory,
    backend: backend !== undefined ? backend : resolveBackend(),
  });
}

function normalizeHistory(raw: unknown): RunHistoryV1 {
  if (!raw || typeof raw !== 'object') return defaultHistory();
  const runs = (raw as Partial<RunHistoryV1>).runs;
  if (!Array.isArray(runs)) return defaultHistory();
  return {
    runs: runs.filter((r): r is RunSummaryV1 =>
      !!r &&
      typeof r === 'object' &&
      typeof (r as RunSummaryV1).runId === 'string' &&
      typeof (r as RunSummaryV1).completedAt === 'string' &&
      ((r as RunSummaryV1).outcome === 'won' || (r as RunSummaryV1).outcome === 'died') &&
      typeof (r as RunSummaryV1).score === 'number'
    ).slice(0, HISTORY_LIMIT),
  };
}

export function loadRunHistory(backend?: Storage | null): RunHistoryV1 {
  return normalizeHistory(store(backend).load());
}

export function saveRunHistory(history: RunHistoryV1, backend?: Storage | null): void {
  store(backend).save({ runs: history.runs.slice(0, HISTORY_LIMIT) });
}

export function upsertRunSummary(summary: RunSummaryV1, backend?: Storage | null): RunHistoryV1 {
  const history = loadRunHistory(backend);
  const withoutCurrent = history.runs.filter(run => run.runId !== summary.runId);
  const next = { runs: [summary, ...withoutCurrent].slice(0, HISTORY_LIMIT) };
  saveRunHistory(next, backend);
  return next;
}

export function clearRunHistory(backend?: Storage | null): void {
  store(backend).clear();
}

export function computeRecords(history: RunHistoryV1): BrowserRecords {
  const records: BrowserRecords['records'] = {};
  let firstVictoryAt: string | null = null;
  for (const run of history.runs) {
    if (run.outcome === 'won' && (!firstVictoryAt || run.completedAt < firstVictoryAt)) {
      firstVictoryAt = run.completedAt;
    }
    for (const def of RECORD_DEFS) {
      if (def.victoryOnly && run.outcome !== 'won') continue;
      const value = def.value(run);
      const current = records[def.key];
      const beats = !current || (def.lowerBetter ? value < current.value : value > current.value);
      if (beats) {
        records[def.key] = {
          key: def.key,
          label: def.label,
          value,
          runId: run.runId,
          lowerBetter: def.lowerBetter,
          outcome: def.victoryOnly ? 'won' : undefined,
        };
      }
    }
  }
  return {
    totalRuns: history.runs.length,
    totalVictories: history.runs.filter(r => r.outcome === 'won').length,
    firstVictoryAt,
    records,
  };
}

export function compareRunToRecords(summary: RunSummaryV1, recordsBeforeCurrent: BrowserRecords): RunRecordComparison {
  const badges: RunRecordComparison['badges'] = [];
  const isFirstRecordedRun = recordsBeforeCurrent.totalRuns === 0;
  for (const def of RECORD_DEFS) {
    if (def.victoryOnly && summary.outcome !== 'won') continue;
    const value = def.value(summary);
    const record = recordsBeforeCurrent.records[def.key];
    if (!record) {
      badges.push({ key: def.key, label: def.label, value, status: 'new', text: isFirstRecordedRun ? 'first recorded run' : 'new record' });
      continue;
    }
    const delta = value - record.value;
    const isTied = delta === 0;
    const isNew = def.lowerBetter ? value < record.value : value > record.value;
    if (isNew) {
      const diff = Math.abs(delta);
      badges.push({ key: def.key, label: def.label, value, status: 'new', text: def.lowerBetter ? `${diff} better than record` : `+${diff} over best` });
    } else if (isTied) {
      badges.push({ key: def.key, label: def.label, value, status: 'tied', text: 'tied record' });
    }
  }
  return { isFirstRecordedRun, badges };
}


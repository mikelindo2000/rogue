export type AssetDiagnosticKind = 'image' | 'audio';

export interface AssetDiagnosticTarget {
  kind: AssetDiagnosticKind;
  url: string;
  id?: string;
  owner: string;
  category: string;
  slowMs?: number;
}

export interface AssetDiagnosticRecord extends AssetDiagnosticTarget {
  elapsedMs: number;
  ok: boolean;
  reason?: string;
}

interface DiagnosticRuntime {
  enabled?: boolean;
  now?: () => number;
  warn?: (...args: unknown[]) => void;
  ImageCtor?: typeof Image;
}

interface DiagnosticsGlobal {
  __ROGUE_ASSET_DIAGNOSTICS__?: boolean;
  __ROGUE_ASSET_DIAGNOSTIC_RECORDS__?: AssetDiagnosticRecord[];
}

const DEFAULT_SLOW_MS: Record<AssetDiagnosticKind, number> = {
  image: 200,
  audio: 120,
};
const MAX_RECORDS = 100;

// Baseline readiness budgets captured before td-d36ad8 scheduler work:
// - First playable must not block on the full media catalogue.
// - Floor transition should never show a blank frame and prefers <200 ms readiness.
// - Inventory opens immediately; item art readiness is presentation-only.
// - Combat portrait frame/name/HP render immediately, even if portrait art lags.
// - End-run opener must never wait indefinitely for media.
export const ASSET_READINESS_BASELINES = {
  firstPlayable: 'no media-wide block',
  floorTransition: 'no blank frame; prefer <200 ms readiness cap',
  inventory: 'opens immediately',
  combatPortrait: 'frame/name/HP render immediately',
  endRun: 'opener never waits indefinitely',
} as const;

function isDevBrowser(): boolean {
  return Boolean(
    import.meta.env.DEV &&
      import.meta.env.MODE !== 'test' &&
      typeof window !== 'undefined' &&
      typeof document !== 'undefined',
  );
}

export function assetDiagnosticsEnabled(runtime: DiagnosticRuntime = {}): boolean {
  if (runtime.enabled !== undefined) return runtime.enabled;
  const flag = (globalThis as DiagnosticsGlobal).__ROGUE_ASSET_DIAGNOSTICS__;
  if (flag !== undefined) return flag && isDevBrowser();
  return isDevBrowser();
}

function now(runtime: DiagnosticRuntime): number {
  if (runtime.now) return runtime.now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function emitRecord(record: AssetDiagnosticRecord, runtime: DiagnosticRuntime): void {
  try {
    const g = globalThis as DiagnosticsGlobal;
    const records = g.__ROGUE_ASSET_DIAGNOSTIC_RECORDS__ ?? [];
    records.push(record);
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    g.__ROGUE_ASSET_DIAGNOSTIC_RECORDS__ = records;

    const slowMs = record.slowMs ?? DEFAULT_SLOW_MS[record.kind];
    const label = `[asset:${record.kind}] ${record.owner}/${record.category}${record.id ? `#${record.id}` : ''}`;
    if (record.elapsedMs >= slowMs) {
      (runtime.warn ?? console.warn)(`${label} slow decode ${Math.round(record.elapsedMs)}ms`, record.url);
    } else if (!record.ok) {
      (runtime.warn ?? console.warn)(`${label} decode failed after ${Math.round(record.elapsedMs)}ms`, record.url, record.reason);
    }
  } catch {
    /* diagnostics must never escape into gameplay */
  }
}

export function assetDiagnosticRecords(): readonly AssetDiagnosticRecord[] {
  return (globalThis as DiagnosticsGlobal).__ROGUE_ASSET_DIAGNOSTIC_RECORDS__ ?? [];
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForImageLoad(img: HTMLImageElement, url: string): Promise<void> {
  if (typeof img.decode === 'function') {
    img.src = url;
    await img.decode();
    return;
  }
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
  });
  img.src = url;
  await loaded;
}

export async function diagnoseImageDecode(
  target: Omit<AssetDiagnosticTarget, 'kind'>,
  runtime: DiagnosticRuntime = {},
): Promise<AssetDiagnosticRecord | null> {
  if (!assetDiagnosticsEnabled(runtime)) return null;
  try {
    const ImageCtor = runtime.ImageCtor ?? (typeof Image !== 'undefined' ? Image : undefined);
    if (!ImageCtor) return null;
    const img = new ImageCtor();
    const start = now(runtime);
    try {
      await waitForImageLoad(img, target.url);
      const record = { ...target, kind: 'image' as const, elapsedMs: now(runtime) - start, ok: true };
      emitRecord(record, runtime);
      return record;
    } catch (err) {
      const record = {
        ...target,
        kind: 'image' as const,
        elapsedMs: now(runtime) - start,
        ok: false,
        reason: reasonFrom(err),
      };
      emitRecord(record, runtime);
      return record;
    }
  } catch {
    return null;
  }
}

export async function withAssetDecodeDiagnostics<T>(
  target: AssetDiagnosticTarget,
  decode: () => Promise<T>,
  runtime: DiagnosticRuntime = {},
): Promise<T> {
  if (!assetDiagnosticsEnabled(runtime)) return decode();
  const start = now(runtime);
  try {
    const value = await decode();
    emitRecord({ ...target, elapsedMs: now(runtime) - start, ok: true }, runtime);
    return value;
  } catch (err) {
    emitRecord({ ...target, elapsedMs: now(runtime) - start, ok: false, reason: reasonFrom(err) }, runtime);
    throw err;
  }
}

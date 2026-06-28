export type AssetReadinessPriority = 'critical-now' | 'soon' | 'idle' | 'rare';
export type AssetReadinessKind = 'image';
export type AssetReadinessState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed' | 'evicted';

export interface AssetReadinessRequest {
  kind: AssetReadinessKind;
  url: string;
  priority: AssetReadinessPriority;
  reason: string;
  owner: string;
  optional?: boolean;
  signal?: AbortSignal;
  isStale?: () => boolean;
}

export interface AssetReadinessSnapshot {
  kind: AssetReadinessKind;
  url: string;
  state: AssetReadinessState;
  priority?: AssetReadinessPriority;
  reason?: string;
  owner?: string;
  optional?: boolean;
  error?: string;
}

export interface AssetReadinessHandle {
  readonly url: string;
  cancel(): void;
  snapshot(): AssetReadinessSnapshot;
  whenReady(timeoutMs?: number): Promise<boolean>;
}

type ImageCtor = new () => HTMLImageElement;
type IdleHandle = number;
type TimerHandle = number | ReturnType<typeof setTimeout>;

export interface AssetReadinessRuntime {
  ImageCtor?: ImageCtor;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
  setTimeout?: (callback: () => void, delay?: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  warn?: (...args: unknown[]) => void;
  cacheLimit?: number;
  maxConcurrentImages?: number;
}

interface RequestToken {
  priority: AssetReadinessPriority;
  reason: string;
  owner: string;
  optional: boolean;
  signal?: AbortSignal;
  isStale?: () => boolean;
  canceled: boolean;
}

interface ImageEntry {
  kind: AssetReadinessKind;
  url: string;
  state: AssetReadinessState;
  priority: AssetReadinessPriority;
  reason: string;
  owner: string;
  optional: boolean;
  error?: string;
  image?: HTMLImageElement;
  tokens: Set<RequestToken>;
  waiters: Set<(ready: boolean) => void>;
  idleHandle?: IdleHandle;
  timeoutHandle?: TimerHandle;
  queuedAt: number;
  loading: boolean;
}

const DEFAULT_CACHE_LIMIT = 32;
const DEFAULT_MAX_CONCURRENT_IMAGES = 2;
const PRIORITY_RANK: Record<AssetReadinessPriority, number> = {
  'critical-now': 0,
  soon: 1,
  idle: 2,
  rare: 3,
};

function defaultImageCtor(): ImageCtor | undefined {
  return typeof Image !== 'undefined' ? Image : undefined;
}

function priorityBeats(next: AssetReadinessPriority, current: AssetReadinessPriority): boolean {
  return PRIORITY_RANK[next] < PRIORITY_RANK[current];
}

function highestPriority(a: AssetReadinessPriority, b: AssetReadinessPriority): AssetReadinessPriority {
  return priorityBeats(a, b) ? a : b;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requestIsLive(token: RequestToken): boolean {
  if (token.canceled) return false;
  if (token.signal?.aborted) return false;
  try {
    return !token.isStale?.();
  } catch {
    return false;
  }
}

function loadImage(img: HTMLImageElement, url: string): Promise<void> {
  if (typeof img.decode === 'function') {
    img.src = url;
    return img.decode();
  }

  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

export class AssetReadinessService {
  private readonly runtime: AssetReadinessRuntime;
  private readonly entries = new Map<string, ImageEntry>();
  private readonly decodedCache = new Map<string, HTMLImageElement>();
  private readonly warnedOptionalFailures = new Set<string>();
  private activeImages = 0;
  private sequence = 0;

  constructor(runtime: AssetReadinessRuntime = {}) {
    this.runtime = runtime;
  }

  requestImage(request: AssetReadinessRequest): AssetReadinessHandle {
    try {
      const token: RequestToken = {
        priority: request.priority,
        reason: request.reason,
        owner: request.owner,
        optional: Boolean(request.optional),
        signal: request.signal,
        isStale: request.isStale,
        canceled: false,
      };

      const entry = this.upsertEntry(request, token);
      if (!this.isRuntimeAvailable()) {
        return this.handleFor(request.url, token);
      }

      if (entry.state === 'ready') {
        this.touchCache(entry);
      } else if (entry.state === 'failed' || entry.state === 'evicted') {
        entry.state = 'queued';
        entry.error = undefined;
        entry.queuedAt = this.sequence++;
      } else if (entry.state === 'idle') {
        entry.state = 'queued';
        entry.queuedAt = this.sequence++;
      }

      this.schedule();
      return this.handleFor(request.url, token);
    } catch {
      return this.handleFor(request.url, { priority: request.priority, reason: request.reason, owner: request.owner, optional: false, canceled: true });
    }
  }

  getSnapshot(url: string): AssetReadinessSnapshot {
    try {
      const entry = this.entries.get(url);
      if (!entry) return { kind: 'image', url, state: 'idle' };
      return {
        kind: entry.kind,
        url: entry.url,
        state: entry.state,
        priority: entry.priority,
        reason: entry.reason,
        owner: entry.owner,
        optional: entry.optional,
        error: entry.error,
      };
    } catch {
      return { kind: 'image', url, state: 'idle' };
    }
  }

  whenReady(url: string, timeoutMs?: number): Promise<boolean> {
    try {
      const entry = this.entries.get(url);
      if (!entry) return Promise.resolve(false);
      if (entry.state === 'ready') return Promise.resolve(true);
      if (entry.state === 'failed' || entry.state === 'evicted') return Promise.resolve(false);

      return new Promise(resolve => {
        let settled = false;
        const finish = (ready: boolean) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) clear(timer);
          entry.waiters.delete(finish);
          resolve(ready);
        };
        const set = this.runtime.setTimeout ?? setTimeout;
        const clear = this.runtime.clearTimeout ?? clearTimeout;
        const timer = timeoutMs === undefined ? undefined : set(() => finish(false), timeoutMs);
        entry.waiters.add(finish);
      });
    } catch {
      return Promise.resolve(false);
    }
  }

  clear(): void {
    try {
      for (const entry of this.entries.values()) {
        this.cancelIdle(entry);
        entry.waiters.forEach(resolve => resolve(false));
        entry.waiters.clear();
      }
      this.entries.clear();
      this.decodedCache.clear();
      this.activeImages = 0;
    } catch {
      /* readiness must never escape into gameplay */
    }
  }

  private upsertEntry(request: AssetReadinessRequest, token: RequestToken): ImageEntry {
    const existing = this.entries.get(request.url);
    if (existing) {
      const promoted = priorityBeats(request.priority, existing.priority);
      existing.tokens.add(token);
      existing.priority = highestPriority(request.priority, existing.priority);
      if (promoted || existing.state !== 'loading') {
        existing.reason = request.reason;
        existing.owner = request.owner;
      }
      existing.optional = existing.optional || Boolean(request.optional);
      this.cancelIdle(existing);
      return existing;
    }

    const entry: ImageEntry = {
      kind: 'image',
      url: request.url,
      state: 'idle',
      priority: request.priority,
      reason: request.reason,
      owner: request.owner,
      optional: Boolean(request.optional),
      tokens: new Set([token]),
      waiters: new Set(),
      queuedAt: this.sequence++,
      loading: false,
    };
    this.entries.set(request.url, entry);
    return entry;
  }

  private handleFor(url: string, token: RequestToken): AssetReadinessHandle {
    return {
      url,
      cancel: () => {
        token.canceled = true;
        this.cancelIfStale(url);
      },
      snapshot: () => this.getSnapshot(url),
      whenReady: (timeoutMs?: number) => this.whenReady(url, timeoutMs),
    };
  }

  private cancelIfStale(url: string): void {
    try {
      const entry = this.entries.get(url);
      if (!entry || entry.state === 'ready' || entry.state === 'failed') return;
      if (this.liveTokens(entry).length > 0) return;
      this.cancelIdle(entry);
      entry.state = 'evicted';
      entry.loading = false;
      entry.waiters.forEach(resolve => resolve(false));
      entry.waiters.clear();
      this.schedule();
    } catch {
      /* readiness must never escape into gameplay */
    }
  }

  private schedule(): void {
    if (!this.isRuntimeAvailable()) return;

    for (const entry of this.entries.values()) {
      if (entry.state !== 'queued') continue;
      if (this.liveTokens(entry).length > 0) continue;
      entry.state = 'evicted';
      entry.waiters.forEach(resolve => resolve(false));
      entry.waiters.clear();
    }

    while (this.activeImages < this.maxConcurrentImages()) {
      const next = this.nextRunnable();
      if (!next) return;
      if (next.priority === 'idle' || next.priority === 'rare') {
        this.scheduleIdle(next);
        return;
      }
      this.start(next);
    }
  }

  private nextRunnable(): ImageEntry | undefined {
    return [...this.entries.values()]
      .filter(entry => entry.state === 'queued' && !entry.loading && !entry.idleHandle && !entry.timeoutHandle)
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.queuedAt - b.queuedAt)[0];
  }

  private scheduleIdle(entry: ImageEntry): void {
    if (entry.idleHandle || entry.timeoutHandle) return;
    const requestIdle = this.runtime.requestIdleCallback;
    if (requestIdle) {
      entry.idleHandle = requestIdle(() => {
        entry.idleHandle = undefined;
        if (this.activeImages < this.maxConcurrentImages()) this.start(entry);
        else this.schedule();
      });
      return;
    }

    const set = this.runtime.setTimeout ?? setTimeout;
    entry.timeoutHandle = set(() => {
      entry.timeoutHandle = undefined;
      if (this.activeImages < this.maxConcurrentImages()) this.start(entry);
      else this.schedule();
    }, 0);
  }

  private start(entry: ImageEntry): void {
    if (entry.state !== 'queued' || entry.loading) return;
    if (this.liveTokens(entry).length === 0) {
      entry.state = 'evicted';
      entry.waiters.forEach(resolve => resolve(false));
      entry.waiters.clear();
      return;
    }

    const ImageCtor = this.runtime.ImageCtor ?? defaultImageCtor();
    if (!ImageCtor) return;

    entry.state = 'loading';
    entry.loading = true;
    this.activeImages++;

    const img = new ImageCtor();
    entry.image = img;
    loadImage(img, entry.url)
      .then(() => this.markReady(entry, img))
      .catch(error => this.markFailed(entry, error))
      .finally(() => {
        this.activeImages = Math.max(0, this.activeImages - 1);
        entry.loading = false;
        this.schedule();
      });
  }

  private markReady(entry: ImageEntry, img: HTMLImageElement): void {
    try {
      if (this.liveTokens(entry).length === 0) {
        entry.state = 'evicted';
        entry.waiters.forEach(resolve => resolve(false));
        entry.waiters.clear();
        return;
      }
      entry.state = 'ready';
      entry.error = undefined;
      this.decodedCache.set(entry.url, img);
      this.enforceCacheLimit();
      entry.waiters.forEach(resolve => resolve(true));
      entry.waiters.clear();
    } catch {
      /* readiness must never escape into gameplay */
    }
  }

  private markFailed(entry: ImageEntry, error: unknown): void {
    try {
      if (this.liveTokens(entry).length === 0) {
        entry.state = 'evicted';
        entry.waiters.forEach(resolve => resolve(false));
        entry.waiters.clear();
        return;
      }
      entry.state = 'failed';
      entry.error = reasonFrom(error);
      if (entry.optional && !this.warnedOptionalFailures.has(entry.url)) {
        this.warnedOptionalFailures.add(entry.url);
        (this.runtime.warn ?? console.warn)('[asset:image] optional readiness failed', entry.url, entry.error);
      }
      entry.waiters.forEach(resolve => resolve(false));
      entry.waiters.clear();
    } catch {
      /* readiness must never escape into gameplay */
    }
  }

  private touchCache(entry: ImageEntry): void {
    if (!entry.image) return;
    this.decodedCache.delete(entry.url);
    this.decodedCache.set(entry.url, entry.image);
  }

  private enforceCacheLimit(): void {
    const limit = this.runtime.cacheLimit ?? DEFAULT_CACHE_LIMIT;
    while (this.decodedCache.size > limit) {
      const url = this.decodedCache.keys().next().value;
      if (!url) return;
      this.decodedCache.delete(url);
      const entry = this.entries.get(url);
      if (entry?.state === 'ready') entry.state = 'evicted';
    }
  }

  private liveTokens(entry: ImageEntry): RequestToken[] {
    return [...entry.tokens].filter(requestIsLive);
  }

  private cancelIdle(entry: ImageEntry): void {
    if (entry.idleHandle !== undefined) {
      this.runtime.cancelIdleCallback?.(entry.idleHandle);
      entry.idleHandle = undefined;
    }
    if (entry.timeoutHandle !== undefined) {
      (this.runtime.clearTimeout ?? clearTimeout)(entry.timeoutHandle);
      entry.timeoutHandle = undefined;
    }
  }

  private isRuntimeAvailable(): boolean {
    return Boolean(this.runtime.ImageCtor ?? defaultImageCtor());
  }

  private maxConcurrentImages(): number {
    return this.runtime.maxConcurrentImages ?? DEFAULT_MAX_CONCURRENT_IMAGES;
  }
}

export const assetReadinessService = new AssetReadinessService();

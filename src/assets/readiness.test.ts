import { describe, expect, it, vi } from 'vitest';
import { AssetReadinessService, type AssetReadinessRequest } from './readiness';

function baseRequest(url: string, overrides: Partial<AssetReadinessRequest> = {}): AssetReadinessRequest {
  return {
    kind: 'image',
    url,
    priority: 'soon',
    reason: 'test',
    owner: 'readiness-test',
    ...overrides,
  };
}

function deferred<T = void>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = value => res(value as T | PromiseLike<T>);
    reject = rej;
  });
  return { promise, resolve, reject };
}

function controllableDecodeImage() {
  const decodes: Array<ReturnType<typeof deferred<void>>> = [];
  const instances: Array<{ src: string; decode: ReturnType<typeof vi.fn> }> = [];
  class FakeImage {
    src = '';
    decode = vi.fn(() => {
      const next = deferred();
      decodes.push(next);
      return next.promise;
    });

    constructor() {
      instances.push(this);
    }
  }
  return { ImageCtor: FakeImage as unknown as typeof Image, instances, decodes };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AssetReadinessService image queue', () => {
  it('dedupes requests by URL and shares one image load', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor });

    const first = service.requestImage(baseRequest('/inventory/potion.png', { priority: 'soon' }));
    const second = service.requestImage(baseRequest('/inventory/potion.png', { priority: 'critical-now' }));

    expect(fake.instances).toHaveLength(1);
    expect(second.snapshot()).toMatchObject({ state: 'loading', priority: 'critical-now' });

    fake.decodes[0].resolve();
    await expect(first.whenReady()).resolves.toBe(true);
    expect(second.snapshot()).toMatchObject({ state: 'ready' });
  });

  it('promotes queued work when a higher-priority request arrives', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor, maxConcurrentImages: 1 });

    service.requestImage(baseRequest('/backgrounds/current.png', { priority: 'critical-now' }));
    service.requestImage(baseRequest('/backgrounds/next.png', { priority: 'rare', reason: 'prediction' }));
    const promoted = service.requestImage(baseRequest('/backgrounds/next.png', {
      priority: 'soon',
      reason: 'floor-transition',
      owner: 'CenterStage',
    }));

    expect(promoted.snapshot()).toMatchObject({
      state: 'queued',
      priority: 'soon',
      reason: 'floor-transition',
      owner: 'CenterStage',
    });

    fake.decodes[0].resolve();
    await settle();
    expect(fake.instances).toHaveLength(2);
    expect(fake.instances[1].src).toBe('/backgrounds/next.png');
  });

  it('uses decode when available and marks the image ready', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor });

    const handle = service.requestImage(baseRequest('/monsters/aquator.png'));
    expect(fake.instances[0].decode).toHaveBeenCalledTimes(1);
    expect(fake.instances[0].src).toBe('/monsters/aquator.png');

    fake.decodes[0].resolve();
    await expect(handle.whenReady()).resolves.toBe(true);
    expect(handle.snapshot()).toMatchObject({ state: 'ready' });
  });

  it('falls back to load events when decode is unavailable', async () => {
    const instances: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> = [];
    class LoadOnlyImage {
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        instances.push(this);
      }
    }
    const service = new AssetReadinessService({ ImageCtor: LoadOnlyImage as unknown as typeof Image });

    const handle = service.requestImage(baseRequest('/inventory/rations.png'));
    instances[0].onload?.();

    await expect(handle.whenReady()).resolves.toBe(true);
    expect(handle.snapshot()).toMatchObject({ state: 'ready' });
  });

  it('warns once for failed optional assets', async () => {
    const warn = vi.fn();
    class FailingImage {
      src = '';
      async decode() {
        throw new Error('missing optional art');
      }
    }
    const service = new AssetReadinessService({ ImageCtor: FailingImage as unknown as typeof Image, warn });

    await expect(service.requestImage(baseRequest('/backgrounds/legacy.png', { optional: true })).whenReady()).resolves.toBe(false);
    await expect(service.requestImage(baseRequest('/backgrounds/legacy.png', { optional: true })).whenReady()).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot('/backgrounds/legacy.png')).toMatchObject({
      state: 'failed',
      error: 'missing optional art',
    });
  });

  it('is inert when browser image APIs are unavailable', async () => {
    const service = new AssetReadinessService();
    const handle = service.requestImage(baseRequest('/inventory/no-browser.png', { priority: 'critical-now' }));

    expect(handle.snapshot()).toMatchObject({ state: 'idle' });
    await expect(handle.whenReady(1)).resolves.toBe(false);
  });

  it('does not load stale or canceled predictions', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor, maxConcurrentImages: 1 });

    service.requestImage(baseRequest('/backgrounds/current.png', { priority: 'critical-now' }));
    const stale = service.requestImage(baseRequest('/backgrounds/stale.png', {
      priority: 'soon',
      reason: 'stale prediction',
      isStale: () => true,
    }));
    const canceled = service.requestImage(baseRequest('/backgrounds/canceled.png', {
      priority: 'soon',
      reason: 'canceled prediction',
    }));
    canceled.cancel();

    expect(stale.snapshot()).toMatchObject({ state: 'evicted' });
    expect(canceled.snapshot()).toMatchObject({ state: 'evicted' });

    fake.decodes[0].resolve();
    await settle();
    expect(fake.instances).toHaveLength(1);
  });

  it('evicts a loading prediction when it is canceled before decode finishes', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor });

    const handle = service.requestImage(baseRequest('/backgrounds/loading-canceled.png', {
      priority: 'soon',
      reason: 'loading prediction',
    }));
    handle.cancel();
    fake.decodes[0].resolve();

    await settle();
    expect(handle.snapshot()).toMatchObject({ state: 'evicted' });
  });

  it('releases canceled ready-image request tokens so stale closures do not accumulate', async () => {
    const fake = controllableDecodeImage();
    const service = new AssetReadinessService({ ImageCtor: fake.ImageCtor });

    const first = service.requestImage(baseRequest('/inventory/reopen-art.png', {
      priority: 'critical-now',
      isStale: () => false,
    }));
    fake.decodes[0].resolve();
    await expect(first.whenReady()).resolves.toBe(true);
    first.cancel();

    const staleAfterReopen = vi.fn(() => true);
    const second = service.requestImage(baseRequest('/inventory/reopen-art.png', {
      priority: 'critical-now',
      isStale: staleAfterReopen,
    }));
    second.cancel();

    expect(staleAfterReopen).not.toHaveBeenCalled();
    expect(second.snapshot()).toMatchObject({ state: 'ready' });
  });

  it('uses requestIdleCallback only for idle-tier work', () => {
    const fake = controllableDecodeImage();
    const idleCallbacks: IdleRequestCallback[] = [];
    const service = new AssetReadinessService({
      ImageCtor: fake.ImageCtor,
      requestIdleCallback: callback => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      },
    });

    service.requestImage(baseRequest('/backgrounds/idle.png', { priority: 'idle' }));
    expect(fake.instances).toHaveLength(0);
    expect(idleCallbacks).toHaveLength(1);

    idleCallbacks[0]({ didTimeout: false, timeRemaining: () => 10 });
    expect(fake.instances).toHaveLength(1);
  });

  it('keeps rare-tier work lazy until promoted', () => {
    const fake = controllableDecodeImage();
    const idleCallbacks: IdleRequestCallback[] = [];
    const service = new AssetReadinessService({
      ImageCtor: fake.ImageCtor,
      requestIdleCallback: callback => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      },
    });

    const rare = service.requestImage(baseRequest('/backgrounds/rare.png', { priority: 'rare' }));

    expect(rare.snapshot()).toMatchObject({ state: 'idle', priority: 'rare' });
    expect(idleCallbacks).toHaveLength(0);
    expect(fake.instances).toHaveLength(0);

    const promoted = service.requestImage(baseRequest('/backgrounds/rare.png', { priority: 'soon' }));

    expect(promoted.snapshot()).toMatchObject({ state: 'loading', priority: 'soon' });
    expect(idleCallbacks).toHaveLength(0);
    expect(fake.instances).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_READINESS_BASELINES,
  assetDiagnosticRecords,
  assetDiagnosticsEnabled,
  diagnoseImageDecode,
  withAssetDecodeDiagnostics,
} from './diagnostics';

describe('asset readiness diagnostics gating', () => {
  it('is disabled by default in tests', () => {
    expect(assetDiagnosticsEnabled()).toBe(false);
  });

  it('honors explicit runtime gating for focused tests', () => {
    expect(assetDiagnosticsEnabled({ enabled: true })).toBe(true);
    expect(assetDiagnosticsEnabled({ enabled: false })).toBe(false);
  });

  it('captures baseline readiness targets for scheduler follow-up work', () => {
    expect(ASSET_READINESS_BASELINES.floorTransition).toContain('<200 ms');
    expect(ASSET_READINESS_BASELINES.inventory).toBe('opens immediately');
    expect(ASSET_READINESS_BASELINES.endRun).toContain('never waits indefinitely');
  });
});

describe('image decode diagnostics', () => {
  it('is inert when Image is unavailable', async () => {
    await expect(
      diagnoseImageDecode(
        { url: '/missing.png', owner: 'test', category: 'missing' },
        { enabled: true, ImageCtor: undefined },
      ),
    ).resolves.toBeNull();
  });

  it('does not throw when image decode fails', async () => {
    class FailingImage {
      src = '';
      async decode() {
        throw new Error('decode unavailable');
      }
    }

    const warn = vi.fn();
    await expect(
      diagnoseImageDecode(
        { url: '/bad.png', owner: 'test', category: 'portrait', id: 'bad' },
        { enabled: true, ImageCtor: FailingImage as unknown as typeof Image, now: () => 10, warn },
      ),
    ).resolves.toMatchObject({ ok: false, reason: 'decode unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('uses load events when image decode is missing', async () => {
    let assignedSrc = '';
    class LoadOnlyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        assignedSrc = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return assignedSrc;
      }
    }

    await expect(
      diagnoseImageDecode(
        { url: '/ok.png', owner: 'test', category: 'inventory', slowMs: 50 },
        { enabled: true, ImageCtor: LoadOnlyImage as unknown as typeof Image, now: () => 12 },
      ),
    ).resolves.toMatchObject({ ok: true, url: '/ok.png' });
    expect(assetDiagnosticRecords().at(-1)).toMatchObject({ ok: true, url: '/ok.png' });
  });
});

describe('audio decode diagnostics wrapper', () => {
  it('passes through values without logging when disabled', async () => {
    await expect(
      withAssetDecodeDiagnostics(
        { kind: 'audio', url: '/audio/clip.mp3', owner: 'test', category: 'sfx' },
        async () => 'decoded',
        { enabled: false },
      ),
    ).resolves.toBe('decoded');
  });

  it('records slow warnings but preserves successful decode values', async () => {
    let tick = 0;
    const warn = vi.fn();
    await expect(
      withAssetDecodeDiagnostics(
        { kind: 'audio', url: '/audio/slow.mp3', owner: 'test', category: 'sfx', slowMs: 5 },
        async () => 'decoded',
        { enabled: true, now: () => (tick++ === 0 ? 0 : 6), warn },
      ),
    ).resolves.toBe('decoded');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never replaces the original decode failure', async () => {
    const err = new Error('decode failed');
    await expect(
      withAssetDecodeDiagnostics(
        { kind: 'audio', url: '/audio/bad.mp3', owner: 'test', category: 'music' },
        async () => {
          throw err;
        },
        { enabled: true, now: () => 1, warn: () => { throw new Error('logger failed'); } },
      ),
    ).rejects.toBe(err);
  });
});

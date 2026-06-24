import { describe, it, expect } from 'vitest';
import {
  SETTINGS_DEFAULTS,
  loadSettings,
  saveSettings,
  updateSettings,
  type Settings,
} from './settings';

/** Minimal in-memory `Storage` so settings can be tested in the `node` vitest
 *  env without jsdom. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

const KEY = 'rogue_settings';

/** Write a raw v1 blob (bypassing the typed API) to simulate an old/partial
 *  stored shape. */
function seed(backend: Storage, data: unknown): void {
  backend.setItem(KEY, JSON.stringify({ v: 1, data }));
}

describe('settings store', () => {
  it('returns defaults when the backend is empty', () => {
    const backend = new MemoryStorage();
    expect(loadSettings(backend)).toEqual(SETTINGS_DEFAULTS);
  });

  it('round-trips a full settings value', () => {
    const backend = new MemoryStorage();
    const value: Settings = {
      playerName: 'Grok',
      lastClass: 'Warrior',
      boardSize: 'huge',
      hasSeenIntro: true,
      audio: { muted: true, volume: 0.5, musicMuted: true, musicVolume: 0.6 },
    };
    saveSettings(value, backend);
    expect(loadSettings(backend)).toEqual(value);
  });

  it('merges a partial stored blob with defaults (forward-compat)', () => {
    const backend = new MemoryStorage();
    seed(backend, { playerName: 'X' });
    expect(loadSettings(backend)).toEqual({
      playerName: 'X',
      lastClass: 'Rogue',
      boardSize: 'classic',
      hasSeenIntro: false,
      audio: { muted: false, volume: 1, musicMuted: false, musicVolume: 0.4 },
    });
  });

  it('merges nested audio against defaults when a sub-field is missing', () => {
    const backend = new MemoryStorage();
    seed(backend, { audio: { muted: true } });
    expect(loadSettings(backend)).toEqual({
      playerName: 'The Wretch',
      lastClass: 'Rogue',
      boardSize: 'classic',
      hasSeenIntro: false,
      audio: { muted: true, volume: 1, musicMuted: false, musicVolume: 0.4 },
    });
  });

  it('fills new music audio fields against an older blob that predates them', () => {
    const backend = new MemoryStorage();
    seed(backend, { audio: { muted: true, volume: 0.5 } });
    expect(loadSettings(backend).audio).toEqual({
      muted: true,
      volume: 0.5,
      musicMuted: false,
      musicVolume: 0.4,
    });
  });

  it('updateSettings preserves sibling fields when changing audio.volume', () => {
    const backend = new MemoryStorage();
    saveSettings(
      {
        playerName: 'Mira',
        lastClass: 'Mage',
        boardSize: 'large',
        hasSeenIntro: false,
        audio: { muted: true, volume: 0.2, musicMuted: false, musicVolume: 0.4 },
      },
      backend,
    );
    const next = updateSettings({ audio: { volume: 0.8 } }, backend);
    expect(next).toEqual({
      playerName: 'Mira',
      lastClass: 'Mage',
      boardSize: 'large',
      hasSeenIntro: false,
      audio: { muted: true, volume: 0.8, musicMuted: false, musicVolume: 0.4 },
    });
    expect(loadSettings(backend)).toEqual(next);
  });

  it('updateSettings can change only music fields and keep sfx audio intact', () => {
    const backend = new MemoryStorage();
    saveSettings(
      {
        playerName: 'Mira',
        lastClass: 'Mage',
        boardSize: 'large',
        hasSeenIntro: false,
        audio: { muted: false, volume: 0.9, musicMuted: false, musicVolume: 0.4 },
      },
      backend,
    );
    const next = updateSettings({ audio: { musicMuted: true } }, backend);
    expect(next.audio).toEqual({ muted: false, volume: 0.9, musicMuted: true, musicVolume: 0.4 });
  });

  it('updateSettings changing playerName keeps audio intact', () => {
    const backend = new MemoryStorage();
    saveSettings(
      {
        playerName: 'Mira',
        lastClass: 'Mage',
        boardSize: 'large',
        hasSeenIntro: true,
        audio: { muted: true, volume: 0.2, musicMuted: true, musicVolume: 0.5 },
      },
      backend,
    );
    const next = updateSettings({ playerName: 'Renamed' }, backend);
    expect(next).toEqual({
      playerName: 'Renamed',
      lastClass: 'Mage',
      boardSize: 'large',
      hasSeenIntro: true,
      audio: { muted: true, volume: 0.2, musicMuted: true, musicVolume: 0.5 },
    });
    expect(loadSettings(backend)).toEqual(next);
  });

  it('updateSettings on an empty backend fills from defaults', () => {
    const backend = new MemoryStorage();
    const next = updateSettings({ playerName: 'First' }, backend);
    expect(next).toEqual({
      playerName: 'First',
      lastClass: 'Rogue',
      boardSize: 'classic',
      hasSeenIntro: false,
      audio: { muted: false, volume: 1, musicMuted: false, musicVolume: 0.4 },
    });
  });
});

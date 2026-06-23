/* Settings store — player-facing preferences (name, last-used class, audio).
 *
 * Settings policy is forward-compatible: unknown/old stored shapes merge with
 * defaults so a newly-added field (including nested `audio.*`) always resolves
 * against an old blob. This is the OPPOSITE of the save-game policy, which
 * treats a version mismatch as discardable.
 *
 * Built on the generic `defineStore` adapter; backend is resolved the same way
 * (`resolveBackend()` unless an explicit backend is injected for tests).
 */

import { defineStore, resolveBackend } from './store';

export interface Settings {
  playerName: string;
  lastClass: string;
  audio: {
    muted: boolean;
    volume: number;
    /** Background music has its own mute/volume, independent of sound effects. */
    musicMuted: boolean;
    musicVolume: number;
  };
}

export const SETTINGS_DEFAULTS: Settings = {
  playerName: 'The Wretch',
  lastClass: 'Rogue',
  audio: { muted: false, volume: 1, musicMuted: false, musicVolume: 0.4 },
};

function store(backend?: Storage | null) {
  return defineStore<Settings>({
    key: 'rogue_settings',
    version: 1,
    defaults: SETTINGS_DEFAULTS,
    backend: backend !== undefined ? backend : resolveBackend(),
  });
}

/** Deep-merge a (possibly partial/old) stored blob with the defaults so that
 *  newly-added fields — including nested `audio.*` — resolve against old data. */
function mergeWithDefaults(stored: Partial<Settings> | null | undefined): Settings {
  return {
    ...SETTINGS_DEFAULTS,
    ...stored,
    audio: { ...SETTINGS_DEFAULTS.audio, ...(stored?.audio ?? {}) },
  };
}

export function loadSettings(backend?: Storage | null): Settings {
  const stored = store(backend).load() as Partial<Settings>;
  return mergeWithDefaults(stored);
}

export function saveSettings(value: Settings, backend?: Storage | null): void {
  store(backend).save(value);
}

/** A patch may set any top-level field and any subset of `audio.*`. */
export type SettingsPatch = Partial<Omit<Settings, 'audio'>> & { audio?: Partial<Settings['audio']> };

export function updateSettings(patch: SettingsPatch, backend?: Storage | null): Settings {
  const current = loadSettings(backend);
  const next: Settings = {
    ...current,
    ...patch,
    audio: { ...current.audio, ...(patch.audio ?? {}) },
  };
  saveSettings(next, backend);
  return next;
}

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveClipId, resolveCue, SOUND_ASSETS, DEATH_BY_ARCHETYPE, MUSIC_TRACKS,
  VOICE_ASSETS, voiceUrl, AUDIO_BASE,
} from './manifest';
import { SAMPLE_SOUND_EVENTS } from './events';
import type { SoundEvent } from './events';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const audioPath = (rel: string) => join(repoRoot, 'public', 'audio', rel);

const death = (over: Partial<Extract<SoundEvent, { type: 'combat.death' }>>): SoundEvent => ({
  type: 'combat.death', monsterId: 'x', archetype: 'default', ...over,
});

describe('death cue cascade', () => {
  it('resolves a per-archetype clip', () => {
    expect(resolveClipId(death({ archetype: 'trickster' }))).toBe('death-trickster');
    expect(resolveClipId(death({ archetype: 'brute' }))).toBe('death-brute');
    expect(resolveClipId(death({ archetype: 'bat' }))).toBe('death-bat');
  });

  it('falls through to the boss clip via special when archetype has no clip', () => {
    expect(resolveClipId(death({ archetype: 'boss-swiper', special: 'boss' }))).toBe('death-boss');
    expect(resolveClipId(death({ archetype: 'default', special: 'hero' }))).toBe('death-boss');
  });

  it('falls through to the generic default for plain monsters', () => {
    expect(resolveClipId(death({ archetype: 'default' }))).toBe('death-default');
    expect(resolveClipId(death({ archetype: 'unknown-archetype' }))).toBe('death-default');
  });
});

describe('payload-based routing', () => {
  it('routes combat.hit by who is hit', () => {
    expect(resolveClipId({ type: 'combat.hit', actor: 'player', target: 'monster' })).toBe('combat-hit');
    expect(resolveClipId({ type: 'combat.hit', actor: 'monster', target: 'player' })).toBe('player-hit');
  });

  it('routes item pickups and consumption by kind', () => {
    expect(resolveClipId({ type: 'item.pickup', kind: 'gold' })).toBe('item-gold');
    expect(resolveClipId({ type: 'item.pickup', kind: 'gear' })).toBe('item-pickup');
    expect(resolveClipId({ type: 'item.consume', kind: 'potion' })).toBe('consume-potion');
    expect(resolveClipId({ type: 'item.consume', kind: 'food' })).toBe('consume-food');
  });

  it('routes stairs by direction', () => {
    expect(resolveClipId({ type: 'map.stairs', dir: 'down' })).toBe('stairs-down');
    expect(resolveClipId({ type: 'map.stairs', dir: 'up' })).toBe('stairs-up');
  });

  it('routes only multi-step run movement to the subtle whoosh cue', () => {
    expect(resolveClipId({ type: 'movement.run', steps: 1 })).toBeNull();
    expect(resolveClipId({ type: 'movement.run', steps: 3 })).toBe('movement-run');
  });
});

describe('manifest integrity', () => {
  it('resolveCue returns an asset whose id matches its key', () => {
    const cue = resolveCue({ type: 'map.secretReveal' });
    expect(cue?.id).toBe('secret-reveal');
    expect(cue?.variants.length).toBeGreaterThan(0);
  });

  it('every resolvable clip id exists in SOUND_ASSETS', () => {
    const ids = [
      'combat-swing', 'combat-hit', 'player-hit', 'combat-miss', 'death-default', 'death-boss',
      'player-levelup', 'player-lowhealth', 'player-criticalhealth', 'player-death', 'victory-amulet',
      'hunger-hungry', 'hunger-nearstarved', 'hunger-fatigued', 'hunger-starving', 'hunger-starvetick',
      'survival-dualwarning',
      'equip-weapon', 'equip-armor', 'equip-unequip', 'equip-rejected',
      'item-pickup', 'item-gold', 'consume-potion', 'consume-food',
      'stairs-down', 'stairs-up', 'secret-reveal', 'movement-run',
    ];
    for (const id of ids) expect(SOUND_ASSETS[id], id).toBeDefined();
  });

  it('routes the final victory event to the amulet sting', () => {
    expect(resolveClipId({ type: 'game.victory' })).toBe('victory-amulet');
  });

  it('every per-archetype death clip resolves to a real asset', () => {
    for (const [archetype, clipId] of Object.entries(DEATH_BY_ARCHETYPE)) {
      expect(SOUND_ASSETS[clipId as string], `${archetype} -> ${clipId}`).toBeDefined();
    }
  });

  it('every music context maps to a real .mp3 path', () => {
    for (const [ctx, file] of Object.entries(MUSIC_TRACKS)) {
      expect(file, ctx).toMatch(/^music\/.+\.mp3$/);
    }
    expect(MUSIC_TRACKS.victory).toBe('music/victory-credits-01.mp3');
  });
});

/*
 * Guard: every audio file the manifest references must exist on disk. The
 * resolution tests above prove routing is correct; these prove the clip a route
 * lands on is actually shippable. `node scripts/audit-sounds.mjs` is the same
 * check with a fuller report (orphans + silent-event warnings).
 */
describe('audio files on disk', () => {
  it('every SFX variant exists', () => {
    const missing = Object.values(SOUND_ASSETS)
      .flatMap(a => a.variants)
      .filter(rel => !existsSync(audioPath(rel)));
    expect(missing, 'missing sfx — see design/implemented/sound_effect_asset_prompts.md').toEqual([]);
  });

  it('every music bed exists', () => {
    const missing = Object.values(MUSIC_TRACKS).filter(rel => !existsSync(audioPath(rel)));
    expect(missing, 'missing music — see design/implemented/music_generation.md').toEqual([]);
  });

  it('every voice clip exists and voiceUrl resolves under AUDIO_BASE', () => {
    const missing = Object.values(VOICE_ASSETS).filter(a => !existsSync(audioPath(a.file)));
    expect(missing, 'missing voice — see design/implemented/intro_narration_prompt.md').toEqual([]);
    expect(voiceUrl('intro-warning')).toBe(`${AUDIO_BASE}voice/intro-warning-01.mp3`);
  });
});

describe('sample event catalogue', () => {
  it('has a sample for every event type and resolution never throws', () => {
    // `as const satisfies` already enforces exhaustiveness at compile time;
    // this keeps the invariant loud at runtime and exercises every route.
    const keys = Object.keys(SAMPLE_SOUND_EVENTS);
    expect(keys.length).toBeGreaterThanOrEqual(26);
    for (const sample of Object.values(SAMPLE_SOUND_EVENTS)) {
      expect(() => resolveClipId(sample as SoundEvent)).not.toThrow();
    }
  });
});

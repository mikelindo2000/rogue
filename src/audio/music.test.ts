import { describe, expect, it } from 'vitest';
import { MusicService, createMusicService } from './music';
import { MUSIC_TRACKS, type MusicContextId } from './manifest';

// No Web Audio in the test env, so the service is inert. These cover the parts
// that must hold regardless: settings clamping, context bookkeeping, never-throw.

describe('MusicService settings', () => {
  it('clamps volume and tracks mute', () => {
    const m = new MusicService({ muted: false, volume: 9 });
    expect(m.currentVolume).toBe(1);
    m.setVolume(-2);
    expect(m.currentVolume).toBe(0);
    m.setConfig({ volume: 0.4, muted: true });
    expect(m.currentVolume).toBeCloseTo(0.4);
    expect(m.isMuted).toBe(true);
  });
});

describe('MusicService context selection', () => {
  it('records the desired context before unlock and ignores repeats', () => {
    const m = createMusicService({ muted: false, volume: 0.4 });
    expect(m.currentContext).toBe(null);
    m.setContext('explore-shallow');
    expect(m.currentContext).toBe('explore-shallow');
    m.setContext('explore-shallow'); // no-op, same id
    expect(m.currentContext).toBe('explore-shallow');
    m.setContext('boss');
    expect(m.currentContext).toBe('boss');
  });

  it('stop() clears the desired context', () => {
    const m = createMusicService({ muted: false, volume: 0.4 });
    m.setContext('safe');
    m.stop();
    expect(m.currentContext).toBe(null);
  });

  it('never throws across unlock/setContext/stop when Web Audio is absent', () => {
    const m = createMusicService({ muted: false, volume: 0.5 });
    expect(() => {
      m.unlock();
      m.setContext('explore-deep');
      m.setContext('gameover');
      m.setMuted(true);
      m.setVolume(0.2);
      m.stop();
    }).not.toThrow();
    expect(m.isUnlocked).toBe(true);
  });
});

describe('music track registry', () => {
  it('has a file for every context id', () => {
    const ids: MusicContextId[] = ['explore-shallow', 'explore-deep', 'boss', 'safe', 'gameover'];
    for (const id of ids) {
      expect(MUSIC_TRACKS[id], id).toMatch(/^music\/.+\.mp3$/);
    }
  });
});

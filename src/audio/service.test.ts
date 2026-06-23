import { describe, expect, it } from 'vitest';
import { AudioService, createAudioService } from './service';

// In the test environment there is no Web Audio implementation, so the service
// is an inert no-op. These tests cover the parts that must work regardless:
// settings clamping, mute state, and the never-throw contract.

describe('AudioService settings', () => {
  it('clamps the initial volume to 0..1', () => {
    expect(new AudioService({ muted: false, volume: 5 }).currentVolume).toBe(1);
    expect(new AudioService({ muted: false, volume: -1 }).currentVolume).toBe(0);
    expect(new AudioService({ muted: false, volume: 0.4 }).currentVolume).toBeCloseTo(0.4);
  });

  it('clamps volume on update and tracks mute', () => {
    const a = createAudioService({ muted: false, volume: 0.7 });
    a.setVolume(2);
    expect(a.currentVolume).toBe(1);
    a.setVolume(-3);
    expect(a.currentVolume).toBe(0);
    expect(a.isMuted).toBe(false);
    a.setMuted(true);
    expect(a.isMuted).toBe(true);
  });

  it('setConfig applies a partial update', () => {
    const a = createAudioService({ muted: false, volume: 0.5 });
    a.setConfig({ muted: true });
    expect(a.isMuted).toBe(true);
    expect(a.currentVolume).toBeCloseTo(0.5);
    a.setConfig({ volume: 0.9 });
    expect(a.currentVolume).toBeCloseTo(0.9);
  });
});

describe('AudioService never throws into gameplay', () => {
  it('emit before unlock is a safe no-op', () => {
    const a = createAudioService({ muted: false, volume: 1 });
    expect(() => a.emit({ type: 'combat.hit', actor: 'player', target: 'monster' })).not.toThrow();
  });

  it('unlock and emit are safe when Web Audio is unavailable', () => {
    const a = createAudioService({ muted: false, volume: 1 });
    expect(() => a.unlock()).not.toThrow();
    expect(a.isUnlocked).toBe(true);
    expect(() => a.emit({ type: 'map.secretReveal' })).not.toThrow();
    expect(() => a.test()).not.toThrow();
  });
});

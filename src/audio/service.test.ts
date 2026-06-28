import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioService, createAudioService } from './service';
import { __resetAudioContextForTest } from './context';
import { ui } from '../ui/store.svelte';

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

describe('AudioService unlock timing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __resetAudioContextForTest();
  });

  it('schedules events immediately while the first gesture is still resuming audio', async () => {
    __resetAudioContextForTest();
    let resolveResume!: () => void;
    let starts = 0;

    class FakeAudioContext {
      state: AudioContextState = 'suspended';
      currentTime = 0;
      destination = {};

      createGain() {
        const node = {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
        };
        return node;
      }

      createBufferSource() {
        const node = {
          buffer: null,
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
          start: vi.fn(() => { starts++; }),
          onended: null,
        };
        return node;
      }

      resume() {
        return new Promise<void>(resolve => {
          resolveResume = () => {
            this.state = 'running';
            resolve();
          };
        });
      }

      async decodeAudioData() {
        return {} as AudioBuffer;
      }
    }

    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    })));

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();
    expect(audio.isUnlocked).toBe(true);
    (audio as unknown as { buffers: Map<string, AudioBuffer> }).buffers.set('sfx/item-pickup-01.mp3', {} as AudioBuffer);

    audio.emit({ type: 'item.pickup', kind: 'gear' });
    expect(starts).toBe(1);
    expect((audio as unknown as { pendingEvents: unknown[] }).pendingEvents).toHaveLength(0);

    resolveResume();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(starts).toBe(1);
  });

  it('uses an immediate HTML audio fallback while a Web Audio buffer is still decoding', async () => {
    __resetAudioContextForTest();
    let htmlPlays = 0;
    let fetches = 0;

    class FakeAudio {
      preload = '';
      volume = 1;
      currentTime = 0;
      constructor(public src = '') {}
      load() {}
      cloneNode() {
        return new FakeAudio(this.src);
      }
      async play() {
        htmlPlays++;
      }
    }

    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 1;
      destination = {};

      createGain() {
        const node = {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
        };
        return node;
      }

      createBufferSource() {
        const node = {
          buffer: null,
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
          start: vi.fn(),
          onended: null,
        };
        return node;
      }

      async resume() {}

      async decodeAudioData() {
        return {} as AudioBuffer;
      }
    }

    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetches++;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      };
    }));

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    audio.emit({ type: 'combat.hit', actor: 'player', target: 'monster', damage: 3 });

    expect(htmlPlays).toBe(1);
    expect(fetches).toBeGreaterThan(0);
  });

  it('applies cooldowns to repeated HTML fallback plays while decoding', async () => {
    __resetAudioContextForTest();
    let htmlPlays = 0;

    class FakeAudio {
      preload = '';
      volume = 1;
      currentTime = 0;
      constructor(public src = '') {}
      load() {}
      cloneNode() {
        return new FakeAudio(this.src);
      }
      async play() {
        htmlPlays++;
      }
    }

    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 10;
      destination = {};

      createGain() {
        const node = {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
        };
        return node;
      }

      createBufferSource() {
        const node = {
          buffer: null,
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
          start: vi.fn(),
          onended: null,
        };
        return node;
      }

      async resume() {}

      async decodeAudioData() {
        return {} as AudioBuffer;
      }
    }

    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    })));

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    audio.emit({ type: 'combat.hit', actor: 'player', target: 'monster', damage: 3 });
    audio.emit({ type: 'combat.hit', actor: 'player', target: 'monster', damage: 3 });

    expect(htmlPlays).toBe(1);
  });

  it('schedules delayed events using setTimeout when delayMs is provided', () => {
    vi.useFakeTimers();
    __resetAudioContextForTest();

    class FakeAudio {
      preload = '';
      volume = 1;
      currentTime = 0;
      constructor(public src = '') {}
      load() {}
      cloneNode() {
        return new FakeAudio(this.src);
      }
      async play() {}
    }

    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 10;
      destination = {};

      createGain() {
        const node = {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
        };
        return node;
      }

      createBufferSource() {
        const node = {
          buffer: null,
          connect: vi.fn(() => node),
          disconnect: vi.fn(),
          start: vi.fn(),
          onended: null,
        };
        return node;
      }

      async resume() {}

      async decodeAudioData() {
        return {} as AudioBuffer;
      }
    }

    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    const playEventSpy = vi.spyOn(audio as any, 'playEvent');

    audio.emit({ type: 'item.pickup', kind: 'gold', delayMs: 150 });

    expect(playEventSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(playEventSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(playEventSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('AudioService sound logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __resetAudioContextForTest();
  });

  it('populates ui.debugMessages when ui.showSoundDebug is true', () => {
    ui.showSoundDebug = true;
    ui.debugMessages = [];

    class FakeAudio {
      cloneNode() {
        return {
          play: async () => {},
          onended: null,
        };
      }
    }
    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 0;
      destination = {};
      createGain() {
        return {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn((dest) => dest),
        };
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    audio.emit({ type: 'item.pickup', kind: 'gold' });

    expect(ui.debugMessages).toHaveLength(1);
    expect(ui.debugMessages[0].text).toBe('item-gold'); // resolved cue for gold pickup is item-gold
  });

  it('does not populate ui.debugMessages when ui.showSoundDebug is false', () => {
    ui.showSoundDebug = false;
    ui.debugMessages = [];

    class FakeAudio {
      cloneNode() {
        return {
          play: async () => {},
          onended: null,
        };
      }
    }
    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 0;
      destination = {};
      createGain() {
        return {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn((dest) => dest),
        };
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    audio.emit({ type: 'item.pickup', kind: 'gold' });

    expect(ui.debugMessages).toHaveLength(0);
  });

  it('de-duplicates consecutive identical sound events and increments count', () => {
    ui.showSoundDebug = true;
    ui.debugMessages = [];

    class FakeAudio {
      cloneNode() {
        return {
          play: async () => {},
          onended: null,
        };
      }
    }
    class FakeAudioContext {
      state: AudioContextState = 'running';
      currentTime = 0;
      destination = {};
      createGain() {
        return {
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn((dest) => dest),
        };
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });

    const audio = createAudioService({ muted: false, volume: 1 });
    audio.unlock();

    audio.emit({ type: 'item.pickup', kind: 'gold' });
    // Increment fake context currentTime (in seconds) to bypass cooldown
    if (audio['ctx']) (audio['ctx'] as any).currentTime += 0.1; // 100ms
    audio.emit({ type: 'item.pickup', kind: 'gold' });

    expect(ui.debugMessages).toHaveLength(1);
    expect(ui.debugMessages[0].text).toBe('item-gold');
    expect(ui.debugMessages[0].count).toBe(2);
  });
});


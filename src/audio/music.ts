/**
 * Background music runtime. A single looping bed at a time, switched by coarse
 * game-state context and crossfaded on change. Separate from the SFX service —
 * its own gain node, its own mute/volume — but shares the same AudioContext so
 * both unlock together and mix through one graph.
 *
 * Like the SFX service it never throws into gameplay and is an inert no-op when
 * Web Audio is unavailable (tests / SSR). Music is presentation only.
 */
import { ensureAudioContext } from './context';
import { AUDIO_BASE, MUSIC_TRACKS, type MusicContextId } from './manifest';

export interface MusicConfig {
  muted: boolean;
  volume: number; // 0..1
}

const CROSSFADE_S = 1.5;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

interface Voice {
  id: MusicContextId;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class MusicService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  private muted: boolean;
  private volume: number;

  /** The context the game last asked for (drives play once unlocked). */
  private desiredId: MusicContextId | null = null;
  private current: Voice | null = null;

  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly warned = new Set<string>();
  private resumePromise: Promise<void> | null = null;
  /** Guards against a fast A→B→A switch resolving stale loads out of order. */
  private switchToken = 0;

  constructor(config: MusicConfig) {
    this.muted = config.muted;
    this.volume = clamp01(config.volume);
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }
  get currentContext(): MusicContextId | null {
    return this.desiredId;
  }
  get isMuted(): boolean {
    return this.muted;
  }
  get currentVolume(): number {
    return this.volume;
  }

  // --- lifecycle ---------------------------------------------------------

  unlock(): void {
    if (this.unlocked) {
      this.resumeAndSwitch();
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) {
      this.unlocked = true;
      return;
    }
    try {
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      this.master.connect(ctx.destination);
      this.unlocked = true;
      this.resumeAndSwitch();
    } catch {
      this.ctx = null;
      this.master = null;
      this.unlocked = true;
    }
  }

  private resumeAndSwitch(): void {
    const ctx = this.ctx;
    if (!ctx?.resume) {
      this.switchToDesiredIfNeeded();
      return;
    }
    this.resumePromise = ctx.resume()
      .then(() => {
        this.resumePromise = null;
        this.switchToDesiredIfNeeded();
      })
      .catch(() => {
        this.resumePromise = null;
      });
  }

  private switchToDesiredIfNeeded(): void {
    if (this.desiredId === this.current?.id) return;
    if (this.desiredId === null && this.current === null) return;
    this.switchTo(this.desiredId);
  }

  // --- context selection -------------------------------------------------

  /** Request the bed for the current game state. No-op if already current. */
  setContext(id: MusicContextId | null): void {
    if (id === this.desiredId) return;
    this.desiredId = id;
    if (!this.unlocked) return;
    if (this.resumePromise || this.ctx?.state === 'suspended') {
      this.resumeAndSwitch();
      return;
    }
    this.switchTo(id);
  }

  private switchTo(id: MusicContextId | null): void {
    if (!this.ctx || !this.master) return;
    this.fadeOutCurrent();
    if (id === null) return;
    const file = MUSIC_TRACKS[id];
    if (!file) return;
    const token = ++this.switchToken;
    void this.load(file).then((buf) => {
      // Ignore if a newer switch superseded this one, or state changed.
      if (!buf || token !== this.switchToken || this.desiredId !== id) return;
      this.startTrack(id, buf);
    });
  }

  private startTrack(id: MusicContextId, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.resumePromise || ctx.state === 'suspended') {
      this.resumeAndSwitch();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(master);
    const t = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(1, t + CROSSFADE_S);
    src.start();
    this.current = { id, source: src, gain };
  }

  private fadeOutCurrent(): void {
    const cur = this.current;
    const ctx = this.ctx;
    if (!cur || !ctx) return;
    this.current = null;
    // Disconnect the faded voice once it stops so nodes don't accumulate over a
    // long session of context switches.
    cur.source.onended = () => {
      try {
        cur.source.disconnect();
        cur.gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    const t = ctx.currentTime;
    try {
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
      cur.source.stop(t + CROSSFADE_S + 0.05);
    } catch {
      try {
        cur.source.stop();
      } catch {
        /* ignore */
      }
    }
  }

  /** Stop music entirely (keeps settings). */
  stop(): void {
    this.desiredId = null;
    this.fadeOutCurrent();
  }

  // --- settings ----------------------------------------------------------

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }
  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    this.applyGain();
  }
  setConfig(config: Partial<MusicConfig>): void {
    if (config.muted !== undefined) this.muted = config.muted;
    if (config.volume !== undefined) this.volume = clamp01(config.volume);
    this.applyGain();
  }

  private effectiveGain(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyGain(): void {
    if (this.master && this.ctx) {
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(this.effectiveGain(), t + 0.15);
      } catch {
        g.value = this.effectiveGain();
      }
    }
  }

  // --- loading -----------------------------------------------------------

  private load(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) return Promise.resolve(cached);
    const inflight = this.loading.get(file);
    if (inflight) return inflight;

    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);

    const p = (async () => {
      try {
        const res = await fetch(AUDIO_BASE + file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        this.buffers.set(file, buf);
        return buf;
      } catch (err) {
        if (!this.warned.has(file)) {
          this.warned.add(file);
          console.warn(`[music] failed to load ${file}; skipping it.`, err);
        }
        return null;
      } finally {
        this.loading.delete(file);
      }
    })();
    this.loading.set(file, p);
    return p;
  }
}

export function createMusicService(config: MusicConfig): MusicService {
  return new MusicService(config);
}

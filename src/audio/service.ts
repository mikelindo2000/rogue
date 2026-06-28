/**
 * Browser audio runtime. Implements SoundSink so it drops straight into
 * `new GameEngine(ui, audio)`. Responsibilities: lazy-unlock on first user
 * gesture, preload core clips, global volume + mute via a master gain node,
 * per-asset cooldown + polyphony caps, randomized variants, and — above all —
 * never throw into gameplay. A failed asset warns once and then goes silent.
 *
 * Designed to be inert (a safe no-op) when Web Audio is unavailable (tests,
 * SSR), so emit() is always safe to call.
 */
import type { SoundEvent, SoundSink } from './events';
import { AUDIO_BASE, SOUND_ASSETS, resolveCue, type SoundAsset } from './manifest';
import { ensureAudioContext } from './context';
import { withAssetDecodeDiagnostics } from '../assets/diagnostics';

export interface AudioServiceConfig {
  muted: boolean;
  volume: number; // 0..1
}

const GLOBAL_MAX_VOICES = 12;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export class AudioService implements SoundSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  private muted: boolean;
  private volume: number;

  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly htmlFallbacks = new Map<string, HTMLAudioElement>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly warned = new Set<string>();
  private readonly pendingEvents: SoundEvent[] = [];
  private resumePromise: Promise<void> | null = null;
  private activeVoices = 0;
  /** Live voice count per asset id, for per-asset maxVoices enforcement. */
  private readonly assetVoices = new Map<string, number>();

  constructor(config: AudioServiceConfig) {
    this.muted = config.muted;
    this.volume = clamp01(config.volume);
    this.prewarmHtmlFallbacks();
  }

  // --- lifecycle ---------------------------------------------------------

  /** Whether audio has been unlocked by a user gesture yet. */
  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Unlock audio from a trusted user gesture (first keydown/pointerdown).
   * Safe to call repeatedly. Creates the AudioContext lazily so we never trip
   * the browser autoplay policy before the player has interacted.
   */
  unlock(): void {
    if (this.unlocked) {
      // A suspended context (tab backgrounded) can be resumed here too.
      this.resumeAndFlush();
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) {
      this.unlocked = true; // nothing to play, but don't keep retrying
      this.pendingEvents.length = 0;
      return;
    }
    try {
      this.ctx = ctx;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
      this.resumeAndFlush();
      this.preloadCore();
    } catch {
      // Web Audio unavailable/blocked — stay a silent no-op.
      this.ctx = null;
      this.master = null;
      this.unlocked = true;
      this.pendingEvents.length = 0;
    }
  }

  private resumeAndFlush(): void {
    const ctx = this.ctx;
    if (!ctx?.resume) {
      this.flushPendingEvents();
      return;
    }
    this.resumePromise = ctx.resume()
      .then(() => {
        this.resumePromise = null;
        this.flushPendingEvents();
      })
      .catch(() => {
        this.resumePromise = null;
      });
  }

  private preloadCore(): void {
    for (const asset of Object.values(SOUND_ASSETS)) {
      if (asset.preload) for (const v of asset.variants) void this.load(v);
    }
  }

  private prewarmHtmlFallbacks(): void {
    if (typeof Audio === 'undefined') return;
    for (const asset of Object.values(SOUND_ASSETS)) {
      if (!asset.preload) continue;
      for (const file of asset.variants) this.htmlFallbackFor(file);
    }
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

  /** Apply both at once (e.g. from a settings save). */
  setConfig(config: Partial<AudioServiceConfig>): void {
    if (config.muted !== undefined) this.muted = config.muted;
    if (config.volume !== undefined) this.volume = clamp01(config.volume);
    this.applyGain();
  }

  get isMuted(): boolean {
    return this.muted;
  }
  get currentVolume(): number {
    return this.volume;
  }

  private effectiveGain(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyGain(): void {
    if (this.master && this.ctx) {
      // Short ramp avoids clicks on mute/volume changes.
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(this.effectiveGain(), t + 0.03);
      } catch {
        g.value = this.effectiveGain();
      }
    }
  }

  // --- emission ----------------------------------------------------------

  /** SoundSink. Resolve the event to an asset and play it; never throws. */
  emit(event: SoundEvent): void {
    if (event.delayMs && event.delayMs > 0) {
      const { delayMs, ...rest } = event;
      setTimeout(() => {
        this.emit(rest as SoundEvent);
      }, delayMs);
      return;
    }
    if (!this.unlocked) {
      this.queuePending(event);
      return;
    }
    if (!this.ctx || !this.master) return;
    if (this.resumePromise || this.ctx.state === 'suspended') {
      if (!this.resumePromise) this.resumeAndFlush();
    }
    this.playEvent(event);
  }

  private playEvent(event: SoundEvent): void {
    const asset = resolveCue(event);
    if (!asset) return;
    try {
      this.play(asset);
    } catch {
      /* presentation only — never disrupt gameplay */
    }
  }

  private queuePending(event: SoundEvent): void {
    this.pendingEvents.push(event);
    if (this.pendingEvents.length > 24) this.pendingEvents.shift();
  }

  private flushPendingEvents(): void {
    if (!this.ctx || !this.master || this.resumePromise || this.ctx.state === 'suspended') return;
    const events = this.pendingEvents.splice(0);
    for (const event of events) this.playEvent(event);
  }

  /** Play a one-off sample for the settings "test sound" button. */
  test(clipId = 'item-pickup'): void {
    const asset = SOUND_ASSETS[clipId];
    if (asset && this.unlocked && this.ctx && this.master) {
      try {
        this.play(asset);
      } catch {
        /* ignore */
      }
    }
  }

  private play(asset: SoundAsset): void {
    const now = (this.ctx as AudioContext).currentTime * 1000;
    const cooldown = asset.cooldownMs ?? 0;
    const last = this.lastPlayed.get(asset.id);
    if (last !== undefined && now - last < cooldown) return;
    if (this.activeVoices >= GLOBAL_MAX_VOICES) return;

    const file = asset.variants.length === 1
      ? asset.variants[0]
      : asset.variants[Math.floor(Math.random() * asset.variants.length)];

    const buffer = this.buffers.get(file);
    if (!buffer) {
      if (!this.playHtmlFallback(asset, file)) {
        void this.load(file).then(buf => {
          if (buf) this.start(asset, buf);
        });
      } else {
        // Keep warming the Web Audio buffer for future low-latency playback, but
        // don't replay this event when decoding finishes.
        void this.load(file);
      }
      return;
    }
    this.start(asset, buffer);
  }

  private htmlFallbackFor(file: string): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null;
    let audio = this.htmlFallbacks.get(file);
    if (!audio) {
      audio = new Audio(AUDIO_BASE + file);
      audio.preload = 'auto';
      this.htmlFallbacks.set(file, audio);
      try {
        audio.load();
      } catch {
        /* best-effort warmup */
      }
    }
    return audio;
  }

  private playHtmlFallback(asset: SoundAsset, file: string): boolean {
    if (this.muted) return true;
    const assetActive = this.assetVoices.get(asset.id) ?? 0;
    if (asset.maxVoices !== undefined && assetActive >= asset.maxVoices) return true;
    const warm = this.htmlFallbackFor(file);
    if (!warm) return false;
    try {
      const voice = warm.cloneNode(true) as HTMLAudioElement;
      voice.volume = clamp01(this.effectiveGain() * (asset.volume ?? 1));
      voice.currentTime = 0;
      this.lastPlayed.set(asset.id, (this.ctx?.currentTime ?? 0) * 1000);
      this.activeVoices++;
      this.assetVoices.set(asset.id, assetActive + 1);
      const cleanup = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        this.assetVoices.set(asset.id, Math.max(0, (this.assetVoices.get(asset.id) ?? 1) - 1));
      };
      voice.onended = cleanup;
      void voice.play().catch(() => {
        cleanup();
        void this.load(file).then(buf => {
          if (buf) this.start(asset, buf);
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  private start(asset: SoundAsset, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const now = ctx.currentTime * 1000;
    const cooldown = asset.cooldownMs ?? 0;
    const last = this.lastPlayed.get(asset.id);
    if (last !== undefined && now - last < cooldown) return;
    if (this.activeVoices >= GLOBAL_MAX_VOICES) return;
    const assetActive = this.assetVoices.get(asset.id) ?? 0;
    if (asset.maxVoices !== undefined && assetActive >= asset.maxVoices) return;
    this.lastPlayed.set(asset.id, now);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = clamp01(asset.volume ?? 1);
    src.connect(gain).connect(master);

    this.activeVoices++;
    this.assetVoices.set(asset.id, assetActive + 1);
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      this.assetVoices.set(asset.id, Math.max(0, (this.assetVoices.get(asset.id) ?? 1) - 1));
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start();
  }

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
        const buf = await withAssetDecodeDiagnostics(
          { kind: 'audio', url: AUDIO_BASE + file, id: file, owner: 'audio-service', category: 'sfx' },
          () => ctx.decodeAudioData(data),
        );
        this.buffers.set(file, buf);
        return buf;
      } catch (err) {
        if (!this.warned.has(file)) {
          this.warned.add(file);
          console.warn(`[audio] failed to load ${file}; silencing it.`, err);
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

/** Factory mirroring the plan's `createAudioService(loadSettings().audio)`. */
export function createAudioService(config: AudioServiceConfig): AudioService {
  return new AudioService(config);
}

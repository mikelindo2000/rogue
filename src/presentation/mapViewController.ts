import type { DeathTransitionRequest } from '../ui/deathTransition';
import type { PlayerSprite } from '../render/avatar';
import { AsciiCanvasRenderer, type AsciiCanvasRendererOptions } from './renderers/asciiCanvasRenderer';
import type { MapRenderer } from './mapRenderer';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';

export interface MapViewControllerOptions {
  host: HTMLElement;
  createRenderer?: (options: AsciiCanvasRendererOptions) => MapRenderer;
  getFloorTransitionId?: () => string;
  getReducedMotion?: () => boolean;
}

type RendererExtras = {
  setReducedMotion?: (reduced: boolean) => void;
  beginDeathTransition?: (request: DeathTransitionRequest) => Promise<void>;
  resetDeathTransition?: () => void;
  previewDeathTransition?: (id: string) => Promise<void>;
  setPlayerSprite?: (sprite: PlayerSprite) => void;
  getPlayerSprite?: () => PlayerSprite;
  setDisorientation?: (intensity: number) => void;
  fxPlayerRun?: (path: readonly RunPathStep[], ghosts?: readonly RunGhostItem[]) => void;
};

export class MapViewController {
  private readonly host: HTMLElement;
  private readonly getFloorTransitionId?: () => string;
  private readonly getReducedMotionOverride?: () => boolean;
  private readonly createRenderer: (options: AsciiCanvasRendererOptions) => MapRenderer;
  private renderer: MapRenderer;
  private snapshot: MapSnapshot | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRaf = 0;
  private rafId: number | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaChangeHandler: (() => void) | null = null;
  private lastBounds: DOMRectReadOnly | null = null;

  constructor(options: MapViewControllerOptions) {
    this.host = options.host;
    this.getFloorTransitionId = options.getFloorTransitionId;
    this.getReducedMotionOverride = options.getReducedMotion;
    this.createRenderer = options.createRenderer ?? (rendererOptions => new AsciiCanvasRenderer(rendererOptions));
    this.renderer = this.createRenderer(this.rendererOptions());
    this.renderer.mount(this.host);
    this.observeResize();
    this.observeReducedMotion();
  }

  public setSnapshot(snapshot: MapSnapshot): void {
    this.snapshot = snapshot;
    this.renderer.setSnapshot(snapshot);
    this.requestFrame();
  }

  public dispatch(event: PresentationEvent): void {
    if (event.type === 'presentation.modeChanged') {
      this.handoffRenderer(this.createRenderer);
    }
    this.renderer.dispatch(event);
    this.requestFrame();
  }

  public resize(bounds: DOMRectReadOnly): void {
    this.lastBounds = bounds;
    this.renderer.resize(bounds);
    this.requestFrame();
  }

  public tick(now: number): boolean {
    return this.renderer.tick(now);
  }

  public beginDeathTransition(request: DeathTransitionRequest): Promise<void> {
    const begin = this.extras().beginDeathTransition;
    if (!begin) return Promise.resolve();
    const done = begin(request);
    this.requestFrame();
    return done;
  }

  public resetDeathTransition(): void {
    this.extras().resetDeathTransition?.();
    this.requestFrame();
  }

  public previewDeathTransition(id: string): Promise<void> {
    const preview = this.extras().previewDeathTransition;
    if (!preview) return Promise.resolve();
    const done = preview(id);
    this.requestFrame();
    return done;
  }

  public setPlayerSprite(sprite: PlayerSprite): void {
    this.extras().setPlayerSprite?.(sprite);
    this.requestFrame();
  }

  public getPlayerSprite(): PlayerSprite | null {
    return this.extras().getPlayerSprite?.() ?? null;
  }

  public setDisorientation(intensity: number): void {
    this.extras().setDisorientation?.(intensity);
    this.requestFrame();
  }

  public dispatchPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[] = []): void {
    const run = this.extras().fxPlayerRun;
    if (run) run(path, ghosts);
    else this.dispatch({ type: 'player.run', path, ghosts });
    this.requestFrame();
  }

  public handoffRenderer(factory: (options: AsciiCanvasRendererOptions) => MapRenderer): void {
    this.renderer.destroy();
    this.renderer = factory(this.rendererOptions());
    this.renderer.mount(this.host);
    if (this.lastBounds) this.renderer.resize(this.lastBounds);
    if (this.snapshot) this.renderer.setSnapshot(this.snapshot);
    this.extras().setReducedMotion?.(this.reducedMotion());
    this.requestFrame();
  }

  public destroy(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    if (this.resizeRaf && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.resizeRaf);
    }
    this.resizeObserver?.disconnect();
    if (this.mediaQuery && this.mediaChangeHandler) {
      if ('removeEventListener' in this.mediaQuery) {
        this.mediaQuery.removeEventListener('change', this.mediaChangeHandler);
      } else {
        (this.mediaQuery as MediaQueryList & { removeListener(listener: () => void): void })
          .removeListener(this.mediaChangeHandler);
      }
    }
    this.renderer.destroy();
    this.rafId = null;
    this.resizeRaf = 0;
  }

  private rendererOptions(): AsciiCanvasRendererOptions {
    return {
      getFloorTransitionId: this.getFloorTransitionId,
      getReducedMotion: () => this.reducedMotion(),
      requestFrame: () => this.requestFrame(),
    };
  }

  private requestFrame(): void {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return;
    this.rafId = requestAnimationFrame(now => {
      this.rafId = null;
      if (this.renderer.tick(now)) this.requestFrame();
    });
  }

  private observeResize(): void {
    const target = (this.host.closest('.stage') as HTMLElement | null) ?? this.host;
    const resize = () => this.resize(target.getBoundingClientRect());
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeRaf || typeof requestAnimationFrame === 'undefined') return;
      this.resizeRaf = requestAnimationFrame(() => {
        this.resizeRaf = 0;
        resize();
      });
    });
    this.resizeObserver.observe(target);
  }

  private observeReducedMotion(): void {
    if (this.getReducedMotionOverride || typeof matchMedia === 'undefined') return;
    this.mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.mediaChangeHandler = () => {
      this.extras().setReducedMotion?.(this.reducedMotion());
      this.requestFrame();
    };
    if ('addEventListener' in this.mediaQuery) {
      this.mediaQuery.addEventListener('change', this.mediaChangeHandler);
    } else {
      (this.mediaQuery as MediaQueryList & { addListener(listener: () => void): void })
        .addListener(this.mediaChangeHandler);
    }
  }

  private reducedMotion(): boolean {
    if (this.getReducedMotionOverride) return this.getReducedMotionOverride();
    return this.mediaQuery?.matches ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  private extras(): RendererExtras {
    return this.renderer as RendererExtras;
  }
}

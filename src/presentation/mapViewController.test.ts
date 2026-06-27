// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeathTransitionRequest } from '../ui/deathTransition';
import type { MapRenderer } from './mapRenderer';
import { MapViewController } from './mapViewController';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';
import type { AsciiCanvasRendererOptions } from './renderers/asciiCanvasRenderer';

class CapturingRenderer implements MapRenderer {
  public mountedReducedMotion: boolean | null = null;
  public mounted = false;
  public destroyed = false;
  public snapshots: MapSnapshot[] = [];
  public dispatchedEvents: PresentationEvent[] = [];
  public resizedBounds: DOMRectReadOnly[] = [];
  public reducedMotionValues: boolean[] = [];
  public tickResults: boolean[] = [];

  constructor(private readonly options: AsciiCanvasRendererOptions) {}

  public mount(_host: HTMLElement): void {
    this.mounted = true;
    this.mountedReducedMotion = this.options.getReducedMotion?.() ?? false;
  }

  public setSnapshot(snapshot: MapSnapshot): void {
    this.snapshots.push(snapshot);
  }

  public dispatch(event: PresentationEvent): void {
    this.dispatchedEvents.push(event);
  }

  public resize(bounds: DOMRectReadOnly): void {
    this.resizedBounds.push(bounds);
  }

  public tick(_now: number): boolean {
    return this.tickResults.shift() ?? false;
  }

  public destroy(): void {
    this.destroyed = true;
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotionValues.push(reduced);
  }
}

class ReceiverCheckingRenderer extends CapturingRenderer {
  public runCalls: Array<{ path: readonly RunPathStep[]; ghosts: readonly RunGhostItem[] }> = [];
  public deathRequests: DeathTransitionRequest[] = [];
  public previewIds: string[] = [];

  public fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[] = []): void {
    this.runCalls.push({ path, ghosts });
  }

  public beginDeathTransition(request: DeathTransitionRequest): Promise<void> {
    this.deathRequests.push(request);
    return Promise.resolve();
  }

  public previewDeathTransition(id: string): Promise<void> {
    this.previewIds.push(id);
    return Promise.resolve();
  }
}

function createHost(): HTMLElement {
  document.body.innerHTML = `
    <div class="stage">
      <div class="map-viewport">
        <div class="map-transition">
          <div class="map-plane">
            <canvas id="gameCanvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
  const stage = document.querySelector<HTMLElement>('.stage')!;
  stage.getBoundingClientRect = () => ({ width: 320, height: 240, x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 240, toJSON: () => ({}) });
  return document.querySelector<HTMLElement>('.map-plane')!;
}

function bounds(width: number, height: number): DOMRectReadOnly {
  return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) };
}

function snapshot(overrides: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    cols: 1,
    rows: 1,
    floor: 1,
    scope: { type: 'full-floor' },
    gameOver: false,
    gameWon: false,
    monsterDetectionActive: false,
    tiles: [[{ x: 0, y: 0, kind: '.', explored: true, visible: true, inScope: true }]],
    player: { x: 0, y: 0, inScope: true },
    monsters: [],
    items: [],
    traps: [],
    ...overrides,
  };
}

describe('MapViewController reduced motion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('initializes reduced-motion observation before mounting the renderer', () => {
    let listenerInstalled = false;
    const mediaQuery = {
      media: '(prefers-reduced-motion: reduce)',
      get matches() {
        return listenerInstalled;
      },
      addEventListener: vi.fn((_type: string, _listener: EventListenerOrEventListenerObject) => {
        listenerInstalled = true;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    let renderer: CapturingRenderer | null = null;
    const controller = new MapViewController({
      host: createHost(),
      createRenderer: options => {
        renderer = new CapturingRenderer(options);
        return renderer;
      },
    });

    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(renderer).not.toBeNull();
    expect((renderer as CapturingRenderer | null)?.mountedReducedMotion).toBe(true);

    controller.destroy();
  });
});

describe('MapViewController renderer extras', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('invokes the player run extra with the renderer as receiver', () => {
    let renderer!: ReceiverCheckingRenderer;
    const controller = new MapViewController({
      host: createHost(),
      getReducedMotion: () => false,
      createRenderer: options => {
        renderer = new ReceiverCheckingRenderer(options);
        return renderer;
      },
    });
    const path: RunPathStep[] = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ];
    const ghosts: RunGhostItem[] = [
      { x: 2, y: 1, symbol: '!', color: '#fff7a8', pathIndex: 1 },
    ];

    expect(() => controller.dispatchPlayerRun(path, ghosts)).not.toThrow();

    expect(renderer.runCalls).toEqual([{ path, ghosts }]);
    expect(renderer.dispatchedEvents).toEqual([]);

    controller.destroy();
  });

  it('invokes death transition extras with the renderer as receiver', async () => {
    let renderer!: ReceiverCheckingRenderer;
    const controller = new MapViewController({
      host: createHost(),
      getReducedMotion: () => false,
      createRenderer: options => {
        renderer = new ReceiverCheckingRenderer(options);
        return renderer;
      },
    });
    const request: DeathTransitionRequest = {
      outcome: 'died',
      runId: 'run-1',
      floorReached: 6,
    };

    await expect((async () => controller.beginDeathTransition(request))()).resolves.toBeUndefined();
    await expect((async () => controller.previewDeathTransition('last-spiral'))()).resolves.toBeUndefined();

    expect(renderer.deathRequests).toEqual([request]);
    expect(renderer.previewIds).toEqual(['last-spiral']);

    controller.destroy();
  });
});

describe('MapViewController renderer lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps requesting frames while the active renderer reports animation work', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let renderer!: CapturingRenderer;
    const controller = new MapViewController({
      host: createHost(),
      getReducedMotion: () => false,
      createRenderer: options => {
        renderer = new CapturingRenderer(options);
        renderer.tickResults = [true, false];
        return renderer;
      },
    });

    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(16);
    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(32);
    expect(callbacks).toHaveLength(0);

    controller.destroy();
  });

  it('hands snapshot, resize, and reduced-motion state to the new renderer on mode change', () => {
    const renderers: CapturingRenderer[] = [];
    const controller = new MapViewController({
      host: createHost(),
      getReducedMotion: () => true,
      createRenderer: options => {
        const renderer = new CapturingRenderer(options);
        renderers.push(renderer);
        return renderer;
      },
    });
    const mapSnapshot = snapshot();
    const latestBounds = bounds(480, 320);
    const modeEvent: PresentationEvent = {
      type: 'presentation.modeChanged',
      mode: {
        type: 'boss-encounter',
        bossKey: 'monster-7',
        scope: { kind: 'room', rect: { l: 1, t: 1, r: 4, b: 4 } },
      },
    };

    renderers[0].tickResults = [true];
    controller.setSnapshot(mapSnapshot);
    controller.resize(latestBounds);
    controller.dispatch(modeEvent);

    expect(renderers).toHaveLength(2);
    expect(renderers[0].destroyed).toBe(true);
    expect(renderers[0].dispatchedEvents).toEqual([]);
    expect(renderers[1].mounted).toBe(true);
    expect(renderers[1].snapshots).toEqual([mapSnapshot]);
    expect(renderers[1].resizedBounds.at(-1)).toBe(latestBounds);
    expect(renderers[1].reducedMotionValues).toEqual([true]);
    expect(renderers[1].dispatchedEvents).toEqual([modeEvent]);
    expect(controller.tick(80)).toBe(false);

    controller.destroy();
    expect(renderers[1].destroyed).toBe(true);
  });
});

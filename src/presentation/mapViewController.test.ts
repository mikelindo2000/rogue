// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapRenderer } from './mapRenderer';
import { MapViewController } from './mapViewController';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent } from './presentationEvents';
import type { AsciiCanvasRendererOptions } from './renderers/asciiCanvasRenderer';

class CapturingRenderer implements MapRenderer {
  public mountedReducedMotion: boolean | null = null;

  constructor(private readonly options: AsciiCanvasRendererOptions) {}

  public mount(_host: HTMLElement): void {
    this.mountedReducedMotion = this.options.getReducedMotion?.() ?? false;
  }

  public setSnapshot(_snapshot: MapSnapshot): void {}
  public dispatch(_event: PresentationEvent): void {}
  public resize(_bounds: DOMRectReadOnly): void {}
  public tick(_now: number): boolean { return false; }
  public destroy(): void {}
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

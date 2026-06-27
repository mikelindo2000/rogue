// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TILE } from '../../tiles';
import type { MapSnapshot } from '../mapSnapshot';
import { AsciiCanvasRenderer } from './asciiCanvasRenderer';

type CanvasContextStub = CanvasRenderingContext2D & { calls: string[] };

function createContextStub(): CanvasContextStub {
  const calls: string[] = [];
  const target = { calls };
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop as keyof typeof obj];
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      return (..._args: unknown[]) => {
        calls.push(prop);
      };
    },
    set(obj, prop: string, value) {
      obj[prop as keyof typeof obj] = value;
      return true;
    },
  }) as CanvasContextStub;
}

function createHost() {
  document.body.innerHTML = `
    <div class="stage">
      <div class="map-viewport">
        <div class="map-transition">
          <div class="map-plane">
            <canvas id="gameCanvas"></canvas>
          </div>
        </div>
        <div class="map-ghost"><canvas id="ghostCanvas"></canvas></div>
        <div class="map-death-veil"></div>
      </div>
    </div>
  `;
  const stage = document.querySelector<HTMLElement>('.stage')!;
  stage.getBoundingClientRect = () => ({ width: 300, height: 220, x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 220, toJSON: () => ({}) });
  return {
    stage,
    viewport: document.querySelector<HTMLElement>('.map-viewport')!,
    plane: document.querySelector<HTMLElement>('.map-plane')!,
    canvas: document.querySelector<HTMLCanvasElement>('#gameCanvas')!,
  };
}

function snapshot(overrides: Partial<MapSnapshot> = {}): MapSnapshot {
  const tiles = [
    [TILE.WALL_H, TILE.WALL_H, TILE.WALL_H],
    [TILE.WALL_V, TILE.FLOOR, TILE.STAIRS_DOWN],
    [TILE.WALL_H, TILE.DOOR, TILE.FLOOR],
  ].map((row, y) => row.map((kind, x) => ({
    x,
    y,
    kind,
    explored: true,
    visible: true,
    inScope: true,
  })));

  return {
    cols: 3,
    rows: 3,
    floor: 1,
    scope: { type: 'full-floor' },
    gameOver: false,
    gameWon: false,
    monsterDetectionActive: false,
    tiles,
    player: { x: 1, y: 1, inScope: true },
    monsters: [{
      key: 'monster-a',
      id: 'orc',
      x: 2,
      y: 1,
      name: 'Orc',
      glyph: 'O',
      color: '#55aa55',
      visible: true,
      detected: false,
      hp: 6,
      maxHp: 8,
      atk: 3,
      minFloor: 1,
      frozenTurns: 0,
      inScope: true,
    }],
    items: [{
      key: 'item-a',
      x: 1,
      y: 2,
      type: 'gold',
      amount: 4,
      glyph: '$',
      color: '#ffd84d',
      explored: true,
      visible: true,
      inScope: true,
    }],
    traps: [{
      id: 'trap-a',
      x: 2,
      y: 2,
      kind: 'dart',
      revealed: true,
      armed: true,
      explored: true,
      visible: true,
      inScope: true,
    }],
    ...overrides,
  };
}

describe('AsciiCanvasRenderer', () => {
  let context: CanvasContextStub;

  beforeEach(() => {
    context = createContextStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.stubGlobal('devicePixelRatio', 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts and paints a snapshot into the existing canvas host', () => {
    const { canvas } = createHost();
    const renderer = new AsciiCanvasRenderer({ now: () => 100 });

    renderer.mount(canvas);
    renderer.resize({ width: 300, height: 220 } as DOMRectReadOnly);
    renderer.setSnapshot(snapshot());

    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.style.width).toBe('120px');
    expect(context.calls).toContain('clearRect');
  });

  it('dispatches representative animation events and reports keepalive from tick', () => {
    const { canvas } = createHost();
    let requested = 0;
    let now = 100;
    const renderer = new AsciiCanvasRenderer({
      now: () => now,
      requestFrame: () => {
        requested += 1;
      },
    });

    renderer.mount(canvas);
    renderer.resize({ width: 300, height: 220 } as DOMRectReadOnly);
    renderer.setSnapshot(snapshot());
    renderer.dispatch({ type: 'combat.hit', x: 2, y: 1, damage: 3, crit: false });
    renderer.dispatch({ type: 'combat.strike', fromX: 1, fromY: 1, toX: 2, toY: 1 });
    renderer.dispatch({ type: 'combat.freeze', x: 2, y: 1 });
    renderer.dispatch({ type: 'combat.death', x: 2, y: 1, glyph: 'O', color: '#55aa55' });
    renderer.dispatch({ type: 'combat.monsterDodge', monsterKey: 'monster-a', fromX: 1, fromY: 1 });
    renderer.dispatch({ type: 'player.run', path: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], ghosts: [] });
    renderer.dispatch({ type: 'map.rumble', strength: 0.8 });
    renderer.dispatch({ type: 'map.floorTransition', dir: 'down' });

    now = 130;

    expect(requested).toBeGreaterThan(0);
    expect(renderer.tick(now)).toBe(true);
  });

  it('honors reduced motion for map rumble', () => {
    const { canvas, plane } = createHost();
    const renderer = new AsciiCanvasRenderer({ now: () => 100, getReducedMotion: () => true });

    renderer.mount(canvas);
    renderer.resize({ width: 300, height: 220 } as DOMRectReadOnly);
    renderer.setSnapshot(snapshot());
    renderer.dispatch({ type: 'map.rumble', strength: 1 });
    renderer.tick(120);

    expect(plane.style.transform).toBe('');
  });

  it('keeps ticking while state-driven map effects are active', () => {
    const { canvas } = createHost();
    const renderer = new AsciiCanvasRenderer({ now: () => 100 });

    renderer.mount(canvas);
    renderer.resize({ width: 300, height: 220 } as DOMRectReadOnly);
    renderer.setSnapshot(snapshot({ monsterDetectionActive: true }));

    expect(renderer.tick(140)).toBe(true);
  });

  it('resizes and destroys without throwing', () => {
    const { canvas } = createHost();
    const renderer = new AsciiCanvasRenderer({ now: () => 100 });

    renderer.mount(canvas);
    renderer.resize({ width: 300, height: 220 } as DOMRectReadOnly);
    renderer.setSnapshot(snapshot());
    const firstWidth = canvas.width;
    renderer.resize({ width: 520, height: 420 } as DOMRectReadOnly);

    expect(canvas.width).toBeGreaterThanOrEqual(firstWidth);
    expect(() => renderer.destroy()).not.toThrow();
    expect(renderer.tick(200)).toBe(false);
  });
});

import { TILE, STAIR_TILES, isCorner, isWalkable } from '../../tiles';
import { DIM_ALPHA, getDungeonStyle, type DungeonStyle } from '../../theme';
import { drawGlyphAt, type GlyphOpts } from '../../render/glyph';
import {
  drawAvatar,
  DEFAULT_PLAYER_SPRITE,
  PLAYER_ARMOR,
  PLAYER_ACCENT,
  type PlayerSprite,
  type PlayerPalette,
} from '../../render/avatar';
import { MapStageController } from '../../ui/mapStage';
import { FloorTransitionController, resolveFloorTransition, DEFAULT_FLOOR_TRANSITION, type FloorDir } from '../../ui/floorTransition';
import { DeathTransitionController, chooseDeathTransition, getDeathTransition, type DeathTransitionRequest } from '../../ui/deathTransition';
import type { MapRenderer } from '../mapRenderer';
import type { ItemView, MapSnapshot, MonsterView, PlayerView, TrapView } from '../mapSnapshot';
import type {
  PresentationEvent,
  RunGhostItem as PresentationRunGhostItem,
  RunPathStep,
} from '../presentationEvents';
import { PLAYER_RUN_ANIMATION } from '../presentationEvents';

export interface AsciiCanvasRendererOptions {
  now?: () => number;
  random?: () => number;
  getReducedMotion?: () => boolean;
  getFloorTransitionId?: () => string;
  requestFrame?: () => void;
}

type DoorOrientation = 'horizontal' | 'vertical';

interface TileMetrics {
  gx: number;
  gy: number;
  size: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  wallStroke: number;
  wallGap: number;
  railA: number;
  railB: number;
  passage: number;
}

/** A transient combat animation. Board-anchored effects carry their own tile
 *  coords (and, for deaths, their own glyph) so they outlive the entity that
 *  spawned them. All durations are in milliseconds. */
interface Fx {
  kind: 'strike' | 'hit' | 'dmg' | 'death' | 'freeze' | 'phit' | 'dive' | 'whiff' | 'float';
  start: number;
  life: number;
  x?: number;
  y?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  text?: string;
  crit?: boolean;
  glyph?: string;
  color?: string;
  jx?: number;
}

const FX_LIFE = {
  strike: 280,
  hit: 340,
  dmg: 820,
  death: 460,
  freeze: 560,
  phit: 300,
  dive: 240, // swoop streak from attacker to target
  whiff: 360, // dust puff where a dodged attack lands
  float: 720, // generic floating label ("dodge", "miss")
} as const;

/** How long a monster takes to glide one tile. Short enough to keep up with
 *  fast turns, long enough to read as motion rather than a snap. */
const MOVE_DUR = 130;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** A monster's in-flight tile→tile glide. `from` is the tile it left; the
 *  monster's current x/y is the destination. */
interface MoveAnim {
  fromX: number;
  fromY: number;
  start: number;
}

/** An item the player grabbed mid-run. `pathIndex` is the step in `path` whose
 *  tile it sat on — it stays drawn until the animated player reaches that step,
 *  so loot never appears to vanish before the sprite touches it. */
interface RenderedRunGhostItem {
  x: number;
  y: number;
  glyph: string;
  color: string;
  pathIndex: number;
}

interface PlayerRunAnim {
  path: RunPathStep[];
  start: number;
  tileMs: number;
  duration: number;
  ghosts: RenderedRunGhostItem[];
}


/** Snapshot of the board for a single frame — lets the animation loop repaint
 *  between turns without the turn-based engine driving every frame. */
interface Scene {
  map: string[][];
  explored: boolean[][];
  visible: boolean[][];
  player: PlayerView;
  monsters: MonsterView[];
  items: ItemView[];
  traps: TrapView[];
  tileSize: number;
  cols: number;
  rows: number;
  dungeonFloor: number;
  gameOver: boolean;
  gameWon: boolean;
  monsterDetectionActive: boolean;
}

export class AsciiCanvasRenderer implements MapRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx!: CanvasRenderingContext2D;

  /** Latest board snapshot, repainted by the animation loop. */
  private scene: Scene | null = null;
  /** In-flight combat effects; the rAF loop runs only while this is non-empty. */
  private fx: Fx[] = [];
  /** Per-monster glide animations and last rendered tiles, keyed by the stable
   *  render key carried in MapSnapshot rather than mutable object identity. */
  private moveAnim: Map<string, MoveAnim> = new Map();
  private lastTile: Map<string, { x: number; y: number }> = new Map();
  private playerRunAnim: PlayerRunAnim | null = null;
  /** Quick perpendicular "flit aside" wobble when a monster evades a strike. */
  private dodgeAnim: Map<string, { start: number; dx: number; dy: number }> = new Map();
  /** Timestamp (ms) until which at least one glide is still in flight, so the
   *  loop keeps painting without scanning every animation map. */
  private animUntil = 0;

  /** Which avatar the player draws as. Settable in code today; a character-
   *  select UI will drive it later via setPlayerSprite(). */
  private playerSprite: PlayerSprite = DEFAULT_PLAYER_SPRITE;

  /** Last measured stage box and pixel ratio, refreshed by the ResizeObserver.
   *  Zero width/height means "not measured yet" — computeTileSize falls back. */
  private viewport = { w: 0, h: 0, dpr: 1 };
  /** Drives the 3D transform of the map plane (the canvas's wrapper) for
   *  cosmetic effects like the heavy-hit rumble. Null in environments without
   *  the `.map-plane` wrapper (e.g. bare-canvas tests). See ./ui/mapStage. */
  private mapStage: MapStageController | null = null;

  /** Crossfades a snapshot of the floor being left against the incoming floor
   *  on stairs. Null without the `.map-transition`/`.map-ghost` wrappers. */
  private floorTransition: FloorTransitionController | null = null;
  /** Plays the brief map-plane animation between player death and the end-run
   *  art/stat screen. Null without the `.map-plane` wrapper. */
  private deathTransition: DeathTransitionController | null = null;

  constructor(private readonly options: AsciiCanvasRendererOptions = {}) {}

  public mount(host: HTMLElement): void {
    const canvas = host instanceof HTMLCanvasElement
      ? host
      : host.querySelector<HTMLCanvasElement>('canvas#gameCanvas, canvas');
    if (!canvas) throw new Error('AsciiCanvasRenderer: missing game canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('AsciiCanvasRenderer: 2D context unavailable');

    this.canvas = canvas;
    this.ctx = context;

    const plane = canvas.parentElement;
    const transitionEl = plane?.parentElement ?? null;
    const viewport = transitionEl?.parentElement ?? null;
    const reduced = this.reducedMotion();

    if (plane) {
      this.mapStage = new MapStageController({
        apply: (transform, filter = '') => {
          plane.style.transform = transform;
          plane.style.filter = filter;
        },
        now: () => this.nowMs(),
        random: this.options.random,
        reducedMotion: reduced,
      });
    }

    if (transitionEl && viewport) {
      this.floorTransition = new FloorTransitionController({
        liveLayer: transitionEl,
        ghostLayer: viewport.querySelector('.map-ghost'),
        liveCanvas: canvas,
        ghostCanvas: viewport.querySelector<HTMLCanvasElement>('canvas#ghostCanvas'),
        now: () => this.nowMs(),
        reducedMotion: reduced,
      });
      this.deathTransition = new DeathTransitionController({
        plane,
        veil: viewport.querySelector('.map-death-veil'),
        now: () => this.nowMs(),
        reducedMotion: reduced,
      });
    }
  }

  public setSnapshot(snapshot: MapSnapshot): void {
    this.playerRunAnim = null;
    this.scene = sceneFromSnapshot(snapshot);
    if (!snapshot.gameOver && !snapshot.gameWon) this.deathTransition?.reset();
    this.trackMovement(this.scene.monsters);
    this.paint();
    this.ensureLoop();
  }

  public dispatch(event: PresentationEvent): void {
    switch (event.type) {
      case 'combat.strike':
        this.fxStrike(event.fromX, event.fromY, event.toX, event.toY);
        break;
      case 'combat.hit':
        this.fxHit(event.x, event.y, event.damage, event.crit);
        break;
      case 'combat.freeze':
        this.fxFreeze(event.x, event.y);
        break;
      case 'combat.death':
        this.fxDeath(event.x, event.y, event.glyph, event.color);
        break;
      case 'combat.playerHit':
        this.fxPlayerHit();
        break;
      case 'combat.dive':
        this.fxDive(event.fromX, event.fromY, event.toX, event.toY, event.color);
        break;
      case 'combat.whiff':
        this.fxWhiff(event.x, event.y);
        break;
      case 'combat.float':
        this.fxFloat(event.x, event.y, event.text, event.color);
        break;
      case 'combat.monsterDodge':
        this.fxMonsterDodge(event.monsterKey, event.fromX, event.fromY);
        break;
      case 'map.rumble':
        this.mapRumble(event.strength);
        break;
      case 'map.floorTransition':
        this.beginFloorTransition(event.dir);
        break;
      case 'player.run':
        this.fxPlayerRun(event.path, event.ghosts);
        break;
      case 'presentation.modeChanged':
      case 'aiming.changed':
      case 'combat.focusMonster':
      case 'combat.clearFocusMonster':
        break;
    }
  }

  public resize(bounds: DOMRectReadOnly): void {
    this.viewport.w = bounds.width;
    this.viewport.h = bounds.height;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.viewport.dpr = Math.min(Math.max(dpr, 1), 2);
    this.paint();
  }

  public tick(now: number): boolean {
    this.paint(now);
    return this.isAnimating();
  }

  public destroy(): void {
    this.fx = [];
    this.moveAnim.clear();
    this.lastTile.clear();
    this.dodgeAnim.clear();
    this.playerRunAnim = null;
    this.animUntil = 0;
    this.mapStage?.settle();
    this.floorTransition?.reset();
    this.deathTransition?.reset();
    if (this.canvas) this.canvas.style.transform = '';
    this.scene = null;
    this.mapStage = null;
    this.floorTransition = null;
    this.deathTransition = null;
  }

  public setReducedMotion(reduced: boolean): void {
    this.mapStage?.setReducedMotion(reduced);
    this.floorTransition?.setReducedMotion(reduced);
    this.deathTransition?.setReducedMotion(reduced);
    if (reduced) this.paint();
  }

  public setDisorientation(intensity: number): void {
    this.mapStage?.setDisorientation(intensity);
    this.ensureLoop();
  }

  /** Shake the map plane on a heavy blow (cosmetic; the engine decides what's
   *  heavy). `strength` is a 0..1 intensity. Pairs with the `combat.heavyHit`
   *  sound cue, but the two are independent — either can be disabled alone. */
  public mapRumble(strength = 0.6) {
    if (!this.mapStage) return;
    this.mapStage.rumble({ intensity: strength });
    this.ensureLoop();
  }

  /** Start a floor-change transition. Called by the engine at the top of a
   *  stairs travel, before the live canvas repaints to the new floor, so the
   *  outgoing floor can be snapshotted. The active effect is chosen from the
   *  store (reduced motion forces the opacity-only dissolve). */
  public beginFloorTransition(dir: FloorDir) {
    if (!this.floorTransition) return;
    const reduced = this.reducedMotion();
    this.floorTransition.setReducedMotion(reduced);
    this.floorTransition.begin(dir, resolveFloorTransition(this.options.getFloorTransitionId?.() ?? DEFAULT_FLOOR_TRANSITION, reduced));
    this.ensureLoop();
  }

  /** Start the death presentation transition and resolve when the screen may
   *  open. The selector is outcome-aware even though only death variants ship
   *  today, so future victory/floor/cause-specific effects can slot in here. */
  public beginDeathTransition(request: DeathTransitionRequest): Promise<void> {
    if (!this.deathTransition) return Promise.resolve();
    const reduced = this.reducedMotion();
    const transition = chooseDeathTransition(request, reduced, this.options.random);
    if (!transition) return Promise.resolve();
    this.mapStage?.settle();
    this.deathTransition.setReducedMotion(reduced);
    const done = this.deathTransition.begin(transition);
    this.ensureLoop();
    if (typeof window === 'undefined') return done;
    return Promise.race([
      done,
      new Promise<void>(resolve => {
        window.setTimeout(() => {
          this.deathTransition?.skipToEnd();
          resolve();
        }, transition.durationMs + 120);
      }),
    ]);
  }

  /** Clear any persisted death-transition inline styles when a new live run
   *  begins or a test harness wants the plane back at rest. */
  public resetDeathTransition(): void {
    this.deathTransition?.reset();
  }

  /** Dev/proof helper: play a specific transition id against the live map plane. */
  public previewDeathTransition(id: string): Promise<void> {
    if (!this.deathTransition) return Promise.resolve();
    const transition = getDeathTransition(id);
    if (!transition) return Promise.reject(new Error(`Unknown death transition: ${id}`));
    this.mapStage?.settle();
    this.deathTransition.setReducedMotion(false);
    const done = this.deathTransition.begin(transition);
    this.ensureLoop();
    return done;
  }

  /** Largest tile size (CSS px) that fits the whole board in the stage box.
   *  Below MIN_TILE the board can't fit legibly, so we hold at MIN_TILE and let
   *  paint() pan the overflow to keep the player centered. MAX_TILE keeps small
   *  boards on big screens from ballooning. Falls back to 20 before first
   *  measurement. */
  private computeTileSize(cols: number, rows: number): number {
    const PAD = 16; // breathing room so the map never kisses the rails
    const MIN_TILE = 16;
    const MAX_TILE = 40;
    const { w, h } = this.viewport;
    if (w <= 0 || h <= 0 || cols <= 0 || rows <= 0) return 20;
    const availW = Math.max(1, w - PAD * 2);
    const availH = Math.max(1, h - PAD * 2);
    const fit = Math.floor(Math.min(availW / cols, availH / rows));
    return Math.max(MIN_TILE, Math.min(MAX_TILE, fit));
  }

  /** When the rendered board is larger than the stage (small screens at the
   *  MIN_TILE floor), translate the canvas so the player sits at the center,
   *  clamped so we never pan past the board's edges. Otherwise the flex parent
   *  centers it and no transform is needed. */
  private applyViewTransform(s: Scene, cssTile: number, cssW: number, cssH: number) {
    if (!this.canvas) return;
    const { w: stageW, h: stageH } = this.viewport;
    let tx = 0;
    let ty = 0;
    if (cssW > stageW && stageW > 0) {
      const max = (cssW - stageW) / 2;
      tx = Math.max(-max, Math.min(max, cssW / 2 - (s.player.x + 0.5) * cssTile));
    }
    if (cssH > stageH && stageH > 0) {
      const max = (cssH - stageH) / 2;
      ty = Math.max(-max, Math.min(max, cssH / 2 - (s.player.y + 0.5) * cssTile));
    }
    const transform = tx || ty ? `translate(${Math.round(tx)}px, ${Math.round(ty)}px)` : '';
    if (this.canvas.style.transform !== transform) this.canvas.style.transform = transform;
  }

  /** Paint one frame from the current scene snapshot plus any in-flight combat
   *  effects. Called once per turn by render(), and repeatedly by the rAF loop
   *  while effects are alive. */
  private paint(ts?: number) {
    const s = this.scene;
    const canvas = this.canvas;
    if (!s || !canvas) return;
    const t = ts ?? this.nowMs();
    this.fx = this.fx.filter(f => t - f.start < f.life);

    // Update the map plane's 3D transform (rumble, …) for this frame. Writes to
    // the canvas's wrapper element, independent of the canvas's own pan transform.
    this.mapStage?.applyFrame();
    // Advance any in-flight floor transition (drives the .map-transition/.map-ghost
    // layers, separate elements from the rumble target).
    this.floorTransition?.applyFrame();
    // Death transitions intentionally write last because they own the final
    // presentation handoff from map to ending art.
    this.deathTransition?.applyFrame();

    // Derive the tile size from the available stage box so the dungeon fills the
    // screen and reflows with it. Everything downstream draws off s.tileSize, so
    // overriding it here scales tiles, glyphs, and effects together.
    const cssTile = this.computeTileSize(s.cols, s.rows);
    s.tileSize = cssTile;
    const dpr = this.viewport.dpr;
    const cssW = s.cols * cssTile;
    const cssH = s.rows * cssTile;

    // Size the backing store to the board before painting. Done imperatively
    // (not via a Svelte binding) so the resize — which clears the canvas — always
    // happens BEFORE the paint, never after it. Guarded so same-size frames don't
    // clear: assigning canvas.width/height clears even when the value is unchanged.
    // The backing store is rendered at devicePixelRatio while the CSS box stays in
    // layout pixels, so upscaled boards stay crisp rather than interpolating.
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const cw = `${cssW}px`;
    const ch = `${cssH}px`;
    if (canvas.style.width !== cw) canvas.style.width = cw;
    if (canvas.style.height !== ch) canvas.style.height = ch;
    this.applyViewTransform(s, cssTile, cssW, cssH);

    const style = getDungeonStyle(s.dungeonFloor);
    // Draw in CSS pixels; the dpr scale on the base transform maps to the backing
    // store. setTransform every frame keeps it correct even when the size guards
    // above skip the (transform-resetting) width/height assignment.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, cssW, cssH);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';

    // Tiles a monster or item occupies, so their floor dot can be drawn at
    // half strength — otherwise the bright dot bleeds through the glyph's gaps
    // and overpowers whatever is standing on the tile.
    const occupied = new Set<number>();
    for (const mo of s.monsters) {
      if (s.visible[mo.y]?.[mo.x]) occupied.add(mo.y * s.cols + mo.x);
    }
    for (const it of s.items) {
      if (s.explored[it.y]?.[it.x]) occupied.add(it.y * s.cols + it.x);
    }

    // Draw Map. Tiles in view render at full strength; remembered-but-unseen
    // tiles fade back, the way an explored dungeon dims behind you in Rogue.
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (!s.explored[r]?.[c]) continue;
        const tile = s.map[r][c];
        if (tile === TILE.VOID) continue;

        let alpha = s.visible[r]?.[c] ? 1 : DIM_ALPHA;
        if (tile === TILE.FLOOR && occupied.has(r * s.cols + c)) alpha *= 0.5;
        this.ctx.globalAlpha = alpha;
        this.drawDungeonTile(s.map, tile, c, r, s.tileSize, style);
      }
    }
    this.ctx.globalAlpha = 1;

    // Draw Items (only those not standing in darkness should glow brightly)
    s.items.forEach(i => {
      if (!s.explored[i.y]?.[i.x]) return;
      this.ctx.globalAlpha = s.visible[i.y]?.[i.x] ? 1 : DIM_ALPHA;
      this.ctx.fillStyle = i.color;
      this.drawGlyph(i.glyph, i.x, i.y, s.tileSize, 0.66);
    });
    this.drawRunGhostItems(t, s);
    this.ctx.globalAlpha = 1;

    // Draw revealed traps as overlays on their underlying floor. Hidden traps do
    // not render at all, and spent traps stay dim so remembered hazards remain
    // legible without looking active.
    s.traps.forEach(trap => {
      if (!trap.revealed || !s.explored[trap.y]?.[trap.x]) return;
      const visible = s.visible[trap.y]?.[trap.x];
      this.ctx.globalAlpha = visible ? (trap.armed ? 1 : 0.45) : DIM_ALPHA * (trap.armed ? 1 : 0.45);
      this.drawTrap(trap, s.tileSize);
    });
    this.ctx.globalAlpha = 1;

    // Frost bursts sit under the glyphs.
    for (const f of this.fx) {
      if (f.kind === 'freeze') this.drawFrostBurst(f, t, s.tileSize);
    }

    // Telegraphs: a pulsing danger marker on the target tile of any monster
    // mid-windup. State-driven (not a fading Fx) so it persists for the whole
    // wind-up, however long the player takes to react.
    for (const m of s.monsters) {
      const pend = m.ai?.pendingAttack;
      if (pend && s.visible[pend.targetY]?.[pend.targetX]) {
        this.drawTelegraph(pend.targetX, pend.targetY, t, s.tileSize, m.color);
      }
    }

    // Draw Monsters — bold, optically centered on the tile dot, with the
    // hit shake/flash applied to whichever monster is being struck.
    if (s.monsterDetectionActive) {
      s.monsters.forEach(m => {
        if (s.visible[m.y]?.[m.x]) return;
        this.drawDetectedMonster(m, t, s.tileSize);
      });
    }
    s.monsters.forEach(m => {
      if (!s.visible[m.y]?.[m.x]) return;
      const { gx, gy } = this.monsterPos(m, t);
      const h = this.hitAt(t, m.x, m.y);
      let color = m.frozenTurns > 0 ? '#00ffff' : m.color;
      if (h.flash > 0) color = this.blend(color, '#ffffff', h.flash);
      this.ctx.fillStyle = color;
      this.drawGlyph(m.glyph, gx, gy, s.tileSize, 0.95, { weight: 800, sizeRatio: 0.98, dx: h.shakeX, embolden: 0.08 });
    });

    // Dying monsters fade + shrink in place. The monster is already gone from
    // the board, so the effect carries its own glyph and color.
    for (const f of this.fx) {
      if (f.kind !== 'death') continue;
      const p = Math.min(1, (t - f.start) / f.life);
      const m = this.tileMetrics(f.x!, f.y!, s.tileSize);
      this.ctx.save();
      this.ctx.globalAlpha = 1 - p;
      this.ctx.translate(m.cx, m.cy);
      this.ctx.scale(1 - p * 0.5, 1 - p * 0.5);
      this.ctx.translate(-m.cx, -m.cy);
      this.ctx.fillStyle = f.color!;
      this.drawGlyph(f.glyph!, f.x!, f.y!, s.tileSize, 0.95, { weight: 800, sizeRatio: 0.98, embolden: 0.08 });
      this.ctx.restore();
    }
    this.ctx.globalAlpha = 1;

    // Draw Player (with run replay, attack lunge, and damage flash)
    const pf = this.playerFx(t, s.tileSize);
    const run = this.playerRunPos(t);
    if (run.active) this.drawPlayerRunTrail(t, s.tileSize, style, s.gameOver, s.gameWon, pf.flash);
    this.drawPlayer(run.active ? run.x : s.player.x, run.active ? run.y : s.player.y, s.tileSize, style, s.gameOver, s.gameWon, pf.dx, pf.dy, pf.flash);

    // Floating damage numbers, painted last so they read above everything.
    for (const f of this.fx) {
      if (f.kind !== 'dmg') continue;
      const e = t - f.start;
      if (e < 0) continue;
      const p = e / f.life;
      const m = this.tileMetrics(f.x!, f.y!, s.tileSize);
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, 1 - p);
      this.ctx.fillStyle = f.crit ? '#ffd44d' : '#ff6a5a';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'alphabetic';
      const fs = Math.round(s.tileSize * (f.crit ? 0.8 : 0.62));
      this.ctx.font = `800 ${fs}px "Fira Code", monospace`;
      this.ctx.fillText(f.text!, m.cx + (f.jx ?? 0) * s.tileSize, m.cy - s.tileSize * 0.2 - p * s.tileSize * 1.4);
      this.ctx.restore();
    }

    // Swoop streaks, whiff puffs, and floating labels (dodge/miss).
    for (const f of this.fx) {
      if (f.kind === 'dive') this.drawDive(f, t, s.tileSize);
      else if (f.kind === 'whiff') this.drawWhiff(f, t, s.tileSize);
      else if (f.kind === 'float') this.drawFloatLabel(f, t, s.tileSize);
    }
    this.ctx.globalAlpha = 1;
  }

  /** Dim psychic glyph for a monster sensed by Scroll of MonsterView Detection.
   *  This deliberately does not depend on `visible`, and it draws no terrain. */
  private drawDetectedMonster(monster: MonsterView, t: number, tileSize: number) {
    const { gx, gy } = this.monsterPos(monster, t);
    const m = this.tileMetrics(gx, gy, tileSize);
    const pulse = 0.5 + 0.5 * Math.sin(t / 260 + monster.x * 0.7 + monster.y * 0.4);
    const radius = tileSize * (0.36 + pulse * 0.08);
    const color = this.blend(monster.color, '#66e0c2', 0.7);

    this.ctx.save();
    this.ctx.globalAlpha = 0.32 + pulse * 0.22;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, tileSize * 0.055);
    this.ctx.beginPath();
    this.ctx.arc(m.cx, m.cy, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.globalAlpha = 0.42 + pulse * 0.2;
    this.ctx.fillStyle = color;
    this.drawGlyph(monster.glyph, gx, gy, tileSize, 0.88, { weight: 700, sizeRatio: 0.9, embolden: 0.04 });
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  /** Pulsing brackets on a telegraphed attack's target tile. */
  private drawTelegraph(gx: number, gy: number, t: number, tileSize: number, color: string) {
    const m = this.tileMetrics(gx, gy, tileSize);
    const pulse = 0.5 + 0.5 * Math.sin(t / 130);
    const r = tileSize * (0.34 + pulse * 0.1);
    this.ctx.save();
    this.ctx.globalAlpha = 0.35 + pulse * 0.4;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1.5, tileSize * 0.07);
    this.ctx.lineCap = 'round';
    // Four corner brackets — reads as a "target lock" without filling the tile.
    const corners = [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ] as const;
    for (const [sx, sy] of corners) {
      const cx0 = m.cx + sx * r;
      const cy0 = m.cy + sy * r;
      const len = tileSize * 0.16;
      this.ctx.beginPath();
      this.ctx.moveTo(cx0, cy0);
      this.ctx.lineTo(cx0 - sx * len, cy0);
      this.ctx.moveTo(cx0, cy0);
      this.ctx.lineTo(cx0, cy0 - sy * len);
      this.ctx.stroke();
    }
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  /** A fading motion streak from attacker to target as a swoop lands. */
  private drawDive(f: Fx, t: number, tileSize: number) {
    const p = Math.min(1, (t - f.start) / f.life);
    const a = this.tileMetrics(f.fromX!, f.fromY!, tileSize);
    const b = this.tileMetrics(f.toX!, f.toY!, tileSize);
    // Streak head races from attacker to target, tail trailing behind.
    const headT = easeOutCubic(p);
    const tailT = Math.max(0, headT - 0.4);
    const hx = lerp(a.cx, b.cx, headT), hy = lerp(a.cy, b.cy, headT);
    const tx = lerp(a.cx, b.cx, tailT), ty = lerp(a.cy, b.cy, tailT);
    this.ctx.save();
    this.ctx.globalAlpha = (1 - p) * 0.9;
    this.ctx.strokeStyle = f.color ?? '#ffffff';
    this.ctx.lineWidth = Math.max(2, tileSize * 0.12);
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(tx, ty);
    this.ctx.lineTo(hx, hy);
    this.ctx.stroke();
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  /** A small dust burst where a dodged attack lands on empty ground. */
  private drawWhiff(f: Fx, t: number, tileSize: number) {
    const p = Math.min(1, (t - f.start) / f.life);
    const m = this.tileMetrics(f.x!, f.y!, tileSize);
    this.ctx.save();
    this.ctx.globalAlpha = (1 - p) * 0.5;
    this.ctx.strokeStyle = '#b8a98c';
    this.ctx.lineWidth = Math.max(1, tileSize * 0.05);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.4;
      const r0 = tileSize * 0.1;
      const r1 = tileSize * (0.18 + p * 0.3);
      this.ctx.beginPath();
      this.ctx.moveTo(m.cx + Math.cos(ang) * r0, m.cy + Math.sin(ang) * r0);
      this.ctx.lineTo(m.cx + Math.cos(ang) * r1, m.cy + Math.sin(ang) * r1);
      this.ctx.stroke();
    }
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  /** A short label rising and fading off a tile. */
  private drawFloatLabel(f: Fx, t: number, tileSize: number) {
    const p = Math.min(1, (t - f.start) / f.life);
    const m = this.tileMetrics(f.x!, f.y!, tileSize);
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, 1 - p);
    this.ctx.fillStyle = f.color ?? '#9fb4c8';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    const fs = Math.round(tileSize * 0.5);
    this.ctx.font = `700 ${fs}px "Fira Code", monospace`;
    this.ctx.fillText(f.text!, m.cx + (f.jx ?? 0) * tileSize, m.cy - tileSize * 0.2 - p * tileSize * 1.2);
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  /** Detect which monsters changed tiles since the last render and start a glide
   *  for each. Called once per turn from render(). */
  private trackMovement(monsters: MonsterView[]) {
    const now = this.nowMs();
    const liveKeys = new Set(monsters.map(monster => monster.key));
    for (const key of this.lastTile.keys()) if (!liveKeys.has(key)) this.lastTile.delete(key);
    for (const key of this.moveAnim.keys()) if (!liveKeys.has(key)) this.moveAnim.delete(key);
    for (const key of this.dodgeAnim.keys()) if (!liveKeys.has(key)) this.dodgeAnim.delete(key);

    for (const m of monsters) {
      const last = this.lastTile.get(m.key);
      if (last && (last.x !== m.x || last.y !== m.y)) {
        // Glide in from the tile the monster just left. (At input speeds one
        // glide finishes before the next move; only rapid run-movement can clip
        // one, which reads fine.)
        this.moveAnim.set(m.key, { fromX: last.x, fromY: last.y, start: now });
        this.animUntil = Math.max(this.animUntil, now + MOVE_DUR);
      }
      this.lastTile.set(m.key, { x: m.x, y: m.y });
    }
  }

  /** The interpolated tile position a monster should be drawn at for frame t,
   *  combining its tile glide and any evade wobble. */
  private monsterPos(m: MonsterView, t: number): { gx: number; gy: number } {
    let gx = m.x;
    let gy = m.y;

    const anim = this.moveAnim.get(m.key);
    if (anim) {
      const p = (t - anim.start) / MOVE_DUR;
      if (p >= 1) {
        this.moveAnim.delete(m.key);
      } else {
        const e = easeOutCubic(Math.max(0, p));
        gx = lerp(anim.fromX, m.x, e);
        gy = lerp(anim.fromY, m.y, e);
      }
    }

    const dodge = this.dodgeAnim.get(m.key);
    if (dodge) {
      // Quick out-and-back over ~252ms — matches the animUntil keepalive set in
      // fxMonsterDodge so the wobble fully completes before the loop sleeps.
      const p = (t - dodge.start) / (FX_LIFE.float * 0.35);
      if (p >= 1) {
        this.dodgeAnim.delete(m.key);
      } else {
        const wobble = Math.sin(Math.max(0, p) * Math.PI) * 0.45;
        gx += dodge.dx * wobble;
        gy += dodge.dy * wobble;
      }
    }

    return { gx, gy };
  }

  private isAnimating(): boolean {
    if (this.fx.length > 0 || this.nowMs() < this.animUntil) return true;
    if (this.mapStage?.isAnimating()) return true;
    if (this.floorTransition?.isAnimating()) return true;
    if (this.deathTransition?.isAnimating()) return true;
    if (this.scene?.monsterDetectionActive) return true;
    // A live telegraph keeps pulsing until its attack resolves.
    const ms = this.scene?.monsters;
    if (ms) for (const m of ms) if (m.ai?.pendingAttack) return true;
    return false;
  }

  private ensureLoop() {
    if (this.isAnimating()) this.options.requestFrame?.();
  }

  private nowMs(): number {
    return this.options.now?.() ?? (typeof performance !== 'undefined' ? performance.now() : 0);
  }

  private reducedMotion(): boolean {
    return this.options.getReducedMotion?.() ?? false;
  }

  private playerRunPos(t: number): { x: number; y: number; active: boolean } {
    const run = this.playerRunAnim;
    if (!run) return { x: 0, y: 0, active: false };
    const elapsed = t - run.start;
    if (elapsed >= run.duration) {
      this.playerRunAnim = null;
      return { x: run.path[run.path.length - 1].x, y: run.path[run.path.length - 1].y, active: false };
    }
    return { ...this.sampleRunPath(run, Math.max(0, elapsed)), active: true };
  }

  /** Draw items grabbed during a run that the gliding player sprite hasn't
   *  reached yet. Each ghost holds its tile until the animation crosses it, so
   *  loot is never gone before you visually touch it. Mirrors the regular item
   *  draw so a ghost is pixel-identical to the item it stands in for. */
  private drawRunGhostItems(t: number, s: Scene) {
    const run = this.playerRunAnim;
    if (!run || run.ghosts.length === 0) return;
    const elapsed = t - run.start;
    if (elapsed >= run.duration) return;
    const progress = elapsed / run.tileMs; // tiles travelled along the path
    for (const g of run.ghosts) {
      if (progress >= g.pathIndex) continue; // sprite has arrived — item is taken
      if (!s.explored[g.y]?.[g.x]) continue;
      this.ctx.globalAlpha = s.visible[g.y]?.[g.x] ? 1 : DIM_ALPHA;
      this.ctx.fillStyle = g.color;
      this.drawGlyph(g.glyph, g.x, g.y, s.tileSize, 0.66);
    }
  }

  private sampleRunPath(run: PlayerRunAnim, elapsedMs: number): RunPathStep {
    if (run.path.length <= 1) return run.path[0] ?? { x: 0, y: 0 };
    const progress = Math.min(run.path.length - 1, elapsedMs / run.tileMs);
    const i = Math.min(run.path.length - 2, Math.floor(progress));
    const a = run.path[i];
    const b = run.path[i + 1];
    const local = easeOutCubic(Math.max(0, Math.min(1, progress - i)));
    return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
  }

  private drawPlayerRunTrail(
    t: number,
    tileSize: number,
    style: DungeonStyle,
    gameOver: boolean,
    gameWon: boolean,
    flash: number
  ) {
    const run = this.playerRunAnim;
    if (!run) return;
    const elapsed = t - run.start;
    for (let i = PLAYER_RUN_ANIMATION.trailCount; i >= 1; i--) {
      const trailElapsed = elapsed - i * PLAYER_RUN_ANIMATION.trailSpacingMs;
      if (trailElapsed < 0) continue;
      const p = this.sampleRunPath(run, trailElapsed);
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, 0.22 - i * 0.032);
      this.drawPlayer(p.x, p.y, tileSize, style, gameOver, gameWon, 0, 0, flash * 0.4);
      this.ctx.restore();
    }
    this.ctx.globalAlpha = 1;
  }

  /** Aggregate the player's attack-lunge offset and damage flash for frame t. */
  private playerFx(t: number, tileSize: number): { dx: number; dy: number; flash: number } {
    let dx = 0;
    let dy = 0;
    let flash = 0;
    for (const f of this.fx) {
      const e = t - f.start;
      if (f.kind === 'strike' && e >= 0 && e < f.life) {
        const dirx = Math.sign((f.toX ?? 0) - (f.fromX ?? 0));
        const diry = Math.sign((f.toY ?? 0) - (f.fromY ?? 0));
        const amp = Math.sin((e / f.life) * Math.PI) * tileSize * 0.42;
        dx += dirx * amp;
        dy += diry * amp;
      } else if (f.kind === 'phit') {
        flash = Math.max(flash, 1 - e / f.life);
      }
    }
    return { dx, dy, flash: Math.max(0, flash) };
  }

  /** Flash strength and horizontal shake for a struck monster at (x, y). */
  private hitAt(t: number, x: number, y: number): { flash: number; shakeX: number } {
    let flash = 0;
    let shakeX = 0;
    for (const f of this.fx) {
      if (f.kind !== 'hit' || f.x !== x || f.y !== y) continue;
      const e = t - f.start;
      flash = Math.max(flash, 1 - e / 300);
      shakeX += Math.sin(e / 24) * 6 * Math.max(0, 1 - e / f.life);
    }
    return { flash: Math.max(0, flash), shakeX };
  }

  private drawFrostBurst(f: Fx, t: number, tileSize: number) {
    const p = Math.min(1, (t - f.start) / f.life);
    const m = this.tileMetrics(f.x!, f.y!, tileSize);
    this.ctx.save();
    this.ctx.globalAlpha = (1 - p) * 0.8;
    this.ctx.strokeStyle = '#8fe9ff';
    this.ctx.lineWidth = Math.max(1.5, tileSize * 0.08);
    this.ctx.beginPath();
    this.ctx.arc(m.cx, m.cy, tileSize * (0.2 + p * 0.35), 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
    this.ctx.globalAlpha = 1;
  }

  private blend(a: string, b: string, t: number): string {
    const pa = this.hexRgb(a);
    const pb = this.hexRgb(b);
    if (!pa || !pb) return a;
    const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
    return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
  }

  private hexRgb(h: string): [number, number, number] | null {
    if (!h.startsWith('#') || h.length < 7) return null;
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  // --- Combat animation triggers (invoked by the engine during combat) ---

  /** Lunge the player a fraction of a tile toward the struck monster. */
  public fxStrike(fromX: number, fromY: number, toX: number, toY: number) {
    this.fx.push({ kind: 'strike', start: this.nowMs(), life: FX_LIFE.strike, fromX, fromY, toX, toY });
    this.ensureLoop();
  }

  /** Flash + shake the monster at (x, y) and float a damage number off it. */
  public fxHit(x: number, y: number, damage: number, crit = false) {
    const start = this.nowMs();
    this.fx.push({ kind: 'hit', start, life: FX_LIFE.hit, x, y });
    this.fx.push({ kind: 'dmg', start, life: FX_LIFE.dmg, x, y, text: `${crit ? '✦' : '-'}${damage}`, crit, jx: Math.random() * 0.4 - 0.2 });
    this.ensureLoop();
  }

  public fxFreeze(x: number, y: number) {
    this.fx.push({ kind: 'freeze', start: this.nowMs(), life: FX_LIFE.freeze, x, y });
    this.ensureLoop();
  }

  public fxDeath(x: number, y: number, glyph: string, color: string) {
    this.fx.push({ kind: 'death', start: this.nowMs(), life: FX_LIFE.death, x, y, glyph, color });
    this.ensureLoop();
  }

  public fxPlayerHit() {
    this.fx.push({ kind: 'phit', start: this.nowMs(), life: FX_LIFE.phit });
    this.ensureLoop();
  }

  /** A swoop streak from (fromX,fromY) to (toX,toY) as a telegraphed dive lands. */
  public fxDive(fromX: number, fromY: number, toX: number, toY: number, color: string) {
    this.fx.push({ kind: 'dive', start: this.nowMs(), life: FX_LIFE.dive, fromX, fromY, toX, toY, color });
    this.ensureLoop();
  }

  /** A dust puff at (x,y) where a dodged attack harmlessly lands. */
  public fxWhiff(x: number, y: number) {
    this.fx.push({ kind: 'whiff', start: this.nowMs(), life: FX_LIFE.whiff, x, y });
    this.ensureLoop();
  }

  /** A floating label (e.g. "dodge", "miss") rising off (x,y). */
  public fxFloat(x: number, y: number, text: string, color = '#9fb4c8') {
    this.fx.push({ kind: 'float', start: this.nowMs(), life: FX_LIFE.float, x, y, text, color, jx: Math.random() * 0.4 - 0.2 });
    this.ensureLoop();
  }

  public fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly PresentationRunGhostItem[] = []) {
    this.playerRunAnim = null;
    if (path.length < 3) return;
    const steps = path.length - 1;
    const tileMs = Math.min(PLAYER_RUN_ANIMATION.msPerTile, PLAYER_RUN_ANIMATION.maxDurationMs / steps);
    const start = this.nowMs();
    this.playerRunAnim = {
      path: path.map(p => ({ x: p.x, y: p.y })),
      start,
      tileMs,
      duration: tileMs * steps,
      ghosts: ghosts.map(g => ({
        x: g.x,
        y: g.y,
        glyph: g.symbol,
        color: g.color,
        pathIndex: g.pathIndex,
      })),
    };
    this.animUntil = Math.max(this.animUntil, start + this.playerRunAnim.duration + PLAYER_RUN_ANIMATION.trailCount * PLAYER_RUN_ANIMATION.trailSpacingMs);
    this.paint(start);
    this.ensureLoop();
  }

  /** Make a monster flit aside (evade) — a quick perpendicular wobble away from
   *  the attacker at (fromX,fromY). */
  public fxMonsterDodge(monsterKey: string, fromX: number, fromY: number) {
    const m = this.scene?.monsters.find(monster => monster.key === monsterKey);
    if (!m) return;
    // Flit perpendicular to the incoming strike: if the blow came along the X
    // axis the monster slips vertically, and vice versa.
    const ax = m.x - fromX;
    const ay = m.y - fromY;
    const dir = Math.abs(ax) >= Math.abs(ay) ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };
    this.dodgeAnim.set(monsterKey, { start: this.nowMs(), dx: dir.dx, dy: dir.dy });
    this.animUntil = Math.max(this.animUntil, this.nowMs() + FX_LIFE.float * 0.35);
    this.fxFloat(m.x, m.y, 'dodge', '#8fe9ff');
    this.ensureLoop();
  }

  /** Choose the player's avatar style and repaint. Intended for a future
   *  character-select UI; the current selection persists for the session. */
  public setPlayerSprite(sprite: PlayerSprite) {
    this.playerSprite = sprite;
    this.paint();
  }

  public getPlayerSprite(): PlayerSprite {
    return this.playerSprite;
  }

  private tileMetrics(gx: number, gy: number, tileSize: number): TileMetrics {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const center = Math.round(tileSize / 2);
    const wallStroke = Math.max(2, Math.round(tileSize * 0.11));
    const wallGap = Math.max(4, Math.round(tileSize * 0.24));

    return {
      gx,
      gy,
      size: tileSize,
      x,
      y,
      cx: x + center,
      cy: y + center,
      wallStroke,
      wallGap,
      railA: center - wallGap / 2,
      railB: center + wallGap / 2,
      passage: Math.max(10, Math.round(tileSize * 0.58)),
    };
  }

  private grid(m: TileMetrics, column: number, row: number): [number, number] {
    return [
      m.x + Math.round((m.size * column) / 8),
      m.y + Math.round((m.size * row) / 8),
    ];
  }

  private drawDungeonTile(
    map: string[][],
    tile: string,
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle
  ) {
    const m = this.tileMetrics(gx, gy, tileSize);

    if (tile === TILE.FLOOR) {
      this.drawFloorDot(m, style.floorDot);
    } else if (tile === TILE.CORRIDOR) {
      this.drawCorridor(map, m, style);
    } else if (tile === TILE.WALL_H || tile === TILE.WALL_V) {
      this.drawWall(m, style, tile);
    } else if (tile === TILE.SECRET_DOOR) {
      const orientation = this.getDoorOrientation(map, gx, gy);
      this.drawWall(m, style, orientation === 'horizontal' ? TILE.WALL_H : TILE.WALL_V);
    } else if (isCorner(tile)) {
      this.drawCorner(m, style, tile);
    } else if (tile === TILE.DOOR) {
      this.drawDoor(map, m, style);
    } else if (STAIR_TILES.has(tile)) {
      this.drawFloorDot(m, style.floorDotDim);
      this.drawStairs(m, style, tile);
    }
  }

  private drawFloorDot(m: TileMetrics, color: string) {
    const radius = Math.max(2, Math.round(m.size * 0.1));
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(m.cx, m.cy, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawTrap(trap: TrapView, tileSize: number) {
    const color: Record<TrapView['kind'], string> = {
      bear: '#d98b42',
      sleep_gas: '#9be27f',
      dart: '#f0d35a',
      teleport: '#72ddff',
      trapdoor: '#d9d9d9',
    };
    this.ctx.fillStyle = color[trap.kind];
    this.drawGlyph('^', trap.x, trap.y, tileSize, 0.66, { weight: trap.armed ? 800 : 600, embolden: trap.armed ? 0.04 : 0 });
  }

  private drawCorridor(map: string[][], m: TileMetrics, style: DungeonStyle) {
    const connects = {
      left: this.connectsToPassage(map[m.gy]?.[m.gx - 1]),
      right: this.connectsToPassage(map[m.gy]?.[m.gx + 1]),
      up: this.connectsToPassage(map[m.gy - 1]?.[m.gx]),
      down: this.connectsToPassage(map[m.gy + 1]?.[m.gx]),
    };
    const rects = this.passageRects(m, connects);

    this.fillPassage(rects, style.corridor);
  }

  private drawWall(
    m: TileMetrics,
    style: DungeonStyle,
    tile: string
  ) {
    // The map now carries explicit `-`/`|` glyphs, so the wall orientation comes
    // straight from the tile rather than being re-inferred from neighbours.
    if (tile === TILE.WALL_H) {
      this.drawDoubleLine(m.x, m.y + m.railA, m.x + m.size, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x, m.y + m.railB, m.x + m.size, m.y + m.railB, m.wallStroke, style);
    } else {
      this.drawDoubleLine(m.x + m.railA, m.y, m.x + m.railA, m.y + m.size, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y, m.x + m.railB, m.y + m.size, m.wallStroke, style);
    }
  }

  /**
   * Draw a room corner as an L-join: the horizontal pair runs toward the
   * adjacent `-` wall, the vertical pair toward the adjacent `|` wall, and the
   * two meet at the cell centre — so the four corner glyphs read distinctly.
   */
  private drawCorner(
    m: TileMetrics,
    style: DungeonStyle,
    tile: string
  ) {
    const atLeft = tile === TILE.CORNER_TL || tile === TILE.CORNER_BL;
    const atTop = tile === TILE.CORNER_TL || tile === TILE.CORNER_TR;
    const xRails = atLeft ? [m.railA, m.railB] : [m.railB, m.railA];
    const yRails = atTop ? [m.railA, m.railB] : [m.railB, m.railA];

    for (let i = 0; i < xRails.length; i++) {
      this.drawRoundedCornerRail(
        m,
        m.x + xRails[i],
        m.y + yRails[i],
        atLeft ? m.x + m.size : m.x,
        atTop ? m.y + m.size : m.y,
        m.wallStroke,
        style
      );
    }
  }

  /** Draw a door as a wall opening whose rails line up with the surrounding wall. */
  private drawDoor(map: string[][], m: TileMetrics, style: DungeonStyle) {
    const orientation = this.getDoorOrientation(map, m.gx, m.gy);
    const inset = Math.round(m.size * 0.24);
    const panelThickness = Math.max(m.passage, Math.round(m.wallGap + m.wallStroke * 1.4));
    const panelHalf = Math.round(panelThickness / 2);
    const seam = Math.max(1, Math.round(m.size * 0.05));

    this.drawDoorPassage(map, m, style, orientation);

    this.ctx.fillStyle = style.door;
    if (orientation === 'horizontal') {
      this.drawDoubleLine(m.x, m.y + m.railA, m.x + inset, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.size - inset, m.y + m.railA, m.x + m.size, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x, m.y + m.railB, m.x + inset, m.y + m.railB, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.size - inset, m.y + m.railB, m.x + m.size, m.y + m.railB, m.wallStroke, style);

      this.ctx.fillRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, panelThickness);
      this.ctx.fillStyle = style.wallShadow;
      this.ctx.fillRect(m.cx - Math.floor(seam / 2), m.cy - panelHalf, seam, panelThickness);
      this.ctx.fillStyle = style.wallHighlight;
      this.ctx.fillRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, 1);
      this.ctx.strokeStyle = style.wallShadow;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, panelThickness);
      this.ctx.strokeStyle = style.wallHighlight;
      this.ctx.beginPath();
      this.ctx.moveTo(m.x + inset + 1, m.cy - panelHalf + 1);
      this.ctx.lineTo(m.x + inset + 1, m.cy + panelHalf - 1);
      this.ctx.moveTo(m.x + m.size - inset - 1, m.cy - panelHalf + 1);
      this.ctx.lineTo(m.x + m.size - inset - 1, m.cy + panelHalf - 1);
      this.ctx.stroke();
    } else {
      this.drawDoubleLine(m.x + m.railA, m.y, m.x + m.railA, m.y + inset, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railA, m.y + m.size - inset, m.x + m.railA, m.y + m.size, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y, m.x + m.railB, m.y + inset, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y + m.size - inset, m.x + m.railB, m.y + m.size, m.wallStroke, style);

      this.ctx.fillRect(m.cx - panelHalf, m.y + inset, panelThickness, m.size - inset * 2);
      this.ctx.fillStyle = style.wallShadow;
      this.ctx.fillRect(m.cx - panelHalf, m.cy - Math.floor(seam / 2), panelThickness, seam);
      this.ctx.fillStyle = style.wallHighlight;
      this.ctx.fillRect(m.cx - panelHalf, m.y + inset, 1, m.size - inset * 2);
      this.ctx.strokeStyle = style.wallShadow;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.cx - panelHalf, m.y + inset, panelThickness, m.size - inset * 2);
      this.ctx.strokeStyle = style.wallHighlight;
      this.ctx.beginPath();
      this.ctx.moveTo(m.cx - panelHalf + 1, m.y + inset + 1);
      this.ctx.lineTo(m.cx + panelHalf - 1, m.y + inset + 1);
      this.ctx.moveTo(m.cx - panelHalf + 1, m.y + m.size - inset - 1);
      this.ctx.lineTo(m.cx + panelHalf - 1, m.y + m.size - inset - 1);
      this.ctx.stroke();
    }
  }

  private drawDoubleLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number,
    style: Pick<DungeonStyle, 'wall' | 'wallShadow' | 'wallHighlight'>
  ) {
    const isVertical = Math.round(x1) === Math.round(x2);
    const highlightDx = isVertical ? -1 : 0;
    const highlightDy = isVertical ? 0 : -1;

    this.ctx.strokeStyle = style.wallShadow;
    this.ctx.lineWidth = lineWidth + 2;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1), Math.round(y1));
    this.ctx.lineTo(Math.round(x2), Math.round(y2));
    this.ctx.stroke();

    this.ctx.strokeStyle = style.wall;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1), Math.round(y1));
    this.ctx.lineTo(Math.round(x2), Math.round(y2));
    this.ctx.stroke();

    this.ctx.strokeStyle = style.wallHighlight;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1 + highlightDx), Math.round(y1 + highlightDy));
    this.ctx.lineTo(Math.round(x2 + highlightDx), Math.round(y2 + highlightDy));
    this.ctx.stroke();
  }

  private drawRoundedCornerRail(
    m: TileMetrics,
    xRail: number,
    yRail: number,
    horizontalEdgeX: number,
    verticalEdgeY: number,
    lineWidth: number,
    style: Pick<DungeonStyle, 'wall' | 'wallShadow' | 'wallHighlight'>
  ) {
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, lineWidth + 2, style.wallShadow, 0, 0);
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, lineWidth, style.wall, 0, 0);
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, 1, style.wallHighlight, -1, -1);
    this.ctx.restore();
  }

  private strokeCornerRail(
    m: TileMetrics,
    xRail: number,
    yRail: number,
    horizontalEdgeX: number,
    verticalEdgeY: number,
    lineWidth: number,
    color: string,
    dx: number,
    dy: number
  ) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(horizontalEdgeX + dx), Math.round(yRail + dy));
    this.ctx.lineTo(Math.round(m.cx + dx), Math.round(yRail + dy));
    this.ctx.quadraticCurveTo(
      Math.round(m.cx + dx),
      Math.round(m.cy + dy),
      Math.round(xRail + dx),
      Math.round(m.cy + dy)
    );
    this.ctx.lineTo(Math.round(xRail + dx), Math.round(verticalEdgeY + dy));
    this.ctx.stroke();
  }

  private drawStairs(m: TileMetrics, style: DungeonStyle, tile: string) {
    const up = tile === TILE.STAIRS_UP;
    const treads = up
      ? [
          [4.4, 2.1, 6.2],
          [3.3, 3.7, 5.1],
          [2.2, 5.3, 4.0],
        ]
      : [
          [2.2, 2.1, 4.0],
          [3.3, 3.7, 5.1],
          [4.4, 5.3, 6.2],
        ];
    const lineWidth = Math.max(2, Math.round(m.size * 0.09));

    this.ctx.save();
    this.ctx.lineCap = 'square';
    this.ctx.lineJoin = 'miter';
    this.ctx.strokeStyle = style.stairs;
    this.ctx.lineWidth = lineWidth;

    for (let i = 0; i < treads.length; i++) {
      const [x1g, yg, x2g] = treads[i];
      const [x1, y] = this.grid(m, x1g, yg);
      const [x2] = this.grid(m, x2g, yg);
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y);
      this.ctx.lineTo(x2, y);
      this.ctx.stroke();

      if (i < treads.length - 1) {
        const [, nextYg] = treads[i + 1];
        const riserXg = up ? x1g : x2g;
        const [rx, ry1] = this.grid(m, riserXg, yg);
        const [, ry2] = this.grid(m, riserXg, nextYg);
        this.ctx.beginPath();
        this.ctx.moveTo(rx, ry1);
        this.ctx.lineTo(rx, ry2);
        this.ctx.stroke();
      }
    }

    this.ctx.fillStyle = style.stairs;
    const arrowY = up ? 1.2 : 6.8;
    const arrowTip = this.grid(m, up ? 5.8 : 5.0, arrowY);
    const left = this.grid(m, up ? 5.2 : 4.4, up ? 1.9 : 6.1);
    const right = this.grid(m, up ? 6.4 : 5.6, up ? 1.9 : 6.1);
    this.ctx.beginPath();
    this.ctx.moveTo(arrowTip[0], arrowTip[1]);
    this.ctx.lineTo(left[0], left[1]);
    this.ctx.lineTo(right[0], right[1]);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawPlayer(
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle,
    gameOver: boolean,
    gameWon: boolean,
    dx = 0,
    dy = 0,
    flash = 0
  ) {
    const m = this.tileMetrics(gx, gy, tileSize);
    const pal = this.playerPalette(style, gameOver, gameWon, flash);
    drawAvatar(this.ctx, this.playerSprite, m.cx + dx, m.cy + dy, tileSize, pal);
  }

  /** Resolve the avatar's working colors from the floor palette and run state.
   *  Every sprite derives its shades from these so a loss recolors the whole
   *  figure red, a win green, and a monster's blow flashes it toward red. */
  private playerPalette(
    style: DungeonStyle,
    gameOver: boolean,
    gameWon: boolean,
    flash: number
  ): PlayerPalette {
    let armor = gameOver ? style.playerDead : gameWon ? style.playerWon : PLAYER_ARMOR;
    let accent = gameOver ? style.playerDead : gameWon ? style.playerWon : PLAYER_ACCENT;
    let skin = gameOver ? style.playerDead : gameWon ? style.playerWon : '#e7c69a';
    const dark = gameOver ? style.playerDead : style.playerFace;
    if (flash > 0) {
      armor = this.blend(armor, '#ff5555', flash * 0.85);
      accent = this.blend(accent, '#ff5555', flash * 0.85);
      skin = this.blend(skin, '#ff5555', flash * 0.85);
    }
    return {
      armor,
      armorDark: this.blend(armor, '#000000', 0.45),
      armorLight: this.blend(armor, '#ffffff', 0.12),
      accent,
      dark,
      skin,
    };
  }

  private drawGlyph(
    ch: string,
    gx: number,
    gy: number,
    tileSize: number,
    maxWidthRatio: number,
    opts: GlyphOpts = {}
  ) {
    // Center the glyph on the tile's floor-dot center; drawGlyphAt handles the
    // ink-box centering, dx shake, and embolden stroke shared with the stage.
    const m = this.tileMetrics(gx, gy, tileSize);
    drawGlyphAt(this.ctx, ch, m.cx, m.cy, tileSize, maxWidthRatio, opts);
  }

  private connectsToPassage(tile: string | undefined): boolean {
    return isWalkable(tile);
  }

  private passageRects(
    m: TileMetrics,
    connects: { left?: boolean; right?: boolean; up?: boolean; down?: boolean }
  ): Array<[number, number, number, number]> {
    const half = Math.round(m.passage / 2);
    const rects: Array<[number, number, number, number]> = [
      [m.cx - half, m.cy - half, m.passage, m.passage],
    ];

    if (connects.left) rects.push([m.x, m.cy - half, half + 1, m.passage]);
    if (connects.right) rects.push([m.cx, m.cy - half, m.size - Math.round(m.size / 2), m.passage]);
    if (connects.up) rects.push([m.cx - half, m.y, m.passage, half + 1]);
    if (connects.down) rects.push([m.cx - half, m.cy, m.passage, m.size - Math.round(m.size / 2)]);

    return rects;
  }

  private drawDoorPassage(
    map: string[][],
    m: TileMetrics,
    style: DungeonStyle,
    orientation: DoorOrientation
  ) {
    const connects = {
      left: orientation === 'vertical' || this.connectsToPassage(map[m.gy]?.[m.gx - 1]),
      right: orientation === 'vertical' || this.connectsToPassage(map[m.gy]?.[m.gx + 1]),
      up: orientation === 'horizontal' || this.connectsToPassage(map[m.gy - 1]?.[m.gx]),
      down: orientation === 'horizontal' || this.connectsToPassage(map[m.gy + 1]?.[m.gx]),
    };

    this.fillPassage(this.passageRects(m, connects), style.corridor);
  }

  private fillPassage(rects: Array<[number, number, number, number]>, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    rects.forEach(([x, y, w, h]) => this.ctx.rect(x, y, w, h));
    this.ctx.fill();
  }

  private getDoorOrientation(map: string[][], gx: number, gy: number): DoorOrientation {
    const left = map[gy]?.[gx - 1];
    const right = map[gy]?.[gx + 1];
    const up = map[gy - 1]?.[gx];
    const down = map[gy + 1]?.[gx];
    const horizontalScore = Number(this.isHorizontalWallMate(left)) + Number(this.isHorizontalWallMate(right));
    const verticalScore = Number(this.isVerticalWallMate(up)) + Number(this.isVerticalWallMate(down));

    return horizontalScore >= verticalScore ? 'horizontal' : 'vertical';
  }

  private isHorizontalWallMate(tile: string | undefined): boolean {
    return tile === TILE.WALL_H || isCorner(tile);
  }

  private isVerticalWallMate(tile: string | undefined): boolean {
    return tile === TILE.WALL_V || isCorner(tile);
  }
}


function sceneFromSnapshot(snapshot: MapSnapshot): Scene {
  return {
    map: snapshot.tiles.map(row => row.map(tile => tile.kind)),
    explored: snapshot.tiles.map(row => row.map(tile => tile.explored)),
    visible: snapshot.tiles.map(row => row.map(tile => tile.visible)),
    player: snapshot.player,
    monsters: snapshot.monsters.map(monster => ({ ...monster })),
    items: snapshot.items.map(item => ({ ...item })),
    traps: snapshot.traps.map(trap => ({ ...trap })),
    tileSize: 20,
    cols: snapshot.cols,
    rows: snapshot.rows,
    dungeonFloor: snapshot.floor,
    gameOver: snapshot.gameOver,
    gameWon: snapshot.gameWon,
    monsterDetectionActive: snapshot.monsterDetectionActive,
  };
}

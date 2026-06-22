import { Player, Monster, Item, StatusEffects, ARMOR_SLOTS, InventoryRef, PotionType } from './types';
import { BALANCE, getScaledXpRequirements, getConfig } from './config';
import { canEquip } from './player';
import { TILE, isCorner, isWalkable } from './tiles';
import { DIM_ALPHA, getDungeonStyle, type DungeonStyle } from './theme';
import {
  ui,
  type EquipOption,
  type EquipSlotView,
  type InventoryActionView,
  type InventoryCell,
  type LogLineView,
} from './ui/store.svelte';
import { rarityVar, hungerView, floorName, titleCase } from './ui/format';
import { SLOT_ICON } from './ui/icons';

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
  kind: 'strike' | 'hit' | 'dmg' | 'death' | 'freeze' | 'phit';
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
} as const;

/** Snapshot of the board for a single frame — lets the animation loop repaint
 *  between turns without the turn-based engine driving every frame. */
interface Scene {
  map: string[][];
  explored: boolean[][];
  visible: boolean[][];
  player: Player;
  monsters: Monster[];
  items: Item[];
  tileSize: number;
  cols: number;
  rows: number;
  dungeonFloor: number;
  gameOver: boolean;
  gameWon: boolean;
}

/** Selectable visual styles for the player avatar. */
export type PlayerSprite = 'rogue' | 'knight' | 'adventurer' | 'mage';

export interface PlayerSpriteOption {
  id: PlayerSprite;
  name: string;
  blurb: string;
}

/** Ordered catalog of avatars. A character-select UI will enumerate this; for
 *  now the choice is made in code via GameUI.setPlayerSprite(). */
export const PLAYER_SPRITE_OPTIONS: PlayerSpriteOption[] = [
  { id: 'rogue', name: 'Rogue', blurb: 'Hooded cloak with glowing eyes.' },
  { id: 'knight', name: 'Knight', blurb: 'Plumed helm and a drawn sword.' },
  { id: 'adventurer', name: 'Adventurer', blurb: 'A plucky everyman hero.' },
  { id: 'mage', name: 'Mage', blurb: 'Pointed hat and a glowing staff.' },
];

export const DEFAULT_PLAYER_SPRITE: PlayerSprite = 'knight';

/** Avatar colors for a living player. Fixed (not floor-themed) so the hero
 *  stays a high-contrast blue against the green floor dots on every floor;
 *  death/victory still recolor to the floor's red/green for state feedback. */
const PLAYER_ARMOR = '#3f8cff';
const PLAYER_ACCENT = '#ffd34d';

/** Working colors a player sprite draws with, resolved per floor and run state. */
interface PlayerPalette {
  armor: string;
  armorDark: string;
  armorLight: string;
  accent: string;
  dark: string;
  skin: string;
}

export class GameUI {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** Monotonic gutter number for the accumulating UI log history. Reset by
   *  resetLog() when a new run starts. */
  private logSeq = 0;

  /** Latest board snapshot, repainted by the animation loop. */
  private scene: Scene | null = null;
  /** In-flight combat effects; the rAF loop runs only while this is non-empty. */
  private fx: Fx[] = [];
  private rafId: number | null = null;

  /** Which avatar the player draws as. Settable in code today; a character-
   *  select UI will drive it later via setPlayerSprite(). */
  private playerSprite: PlayerSprite = DEFAULT_PLAYER_SPRITE;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error("Could not acquire 2D canvas context");
    }
    this.ctx = context;
  }

  public render(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    tileSize: number,
    cols: number,
    rows: number,
    dungeonFloor: number,
    gameOver: boolean,
    gameWon: boolean
  ) {
    // Snapshot the board so the animation loop can repaint between turns
    // without the turn-based engine having to drive every frame.
    this.scene = { map, explored, visible, player, monsters, items, tileSize, cols, rows, dungeonFloor, gameOver, gameWon };

    // Overlay store state only needs refreshing on real turns, not per frame.
    this.syncOverlays(map, visible, player, monsters, cols, rows, gameOver, gameWon);

    this.paint();
    this.ensureLoop();
  }

  /** Paint one frame from the current scene snapshot plus any in-flight combat
   *  effects. Called once per turn by render(), and repeatedly by the rAF loop
   *  while effects are alive. */
  private paint(ts?: number) {
    const s = this.scene;
    if (!s) return;
    const t = ts ?? this.nowMs();
    this.fx = this.fx.filter(f => t - f.start < f.life);

    const style = getDungeonStyle(s.dungeonFloor);
    this.ctx.fillStyle = style.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
      this.drawGlyph(i.symbol, i.x, i.y, s.tileSize, 0.66);
    });
    this.ctx.globalAlpha = 1;

    // Frost bursts sit under the glyphs.
    for (const f of this.fx) {
      if (f.kind === 'freeze') this.drawFrostBurst(f, t, s.tileSize);
    }

    // Draw Monsters — bold, optically centered on the tile dot, with the
    // hit shake/flash applied to whichever monster is being struck.
    s.monsters.forEach(m => {
      if (!s.visible[m.y]?.[m.x]) return;
      const h = this.hitAt(t, m.x, m.y);
      let color = m.frozenTurns > 0 ? '#00ffff' : m.color;
      if (h.flash > 0) color = this.blend(color, '#ffffff', h.flash);
      this.ctx.fillStyle = color;
      this.drawGlyph(m.symbol, m.x, m.y, s.tileSize, 0.95, { weight: 800, sizeRatio: 0.98, dx: h.shakeX, embolden: 0.08 });
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

    // Draw Player (with attack lunge + damage flash)
    const pf = this.playerFx(t, s.tileSize);
    this.drawPlayer(s.player.x, s.player.y, s.tileSize, style, s.gameOver, s.gameWon, pf.dx, pf.dy, pf.flash);

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
    this.ctx.globalAlpha = 1;
  }

  /** Spin a requestAnimationFrame loop while effects are alive; it stops itself
   *  on the first frame with no remaining effects. */
  private ensureLoop() {
    if (this.rafId != null || this.fx.length === 0) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    const step = (ts: number) => {
      this.paint(ts);
      this.rafId = this.fx.length > 0 ? requestAnimationFrame(step) : null;
    };
    this.rafId = requestAnimationFrame(step);
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : 0;
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
    } else if (isCorner(tile)) {
      this.drawCorner(m, style, tile);
    } else if (tile === TILE.DOOR) {
      this.drawDoor(map, m, style);
    } else if (tile === TILE.STAIRS) {
      this.drawFloorDot(m, style.floorDotDim);
      this.drawStairs(m, style);
    }
  }

  private drawFloorDot(m: TileMetrics, color: string) {
    const radius = Math.max(2, Math.round(m.size * 0.1));
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(m.cx, m.cy, radius, 0, Math.PI * 2);
    this.ctx.fill();
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

  private drawStairs(m: TileMetrics, style: DungeonStyle) {
    const [x1, y1] = this.grid(m, 3, 2.4);
    const [x2, y2] = this.grid(m, 5.5, 4);
    const [x3, y3] = this.grid(m, 3, 5.6);
    this.ctx.strokeStyle = style.stairs;
    this.ctx.lineWidth = Math.max(2, Math.round(m.size * 0.1));
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.lineTo(x3, y3);
    this.ctx.stroke();
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

    this.ctx.save();
    this.ctx.translate(m.cx + dx, m.cy + dy);
    switch (this.playerSprite) {
      case 'rogue':
        this.drawRogue(tileSize, pal);
        break;
      case 'adventurer':
        this.drawAdventurer(tileSize, pal);
        break;
      case 'mage':
        this.drawMage(tileSize, pal);
        break;
      case 'knight':
      default:
        this.drawKnight(tileSize, pal);
        break;
    }
    this.ctx.restore();
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

  /** Hooded cloak silhouette with glowing eyes in the shadow. */
  private drawRogue(T: number, pal: PlayerPalette) {
    const ctx = this.ctx;
    ctx.fillStyle = pal.armorDark;
    ctx.beginPath();
    ctx.moveTo(0, -0.47 * T);
    ctx.bezierCurveTo(0.30 * T, -0.40 * T, 0.31 * T, -0.12 * T, 0.25 * T, 0.08 * T);
    ctx.lineTo(0.35 * T, 0.47 * T);
    ctx.lineTo(-0.35 * T, 0.47 * T);
    ctx.lineTo(-0.25 * T, 0.08 * T);
    ctx.bezierCurveTo(-0.31 * T, -0.12 * T, -0.30 * T, -0.40 * T, 0, -0.47 * T);
    ctx.closePath();
    ctx.fill();

    // Inner robe panel
    ctx.fillStyle = pal.armor;
    ctx.beginPath();
    ctx.moveTo(0, -0.16 * T);
    ctx.lineTo(0.13 * T, 0.46 * T);
    ctx.lineTo(-0.13 * T, 0.46 * T);
    ctx.closePath();
    ctx.fill();

    // Face shadow + glowing eyes
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.ellipse(0.03 * T, -0.20 * T, 0.14 * T, 0.17 * T, 0, 0, Math.PI * 2);
    ctx.fill();
    this.disc(-0.04 * T, -0.21 * T, Math.max(0.7, 0.035 * T), pal.accent);
    this.disc(0.10 * T, -0.21 * T, Math.max(0.7, 0.035 * T), pal.accent);

    // Belt
    this.roundFill(-0.13 * T, 0.04 * T, 0.26 * T, 0.04 * T, 0.02 * T, pal.accent);
  }

  /** Plumed helm with a visor slit, pauldrons, and a drawn sword. */
  private drawKnight(T: number, pal: PlayerPalette) {
    const ctx = this.ctx;

    // Plume crest atop the helm
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(-0.02 * T, -0.40 * T);
    ctx.quadraticCurveTo(0.22 * T, -0.52 * T, 0.15 * T, -0.30 * T);
    ctx.quadraticCurveTo(0.05 * T, -0.34 * T, -0.02 * T, -0.40 * T);
    ctx.fill();

    // Breastplate (tapered)
    ctx.fillStyle = pal.armor;
    ctx.beginPath();
    ctx.moveTo(-0.22 * T, -0.02 * T);
    ctx.lineTo(0.22 * T, -0.02 * T);
    ctx.lineTo(0.17 * T, 0.40 * T);
    ctx.lineTo(-0.17 * T, 0.40 * T);
    ctx.closePath();
    ctx.fill();

    // Pauldrons + helm
    this.disc(-0.23 * T, 0.02 * T, 0.12 * T, pal.armor);
    this.disc(0.23 * T, 0.02 * T, 0.12 * T, pal.armor);
    this.disc(0, -0.18 * T, 0.20 * T, pal.armor);

    // Visor: horizontal slot with a vertical breathing slit
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-0.15 * T, -0.21 * T, 0.30 * T, Math.max(2, 0.06 * T));
    ctx.fillRect(-0.045 * T, -0.30 * T, Math.max(2, 0.09 * T), 0.19 * T);

    // Eye glints inside the visor
    ctx.fillStyle = pal.accent;
    const g = Math.max(1, Math.round(0.05 * T));
    ctx.fillRect(-0.10 * T, -0.20 * T, g, g);
    ctx.fillRect(0.06 * T, -0.20 * T, g, g);

    // Sword held at the side
    ctx.strokeStyle = pal.accent;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, 0.06 * T);
    ctx.beginPath();
    ctx.moveTo(0.33 * T, 0.36 * T);
    ctx.lineTo(0.33 * T, -0.34 * T);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 0.045 * T);
    ctx.beginPath();
    ctx.moveTo(0.24 * T, 0.13 * T);
    ctx.lineTo(0.42 * T, 0.13 * T);
    ctx.stroke();
  }

  /** A plucky everyman hero — round head, hair, torso, arms, legs. */
  private drawAdventurer(T: number, pal: PlayerPalette) {
    const ctx = this.ctx;
    // Legs
    this.roundFill(-0.15 * T, 0.24 * T, 0.11 * T, 0.24 * T, 0.04 * T, pal.armorDark);
    this.roundFill(0.05 * T, 0.24 * T, 0.11 * T, 0.24 * T, 0.04 * T, pal.armorDark);
    // Torso
    this.roundFill(-0.17 * T, -0.04 * T, 0.34 * T, 0.34 * T, 0.07 * T, pal.armor);
    // Arms
    this.roundFill(-0.26 * T, 0.0 * T, 0.10 * T, 0.26 * T, 0.05 * T, pal.armorLight);
    this.roundFill(0.16 * T, -0.07 * T, 0.10 * T, 0.25 * T, 0.05 * T, pal.armorLight);
    // Head
    this.disc(0, -0.22 * T, 0.155 * T, pal.skin);
    // Hair
    ctx.fillStyle = pal.armorDark;
    ctx.beginPath();
    ctx.arc(0, -0.24 * T, 0.16 * T, Math.PI * 1.05, Math.PI * 2.0);
    ctx.fill();
    // Eyes
    this.disc(-0.05 * T, -0.21 * T, Math.max(0.6, 0.022 * T), pal.dark);
    this.disc(0.05 * T, -0.21 * T, Math.max(0.6, 0.022 * T), pal.dark);
  }

  /** Pointed hat, robe, and a glowing staff. */
  private drawMage(T: number, pal: PlayerPalette) {
    const ctx = this.ctx;
    // Robe
    ctx.fillStyle = pal.armor;
    ctx.beginPath();
    ctx.moveTo(0, -0.04 * T);
    ctx.lineTo(0.31 * T, 0.46 * T);
    ctx.lineTo(-0.31 * T, 0.46 * T);
    ctx.closePath();
    ctx.fill();
    // Robe highlight
    ctx.fillStyle = pal.armorLight;
    ctx.beginPath();
    ctx.moveTo(0, 0.06 * T);
    ctx.lineTo(0.10 * T, 0.46 * T);
    ctx.lineTo(-0.10 * T, 0.46 * T);
    ctx.closePath();
    ctx.fill();
    // Face
    this.disc(0, -0.11 * T, 0.135 * T, pal.skin);
    // Hat brim
    ctx.fillStyle = pal.armorDark;
    ctx.beginPath();
    ctx.ellipse(0, -0.17 * T, 0.27 * T, 0.06 * T, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hat cone (with a bent tip)
    ctx.beginPath();
    ctx.moveTo(-0.20 * T, -0.18 * T);
    ctx.lineTo(0.20 * T, -0.18 * T);
    ctx.quadraticCurveTo(0.12 * T, -0.42 * T, 0.05 * T, -0.56 * T);
    ctx.quadraticCurveTo(-0.04 * T, -0.34 * T, -0.20 * T, -0.18 * T);
    ctx.closePath();
    ctx.fill();
    // Hat band
    this.roundFill(-0.17 * T, -0.22 * T, 0.34 * T, 0.05 * T, 0.02 * T, pal.accent);
    // Staff
    ctx.strokeStyle = pal.armorDark;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, 0.05 * T);
    ctx.beginPath();
    ctx.moveTo(0.30 * T, 0.47 * T);
    ctx.lineTo(0.30 * T, -0.28 * T);
    ctx.stroke();
    // Glowing orb
    this.disc(0.30 * T, -0.33 * T, Math.max(1.5, 0.07 * T), pal.accent);
  }

  private disc(x: number, y: number, r: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private roundFill(x: number, y: number, w: number, h: number, r: number, color: string) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
  }

  private drawGlyph(
    ch: string,
    gx: number,
    gy: number,
    tileSize: number,
    maxWidthRatio: number,
    opts: { weight?: number; sizeRatio?: number; dx?: number; embolden?: number } = {}
  ) {
    const m = this.tileMetrics(gx, gy, tileSize);
    const weight = opts.weight ?? 700;
    const sizeRatio = opts.sizeRatio ?? 0.72;
    const dx = opts.dx ?? 0;
    const maxWidth = Math.round(tileSize * maxWidthRatio);
    let fontSize = Math.max(12, Math.floor(tileSize * sizeRatio));

    this.ctx.save();
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.font = `${weight} ${fontSize}px "Fira Code", monospace`;
    let metrics = this.ctx.measureText(ch);
    if (metrics.width > maxWidth) {
      fontSize = Math.max(10, Math.floor(fontSize * (maxWidth / metrics.width)));
      this.ctx.font = `${weight} ${fontSize}px "Fira Code", monospace`;
      metrics = this.ctx.measureText(ch);
    }
    // Center the glyph's actual ink box on the tile center (the floor dot), so
    // monsters sit squarely on the cell they occupy regardless of the symbol.
    const asc = metrics.actualBoundingBoxAscent ?? fontSize * 0.7;
    const desc = metrics.actualBoundingBoxDescent ?? 0;
    const x = m.cx + dx;
    const y = m.cy + (asc - desc) / 2;
    // Fira Code tops out at weight 700, so to push monsters bolder still we
    // stroke each glyph in its own fill color, fattening every stem.
    if (opts.embolden) {
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = this.ctx.fillStyle as string;
      this.ctx.lineWidth = Math.max(1, fontSize * opts.embolden);
      this.ctx.strokeText(ch, x, y);
    }
    this.ctx.fillText(ch, x, y);
    this.ctx.restore();
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

  public updateStats(
    player: Player,
    dungeonFloor: number,
    statusEffects: StatusEffects,
    totalDef: number,
    turn = 0
  ) {
    ui.floor = dungeonFloor;
    ui.floorName = floorName(dungeonFloor);
    ui.gold = player.gold;
    ui.def = totalDef;
    ui.turn = turn;
    ui.level = player.level;

    ui.hp = Math.max(0, player.hp);
    ui.maxHp = Math.round(
      statusEffects.vigorTurns > 0
        ? player.maxHp * BALANCE.status.vigorHpMultiplier
        : player.maxHp
    );

    const cfg = getConfig();
    const { hungerFatigued, hungerHungry } = BALANCE.player;
    const hv = hungerView(player.hunger, hungerFatigued, hungerHungry, cfg.hungerMax);
    ui.hungerStatus = hv.status;
    ui.hungerPct = hv.pct;
    ui.hungerTone = hv.tone;

    ui.food = player.inventory.food;
    ui.foodMax = cfg.playerMaxFood;

    const xpReqs = getScaledXpRequirements();
    ui.xp = player.xp;
    ui.xpReq = xpReqs[player.level] || 209800;
    ui.atMaxLevel = player.level >= 20;
  }

  /** Rebuild the equipment, inventory, and potion views in the store. */
  public updateDropdowns(player: Player) {
    ui.equipment = this.buildEquipment(player);
    const inv = this.buildInventory(player);
    ui.inventoryItems = inv.cells;
    ui.inventory = inv.cells.slice(0, ui.inventoryMax);
    ui.inventoryCount = inv.count;
    ui.potions = player.inventory.potions.map((p, i) => ({ idx: i, label: titleCase(p) }));
  }

  private buildEquipment(player: Player): EquipSlotView[] {
    const views: EquipSlotView[] = [];
    const weapons = player.inventory.weapons;
    const mainIdx = player.equipped.mainHand;
    const main = weapons[mainIdx];

    views.push({
      slot: 'mainHand',
      label: 'Main hand',
      icon: SLOT_ICON.mainHand,
      itemName: main && main.name !== 'None' ? main.name : '',
      rarityColor: rarityVar(main?.rarity),
      empty: !main || main.name === 'None',
      options: weapons.map((w, i) => ({
        value: String(i),
        label: `${w.name} (+${w.dmg ?? 0})`,
        rarityColor: rarityVar(w.rarity),
        selected: mainIdx === i,
      })),
    });

    const is2H = main?.type?.startsWith('2h_') || main?.type === 'staff';
    const off = player.equipped.offHand;
    let offName = 'None';
    let offRarity: string | undefined = 'common';
    if (off.startsWith('shield:')) {
      const s = player.inventory.shield[Number(off.split(':')[1])];
      if (s) {
        offName = s.name;
        offRarity = s.rarity;
      }
    } else if (off.startsWith('weapon:')) {
      const w = weapons[Number(off.split(':')[1])];
      if (w) {
        offName = w.name;
        offRarity = w.rarity;
      }
    }

    let offOptions: EquipOption[];
    if (is2H) {
      offOptions = [
        {
          value: 'none:0',
          label: 'Disabled (2H weapon)',
          rarityColor: rarityVar('common'),
          selected: true,
          disabled: true,
        },
      ];
    } else {
      offOptions = [
        { value: 'none:0', label: 'None', rarityColor: rarityVar('common'), selected: off === 'none:0' },
      ];
      player.inventory.shield.forEach((sh, i) => {
        if (i !== 0) {
          const val = 'shield:' + i;
          offOptions.push({
            value: val,
            label: `${sh.name} (${sh.def}/${sh.maxDef})`,
            rarityColor: rarityVar(sh.rarity),
            selected: off === val,
          });
        }
      });
      if (main?.type === 'dagger') {
        weapons.forEach((w, i) => {
          if (w.type === 'dagger' && i !== mainIdx) {
            const val = 'weapon:' + i;
            offOptions.push({
              value: val,
              label: `${w.name} (+${w.dmg ?? 0})`,
              rarityColor: rarityVar(w.rarity),
              selected: off === val,
            });
          }
        });
      }
    }
    views.push({
      slot: 'offHand',
      label: 'Off-hand',
      icon: SLOT_ICON.offHand,
      itemName: is2H || offName === 'None' ? '' : offName,
      rarityColor: rarityVar(offRarity),
      empty: is2H || offName === 'None',
      options: offOptions,
    });

    for (const slot of ARMOR_SLOTS) {
      const list = player.inventory[slot];
      const idx = player.equipped[slot];
      const cur = list[idx];
      views.push({
        slot,
        label: titleCase(slot),
        icon: SLOT_ICON[slot],
        itemName: cur && cur.name !== 'None' ? cur.name : '',
        rarityColor: rarityVar(cur?.rarity),
        empty: !cur || cur.name === 'None',
        options: list.map((a, i) => ({
          value: String(i),
          label: a.name === 'None' ? 'None' : `${a.name} (${a.def}/${a.maxDef})`,
          rarityColor: rarityVar(a.rarity),
          selected: idx === i,
        })),
      });
    }

    return views;
  }

  private buildInventory(player: Player): { cells: InventoryCell[]; count: number } {
    const cells: InventoryCell[] = [];

    if (player.inventory.food > 0) {
      const ref: InventoryRef = { kind: 'food' };
      cells.push({
        icon: 'leaf',
        rarityColor: rarityVar('common'),
        count: player.inventory.food > 1 ? player.inventory.food : undefined,
        label: `Rations ×${player.inventory.food}`,
        detail: `Restores hunger. You can carry ${player.inventory.food}/${getConfig().playerMaxFood}.`,
        ref,
        actions: this.inventoryActions(player, ref),
      });
    }

    const potCounts = new Map<PotionType, number>();
    player.inventory.potions.forEach(p => potCounts.set(p, (potCounts.get(p) ?? 0) + 1));
    for (const [type, n] of potCounts) {
      const ref: InventoryRef = { kind: 'potion', potionType: type };
      cells.push({
        icon: 'potion',
        rarityColor: 'var(--rarity-rare)',
        count: n > 1 ? n : undefined,
        label: `Potion of ${titleCase(type)}${n > 1 ? ` ×${n}` : ''}`,
        detail: this.potionDetail(type),
        ref,
        actions: this.inventoryActions(player, ref),
      });
    }

    player.inventory.weapons.forEach((w, i) => {
      if (i !== player.equipped.mainHand && player.equipped.offHand !== 'weapon:' + i) {
        const ref: InventoryRef = { kind: 'weapon', index: i };
        cells.push({
          icon: 'sword',
          rarityColor: rarityVar(w.rarity),
          label: `${w.name} (+${w.dmg ?? 0})`,
          detail: `${this.weaponTypeLabel(w.type)} weapon. ${w.dmg ?? 0} damage.`,
          ref,
          actions: this.inventoryActions(player, ref),
        });
      }
    });

    for (const slot of ARMOR_SLOTS) {
      player.inventory[slot].forEach((a, i) => {
        if (i !== player.equipped[slot] && a.name !== 'None') {
          const ref: InventoryRef = { kind: 'armor', slot, index: i };
          cells.push({
            icon: SLOT_ICON[slot],
            rarityColor: rarityVar(a.rarity),
            label: `${a.name} (${a.def}/${a.maxDef})`,
            detail: `${titleCase(slot)} armor. ${a.def ?? 0}/${a.maxDef ?? a.def ?? 0} defense.`,
            ref,
            actions: this.inventoryActions(player, ref),
          });
        }
      });
    }

    player.inventory.shield.forEach((s, i) => {
      if (i !== 0 && player.equipped.offHand !== 'shield:' + i) {
        const ref: InventoryRef = { kind: 'shield', index: i };
        cells.push({
          icon: 'shield-dome',
          rarityColor: rarityVar(s.rarity),
          label: `${s.name} (${s.def}/${s.maxDef})`,
          detail: `Off-hand shield. ${s.def ?? 0}/${s.maxDef ?? s.def ?? 0} defense.`,
          ref,
          actions: this.inventoryActions(player, ref),
        });
      }
    });

    return { cells, count: cells.length };
  }

  private inventoryActions(player: Player, ref: InventoryRef): InventoryActionView[] {
    if (ref.kind === 'food') {
      return [{ action: 'use', label: 'Eat' }];
    }
    if (ref.kind === 'potion') {
      return [{ action: 'use', label: 'Drink' }];
    }

    if (ref.kind === 'weapon') {
      const main = canEquip(player, { slot: 'mainHand', index: ref.index });
      const actions: InventoryActionView[] = [
        {
          action: 'equip',
          label: 'Equip main',
          disabled: !main.ok,
          reason: main.ok ? undefined : main.reason,
        },
      ];
      const off = canEquip(player, { slot: 'offHand', value: `weapon:${ref.index}` });
      actions.push({
        action: 'equipOffHand',
        label: 'Equip off-hand',
        disabled: !off.ok,
        reason: off.ok ? undefined : off.reason,
      });
      return actions;
    }

    if (ref.kind === 'armor') {
      const result = canEquip(player, { slot: ref.slot, index: ref.index });
      return [{
        action: 'equip',
        label: `Equip ${titleCase(ref.slot)}`,
        disabled: !result.ok,
        reason: result.ok ? undefined : result.reason,
      }];
    }

    const result = canEquip(player, { slot: 'offHand', value: `shield:${ref.index}` });
    return [{
      action: 'equip',
      label: 'Equip shield',
      disabled: !result.ok,
      reason: result.ok ? undefined : result.reason,
    }];
  }

  private potionDetail(type: string): string {
    if (type === 'healing') return `Restores up to ${BALANCE.potions.healAmount} health.`;
    if (type === 'strength') return `Adds ${BALANCE.combat.strengthBonus} attack for ${BALANCE.status.strengthTurns} turns.`;
    if (type === 'invisibility') return `Makes monsters lose track of you for ${BALANCE.status.invisTurns} turns.`;
    if (type === 'armor') return `Adds ${BALANCE.status.armorDefBonus} defense for ${BALANCE.status.armorTurns} turns.`;
    return 'A mysterious potion.';
  }

  private weaponTypeLabel(type?: string): string {
    if (!type) return 'Unknown';
    return titleCase(type.replace(/^1h_/, 'one-handed ').replace(/^2h_/, 'two-handed ').replace(/_/g, ' '));
  }

  /** Clear the accumulated UI log history and gutter numbering. Called by the
   *  engine when a new run starts (initGame). */
  public resetLog() {
    ui.logs = [];
    this.logSeq = 0;
  }

  /** Turn the engine's rolling log buffer into an accumulating, numbered UI
   *  history. Each engine `addLog` calls this with exactly one new tail line. */
  public renderLogs(logs: string[]) {
    if (logs.length === 0) return;
    this.logSeq++;

    const msg = logs[logs.length - 1];
    const line: LogLineView = { n: this.logSeq, html: msg, highlight: /loot/i.test(msg) };
    const next = [...ui.logs, line];
    while (next.length > 60) next.shift();
    ui.logs = next;
  }

  private escapeHtml(s: string): string {
    return s.replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
    );
  }

  public getStyledItemName(name: string, rarity: string): string {
    return `<span style="color:${rarityVar(rarity)};font-weight:600;">${this.escapeHtml(name)}</span>`;
  }

  /** Push board-derived overlay state (stairs proximity, nearest visible
   *  monster, run state) into the store for the center-stage chrome. */
  private syncOverlays(
    map: string[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    cols: number,
    rows: number,
    gameOver: boolean,
    gameWon: boolean
  ) {
    let stairs = false;
    for (let r = 0; r < rows && !stairs; r++) {
      for (let c = 0; c < cols; c++) {
        if (visible[r]?.[c] && map[r][c] === TILE.STAIRS) {
          stairs = true;
          break;
        }
      }
    }
    ui.stairsNearby = stairs;

    let best: Monster | null = null;
    let bestDist = Infinity;
    for (const m of monsters) {
      if (visible[m.y]?.[m.x]) {
        const d = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y));
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
    }
    ui.nearbyMonster = best
      ? {
          name: best.name,
          hp: Math.max(0, best.hp),
          maxHp: best.maxHp ?? best.hp,
          glyph: best.symbol,
          color: best.color,
          hostile: true,
          subtitle: best.special === 'boss' ? 'Boss' : undefined,
        }
      : null;

    ui.gameOver = gameOver;
    ui.gameWon = gameWon;
  }
}

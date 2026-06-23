/* MonsterStage — a looping "cinematic" of one monster's full combat lifecycle,
 * rendered on its own canvas for the compendium detail view.
 *
 * Unlike the old sparring loop, this plays the whole arc and is driven by the
 * monster's actual behavior profile:
 *   encounter → the monster's signature attack (a telegraphed dive you watch it
 *   commit to, or a quick melee lunge) → the hero striking back (with the
 *   monster flitting aside if it's evasive) → its HP draining → death → respawn.
 *
 * The hero is the player's real avatar (drawAvatar), not a glyph, so the
 * preview matches who you're actually playing. Framework-agnostic: the Svelte
 * wrapper mounts a canvas and calls start()/stop(). Purely time-driven, no RNG. */

import { drawGlyphAt } from './glyph';
import { drawAvatar, alivePlayerPalette, type PlayerSprite, type PlayerPalette } from './avatar';

export interface StageMonster {
  symbol: string;
  color: string;
  boss?: boolean;
}

export interface StageHero {
  sprite: PlayerSprite;
}

/** Behavior summary that shapes which beats the cinematic plays. */
export interface StageBehavior {
  /** 'telegraph' = a wind-up dive the hero could dodge; 'melee' = a quick bite. */
  attackKind: 'telegraph' | 'melee';
  /** Evasive monsters flit aside from the hero's first strike. */
  hasEvasion: boolean;
  /** Erratic movers jitter/flutter rather than holding still. */
  erratic: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => (clamp01(t) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Local 0..1 progress within [from, to]. */
const at = (e: number, from: number, to: number) => clamp01((e - from) / (to - from));

// Lifecycle segment boundaries (ms). LOOP is the full cycle.
const SEG = {
  encounter: [0, 800],
  approach: [800, 1500],
  monAttack: [1500, 2450],
  hero1: [2450, 3150],
  hero2: [3150, 3850],
  hero3: [3850, 4600],
  death: [4600, 5350],
  pause: [5350, 5950],
  respawn: [5950, 6900],
} as const;
export const STAGE_LOOP = 6900;

/** Monster HP fraction at elapsed time `e`, draining at each landing hero
 *  strike. The first strike is dodged (no drop) when the monster is evasive.
 *  Pure and exported so the lifecycle curve is unit-testable. */
export function lifecycleHp(e: number, hasEvasion: boolean): number {
  const beats: Array<[readonly [number, number], number]> = [
    [SEG.hero1, hasEvasion ? 1 : 0.62],
    [SEG.hero2, hasEvasion ? 0.5 : 0.31],
    [SEG.hero3, 0],
  ];
  if (e >= SEG.death[0]) return e >= SEG.respawn[0] ? 1 : 0;
  let hp = 1;
  let prev = 1;
  for (const [seg, target] of beats) {
    const impact = lerp(seg[0], seg[1], 0.5);
    if (e >= impact) hp = lerp(prev, target, at(e, impact, impact + 160));
    prev = target;
  }
  return hp;
}

export class MonsterStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private monster: StageMonster;
  private hero: StageHero;
  private behavior: StageBehavior;
  private pal: PlayerPalette = alivePlayerPalette();
  private rafId: number | null = null;
  private startMs = 0;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement, monster: StageMonster, hero: StageHero, behavior: StageBehavior) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MonsterStage: 2D context unavailable');
    this.ctx = ctx;
    this.monster = monster;
    this.hero = hero;
    this.behavior = behavior;
  }

  setHero(hero: StageHero): void {
    this.hero = hero;
  }

  private resize() {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (typeof requestAnimationFrame === 'undefined') {
      this.resize();
      this.paint(1700); // a representative frame for non-browser (test) envs
      return;
    }
    this.resize();
    this.startMs = performance.now();
    const step = (now: number) => {
      this.paint((now - this.startMs) % STAGE_LOOP);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop() {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  // --- Lifecycle state for one frame --------------------------------------

  /** Render a single lifecycle frame at elapsed time `e` (0..STAGE_LOOP).
   *  Public for tests/scrubbing; the rAF loop calls it internally via paint. */
  renderFrame(e: number): void {
    this.resize();
    this.paint(e);
  }

  private hpAt(e: number): number {
    return lifecycleHp(e, this.behavior.hasEvasion);
  }

  private paint(e: number) {
    const { ctx, w, h, behavior } = this;
    ctx.clearRect(0, 0, w, h);

    const tile = Math.min(h * 0.46, w * 0.26);
    const baseline = h * 0.62;
    const heroRest = w * 0.32;
    const monRest = w * 0.68;
    const idleBob = Math.sin(e / 240) * tile * 0.04;

    let monX = monRest;
    let monY = baseline + idleBob;
    let monScale = 1;
    let monAlpha = 1;
    let monFlash = 0; // toward white when the hero lands a blow
    let monShake = 0;
    let heroX = heroRest;
    let heroShake = 0;
    let telegraph = 0; // 0..1 lock intensity drawn on the hero's tile
    let sparkHero = 0; // impact burst on the hero
    let sparkMon = 0; // impact burst on the monster
    let evade = 0; // monster sidestep wobble
    let whiff = 0; // dust puff (dodged hero strike)
    let death = 0;

    // Erratic monsters jitter while idling/approaching.
    if (behavior.erratic && e < SEG.monAttack[0]) {
      monX += Math.sin(e / 85) * tile * 0.06;
      monY += Math.cos(e / 67) * tile * 0.05;
    }

    if (e < SEG.encounter[1]) {
      // Idle at rest.
    } else if (e < SEG.approach[1]) {
      monX = lerp(monRest, w * 0.56, easeInOut(at(e, ...SEG.approach)));
    } else if (e < SEG.monAttack[1]) {
      const p = at(e, ...SEG.monAttack);
      if (behavior.attackKind === 'telegraph') {
        // Lock on, dive, return.
        telegraph = p < 0.62 ? Math.sin(at(e, SEG.monAttack[0], SEG.monAttack[0] + 560) * Math.PI * 0.5) : 1 - at(e, lerp(SEG.monAttack[0], SEG.monAttack[1], 0.62), lerp(SEG.monAttack[0], SEG.monAttack[1], 0.8));
        if (p >= 0.62 && p < 0.8) {
          const inP = easeOut(at(p, 0.62, 0.78));
          monX = lerp(w * 0.56, heroRest + tile * 0.8, inP);
        } else if (p >= 0.8) {
          monX = lerp(heroRest + tile * 0.8, w * 0.56, easeInOut(at(p, 0.8, 1)));
        }
        if (p >= 0.74 && p < 0.9) {
          sparkHero = 1 - at(p, 0.74, 0.9);
          heroShake = sparkHero * tile * 0.14;
        }
      } else {
        // Melee: windup pullback, lunge, return.
        if (p < 0.45) monX = lerp(w * 0.56, w * 0.6, easeInOut(at(p, 0, 0.45)));
        else if (p < 0.62) monX = lerp(w * 0.6, heroRest + tile * 0.8, easeOut(at(p, 0.45, 0.62)));
        else monX = lerp(heroRest + tile * 0.8, w * 0.56, easeInOut(at(p, 0.62, 1)));
        if (p >= 0.58 && p < 0.74) {
          sparkHero = 1 - at(p, 0.58, 0.74);
          heroShake = sparkHero * tile * 0.14;
        }
      }
    } else if (e < SEG.hero3[1]) {
      // Hero strikes 1–3. Each: lunge in, impact at mid, return.
      const beat = e < SEG.hero1[1] ? SEG.hero1 : e < SEG.hero2[1] ? SEG.hero2 : SEG.hero3;
      const beatIdx = e < SEG.hero1[1] ? 0 : e < SEG.hero2[1] ? 1 : 2;
      const p = at(e, beat[0], beat[1]);
      const isEvade = behavior.hasEvasion && beatIdx === 0;
      // Hero darts toward the monster's resting spot and back.
      const lungeX = monRest - tile * 0.85;
      heroX = p < 0.5 ? lerp(heroRest, lungeX, easeOut(at(p, 0, 0.5))) : lerp(lungeX, heroRest, easeInOut(at(p, 0.5, 1)));
      monX = monRest;
      if (p >= 0.45 && p < 0.62) {
        const hit = 1 - at(p, 0.45, 0.62);
        if (isEvade) {
          evade = Math.sin(at(p, 0.45, 0.85) * Math.PI);
          whiff = hit;
        } else {
          sparkMon = hit;
          monFlash = hit;
          monShake = hit * tile * 0.12;
        }
      }
    } else if (e < SEG.death[1]) {
      death = easeOut(at(e, ...SEG.death));
      monAlpha = 1 - death;
      monScale = 1 - death * 0.45;
      monX = monRest;
    } else if (e < SEG.pause[1]) {
      monAlpha = 0; // arena empty, hero catches its breath
    } else {
      // Respawn: fade + grow back in.
      const p = easeOut(at(e, ...SEG.respawn));
      monAlpha = p;
      monScale = lerp(0.6, 1, p);
      monX = monRest;
    }

    const hp = this.hpAt(e);
    const monDrawX = monX + (monShake ? Math.sin(e / 18) * monShake : 0);
    const monDrawY = monY + (evade ? -evade * tile * 0.5 : 0);

    // --- Render (back to front) ---
    this.drawShadow(heroX, baseline, tile, 1);
    if (monAlpha > 0.05) this.drawShadow(monX, baseline, tile, monAlpha);

    if (telegraph > 0.02) this.drawTelegraph(heroRest, baseline, tile, telegraph, this.monster.color);

    // Hero avatar.
    drawAvatar(ctx, this.hero.sprite, heroX + (heroShake ? Math.sin(e / 16) * heroShake : 0), baseline, tile, this.pal);
    if (sparkHero > 0) this.drawSpark(heroX, baseline, tile, sparkHero, '#ff6a5a');

    // Monster glyph.
    if (monAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = monAlpha;
      if (monScale !== 1) {
        ctx.translate(monDrawX, monDrawY);
        ctx.scale(monScale, monScale);
        ctx.translate(-monDrawX, -monDrawY);
      }
      ctx.fillStyle = monFlash > 0 ? blend(this.monster.color, '#ffffff', monFlash) : this.monster.color;
      drawGlyphAt(ctx, this.monster.symbol, monDrawX, monDrawY, tile, 1.25, { weight: 800, sizeRatio: 0.84, embolden: 0.08 });
      ctx.restore();
      this.drawHpBar(monX, monDrawY - tile * 0.62, tile, hp, monAlpha);
    }

    if (sparkMon > 0) this.drawSpark(monDrawX, monDrawY, tile, sparkMon, '#ffd44d');
    if (whiff > 0) this.drawWhiff(monRest + tile * 0.2, baseline, tile, 1 - whiff);
    if (death > 0 && death < 0.7) this.drawDeathBurst(monRest, baseline, tile, death, this.monster.color);
  }

  // --- Primitives ----------------------------------------------------------

  private drawShadow(x: number, baseY: number, tile: number, alpha: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.28 * alpha;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x, baseY + tile * 0.12, tile * 0.34, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Pulsing corner brackets locking onto the target tile. */
  private drawTelegraph(x: number, baseY: number, tile: number, p: number, color: string) {
    const { ctx } = this;
    const cy = baseY - tile * 0.18;
    const r = tile * (0.42 + (1 - p) * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.4 + p * 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, tile * 0.07);
    ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const cx0 = x + sx * r;
      const cy0 = cy + sy * r;
      const len = tile * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx0 - sx * len, cy0);
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx0, cy0 - sy * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpark(x: number, baseY: number, tile: number, p: number, color: string) {
    const { ctx } = this;
    const cy = baseY - tile * 0.18;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, tile * 0.05);
    const r0 = tile * 0.2;
    const r1 = tile * (0.34 + (1 - p) * 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWhiff(x: number, baseY: number, tile: number, p: number) {
    const { ctx } = this;
    const cy = baseY - tile * 0.18;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.5;
    ctx.strokeStyle = '#b8a98c';
    ctx.lineWidth = Math.max(1, tile * 0.045);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const r0 = tile * 0.1;
      const r1 = tile * (0.16 + p * 0.28);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDeathBurst(x: number, baseY: number, tile: number, p: number, color: string) {
    const { ctx } = this;
    const cy = baseY - tile * 0.18;
    ctx.save();
    ctx.globalAlpha = (1 - p / 0.7) * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, tile * 0.05);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = tile * (0.2 + p * 0.6);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * tile * 0.15, cy + Math.sin(a) * tile * 0.15);
      ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A slim HP bar floating above the monster, green→red as it drains. */
  private drawHpBar(x: number, y: number, tile: number, frac: number, alpha: number) {
    const { ctx } = this;
    const w = tile * 0.9;
    const hgt = Math.max(3, tile * 0.09);
    const x0 = x - w / 2;
    ctx.save();
    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - 1, y - 1, w + 2, hgt + 2);
    const hue = 120 * clamp01(frac); // 120=green → 0=red
    ctx.fillStyle = `hsl(${hue}, 70%, 48%)`;
    ctx.fillRect(x0, y, w * clamp01(frac), hgt);
    ctx.restore();
  }
}

function blend(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))}, ${Math.round(lerp(pa[1], pb[1], t))}, ${Math.round(lerp(pa[2], pb[2], t))})`;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

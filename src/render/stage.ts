/* MonsterStage — a small looping "cinematic" of one monster sparring with a
 * stand-in hero, rendered on its own canvas for the compendium detail view.
 *
 * It deliberately reuses drawGlyphAt so previewed monsters look identical to
 * their in-dungeon glyphs. The performance is a fixed, deterministic timeline
 * (idle → approach → windup → strike → recoil → signature) driven purely by
 * elapsed time, so it loops forever without any RNG or per-monster art.
 *
 * Framework-agnostic on purpose: the Svelte wrapper just mounts a canvas and
 * calls start()/stop(). Part 2's behavior profiles can later drive the timeline
 * instead of this generic melee script. */

import { drawGlyphAt } from './glyph';

export interface StageMonster {
  symbol: string;
  color: string;
  /** Boss monsters get a slightly grander signature flourish. */
  boss?: boolean;
}

const HERO_GLYPH = '@';
const HERO_COLOR = '#3f8cff';
const HERO_ACCENT = '#ffd34d';

// Timeline keyframes in ms; LOOP is the total cycle length.
const T = {
  idleEnd: 650,
  approachEnd: 1350,
  windupEnd: 1700,
  strike: 1880,
  strikeEnd: 2050,
  recoilEnd: 2700,
  signatureEnd: 3450,
  loop: 3900,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) =>
  clamp01(t) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
/** Normalize elapsed time within [from, to] to a 0..1 progress. */
const phase = (e: number, from: number, to: number) => clamp01((e - from) / (to - from));

export class MonsterStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private monster: StageMonster;
  private rafId: number | null = null;
  private startMs = 0;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement, monster: StageMonster) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MonsterStage: 2D context unavailable');
    this.ctx = ctx;
    this.monster = monster;
  }

  /** Size the backing store for the element's box and the device pixel ratio. */
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
      // Non-browser (test) environment: paint a single static frame.
      this.resize();
      this.paint(0);
      return;
    }
    this.resize();
    this.startMs = performance.now();
    const step = (now: number) => {
      this.paint((now - this.startMs) % T.loop);
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

  private paint(e: number) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    const tile = Math.min(h * 0.5, w * 0.28);
    const baseline = h * 0.6;
    const heroRest = w * 0.34;
    const monRest = w * 0.7;
    const idleBob = Math.sin(e / 260) * tile * 0.04;

    // Resolve the actors' positions and combat state for this instant.
    let monX = monRest;
    let monBob = idleBob;
    let heroX = heroRest;
    let heroShake = 0;
    let impactFlash = 0; // 0..1 white flash on the hero at the moment of impact
    let windupGlow = 0; // 0..1 telegraph ring around the monster
    let signature = 0; // 0..1 signature flourish around the monster

    if (e < T.approachEnd) {
      monX = lerp(monRest, w * 0.58, easeOut(phase(e, T.idleEnd, T.approachEnd)));
    } else if (e < T.windupEnd) {
      // Pull back to wind up.
      const p = easeInOut(phase(e, T.approachEnd, T.windupEnd));
      monX = lerp(w * 0.58, w * 0.62, p);
      windupGlow = p;
    } else if (e < T.strikeEnd) {
      // Dart in to strike, then begin returning.
      const inP = easeOut(phase(e, T.windupEnd, T.strike));
      const outP = easeInOut(phase(e, T.strike, T.strikeEnd));
      monX = lerp(lerp(w * 0.62, heroRest + tile * 0.7, inP), w * 0.58, outP);
      windupGlow = 1 - inP;
      impactFlash = e >= T.strike ? 1 - outP : 0;
      heroShake = e >= T.strike ? (1 - outP) * tile * 0.12 : 0;
    } else if (e < T.recoilEnd) {
      monX = lerp(w * 0.58, monRest, easeInOut(phase(e, T.strikeEnd, T.recoilEnd)));
      heroShake = (1 - phase(e, T.strikeEnd, T.recoilEnd)) * tile * 0.05;
    } else if (e < T.signatureEnd) {
      signature = Math.sin(phase(e, T.recoilEnd, T.signatureEnd) * Math.PI);
      monBob = idleBob - signature * tile * 0.06;
    }

    const heroY = baseline + idleBob;
    const monY = baseline + monBob;

    this.drawShadow(heroX, baseline, tile);
    this.drawShadow(monX, baseline, tile);

    // Hero — flickers white on impact, otherwise its steady armor blue.
    ctx.fillStyle = impactFlash > 0 ? blend(HERO_COLOR, '#ffffff', impactFlash) : HERO_COLOR;
    drawGlyphAt(ctx, HERO_GLYPH, heroX + heroShake, heroY, tile, 1.1, {
      weight: 800,
      sizeRatio: 0.82,
      embolden: 0.06,
    });

    if (windupGlow > 0) this.drawRing(monX, monY, tile, windupGlow, this.monster.color, 0.45 + windupGlow * 0.4);
    if (signature > 0) this.drawSignature(monX, monY, tile, signature);

    ctx.fillStyle = this.monster.color;
    drawGlyphAt(ctx, this.monster.symbol, monX, monY, tile, 1.25, {
      weight: 800,
      sizeRatio: 0.84,
      embolden: 0.08,
    });

    if (impactFlash > 0) this.drawImpact(heroX, heroY, tile, impactFlash);
  }

  private drawShadow(x: number, baseY: number, tile: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x, baseY + tile * 0.12, tile * 0.34, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawRing(x: number, y: number, tile: number, p: number, color: string, alpha: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha * (1 - p * 0.3);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, tile * 0.06);
    ctx.beginPath();
    ctx.arc(x, y - tile * 0.18, tile * (0.3 + p * 0.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSignature(x: number, y: number, tile: number, s: number) {
    const { ctx, monster } = this;
    const arcs = monster.boss ? 3 : 2;
    ctx.save();
    for (let i = 0; i < arcs; i++) {
      ctx.globalAlpha = 0.5 * s * (1 - i * 0.25);
      ctx.strokeStyle = monster.color;
      ctx.lineWidth = Math.max(1, tile * 0.05);
      ctx.beginPath();
      ctx.arc(x, y - tile * 0.18, tile * (0.32 + i * 0.16 + s * 0.18), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawImpact(x: number, y: number, tile: number, p: number) {
    const { ctx } = this;
    ctx.save();
    // Spark burst.
    ctx.globalAlpha = p;
    ctx.strokeStyle = HERO_ACCENT;
    ctx.lineWidth = Math.max(1, tile * 0.05);
    const spokes = 6;
    const r0 = tile * 0.22;
    const r1 = tile * (0.34 + (1 - p) * 0.3);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y - tile * 0.18 + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y - tile * 0.18 + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function blend(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

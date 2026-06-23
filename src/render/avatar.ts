/* Shared player-avatar renderer.
 *
 * Extracted from GameUI so the dungeon board and the compendium's cinematic
 * stage draw the *same* hero — knight / rogue / mage / adventurer — rather than
 * the board showing a real sprite and the preview a generic glyph. Every sprite
 * draws relative to a translated origin, so callers pass the pixel center.
 */

export type PlayerSprite = 'rogue' | 'knight' | 'adventurer' | 'mage';

export interface PlayerSpriteOption {
  id: PlayerSprite;
  name: string;
  blurb: string;
}

export const PLAYER_SPRITE_OPTIONS: PlayerSpriteOption[] = [
  { id: 'rogue', name: 'Rogue', blurb: 'Hooded cloak with glowing eyes.' },
  { id: 'knight', name: 'Knight', blurb: 'Plumed helm and a drawn sword.' },
  { id: 'adventurer', name: 'Adventurer', blurb: 'A plucky everyman hero.' },
  { id: 'mage', name: 'Mage', blurb: 'Pointed hat and a glowing staff.' },
];

export const DEFAULT_PLAYER_SPRITE: PlayerSprite = 'knight';

/** Fixed avatar colors for a living hero — high-contrast blue/gold, not floor
 *  themed, so the hero reads against any background. */
export const PLAYER_ARMOR = '#3f8cff';
export const PLAYER_ACCENT = '#ffd34d';

/** Working colors a sprite draws with, resolved per floor and run state. */
export interface PlayerPalette {
  armor: string;
  armorDark: string;
  armorLight: string;
  accent: string;
  dark: string;
  skin: string;
}

function hexRgb(h: string): [number, number, number] | null {
  if (!h.startsWith('#') || h.length < 7) return null;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function blend(a: string, b: string, t: number): string {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  if (!pa || !pb) return a;
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

/** The default living-hero palette (no floor theme) — used by the stage. */
export function alivePlayerPalette(): PlayerPalette {
  return {
    armor: PLAYER_ARMOR,
    armorDark: blend(PLAYER_ARMOR, '#000000', 0.45),
    armorLight: blend(PLAYER_ARMOR, '#ffffff', 0.12),
    accent: PLAYER_ACCENT,
    dark: '#16181f',
    skin: '#e7c69a',
  };
}

/** Draw the chosen avatar centered at (cx, cy) in pixels, sized to `size`. */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  sprite: PlayerSprite,
  cx: number,
  cy: number,
  size: number,
  pal: PlayerPalette,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  switch (sprite) {
    case 'rogue':
      drawRogue(ctx, size, pal);
      break;
    case 'adventurer':
      drawAdventurer(ctx, size, pal);
      break;
    case 'mage':
      drawMage(ctx, size, pal);
      break;
    case 'knight':
    default:
      drawKnight(ctx, size, pal);
      break;
  }
  ctx.restore();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Hooded cloak silhouette with glowing eyes in the shadow. */
function drawRogue(ctx: CanvasRenderingContext2D, T: number, pal: PlayerPalette) {
  ctx.fillStyle = pal.armorDark;
  ctx.beginPath();
  ctx.moveTo(0, -0.47 * T);
  ctx.bezierCurveTo(0.3 * T, -0.4 * T, 0.31 * T, -0.12 * T, 0.25 * T, 0.08 * T);
  ctx.lineTo(0.35 * T, 0.47 * T);
  ctx.lineTo(-0.35 * T, 0.47 * T);
  ctx.lineTo(-0.25 * T, 0.08 * T);
  ctx.bezierCurveTo(-0.31 * T, -0.12 * T, -0.3 * T, -0.4 * T, 0, -0.47 * T);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.armor;
  ctx.beginPath();
  ctx.moveTo(0, -0.16 * T);
  ctx.lineTo(0.13 * T, 0.46 * T);
  ctx.lineTo(-0.13 * T, 0.46 * T);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.ellipse(0.03 * T, -0.2 * T, 0.14 * T, 0.17 * T, 0, 0, Math.PI * 2);
  ctx.fill();
  disc(ctx, -0.04 * T, -0.21 * T, Math.max(0.7, 0.035 * T), pal.accent);
  disc(ctx, 0.1 * T, -0.21 * T, Math.max(0.7, 0.035 * T), pal.accent);

  roundFill(ctx, -0.13 * T, 0.04 * T, 0.26 * T, 0.04 * T, 0.02 * T, pal.accent);
}

/** Plumed helm with a visor slit, pauldrons, and a drawn sword. */
function drawKnight(ctx: CanvasRenderingContext2D, T: number, pal: PlayerPalette) {
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.moveTo(-0.02 * T, -0.4 * T);
  ctx.quadraticCurveTo(0.22 * T, -0.52 * T, 0.15 * T, -0.3 * T);
  ctx.quadraticCurveTo(0.05 * T, -0.34 * T, -0.02 * T, -0.4 * T);
  ctx.fill();

  ctx.fillStyle = pal.armor;
  ctx.beginPath();
  ctx.moveTo(-0.22 * T, -0.02 * T);
  ctx.lineTo(0.22 * T, -0.02 * T);
  ctx.lineTo(0.17 * T, 0.4 * T);
  ctx.lineTo(-0.17 * T, 0.4 * T);
  ctx.closePath();
  ctx.fill();

  disc(ctx, -0.23 * T, 0.02 * T, 0.12 * T, pal.armor);
  disc(ctx, 0.23 * T, 0.02 * T, 0.12 * T, pal.armor);
  disc(ctx, 0, -0.18 * T, 0.2 * T, pal.armor);

  ctx.fillStyle = pal.dark;
  ctx.fillRect(-0.15 * T, -0.21 * T, 0.3 * T, Math.max(2, 0.06 * T));
  ctx.fillRect(-0.045 * T, -0.3 * T, Math.max(2, 0.09 * T), 0.19 * T);

  ctx.fillStyle = pal.accent;
  const g = Math.max(1, Math.round(0.05 * T));
  ctx.fillRect(-0.1 * T, -0.2 * T, g, g);
  ctx.fillRect(0.06 * T, -0.2 * T, g, g);

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
function drawAdventurer(ctx: CanvasRenderingContext2D, T: number, pal: PlayerPalette) {
  roundFill(ctx, -0.15 * T, 0.24 * T, 0.11 * T, 0.24 * T, 0.04 * T, pal.armorDark);
  roundFill(ctx, 0.05 * T, 0.24 * T, 0.11 * T, 0.24 * T, 0.04 * T, pal.armorDark);
  roundFill(ctx, -0.17 * T, -0.04 * T, 0.34 * T, 0.34 * T, 0.07 * T, pal.armor);
  roundFill(ctx, -0.26 * T, 0.0 * T, 0.1 * T, 0.26 * T, 0.05 * T, pal.armorLight);
  roundFill(ctx, 0.16 * T, -0.07 * T, 0.1 * T, 0.25 * T, 0.05 * T, pal.armorLight);
  disc(ctx, 0, -0.22 * T, 0.155 * T, pal.skin);
  ctx.fillStyle = pal.armorDark;
  ctx.beginPath();
  ctx.arc(0, -0.24 * T, 0.16 * T, Math.PI * 1.05, Math.PI * 2.0);
  ctx.fill();
  disc(ctx, -0.05 * T, -0.21 * T, Math.max(0.6, 0.022 * T), pal.dark);
  disc(ctx, 0.05 * T, -0.21 * T, Math.max(0.6, 0.022 * T), pal.dark);
}

/** Pointed hat, robe, and a glowing staff. */
function drawMage(ctx: CanvasRenderingContext2D, T: number, pal: PlayerPalette) {
  ctx.fillStyle = pal.armor;
  ctx.beginPath();
  ctx.moveTo(0, -0.04 * T);
  ctx.lineTo(0.31 * T, 0.46 * T);
  ctx.lineTo(-0.31 * T, 0.46 * T);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.armorLight;
  ctx.beginPath();
  ctx.moveTo(0, 0.06 * T);
  ctx.lineTo(0.1 * T, 0.46 * T);
  ctx.lineTo(-0.1 * T, 0.46 * T);
  ctx.closePath();
  ctx.fill();
  disc(ctx, 0, -0.11 * T, 0.135 * T, pal.skin);
  ctx.fillStyle = pal.armorDark;
  ctx.beginPath();
  ctx.ellipse(0, -0.17 * T, 0.27 * T, 0.06 * T, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.2 * T, -0.18 * T);
  ctx.lineTo(0.2 * T, -0.18 * T);
  ctx.quadraticCurveTo(0.12 * T, -0.42 * T, 0.05 * T, -0.56 * T);
  ctx.quadraticCurveTo(-0.04 * T, -0.34 * T, -0.2 * T, -0.18 * T);
  ctx.closePath();
  ctx.fill();
  roundFill(ctx, -0.17 * T, -0.22 * T, 0.34 * T, 0.05 * T, 0.02 * T, pal.accent);
  ctx.strokeStyle = pal.armorDark;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 0.05 * T);
  ctx.beginPath();
  ctx.moveTo(0.3 * T, 0.47 * T);
  ctx.lineTo(0.3 * T, -0.28 * T);
  ctx.stroke();
  disc(ctx, 0.3 * T, -0.33 * T, Math.max(1.5, 0.07 * T), pal.accent);
}

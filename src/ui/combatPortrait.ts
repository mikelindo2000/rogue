/* Pure geometry/equality helpers for the combat portrait overlay (src/ui.ts).
 *
 * Kept free of canvas/DOM/engine state so the corner-placement and
 * change-detection logic — the parts with real edge cases — can be unit tested
 * directly. GameUI owns focus selection (it needs live Monster identity) and
 * feeds plain grid data in here. */

import type { CombatPortrait, ItemPickupOverlay } from './store.svelte';
import { TILE } from '../tiles';

export type PortraitCorner = CombatPortrait['corner'];

/** Oval diameter in CSS px, scaled off the rendered tile size so it tracks the
 *  board, clamped to a legible range. */
export function portraitSizePx(cols: number, rows: number, tileSize: number): number {
  return Math.max(96, Math.min(200, Math.round(Math.min(cols, rows) * tileSize * 0.28)));
}

export interface CornerPickInputs {
  map: string[][];
  explored: boolean[][];
  /** Tile indices (`y * cols + x`) occupied by a visible monster or item. */
  blockedTiles: Set<number>;
  playerX: number;
  playerY: number;
  cols: number;
  rows: number;
  tileSize: number;
  sizePx: number;
  /** When set, this corner is dropped from the candidate list so two overlays
   *  (combat portrait + item card) never share a corner. */
  excludeCorner?: PortraitCorner;
}

/** Pick a board corner whose oval footprint covers only empty tiles (unexplored
 *  or VOID), so the portrait never overlaps a drawn room/corridor, monster, or
 *  item. Corners are tried farthest-from-player first; returns null when every
 *  corner is blocked. A tile is "drawn map" when it is explored and not VOID —
 *  the same gate the paint loop uses. */
export function pickPortraitCorner(input: CornerPickInputs): PortraitCorner | null {
  const { map, explored, blockedTiles, playerX, playerY, cols, rows, tileSize, sizePx, excludeCorner } = input;

  // Footprint in tiles, plus a one-tile breathing margin. Clamped to the board
  // so the corner origins below can never go negative or out of bounds.
  const span = Math.ceil(sizePx / tileSize) + 1;
  const w = Math.min(span, cols);
  const h = Math.min(span, rows);

  type Corner = { id: PortraitCorner; c0: number; r0: number; ax: number; ay: number };
  const corners: Corner[] = (
    [
      { id: 'tl', c0: 0, r0: 0, ax: 0, ay: 0 },
      { id: 'tr', c0: cols - w, r0: 0, ax: cols - 1, ay: 0 },
      { id: 'bl', c0: 0, r0: rows - h, ax: 0, ay: rows - 1 },
      { id: 'br', c0: cols - w, r0: rows - h, ax: cols - 1, ay: rows - 1 },
    ] satisfies Corner[]
  ).filter(corner => corner.id !== excludeCorner);
  // Farthest corner from the player first, so the portrait sits away from the
  // action when more than one corner is clear.
  corners.sort(
    (a, b) =>
      Math.max(Math.abs(b.ax - playerX), Math.abs(b.ay - playerY)) -
      Math.max(Math.abs(a.ax - playerX), Math.abs(a.ay - playerY))
  );

  const rx = w / 2;
  const ry = h / 2;
  for (const corner of corners) {
    let blocked = false;
    for (let dr = 0; dr < h && !blocked; dr++) {
      for (let dc = 0; dc < w; dc++) {
        // Inscribed-ellipse test: ignore tiles outside the oval so the square
        // corner's outer tiles don't false-positive.
        const nx = (dc + 0.5 - rx) / rx;
        const ny = (dr + 0.5 - ry) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const c = corner.c0 + dc;
        const r = corner.r0 + dr;
        const drawn = explored[r]?.[c] && map[r]?.[c] !== TILE.VOID;
        if (drawn || blockedTiles.has(r * cols + c)) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) return corner.id;
  }
  return null;
}

/** Structural equality for the combat-portrait change check, so the rAF repaint
 *  path doesn't rewrite the store every frame. Compares every field (name/color
 *  included) so the check stays correct even if they ever decouple from `id`. */
export function portraitsEqual(a: CombatPortrait | null, b: CombatPortrait | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.color === b.color &&
    a.corner === b.corner &&
    a.sizePx === b.sizePx &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp
  );
}

/** Structural equality for the item-pickup overlay change check, so the
 *  syncOverlays heartbeat doesn't rewrite the store every projection. `token`
 *  is the authoritative identity (a fresh pickup bumps it), with the projected
 *  fields compared too in case only the corner shifts. */
export function itemPickupsEqual(
  a: ItemPickupOverlay | null,
  b: ItemPickupOverlay | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.token === b.token &&
    a.kind === b.kind &&
    a.name === b.name &&
    a.artUrl === b.artUrl &&
    a.rarityColor === b.rarityColor &&
    a.statLabel === b.statLabel &&
    a.comparisonLabel === b.comparisonLabel &&
    a.comparisonTone === b.comparisonTone &&
    a.corner === b.corner &&
    a.sizePx === b.sizePx
  );
}

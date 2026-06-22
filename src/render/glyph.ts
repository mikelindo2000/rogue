/* Shared glyph renderer.
 *
 * Extracted from GameUI.drawGlyph so the dungeon canvas (src/ui.ts) and the
 * compendium's cinematic stage (src/render/stage.ts) draw monsters with the
 * exact same recipe — Fira Code, ink-box centering, and the stroke-based
 * "embolden" trick that pushes glyphs past Fira Code's 700 weight ceiling.
 *
 * Unlike the original method this takes the tile CENTER in pixels rather than
 * grid coords, so it has no dependency on the dungeon's TileMetrics. GameUI
 * passes its computed center in; the stage passes arbitrary pixel positions. */

export interface GlyphOpts {
  weight?: number;
  sizeRatio?: number;
  dx?: number;
  embolden?: number;
}

export function drawGlyphAt(
  ctx: CanvasRenderingContext2D,
  ch: string,
  cx: number,
  cy: number,
  tileSize: number,
  maxWidthRatio: number,
  opts: GlyphOpts = {}
): void {
  const weight = opts.weight ?? 700;
  const sizeRatio = opts.sizeRatio ?? 0.72;
  const dx = opts.dx ?? 0;
  const maxWidth = Math.round(tileSize * maxWidthRatio);
  let fontSize = Math.max(12, Math.floor(tileSize * sizeRatio));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${weight} ${fontSize}px "Fira Code", monospace`;
  let metrics = ctx.measureText(ch);
  if (metrics.width > maxWidth) {
    fontSize = Math.max(10, Math.floor(fontSize * (maxWidth / metrics.width)));
    ctx.font = `${weight} ${fontSize}px "Fira Code", monospace`;
    metrics = ctx.measureText(ch);
  }
  // Center the glyph's actual ink box on the given center point so symbols of
  // different heights all sit squarely on the tile.
  const asc = metrics.actualBoundingBoxAscent ?? fontSize * 0.7;
  const desc = metrics.actualBoundingBoxDescent ?? 0;
  const x = cx + dx;
  const y = cy + (asc - desc) / 2;
  if (opts.embolden) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.lineWidth = Math.max(1, fontSize * opts.embolden);
    ctx.strokeText(ch, x, y);
  }
  ctx.fillText(ch, x, y);
  ctx.restore();
}

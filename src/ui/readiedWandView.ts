/* Builds the "readied wand" strip shown under the equipment rail. Wands aren't
 * slotted gear — the player carries a set, each with its own cooldown, and 'z'
 * draws the first ready one. This view mirrors that draw order so the strip
 * always shows the wand a zap would actually fire, plus how many wait behind it.
 * Pure data → presentation; the draw logic itself lives in engine.drawFirstWand. */

import type { Player, WandType } from '../types';
import type { IconName } from './icons';
import { rarityVar } from './format';
import { wandCooldown } from '../wands';
import { wandEffectSummary } from './wandView';

export interface ReadiedWandView {
  name: string;
  wandType: WandType;
  icon: IconName;
  rarityColor: string;
  /** One-line effect summary, same copy the inventory tooltip uses. */
  detail: string;
  ready: boolean;
  cooldownRemaining: number;
  cooldownTotal: number;
  /** 0–100 share of the cooldown already recharged (100 when ready). */
  rechargePct: number;
  /** Other wands carried behind this one (drives a subtle "+N"). */
  extraCount: number;
}

/** The wand 'z' would draw: prefer a ready (off-cooldown) wand, else the first
 *  carried wand. Returns null when the pack holds no wands. */
export function buildReadiedWandView(player: Player): ReadiedWandView | null {
  const wands = player.inventory.wands;
  if (wands.length === 0) return null;

  let index = wands.findIndex(w => (w.cooldownRemaining ?? 0) === 0);
  if (index === -1) index = 0;
  const wand = wands[index];

  const remaining = wand.cooldownRemaining ?? 0;
  const total = wandCooldown(wand);
  const ready = remaining <= 0;
  const rechargePct = ready || total <= 0
    ? 100
    : Math.round(((total - remaining) / total) * 100);

  return {
    name: wand.name,
    wandType: wand.wandType,
    icon: `wand-${wand.wandType}`,
    rarityColor: rarityVar(wand.rarity),
    detail: wandEffectSummary(wand.wandType),
    ready,
    cooldownRemaining: remaining,
    cooldownTotal: total,
    rechargePct,
    extraCount: wands.length - 1,
  };
}

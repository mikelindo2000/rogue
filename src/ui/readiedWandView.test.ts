import { describe, expect, it } from 'vitest';
import { createPlayer } from '../player';
import type { WandItem } from '../types';
import { wandCooldown } from '../wands';
import { buildReadiedWandView } from './readiedWandView';

function wand(over: Partial<WandItem> = {}): WandItem {
  return { name: 'Wand of Cold', wandType: 'cold', tier: 'wand', cooldownRemaining: 0, identified: true, ...over };
}

describe('readied wand view', () => {
  it('is null when the player carries no wands', () => {
    expect(buildReadiedWandView(createPlayer())).toBeNull();
  });

  it('readies a ready wand and counts the rest behind it', () => {
    const player = createPlayer();
    player.inventory.wands.push(
      wand({ name: 'Wand of Cold', wandType: 'cold', cooldownRemaining: 3 }),
      wand({ name: 'Wand of Fire', wandType: 'fire', rarity: 'rare', cooldownRemaining: 0 }),
    );

    const view = buildReadiedWandView(player);
    // Mirrors engine.drawFirstWand: the off-cooldown wand is readied, not index 0.
    expect(view).toMatchObject({
      name: 'Wand of Fire',
      icon: 'wand-fire',
      ready: true,
      rechargePct: 100,
      extraCount: 1,
    });
  });

  it('falls back to the first wand when all are recharging, with a partial bar', () => {
    const player = createPlayer();
    const cold = wand({ wandType: 'cold', cooldownRemaining: 1 });
    player.inventory.wands.push(cold, wand({ wandType: 'fire', cooldownRemaining: 2 }));

    const view = buildReadiedWandView(player);
    const total = wandCooldown(cold);
    expect(view).toMatchObject({
      icon: 'wand-cold',
      ready: false,
      cooldownRemaining: 1,
      cooldownTotal: total,
      rechargePct: Math.round(((total - 1) / total) * 100),
      extraCount: 1,
    });
  });
});

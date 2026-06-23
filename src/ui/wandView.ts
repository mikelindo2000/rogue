import type { WandItem, WandType } from '../types';
import { wandCooldown, wandHungerCost } from '../wands';
import type { InventoryTooltipStat } from './store.svelte';

/** One-line, player-facing summary of what each wand does. */
const EFFECT_SUMMARY: Record<WandType, string> = {
  striking: 'Fires a force bolt at the first creature in line.',
  magic_missile: 'A reliable bolt that never misses the first creature in line.',
  lightning: 'A beam that pierces and strikes every creature in line.',
  fire: 'Hurls a fire bolt at the first creature in line.',
  cold: 'A frost bolt that damages and freezes the first creature in line.',
  sleep: 'Lulls the first creature in line into a deep sleep.',
  polymorph: 'Transforms the first creature in line into another beast.',
  teleport_away: 'Banishes the first creature in line elsewhere on the floor.',
  cancellation: "Nullifies the first creature's special powers for a time.",
  drain_life: 'Drains life from the first creature, healing you (costs HP).',
  light: 'Floods your current room with permanent light.',
  invisibility: 'Turns you invisible for a time.',
  nothing: 'Does nothing at all. A dud.',
};

export function wandEffectSummary(type: WandType): string {
  return EFFECT_SUMMARY[type];
}

export function wandLabel(wand: WandItem): string {
  return (wand.cooldownRemaining ?? 0) > 0
    ? `${wand.name} (recharging ${wand.cooldownRemaining})`
    : wand.name;
}

export function wandDetail(wand: WandItem): string {
  return EFFECT_SUMMARY[wand.wandType];
}

export function wandTooltipStats(wand: WandItem): InventoryTooltipStat[] {
  const stats: InventoryTooltipStat[] = [
    { label: 'Tier', value: wand.tier === 'staff' ? 'Staff' : 'Wand' },
    { label: 'Cooldown', value: `${wandCooldown(wand)} turns` },
    { label: 'Hunger', value: `${wandHungerCost(wand)}` },
  ];
  if ((wand.cooldownRemaining ?? 0) > 0) {
    stats.push({ label: 'Recharging', value: `${wand.cooldownRemaining}` });
  }
  return stats;
}

import { SCROLL_TYPES, potionVisual, scrollVisual, wandVisual } from '../itemVisuals';
import { scrollDisplayName } from '../scrolls';
import type { PotionType, ScrollType, WandType } from '../types';
import { titleCase } from './format';
import { ICONS, type IconName } from './icons';
import { enrichOutsideSpans, escapeHtml } from './monsterMention';

interface ItemMentionView {
  id: string;
  label: string;
  icon: IconName;
  color: string;
}

const itemMentions: ItemMentionView[] = [
  ...(['healing', 'strength', 'invisibility', 'armor'] as const satisfies readonly PotionType[]).map((type) => {
    const visual = potionVisual(type);
    return {
      id: `potion-${type}`,
      label: `Potion of ${titleCase(type)}`,
      icon: visual.icon,
      color: visual.uiColor,
    };
  }),
  ...SCROLL_TYPES.map((type: ScrollType) => {
    const visual = scrollVisual(type);
    return {
      id: `scroll-${type}`,
      label: scrollDisplayName(type),
      icon: visual.icon,
      color: visual.uiColor,
    };
  }),
  ...([
    'striking', 'magic_missile', 'lightning', 'fire', 'cold', 'sleep',
    'polymorph', 'teleport_away', 'cancellation', 'drain_life', 'light',
    'invisibility', 'nothing',
  ] as const satisfies readonly WandType[]).map((type) => {
    const visual = wandVisual(type);
    return {
      id: `wand-${type}`,
      label: `Wand of ${titleCase(type.replace(/_/g, ' '))}`,
      icon: visual.icon,
      color: visual.uiColor,
    };
  }),
].sort((a, b) => b.label.length - a.label.length);

const itemNamePattern = new RegExp(
  `(^|[^A-Za-z0-9])(${itemMentions.map((m) => escapeRegExp(m.label)).join('|')})(?=$|[^A-Za-z0-9])`,
  'gi'
);

const mentionByName = new Map(itemMentions.map((m) => [m.label.toLowerCase(), m]));

export function enrichItemMentionsHtml(message: string): string {
  return enrichOutsideSpans(message, enrichItemTextSegment);
}

function enrichItemTextSegment(segment: string): string {
  let cursor = 0;
  let out = '';
  for (const match of segment.matchAll(itemNamePattern)) {
    const prefix = match[1] ?? '';
    const matchedName = match[2] ?? '';
    const matchStart = match.index ?? 0;
    const nameStart = matchStart + prefix.length;
    const mention = mentionByName.get(matchedName.toLowerCase());
    if (!mention) continue;

    out += escapeHtml(segment.slice(cursor, nameStart));
    out += itemMentionHtml(mention, labelForMatch(mention.label, matchedName));
    cursor = nameStart + matchedName.length;
  }
  out += escapeHtml(segment.slice(cursor));
  return out;
}

function itemMentionHtml(mention: ItemMentionView, label: string): string {
  return `<span class="item-mention item-mention--log" style="--item-color:${escapeAttr(mention.color)}" data-item-id="${escapeAttr(mention.id)}" title="${escapeAttr(mention.label)}"><svg class="item-mention__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[mention.icon]}</svg><span class="item-mention__name">${escapeHtml(label)}</span></span>`;
}

function labelForMatch(canonical: string, matched: string): string {
  return matched === matched.toUpperCase() ? canonical.toUpperCase() : canonical;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

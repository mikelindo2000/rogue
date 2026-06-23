import { MONSTER_DATABASE } from '../config';
import type { Monster, MonsterTemplate } from '../types';
import { monsterId } from '../discovery';

export interface MonsterMentionView {
  id: string;
  name: string;
  glyph: string;
  color: string;
  boss: boolean;
}

type MonsterMentionSource = Pick<Monster | MonsterTemplate, 'id' | 'name' | 'symbol' | 'color' | 'special'>;

const monsterMentions = MONSTER_DATABASE
  .map(monsterMentionView)
  .sort((a, b) => b.name.length - a.name.length);

const monsterNamePattern = new RegExp(
  `(^|[^A-Za-z0-9])(${monsterMentions.map((m) => escapeRegExp(m.name)).join('|')})(?=$|[^A-Za-z0-9])`,
  'gi'
);

const mentionByName = new Map(monsterMentions.map((m) => [m.name.toLowerCase(), m]));

export function monsterMentionView(monster: MonsterMentionSource): MonsterMentionView {
  return {
    id: monsterId(monster),
    name: monster.name,
    glyph: monster.symbol,
    color: monster.color,
    boss: monster.special === 'boss',
  };
}

export function monsterMentionHtml(
  mention: MonsterMentionView,
  variant: 'inline' | 'log' = 'inline',
  label = mention.name
): string {
  const bossClass = mention.boss ? ' monster-mention--boss' : '';
  return `<span class="monster-mention monster-mention--${variant}${bossClass}" style="--monster-color:${escapeAttr(mention.color)}" data-monster-id="${escapeAttr(mention.id)}" title="${escapeAttr(mention.name)}"><span class="monster-mention__glyph" aria-hidden="true">${escapeHtml(mention.glyph)}</span><span class="monster-mention__name">${escapeHtml(label)}</span></span>`;
}

export function enrichMonsterMentionsHtml(message: string): string {
  return enrichOutsideSpans(message, enrichTextSegment);
}

// Apply `enrichSegment` to the plain-text portions of `message`, passing any
// existing (trusted) `<span>` markup through verbatim so already-styled markup
// — e.g. rarity-colored item names from getStyledItemName — is not re-escaped.
export function enrichOutsideSpans(
  message: string,
  enrichSegment: (segment: string) => string
): string {
  const trustedSpan = /<span\b[^>]*>.*?<\/span>/gis;
  let cursor = 0;
  let out = '';
  for (const match of message.matchAll(trustedSpan)) {
    const index = match.index ?? 0;
    out += enrichSegment(message.slice(cursor, index));
    out += match[0];
    cursor = index + match[0].length;
  }
  out += enrichSegment(message.slice(cursor));
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  );
}

function enrichTextSegment(segment: string): string {
  let cursor = 0;
  let out = '';
  for (const match of segment.matchAll(monsterNamePattern)) {
    const full = match[0];
    const prefix = match[1] ?? '';
    const matchedName = match[2] ?? '';
    const matchStart = match.index ?? 0;
    const nameStart = matchStart + prefix.length;
    const mention = mentionByName.get(matchedName.toLowerCase());
    if (!mention) continue;

    out += escapeHtml(segment.slice(cursor, nameStart));
    out += monsterMentionHtml(mention, 'log', labelForMatch(mention.name, matchedName));
    cursor = nameStart + matchedName.length;

    if (full.length === prefix.length + matchedName.length) continue;
  }
  out += escapeHtml(segment.slice(cursor));
  return out;
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

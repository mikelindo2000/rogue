import { enrichItemMentionsHtml } from './itemMention';
import { enrichMonsterMentionsHtml, enrichOutsideSpans } from './monsterMention';
import { TILE } from '../tiles';

export function enrichLogMessageHtml(message: string): string {
  const stairHtml = enrichStairMentionsHtml(message);
  const itemHtml = enrichItemMentionsHtml(stairHtml);
  const protectedMentions: string[] = [];
  const tokenized = itemHtml.replace(
    /<span class="item-mention[\s\S]*?<\/svg><span class="item-mention__name">[\s\S]*?<\/span><\/span>/g,
    (match) => {
      const token = `%%ROGUE_ITEM_MENTION_${protectedMentions.length}%%`;
      protectedMentions.push(match);
      return token;
    }
  );
  const enriched = enrichMonsterMentionsHtml(tokenized);
  return protectedMentions.reduce(
    (html, mention, index) => html.replace(`%%ROGUE_ITEM_MENTION_${index}%%`, mention),
    enriched
  );
}

function enrichStairMentionsHtml(message: string): string {
  return enrichOutsideSpans(message, (segment) =>
    segment.replace(
      new RegExp(`\\(${escapeRegExp(TILE.STAIRS_UP)} or ${escapeRegExp(TILE.STAIRS_DOWN)}\\)`, 'g'),
      `(<span class="stair-mention stair-mention--up" title="Stairs up">${escapeHtmlForTrustedSpan(TILE.STAIRS_UP)}</span> or <span class="stair-mention stair-mention--down" title="Stairs down">${escapeHtmlForTrustedSpan(TILE.STAIRS_DOWN)}</span>)`
    )
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtmlForTrustedSpan(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  );
}

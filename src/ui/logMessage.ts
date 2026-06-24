import { enrichItemMentionsHtml } from './itemMention';
import { enrichMonsterMentionsHtml, enrichOutsideSpans } from './monsterMention';

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
      /\(up or down\)/g,
      `(<span class="stair-mention stair-mention--up" role="img" aria-label="stairs up" title="Stairs up"></span> or <span class="stair-mention stair-mention--down" role="img" aria-label="stairs down" title="Stairs down"></span>)`
    )
  );
}

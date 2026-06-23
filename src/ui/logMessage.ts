import { enrichItemMentionsHtml } from './itemMention';
import { enrichMonsterMentionsHtml } from './monsterMention';

export function enrichLogMessageHtml(message: string): string {
  const itemHtml = enrichItemMentionsHtml(message);
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

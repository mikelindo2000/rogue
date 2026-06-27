import { rarityVar } from '../ui/format';
import { escapeHtml } from '../ui/monsterMention';

export function formatStyledItemName(name: string, rarity: string): string {
  return `<span style="color:${rarityVar(rarity)};font-weight:600;">${escapeHtml(name)}</span>`;
}

import type { MonsterTemplate } from '../types';
import { monsterId } from '../discovery';

export function monsterArtUrl(monster: MonsterTemplate): string {
  return `/bestiary/${monsterId(monster)}.png`;
}

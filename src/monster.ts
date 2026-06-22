import { Monster, Player, StatusEffects } from './types';
import { getScaledMonsterAtk } from './config';
import { isWalkable } from './tiles';

export function wanderMonster(
  m: Monster,
  map: string[][],
  cols: number,
  rows: number,
  monsters: Monster[]
) {
  if (Math.random() < 0.4) return;
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  const d = dirs[Math.floor(Math.random() * dirs.length)];
  if (!d) return;

  const tx = m.x + d.x;
  const ty = m.y + d.y;

  if (
    tx >= 0 &&
    tx < cols &&
    ty >= 0 &&
    ty < rows &&
    isWalkable(map[ty]?.[tx]) &&
    !monsters.some(o => o.x === tx && o.y === ty)
  ) {
    m.x = tx;
    m.y = ty;
  }
}

export function processMonsterAI(
  monsters: Monster[],
  player: Player,
  statusEffects: StatusEffects,
  map: string[][],
  cols: number,
  rows: number,
  totalDef: number,
  addLog: (msg: string) => void
) {
  monsters.forEach(m => {
    if (m.frozenTurns > 0) {
      m.frozenTurns--;
      return;
    }

    const dist = Math.abs(m.x - player.x) + Math.abs(m.y - player.y);

    if (statusEffects.invisTurns > 0) {
      wanderMonster(m, map, cols, rows, monsters);
      return;
    }

    if (dist === 1) {
      // Scale monster base attack on-the-fly using the slider config value
      const activeAtk = getScaledMonsterAtk(m.atk);
      const rawDmg = Math.floor(Math.random() * activeAtk) + 1;
      let isSwipe = false;

      if (m.name === 'Marcus the Brave') {
        if (m.swipeTurn === undefined) {
          m.swipeTurn = false;
        }
        if (m.swipeTurn) {
          isSwipe = true;
        }
        m.swipeTurn = !m.swipeTurn;
      }

      let dmg = Math.max(1, Math.floor((rawDmg - Math.floor(totalDef / 4)) * 0.5));
      if (isSwipe) {
        dmg *= 2;
      }

      player.hp -= dmg;
      if (isSwipe) {
        addLog(`${m.name} uses Swipe! hits for ${dmg} dmg.`);
      } else {
        addLog(`${m.name} hits for ${dmg} dmg.`);
      }
    } else if (dist < 6) {
      const stepX = m.x + Math.sign(player.x - m.x);
      const stepY = m.y + Math.sign(player.y - m.y);

      // Simple pathfinding: try X, then Y
      if (isWalkable(map[m.y]?.[stepX]) && !monsters.some(o => o.x === stepX && o.y === m.y)) {
        m.x = stepX;
      } else if (isWalkable(map[stepY]?.[m.x]) && !monsters.some(o => o.x === m.x && o.y === stepY)) {
        m.y = stepY;
      }
    }
  });
}

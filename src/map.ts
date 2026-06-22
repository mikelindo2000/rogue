import { Item, Monster } from './types';
import { MONSTER_DATABASE } from './config';
import { rollLootRarity, generateGearItem } from './items';
import { TILE } from './tiles';

interface Room {
  x: number;
  y: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

/**
 * Walks the carved map and decorates it with original-Rogue scenery:
 *   - every void tile that hugs a room floor becomes a `-`/`|` wall,
 *   - every corridor tile that touches a room floor becomes a `+` door.
 * Corridors themselves are left bare (dark passages), exactly as in Rogue.
 */
function decorateWalls(map: string[][], cols: number, rows: number) {
  const anyFloorAround = (r: number, c: number) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (map[r + dr]?.[c + dc] === TILE.FLOOR) return true;
      }
    }
    return false;
  };

  // Snapshot the carved layer so neighbor tests aren't polluted mid-pass.
  const carved = map.map(row => row.slice());

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = carved[r][c];

      if (tile === TILE.VOID && anyFloorAround(r, c)) {
        const floorAbove = carved[r - 1]?.[c] === TILE.FLOOR;
        const floorBelow = carved[r + 1]?.[c] === TILE.FLOOR;
        // Top/bottom edges (and corners, by default) read as horizontal walls;
        // left/right edges read as vertical walls — matching Rogue's `-`/`|`.
        if (floorAbove || floorBelow) {
          map[r][c] = TILE.WALL_H;
        } else if (carved[r]?.[c - 1] === TILE.FLOOR || carved[r]?.[c + 1] === TILE.FLOOR) {
          map[r][c] = TILE.WALL_V;
        } else {
          map[r][c] = TILE.WALL_H;
        }
      } else if (tile === TILE.CORRIDOR) {
        // A door is only stamped where a corridor genuinely pierces a wall:
        // room floor on one side, the corridor continuing on the opposite
        // side. This avoids littering doors along corridors that merely run
        // beside a room.
        const fAbove = carved[r - 1]?.[c] === TILE.FLOOR;
        const fBelow = carved[r + 1]?.[c] === TILE.FLOOR;
        const fLeft = carved[r]?.[c - 1] === TILE.FLOOR;
        const fRight = carved[r]?.[c + 1] === TILE.FLOOR;
        const cAbove = carved[r - 1]?.[c] === TILE.CORRIDOR;
        const cBelow = carved[r + 1]?.[c] === TILE.CORRIDOR;
        const cLeft = carved[r]?.[c - 1] === TILE.CORRIDOR;
        const cRight = carved[r]?.[c + 1] === TILE.CORRIDOR;

        const verticalDoor = (fAbove && cBelow) || (fBelow && cAbove);
        const horizontalDoor = (fLeft && cRight) || (fRight && cLeft);
        if (verticalDoor || horizontalDoor) {
          map[r][c] = TILE.DOOR;
        }
      }
    }
  }
}

export function generateLevel(
  dungeonFloor: number,
  playerLevel: number,
  cols: number,
  rows: number
): {
  map: string[][];
  playerX: number;
  playerY: number;
  monsters: Monster[];
  items: Item[];
  stairsX: number;
  stairsY: number;
} {
  const map: string[][] = new Array(rows).fill(0).map(() => new Array(cols).fill(TILE.VOID));
  const monsters: Monster[] = [];
  const items: Item[] = [];
  const rooms: Room[] = [];

  const maxRooms = dungeonFloor === 20 ? 4 : 7;
  for (let roomAttempts = 0; roomAttempts < 35; roomAttempts++) {
    if (rooms.length >= maxRooms) break;
    const w = Math.floor(Math.random() * 6) + 5;
    const h = Math.floor(Math.random() * 5) + 4;
    const x = Math.floor(Math.random() * (cols - w - 2)) + 1;
    const y = Math.floor(Math.random() * (rows - h - 2)) + 1;

    // Check collision with existing rooms
    if (rooms.some(r => x < r.x1 + r.w && x + w > r.x1 && y < r.y1 + r.h && y + h > r.y1)) {
      continue;
    }

    // Carve out room floors
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        map[r][c] = TILE.FLOOR;
      }
    }

    const center: Room = {
      x: Math.floor(x + w / 2),
      y: Math.floor(y + h / 2),
      x1: x,
      y1: y,
      w: w,
      h: h
    };

    if (rooms.length > 0) {
      // Bore an L-shaped corridor between room centers. Only excavate rock —
      // never overwrite a room floor we tunnel through.
      const p = rooms[rooms.length - 1];
      let cx = p.x;
      let cy = p.y;
      while (cx !== center.x) {
        if (map[cy][cx] === TILE.VOID) map[cy][cx] = TILE.CORRIDOR;
        cx += (cx < center.x) ? 1 : -1;
      }
      while (cy !== center.y) {
        if (map[cy][cx] === TILE.VOID) map[cy][cx] = TILE.CORRIDOR;
        cy += (cy < center.y) ? 1 : -1;
      }
    }
    rooms.push(center);
  }

  // Wrap rooms in walls and stamp doorways where corridors meet them.
  decorateWalls(map, cols, rows);

  const playerX = rooms[0].x;
  const playerY = rooms[0].y;

  let stairsX = -1;
  let stairsY = -1;
  if (dungeonFloor < 20) {
    stairsX = rooms[rooms.length - 1].x;
    stairsY = rooms[rooms.length - 1].y;
    map[stairsY][stairsX] = TILE.STAIRS;
  }

  // Spawn Marcus the Brave on floor 1 for testing
  if (dungeonFloor === 1) {
    const marcus = MONSTER_DATABASE.find(m => m.name === 'Marcus the Brave');
    if (marcus) {
      monsters.push({
        x: rooms[0].x + 2,
        y: rooms[0].y,
        frozenTurns: 0,
        ...JSON.parse(JSON.stringify(marcus))
      });
    }
  }

  // Boss rooms setup on floor 20
  if (dungeonFloor === 20) {
    const r = rooms[rooms.length - 1];
    const bosses = MONSTER_DATABASE.filter(m => m.special === 'boss');
    bosses.forEach((boss, index) => {
      monsters.push({
        x: r.x + index,
        y: r.y,
        frozenTurns: 0,
        ...JSON.parse(JSON.stringify(boss))
      });
    });
  } else {
    // Normal floor item and monster spawns
    const spawnItem = (room: Room, type: Item['type'], sym: string, color: string, data: any = null) => {
      const rx = room.x1 + Math.floor(Math.random() * (room.w - 2)) + 1;
      const ry = room.y1 + Math.floor(Math.random() * (room.h - 2)) + 1;
      if (!items.some(it => it.x === rx && it.y === ry)) {
        items.push({
          x: rx,
          y: ry,
          type: type,
          symbol: sym,
          color: color,
          data: data ? JSON.parse(JSON.stringify(data)) : null
        });
      }
    };

    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];

      // Spawn food
      if (Math.random() < 0.28) {
        spawnItem(room, 'food', '%', '#ff9900');
      }

      // Spawn miscellaneous consumables
      if (Math.random() < 0.65) {
        const rand = Math.random();
        if (rand < 0.25) {
          spawnItem(room, 'gold', '$', '#ffff55');
        } else if (rand < 0.65) {
          const potionPool = ['healing', 'strength', 'invisibility', 'armor'];
          const chosenP = potionPool[Math.floor(Math.random() * potionPool.length)];
          spawnItem(room, 'potion', '!', '#00ffff', { potionType: chosenP });
        } else if (rand < 0.85) {
          spawnItem(room, 'scroll', '?', '#cc66ff');
        } else {
          spawnItem(room, 'repair_scroll', '?', '#ff00ff');
        }
      }

      // Spawn gear
      if (Math.random() < 0.45) {
        const rarity = rollLootRarity(dungeonFloor);
        const gear = generateGearItem(dungeonFloor, rarity);
        if (gear) {
          const cat = gear.category;
          const sym = cat.includes('sword') || cat.includes('mace') || cat === 'dagger' || cat === 'staff' ? ')' : '[';
          const color = gear.color;
          spawnItem(room, 'gear', sym, color, gear);
        }
      }

      // Spawn monsters
      if (Math.random() < 0.82) {
        const validMobs = MONSTER_DATABASE.filter(m =>
          dungeonFloor >= m.minFloor &&
          playerLevel >= m.minFloor &&
          m.special !== 'boss'
        );
        if (validMobs.length > 0) {
          const tmpl = validMobs[Math.floor(Math.random() * validMobs.length)];
          const mx = room.x1 + 1;
          const my = room.y1 + 1;
          // Avoid spawning directly on top of another monster
          if (!monsters.some(m => m.x === mx && m.y === my)) {
            monsters.push({
              x: mx,
              y: my,
              frozenTurns: 0,
              ...JSON.parse(JSON.stringify(tmpl))
            });
          }
        }
      }
    }
  }

  return {
    map,
    playerX,
    playerY,
    monsters,
    items,
    stairsX,
    stairsY
  };
}

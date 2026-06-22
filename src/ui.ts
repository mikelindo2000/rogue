import { Player, Monster, Item, StatusEffects, GearItem, ARMOR_SLOTS } from './types';
import { RARITY_CONFIG, BALANCE, getScaledXpRequirements } from './config';
import { TILE, isCorner } from './tiles';
import { DIM_ALPHA, getDungeonStyle, type DungeonStyle } from './theme';
import type { GameSelect, SelectOption } from './components/game-select';

export class GameUI {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private logBox: HTMLElement;

  constructor(canvasId: string, logBoxId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error("Could not acquire 2D canvas context");
    }
    this.ctx = context;
    this.logBox = document.getElementById(logBoxId) as HTMLElement;
  }

  public render(
    map: string[][],
    explored: boolean[][],
    visible: boolean[][],
    player: Player,
    monsters: Monster[],
    items: Item[],
    tileSize: number,
    cols: number,
    rows: number,
    dungeonFloor: number,
    gameOver: boolean,
    gameWon: boolean
  ) {
    const style = getDungeonStyle(dungeonFloor);
    this.ctx.fillStyle = style.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.font = `700 ${Math.max(14, Math.floor(tileSize * 0.78))}px "Fira Code", monospace`;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';

    const half = tileSize / 2;
    const glyph = (ch: string, gx: number, gy: number) => {
      this.ctx.fillText(ch, gx * tileSize + half, gy * tileSize + half);
    };

    // Draw Map. Tiles in view render at full strength; remembered-but-unseen
    // tiles fade back, the way an explored dungeon dims behind you in Rogue.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!explored[r]?.[c]) continue;
        const tile = map[r][c];
        if (tile === TILE.VOID) continue;

        this.ctx.globalAlpha = visible[r]?.[c] ? 1 : DIM_ALPHA;
        this.drawDungeonTile(tile, c, r, tileSize, style);
      }
    }
    this.ctx.globalAlpha = 1;

    // Draw Items (only those not standing in darkness should glow brightly)
    items.forEach(i => {
      if (!explored[i.y]?.[i.x]) return;
      this.ctx.globalAlpha = visible[i.y]?.[i.x] ? 1 : DIM_ALPHA;
      this.ctx.fillStyle = i.color;
      glyph(i.symbol, i.x, i.y);
    });
    this.ctx.globalAlpha = 1;

    // Draw Monsters
    monsters.forEach(m => {
      if (visible[m.y]?.[m.x]) {
        this.ctx.fillStyle = m.frozenTurns > 0 ? '#00ffff' : m.color;
        glyph(m.symbol, m.x, m.y);
      }
    });

    // Draw Player
    this.drawPlayer(player.x, player.y, tileSize, style, gameOver, gameWon);
  }

  private drawDungeonTile(
    tile: string,
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle
  ) {
    if (tile === TILE.FLOOR) {
      this.drawFloorDot(gx, gy, tileSize, style.floorDot);
    } else if (tile === TILE.CORRIDOR) {
      this.drawCorridor(gx, gy, tileSize, style);
    } else if (tile === TILE.WALL_H || tile === TILE.WALL_V) {
      this.drawWall(gx, gy, tileSize, style, tile);
    } else if (isCorner(tile)) {
      this.drawCorner(gx, gy, tileSize, style, tile);
    } else if (tile === TILE.DOOR) {
      this.drawDoor(gx, gy, tileSize, style);
    } else if (tile === TILE.STAIRS) {
      this.drawFloorDot(gx, gy, tileSize, style.floorDotDim);
      this.drawStairs(gx, gy, tileSize, style);
    }
  }

  private drawFloorDot(gx: number, gy: number, tileSize: number, color: string) {
    const dotW = Math.max(4, Math.round(tileSize * 0.28));
    const dotH = Math.max(2, Math.round(tileSize * 0.12));
    const x = gx * tileSize + Math.round((tileSize - dotW) / 2);
    const y = gy * tileSize + Math.round((tileSize - dotH) / 2);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, dotW, dotH);
  }

  private drawCorridor(gx: number, gy: number, tileSize: number, style: DungeonStyle) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    this.ctx.fillStyle = style.corridor;
    this.ctx.fillRect(x, y, tileSize, tileSize);

    const step = Math.max(3, Math.round(tileSize / 5));
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, tileSize, tileSize);
    this.ctx.clip();
    this.ctx.fillStyle = style.corridorDark;
    for (let py = -tileSize; py < tileSize * 2; py += step) {
      for (let px = 0; px < tileSize; px += step) {
        const offsetX = x + px;
        const offsetY = y + py + px;
        this.ctx.fillRect(offsetX, offsetY, Math.max(1, Math.floor(step / 2)), Math.max(1, Math.floor(step / 2)));
      }
    }
    this.ctx.restore();
  }

  private drawWall(
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle,
    tile: string
  ) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const lineWidth = Math.max(2, Math.round(tileSize * 0.11));
    const gap = Math.max(3, Math.round(tileSize * 0.2));
    const center = Math.floor(tileSize / 2);

    // The map now carries explicit `-`/`|` glyphs, so the wall orientation comes
    // straight from the tile rather than being re-inferred from neighbours.
    if (tile === TILE.WALL_H) {
      this.drawDoubleLine(x, y + center - gap / 2, x + tileSize, y + center - gap / 2, lineWidth, style);
      this.drawDoubleLine(x, y + center + gap / 2, x + tileSize, y + center + gap / 2, lineWidth, style);
    } else {
      this.drawDoubleLine(x + center - gap / 2, y, x + center - gap / 2, y + tileSize, lineWidth, style);
      this.drawDoubleLine(x + center + gap / 2, y, x + center + gap / 2, y + tileSize, lineWidth, style);
    }
  }

  /**
   * Draw a room corner as an L-join: the horizontal pair runs toward the
   * adjacent `-` wall, the vertical pair toward the adjacent `|` wall, and the
   * two meet at the cell centre — so the four corner glyphs read distinctly.
   */
  private drawCorner(
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle,
    tile: string
  ) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const lineWidth = Math.max(2, Math.round(tileSize * 0.11));
    const gap = Math.max(3, Math.round(tileSize * 0.2));
    const center = Math.floor(tileSize / 2);

    const atLeft = tile === TILE.CORNER_TL || tile === TILE.CORNER_BL;
    const atTop = tile === TILE.CORNER_TL || tile === TILE.CORNER_TR;

    // Horizontal leg points toward the wall that continues away from the corner.
    const hx1 = atLeft ? x + center : x;
    const hx2 = atLeft ? x + tileSize : x + center;
    this.drawDoubleLine(hx1, y + center - gap / 2, hx2, y + center - gap / 2, lineWidth, style);
    this.drawDoubleLine(hx1, y + center + gap / 2, hx2, y + center + gap / 2, lineWidth, style);

    const vy1 = atTop ? y + center : y;
    const vy2 = atTop ? y + tileSize : y + center;
    this.drawDoubleLine(x + center - gap / 2, vy1, x + center - gap / 2, vy2, lineWidth, style);
    this.drawDoubleLine(x + center + gap / 2, vy1, x + center + gap / 2, vy2, lineWidth, style);
  }

  /** Render a door as Rogue's `+` glyph: a bright plus in the door colour. */
  private drawDoor(gx: number, gy: number, tileSize: number, style: DungeonStyle) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const center = Math.floor(tileSize / 2);
    const arm = Math.round(tileSize * 0.4);
    const thick = Math.max(3, Math.round(tileSize * 0.2));
    const half = Math.round(thick / 2);

    this.ctx.fillStyle = style.door;
    this.ctx.fillRect(x + center - arm, y + center - half, arm * 2, thick);
    this.ctx.fillRect(x + center - half, y + center - arm, thick, arm * 2);
  }

  private drawDoubleLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number,
    style: Pick<DungeonStyle, 'wall' | 'wallShadow' | 'wallHighlight'>
  ) {
    this.ctx.strokeStyle = style.wallShadow;
    this.ctx.lineWidth = lineWidth + 2;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1), Math.round(y1));
    this.ctx.lineTo(Math.round(x2), Math.round(y2));
    this.ctx.stroke();

    this.ctx.strokeStyle = style.wall;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1), Math.round(y1));
    this.ctx.lineTo(Math.round(x2), Math.round(y2));
    this.ctx.stroke();

    this.ctx.strokeStyle = style.wallHighlight;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(x1), Math.round(y1 - 1));
    this.ctx.lineTo(Math.round(x2), Math.round(y2 - 1));
    this.ctx.stroke();
  }

  private drawStairs(gx: number, gy: number, tileSize: number, style: DungeonStyle) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    this.ctx.strokeStyle = style.stairs;
    this.ctx.lineWidth = Math.max(2, Math.round(tileSize * 0.1));
    this.ctx.beginPath();
    this.ctx.moveTo(x + tileSize * 0.3, y + tileSize * 0.3);
    this.ctx.lineTo(x + tileSize * 0.7, y + tileSize * 0.5);
    this.ctx.lineTo(x + tileSize * 0.3, y + tileSize * 0.7);
    this.ctx.stroke();
  }

  private drawPlayer(
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle,
    gameOver: boolean,
    gameWon: boolean
  ) {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const head = Math.max(9, Math.round(tileSize * 0.58));
    const bodyW = Math.max(8, Math.round(tileSize * 0.48));
    const bodyH = Math.max(9, Math.round(tileSize * 0.62));
    const headX = x + Math.round((tileSize - head) / 2);
    const headY = y + Math.max(0, Math.round(tileSize * 0.05));
    const bodyX = x + Math.round((tileSize - bodyW) / 2);
    const bodyY = y + Math.round(tileSize * 0.54);
    const bodyColor = gameOver ? style.playerDead : gameWon ? style.playerWon : style.playerBody;

    this.ctx.fillStyle = bodyColor;
    this.ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    this.ctx.strokeStyle = gameOver ? style.playerDead : gameWon ? style.playerWon : style.playerHead;
    this.ctx.lineWidth = Math.max(2, Math.round(tileSize * 0.1));
    this.ctx.strokeRect(headX, headY, head, head);

    this.ctx.fillStyle = gameOver ? style.playerDead : style.playerFace;
    const eye = Math.max(1, Math.round(tileSize * 0.08));
    this.ctx.fillRect(headX + Math.round(head * 0.28), headY + Math.round(head * 0.34), eye, eye);
    this.ctx.fillRect(headX + Math.round(head * 0.62), headY + Math.round(head * 0.34), eye, eye);
    this.ctx.fillRect(headX + Math.round(head * 0.32), headY + Math.round(head * 0.68), Math.round(head * 0.36), eye);
  }

  public updateStats(player: Player, dungeonFloor: number, statusEffects: StatusEffects, totalDef: number) {
    const statFloor = document.getElementById('stat-floor');
    const statLevel = document.getElementById('stat-level');
    const statHp = document.getElementById('stat-hp');
    const statGold = document.getElementById('stat-gold');
    const statDefense = document.getElementById('stat-defense');
    const statHunger = document.getElementById('stat-hunger');
    const uiFood = document.getElementById('ui-food');
    const xpBar = document.getElementById('xp-bar');
    const xpText = document.getElementById('xp-text');

    if (statFloor) statFloor.innerText = `Floor: ${dungeonFloor}/20`;
    if (statLevel) statLevel.innerText = `Level: ${player.level}`;

    const maxHp = statusEffects.vigorTurns > 0 ? player.maxHp * 2 : player.maxHp;
    if (statHp) statHp.innerText = `HP: ${Math.max(0, player.hp)}/${maxHp}`;
    if (statGold) statGold.innerText = `Gold: ${player.gold}`;
    if (statDefense) statDefense.innerText = `Total DEF: ${totalDef}`;

    const { hungerFatigued, hungerHungry } = BALANCE.player;
    const status = player.hunger === 0 ? "Starving" : player.hunger < hungerFatigued ? "Fatigued" : player.hunger < hungerHungry ? "Hungry" : "Satiated";
    const color = player.hunger === 0 ? "#ff0000" : player.hunger < hungerFatigued ? "#ff5500" : player.hunger < hungerHungry ? "#ffaa00" : "#0f0";
    if (statHunger) {
      statHunger.innerText = `Hunger: ${status}`;
      statHunger.style.color = color;
    }

    if (uiFood) uiFood.innerText = player.inventory.food.toString();

    const xpReqs = getScaledXpRequirements();
    const reqXp = xpReqs[player.level] || 209800;
    const barPct = player.level >= 20 ? 100 : Math.min(100, (player.xp / reqXp) * 100);
    
    if (xpBar) xpBar.style.width = `${barPct}%`;
    if (xpText) xpText.innerText = player.level >= 20 ? "MAX LEVEL" : `${player.xp} / ${reqXp} XP`;
  }

  private setSelectOptions(id: string, options: SelectOption[]) {
    const el = document.getElementById(id) as GameSelect | null;
    if (el && typeof el.setOptions === 'function') {
      el.setOptions(options);
    }
  }

  public updateDropdowns(player: Player) {
    const rarityColor = (item: GearItem) => RARITY_CONFIG[item.rarity || 'common'].color;

    // Main Hand
    this.setSelectOptions('sel-main', player.inventory.weapons.map((w, i) => ({
      value: String(i),
      label: `${w.name} (+${w.dmg})`,
      color: rarityColor(w),
      selected: player.equipped.mainHand === i
    })));

    const mainWep = player.inventory.weapons[player.equipped.mainHand];
    const is2H = mainWep?.type?.startsWith('2h_') || mainWep?.type === 'staff';

    // Off-Hand
    let offOptions: SelectOption[];
    if (is2H) {
      offOptions = [{ value: 'none:0', label: 'Disabled (2H Weapon)', disabled: true, selected: true }];
    } else {
      offOptions = [{ value: 'none:0', label: 'None', selected: player.equipped.offHand === 'none:0' }];
      player.inventory.shield.forEach((sh: any, i: number) => {
        if (i !== 0) {
          const val = 'shield:' + i;
          offOptions.push({
            value: val,
            label: `${sh.name} (${sh.def}/${sh.maxDef})`,
            color: rarityColor(sh),
            selected: player.equipped.offHand === val
          });
        }
      });
      if (mainWep?.type === 'dagger') {
        player.inventory.weapons.forEach((w, i) => {
          if (w.type === 'dagger' && i !== player.equipped.mainHand) {
            const val = 'weapon:' + i;
            offOptions.push({
              value: val,
              label: `${w.name} (+${w.dmg})`,
              color: rarityColor(w),
              selected: player.equipped.offHand === val
            });
          }
        });
      }
    }
    this.setSelectOptions('sel-off', offOptions);

    // Helm, Chest, Legs, Gauntlets, Boots
    ARMOR_SLOTS.forEach(slot => {
      this.setSelectOptions(`sel-${slot}`, player.inventory[slot].map((a, i) => ({
        value: String(i),
        label: `${a.name} (${a.def}/${a.maxDef})`,
        color: rarityColor(a),
        selected: player.equipped[slot] === i
      })));
    });

    // Potions (placeholder option, then each potion)
    const potOptions: SelectOption[] = [
      { value: '', label: 'Use Potion...', disabled: true, selected: true }
    ];
    player.inventory.potions.forEach((p, i) => {
      potOptions.push({ value: String(i), label: p.charAt(0).toUpperCase() + p.slice(1) });
    });
    this.setSelectOptions('sel-potions', potOptions);
  }

  public renderLogs(logs: string[]) {
    this.logBox.innerHTML = logs.map(l => `<div>> ${l}</div>`).join('');
  }

  public getStyledItemName(name: string, rarity: string): string {
    const color = RARITY_CONFIG[rarity || 'common'].color;
    const capRarity = rarity.charAt(0).toUpperCase() + rarity.slice(1);
    return `<span style="color: ${color}; font-weight: bold;">[${capRarity}] ${name}</span>`;
  }
}

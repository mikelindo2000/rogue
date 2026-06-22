import { Player, Monster, Item, StatusEffects, GearItem, ARMOR_SLOTS } from './types';
import { RARITY_CONFIG, BALANCE, getScaledXpRequirements } from './config';
import { TILE, isCorner, isWalkable } from './tiles';
import { DIM_ALPHA, getDungeonStyle, type DungeonStyle } from './theme';
import type { GameSelect, SelectOption } from './components/game-select';

type DoorOrientation = 'horizontal' | 'vertical';

interface TileMetrics {
  gx: number;
  gy: number;
  size: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  wallStroke: number;
  wallGap: number;
  railA: number;
  railB: number;
  passage: number;
}

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
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';

    // Draw Map. Tiles in view render at full strength; remembered-but-unseen
    // tiles fade back, the way an explored dungeon dims behind you in Rogue.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!explored[r]?.[c]) continue;
        const tile = map[r][c];
        if (tile === TILE.VOID) continue;

        this.ctx.globalAlpha = visible[r]?.[c] ? 1 : DIM_ALPHA;
        this.drawDungeonTile(map, tile, c, r, tileSize, style);
      }
    }
    this.ctx.globalAlpha = 1;

    // Draw Items (only those not standing in darkness should glow brightly)
    items.forEach(i => {
      if (!explored[i.y]?.[i.x]) return;
      this.ctx.globalAlpha = visible[i.y]?.[i.x] ? 1 : DIM_ALPHA;
      this.ctx.fillStyle = i.color;
      this.drawGlyph(i.symbol, i.x, i.y, tileSize, 0.66);
    });
    this.ctx.globalAlpha = 1;

    // Draw Monsters
    monsters.forEach(m => {
      if (visible[m.y]?.[m.x]) {
        this.ctx.fillStyle = m.frozenTurns > 0 ? '#00ffff' : m.color;
        this.drawGlyph(m.symbol, m.x, m.y, tileSize, 0.76);
      }
    });

    // Draw Player
    this.drawPlayer(player.x, player.y, tileSize, style, gameOver, gameWon);
  }

  private tileMetrics(gx: number, gy: number, tileSize: number): TileMetrics {
    const x = gx * tileSize;
    const y = gy * tileSize;
    const center = Math.round(tileSize / 2);
    const wallStroke = Math.max(2, Math.round(tileSize * 0.11));
    const wallGap = Math.max(4, Math.round(tileSize * 0.24));

    return {
      gx,
      gy,
      size: tileSize,
      x,
      y,
      cx: x + center,
      cy: y + center,
      wallStroke,
      wallGap,
      railA: center - wallGap / 2,
      railB: center + wallGap / 2,
      passage: Math.max(10, Math.round(tileSize * 0.58)),
    };
  }

  private grid(m: TileMetrics, column: number, row: number): [number, number] {
    return [
      m.x + Math.round((m.size * column) / 8),
      m.y + Math.round((m.size * row) / 8),
    ];
  }

  private drawDungeonTile(
    map: string[][],
    tile: string,
    gx: number,
    gy: number,
    tileSize: number,
    style: DungeonStyle
  ) {
    const m = this.tileMetrics(gx, gy, tileSize);

    if (tile === TILE.FLOOR) {
      this.drawFloorDot(m, style.floorDot);
    } else if (tile === TILE.CORRIDOR) {
      this.drawCorridor(map, m, style);
    } else if (tile === TILE.WALL_H || tile === TILE.WALL_V) {
      this.drawWall(m, style, tile);
    } else if (isCorner(tile)) {
      this.drawCorner(m, style, tile);
    } else if (tile === TILE.DOOR) {
      this.drawDoor(map, m, style);
    } else if (tile === TILE.STAIRS) {
      this.drawFloorDot(m, style.floorDotDim);
      this.drawStairs(m, style);
    }
  }

  private drawFloorDot(m: TileMetrics, color: string) {
    const radius = Math.max(2, Math.round(m.size * 0.1));
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(m.cx, m.cy, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawCorridor(map: string[][], m: TileMetrics, style: DungeonStyle) {
    const connects = {
      left: this.connectsToPassage(map[m.gy]?.[m.gx - 1]),
      right: this.connectsToPassage(map[m.gy]?.[m.gx + 1]),
      up: this.connectsToPassage(map[m.gy - 1]?.[m.gx]),
      down: this.connectsToPassage(map[m.gy + 1]?.[m.gx]),
    };
    const rects = this.passageRects(m, connects);

    this.fillPassage(rects, style.corridor);
  }

  private drawWall(
    m: TileMetrics,
    style: DungeonStyle,
    tile: string
  ) {
    // The map now carries explicit `-`/`|` glyphs, so the wall orientation comes
    // straight from the tile rather than being re-inferred from neighbours.
    if (tile === TILE.WALL_H) {
      this.drawDoubleLine(m.x, m.y + m.railA, m.x + m.size, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x, m.y + m.railB, m.x + m.size, m.y + m.railB, m.wallStroke, style);
    } else {
      this.drawDoubleLine(m.x + m.railA, m.y, m.x + m.railA, m.y + m.size, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y, m.x + m.railB, m.y + m.size, m.wallStroke, style);
    }
  }

  /**
   * Draw a room corner as an L-join: the horizontal pair runs toward the
   * adjacent `-` wall, the vertical pair toward the adjacent `|` wall, and the
   * two meet at the cell centre — so the four corner glyphs read distinctly.
   */
  private drawCorner(
    m: TileMetrics,
    style: DungeonStyle,
    tile: string
  ) {
    const atLeft = tile === TILE.CORNER_TL || tile === TILE.CORNER_BL;
    const atTop = tile === TILE.CORNER_TL || tile === TILE.CORNER_TR;
    const xRails = atLeft ? [m.railA, m.railB] : [m.railB, m.railA];
    const yRails = atTop ? [m.railA, m.railB] : [m.railB, m.railA];

    for (let i = 0; i < xRails.length; i++) {
      this.drawRoundedCornerRail(
        m,
        m.x + xRails[i],
        m.y + yRails[i],
        atLeft ? m.x + m.size : m.x,
        atTop ? m.y + m.size : m.y,
        m.wallStroke,
        style
      );
    }
  }

  /** Draw a door as a wall opening whose rails line up with the surrounding wall. */
  private drawDoor(map: string[][], m: TileMetrics, style: DungeonStyle) {
    const orientation = this.getDoorOrientation(map, m.gx, m.gy);
    const inset = Math.round(m.size * 0.24);
    const panelThickness = Math.max(m.passage, Math.round(m.wallGap + m.wallStroke * 1.4));
    const panelHalf = Math.round(panelThickness / 2);
    const seam = Math.max(1, Math.round(m.size * 0.05));

    this.drawDoorPassage(map, m, style, orientation);

    this.ctx.fillStyle = style.door;
    if (orientation === 'horizontal') {
      this.drawDoubleLine(m.x, m.y + m.railA, m.x + inset, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.size - inset, m.y + m.railA, m.x + m.size, m.y + m.railA, m.wallStroke, style);
      this.drawDoubleLine(m.x, m.y + m.railB, m.x + inset, m.y + m.railB, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.size - inset, m.y + m.railB, m.x + m.size, m.y + m.railB, m.wallStroke, style);

      this.ctx.fillRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, panelThickness);
      this.ctx.fillStyle = style.wallShadow;
      this.ctx.fillRect(m.cx - Math.floor(seam / 2), m.cy - panelHalf, seam, panelThickness);
      this.ctx.fillStyle = style.wallHighlight;
      this.ctx.fillRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, 1);
      this.ctx.strokeStyle = style.wallShadow;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.x + inset, m.cy - panelHalf, m.size - inset * 2, panelThickness);
      this.ctx.strokeStyle = style.wallHighlight;
      this.ctx.beginPath();
      this.ctx.moveTo(m.x + inset + 1, m.cy - panelHalf + 1);
      this.ctx.lineTo(m.x + inset + 1, m.cy + panelHalf - 1);
      this.ctx.moveTo(m.x + m.size - inset - 1, m.cy - panelHalf + 1);
      this.ctx.lineTo(m.x + m.size - inset - 1, m.cy + panelHalf - 1);
      this.ctx.stroke();
    } else {
      this.drawDoubleLine(m.x + m.railA, m.y, m.x + m.railA, m.y + inset, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railA, m.y + m.size - inset, m.x + m.railA, m.y + m.size, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y, m.x + m.railB, m.y + inset, m.wallStroke, style);
      this.drawDoubleLine(m.x + m.railB, m.y + m.size - inset, m.x + m.railB, m.y + m.size, m.wallStroke, style);

      this.ctx.fillRect(m.cx - panelHalf, m.y + inset, panelThickness, m.size - inset * 2);
      this.ctx.fillStyle = style.wallShadow;
      this.ctx.fillRect(m.cx - panelHalf, m.cy - Math.floor(seam / 2), panelThickness, seam);
      this.ctx.fillStyle = style.wallHighlight;
      this.ctx.fillRect(m.cx - panelHalf, m.y + inset, 1, m.size - inset * 2);
      this.ctx.strokeStyle = style.wallShadow;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(m.cx - panelHalf, m.y + inset, panelThickness, m.size - inset * 2);
      this.ctx.strokeStyle = style.wallHighlight;
      this.ctx.beginPath();
      this.ctx.moveTo(m.cx - panelHalf + 1, m.y + inset + 1);
      this.ctx.lineTo(m.cx + panelHalf - 1, m.y + inset + 1);
      this.ctx.moveTo(m.cx - panelHalf + 1, m.y + m.size - inset - 1);
      this.ctx.lineTo(m.cx + panelHalf - 1, m.y + m.size - inset - 1);
      this.ctx.stroke();
    }
  }

  private drawDoubleLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number,
    style: Pick<DungeonStyle, 'wall' | 'wallShadow' | 'wallHighlight'>
  ) {
    const isVertical = Math.round(x1) === Math.round(x2);
    const highlightDx = isVertical ? -1 : 0;
    const highlightDy = isVertical ? 0 : -1;

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
    this.ctx.moveTo(Math.round(x1 + highlightDx), Math.round(y1 + highlightDy));
    this.ctx.lineTo(Math.round(x2 + highlightDx), Math.round(y2 + highlightDy));
    this.ctx.stroke();
  }

  private drawRoundedCornerRail(
    m: TileMetrics,
    xRail: number,
    yRail: number,
    horizontalEdgeX: number,
    verticalEdgeY: number,
    lineWidth: number,
    style: Pick<DungeonStyle, 'wall' | 'wallShadow' | 'wallHighlight'>
  ) {
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, lineWidth + 2, style.wallShadow, 0, 0);
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, lineWidth, style.wall, 0, 0);
    this.strokeCornerRail(m, xRail, yRail, horizontalEdgeX, verticalEdgeY, 1, style.wallHighlight, -1, -1);
    this.ctx.restore();
  }

  private strokeCornerRail(
    m: TileMetrics,
    xRail: number,
    yRail: number,
    horizontalEdgeX: number,
    verticalEdgeY: number,
    lineWidth: number,
    color: string,
    dx: number,
    dy: number
  ) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(horizontalEdgeX + dx), Math.round(yRail + dy));
    this.ctx.lineTo(Math.round(m.cx + dx), Math.round(yRail + dy));
    this.ctx.quadraticCurveTo(
      Math.round(m.cx + dx),
      Math.round(m.cy + dy),
      Math.round(xRail + dx),
      Math.round(m.cy + dy)
    );
    this.ctx.lineTo(Math.round(xRail + dx), Math.round(verticalEdgeY + dy));
    this.ctx.stroke();
  }

  private drawStairs(m: TileMetrics, style: DungeonStyle) {
    const [x1, y1] = this.grid(m, 3, 2.4);
    const [x2, y2] = this.grid(m, 5.5, 4);
    const [x3, y3] = this.grid(m, 3, 5.6);
    this.ctx.strokeStyle = style.stairs;
    this.ctx.lineWidth = Math.max(2, Math.round(m.size * 0.1));
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.lineTo(x3, y3);
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
    const m = this.tileMetrics(gx, gy, tileSize);
    const [headX, headY] = this.grid(m, 2, 0.6);
    const [headRight] = this.grid(m, 6, 4.6);
    const [bodyX, bodyY] = this.grid(m, 2.4, 4.5);
    const [bodyRight, bodyBottom] = this.grid(m, 5.6, 8);
    const head = headRight - headX;
    const bodyW = bodyRight - bodyX;
    const bodyH = bodyBottom - bodyY;
    const bodyColor = gameOver ? style.playerDead : gameWon ? style.playerWon : style.playerBody;

    this.ctx.fillStyle = bodyColor;
    this.ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    this.ctx.strokeStyle = gameOver ? style.playerDead : gameWon ? style.playerWon : style.playerHead;
    this.ctx.lineWidth = Math.max(2, Math.round(tileSize * 0.1));
    this.ctx.strokeRect(headX, headY, head, head);

    this.ctx.fillStyle = gameOver ? style.playerDead : style.playerFace;
    const eye = Math.max(1, Math.round(tileSize * 0.08));
    const [leftEyeX, eyeY] = this.grid(m, 3.1, 2);
    const [rightEyeX] = this.grid(m, 4.7, 2);
    const [mouthX, mouthY] = this.grid(m, 3.2, 3.5);
    const [mouthRight] = this.grid(m, 4.8, 3.5);
    this.ctx.fillRect(leftEyeX, eyeY, eye, eye);
    this.ctx.fillRect(rightEyeX, eyeY, eye, eye);
    this.ctx.fillRect(mouthX, mouthY, mouthRight - mouthX, eye);
  }

  private drawGlyph(ch: string, gx: number, gy: number, tileSize: number, maxWidthRatio: number) {
    const m = this.tileMetrics(gx, gy, tileSize);
    const maxWidth = Math.round(tileSize * maxWidthRatio);
    let fontSize = Math.max(12, Math.floor(tileSize * 0.72));

    this.ctx.save();
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';
    this.ctx.font = `700 ${fontSize}px "Fira Code", monospace`;
    const width = this.ctx.measureText(ch).width;
    if (width > maxWidth) {
      fontSize = Math.max(10, Math.floor(fontSize * (maxWidth / width)));
      this.ctx.font = `700 ${fontSize}px "Fira Code", monospace`;
    }
    this.ctx.fillText(ch, m.cx, m.cy);
    this.ctx.restore();
  }

  private connectsToPassage(tile: string | undefined): boolean {
    return isWalkable(tile);
  }

  private passageRects(
    m: TileMetrics,
    connects: { left?: boolean; right?: boolean; up?: boolean; down?: boolean }
  ): Array<[number, number, number, number]> {
    const half = Math.round(m.passage / 2);
    const rects: Array<[number, number, number, number]> = [
      [m.cx - half, m.cy - half, m.passage, m.passage],
    ];

    if (connects.left) rects.push([m.x, m.cy - half, half + 1, m.passage]);
    if (connects.right) rects.push([m.cx, m.cy - half, m.size - Math.round(m.size / 2), m.passage]);
    if (connects.up) rects.push([m.cx - half, m.y, m.passage, half + 1]);
    if (connects.down) rects.push([m.cx - half, m.cy, m.passage, m.size - Math.round(m.size / 2)]);

    return rects;
  }

  private drawDoorPassage(
    map: string[][],
    m: TileMetrics,
    style: DungeonStyle,
    orientation: DoorOrientation
  ) {
    const connects = {
      left: orientation === 'vertical' || this.connectsToPassage(map[m.gy]?.[m.gx - 1]),
      right: orientation === 'vertical' || this.connectsToPassage(map[m.gy]?.[m.gx + 1]),
      up: orientation === 'horizontal' || this.connectsToPassage(map[m.gy - 1]?.[m.gx]),
      down: orientation === 'horizontal' || this.connectsToPassage(map[m.gy + 1]?.[m.gx]),
    };

    this.fillPassage(this.passageRects(m, connects), style.corridor);
  }

  private fillPassage(rects: Array<[number, number, number, number]>, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    rects.forEach(([x, y, w, h]) => this.ctx.rect(x, y, w, h));
    this.ctx.fill();
  }

  private getDoorOrientation(map: string[][], gx: number, gy: number): DoorOrientation {
    const left = map[gy]?.[gx - 1];
    const right = map[gy]?.[gx + 1];
    const up = map[gy - 1]?.[gx];
    const down = map[gy + 1]?.[gx];
    const horizontalScore = Number(this.isHorizontalWallMate(left)) + Number(this.isHorizontalWallMate(right));
    const verticalScore = Number(this.isVerticalWallMate(up)) + Number(this.isVerticalWallMate(down));

    return horizontalScore >= verticalScore ? 'horizontal' : 'vertical';
  }

  private isHorizontalWallMate(tile: string | undefined): boolean {
    return tile === TILE.WALL_H || isCorner(tile);
  }

  private isVerticalWallMate(tile: string | undefined): boolean {
    return tile === TILE.WALL_V || isCorner(tile);
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

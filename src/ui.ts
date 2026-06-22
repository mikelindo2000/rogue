import { Player, Monster, Item, StatusEffects, GearItem, ARMOR_SLOTS } from './types';
import { RARITY_CONFIG, BALANCE, getScaledXpRequirements } from './config';
import { TILE } from './tiles';
import { TILE_COLORS, TILE_DEFAULT_COLOR, DIM_ALPHA, PLAYER_COLORS } from './theme';
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
    gameOver: boolean,
    gameWon: boolean
  ) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = '700 18px "Fira Code", monospace';
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
        this.ctx.fillStyle = TILE_COLORS[tile] || TILE_DEFAULT_COLOR;
        glyph(tile, c, r);
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
    this.ctx.fillStyle = gameOver ? PLAYER_COLORS.dead : gameWon ? PLAYER_COLORS.won : PLAYER_COLORS.alive;
    const playerSymbol = gameOver ? 'X' : gameWon ? 'W' : '@';
    glyph(playerSymbol, player.x, player.y);
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

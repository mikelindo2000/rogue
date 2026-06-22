import { Player, Monster, Item, StatusEffects } from './types';
import { RARITY_CONFIG, getScaledXpRequirements } from './config';

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
    this.ctx.font = '20px monospace';
    this.ctx.textBaseline = 'top';

    // Draw Map
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (explored[r]?.[c]) {
          const tile = map[r][c];
          this.ctx.fillStyle = tile === '#' ? '#666' : tile === '>' ? '#ff0' : '#333';
          this.ctx.fillText(tile, c * tileSize, r * tileSize);
        }
      }
    }

    // Draw Items
    items.forEach(i => {
      if (explored[i.y]?.[i.x]) {
        this.ctx.fillStyle = i.color;
        this.ctx.fillText(i.symbol, i.x * tileSize, i.y * tileSize);
      }
    });

    // Draw Monsters
    monsters.forEach(m => {
      if (visible[m.y]?.[m.x]) {
        this.ctx.fillStyle = m.frozenTurns > 0 ? '#00ffff' : m.color;
        this.ctx.fillText(m.symbol, m.x * tileSize, m.y * tileSize);
      }
    });

    // Draw Player
    this.ctx.fillStyle = gameOver ? '#f00' : gameWon ? '#0f0' : '#fff';
    const playerSymbol = gameOver ? 'X' : gameWon ? 'W' : '@';
    this.ctx.fillText(playerSymbol, player.x * tileSize, player.y * tileSize);
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

    const status = player.hunger === 0 ? "Starving" : player.hunger < 190 ? "Fatigued" : player.hunger < 425 ? "Hungry" : "Satiated";
    const color = player.hunger === 0 ? "#ff0000" : player.hunger < 190 ? "#ff5500" : player.hunger < 425 ? "#ffaa00" : "#0f0";
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

  public updateDropdowns(player: Player) {
    const selMain = document.getElementById('sel-main') as HTMLSelectElement;
    const selOff = document.getElementById('sel-off') as HTMLSelectElement;
    const selPotions = document.getElementById('sel-potions') as HTMLSelectElement;

    if (!selMain || !selOff || !selPotions) return;

    // Main Hand dropdown
    selMain.innerHTML = player.inventory.weapons.map((w, i) => {
      const color = RARITY_CONFIG[w.rarity || 'common'].color;
      return `<option value="${i}" ${player.equipped.mainHand === i ? 'selected' : ''} style="color:${color};">${w.name} (+${w.dmg})</option>`;
    }).join('');

    const mainWep = player.inventory.weapons[player.equipped.mainHand];
    const is2H = mainWep?.type?.startsWith('2h_') || mainWep?.type === 'staff';

    // Off-Hand dropdown logic
    let offOptions = `<option value="none:0" ${player.equipped.offHand === 'none:0' ? 'selected' : ''}>None</option>`;
    if (is2H) {
      offOptions = `<option value="none:0">Disabled (2H Weapon)</option>`;
    } else {
      player.inventory.shield.forEach((sh, i) => {
        if (i !== 0) {
          const val = 'shield:' + i;
          const color = RARITY_CONFIG[sh.rarity || 'common'].color;
          offOptions += `<option value="${val}" ${player.equipped.offHand === val ? 'selected' : ''} style="color:${color};">${sh.name} (${sh.def}/${sh.maxDef})</option>`;
        }
      });
      if (mainWep?.type === 'dagger') {
        player.inventory.weapons.forEach((w, i) => {
          if (w.type === 'dagger' && i !== player.equipped.mainHand) {
            const val = 'weapon:' + i;
            const color = RARITY_CONFIG[w.rarity || 'common'].color;
            offOptions += `<option value="${val}" ${player.equipped.offHand === val ? 'selected' : ''} style="color:${color};">${w.name} (+${w.dmg})</option>`;
          }
        });
      }
    }
    selOff.innerHTML = offOptions;

    // Hel, Chest, Legs, Gauntlets, Boots dropdowns
    const slots = ['helm', 'chest', 'legs', 'gauntlets', 'boots'];
    slots.forEach(slot => {
      const el = document.getElementById(`sel-${slot}`) as HTMLSelectElement;
      if (el) {
        el.innerHTML = player.inventory[slot].map((a: any, i: number) => {
          const color = RARITY_CONFIG[a.rarity || 'common'].color;
          return `<option value="${i}" ${player.equipped[slot] === i ? 'selected' : ''} style="color:${color};">${a.name} (${a.def}/${a.maxDef})</option>`;
        }).join('');
      }
    });

    // Potion dropdown
    let potOptions = `<option value="" selected disabled>Use Potion...</option>`;
    player.inventory.potions.forEach((p, i) => {
      const capitalized = p.charAt(0).toUpperCase() + p.slice(1);
      potOptions += `<option value="${i}">${capitalized}</option>`;
    });
    selPotions.innerHTML = potOptions;
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

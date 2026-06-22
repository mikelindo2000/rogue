import { Player, Monster, Item, StatusEffects } from './types';
import { GameUI } from './ui';
import { generateLevel } from './map';
import { createPlayer, getTotalDef, gainXp, handleEquipItem } from './player';
import { MONSTER_XP_TABLE, CHEST_GOLD_TABLE, getConfig, getScaledMonsterHP } from './config';
import { processMonsterAI } from './monster';
import { isWalkable, blocksSight, TILE } from './tiles';

export class GameEngine {
  public map: string[][] = [];
  public explored: boolean[][] = [];
  public visible: boolean[][] = [];
  public player: Player;
  public monsters: Monster[] = [];
  public items: Item[] = [];
  public dungeonFloor: number = 1;
  public gameOver: boolean = false;
  public gameWon: boolean = false;
  public logs: string[] = [];

  public statusEffects: StatusEffects = {
    vigorTurns: 0,
    midasTurns: 0,
    strengthTurns: 0,
    invisTurns: 0,
    armorTurns: 0
  };

  public readonly COLS = 46;
  public readonly ROWS = 29;
  public readonly TILE_SIZE = 20;
  public readonly VISION_RADIUS = 6;

  private ui: GameUI;

  constructor(ui: GameUI) {
    this.ui = ui;
    this.player = createPlayer();
  }

  public initGame() {
    this.player = createPlayer();
    this.dungeonFloor = 1;
    this.gameOver = false;
    this.gameWon = false;
    this.statusEffects = {
      vigorTurns: 0,
      midasTurns: 0,
      strengthTurns: 0,
      invisTurns: 0,
      armorTurns: 0
    };
    this.logs = ["Welcome to the Dungeon! Move onto portals (>) to travel deeper."];

    this.generateFloor();
    this.ui.updateDropdowns(this.player);
    this.updateUI();
  }

  public addLog(msg: string) {
    this.logs.push(msg);
    if (this.logs.length > 3) {
      this.logs.shift();
    }
    this.ui.renderLogs(this.logs);
  }

  public generateFloor() {
    const levelData = generateLevel(this.dungeonFloor, this.player.level, this.COLS, this.ROWS);
    this.map = levelData.map;
    this.player.x = levelData.playerX;
    this.player.y = levelData.playerY;
    this.monsters = levelData.monsters;
    this.items = levelData.items;

    // Apply HP scaling to freshly spawned monsters
    this.monsters.forEach(m => {
      m.hp = getScaledMonsterHP(m.hp, m.name);
    });

    this.explored = new Array(this.ROWS).fill(0).map(() => new Array(this.COLS).fill(false));
    this.visible = new Array(this.ROWS).fill(0).map(() => new Array(this.COLS).fill(false));

    if (this.dungeonFloor === 20) {
      const bosses = this.monsters.filter(m => m.special === 'boss');
      const bossNames = bosses.map(b => b.name).join(" and ");
      this.addLog(`${bossNames} await!`);
    }

    this.updateFOV();
  }

  public updateFOV() {
    this.visible = new Array(this.ROWS).fill(0).map(() => new Array(this.COLS).fill(false));
    if (
      this.player.y >= 0 &&
      this.player.y < this.ROWS &&
      this.player.x >= 0 &&
      this.player.x < this.COLS
    ) {
      this.visible[this.player.y][this.player.x] = true;
      this.explored[this.player.y][this.player.x] = true;
    }

    const numRays = 72;
    for (let i = 0; i < numRays; i++) {
      const angle = (i * 5) * (Math.PI / 180);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let cx = this.player.x + 0.5;
      let cy = this.player.y + 0.5;

      for (let d = 0; d < this.VISION_RADIUS; d++) {
        cx += dx;
        cy += dy;
        const mapX = Math.floor(cx);
        const mapY = Math.floor(cy);

        if (mapX < 0 || mapX >= this.COLS || mapY < 0 || mapY >= this.ROWS) break;

        this.visible[mapY][mapX] = true;
        this.explored[mapY][mapX] = true;

        if (blocksSight(this.map[mapY][mapX])) break;
      }
    }
  }

  public handlePlayerMove(dx: number, dy: number) {
    if (this.gameOver || this.gameWon) return;

    const tx = this.player.x + dx;
    const ty = this.player.y + dy;

    // Check monster combat
    const m = this.monsters.find(mon => mon.x === tx && mon.y === ty);
    if (m) {
      this.playerAttack(m);
      this.processTurn();
      return;
    }

    // Normal move
    if (
      tx >= 0 &&
      tx < this.COLS &&
      ty >= 0 &&
      ty < this.ROWS &&
      isWalkable(this.map[ty]?.[tx])
    ) {
      this.player.x = tx;
      this.player.y = ty;

      this.checkItems();

      // Stairs check
      if (this.map[ty][tx] === TILE.STAIRS) {
        this.dungeonFloor++;
        this.generateFloor();
        this.addLog(`Traveled through portal to Floor ${this.dungeonFloor}!`);
        this.ui.updateDropdowns(this.player);
        this.updateUI();
        return;
      }

      this.processTurn();
    }
  }

  private executeStrike(monster: Monster, weapon: any) {
    let dmgBase = this.player.baseAtk + weapon.dmg;
    if (this.statusEffects.strengthTurns > 0) dmgBase += 10;
    if (this.player.disarmedHits > 0) {
      dmgBase = Math.floor(dmgBase / 2);
      this.player.disarmedHits--;
    }

    if (weapon.type === 'staff') {
      if (weapon.magic === 'fire') {
        dmgBase += 3;
        this.addLog("Flames erupt!");
      } else if (weapon.magic === 'arcane') {
        const vigorMaxHp = this.statusEffects.vigorTurns > 0 ? this.player.maxHp * 2 : this.player.maxHp;
        this.player.hp = Math.min(vigorMaxHp, this.player.hp + 2);
        this.addLog("Siphoned health!");
      } else if (weapon.magic === 'frost' && Math.random() < 0.25) {
        monster.frozenTurns = 1;
        this.addLog(`${monster.name} frozen!`);
      }
    }

    const damage = Math.max(1, Math.floor(Math.random() * dmgBase) + 2);
    monster.hp -= damage;
    this.addLog(`You strike ${monster.name} for ${damage} dmg. (${Math.max(0, monster.hp)} HP left)`);
  }

  public playerAttack(monster: Monster) {
    const mainWep = this.player.inventory.weapons[this.player.equipped.mainHand];
    if (mainWep) {
      this.executeStrike(monster, mainWep);
    }

    if (monster.hp > 0 && this.player.equipped.offHand.startsWith('weapon:')) {
      const offIdx = parseInt(this.player.equipped.offHand.split(':')[1]);
      const offWep = this.player.inventory.weapons[offIdx];
      if (offWep) {
        this.executeStrike(monster, offWep);
      }
    }

    if (monster.hp <= 0) {
      this.addLog(`The ${monster.name} dies!`);

      let xpGained = 0;
      const floorTable = MONSTER_XP_TABLE[this.player.level];
      if (floorTable && floorTable[monster.name] !== undefined) {
        xpGained = floorTable[monster.name] as number;
      }

      if (xpGained > 0) {
        this.addLog(`Gained ${xpGained} Experience.`);
        const leveled = gainXp(this.player, xpGained, (msg) => this.addLog(msg), this.statusEffects);
        if (leveled) {
          this.ui.updateDropdowns(this.player);
        }
      } else {
        this.addLog(`No experience gained (Level delta too high).`);
      }

      if (monster.special === 'boss') {
        this.addLog(`THE ${monster.name.toUpperCase()} IS SLAIN!`);
        const anyBossesLeft = this.monsters.some(m => m.special === 'boss' && m !== monster);
        if (!anyBossesLeft) {
          this.gameWon = true;
          this.addLog("ALL BOSSES DEFEATED! You have won the game! Press 'R' to restart.");
        }
      }
      this.monsters = this.monsters.filter(m => m !== monster);
    }
  }

  public checkItems() {
    const idx = this.items.findIndex(i => i.x === this.player.x && i.y === this.player.y);
    if (idx !== -1) {
      const item = this.items[idx];
      if (!item) return;
      let pickedUp = true;

      if (item.type === 'gold') {
        const baseGold = CHEST_GOLD_TABLE[this.player.level] || 15;
        const minGold = Math.round(baseGold * 0.9);
        const maxGold = Math.round(baseGold * 1.1);
        let g = Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold;

        if (this.statusEffects.midasTurns > 0) {
          g = Math.floor(g * 1.2);
        }

        this.player.gold += g;
        this.addLog(`Looted a Chest! Found +${g} Gold.`);

        if (this.player.level < 20) {
          this.addLog(`Gained +${g} Experience from the chest contents.`);
          const leveled = gainXp(this.player, g, (msg) => this.addLog(msg), this.statusEffects);
          if (leveled) {
            this.ui.updateDropdowns(this.player);
          }
        } else {
          this.addLog(`At Level 20, chests no longer provide bonus Experience.`);
        }
      } else if (item.type === 'food') {
        const maxFood = getConfig().playerMaxFood;
        if (this.player.inventory.food >= maxFood) {
          this.addLog(`Backpack full! Cannot carry more than ${maxFood} food.`);
          pickedUp = false;
        } else {
          this.player.inventory.food++;
          this.addLog("Looted Rations. Added to inventory.");
        }
      } else if (item.type === 'potion') {
        const pType = item.data?.potionType || 'healing';
        this.player.inventory.potions.push(pType);
        this.addLog(`Picked up a Potion of ${pType.charAt(0).toUpperCase() + pType.slice(1)}.`);
      } else if (item.type === 'scroll') {
        const r = Math.random();
        if (r < 0.25) {
          this.statusEffects.vigorTurns = 100;
          this.player.hp = this.player.maxHp * 2;
          this.addLog("Vigor! HP doubled.");
        } else if (r < 0.50) {
          this.player.hunger = 100;
          this.addLog("Suddenly fatigued!");
        } else if (r < 0.75) {
          this.statusEffects.midasTurns = 100;
          this.addLog("Midas scroll active.");
        } else {
          this.player.hp -= 5;
          this.addLog("Trap scroll triggered! -5 HP.");
        }
      } else if (item.type === 'repair_scroll') {
        const armorSlots = ['helm', 'chest', 'legs', 'gauntlets', 'boots', 'shield'];
        armorSlots.forEach(slot => {
          const list = this.player.inventory[slot] as any[];
          if (list) {
            list.forEach(gear => {
              if (gear.maxDef !== undefined) {
                gear.def = gear.maxDef;
              }
            });
          }
        });
        this.addLog("All equipped armor repaired.");
      } else if (item.type === 'gear') {
        const c = item.data.category;
        const styledName = this.ui.getStyledItemName(item.data.name, item.data.rarity);

        if (c.includes('sword') || c.includes('mace') || c === 'dagger' || c === 'staff') {
          item.data.type = c;
          this.player.inventory.weapons.push(item.data);
          this.addLog(`Looted: ${styledName} (+${item.data.dmg} ATK).`);
        } else {
          this.player.inventory[c].push(item.data);
          this.addLog(`Looted: ${styledName} (${item.data.def} DEF).`);
        }
      }

      if (pickedUp) {
        this.items.splice(idx, 1);
        this.ui.updateDropdowns(this.player);
      }
    }
  }

  public usePotion(index: number) {
    if (index < 0 || index >= this.player.inventory.potions.length) return;
    const pType = this.player.inventory.potions[index];

    if (pType === 'healing') {
      const vigorMaxHp = this.statusEffects.vigorTurns > 0 ? this.player.maxHp * 2 : this.player.maxHp;
      this.player.hp = Math.min(this.player.hp + 12, vigorMaxHp);
      this.addLog("Drank Potion of Healing. Recouped some health.");
    } else if (pType === 'strength') {
      this.statusEffects.strengthTurns = 100;
      this.addLog("Drank Potion of Strength! Attack power boosted by +10.");
    } else if (pType === 'invisibility') {
      this.statusEffects.invisTurns = 50;
      this.addLog("Drank Potion of Invisibility! Monsters lose track of you.");
    } else if (pType === 'armor') {
      this.statusEffects.armorTurns = 100;
      this.addLog("Drank Potion of Armor! Defenses boosted by +100.");
    }

    this.player.inventory.potions.splice(index, 1);
    this.ui.updateDropdowns(this.player);
    this.processTurn();
  }

  public consumeFood() {
    if (this.player.inventory.food > 0) {
      this.player.inventory.food--;
      if (this.player.undeadFoods > 0) {
        this.player.undeadFoods--;
        this.addLog("Undead virus rejects food.");
      } else {
        const tunables = getConfig();
        this.player.hunger = Math.min(this.player.hunger + tunables.foodHungerRestore, tunables.hungerMax);
        this.addLog("Ate rations. Hunger restored.");
      }
      this.updateUI();
      this.processTurn();
    } else {
      this.addLog("You have no food to eat!");
    }
  }

  public equipGear(slot: string, value: string) {
    handleEquipItem(this.player, slot, value, (msg) => this.addLog(msg));
    this.ui.updateDropdowns(this.player);
    this.updateUI();
  }

  public processTurn() {
    // Decr status effects
    if (this.statusEffects.vigorTurns > 0) {
      this.statusEffects.vigorTurns--;
      if (this.statusEffects.vigorTurns === 0) {
        this.addLog("Vigor fades.");
        if (this.player.hp > this.player.maxHp) {
          this.player.hp = this.player.maxHp;
        }
      }
    }
    if (this.statusEffects.midasTurns > 0) this.statusEffects.midasTurns--;
    if (this.statusEffects.strengthTurns > 0) {
      this.statusEffects.strengthTurns--;
      if (this.statusEffects.strengthTurns === 0) this.addLog("Strength status expired.");
    }
    if (this.statusEffects.invisTurns > 0) {
      this.statusEffects.invisTurns--;
      if (this.statusEffects.invisTurns === 0) this.addLog("Invisibility status expired.");
    }
    if (this.statusEffects.armorTurns > 0) {
      this.statusEffects.armorTurns--;
      if (this.statusEffects.armorTurns === 0) this.addLog("Armor status expired.");
    }

    // Hunger checks
    this.player.hunger--;
    if (this.player.hunger <= 0) {
      this.player.hunger = 0;
      this.player.hp--;
      this.addLog("Starving!");
    } else {
      const vigorMaxHp = this.statusEffects.vigorTurns > 0 ? this.player.maxHp * 2 : this.player.maxHp;
      if (this.player.hp < vigorMaxHp) {
        this.player.regenTurns++;
        if (this.player.regenTurns >= 15) {
          this.player.hp++;
          this.player.regenTurns = 0;
        }
      }
    }

    if (this.player.hp <= 0) {
      this.gameOver = true;
      this.addLog("GAME OVER. Press R.");
      this.updateUI();
      this.updateFOV();
      this.draw();
      return;
    }

    const totalDef = getTotalDef(this.player, this.statusEffects);

    // Monsters turn
    processMonsterAI(
      this.monsters,
      this.player,
      this.statusEffects,
      this.map,
      this.COLS,
      this.ROWS,
      totalDef,
      (msg) => this.addLog(msg)
    );

    if (this.player.hp <= 0) {
      this.gameOver = true;
      this.addLog("GAME OVER. Press R.");
    }

    this.updateUI();
    this.updateFOV();
    this.draw();
  }

  public updateUI() {
    const totalDef = getTotalDef(this.player, this.statusEffects);
    this.ui.updateStats(this.player, this.dungeonFloor, this.statusEffects, totalDef);
  }

  public draw() {
    this.ui.render(
      this.map,
      this.explored,
      this.visible,
      this.player,
      this.monsters,
      this.items,
      this.TILE_SIZE,
      this.COLS,
      this.ROWS,
      this.gameOver,
      this.gameWon
    );
  }

  /**
   * Refreshes stats, scales player hp if balance variables change.
   */
  public handleBalanceUpdate() {
    const tunables = getConfig();
    // Re-adjust stats based on balance changes
    const hpDelta = tunables.playerStartingHp - this.player.maxHp;
    this.player.maxHp = tunables.playerStartingHp;
    this.player.hp = Math.max(1, this.player.hp + hpDelta);
    this.player.baseAtk = tunables.playerBaseAtk;

    // Rescale already spawned bats and orcs on the floor
    this.monsters.forEach(m => {
      m.hp = getScaledMonsterHP(m.hp, m.name);
    });

    this.updateUI();
    this.ui.updateDropdowns(this.player);
    this.draw();
  }
}

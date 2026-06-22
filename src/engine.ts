import { Player, Monster, Item, StatusEffects, GearItem, EquipSlot, GearSlot, ARMOR_SLOTS } from './types';
import { GameUI } from './ui';
import { generateLevel } from './map';
import { createPlayer, getTotalDef, gainXp, handleEquipItem } from './player';
import { MONSTER_XP_TABLE, CHEST_GOLD_TABLE, BALANCE, getConfig, getScaledMonsterHP } from './config';
import { processMonsterAI } from './monster';
import { computeStrike } from './combat';
import { isWalkable, blocksSight, isWall, TILE } from './tiles';
import { RNG, makeRng, randomSeed } from './rng';

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
  /** Turns elapsed this run — surfaced in the HUD; no effect on game logic. */
  public turn: number = 0;

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

  /** Seed and RNG for the current run; reproducible when seeded explicitly. */
  public seed: number = 0;
  private rng: RNG;

  private ui: GameUI;

  constructor(ui: GameUI) {
    this.ui = ui;
    this.player = createPlayer();
    this.rng = makeRng(randomSeed());
  }

  public initGame(seed: number = randomSeed()) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.player = createPlayer();
    this.dungeonFloor = 1;
    this.turn = 0;
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
    this.ui.resetLog();
    this.ui.renderLogs(this.logs);
  }

  public addLog(msg: string) {
    this.logs.push(msg);
    if (this.logs.length > 3) {
      this.logs.shift();
    }
    this.ui.renderLogs(this.logs);
  }

  public generateFloor() {
    const levelData = generateLevel(this.dungeonFloor, this.player.level, this.COLS, this.ROWS, this.rng);
    this.map = levelData.map;
    this.player.x = levelData.playerX;
    this.player.y = levelData.playerY;
    this.monsters = levelData.monsters;
    this.items = levelData.items;

    // Apply HP scaling to freshly spawned monsters
    this.monsters.forEach(m => {
      m.hp = getScaledMonsterHP(m.hp, m.name);
      m.maxHp = m.hp;
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

    const numRays = BALANCE.fov.rays;
    for (let i = 0; i < numRays; i++) {
      const angle = (i * BALANCE.fov.angleStepDeg) * (Math.PI / 180);
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

    // Standing in a room lights the whole room at once, walls included — the way
    // a lit room reveals in Rogue. This also fills the gaps the raycast leaves
    // along room walls: rays run parallel to a one-tile-thick wall and only
    // graze a few of its cells, so the rest would stay dark.
    this.revealRoom(this.player.x, this.player.y);
  }

  /**
   * Flood the contiguous room floor the player is standing on and reveal it
   * along with its full bounding ring of walls, corners, and doors. No-op when
   * the player is in a corridor or doorway (handled by the raycast above).
   */
  private revealRoom(px: number, py: number) {
    const isInterior = (ch: string | undefined) => ch === TILE.FLOOR || ch === TILE.STAIRS;
    if (!isInterior(this.map[py]?.[px])) return;

    const reveal = (x: number, y: number) => {
      if (x < 0 || x >= this.COLS || y < 0 || y >= this.ROWS) return;
      this.visible[y][x] = true;
      this.explored[y][x] = true;
    };

    const seen = new Set<number>([py * this.COLS + px]);
    const stack: [number, number][] = [[px, py]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      reveal(x, y);

      // Light the bounding wall ring (including diagonal corners) for this cell.
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nx = x + dc;
          const ny = y + dr;
          const ch = this.map[ny]?.[nx];
          if (isWall(ch) || ch === TILE.DOOR) reveal(nx, ny);
        }
      }

      // Continue the flood across the room's floor (orthogonal only).
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dc;
        const ny = y + dr;
        if (nx < 0 || nx >= this.COLS || ny < 0 || ny >= this.ROWS) continue;
        const key = ny * this.COLS + nx;
        if (seen.has(key) || !isInterior(this.map[ny][nx])) continue;
        seen.add(key);
        stack.push([nx, ny]);
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
        this.descendThroughPortal();
        return;
      }

      this.processTurn();
    }
  }

  /**
   * Run in a straight line, classic Rogue-style. Each traversed tile still
   * costs a normal turn, but the command repeats movement until something
   * demands attention: a wall, a monster in the next tile, death/victory, a
   * portal, or the doorway at the end of a corridor.
   */
  public handlePlayerRun(dx: number, dy: number) {
    if (this.gameOver || this.gameWon || (dx === 0 && dy === 0)) return;

    let previousTile = this.map[this.player.y]?.[this.player.x];
    const maxSteps = this.COLS + this.ROWS;

    for (let step = 0; step < maxSteps; step++) {
      const tx = this.player.x + dx;
      const ty = this.player.y + dy;

      if (
        tx < 0 ||
        tx >= this.COLS ||
        ty < 0 ||
        ty >= this.ROWS ||
        !isWalkable(this.map[ty]?.[tx])
      ) {
        break;
      }

      if (this.monsters.some(mon => mon.x === tx && mon.y === ty)) break;

      const wasInCorridor = previousTile === TILE.CORRIDOR;
      this.player.x = tx;
      this.player.y = ty;

      this.checkItems();

      const currentTile = this.map[ty][tx];
      if (currentTile === TILE.STAIRS) {
        this.descendThroughPortal();
        return;
      }

      this.processTurn();

      if (this.gameOver || this.gameWon) return;
      if (wasInCorridor && currentTile === TILE.DOOR) return;
      if (this.hasAdjacentMonster()) return;

      previousTile = currentTile;
    }
  }

  private descendThroughPortal() {
    this.dungeonFloor++;
    // Log the descent before generating the floor, so any messages the
    // generator emits (e.g. the floor-20 boss announcement) read in order.
    this.addLog(`Traveled through portal to Floor ${this.dungeonFloor}!`);
    this.generateFloor();
    this.ui.updateDropdowns(this.player);
    this.updateUI();
  }

  private hasAdjacentMonster(): boolean {
    return this.monsters.some(mon =>
      Math.abs(mon.x - this.player.x) <= 1 &&
      Math.abs(mon.y - this.player.y) <= 1
    );
  }

  private executeStrike(monster: Monster, weapon: GearItem) {
    const outcome = computeStrike({
      baseAtk: this.player.baseAtk,
      weapon,
      strengthActive: this.statusEffects.strengthTurns > 0,
      disarmed: this.player.disarmedHits > 0,
      rng: this.rng
    });

    if (this.player.disarmedHits > 0) this.player.disarmedHits--;
    outcome.messages.forEach(msg => this.addLog(msg));

    if (outcome.selfHeal > 0) {
      this.player.hp = Math.min(this.vigorMaxHp(), this.player.hp + outcome.selfHeal);
    }
    if (outcome.freezeTurns > 0) {
      monster.frozenTurns = outcome.freezeTurns;
      this.addLog(`${monster.name} frozen!`);
    }

    monster.hp -= outcome.damage;
    this.addLog(`You strike ${monster.name} for ${outcome.damage} dmg. (${Math.max(0, monster.hp)} HP left)`);
  }

  /** Max HP accounting for the Vigor buff (doubled). */
  private vigorMaxHp(): number {
    return this.statusEffects.vigorTurns > 0
      ? this.player.maxHp * BALANCE.status.vigorHpMultiplier
      : this.player.maxHp;
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
        if (this.dungeonFloor === 20 && !anyBossesLeft) {
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
        const minGold = Math.round(baseGold * (1 - BALANCE.gold.variance));
        const maxGold = Math.round(baseGold * (1 + BALANCE.gold.variance));
        let g = this.rng.range(minGold, maxGold);

        if (this.statusEffects.midasTurns > 0) {
          g = Math.floor(g * BALANCE.status.midasGoldMultiplier);
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
        const pType = item.data.potionType;
        this.player.inventory.potions.push(pType);
        this.addLog(`Picked up a Potion of ${pType.charAt(0).toUpperCase() + pType.slice(1)}.`);
      } else if (item.type === 'scroll') {
        const { scroll, status } = BALANCE;
        const r = this.rng.next();
        if (r < scroll.vigorCut) {
          this.statusEffects.vigorTurns = status.vigorTurns;
          this.player.hp = this.player.maxHp * status.vigorHpMultiplier;
          this.addLog("Vigor! HP doubled.");
        } else if (r < scroll.fatigueCut) {
          this.player.hunger = scroll.fatigueHunger;
          this.addLog("Suddenly fatigued!");
        } else if (r < scroll.midasCut) {
          this.statusEffects.midasTurns = status.midasTurns;
          this.addLog("Midas scroll active.");
        } else {
          this.player.hp -= scroll.trapDamage;
          this.addLog(`Trap scroll triggered! -${scroll.trapDamage} HP.`);
        }
      } else if (item.type === 'repair_scroll') {
        const repairSlots: GearSlot[] = [...ARMOR_SLOTS, 'shield'];
        repairSlots.forEach(slot => {
          this.player.inventory[slot].forEach(gear => {
            if (gear.maxDef !== undefined) gear.def = gear.maxDef;
          });
        });
        this.addLog("All equipped armor repaired.");
      } else if (item.type === 'gear') {
        const c = item.data.category;
        const styledName = this.ui.getStyledItemName(item.data.name, item.data.rarity || 'common');

        if (c.includes('sword') || c.includes('mace') || c === 'dagger' || c === 'staff') {
          item.data.type = c as GearItem['type'];
          this.player.inventory.weapons.push(item.data);
          this.addLog(`Looted: ${styledName} (+${item.data.dmg} ATK).`);
        } else {
          this.player.inventory[c as GearSlot].push(item.data);
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
      this.player.hp = Math.min(this.player.hp + BALANCE.potions.healAmount, this.vigorMaxHp());
      this.addLog("Drank Potion of Healing. Recouped some health.");
    } else if (pType === 'strength') {
      this.statusEffects.strengthTurns = BALANCE.status.strengthTurns;
      this.addLog(`Drank Potion of Strength! Attack power boosted by +${BALANCE.combat.strengthBonus}.`);
    } else if (pType === 'invisibility') {
      this.statusEffects.invisTurns = BALANCE.status.invisTurns;
      this.addLog("Drank Potion of Invisibility! Monsters lose track of you.");
    } else if (pType === 'armor') {
      this.statusEffects.armorTurns = BALANCE.status.armorTurns;
      this.addLog(`Drank Potion of Armor! Defenses boosted by +${BALANCE.status.armorDefBonus}.`);
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

  public equipGear(slot: EquipSlot, value: string) {
    handleEquipItem(this.player, slot, value, (msg) => this.addLog(msg));
    this.ui.updateDropdowns(this.player);
    this.updateUI();
  }

  public processTurn() {
    this.turn++;

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
      if (this.player.hp < this.vigorMaxHp()) {
        this.player.regenTurns++;
        if (this.player.regenTurns >= BALANCE.player.regenInterval) {
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
      (msg) => this.addLog(msg),
      this.rng
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
    this.ui.updateStats(this.player, this.dungeonFloor, this.statusEffects, totalDef, this.turn);
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
      this.dungeonFloor,
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

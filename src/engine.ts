import { Player, Monster, Item, StatusEffects, GearItem, EquipSlot, GearSlot, ARMOR_SLOTS, InventoryAction, InventoryRef } from './types';
import { GameUI } from './ui';
import { generateLevel, type RoomRect } from './map';
import { createPlayer, getTotalDef, gainXp, handleEquipItem, equipValidated, inventoryRefToEquipTarget } from './player';
import { MONSTER_XP_TABLE, CHEST_GOLD_TABLE, BALANCE, getConfig, getScaledMonsterHP } from './config';
import { requiredBossNamesForFloor } from './encounters';
import { processMonsterAI } from './monster';
import { resolveBehavior, archetypeOf } from './ai/archetypes';
import { computeStrike } from './combat';
import { type SoundSink, noopSink } from './audio/events';
import { snapshotEquipped, diffEquipped, type EquipSnapshot } from './audio/equipment';
import { VitalsSoundTracker } from './audio/vitals';
import { isWalkable, blocksSight, isWall, TILE, STAIR_TILES, isSecretDoor } from './tiles';
import { RNG, makeRng, randomSeed } from './rng';
import type { SaveGameV2 } from './persistence/savegame';
import {
  buildRunSummary,
  createRunStats,
  recordAttack,
  recordChest,
  recordDamageDealt,
  recordDamageTaken,
  recordEquipmentChange,
  recordExploredTiles,
  recordFoodEaten,
  recordFoodPickedUp,
  recordGearPickedUp,
  recordLevelGain,
  recordMonsterDodge,
  recordMonsterKilled,
  recordPotionDrunk,
  recordPotionPickedUp,
  recordScrollTriggered,
  recordSearch,
  recordSecretReveal,
  recordStairs,
  recordStatusTurn,
  recordStep,
  recordVitals,
  type DeathCause,
  type RunStatsV1,
  type RunSummaryV1,
} from './runStats';
import {
  loadDiscovery,
  saveDiscovery,
  markSeen,
  markDefeated,
  monsterId,
  type DiscoveryState,
} from './discovery';

export interface FloorState {
  map: string[][];
  explored: boolean[][];
  /** Per-tile darkness for this floor. Optional for backward-compat with saves
   *  written before dark rooms existed (treated as all-lit on load). */
  dark?: boolean[][];
  monsters: Monster[];
  items: Item[];
}

export class GameEngine {
  public map: string[][] = [];
  public explored: boolean[][] = [];
  public visible: boolean[][] = [];
  /** True on the interior tiles of an unlit (dark) room — the player sees only
   *  their immediate 3x3 there until it is lit. Persisted (cannot be recomputed:
   *  darkness is rolled at generation). See design/implemented/visibility_and_fov.md. */
  public dark: boolean[][] = [];
  /** Real-room rects for the current floor (E1). In-memory only — never saved;
   *  undefined after a restore until the next generated floor. Informational
   *  today; dark lighting depends only on `dark` + the room flood. */
  public rooms: RoomRect[] = [];
  public player: Player;
  public monsters: Monster[] = [];
  public items: Item[] = [];
  public dungeonFloor: number = 1;
  public gameOver: boolean = false;
  public gameWon: boolean = false;
  public logs: string[] = [];
  /** Turns elapsed this run — surfaced in the HUD; no effect on game logic. */
  public turn: number = 0;
  public stats: RunStatsV1 = createRunStats();
  public finalRunSummary: RunSummaryV1 | null = null;

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

  /** Seed and RNG for the current run; reproducible when seeded explicitly. */
  public seed: number = 0;
  private rng: RNG;
  private floorStates: Map<number, FloorState> = new Map();
  private searchHintShown = false;
  private secretsFoundThisRun = 0;

  private ui: GameUI;

  /** Domain-level sound events. Default no-op sink; main.ts injects the browser
   *  audio service. Engine code never names assets or touches audio APIs. */
  private sound: SoundSink;
  /** Stateful crossing detection for HP/hunger warning cues. */
  private vitals: VitalsSoundTracker;

  /** Cross-run record of which monsters the player has met. Loaded once and
   *  persisted on change — it intentionally survives initGame/restart. */
  public discovery: DiscoveryState;

  /** Notified after complete run-state mutations so the host can autosave.
   *  Wired in main.ts; never called mid-command (see autosave call sites). */
  public onRunChanged?: () => void;
  public onRunFinished?: (summary: RunSummaryV1) => void;

  private autosave() {
    this.onRunChanged?.();
  }

  constructor(ui: GameUI, sound: SoundSink = noopSink) {
    this.ui = ui;
    this.sound = sound;
    this.vitals = new VitalsSoundTracker(BALANCE.player.hungerHungry, BALANCE.player.hungerFatigued);
    this.player = createPlayer();
    this.rng = makeRng(randomSeed());
    this.discovery = loadDiscovery();
    this.ui.syncDiscovery(this.discovery);
  }

  public initGame(seed: number = randomSeed()) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.stats = createRunStats(seed);
    this.finalRunSummary = null;
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
    this.floorStates.clear();
    this.searchHintShown = false;
    this.secretsFoundThisRun = 0;
    this.vitals.reset();
    this.logs = ["Welcome to the Dungeon! Move onto stairs (< or >) to travel between floors."];

    this.generateFloor();
    this.ui.updateDropdowns(this.player);
    this.updateUI();
    this.ui.resetLog();
    this.ui.renderLogs(this.logs);
    this.autosave();
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
    this.dark = levelData.dark;
    this.rooms = levelData.rooms;
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
    if (this.dungeonFloor === 3 && this.hasSecretDoors() && !this.searchHintShown) {
      this.searchHintShown = true;
      this.addLog("Some dead ends hide doors. Press Space to search nearby walls.");
    }

    this.updateFOV();
  }

  private blankBoolGrid(): boolean[][] {
    return new Array(this.ROWS).fill(0).map(() => new Array(this.COLS).fill(false));
  }

  /** A tile belongs to an unlit room's interior. `dark` is only ever set on
   *  interior floor/stair tiles, so this single lookup is the dark-room test. */
  private isDarkInterior(x: number, y: number): boolean {
    return this.dark[y]?.[x] === true;
  }

  public updateFOV() {
    this.visible = this.blankBoolGrid();
    const px = this.player.x;
    const py = this.player.y;
    const inBounds = py >= 0 && py < this.ROWS && px >= 0 && px < this.COLS;
    if (inBounds) {
      this.visible[py][px] = true;
      this.explored[py][px] = true;
    }

    // Rule A — inside a dark room: the player sees only their immediate block
    // (the eight surrounding tiles). No long raycast, no lit-room flood.
    if (inBounds && this.isDarkInterior(px, py)) {
      const dr = BALANCE.fov.darkRadius;
      for (let yy = py - dr; yy <= py + dr; yy++) {
        for (let xx = px - dr; xx <= px + dr; xx++) {
          if (xx < 0 || xx >= this.COLS || yy < 0 || yy >= this.ROWS) continue;
      this.visible[yy][xx] = true;
      this.explored[yy][xx] = true;
        }
      }
      recordExploredTiles(this.stats, this.explored);
      this.recordSightings();
      return;
    }

    const numRays = BALANCE.fov.rays;
    for (let i = 0; i < numRays; i++) {
      const angle = (i * BALANCE.fov.angleStepDeg) * (Math.PI / 180);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let cx = px + 0.5;
      let cy = py + 0.5;

      for (let d = 0; d < BALANCE.fov.radius; d++) {
        cx += dx;
        cy += dy;
        const mapX = Math.floor(cx);
        const mapY = Math.floor(cy);

        if (mapX < 0 || mapX >= this.COLS || mapY < 0 || mapY >= this.ROWS) break;

        // Rule B — peeking into a dark room from outside (a doorway/corridor):
        // a dark interior tile reveals only itself, and only when adjacent, then
        // stops the ray (a dark floor tile doesn't naturally block sight, so we
        // must break explicitly or the ray would sail deeper into the dark).
        if (this.isDarkInterior(mapX, mapY)) {
          if (Math.max(Math.abs(mapX - px), Math.abs(mapY - py)) <= 1) {
            this.visible[mapY][mapX] = true;
            this.explored[mapY][mapX] = true;
          }
          break;
        }

        this.visible[mapY][mapX] = true;
        this.explored[mapY][mapX] = true;

        if (blocksSight(this.map[mapY][mapX])) break;
      }
    }

    // Standing in a (lit) room lights the whole room at once, walls included —
    // the way a lit room reveals in Rogue. This also fills the gaps the raycast
    // leaves along room walls: rays run parallel to a one-tile-thick wall and
    // only graze a few of its cells, so the rest would stay dark. No-op in a
    // dark room (handled by Rule A above) or in corridors/doorways.
    this.revealRoom(px, py);

    recordExploredTiles(this.stats, this.explored);
    this.recordSightings();
  }

  /** Mark every monster currently in the player's FOV as discovered. Cheap and
   *  idempotent: only persists/notifies the UI when the seen set actually grows. */
  private recordSightings() {
    let changed = false;
    for (const m of this.monsters) {
      if (this.visible[m.y]?.[m.x]) {
        if (markSeen(this.discovery, monsterId(m), this.dungeonFloor)) changed = true;
      }
    }
    if (changed) {
      saveDiscovery(this.discovery);
      this.ui.syncDiscovery(this.discovery);
    }
  }

  /**
   * Flood the contiguous room floor the player is standing on and reveal it
   * along with its full bounding ring of walls, corners, and doors. No-op when
   * the player is in a corridor or doorway (handled by the raycast above).
   */
  private revealRoom(px: number, py: number) {
    const reveal = (x: number, y: number) => {
      if (x < 0 || x >= this.COLS || y < 0 || y >= this.ROWS) return;
      this.visible[y][x] = true;
      this.explored[y][x] = true;
    };

    this.floodRoomInterior(px, py, (x, y) => {
      reveal(x, y);
      // Light the bounding wall ring (including diagonal corners) for this cell.
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const ch = this.map[y + dr]?.[x + dc];
          if (isWall(ch) || ch === TILE.DOOR) reveal(x + dc, y + dr);
        }
      }
    });
  }

  /**
   * Flood the contiguous room-floor interior the player stands on, calling
   * `visit(x, y)` for each interior tile (floor + stairs). The single source of
   * truth for "which tiles are this room" — shared by revealRoom (lighting a lit
   * room) and lightCurrentRoom (the Scroll of Light) so the two never diverge.
   * No-op when the player is on a corridor/doorway/wall.
   */
  private floodRoomInterior(px: number, py: number, visit: (x: number, y: number) => void) {
    const isInterior = (ch: string | undefined) => ch === TILE.FLOOR || (ch !== undefined && STAIR_TILES.has(ch));
    if (!isInterior(this.map[py]?.[px])) return;

    const seen = new Set<number>([py * this.COLS + px]);
    const stack: [number, number][] = [[px, py]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      visit(x, y);
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
      if (this.gameWon) {
        this.updateUI();
        this.updateFOV();
        this.draw();
        this.autosave();
        return;
      }
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
      recordStep(this.stats);

      this.checkItems();

      const currentTile = this.map[ty][tx];
      if (currentTile === TILE.STAIRS_DOWN) {
        this.travelStairs(1);
        return;
      }
      if (currentTile === TILE.STAIRS_UP) {
        this.travelStairs(-1);
        return;
      }

      this.processTurn();
    } else if (this.tryBumpSearch(tx, ty)) {
      this.processTurn();
    } else {
      this.maybeShowDeadEndSearchHint(tx, ty);
    }
  }

  public search(): boolean {
    if (this.gameOver || this.gameWon) return false;

    recordSearch(this.stats);
    const found = this.tryRevealNearbySecret(0.25);
    this.addLog(found ? "You found a hidden door." : "You search carefully.");
    this.processTurn();
    return found;
  }

  private tryBumpSearch(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.COLS || ty < 0 || ty >= this.ROWS) return false;
    const currentTile = this.map[this.player.y]?.[this.player.x];
    if (currentTile !== TILE.CORRIDOR && currentTile !== TILE.DOOR) return false;
    if (!isSecretDoor(this.map[ty]?.[tx])) return false;

    const found = this.rng.chance(0.15);
    recordSearch(this.stats);
    if (found) {
      this.revealSecretDoor(tx, ty);
      this.addLog("You found a hidden door.");
    } else {
      this.addLog("You search carefully.");
    }
    return true;
  }

  private tryRevealNearbySecret(chance: number): boolean {
    for (const [dx, dy] of [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]) {
      const x = this.player.x + dx;
      const y = this.player.y + dy;
      if (!isSecretDoor(this.map[y]?.[x])) continue;
      if (!this.rng.chance(chance)) return false;
      this.revealSecretDoor(x, y);
      return true;
    }
    return false;
  }

  private revealSecretDoor(x: number, y: number) {
    this.map[y][x] = TILE.DOOR;
    this.secretsFoundThisRun++;
    recordSecretReveal(this.stats);
    this.updateFOV();
    this.sound.emit({ type: 'map.secretReveal' });
  }

  private hasSecretDoors(): boolean {
    return this.map.some(row => row.some(tile => isSecretDoor(tile)));
  }

  private maybeShowDeadEndSearchHint(tx: number, ty: number) {
    if (this.searchHintShown || this.secretsFoundThisRun > 0 || this.dungeonFloor < 3) return;
    if (tx < 0 || tx >= this.COLS || ty < 0 || ty >= this.ROWS) return;
    if (this.map[this.player.y]?.[this.player.x] !== TILE.CORRIDOR) return;
    if (isWalkable(this.map[ty]?.[tx])) return;

    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
      isWalkable(this.map[this.player.y + dy]?.[this.player.x + dx])
    );
    if (exits.length > 1) return;

    this.searchHintShown = true;
    this.addLog("Dead end. Press Space to search nearby walls.");
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
      recordStep(this.stats, true);

      this.checkItems();

      const currentTile = this.map[ty][tx];
      if (currentTile === TILE.STAIRS_DOWN) {
        this.travelStairs(1);
        return;
      }
      if (currentTile === TILE.STAIRS_UP) {
        this.travelStairs(-1);
        return;
      }

      this.processTurn();

      if (this.gameOver || this.gameWon) return;
      if (wasInCorridor && currentTile === TILE.DOOR) return;
      if (this.hasAdjacentMonster()) return;

      previousTile = currentTile;
    }
  }

  private travelStairs(delta: 1 | -1) {
    const targetFloor = this.dungeonFloor + delta;
    if (targetFloor < 1 || targetFloor > 20) return;

    this.saveCurrentFloor();
    this.dungeonFloor = targetFloor;
    recordStairs(this.stats, this.dungeonFloor, delta);
    this.sound.emit({ type: 'map.stairs', dir: delta > 0 ? 'down' : 'up' });

    // Log the transition before loading the floor, so any messages the
    // generator emits (e.g. the floor-20 boss announcement) read in order.
    this.addLog(`${delta > 0 ? 'Descended' : 'Ascended'} to Floor ${this.dungeonFloor}!`);
    this.loadFloorForTravel(delta);
    this.ui.updateDropdowns(this.player);
    this.updateUI();
    this.autosave();
  }

  private saveCurrentFloor() {
    this.floorStates.set(this.dungeonFloor, {
      map: this.map.map(row => [...row]),
      explored: this.explored.map(row => [...row]),
      dark: this.dark.map(row => [...row]),
      monsters: structuredClone(this.monsters),
      items: structuredClone(this.items),
    });
  }

  private loadFloorForTravel(delta: 1 | -1) {
    const saved = this.floorStates.get(this.dungeonFloor);
    if (saved) {
      this.map = saved.map.map(row => [...row]);
      this.explored = saved.explored.map(row => [...row]);
      this.dark = saved.dark ? saved.dark.map(row => [...row]) : this.blankBoolGrid();
      // Room rects aren't cached; cleared until the next generated floor.
      this.rooms = [];
      this.visible = this.blankBoolGrid();
      this.monsters = structuredClone(saved.monsters);
      this.items = structuredClone(saved.items);
    } else {
      this.generateFloor();
    }

    const arrivalTile = delta > 0 ? TILE.STAIRS_UP : TILE.STAIRS_DOWN;
    const arrival = this.findTile(arrivalTile);
    if (arrival) {
      this.player.x = arrival.x;
      this.player.y = arrival.y;
    }
    this.updateFOV();
  }

  private findTile(tile: string): { x: number; y: number } | null {
    for (let y = 0; y < this.ROWS; y++) {
      for (let x = 0; x < this.COLS; x++) {
        if (this.map[y]?.[x] === tile) return { x, y };
      }
    }
    return null;
  }

  private hasAdjacentMonster(): boolean {
    return this.monsters.some(mon =>
      Math.abs(mon.x - this.player.x) <= 1 &&
      Math.abs(mon.y - this.player.y) <= 1
    );
  }

  private executeStrike(monster: Monster, weapon: GearItem) {
    // Evasive monsters (e.g. the bat) may flit aside. Only rolls when the
    // monster actually has a dodge chance, so non-evasive monsters draw no extra
    // RNG and their seeded combat is unchanged.
    const evade = resolveBehavior(monster).defense.dodgeChance ?? 0;
    if (evade > 0 && this.rng.chance(evade)) {
      this.addLog(`${monster.name} flits aside!`);
      this.ui.fxStrike(this.player.x, this.player.y, monster.x, monster.y);
      this.ui.fxMonsterDodge(monster, this.player.x, this.player.y);
      this.sound.emit({ type: 'combat.miss', actor: 'monster' });
      recordMonsterDodge(this.stats);
      return;
    }

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
      this.ui.fxFreeze(monster.x, monster.y);
    }

    monster.hp -= outcome.damage;
    recordDamageDealt(this.stats, outcome.damage);
    this.addLog(`You strike ${monster.name} for ${outcome.damage} dmg. (${Math.max(0, monster.hp)} HP left)`);
    this.sound.emit({ type: 'combat.hit', actor: 'player', target: 'monster', damage: outcome.damage });

    // Combat flavor: lunge the player into the blow and pop a damage number.
    this.ui.fxStrike(this.player.x, this.player.y, monster.x, monster.y);
    this.ui.fxHit(monster.x, monster.y, outcome.damage, monster.hp <= 0);
  }

  /** Max HP accounting for the Vigor buff (doubled). */
  private vigorMaxHp(): number {
    return this.statusEffects.vigorTurns > 0
      ? this.player.maxHp * BALANCE.status.vigorHpMultiplier
      : this.player.maxHp;
  }

  public playerAttack(monster: Monster) {
    recordAttack(this.stats);
    this.sound.emit({ type: 'combat.swing', actor: 'player' });
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
      this.ui.fxDeath(monster.x, monster.y, monster.symbol, monster.color);
      this.sound.emit({
        type: 'combat.death',
        monsterId: monsterId(monster),
        archetype: archetypeOf(monster),
        special: monster.special,
      });

      markDefeated(this.discovery, monsterId(monster), this.dungeonFloor);
      saveDiscovery(this.discovery);
      this.ui.syncDiscovery(this.discovery);

      let xpGained = 0;
      const floorTable = MONSTER_XP_TABLE[this.player.level];
      if (floorTable && floorTable[monster.name] !== undefined) {
        xpGained = floorTable[monster.name] as number;
      }

      if (xpGained > 0) {
        this.addLog(`Gained ${xpGained} Experience.`);
        const levelBefore = this.player.level;
        const leveled = gainXp(this.player, xpGained, (msg) => this.addLog(msg), this.statusEffects);
        if (leveled) {
          recordLevelGain(this.stats, this.player.level - levelBefore);
          this.ui.updateDropdowns(this.player);
          this.sound.emit({ type: 'player.levelUp' });
        }
      } else {
        this.addLog(`No experience gained (Level delta too high).`);
      }

      if (monster.special === 'hero') {
        this.addLog(`${monster.name} is defeated!`);
      }
      if (monster.special === 'boss') {
        this.addLog(`THE ${monster.name.toUpperCase()} IS SLAIN!`);
        const requiredBosses = requiredBossNamesForFloor(this.dungeonFloor);
        const anyRequiredBossesLeft = this.monsters.some(m => m !== monster && requiredBosses.has(m.name));
        if (requiredBosses.has(monster.name) && !anyRequiredBossesLeft) {
          this.gameWon = true;
          this.addLog("ALL BOSSES DEFEATED! You have won the game! Press 'R' to restart.");
        }
      }
      recordMonsterKilled(this.stats, monster, { archetype: archetypeOf(monster), xpGained });
      this.monsters = this.monsters.filter(m => m !== monster);
      if (this.gameWon) {
        this.turn++;
        recordVitals(this.stats, this.player.hp, this.player.hunger);
        recordStatusTurn(this.stats, {
          vigor: this.statusEffects.vigorTurns > 0,
          midas: this.statusEffects.midasTurns > 0,
          strength: this.statusEffects.strengthTurns > 0,
          invisible: this.statusEffects.invisTurns > 0,
          armored: this.statusEffects.armorTurns > 0,
        });
        this.finalizeRun('won');
      }
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
        recordChest(this.stats, g);
        this.addLog(`Looted a Chest! Found +${g} Gold.`);

        if (this.player.level < 20) {
          this.addLog(`Gained +${g} Experience from the chest contents.`);
          const levelBefore = this.player.level;
          const leveled = gainXp(this.player, g, (msg) => this.addLog(msg), this.statusEffects);
          if (leveled) {
            recordLevelGain(this.stats, this.player.level - levelBefore);
            this.ui.updateDropdowns(this.player);
            this.sound.emit({ type: 'player.levelUp' });
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
          recordFoodPickedUp(this.stats);
          this.addLog("Looted Rations. Added to inventory.");
        }
      } else if (item.type === 'potion') {
        const pType = item.data.potionType;
        this.player.inventory.potions.push(pType);
        recordPotionPickedUp(this.stats, pType);
        this.addLog(`Picked up a Potion of ${pType.charAt(0).toUpperCase() + pType.slice(1)}.`);
      } else if (item.type === 'scroll' && item.data?.scrollType) {
        // Named, carryable scroll — picked up into inventory, read on demand.
        const sType = item.data.scrollType;
        this.player.inventory.scrolls.push(sType);
        this.addLog(`Picked up a Scroll of ${sType.charAt(0).toUpperCase() + sType.slice(1)}.`);
      } else if (item.type === 'scroll') {
        const { scroll, status } = BALANCE;
        const r = this.rng.next();
        if (r < scroll.vigorCut) {
          this.statusEffects.vigorTurns = status.vigorTurns;
          this.player.hp = this.player.maxHp * status.vigorHpMultiplier;
          recordScrollTriggered(this.stats, 'vigor');
          this.addLog("Vigor! HP doubled.");
        } else if (r < scroll.fatigueCut) {
          this.player.hunger = scroll.fatigueHunger;
          recordScrollTriggered(this.stats, 'fatigue');
          this.addLog("Suddenly fatigued!");
        } else if (r < scroll.midasCut) {
          this.statusEffects.midasTurns = status.midasTurns;
          recordScrollTriggered(this.stats, 'midas');
          this.addLog("Midas scroll active.");
        } else {
          const hpBeforeTrap = this.player.hp;
          this.player.hp -= scroll.trapDamage;
          recordDamageTaken(this.stats, hpBeforeTrap - this.player.hp);
          recordScrollTriggered(this.stats, 'trap');
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
          recordGearPickedUp(this.stats, item.data);
          this.addLog(`Looted: ${styledName} (+${item.data.dmg} ATK).`);
        } else {
          this.player.inventory[c as GearSlot].push(item.data);
          recordGearPickedUp(this.stats, item.data);
          this.addLog(`Looted: ${styledName} (${item.data.def} DEF).`);
        }
      }

      if (pickedUp) {
        this.items.splice(idx, 1);
        this.ui.updateDropdowns(this.player);
        const kind =
          item.type === 'gold' ? 'gold' :
          item.type === 'food' ? 'food' :
          item.type === 'potion' ? 'potion' :
          item.type === 'gear' ? 'gear' : 'scroll'; // scroll / repair_scroll
        this.sound.emit({ type: 'item.pickup', kind });
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

    this.sound.emit({ type: 'item.consume', kind: 'potion' });
    recordPotionDrunk(this.stats, pType);
    this.player.inventory.potions.splice(index, 1);
    this.ui.updateDropdowns(this.player);
    this.processTurn();
  }

  private usePotionType(potionType: InventoryRef & { kind: 'potion' }) {
    const idx = this.player.inventory.potions.findIndex(p => p === potionType.potionType);
    if (idx === -1) {
      this.addLog("You no longer have that potion.");
      this.ui.updateDropdowns(this.player);
      return false;
    }
    this.usePotion(idx);
    return true;
  }

  /**
   * Read the scroll at `index`. A successful read consumes the scroll and costs a
   * turn (like a potion). A read with no effect (e.g. Light in an already-lit
   * room or a corridor) is a no-op: the scroll is kept and no turn passes, so a
   * misclick never silently burns a monster move.
   */
  public useScroll(index: number) {
    const scrolls = this.player.inventory.scrolls;
    if (index < 0 || index >= scrolls.length) return;
    const type = scrolls[index];

    if (type === 'light') {
      const lit = this.lightCurrentRoom();
      if (!lit) {
        this.addLog("You read the scroll, but the light reveals nothing new.");
        return;
      }
      this.addLog("You read the Scroll of Light. The room floods with light!");
    }

    scrolls.splice(index, 1);
    recordScrollTriggered(this.stats, `read:${type}`);
    this.sound.emit({ type: 'item.consume', kind: 'scroll' });
    this.ui.updateDropdowns(this.player);
    this.processTurn();
  }

  private useScrollType(ref: InventoryRef & { kind: 'scroll' }): boolean {
    const idx = this.player.inventory.scrolls.findIndex(s => s === ref.scrollType);
    if (idx === -1) {
      this.addLog("You no longer have that scroll.");
      this.ui.updateDropdowns(this.player);
      return false;
    }
    this.useScroll(idx);
    return true;
  }

  /** Keyboard entry point ('r' during play): read the first carried scroll. */
  public readScroll(): boolean {
    if (this.player.inventory.scrolls.length === 0) {
      this.addLog("You have no scrolls to read.");
      return false;
    }
    this.useScroll(0);
    return true;
  }

  /**
   * Light the contiguous room the player stands on: clear its `dark` bits and
   * re-run FOV so the now-lit room reveals at once. Reuses the same interior
   * flood as revealRoom (no second lighting implementation). Returns true only
   * if at least one dark tile was cleared (so the caller can decide whether to
   * consume a scroll / spend a turn). No-op in corridors or already-lit rooms.
   */
  private lightCurrentRoom(): boolean {
    const px = this.player.x;
    const py = this.player.y;
    const isInterior = (ch: string | undefined) =>
      ch === TILE.FLOOR || (ch !== undefined && STAIR_TILES.has(ch));
    if (!isInterior(this.map[py]?.[px])) return false;

    let cleared = false;
    const seen = new Set<number>([py * this.COLS + px]);
    const stack: [number, number][] = [[px, py]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (this.dark[y]?.[x]) {
        this.dark[y][x] = false;
        cleared = true;
      }
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
    if (cleared) this.updateFOV();
    return cleared;
  }

  public consumeFood(): boolean {
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
      this.sound.emit({ type: 'item.consume', kind: 'food' });
      recordFoodEaten(this.stats);
      this.updateUI();
      this.processTurn();
      return true;
    } else {
      this.addLog("You have no food to eat!");
      return false;
    }
  }

  public equipGear(slot: EquipSlot, value: string) {
    const before = snapshotEquipped(this.player);
    const ok = handleEquipItem(this.player, slot, value, (msg) => this.addLog(msg));
    this.emitEquipSounds(before, ok);
    if (ok) recordEquipmentChange(this.stats);
    this.ui.updateDropdowns(this.player);
    this.updateUI();
    this.autosave();
  }

  /** Emit equip/unequip/rejected cues from a before/after equipped diff. */
  private emitEquipSounds(before: EquipSnapshot, ok: boolean) {
    const events = diffEquipped(before, snapshotEquipped(this.player));
    if (events.length > 0) {
      events.forEach(e => this.sound.emit(e));
    } else if (!ok) {
      this.sound.emit({ type: 'equipment.rejected' });
    }
  }

  public equipInventoryItem(ref: InventoryRef): boolean {
    if (ref.kind === 'food' || ref.kind === 'potion' || ref.kind === 'scroll') {
      this.addLog("That item cannot be equipped.");
      this.ui.updateDropdowns(this.player);
      this.sound.emit({ type: 'equipment.rejected' });
      return false;
    }

    const target = inventoryRefToEquipTarget(this.player, ref);
    if (!target) {
      this.addLog("That item cannot be equipped.");
      this.ui.updateDropdowns(this.player);
      this.sound.emit({ type: 'equipment.rejected' });
      return false;
    }

    const before = snapshotEquipped(this.player);
    const equipped = equipValidated(this.player, target, (msg) => this.addLog(msg));
    this.emitEquipSounds(before, equipped);
    if (equipped) recordEquipmentChange(this.stats);
    this.ui.updateDropdowns(this.player);
    this.updateUI();
    if (equipped) this.autosave();
    return equipped;
  }

  public useInventoryItem(ref: InventoryRef): boolean {
    if (ref.kind === 'food') {
      return this.consumeFood();
    }
    if (ref.kind === 'potion') {
      return this.usePotionType(ref);
    }
    if (ref.kind === 'scroll') {
      return this.useScrollType(ref);
    }
    this.addLog("That item cannot be used.");
    this.ui.updateDropdowns(this.player);
    return false;
  }

  public performInventoryAction(ref: InventoryRef, action: InventoryAction): boolean {
    if (action === 'equip') return this.equipInventoryItem(ref);
    if (action === 'equipOffHand' && ref.kind === 'weapon') {
      const before = snapshotEquipped(this.player);
      const equipped = equipValidated(this.player, { slot: 'offHand', value: `weapon:${ref.index}` }, (msg) => this.addLog(msg));
      this.emitEquipSounds(before, equipped);
      if (equipped) recordEquipmentChange(this.stats);
      this.ui.updateDropdowns(this.player);
      this.updateUI();
      if (equipped) this.autosave();
      return equipped;
    }
    if (action === 'use') return this.useInventoryItem(ref);
    return false;
  }

  public processTurn() {
    if (this.gameOver || this.gameWon) return;
    this.turn++;
    const hpAtTurnStart = this.player.hp;

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
      const cause: DeathCause = hpAtTurnStart <= 0 ? 'trap_scroll' : 'starvation';
      recordDamageTaken(this.stats, Math.max(0, hpAtTurnStart - this.player.hp));
      recordVitals(this.stats, this.player.hp, this.player.hunger);
      this.finalizeRun('died', cause);
      this.addLog("GAME OVER. Press R.");
      this.sound.emit({ type: 'player.death' });
      this.updateUI();
      this.updateFOV();
      this.draw();
      this.autosave();
      return;
    }

    const totalDef = getTotalDef(this.player, this.statusEffects);

    // Monsters turn
    const hpBeforeMonsters = this.player.hp;
    processMonsterAI(
      this.monsters,
      this.player,
      this.statusEffects,
      this.map,
      this.COLS,
      this.ROWS,
      totalDef,
      (msg) => this.addLog(msg),
      this.rng,
      this.turn,
      {
        dive: (fx, fy, tx, ty, color) => this.ui.fxDive(fx, fy, tx, ty, color),
        whiff: (x, y) => this.ui.fxWhiff(x, y),
      },
      this.dark
    );
    if (this.player.hp < hpBeforeMonsters) {
      recordDamageTaken(this.stats, hpBeforeMonsters - this.player.hp);
      this.ui.fxPlayerHit();
      this.sound.emit({ type: 'combat.hit', actor: 'monster', target: 'player' });
    }

    if (this.player.hp <= 0) {
      this.gameOver = true;
      recordVitals(this.stats, this.player.hp, this.player.hunger);
      this.finalizeRun('died', 'monster');
      this.addLog("GAME OVER. Press R.");
      this.sound.emit({ type: 'player.death' });
    } else {
      recordVitals(this.stats, this.player.hp, this.player.hunger);
      recordStatusTurn(this.stats, {
        vigor: this.statusEffects.vigorTurns > 0,
        midas: this.statusEffects.midasTurns > 0,
        strength: this.statusEffects.strengthTurns > 0,
        invisible: this.statusEffects.invisTurns > 0,
        armored: this.statusEffects.armorTurns > 0,
      });
      this.emitVitalSounds();
    }

    this.updateUI();
    this.updateFOV();
    this.draw();
    this.autosave();
  }

  /** Feed current vitals to the crossing tracker and emit any warning cues. */
  private emitVitalSounds() {
    const events = this.vitals.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      hunger: this.player.hunger,
    });
    events.forEach(e => this.sound.emit(e));
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

  private finalizeRun(outcome: 'won' | 'died', deathCause?: DeathCause): RunSummaryV1 {
    if (this.finalRunSummary?.runId === this.stats.runId) return this.finalRunSummary;
    const summary = buildRunSummary({
      outcome,
      seed: this.seed,
      turns: this.turn,
      floorReached: this.dungeonFloor,
      player: this.player,
      finalDefense: getTotalDef(this.player, this.statusEffects),
      stats: this.stats,
      finalLogs: this.logs,
      deathCause,
    });
    this.finalRunSummary = summary;
    this.onRunFinished?.(summary);
    return summary;
  }

  /**
   * Deep, JSON-serializable snapshot of the full run state. `visible` is
   * omitted (recomputed on restore via updateFOV) and `discovery` is excluded
   * (persisted independently in discovery.ts).
   */
  public snapshot(): SaveGameV2 {
    return {
      seed: this.seed,
      rngState: this.rng.getState(),
      player: structuredClone(this.player),
      statusEffects: { ...this.statusEffects },
      dungeonFloor: this.dungeonFloor,
      turn: this.turn,
      gameOver: this.gameOver,
      gameWon: this.gameWon,
      logs: [...this.logs],
      map: this.map.map(r => [...r]),
      explored: this.explored.map(r => [...r]),
      dark: this.dark.map(r => [...r]),
      monsters: structuredClone(this.monsters),
      items: structuredClone(this.items),
      floorStates: Array.from(this.floorStates.entries()).map(([f, s]) => [f, {
        map: s.map.map(r => [...r]),
        explored: s.explored.map(r => [...r]),
        dark: (s.dark ?? this.blankBoolGrid()).map(r => [...r]),
        monsters: structuredClone(s.monsters),
        items: structuredClone(s.items),
      }]),
      searchHintShown: this.searchHintShown,
      secretsFoundThisRun: this.secretsFoundThisRun,
      stats: structuredClone(this.stats),
    };
  }

  /**
   * Rebuild the run from an ALREADY-VALIDATED save (savegame.ts owns
   * validation). Returns false and leaves prior state if the rebuild throws.
   */
  public restore(save: SaveGameV2): boolean {
    try {
      this.seed = save.seed;
      this.rng = makeRng(save.seed, save.rngState);
      this.player = structuredClone(save.player);
      // Backfill the scrolls bucket for saves written before scrolls existed.
      if (!Array.isArray(this.player.inventory.scrolls)) this.player.inventory.scrolls = [];
      this.statusEffects = { ...save.statusEffects };
      this.dungeonFloor = save.dungeonFloor;
      this.turn = save.turn;
      this.gameOver = save.gameOver;
      this.gameWon = save.gameWon;
      this.logs = [...save.logs];
      this.map = save.map.map(r => [...r]);
      this.explored = save.explored.map(r => [...r]);
      this.dark = save.dark ? save.dark.map(r => [...r]) : this.blankBoolGrid();
      this.rooms = [];
      this.monsters = structuredClone(save.monsters);
      this.items = structuredClone(save.items);
      this.floorStates = new Map(save.floorStates.map(([f, s]) => [f, {
        map: s.map.map(r => [...r]),
        explored: s.explored.map(r => [...r]),
        dark: (s.dark ?? this.blankBoolGrid()).map(r => [...r]),
        monsters: structuredClone(s.monsters),
        items: structuredClone(s.items),
      }]));
      this.searchHintShown = save.searchHintShown;
      this.secretsFoundThisRun = save.secretsFoundThisRun;
      this.stats = structuredClone(save.stats);
      this.finalRunSummary = null;

      this.updateFOV();
      this.ui.updateDropdowns(this.player);
      this.updateUI();
      this.ui.resetLog();
      this.ui.renderLogs(this.logs);
      this.ui.syncDiscovery(this.discovery);
      if (this.gameWon) this.finalizeRun('won');
      else if (this.gameOver) this.finalizeRun('died', this.stats.deathCause ?? 'unknown');
      return true;
    } catch (e) {
      console.error('Failed to restore save game', e);
      return false;
    }
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
    this.autosave();
  }
}

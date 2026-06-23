import { Player, Monster, Item, StatusEffects, GearItem, EquipSlot, GearSlot, InventoryAction, InventoryRef, ScrollType, TrapEffects, TrapKind, TrapState, WandItem, ARMOR_SLOTS } from './types';
import { GameUI } from './ui';
import { generateLevel, type RoomRect } from './map';
import { createPlayer, getTotalDef, gainXp, handleEquipItem, equipValidated, inventoryRefToEquipTarget } from './player';
import { MONSTER_XP_TABLE, CHEST_GOLD_TABLE, BALANCE, getConfig, getScaledMonsterHP, MONSTER_DATABASE } from './config';
import { wandCooldown, wandHungerCost, isSelfTargetWand, isBeamWand } from './wands';
import { SCROLLS, scrollDisplayName, isScrollImplemented } from './scrolls';
import { requiredBossNamesForFloor } from './encounters';
import { processMonsterAI } from './monster';
import { archetypeOf, effectiveBehavior } from './ai/archetypes';
import { computeStrike } from './combat';
import { type SoundSink, noopSink } from './audio/events';
import { snapshotEquipped, diffEquipped, type EquipSnapshot } from './audio/equipment';
import { VitalsSoundTracker } from './audio/vitals';
import { isWalkable, blocksSight, isWall, TILE, STAIR_TILES, isSecretDoor } from './tiles';
import { RNG, makeRng, randomSeed } from './rng';
import { damageEquippedGear, normalizeAllGearHealth, repairAllDefensiveGear } from './gearHealth';
import {
  bearTrapTurns,
  maxDartDrainStacks,
  trapDirectDamage,
  TRAP_REVEAL_MESSAGES,
  TRAP_TRIGGER_MESSAGES,
} from './traps';
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
  traps?: TrapState[];
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
  public traps: TrapState[] = [];
  public dungeonFloor: number = 1;
  public gameOver: boolean = false;
  public gameWon: boolean = false;
  public logs: string[] = [];
  /** Turns elapsed this run — surfaced in the HUD; no effect on game logic. */
  public turn: number = 0;
  public stats: RunStatsV1 = createRunStats();
  public finalRunSummary: RunSummaryV1 | null = null;

  /** Transient wand-aiming state. Non-null while the player has "drawn" a wand
   *  and the UI is routing direction keys to zapInDirection. No turn passes
   *  while aiming. Never persisted. */
  public aiming: { ref: InventoryRef & { kind: 'wand' } } | null = null;

  public statusEffects: StatusEffects = {
    vigorTurns: 0,
    midasTurns: 0,
    strengthTurns: 0,
    invisTurns: 0,
    armorTurns: 0
  };

  public trapEffects: TrapEffects = {
    bearTrapTurns: 0,
    sleepTurns: 0,
    strengthDrained: 0,
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
  private trapdoorGeneratedThisRun = false;

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
    this.trapEffects = {
      bearTrapTurns: 0,
      sleepTurns: 0,
      strengthDrained: 0,
    };
    this.floorStates.clear();
    this.searchHintShown = false;
    this.secretsFoundThisRun = 0;
    this.trapdoorGeneratedThisRun = false;
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
    const levelData = generateLevel(this.dungeonFloor, this.player.level, this.COLS, this.ROWS, this.rng, {
      trapdoorAllowed: !this.trapdoorGeneratedThisRun,
    });
    this.map = levelData.map;
    this.dark = levelData.dark;
    this.rooms = levelData.rooms;
    this.player.x = levelData.playerX;
    this.player.y = levelData.playerY;
    this.monsters = levelData.monsters;
    this.items = levelData.items;
    this.traps = levelData.traps;
    if (this.traps.some(trap => trap.kind === 'trapdoor')) this.trapdoorGeneratedThisRun = true;

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
    if (this.takeSleepTurn()) return;

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

    if (this.trapEffects.bearTrapTurns > 0) {
      this.addLog("The bear trap holds you fast.");
      this.trapEffects.bearTrapTurns--;
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

      const trapResult = this.triggerTrapAtPlayer();
      if (trapResult.travelled) return;
      if (!trapResult.teleported) this.checkItems();

      const currentTile = this.map[this.player.y][this.player.x];
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
    if (this.takeSleepTurn()) return false;

    recordSearch(this.stats);
    const trapSearch = this.tryRevealNearbyTrap(BALANCE.map.traps.revealChance);
    const trap = trapSearch.trap;
    const found = trap !== null || (!trapSearch.attempted && this.tryRevealNearbySecret(0.25));
    this.addLog(trap ? TRAP_REVEAL_MESSAGES[trap.kind] : found ? "You found a hidden door." : "You search carefully.");
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

  private tryRevealNearbyTrap(chance: number): { attempted: boolean; trap: TrapState | null } {
    for (const [dx, dy] of [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]) {
      const trap = this.trapAt(this.player.x + dx, this.player.y + dy);
      if (!trap || trap.revealed) continue;
      if (!this.rng.chance(chance)) return { attempted: true, trap: null };
      trap.revealed = true;
      this.updateFOV();
      return { attempted: true, trap };
    }
    return { attempted: false, trap: null };
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

  private trapAt(x: number, y: number): TrapState | undefined {
    return this.traps.find(trap => trap.x === x && trap.y === y);
  }

  private armedTrapAt(x: number, y: number): TrapState | undefined {
    return this.traps.find(trap => trap.x === x && trap.y === y && trap.armed);
  }

  private capNonlethalDamage(amount: number): number {
    return Math.max(0, Math.min(amount, this.player.hp - 1));
  }

  private applyTrapDamage(kind: TrapKind): number {
    const damage = this.capNonlethalDamage(trapDirectDamage(kind, this.rng));
    if (damage > 0) {
      this.player.hp -= damage;
      recordDamageTaken(this.stats, damage);
      this.ui.fxPlayerHit();
    }
    return damage;
  }

  private triggerTrapAtPlayer(): { travelled: boolean; teleported: boolean } {
    const trap = this.armedTrapAt(this.player.x, this.player.y);
    if (!trap) return { travelled: false, teleported: false };

    trap.revealed = true;
    trap.armed = false;
    recordScrollTriggered(this.stats, `trap:${trap.kind}`);
    this.addLog(TRAP_TRIGGER_MESSAGES[trap.kind]);

    if (trap.kind === 'bear') {
      const damage = this.applyTrapDamage(trap.kind);
      this.trapEffects.bearTrapTurns = Math.max(this.trapEffects.bearTrapTurns, bearTrapTurns(this.dungeonFloor));
      if (damage > 0) this.addLog(`The jaws bite for ${damage} damage.`);
      return { travelled: false, teleported: false };
    }

    if (trap.kind === 'sleep_gas') {
      const adjacentMonster = this.monsters.some(mon =>
        this.visible[mon.y]?.[mon.x] &&
        Math.max(Math.abs(mon.x - this.player.x), Math.abs(mon.y - this.player.y)) <= 1
      );
      this.trapEffects.sleepTurns = adjacentMonster
        ? BALANCE.map.traps.adjacentMonsterSleepTurns
        : BALANCE.map.traps.sleepTurns;
      return { travelled: false, teleported: false };
    }

    if (trap.kind === 'dart') {
      const damage = this.applyTrapDamage(trap.kind);
      const before = this.trapEffects.strengthDrained;
      this.trapEffects.strengthDrained = Math.min(maxDartDrainStacks(this.dungeonFloor), before + 1);
      const drained = this.trapEffects.strengthDrained > before;
      this.addLog(drained ? "Your strength ebbs." : "You resist further weakness.");
      if (damage > 0) this.addLog(`The dart hits for ${damage} damage.`);
      return { travelled: false, teleported: false };
    }

    if (trap.kind === 'teleport') {
      this.teleportPlayerSafely();
      return { travelled: false, teleported: true };
    }

    this.applyTrapDamage(trap.kind);
    this.travelTrapdoor();
    return { travelled: true, teleported: false };
  }

  private teleportPlayerSafely() {
    const candidates: Array<{ x: number; y: number; dark: boolean }> = [];
    for (let y = 0; y < this.ROWS; y++) {
      for (let x = 0; x < this.COLS; x++) {
        if (this.map[y]?.[x] !== TILE.FLOOR) continue;
        if (this.armedTrapAt(x, y)) continue;
        if (this.monsters.some(mon => Math.max(Math.abs(mon.x - x), Math.abs(mon.y - y)) <= 1)) continue;
        candidates.push({ x, y, dark: this.dark[y]?.[x] === true });
      }
    }
    const pool = candidates.filter(c => !c.dark);
    const options = pool.length > 0 ? pool : candidates;
    if (options.length === 0) return;
    const destination = this.rng.pick(options);
    this.player.x = destination.x;
    this.player.y = destination.y;
    this.updateFOV();
  }

  private travelTrapdoor() {
    if (this.dungeonFloor >= 20) return;
    this.saveCurrentFloor();
    this.dungeonFloor++;
    recordStairs(this.stats, this.dungeonFloor, 1);
    this.addLog(`Dropped to Floor ${this.dungeonFloor}!`);
    this.loadFloorForTravel(1);
    this.ui.updateDropdowns(this.player);
    this.updateUI();
    this.autosave();
  }

  private takeSleepTurn(): boolean {
    if (this.trapEffects.sleepTurns <= 0) return false;
    this.addLog("You are asleep.");
    this.trapEffects.sleepTurns--;
    this.processTurn();
    return true;
  }

  private hasAnyTrapdoorInRun(): boolean {
    if (this.traps.some(trap => trap.kind === 'trapdoor')) return true;
    for (const state of this.floorStates.values()) {
      if ((state.traps ?? []).some(trap => trap.kind === 'trapdoor')) return true;
    }
    return false;
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
    if (this.takeSleepTurn()) return;
    if (this.trapEffects.bearTrapTurns > 0) {
      this.addLog("The bear trap holds you fast.");
      this.trapEffects.bearTrapTurns--;
      this.processTurn();
      return;
    }

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

      const trapResult = this.triggerTrapAtPlayer();
      if (trapResult.travelled) return;
      if (!trapResult.teleported) this.checkItems();

      const currentTile = this.map[this.player.y][this.player.x];
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
      if (trapResult.teleported || this.trapEffects.bearTrapTurns > 0 || this.trapEffects.sleepTurns > 0) return;
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
      traps: structuredClone(this.traps),
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
      this.traps = structuredClone(saved.traps ?? []);
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
    const evade = effectiveBehavior(monster).defense.dodgeChance ?? 0;
    if (evade > 0 && this.rng.chance(evade)) {
      this.addLog(`${monster.name} flits aside!`);
      this.ui.fxStrike(this.player.x, this.player.y, monster.x, monster.y);
      this.ui.fxMonsterDodge(monster, this.player.x, this.player.y);
      this.sound.emit({ type: 'combat.miss', actor: 'monster' });
      recordMonsterDodge(this.stats);
      return;
    }

    const outcome = computeStrike({
      baseAtk: Math.max(1, this.player.baseAtk - this.trapEffects.strengthDrained),
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
      this.handleMonsterDeath(monster);
    }
  }

  /**
   * Resolve a monster's death: FX, discovery, XP/level-up, boss/win check, and
   * removal from the floor. Shared by melee (`executeStrike`) and ranged wand
   * kills (`applyWandEffect`) so both award XP and trigger the win condition the
   * same way. Caller is responsible for spending the turn (processTurn) — except
   * the win path, which spends it here (matching the legacy melee behavior).
   */
  private handleMonsterDeath(monster: Monster) {
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
        // No scroll applies its effect on pickup any more.
        const sType = item.data.scrollType;
        this.player.inventory.scrolls.push(sType);
        this.addLog(`Picked up ${scrollDisplayName(sType)}.`);
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
      } else if (item.type === 'wand') {
        // Carried (not equipped) — pushed into its own bucket, zapped on demand.
        this.player.inventory.wands.push(item.data);
        this.addLog(`Looted: ${this.ui.getStyledItemName(item.data.name, item.data.rarity || 'common')}.`);
      }

      if (pickedUp) {
        this.items.splice(idx, 1);
        this.ui.updateDropdowns(this.player);
        const kind =
          item.type === 'gold' ? 'gold' :
          item.type === 'food' ? 'food' :
          item.type === 'potion' ? 'potion' :
          item.type === 'gear' ? 'gear' :
          item.type === 'wand' ? 'wand' : 'scroll';
        this.sound.emit({ type: 'item.pickup', kind });
      }
    }
  }

  public usePotion(index: number) {
    if (this.takeSleepTurn()) return;
    if (index < 0 || index >= this.player.inventory.potions.length) return;
    const pType = this.player.inventory.potions[index];

    if (pType === 'healing') {
      this.player.hp = Math.min(this.player.hp + BALANCE.potions.healAmount, this.vigorMaxHp());
      this.addLog("Drank Potion of Healing. Recouped some health.");
    } else if (pType === 'strength') {
      if (this.trapEffects.strengthDrained > 0) {
        this.trapEffects.strengthDrained = 0;
        this.addLog("Strength drain cleared.");
      }
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
   * room, Repair with no damage) is a no-op for scrolls flagged
   * `noOpKeepsScroll`: the scroll is kept and no turn passes, so a misclick never
   * silently burns a monster move. The per-type effect lives in
   * applyScrollEffect; effect metadata lives in the src/scrolls.ts registry.
   */
  public useScroll(index: number) {
    if (this.takeSleepTurn()) return;
    const scrolls = this.player.inventory.scrolls;
    if (index < 0 || index >= scrolls.length) return;
    const type = scrolls[index];

    // Catalog types whose effect isn't wired up yet never spawn, but a legacy
    // save or a future migration could carry one — keep it and spend no turn.
    if (!isScrollImplemented(type)) {
      this.addLog("You cannot puzzle out this scroll yet.");
      return;
    }

    const def = SCROLLS[type];
    const effective = this.applyScrollEffect(type);
    // A foreseeable no-op (lit room, undamaged gear, fully-mapped floor) keeps
    // the scroll and spends no turn; everything else consumes and takes a turn.
    if (!effective && def.noOpKeepsScroll) return;

    scrolls.splice(index, 1);
    recordScrollTriggered(this.stats, `read:${type}`);
    this.sound.emit({ type: 'item.consume', kind: 'scroll', scrollType: type });
    this.ui.updateDropdowns(this.player);
    this.processTurn();
  }

  /**
   * Apply a scroll's effect. Returns whether the read accomplished something —
   * used together with `noOpKeepsScroll` to decide whether the scroll is
   * consumed. Always logs, so the player learns what happened regardless of the
   * scroll text. Phase 1 effects only (no item targeting); see the plan.
   */
  private applyScrollEffect(type: ScrollType): boolean {
    switch (type) {
      case 'light': {
        const lit = this.lightCurrentRoom();
        this.addLog(lit
          ? "You read the Scroll of Light. The room floods with light!"
          : "You read the scroll, but the light reveals nothing new.");
        return lit;
      }
      case 'repair': {
        const repaired = repairAllDefensiveGear(this.player);
        this.addLog(repaired > 0
          ? "You read the Scroll of Repair. Your armor and shields mend."
          : "You read the scroll, but your gear is already sound.");
        return repaired > 0;
      }
      case 'magic_mapping': {
        const revealed = this.revealFloorLayout();
        this.addLog(revealed
          ? "You read the Scroll of Magic Mapping. The floor's layout floods into your mind."
          : "You read the scroll, but you have already mapped this floor.");
        return revealed;
      }
      case 'teleportation': {
        this.teleportPlayerSafely();
        this.addLog("You read the Scroll of Teleportation and blink across the dungeon!");
        return true;
      }
      case 'sleep': {
        // The read itself spends a turn (processTurn below) — that is the first
        // turn the player is helpless; the remaining sleepTurns tick on later
        // inputs. Subtract one so the total helpless span equals the configured
        // duration rather than duration + 1.
        const remaining = Math.max(0, BALANCE.scrolls.sleepTurns - 1);
        this.trapEffects.sleepTurns = Math.max(this.trapEffects.sleepTurns, remaining);
        this.addLog("You read the Scroll of Sleep. Your eyes grow heavy and you slump to the floor!");
        return true;
      }
      case 'hold_monster': {
        const held = this.holdMonstersInSight();
        this.addLog(held > 0
          ? `You read the Scroll of Hold Monster. ${held} monster${held === 1 ? '' : 's'} freeze in place!`
          : "You read the Scroll of Hold Monster, but nothing is in sight to hold.");
        return true;
      }
      case 'create_monster': {
        const spawned = this.spawnMonsterAdjacent();
        this.addLog(spawned
          ? "You read the Scroll of Create Monster. Something lurches into being beside you!"
          : "You read the Scroll of Create Monster, but there is no room for it to form.");
        return true;
      }
      case 'aggravate_monsters': {
        const woke = this.aggravateAllMonsters();
        this.addLog(woke > 0
          ? "You read the Scroll of Aggravate Monsters. A furious din wakes every creature on the floor!"
          : "You read the Scroll of Aggravate Monsters. The silence is somehow worse.");
        return true;
      }
      case 'food_detection': {
        const n = this.detectItems('food');
        this.addLog(n > 0
          ? `You read the Scroll of Food Detection. You sense ${n} cache${n === 1 ? '' : 's'} of food.`
          : "You read the Scroll of Food Detection, but sense no food on this floor.");
        return true;
      }
      case 'gold_detection': {
        const n = this.detectItems('gold');
        this.addLog(n > 0
          ? `You read the Scroll of Gold Detection. You sense ${n} hoard${n === 1 ? '' : 's'} of gold.`
          : "You read the Scroll of Gold Detection, but sense no gold on this floor.");
        return true;
      }
      case 'blank_paper': {
        this.addLog("You read the scroll, but the parchment is blank. Nothing happens.");
        return true;
      }
      case 'enchant_weapon': {
        const weapon = this.enchantableWeapon();
        if (!weapon) {
          this.addLog("You read the Scroll of Enchant Weapon, but you have no weapon to enchant.");
          return false;
        }
        weapon.dmg = (weapon.dmg ?? 0) + BALANCE.scrolls.enchantWeaponBonus;
        this.addLog(`You read the Scroll of Enchant Weapon. Your ${weapon.name} glows with power! (+${BALANCE.scrolls.enchantWeaponBonus} ATK)`);
        return true;
      }
      case 'enchant_armor': {
        const armor = this.enchantableArmor();
        if (!armor) {
          this.addLog("You read the Scroll of Enchant Armor, but you have no armor to enchant.");
          return false;
        }
        const bonus = BALANCE.scrolls.enchantArmorBonus;
        armor.def = (armor.def ?? 0) + bonus;
        armor.maxDef = Math.max(armor.maxDef ?? 0, armor.def);
        if (armor.health) {
          armor.health.max += bonus;
          armor.health.current = armor.health.max; // an enchant also restores it
        }
        this.addLog(`You read the Scroll of Enchant Armor. Your ${armor.name} hardens! (+${bonus} DEF)`);
        return true;
      }
      default:
        // Unimplemented catalog types are filtered out before reaching here.
        this.addLog("You cannot puzzle out this scroll yet.");
        return false;
    }
  }

  /** Enchant Weapon target: the equipped main-hand weapon, else the first
   *  carried weapon, else none. (Rogue enchants what's wielded; the future
   *  item-target picker will let the player choose another.) */
  private enchantableWeapon(): GearItem | undefined {
    return this.player.inventory.weapons[this.player.equipped.mainHand]
      ?? this.player.inventory.weapons[0];
  }

  /** Enchant Armor target: the best *real* defensive piece (highest maxDef),
   *  preferring equipped gear and skipping the "None" (def 0) slot placeholders.
   *  Falls back to the best carried piece, else none. */
  private enchantableArmor(): GearItem | undefined {
    const best = (items: Array<GearItem | undefined>): GearItem | undefined => {
      let pick: GearItem | undefined;
      for (const g of items) {
        if (!g || (g.maxDef ?? g.def ?? 0) <= 0) continue;
        if (!pick || (g.maxDef ?? 0) > (pick.maxDef ?? 0)) pick = g;
      }
      return pick;
    };

    const equipped: Array<GearItem | undefined> = ARMOR_SLOTS.map(
      slot => this.player.inventory[slot][this.player.equipped[slot]]
    );
    if (this.player.equipped.offHand.startsWith('shield:')) {
      const idx = parseInt(this.player.equipped.offHand.split(':')[1] ?? '', 10);
      equipped.push(this.player.inventory.shield[idx]);
    }
    const equippedPick = best(equipped);
    if (equippedPick) return equippedPick;

    const carried: Array<GearItem | undefined> = [
      ...ARMOR_SLOTS.flatMap(slot => this.player.inventory[slot]),
      ...this.player.inventory.shield,
    ];
    return best(carried);
  }

  /** Magic Mapping: reveal the whole floor's layout (rooms, corridors, doors,
   *  stairs, walls) without lighting dark rooms or exposing secret doors —
   *  secret-door fairness is preserved. Returns true if anything was newly
   *  revealed (so a fully-explored floor keeps the scroll). */
  private revealFloorLayout(): boolean {
    let revealed = false;
    for (let y = 0; y < this.ROWS; y++) {
      for (let x = 0; x < this.COLS; x++) {
        const ch = this.map[y]?.[x];
        if (ch === undefined || ch === TILE.VOID || isSecretDoor(ch)) continue;
        if (!this.explored[y][x]) {
          this.explored[y][x] = true;
          revealed = true;
        }
      }
    }
    if (revealed) this.updateUI();
    return revealed;
  }

  /** Hold Monster: freeze every monster currently in the player's view. Returns
   *  the number held. */
  private holdMonstersInSight(): number {
    let held = 0;
    for (const m of this.monsters) {
      if (this.visible[m.y]?.[m.x]) {
        m.frozenTurns = Math.max(m.frozenTurns, BALANCE.scrolls.holdMonsterTurns);
        this.ui.fxFreeze(m.x, m.y);
        held++;
      }
    }
    return held;
  }

  /** Create Monster: spawn a floor-appropriate, non-special monster on a free
   *  tile adjacent to the player. Returns false if no adjacent tile is open. */
  private spawnMonsterAdjacent(): boolean {
    const spots: Array<{ x: number; y: number }> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = this.player.x + dx;
        const y = this.player.y + dy;
        if (!isWalkable(this.map[y]?.[x])) continue;
        if (this.monsters.some(m => m.x === x && m.y === y)) continue;
        if (this.armedTrapAt(x, y)) continue;
        spots.push({ x, y });
      }
    }
    if (spots.length === 0) return false;
    const candidates = MONSTER_DATABASE.filter(t => t.minFloor <= this.dungeonFloor && !t.special);
    if (candidates.length === 0) return false;
    const tmpl = this.rng.pick(candidates);
    const spot = this.rng.pick(spots);
    const hp = getScaledMonsterHP(tmpl.hp, tmpl.name);
    this.monsters.push({
      ...tmpl,
      x: spot.x,
      y: spot.y,
      hp,
      maxHp: hp,
      frozenTurns: 0,
      canceledTurns: 0,
      ai: { state: 'hunting', cooldowns: {}, swipeToggle: false },
    });
    return true;
  }

  /** Aggravate Monsters: wake every monster and set it hunting. Returns the
   *  number of monsters affected. */
  private aggravateAllMonsters(): number {
    for (const m of this.monsters) {
      if (m.ai) m.ai.state = 'hunting';
      else m.ai = { state: 'hunting', cooldowns: {}, swipeToggle: false };
    }
    return this.monsters.length;
  }

  /** Food/Gold Detection: mark every matching floor item as explored so it shows
   *  on the map. Returns how many were sensed. */
  private detectItems(kind: 'food' | 'gold'): number {
    let count = 0;
    for (const it of this.items) {
      if (it.type !== kind) continue;
      if (this.explored[it.y]?.[it.x] !== undefined) this.explored[it.y][it.x] = true;
      count++;
    }
    if (count > 0) this.updateUI();
    return count;
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

  /** Deliberate read of a specific carried scroll (by type) — the entry point
   *  the inventory chooser uses. Routes through the same dispatcher as `r`. */
  public readScrollRef(ref: InventoryRef & { kind: 'scroll' }): boolean {
    if (this.gameOver || this.gameWon) return false;
    return this.useScrollType(ref);
  }

  /** Keyboard entry point ('r' during play): read the first carried scroll.
   *  The scroll-focused chooser (opened from `r` once the filtered inventory
   *  lands) calls readScrollRef for a deliberate, type-specific read. */
  public readScroll(): boolean {
    if (this.takeSleepTurn()) return false;
    if (this.player.inventory.scrolls.length === 0) {
      this.addLog("You have no scrolls to read.");
      return false;
    }
    this.useScroll(0);
    return true;
  }

  // ----- Wands: aiming + zapping ---------------------------------------------

  /** Keyboard entry ('z'): draw the first carried wand for aiming. Prefers a
   *  ready (off-cooldown) wand so the common case "z + direction" just works. */
  public drawFirstWand(): boolean {
    if (this.gameOver || this.gameWon) return false;
    const wands = this.player.inventory.wands;
    if (wands.length === 0) {
      this.addLog("You have no wands to zap.");
      return false;
    }
    let index = wands.findIndex(w => (w.cooldownRemaining ?? 0) === 0);
    if (index === -1) index = 0;
    return this.beginZap({ kind: 'wand', index });
  }

  /** Begin aiming the referenced wand. Self-targeted wands resolve immediately
   *  (no direction needed). Returns false and spends no turn if the wand is gone
   *  or still recharging. */
  public beginZap(ref: InventoryRef & { kind: 'wand' }): boolean {
    if (this.gameOver || this.gameWon) return false;
    const wand = this.player.inventory.wands[ref.index];
    if (!wand) {
      this.addLog("You no longer have that wand.");
      this.ui.updateDropdowns(this.player);
      return false;
    }
    if ((wand.cooldownRemaining ?? 0) > 0) {
      this.addLog(`The ${wand.name} is still recharging. (${wand.cooldownRemaining})`);
      return false;
    }
    if (isSelfTargetWand(wand.wandType)) {
      return this.zapWand(ref.index, 0, 0);
    }
    this.aiming = { ref };
    this.ui.setAiming({ wandName: wand.name });
    return true;
  }

  /** Resolve the drawn wand in a unit direction. No-op if not currently aiming. */
  public zapInDirection(dx: number, dy: number): boolean {
    if (!this.aiming) return false;
    const index = this.aiming.ref.index;
    this.aiming = null;
    this.ui.setAiming(null);
    return this.zapWand(index, dx, dy);
  }

  /** Abort aiming. No turn passes. */
  public cancelZap(): void {
    if (!this.aiming) return;
    this.aiming = null;
    this.ui.setAiming(null);
  }

  /**
   * Zap the wand at `index` in unit direction (dx,dy). Mirrors the potion/scroll
   * spine: sleep guard, validate, apply effect, then spend a turn. A wand on
   * cooldown is a no-op that keeps the turn (the no-op rule used by Scroll of
   * Light). Self-targeted wands accept (0,0).
   */
  public zapWand(index: number, dx: number, dy: number): boolean {
    if (this.gameOver || this.gameWon) return false;
    if (this.takeSleepTurn()) return false;
    const wand = this.player.inventory.wands[index];
    if (!wand) return false;
    if ((wand.cooldownRemaining ?? 0) > 0) {
      this.addLog(`The ${wand.name} is still recharging. (${wand.cooldownRemaining})`);
      return false;
    }

    const selfTarget = isSelfTargetWand(wand.wandType);
    // Clamp to a unit step so a stray pointer delta can't reach across the map.
    const ux = Math.sign(dx);
    const uy = Math.sign(dy);
    if (!selfTarget && ux === 0 && uy === 0) return false; // need a direction

    const path = selfTarget ? [] : this.traceBolt(ux, uy, BALANCE.wands.maxRange);
    this.applyWandEffect(wand, path);

    wand.cooldownRemaining = wandCooldown(wand);
    this.player.hunger = Math.max(0, this.player.hunger - wandHungerCost(wand));
    this.sound.emit({ type: 'item.zap', wandType: wand.wandType });
    this.ui.updateDropdowns(this.player);
    this.processTurn();
    return true;
  }

  /** Tiles a bolt crosses from the player in a unit direction, stopping before a
   *  wall and at maxRange. Excludes the player's own tile. */
  private traceBolt(dx: number, dy: number, maxRange: number): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];
    let x = this.player.x;
    let y = this.player.y;
    for (let i = 0; i < maxRange; i++) {
      x += dx;
      y += dy;
      if (x < 0 || x >= this.COLS || y < 0 || y >= this.ROWS) break;
      if (!isWalkable(this.map[y]?.[x])) break;
      path.push({ x, y });
    }
    return path;
  }

  /** First monster along an ordered path, if any. */
  private firstMonsterAlong(path: Array<{ x: number; y: number }>): Monster | undefined {
    for (const tile of path) {
      const m = this.monsters.find(mon => mon.x === tile.x && mon.y === tile.y);
      if (m) return m;
    }
    return undefined;
  }

  /** Every monster standing on an ordered path, nearest first (beam targets). */
  private monstersAlong(path: Array<{ x: number; y: number }>): Monster[] {
    const hits: Monster[] = [];
    for (const tile of path) {
      const m = this.monsters.find(mon => mon.x === tile.x && mon.y === tile.y);
      if (m) hits.push(m);
    }
    return hits;
  }

  /** Resolve a wand's effect given its traced path. Self-targeted wands ignore
   *  the path. Reuses existing effect code (freeze, light, invisibility, …). */
  private applyWandEffect(wand: WandItem, path: Array<{ x: number; y: number }>): void {
    const w = wand.wandType;

    // --- Self-targeted ---
    if (w === 'light') {
      const lit = this.lightCurrentRoom();
      this.addLog(lit
        ? `You zap the ${wand.name}. The room floods with light!`
        : `You zap the ${wand.name}, but the light reveals nothing new.`);
      return;
    }
    if (w === 'invisibility') {
      this.statusEffects.invisTurns = BALANCE.status.invisTurns;
      this.addLog(`You zap the ${wand.name}. You fade from sight.`);
      return;
    }
    if (w === 'nothing') {
      this.addLog(`You zap the ${wand.name}. Nothing happens.`);
      return;
    }

    // --- Beam (Lightning): hit every monster in line ---
    if (isBeamWand(w)) {
      const targets = this.monstersAlong(path);
      if (targets.length === 0) {
        this.addLog(`You zap the ${wand.name}. The bolt crackles harmlessly into the dark.`);
        return;
      }
      for (const m of targets) {
        // Each beam tile holds a distinct, live monster and none kills another,
        // so this guard is defensive: never re-damage one already removed on death.
        if (this.monsters.includes(m)) this.damageMonsterWithWand(m, this.wandDamage(wand), wand);
      }
      return;
    }

    // --- Single-target bolts: the first monster on the path ---
    const target = this.firstMonsterAlong(path);
    if (!target) {
      this.addLog(`You zap the ${wand.name}, but it strikes nothing.`);
      return;
    }

    switch (w) {
      case 'striking':
      case 'magic_missile':
      case 'fire':
        this.damageMonsterWithWand(target, this.wandDamage(wand), wand);
        return;
      case 'cold': {
        target.frozenTurns = Math.max(target.frozenTurns, BALANCE.wands.coldFreezeTurns);
        this.ui.fxFreeze(target.x, target.y);
        this.addLog(`${target.name} is frozen!`);
        this.damageMonsterWithWand(target, this.wandDamage(wand), wand);
        return;
      }
      case 'sleep':
        target.frozenTurns = Math.max(target.frozenTurns, BALANCE.wands.sleepFreezeTurns);
        this.ui.fxFreeze(target.x, target.y);
        this.addLog(`You zap the ${wand.name}. ${target.name} falls into a deep sleep.`);
        return;
      case 'drain_life': {
        const dmg = this.wandDamage(wand);
        // Rogue-authentic risk: the player pays HP up front, capped so a zap can
        // never be self-lethal. Heal is bounded by the monster's current HP.
        const selfCost = Math.max(1, Math.round(dmg * BALANCE.wands.drainLifeSelfCostRatio));
        this.player.hp = Math.max(1, this.player.hp - selfCost);
        const heal = Math.min(dmg, Math.max(0, target.hp));
        this.player.hp = Math.min(this.vigorMaxHp(), this.player.hp + heal);
        this.addLog(`You drain ${target.name}'s life. (-${selfCost} HP, +${heal} HP)`);
        this.damageMonsterWithWand(target, dmg, wand);
        return;
      }
      case 'teleport_away': {
        const moved = this.teleportMonsterSafely(target);
        this.addLog(moved
          ? `You zap the ${wand.name}. ${target.name} vanishes!`
          : `You zap the ${wand.name}, but ${target.name} stays put.`);
        return;
      }
      case 'cancellation':
        target.canceledTurns = Math.max(target.canceledTurns ?? 0, BALANCE.wands.cancellationTurns);
        this.addLog(`You zap the ${wand.name}. ${target.name}'s powers are nullified.`);
        return;
      case 'polymorph': {
        const oldName = target.name;
        const newName = this.respawnMonster(target);
        this.addLog(newName
          ? `You zap the ${wand.name}. The ${oldName} becomes a ${newName}!`
          : `You zap the ${wand.name}, but nothing changes.`);
        return;
      }
    }
  }

  /** Apply wand damage to a monster: log, FX, record, and resolve death (XP/win)
   *  via the shared handler used by melee kills. */
  private damageMonsterWithWand(monster: Monster, damage: number, wand: WandItem): void {
    monster.hp -= damage;
    recordDamageDealt(this.stats, damage);
    this.addLog(`Your ${wand.name} hits ${monster.name} for ${damage} dmg. (${Math.max(0, monster.hp)} HP left)`);
    this.sound.emit({ type: 'combat.hit', actor: 'player', target: 'monster', damage });
    this.ui.fxHit(monster.x, monster.y, damage, monster.hp <= 0);
    if (monster.hp <= 0) this.handleMonsterDeath(monster);
  }

  /** Damage for a damage-dealing wand on the current floor. Magic Missile is
   *  flat (never misses, no variance); the others get a +/- spread. Staves add
   *  a flat bonus. */
  private wandDamage(wand: WandItem): number {
    const w = BALANCE.wands;
    const floor = this.dungeonFloor;
    let base: number;
    switch (wand.wandType) {
      case 'striking':      base = w.strikingBase + floor * w.strikingFloorScale; break;
      case 'magic_missile': base = w.magicMissileBase + floor * w.damageFloorScale; break;
      case 'cold':          base = w.coldBase + floor * w.damageFloorScale; break;
      case 'fire':          base = w.fireBase + floor * w.damageFloorScale; break;
      case 'lightning':     base = w.lightningBase + floor * w.damageFloorScale; break;
      case 'drain_life':    base = w.drainLifeBase + floor * w.damageFloorScale; break;
      default:              base = 0; break;
    }
    if (wand.tier === 'staff') base += w.staffDamageBonus;
    if (wand.wandType !== 'magic_missile') {
      base *= 1 + (this.rng.next() * 2 - 1) * w.damageVariance;
    }
    return Math.max(1, Math.round(base));
  }

  /** Polymorph: turn a monster into a different floor-valid species in place
   *  (keeps its tile). Returns the new species name, or undefined if no
   *  candidate exists. Excludes bosses/heroes so it can't conjure a finale. */
  private respawnMonster(monster: Monster): string | undefined {
    const candidates = MONSTER_DATABASE.filter(
      t => t.minFloor <= this.dungeonFloor && !t.special && t.name !== monster.name
    );
    if (candidates.length === 0) return undefined;
    const tmpl = this.rng.pick(candidates);
    monster.id = tmpl.id;
    monster.name = tmpl.name;
    monster.symbol = tmpl.symbol;
    monster.color = tmpl.color;
    monster.atk = tmpl.atk;
    monster.minFloor = tmpl.minFloor;
    monster.special = tmpl.special;
    monster.hp = getScaledMonsterHP(tmpl.hp, tmpl.name);
    monster.maxHp = monster.hp;
    monster.frozenTurns = 0;
    monster.canceledTurns = 0;
    monster.swipeTurn = false;
    monster.ai = undefined;
    return tmpl.name;
  }

  /** Relocate a monster to a safe floor tile: not adjacent to the player, not on
   *  an armed trap, not on another monster. Prefers lit tiles. Returns false if
   *  none available. Mirrors teleportPlayerSafely's invariants. */
  private teleportMonsterSafely(monster: Monster): boolean {
    const candidates: Array<{ x: number; y: number; dark: boolean }> = [];
    for (let y = 0; y < this.ROWS; y++) {
      for (let x = 0; x < this.COLS; x++) {
        if (this.map[y]?.[x] !== TILE.FLOOR) continue;
        if (this.armedTrapAt(x, y)) continue;
        if (Math.max(Math.abs(this.player.x - x), Math.abs(this.player.y - y)) <= 1) continue;
        if (this.monsters.some(mon => mon !== monster && mon.x === x && mon.y === y)) continue;
        candidates.push({ x, y, dark: this.dark[y]?.[x] === true });
      }
    }
    const pool = candidates.filter(c => !c.dark);
    const options = pool.length > 0 ? pool : candidates;
    if (options.length === 0) return false;
    const dest = this.rng.pick(options);
    monster.x = dest.x;
    monster.y = dest.y;
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
    if (this.takeSleepTurn()) return false;
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
    if (this.takeSleepTurn()) return;
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
    if (this.takeSleepTurn()) return false;
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
    if (this.takeSleepTurn()) return false;
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
    if (this.takeSleepTurn()) return false;
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
    if (action === 'zap' && ref.kind === 'wand') return this.beginZap(ref);
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

    // Tick down wand recharge timers (cooldowns, not charges). Set to K on zap
    // and ticked here in that same turn (like every status timer), so the next
    // zap lands exactly K turns later — cooldown 3 ⇒ zap on turn N, next on N+3.
    for (const wand of this.player.inventory.wands) {
      if ((wand.cooldownRemaining ?? 0) > 0) wand.cooldownRemaining = wand.cooldownRemaining! - 1;
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
      this.trapEffects.sleepTurns = 0;
      const damageTaken = hpBeforeMonsters - this.player.hp;
      recordDamageTaken(this.stats, damageTaken);
      const gearDamage = damageEquippedGear(this.player, this.rng, damageTaken);
      if (gearDamage) {
        this.addLog(
          gearDamage.broken
            ? `Your ${gearDamage.item.name} breaks!`
            : `Your ${gearDamage.item.name} is worn. (${gearDamage.after}/${gearDamage.max})`
        );
      }
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
    this.ui.updateStats(this.player, this.dungeonFloor, this.statusEffects, totalDef, this.turn, this.trapEffects);
  }

  public draw() {
    this.ui.render(
      this.map,
      this.explored,
      this.visible,
      this.player,
      this.monsters,
      this.items,
      this.traps,
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
        traps: structuredClone(s.traps ?? []),
      }]),
      searchHintShown: this.searchHintShown,
      secretsFoundThisRun: this.secretsFoundThisRun,
      stats: structuredClone(this.stats),
      traps: structuredClone(this.traps),
      trapEffects: { ...this.trapEffects },
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
      normalizeAllGearHealth(this.player);
      // Backfill the scrolls bucket for saves written before scrolls existed.
      if (!Array.isArray(this.player.inventory.scrolls)) this.player.inventory.scrolls = [];
      // Backfill the wands bucket for saves written before wands existed.
      if (!Array.isArray(this.player.inventory.wands)) this.player.inventory.wands = [];
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
      this.traps = structuredClone(save.traps ?? []);
      this.floorStates = new Map(save.floorStates.map(([f, s]) => [f, {
        map: s.map.map(r => [...r]),
        explored: s.explored.map(r => [...r]),
        dark: (s.dark ?? this.blankBoolGrid()).map(r => [...r]),
        monsters: structuredClone(s.monsters),
        items: structuredClone(s.items),
        traps: structuredClone(s.traps ?? []),
      }]));
      this.searchHintShown = save.searchHintShown;
      this.secretsFoundThisRun = save.secretsFoundThisRun;
      this.stats = structuredClone(save.stats);
      this.trapEffects = save.trapEffects ? { ...save.trapEffects } : { bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0 };
      this.trapdoorGeneratedThisRun = this.hasAnyTrapdoorInRun();
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

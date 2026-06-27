import type { GameUI } from '../ui';
import { ui as chromeUi } from '../ui/store.svelte';
import type { Item, Monster, Player } from '../types';
import {
  copyPresentationMode,
  DEFAULT_PRESENTATION_MODE,
  type DiscoverySnapshot,
  type GamePresenter,
  type HudSnapshot,
  type InventorySnapshot,
  type PresentationMode,
} from './presenter';
import { cloneValue, type MapSnapshot, type MonsterView } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';

const LEGACY_TILE_SIZE = 20;

export class GameUiPresenterAdapter implements GamePresenter {
  private mode: PresentationMode = copyPresentationMode(DEFAULT_PRESENTATION_MODE);
  private readonly legacyMonsters = new Map<string, Monster>();
  private combatFocusMonsterKey: string | null = null;

  constructor(private readonly ui: GameUI) {}

  public setMode(mode: PresentationMode): void {
    this.mode = copyPresentationMode(mode);
    chromeUi.presentationMode = copyPresentationMode(this.mode);
  }

  public getMode(): PresentationMode {
    return copyPresentationMode(this.mode);
  }

  public publishStats(snapshot: HudSnapshot): void {
    this.updateStats(
      snapshot.player,
      snapshot.dungeonFloor,
      snapshot.statusEffects,
      snapshot.totalDef,
      snapshot.turn,
      snapshot.trapEffects,
      snapshot.hasAmulet,
    );
  }

  public publishInventory(snapshot: InventorySnapshot): void {
    this.updateDropdowns(snapshot.player);
  }

  public publishMap(snapshot: MapSnapshot): void {
    const map = snapshot.tiles.map(row => row.map(tile => tile.kind));
    const explored = snapshot.tiles.map(row => row.map(tile => tile.explored));
    const visible = snapshot.tiles.map(row => row.map(tile => tile.visible));
    const player = { x: snapshot.player.x, y: snapshot.player.y } as Player;
    const monsters = snapshot.monsters.map(monster => this.legacyMonsterFromView(monster));
    const liveKeys = new Set(snapshot.monsters.map(monster => monster.key));

    for (const key of this.legacyMonsters.keys()) {
      if (!liveKeys.has(key)) this.legacyMonsters.delete(key);
    }

    this.ui.combatFocusMonster = this.combatFocusMonsterKey
      ? this.legacyMonsters.get(this.combatFocusMonsterKey) ?? null
      : null;

    this.ui.render(
      map,
      explored,
      visible,
      player,
      monsters,
      snapshot.items.map(item => {
        const legacy = {
          x: item.x,
          y: item.y,
          symbol: item.glyph,
          color: item.color,
          type: item.type,
        } as Item;
        if (item.amount !== undefined) (legacy as Extract<Item, { type: 'gold' }>).amount = item.amount;
        if (item.data !== undefined) (legacy as Item & { data: unknown }).data = cloneValue(item.data);
        return legacy;
      }),
      snapshot.traps.map(trap => ({
        id: trap.id,
        kind: trap.kind,
        x: trap.x,
        y: trap.y,
        revealed: trap.revealed,
        armed: trap.armed,
      })),
      LEGACY_TILE_SIZE,
      snapshot.cols,
      snapshot.rows,
      snapshot.floor,
      snapshot.gameOver,
      snapshot.gameWon,
      snapshot.monsterDetectionActive,
    );
  }

  public publishLogs(logs: readonly string[]): void {
    this.renderLogs(logs);
  }

  public publishDiscovery(snapshot: DiscoverySnapshot): void {
    this.syncDiscovery(snapshot.state);
  }

  public publishEvent(event: PresentationEvent): void {
    switch (event.type) {
      case 'combat.strike':
        this.fxStrike(event.fromX, event.fromY, event.toX, event.toY);
        break;
      case 'combat.hit':
        this.fxHit(event.x, event.y, event.damage, event.crit);
        break;
      case 'combat.freeze':
        this.fxFreeze(event.x, event.y);
        break;
      case 'combat.death':
        this.fxDeath(event.x, event.y, event.glyph, event.color);
        break;
      case 'combat.playerHit':
        this.fxPlayerHit();
        break;
      case 'combat.dive':
        this.fxDive(event.fromX, event.fromY, event.toX, event.toY, event.color);
        break;
      case 'combat.whiff':
        this.fxWhiff(event.x, event.y);
        break;
      case 'combat.float':
        this.fxFloat(event.x, event.y, event.text, event.color);
        break;
      case 'map.rumble':
        this.mapRumble(event.strength);
        break;
      case 'map.floorTransition':
        this.beginFloorTransition(event.dir);
        break;
      case 'presentation.modeChanged':
        this.setMode(event.mode);
        break;
      case 'player.run':
        this.fxPlayerRun(event.path, event.ghosts);
        break;
      case 'aiming.changed':
        this.setAiming(event.wandName ? { wandName: event.wandName } : null);
        break;
      case 'combat.monsterDodge':
        this.fxMonsterDodge(event.monsterKey, event.fromX, event.fromY);
        break;
      case 'combat.focusMonster':
        this.focusCombatMonster(event.monsterKey);
        break;
      case 'combat.clearFocusMonster':
        this.clearCombatFocusMonster(event.monsterKey);
        break;
    }
  }

  public updateStats(...args: Parameters<GameUI['updateStats']>): void {
    this.ui.updateStats(...args);
  }

  public updateDropdowns(...args: Parameters<GameUI['updateDropdowns']>): void {
    this.ui.updateDropdowns(...args);
  }

  public resetLog(): void {
    this.ui.resetLog();
  }

  public renderLogs(logs: readonly string[]): void {
    this.ui.renderLogs([...logs]);
  }

  public syncDiscovery(...args: Parameters<GameUI['syncDiscovery']>): void {
    this.ui.syncDiscovery(...args);
  }

  public fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[] = []): void {
    this.ui.fxPlayerRun([...path], [...ghosts]);
  }

  public fxStrike(...args: Parameters<GameUI['fxStrike']>): void {
    this.ui.fxStrike(...args);
  }

  public fxHit(...args: Parameters<GameUI['fxHit']>): void {
    this.ui.fxHit(...args);
  }

  public fxFreeze(...args: Parameters<GameUI['fxFreeze']>): void {
    this.ui.fxFreeze(...args);
  }

  public fxDeath(...args: Parameters<GameUI['fxDeath']>): void {
    this.ui.fxDeath(...args);
  }

  public fxPlayerHit(): void {
    this.ui.fxPlayerHit();
  }

  public fxDive(...args: Parameters<GameUI['fxDive']>): void {
    this.ui.fxDive(...args);
  }

  public fxWhiff(...args: Parameters<GameUI['fxWhiff']>): void {
    this.ui.fxWhiff(...args);
  }

  public fxFloat(...args: Parameters<GameUI['fxFloat']>): void {
    this.ui.fxFloat(...args);
  }

  public fxMonsterDodge(monsterKey: string, fromX: number, fromY: number): void {
    const monster = this.legacyMonsters.get(monsterKey);
    if (monster) this.ui.fxMonsterDodge(monster, fromX, fromY);
  }

  public mapRumble(...args: Parameters<GameUI['mapRumble']>): void {
    this.ui.mapRumble(...args);
  }

  public beginFloorTransition(...args: Parameters<GameUI['beginFloorTransition']>): void {
    this.ui.beginFloorTransition(...args);
  }

  public setAiming(...args: Parameters<GameUI['setAiming']>): void {
    this.ui.setAiming(...args);
  }

  public focusCombatMonster(monsterKey: string): void {
    this.combatFocusMonsterKey = monsterKey;
    this.ui.combatFocusMonster = this.legacyMonsters.get(monsterKey) ?? null;
  }

  public clearCombatFocusMonster(monsterKey: string): void {
    if (this.combatFocusMonsterKey === monsterKey) {
      this.combatFocusMonsterKey = null;
      this.ui.combatFocusMonster = null;
    }
  }

  private legacyMonsterFromView(view: MonsterView): Monster {
    const monster = this.legacyMonsters.get(view.key) ?? ({} as Monster);

    monster.x = view.x;
    monster.y = view.y;
    monster.symbol = view.glyph;
    monster.name = view.name;
    monster.hp = view.hp;
    monster.atk = view.atk;
    monster.color = view.color;
    monster.minFloor = view.minFloor;
    monster.frozenTurns = view.frozenTurns;

    setOptional(monster, 'id', view.id);
    setOptional(monster, 'maxHp', view.maxHp);
    setOptional(monster, 'special', view.special);
    setOptional(monster, 'ai', cloneValue(view.ai));

    this.legacyMonsters.set(view.key, monster);
    return monster;
  }
}

function setOptional<K extends keyof Monster>(monster: Monster, key: K, value: Monster[K] | undefined): void {
  if (value === undefined) {
    delete monster[key];
  } else {
    monster[key] = value;
  }
}

import type { GameUI } from '../ui';
import type { Monster } from '../types';
import {
  DEFAULT_PRESENTATION_MODE,
  type DiscoverySnapshot,
  type GamePresenter,
  type HudSnapshot,
  type InventorySnapshot,
  type PresentationMode,
} from './presenter';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';

export class GameUiPresenterAdapter implements GamePresenter {
  private mode: PresentationMode = DEFAULT_PRESENTATION_MODE;

  constructor(private readonly ui: GameUI) {}

  public setMode(mode: PresentationMode): void {
    this.mode = mode;
  }

  public getMode(): PresentationMode {
    return this.mode;
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

  public publishMap(_snapshot: MapSnapshot): void {
    // Phase 2 will introduce the mapper that feeds this path. Current gameplay
    // still calls render(...) through the compatibility surface below.
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

  public render(...args: Parameters<GameUI['render']>): void {
    this.ui.render(...args);
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

  public fxMonsterDodge(...args: Parameters<GameUI['fxMonsterDodge']>): void {
    this.ui.fxMonsterDodge(...args);
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

  public focusCombatMonster(monster: Monster): void {
    this.ui.combatFocusMonster = monster;
  }

  public clearCombatFocusMonster(monster: Monster): void {
    if (this.ui.combatFocusMonster === monster) this.ui.combatFocusMonster = null;
  }
}

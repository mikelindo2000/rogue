import type { GameUI } from '../ui';
import { ui as chromeUi } from '../ui/store.svelte';
import {
  copyPresentationMode,
  DEFAULT_PRESENTATION_MODE,
  type DiscoverySnapshot,
  type GamePresenter,
  type HudSnapshot,
  type InventorySnapshot,
  type PresentationMode,
} from './presenter';
import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentationEvents';

export type GameUiPresenterTarget = Pick<
  GameUI,
  | 'setMapSnapshot'
  | 'publishMapEvent'
  | 'updateStats'
  | 'updateDropdowns'
  | 'resetLog'
  | 'renderLogs'
  | 'syncDiscovery'
  | 'fxPlayerRun'
  | 'fxStrike'
  | 'fxHit'
  | 'fxFreeze'
  | 'fxDeath'
  | 'fxPlayerHit'
  | 'fxDive'
  | 'fxWhiff'
  | 'fxFloat'
  | 'fxMonsterDodge'
  | 'mapRumble'
  | 'fxLevelUp'
  | 'beginFloorTransition'
  | 'setAiming'
  | 'showItemPickup'
  | 'clearItemPickup'
  | 'publishEndRunState'
  | 'resetEndRunState'
>;

export class GameUiPresenterAdapter implements GamePresenter {
  private mode: PresentationMode = copyPresentationMode(DEFAULT_PRESENTATION_MODE);
  private combatFocusMonsterKey: string | null = null;

  constructor(private readonly ui: GameUiPresenterTarget) {}

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
    this.ui.setMapSnapshot(snapshot, this.combatFocusMonsterKey);
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
      case 'player.levelUp':
        this.fxLevelUp();
        break;
      case 'map.floorTransition':
        this.beginFloorTransition(event.dir);
        break;
      case 'presentation.modeChanged':
        this.setMode(event.mode);
        this.ui.publishMapEvent(event);
        break;
      case 'player.run':
        this.fxPlayerRun(event.path, event.ghosts);
        break;
      case 'aiming.changed':
        this.setAiming(event.wandName ? { wandName: event.wandName } : null);
        this.ui.publishMapEvent(event);
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
    this.ui.fxMonsterDodge(monsterKey, fromX, fromY);
  }

  public mapRumble(...args: Parameters<GameUI['mapRumble']>): void {
    this.ui.mapRumble(...args);
  }

  public fxLevelUp(): void {
    this.ui.fxLevelUp();
  }

  public beginFloorTransition(...args: Parameters<GameUI['beginFloorTransition']>): void {
    this.ui.beginFloorTransition(...args);
  }

  public setAiming(...args: Parameters<GameUI['setAiming']>): void {
    this.ui.setAiming(...args);
  }

  public showItemPickup(...args: Parameters<GameUI['showItemPickup']>): void {
    this.ui.showItemPickup(...args);
  }

  public clearItemPickup(): void {
    this.ui.clearItemPickup();
  }

  public publishEndRunState(...args: Parameters<GameUI['publishEndRunState']>): void {
    this.ui.publishEndRunState(...args);
  }

  public resetEndRunState(): void {
    this.ui.resetEndRunState();
  }

  public focusCombatMonster(monsterKey: string): void {
    this.combatFocusMonsterKey = monsterKey;
    this.ui.publishMapEvent({ type: 'combat.focusMonster', monsterKey });
  }

  public clearCombatFocusMonster(monsterKey: string): void {
    if (this.combatFocusMonsterKey === monsterKey) {
      this.combatFocusMonsterKey = null;
    }
    this.ui.publishMapEvent({ type: 'combat.clearFocusMonster', monsterKey });
  }
}

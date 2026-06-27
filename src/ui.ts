import { ui } from './ui/store.svelte';
import type { FloorDir } from './ui/floorTransition';
import type { DeathTransitionRequest } from './ui/deathTransition';
import { MapViewController } from './presentation/mapViewController';
import { ChromePresenter } from './presentation/chromePresenter';
import type { MapSnapshot } from './presentation/mapSnapshot';
import type { PresentationEvent, RunGhostItem, RunPathStep } from './presentation/presentationEvents';
import {
  DEFAULT_PLAYER_SPRITE,
  type PlayerSprite,
} from './render/avatar';

// Player-avatar rendering now lives in src/render/avatar.ts so the cinematic
// stage can draw the same hero. Re-exported here to keep the public surface.
export {
  PLAYER_SPRITE_OPTIONS,
  DEFAULT_PLAYER_SPRITE,
  type PlayerSprite,
  type PlayerSpriteOption,
} from './render/avatar';

export class GameUI {
  private readonly canvas: HTMLCanvasElement;
  private readonly mapView: MapViewController;
  private readonly chrome: ChromePresenter;
  /** Which avatar the player draws as. Settable in code today; a character-
   *  select UI will drive it later via setPlayerSprite(). */
  private playerSprite: PlayerSprite = DEFAULT_PLAYER_SPRITE;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${canvasId}`);
    this.canvas = canvas;
    this.mapView = new MapViewController({
      host: canvas,
      getFloorTransitionId: () => ui.floorTransition,
    });
    this.chrome = new ChromePresenter({
      measureTileSize: (cols, rows) => this.computeTileSize(cols, rows),
      setDisorientation: intensity => this.mapView.setDisorientation(intensity),
    });
  }

  public setMapSnapshot(snapshot: MapSnapshot, combatFocusMonsterKey: string | null = null): void {
    this.mapView.setSnapshot(snapshot);
    this.chrome.publishMap(snapshot, combatFocusMonsterKey);
  }

  public publishMapEvent(event: PresentationEvent): void {
    this.mapView.dispatch(event);
  }

  /** Shake the map plane on a heavy blow (cosmetic; the engine decides what's heavy). */
  public mapRumble(strength = 0.6): void {
    this.publishMapEvent({ type: 'map.rumble', strength });
  }

  /** Start a floor-change transition before the live canvas repaints to the new floor. */
  public beginFloorTransition(dir: FloorDir): void {
    this.publishMapEvent({ type: 'map.floorTransition', dir });
  }

  /** Start the death presentation transition and resolve when the screen may open. */
  public beginDeathTransition(request: DeathTransitionRequest): Promise<void> {
    return this.mapView.beginDeathTransition(request);
  }

  /** Clear any persisted death-transition inline styles when a new live run begins. */
  public resetDeathTransition(): void {
    this.mapView.resetDeathTransition();
  }

  /** Dev/proof helper: play a specific transition id against the live map plane. */
  public previewDeathTransition(id: string): Promise<void> {
    return this.mapView.previewDeathTransition(id);
  }

  public fxStrike(fromX: number, fromY: number, toX: number, toY: number): void {
    this.publishMapEvent({ type: 'combat.strike', fromX, fromY, toX, toY });
  }

  public fxHit(x: number, y: number, damage: number, crit = false): void {
    this.publishMapEvent({ type: 'combat.hit', x, y, damage, crit });
  }

  public fxFreeze(x: number, y: number): void {
    this.publishMapEvent({ type: 'combat.freeze', x, y });
  }

  public fxDeath(x: number, y: number, glyph: string, color: string): void {
    this.publishMapEvent({ type: 'combat.death', x, y, glyph, color });
  }

  public fxPlayerHit(): void {
    this.publishMapEvent({ type: 'combat.playerHit' });
  }

  public fxDive(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    this.publishMapEvent({ type: 'combat.dive', fromX, fromY, toX, toY, color });
  }

  public fxWhiff(x: number, y: number): void {
    this.publishMapEvent({ type: 'combat.whiff', x, y });
  }

  public fxFloat(x: number, y: number, text: string, color = '#9fb4c8'): void {
    this.publishMapEvent({ type: 'combat.float', x, y, text, color });
  }

  public fxMonsterDodge(monsterKey: string, fromX: number, fromY: number): void {
    this.publishMapEvent({ type: 'combat.monsterDodge', monsterKey, fromX, fromY });
  }

  public fxPlayerRun(path: readonly RunPathStep[], ghosts: readonly RunGhostItem[] = []): void {
    this.mapView.dispatchPlayerRun(path, ghosts);
  }

  /** Choose the player's avatar style and repaint. */
  public setPlayerSprite(sprite: PlayerSprite): void {
    this.playerSprite = sprite;
    ui.playerSprite = sprite;
    this.mapView.setPlayerSprite(sprite);
  }

  public getPlayerSprite(): PlayerSprite {
    return this.mapView.getPlayerSprite() ?? this.playerSprite;
  }

  public updateStats(...args: Parameters<ChromePresenter['publishStats']>): void {
    this.chrome.publishStats(...args);
  }

  public updateDropdowns(...args: Parameters<ChromePresenter['publishInventory']>): void {
    this.chrome.publishInventory(...args);
  }

  public syncDiscovery(...args: Parameters<ChromePresenter['syncDiscovery']>): void {
    this.chrome.syncDiscovery(...args);
  }

  public resetLog(): void {
    this.chrome.resetLog();
  }

  public renderLogs(...args: Parameters<ChromePresenter['renderLogs']>): void {
    this.chrome.renderLogs(...args);
  }

  public setAiming(...args: Parameters<ChromePresenter['setAiming']>): void {
    this.chrome.setAiming(...args);
  }

  public publishEndRunState(...args: Parameters<ChromePresenter['publishEndRunState']>): void {
    this.chrome.publishEndRunState(...args);
  }

  public resetEndRunState(): void {
    this.chrome.resetEndRunState();
  }

  private computeTileSize(cols: number, rows: number): number {
    const PAD = 16;
    const MIN_TILE = 16;
    const MAX_TILE = 40;
    const stage = this.canvas.closest('.stage') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    const w = rect?.width ?? 0;
    const h = rect?.height ?? 0;
    if (w <= 0 || h <= 0 || cols <= 0 || rows <= 0) return 20;
    const availW = Math.max(1, w - PAD * 2);
    const availH = Math.max(1, h - PAD * 2);
    const fit = Math.floor(Math.min(availW / cols, availH / rows));
    return Math.max(MIN_TILE, Math.min(MAX_TILE, fit));
  }
}
